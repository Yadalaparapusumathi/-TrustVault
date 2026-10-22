package com.trustvault.storage;

import com.trustvault.common.ApiException;
import com.trustvault.common.Hashing;
import com.trustvault.config.AppProperties;
import org.apache.tika.Tika;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Decides what may be stored. The extension the user chose and the type sniffed from the bytes must agree, and both
 * must be on the allow-list; the client-supplied Content-Type is ignored. We never render uploads, but we still keep
 * active content (HTML, SVG, scripts, macros, PDF JavaScript) out so that a downloaded file cannot turn on the next
 * person who opens it.
 */
@Component
public class FileValidator {

    private static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final String PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    /** extension → canonical content type we will serve. */
    private static final Map<String, String> ALLOWED = Map.of(
            "pdf", "application/pdf",
            "docx", DOCX,
            "xlsx", XLSX,
            "pptx", PPTX,
            "txt", "text/plain",
            "csv", "text/csv",
            "png", "image/png",
            "jpg", "image/jpeg",
            "jpeg", "image/jpeg");

    private static final Map<String, String> OOXML_MAIN_PART = Map.of(
            "docx", "word/document.xml", "xlsx", "xl/workbook.xml", "pptx", "ppt/presentation.xml");
    private static final Set<String> ZIP_TYPES = Set.of("application/zip", "application/x-tika-ooxml", DOCX, XLSX, PPTX);
    private static final Pattern PDF_NAME_ESCAPE = Pattern.compile("#([0-9A-Fa-f]{2})");
    private static final Pattern PDF_ACTIVE = Pattern.compile("/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|AA|SubmitForm|ImportData|GoToR)\\b");
    private static final Pattern TEXT_ACTIVE = Pattern.compile("<\\s*(script|html|svg|iframe|object|embed)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final long MAX_IMAGE_PIXELS = 50_000_000L;
    private static final int MAX_ZIP_ENTRIES = 5_000;
    private static final int MAX_FILENAME = 200;

    private final Tika tika = new Tika();
    private final long maxBytes;

    public FileValidator(AppProperties properties) {
        this.maxBytes = properties.upload().maxBytes();
    }

    public ValidatedFile validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("The file is empty");
        }
        if (file.getSize() > maxBytes) {
            throw ApiException.payloadTooLarge("The file exceeds the " + (maxBytes / (1024 * 1024)) + " MB limit");
        }
        String filename = sanitizeFilename(file.getOriginalFilename());
        String extension = extension(filename);
        String contentType = ALLOWED.get(extension);
        if (contentType == null) {
            throw ApiException.unsupportedMediaType("Files of type '." + extension + "' are not accepted. Allowed: "
                    + String.join(", ", ALLOWED.keySet().stream().sorted().toList()));
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("The upload could not be read");
        }
        if (bytes.length == 0) {
            throw ApiException.badRequest("The file is empty");
        }
        String detected = tika.detect(bytes);
        switch (extension) {
            case "pdf" -> checkPdf(detected, bytes);
            case "docx", "xlsx", "pptx" -> checkOoxml(detected, bytes, extension);
            case "txt", "csv" -> checkText(detected, bytes);
            case "png", "jpg", "jpeg" -> checkImage(detected, bytes, contentType);
            default -> throw new IllegalStateException("Unhandled extension " + extension);
        }
        return new ValidatedFile(bytes, filename, contentType, Hashing.sha256Hex(bytes));
    }

    static String sanitizeFilename(String original) {
        String name = original == null ? "" : original;
        name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        name = Normalizer.normalize(name, Normalizer.Form.NFC)
                .replaceAll("[\\p{Cntrl}\\p{Cf}]", "")
                .replaceAll("[<>:\"|?*]", "_")
                .replaceAll("\\s+", " ")
                .trim();
        while (name.startsWith(".")) {
            name = name.substring(1);
        }
        if (name.isBlank()) {
            name = "document";
        }
        if (name.length() > MAX_FILENAME) {
            String ext = extension(name);
            int keep = MAX_FILENAME - ext.length() - 1;
            name = ext.isEmpty() || keep < 1 ? name.substring(0, MAX_FILENAME) : name.substring(0, keep) + "." + ext;
        }
        return name;
    }

    static String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 || dot == filename.length() - 1 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private void checkPdf(String detected, byte[] bytes) {
        if (!"application/pdf".equals(detected)) {
            throw mismatch("pdf", detected);
        }
        String text = new String(bytes, StandardCharsets.ISO_8859_1);
        Matcher escapes = PDF_NAME_ESCAPE.matcher(text);
        StringBuilder decoded = new StringBuilder(text.length());
        while (escapes.find()) {
            escapes.appendReplacement(decoded,
                    Matcher.quoteReplacement(String.valueOf((char) Integer.parseInt(escapes.group(1), 16))));
        }
        escapes.appendTail(decoded);
        Matcher active = PDF_ACTIVE.matcher(decoded);
        if (active.find()) {
            throw ApiException.unsupportedMediaType(
                    "PDFs with active content are not accepted (found /" + active.group(1) + ")");
        }
    }

    private void checkOoxml(String detected, byte[] bytes, String extension) {
        if (!ZIP_TYPES.contains(detected)) {
            throw mismatch(extension, detected);
        }
        Path temp = null;
        try {
            // ZipFile reads the central directory only; nothing is decompressed, so zip bombs cost nothing here.
            temp = Files.createTempFile("tv-upload-", ".zip");
            Files.write(temp, bytes);
            try (ZipFile zip = new ZipFile(temp.toFile())) {
                if (zip.size() > MAX_ZIP_ENTRIES) {
                    throw ApiException.unsupportedMediaType("The document has too many parts");
                }
                boolean contentTypes = false;
                boolean mainPart = false;
                Iterator<? extends ZipEntry> entries = zip.entries().asIterator();
                while (entries.hasNext()) {
                    String name = entries.next().getName();
                    String lower = name.toLowerCase(Locale.ROOT);
                    if (lower.endsWith("vbaproject.bin") || lower.contains("activex")) {
                        throw ApiException.unsupportedMediaType("Documents containing macros or ActiveX are not accepted");
                    }
                    contentTypes |= name.equals("[Content_Types].xml");
                    mainPart |= name.equals(OOXML_MAIN_PART.get(extension));
                }
                if (!contentTypes || !mainPart) {
                    throw mismatch(extension, "a different kind of archive");
                }
            }
        } catch (IOException e) {
            throw ApiException.unsupportedMediaType("The ." + extension + " file is corrupt");
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // temp dir is cleaned by the OS; nothing sensitive beyond what is already stored encrypted
                }
            }
        }
    }

    private void checkText(String detected, byte[] bytes) {
        if (!"text/plain".equals(detected)) {
            throw mismatch("text", detected);
        }
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            throw ApiException.unsupportedMediaType("Text files must be UTF-8");
        }
        if (text.indexOf('\0') >= 0) {
            throw ApiException.unsupportedMediaType("Text files must not contain binary data");
        }
        if (TEXT_ACTIVE.matcher(text).find()) {
            throw ApiException.unsupportedMediaType("Text files containing HTML or script markup are not accepted");
        }
    }

    private void checkImage(String detected, byte[] bytes, String expected) {
        if (!expected.equals(detected)) {
            throw mismatch("image", detected);
        }
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = in == null ? null : ImageIO.getImageReaders(in);
            if (readers == null || !readers.hasNext()) {
                throw ApiException.unsupportedMediaType("The image could not be read");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels <= 0 || pixels > MAX_IMAGE_PIXELS) {
                    throw ApiException.unsupportedMediaType("The image dimensions are not accepted");
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException e) {
            throw ApiException.unsupportedMediaType("The image is corrupt");
        }
    }

    private static ApiException mismatch(String declared, String detected) {
        return ApiException.unsupportedMediaType(
                "The file content does not match its ." + declared + " extension (looks like " + detected + ")");
    }
}
