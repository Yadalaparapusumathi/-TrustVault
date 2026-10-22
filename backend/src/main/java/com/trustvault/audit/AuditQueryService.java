package com.trustvault.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trustvault.common.ApiException;
import com.trustvault.common.Like;
import com.trustvault.common.PageResponse;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.Writer;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Read side of the audit trail. Only ever SELECTs; the runtime role cannot do anything else to this table. */
@Service
public class AuditQueryService {

    public static final int EXPORT_LIMIT = 50_000;
    private static final String COLUMNS = """
            seq, occurred_at, actor_id, actor_username, actor_role, action, outcome, target_type, target_id,
            document_id, details, ip, user_agent, request_id
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AuditQueryService(NamedParameterJdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public record Filter(String actor, String action, String outcome, UUID documentId, LocalDate from, LocalDate to) {

        public static Filter forDocument(UUID documentId) {
            return new Filter(null, null, null, documentId, null, null);
        }
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditEventView> search(Filter filter, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 200);
        int safePage = Math.max(page, 0);
        MapSqlParameterSource params = new MapSqlParameterSource();
        String where = where(filter, params);
        Long total = jdbc.queryForObject("SELECT count(*) FROM audit_events" + where, params, Long.class);
        params.addValue("limit", safeSize).addValue("offset", (long) safePage * safeSize);
        List<AuditEventView> rows = jdbc.query("SELECT " + COLUMNS + " FROM audit_events" + where
                + " ORDER BY seq DESC LIMIT :limit OFFSET :offset", params, rowMapper());
        return PageResponse.of(rows, safePage, safeSize, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public List<AuditEventView> recent(List<String> actions, String outcome, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("limit", limit);
        List<String> clauses = new ArrayList<>();
        if (actions != null && !actions.isEmpty()) {
            clauses.add("action IN (:actions)");
            params.addValue("actions", actions);
        }
        if (outcome != null) {
            clauses.add("outcome = :outcome");
            params.addValue("outcome", outcome);
        }
        String where = clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
        return jdbc.query("SELECT " + COLUMNS + " FROM audit_events" + where + " ORDER BY seq DESC LIMIT :limit",
                params, rowMapper());
    }

    /** Streams CSV. Cells that a spreadsheet would execute as a formula are neutralised. */
    @Transactional(readOnly = true)
    public int exportCsv(Filter filter, Writer out) throws IOException {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("limit", EXPORT_LIMIT);
        String where = where(filter, params);
        out.write("seq,occurred_at,actor_username,actor_role,action,outcome,target_type,target_id,document_id,"
                + "details,ip,user_agent,request_id\n");
        int[] count = {0};
        IOException[] failure = {null};
        jdbc.query("SELECT " + COLUMNS + " FROM audit_events" + where + " ORDER BY seq LIMIT :limit", params, rs -> {
            if (failure[0] != null) {
                return;
            }
            try {
                out.write(String.join(",", Arrays.asList(
                        cell(rs.getString("seq")),
                        cell(rs.getObject("occurred_at", OffsetDateTime.class).toInstant().toString()),
                        cell(rs.getString("actor_username")), cell(rs.getString("actor_role")),
                        cell(rs.getString("action")), cell(rs.getString("outcome")),
                        cell(rs.getString("target_type")), cell(rs.getString("target_id")),
                        cell(rs.getString("document_id")), cell(rs.getString("details")),
                        cell(rs.getString("ip")), cell(rs.getString("user_agent")),
                        cell(rs.getString("request_id")))));
                out.write("\n");
                count[0]++;
            } catch (IOException e) {
                failure[0] = e;
            }
        });
        if (failure[0] != null) {
            throw failure[0];
        }
        return count[0];
    }

    private static String where(Filter f, MapSqlParameterSource params) {
        List<String> clauses = new ArrayList<>();
        if (f.actor() != null && !f.actor().isBlank()) {
            clauses.add("lower(actor_username) LIKE :actor ESCAPE '\\'");
            params.addValue("actor", Like.contains(f.actor()));
        }
        if (f.action() != null && !f.action().isBlank()) {
            String action = f.action().trim().toUpperCase(Locale.ROOT);
            try {
                AuditAction.valueOf(action);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Unknown action");
            }
            clauses.add("action = :action");
            params.addValue("action", action);
        }
        if (f.outcome() != null && !f.outcome().isBlank()) {
            String outcome = f.outcome().trim().toUpperCase(Locale.ROOT);
            try {
                AuditOutcome.valueOf(outcome);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Unknown outcome");
            }
            clauses.add("outcome = :outcome");
            params.addValue("outcome", outcome);
        }
        if (f.documentId() != null) {
            clauses.add("document_id = :documentId");
            params.addValue("documentId", f.documentId());
        }
        if (f.from() != null) {
            clauses.add("occurred_at >= :from");
            params.addValue("from", Timestamp.from(f.from().atStartOfDay().toInstant(ZoneOffset.UTC)));
        }
        if (f.to() != null) {
            clauses.add("occurred_at < :to");
            params.addValue("to", Timestamp.from(f.to().plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));
        }
        return clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
    }

    private RowMapper<AuditEventView> rowMapper() {
        return (rs, i) -> {
            String actorId = rs.getString("actor_id");
            String documentId = rs.getString("document_id");
            Instant occurred = rs.getObject("occurred_at", OffsetDateTime.class).toInstant();
            return new AuditEventView(rs.getLong("seq"), occurred,
                    actorId == null ? null : new AuditEventView.Actor(UUID.fromString(actorId),
                            rs.getString("actor_username"), rs.getString("actor_role")),
                    rs.getString("action"), rs.getString("outcome"), rs.getString("target_type"),
                    rs.getString("target_id"), documentId == null ? null : UUID.fromString(documentId),
                    parse(rs.getString("details")), rs.getString("ip"), rs.getString("user_agent"),
                    rs.getString("request_id"));
        };
    }

    private JsonNode parse(String json) {
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            return mapper.getNodeFactory().textNode(json);
        }
    }

    static String cell(String value) {
        if (value == null) {
            return "";
        }
        String v = value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        return "\"" + v.replace("\"", "\"\"").replace("\r", " ").replace("\n", " ") + "\"";
    }
}
