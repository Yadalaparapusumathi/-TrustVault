package com.trustvault.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.trustvault.config.AppProperties;
import com.trustvault.security.RequestMetadata;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Writes the audit trail. Each row carries hash = HMAC-SHA256(key, prev_hash || canonical(row)), so altering,
 * removing or reordering any row breaks every hash after it, and nobody without the key (which is not in the
 * database) can recompute a consistent chain. Writers are serialised with a transaction-scoped advisory lock so the
 * chain is strictly linear.
 *
 * <p>{@link #record} requires and joins the caller's transaction: the business change and its audit row commit or
 * roll back together. {@link #recordIndependently} commits on its own, for refusals and failures whose surrounding
 * transaction is about to roll back.
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);
    static final String GENESIS = "0".repeat(64);
    private static final long CHAIN_LOCK_KEY = 0x7472757374L; // "trust"

    private final JdbcTemplate jdbc;
    private final ObjectMapper canonicalMapper;
    private final SecretKeySpec hmacKey;
    private final Clock clock;
    private final TransactionTemplate requiresNew;

    public AuditService(JdbcTemplate jdbc, ObjectMapper objectMapper, AppProperties properties, Clock clock,
                        PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.requiresNew = new TransactionTemplate(txManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
        this.canonicalMapper = objectMapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
        byte[] key = Base64.getDecoder().decode(properties.crypto().auditHmacKey());
        if (key.length < 32) {
            throw new IllegalStateException("TV_AUDIT_HMAC_KEY must decode to at least 32 bytes");
        }
        this.hmacKey = new SecretKeySpec(key, "HmacSHA256");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public long record(AuditEntry entry) {
        return append(entry);
    }

    /**
     * Persists the entry regardless of what happens to the caller's transaction. If a transaction is active, the
     * write is deferred until it has completed (committed or rolled back): writing in a nested REQUIRES_NEW
     * transaction while the outer one may already hold the chain lock would deadlock on ourselves.
     */
    public void recordIndependently(AuditEntry entry) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    writeInNewTransaction(entry);
                }
            });
        } else {
            writeInNewTransaction(entry);
        }
    }

    private void writeInNewTransaction(AuditEntry entry) {
        try {
            requiresNew.executeWithoutResult(tx -> append(entry));
        } catch (RuntimeException e) {
            log.error("AUDIT_WRITE_FAILED action={} actor={}", entry.action, entry.actorUsername, e);
            throw e;
        }
    }

    private long append(AuditEntry entry) {
        jdbc.query("SELECT pg_advisory_xact_lock(?)", rs -> null, CHAIN_LOCK_KEY);
        List<Map<String, Object>> head = jdbc.queryForList(
                "SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1");
        long seq = head.isEmpty() ? 1 : ((Number) head.getFirst().get("seq")).longValue() + 1;
        String prevHash = head.isEmpty() ? GENESIS : (String) head.getFirst().get("hash");

        RequestMetadata meta = RequestMetadata.current();
        StoredEvent event = new StoredEvent(seq, clock.instant().truncatedTo(ChronoUnit.MICROS),
                entry.actorId == null ? null : entry.actorId.toString(), entry.actorUsername, entry.actorRole,
                entry.action.name(), entry.outcome.name(), entry.targetType, entry.targetId,
                entry.documentId == null ? null : entry.documentId.toString(), serialize(entry.details),
                meta.ip(), meta.userAgent(), meta.requestId(), prevHash, null);
        String hash = computeHash(event);

        jdbc.update("""
                        INSERT INTO audit_events (seq, occurred_at, actor_id, actor_username, actor_role, action, outcome,
                            target_type, target_id, document_id, details, ip, user_agent, request_id, prev_hash, hash)
                        VALUES (?, ?, ?::uuid, ?, ?, ?, ?, ?, ?, ?::uuid, ?, ?, ?, ?, ?, ?)
                        """,
                event.seq(), Timestamp.from(event.occurredAt()), event.actorId(), event.actorUsername(),
                event.actorRole(), event.action(), event.outcome(), event.targetType(), event.targetId(),
                event.documentId(), event.details(), event.ip(), event.userAgent(), event.requestId(), prevHash, hash);
        return seq;
    }

    String computeHash(StoredEvent e) {
        ArrayNode canonical = canonicalMapper.createArrayNode()
                .add(e.seq()).add(e.occurredAt().toString()).add(e.actorId()).add(e.actorUsername())
                .add(e.actorRole()).add(e.action()).add(e.outcome()).add(e.targetType()).add(e.targetId())
                .add(e.documentId()).add(e.details()).add(e.ip()).add(e.userAgent()).add(e.requestId());
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            mac.update(e.prevHash().getBytes(StandardCharsets.US_ASCII));
            mac.update((byte) '\n');
            mac.update(canonicalMapper.writeValueAsBytes(canonical));
            return HexFormat.of().formatHex(mac.doFinal());
        } catch (GeneralSecurityException | JsonProcessingException ex) {
            throw new IllegalStateException("Cannot compute audit hash", ex);
        }
    }

    private String serialize(Map<String, Object> details) {
        try {
            return canonicalMapper.writeValueAsString(details);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise audit details", e);
        }
    }

    /** One row exactly as stored; also the unit the integrity check recomputes. */
    record StoredEvent(long seq, Instant occurredAt, String actorId, String actorUsername, String actorRole,
                       String action, String outcome, String targetType, String targetId, String documentId,
                       String details, String ip, String userAgent, String requestId, String prevHash, String hash) {
    }
}
