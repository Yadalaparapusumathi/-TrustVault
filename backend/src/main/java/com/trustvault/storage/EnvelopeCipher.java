package com.trustvault.storage;

import com.trustvault.config.AppProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;

/**
 * Envelope encryption for file contents. Each version gets its own random 256-bit data key; content is sealed with
 * AES-256-GCM, and the data key is sealed with the master key (which lives only in the process environment, never
 * in the database). Both seals bind the version id and document id as associated data, so ciphertext copied onto
 * another row, or another document, fails authentication instead of decrypting.
 *
 * <p>Layout of both blobs: [1 byte format version][12 byte nonce][ciphertext + 16 byte tag].
 */
@Component
public class EnvelopeCipher {

    private static final byte FORMAT_V1 = 1;
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey masterKey;
    private final SecureRandom random = new SecureRandom();

    public EnvelopeCipher(AppProperties properties) {
        byte[] key = Base64.getDecoder().decode(properties.crypto().masterKey());
        if (key.length != 32) {
            throw new IllegalStateException("TV_MASTER_KEY must decode to exactly 32 bytes");
        }
        this.masterKey = new SecretKeySpec(key, "AES");
    }

    public record Sealed(byte[] wrappedKey, byte[] ciphertext) {
    }

    public Sealed seal(byte[] plaintext, UUID documentId, UUID versionId) {
        byte[] dataKey = new byte[32];
        random.nextBytes(dataKey);
        byte[] aad = aad(documentId, versionId);
        byte[] ciphertext = gcm(Cipher.ENCRYPT_MODE, new SecretKeySpec(dataKey, "AES"), plaintext, aad);
        byte[] wrapped = gcm(Cipher.ENCRYPT_MODE, masterKey, dataKey, aad);
        java.util.Arrays.fill(dataKey, (byte) 0);
        return new Sealed(wrapped, ciphertext);
    }

    public byte[] open(Sealed sealed, UUID documentId, UUID versionId) {
        byte[] aad = aad(documentId, versionId);
        byte[] dataKey = gcm(Cipher.DECRYPT_MODE, masterKey, sealed.wrappedKey(), aad);
        try {
            return gcm(Cipher.DECRYPT_MODE, new SecretKeySpec(dataKey, "AES"), sealed.ciphertext(), aad);
        } finally {
            java.util.Arrays.fill(dataKey, (byte) 0);
        }
    }

    private byte[] gcm(int mode, SecretKey key, byte[] input, byte[] aad) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            if (mode == Cipher.ENCRYPT_MODE) {
                byte[] nonce = new byte[NONCE_BYTES];
                random.nextBytes(nonce);
                cipher.init(mode, key, new GCMParameterSpec(TAG_BITS, nonce));
                cipher.updateAAD(aad);
                byte[] body = cipher.doFinal(input);
                return ByteBuffer.allocate(1 + NONCE_BYTES + body.length).put(FORMAT_V1).put(nonce).put(body).array();
            }
            if (input.length < 1 + NONCE_BYTES || input[0] != FORMAT_V1) {
                throw new IllegalStateException("Unknown ciphertext format");
            }
            cipher.init(mode, key, new GCMParameterSpec(TAG_BITS, input, 1, NONCE_BYTES));
            cipher.updateAAD(aad);
            return cipher.doFinal(input, 1 + NONCE_BYTES, input.length - 1 - NONCE_BYTES);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Stored file failed integrity check", e);
        }
    }

    private static byte[] aad(UUID documentId, UUID versionId) {
        return ByteBuffer.allocate(32)
                .putLong(documentId.getMostSignificantBits()).putLong(documentId.getLeastSignificantBits())
                .putLong(versionId.getMostSignificantBits()).putLong(versionId.getLeastSignificantBits())
                .array();
    }
}
