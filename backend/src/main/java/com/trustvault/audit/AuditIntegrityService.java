package com.trustvault.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Recomputes the HMAC chain from the first row. Detects edits, deletions in the middle (sequence gap or broken
 * link) and reordering. A deletion of the newest rows is caught by comparing against the anchors this service
 * periodically writes to the application log, which is shipped off the database host.
 */
@Service
public class AuditIntegrityService {

    private static final Logger log = LoggerFactory.getLogger(AuditIntegrityService.class);
    private static final Duration CACHE_TTL = Duration.ofSeconds(60);

    private final JdbcTemplate jdbc;
    private final AuditService auditService;
    private final Clock clock;
    private final AtomicReference<IntegrityReport> cached = new AtomicReference<>();

    public AuditIntegrityService(DataSource dataSource, AuditService auditService, Clock clock) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.jdbc.setFetchSize(500);
        this.auditService = auditService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public IntegrityReport verify() {
        long[] expectedSeq = {1};
        long[] checked = {0};
        String[] prev = {AuditService.GENESIS};
        Long[] broken = {null};
        String[] reason = {null};
        jdbc.query("""
                SELECT seq, occurred_at, actor_id::text AS actor_id, actor_username, actor_role, action, outcome,
                       target_type, target_id, document_id::text AS document_id, details, ip, user_agent, request_id,
                       prev_hash, hash
                FROM audit_events ORDER BY seq
                """, rs -> {
            if (broken[0] != null) {
                return;
            }
            var e = new AuditService.StoredEvent(rs.getLong("seq"),
                    rs.getObject("occurred_at", OffsetDateTime.class).toInstant(), rs.getString("actor_id"),
                    rs.getString("actor_username"), rs.getString("actor_role"), rs.getString("action"),
                    rs.getString("outcome"), rs.getString("target_type"), rs.getString("target_id"),
                    rs.getString("document_id"), rs.getString("details"), rs.getString("ip"),
                    rs.getString("user_agent"), rs.getString("request_id"), rs.getString("prev_hash"),
                    rs.getString("hash"));
            if (e.seq() != expectedSeq[0]) {
                broken[0] = expectedSeq[0];
                reason[0] = "Sequence gap: expected " + expectedSeq[0] + " but found " + e.seq();
            } else if (!e.prevHash().equals(prev[0])) {
                broken[0] = e.seq();
                reason[0] = "Chain link broken at seq " + e.seq();
            } else if (!auditService.computeHash(e).equals(e.hash())) {
                broken[0] = e.seq();
                reason[0] = "Content of seq " + e.seq() + " does not match its HMAC";
            } else {
                prev[0] = e.hash();
                expectedSeq[0]++;
                checked[0]++;
            }
        });
        Long headSeq = checked[0] == 0 ? null : expectedSeq[0] - 1;
        IntegrityReport report = broken[0] == null
                ? new IntegrityReport(true, checked[0], null, headSeq, checked[0] == 0 ? null : prev[0],
                clock.instant(), checked[0] + " events verified")
                : new IntegrityReport(false, checked[0], broken[0], headSeq, prev[0], clock.instant(), reason[0]);
        cached.set(report);
        if (!report.valid()) {
            log.error("AUDIT_INTEGRITY_FAILURE {}", report.message());
        }
        return report;
    }

    /** Recent result for dashboards so that page loads do not each rescan the whole log. */
    public IntegrityReport recent() {
        IntegrityReport last = cached.get();
        if (last == null || last.verifiedAt().plus(CACHE_TTL).isBefore(clock.instant())) {
            return verify();
        }
        return last;
    }

    /** Writes the chain head to the application log. Off-host log retention turns this into an external anchor. */
    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT30S")
    public void anchor() {
        jdbc.query("SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1", rs -> {
            log.info("AUDIT_ANCHOR seq={} hash={}", rs.getLong("seq"), rs.getString("hash"));
        });
    }
}
