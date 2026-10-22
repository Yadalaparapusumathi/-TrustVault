package com.trustvault.admin;

import com.trustvault.audit.AuditIntegrityService;
import com.trustvault.audit.AuditQueryService;
import com.trustvault.audit.IntegrityReport;
import com.trustvault.document.DocumentGrantRepository;
import com.trustvault.document.DocumentRepository;
import com.trustvault.user.Role;
import com.trustvault.user.UserRepository;
import com.trustvault.user.UserSummary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What an administrator should notice. Each rule is a plain query over the audit trail so it can be explained and
 * reproduced from the evidence.
 */
@Service
public class DashboardService {

    static final int DENIALS_MEDIUM = 5;
    static final int DENIALS_HIGH = 20;
    static final int BULK_DOWNLOADS_PER_HOUR = 20;
    static final int UNKNOWN_USER_FAILURES = 10;

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final DocumentRepository documents;
    private final DocumentGrantRepository grants;
    private final AuditQueryService auditQuery;
    private final AuditIntegrityService integrity;
    private final Clock clock;

    public DashboardService(JdbcTemplate jdbc, UserRepository users, DocumentRepository documents,
                            DocumentGrantRepository grants, AuditQueryService auditQuery,
                            AuditIntegrityService integrity, Clock clock) {
        this.jdbc = jdbc;
        this.users = users;
        this.documents = documents;
        this.grants = grants;
        this.auditQuery = auditQuery;
        this.integrity = integrity;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AdminDtos.Dashboard dashboard() {
        Instant now = clock.instant();
        Timestamp dayAgo = Timestamp.from(now.minus(Duration.ofHours(24)));
        IntegrityReport report = integrity.recent();

        AdminDtos.Totals totals = new AdminDtos.Totals(users.count(), users.countByActiveTrue(),
                documents.countByDeletedAtIsNull(), documents.countByDeletedAtIsNotNull(), grants.countActive(now),
                count("SELECT count(*) FROM audit_events WHERE occurred_at > ?", dayAgo),
                count("SELECT count(*) FROM audit_events WHERE occurred_at > ? AND outcome = 'DENIED'", dayAgo),
                count("SELECT count(*) FROM audit_events WHERE occurred_at > ? AND action = 'DOCUMENT_DOWNLOADED'", dayAgo));

        return new AdminDtos.Dashboard(totals, alerts(now, report), activityByDay(now),
                auditQuery.recent(List.of("GRANT_CREATED", "GRANT_UPDATED", "GRANT_REVOKED", "OWNERSHIP_TRANSFERRED"),
                        null, 10),
                auditQuery.recent(null, "DENIED", 10), report);
    }

    private List<AdminDtos.Alert> alerts(Instant now, IntegrityReport report) {
        List<AdminDtos.Alert> alerts = new ArrayList<>();
        Instant dayAgo = now.minus(Duration.ofHours(24));
        Instant hourAgo = now.minus(Duration.ofHours(1));

        if (!report.valid()) {
            alerts.add(new AdminDtos.Alert("HIGH", "AUDIT_TAMPERING",
                    "Audit trail integrity check failed: " + report.message(), null, 1, report.verifiedAt()));
        }
        jdbc.query("""
                SELECT actor_id, count(*) AS n FROM audit_events
                WHERE outcome = 'DENIED' AND occurred_at > ? AND actor_id IS NOT NULL
                GROUP BY actor_id HAVING count(*) >= ?
                """, rs -> {
            long n = rs.getLong("n");
            alerts.add(new AdminDtos.Alert(n >= DENIALS_HIGH ? "HIGH" : "MEDIUM", "REPEATED_DENIALS",
                    n + " refused access attempts in the last 24 hours", actor(rs.getObject("actor_id", UUID.class)),
                    n, dayAgo));
        }, Timestamp.from(dayAgo), DENIALS_MEDIUM);
        jdbc.query("""
                SELECT actor_id, count(*) AS n FROM audit_events
                WHERE action = 'DOCUMENT_DOWNLOADED' AND occurred_at > ? AND actor_id IS NOT NULL
                GROUP BY actor_id HAVING count(*) >= ?
                """, rs -> {
            long n = rs.getLong("n");
            alerts.add(new AdminDtos.Alert("HIGH", "BULK_DOWNLOAD", n + " downloads in the last hour",
                    actor(rs.getObject("actor_id", UUID.class)), n, hourAgo));
        }, Timestamp.from(hourAgo), BULK_DOWNLOADS_PER_HOUR);
        jdbc.query("""
                SELECT target_id, count(*) AS n FROM audit_events
                WHERE action = 'ACCOUNT_LOCKED' AND occurred_at > ? GROUP BY target_id
                """, rs -> {
            alerts.add(new AdminDtos.Alert("MEDIUM", "ACCOUNT_LOCKED",
                    "Account locked after repeated failed sign-ins", actor(parse(rs.getString("target_id"))),
                    rs.getLong("n"), dayAgo));
        }, Timestamp.from(dayAgo));
        long unknown = count("""
                SELECT count(*) FROM audit_events WHERE action = 'LOGIN_FAILED' AND occurred_at > ?
                AND details LIKE '%"reason":"unknown_user"%'
                """, Timestamp.from(dayAgo));
        if (unknown >= UNKNOWN_USER_FAILURES) {
            alerts.add(new AdminDtos.Alert("MEDIUM", "USERNAME_PROBING",
                    unknown + " sign-in attempts for usernames that do not exist", null, unknown, dayAgo));
        }
        jdbc.query("""
                SELECT a.actor_id, count(*) AS n FROM audit_events a JOIN documents d ON d.id = a.document_id
                WHERE a.action IN ('GRANT_CREATED', 'GRANT_UPDATED') AND a.occurred_at > ?
                  AND d.classification = 'RESTRICTED' AND a.actor_id IS NOT NULL
                GROUP BY a.actor_id
                """, rs -> {
            long n = rs.getLong("n");
            alerts.add(new AdminDtos.Alert("LOW", "RESTRICTED_SHARED",
                    n + " RESTRICTED document share" + (n == 1 ? "" : "s") + " in the last 24 hours",
                    actor(rs.getObject("actor_id", UUID.class)), n, dayAgo));
        }, Timestamp.from(dayAgo));
        jdbc.query("""
                SELECT target_id, occurred_at FROM audit_events
                WHERE action = 'ROLE_CHANGED' AND occurred_at > ? AND details LIKE '%"to":"ADMIN"%'
                """, rs -> {
            alerts.add(new AdminDtos.Alert("MEDIUM", "ADMIN_GRANTED", "A user was given the ADMIN role",
                    actor(parse(rs.getString("target_id"))), 1, dayAgo));
        }, Timestamp.from(dayAgo));
        alerts.sort(Comparator.comparingInt(DashboardService::rank));
        return alerts;
    }

    private List<AdminDtos.DayActivity> activityByDay(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate first = today.minusDays(13);
        Map<LocalDate, long[]> byDay = new LinkedHashMap<>();
        for (int i = 0; i < 14; i++) {
            byDay.put(first.plusDays(i), new long[4]);
        }
        jdbc.query("""
                SELECT (occurred_at AT TIME ZONE 'UTC')::date AS day,
                       count(*) FILTER (WHERE action IN ('DOCUMENT_UPLOADED', 'VERSION_UPLOADED')) AS uploads,
                       count(*) FILTER (WHERE action = 'DOCUMENT_DOWNLOADED') AS downloads,
                       count(*) FILTER (WHERE outcome = 'DENIED') AS denied,
                       count(*) FILTER (WHERE action IN ('GRANT_CREATED', 'GRANT_UPDATED', 'GRANT_REVOKED')) AS perms
                FROM audit_events WHERE occurred_at >= ?
                GROUP BY 1
                """, rs -> {
            long[] row = byDay.get(rs.getObject("day", LocalDate.class));
            if (row != null) {
                row[0] = rs.getLong("uploads");
                row[1] = rs.getLong("downloads");
                row[2] = rs.getLong("denied");
                row[3] = rs.getLong("perms");
            }
        }, Timestamp.from(first.atStartOfDay().toInstant(ZoneOffset.UTC)));
        return byDay.entrySet().stream()
                .map(e -> new AdminDtos.DayActivity(e.getKey().toString(), e.getValue()[0], e.getValue()[1],
                        e.getValue()[2], e.getValue()[3]))
                .toList();
    }

    private UserSummary actor(UUID id) {
        return id == null ? null : users.findById(id).map(UserSummary::of)
                .orElse(new UserSummary(id, "(deleted)", "(deleted user)", Role.VIEWER));
    }

    private static UUID parse(String value) {
        try {
            return value == null ? null : UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    private static int rank(AdminDtos.Alert alert) {
        return switch (alert.severity()) {
            case "HIGH" -> 0;
            case "MEDIUM" -> 1;
            default -> 2;
        };
    }
}
