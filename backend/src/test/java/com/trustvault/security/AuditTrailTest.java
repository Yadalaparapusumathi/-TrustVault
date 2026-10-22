package com.trustvault.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.trustvault.audit.AuditIntegrityService;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** T-30..T-37: the audit trail records who reached what, including refusals, and cannot be quietly altered. */
class AuditTrailTest extends IntegrationTest {

    @Autowired AuditIntegrityService integrity;

    @Test
    @DisplayName("Uploads, views, downloads, changes, permission changes and deletions are all recorded with the actor")
    void lifecycleIsRecorded() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor reader = actor(Role.VIEWER);
        UUID doc = upload(owner, "Audited " + UUID.randomUUID());
        UUID grantId = grant(owner, doc, reader, "READ");
        perform(reader, get("/api/documents/{id}", doc));
        perform(reader, get("/api/documents/{id}/content", doc));
        perform(owner, delete("/api/documents/{id}/grants/{g}", doc, grantId));
        perform(owner, delete("/api/documents/{id}", doc));

        assertThat(countAudit("DOCUMENT_UPLOADED", "SUCCESS", owner.id(), doc)).isEqualTo(1);
        assertThat(countAudit("GRANT_CREATED", "SUCCESS", owner.id(), doc)).isEqualTo(1);
        assertThat(countAudit("DOCUMENT_VIEWED", "SUCCESS", reader.id(), doc)).isEqualTo(1);
        assertThat(countAudit("DOCUMENT_DOWNLOADED", "SUCCESS", reader.id(), doc)).isEqualTo(1);
        assertThat(countAudit("GRANT_REVOKED", "SUCCESS", owner.id(), doc)).isEqualTo(1);
        assertThat(countAudit("DOCUMENT_TRASHED", "SUCCESS", owner.id(), doc)).isEqualTo(1);
    }

    @Test
    @DisplayName("A refused download is recorded even though the request itself fails and rolls back")
    void refusalSurvivesRollback() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor attacker = actor(Role.VIEWER);
        UUID doc = upload(owner, "Target");

        assertThat(status(attacker, get("/api/documents/{id}/content", doc))).isEqualTo(404);

        JsonNode details = json.readTree(appJdbc.queryForObject("""
                select details from audit_events where action = 'ACCESS_DENIED' and actor_id = ? and document_id = ?
                """, String.class, attacker.id(), doc));
        assertThat(details.get("attempted").asText()).isEqualTo("download");
        assertThat(details.get("reason").asText()).isEqualTo("no_grant");
    }

    @Test
    @DisplayName("The application's database role cannot UPDATE, DELETE or TRUNCATE audit rows")
    void appRoleCannotAlterAudit() {
        assertThat(appJdbc.queryForObject("select current_user", String.class)).isEqualTo("trustvault_app");
        assertThatThrownBy(() -> appJdbc.update("update audit_events set actor_username = 'someone-else'"))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("permission denied");
        assertThatThrownBy(() -> appJdbc.update("delete from audit_events"))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("permission denied");
        assertThatThrownBy(() -> appJdbc.execute("truncate audit_events"))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("permission denied");
    }

    @Test
    @DisplayName("Even the schema owner is stopped by the append-only trigger")
    void triggerBlocksOwner() {
        JdbcTemplate su = superuserJdbc();
        assertThatThrownBy(() -> su.update("update audit_events set ip = '6.6.6.6' where seq = 1"))
                .hasMessageContaining("append-only");
        assertThatThrownBy(() -> su.update("delete from audit_events where seq = 1"))
                .hasMessageContaining("append-only");
    }

    @Test
    @DisplayName("Editing a row behind the application's back (triggers disabled by a superuser) is detected")
    void tamperingIsDetected() throws Exception {
        Actor owner = actor(Role.OWNER);
        upload(owner, "Evidence");
        assertThat(integrity.verify().valid()).isTrue();

        JdbcTemplate su = superuserJdbc();
        long seq = su.queryForObject("select max(seq) from audit_events", Long.class);
        String original = su.queryForObject("select actor_username from audit_events where seq = ?", String.class, seq);
        try {
            su.execute("alter table audit_events disable trigger user");
            su.update("update audit_events set actor_username = 'someone-else' where seq = ?", seq);

            var report = integrity.verify();
            assertThat(report.valid()).isFalse();
            assertThat(report.firstBrokenSeq()).isEqualTo(seq);

            Actor admin = actor(Role.ADMIN);
            JsonNode dashboard = body(perform(admin, get("/api/admin/dashboard")));
            assertThat(dashboard.get("alerts").findValuesAsText("type")).contains("AUDIT_TAMPERING");
        } finally {
            su.update("update audit_events set actor_username = ? where seq = ?", original, seq);
            su.execute("alter table audit_events enable trigger user");
        }
        assertThat(integrity.verify().valid()).isTrue();
    }

    @Test
    @DisplayName("Deleting a row from the middle of the chain is detected")
    void deletionIsDetected() throws Exception {
        Actor owner = actor(Role.OWNER);
        upload(owner, "One");
        upload(owner, "Two");
        JdbcTemplate su = superuserJdbc();
        long seq = su.queryForObject("select max(seq) - 1 from audit_events", Long.class);
        Map<String, Object> row = su.queryForMap("select * from audit_events where seq = ?", seq);
        try {
            su.execute("alter table audit_events disable trigger user");
            su.update("delete from audit_events where seq = ?", seq);
            assertThat(integrity.verify().valid()).isFalse();
        } finally {
            su.update("""
                    insert into audit_events (seq, occurred_at, actor_id, actor_username, actor_role, action, outcome,
                      target_type, target_id, document_id, details, ip, user_agent, request_id, prev_hash, hash)
                    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    row.get("seq"), row.get("occurred_at"), row.get("actor_id"), row.get("actor_username"),
                    row.get("actor_role"), row.get("action"), row.get("outcome"), row.get("target_type"),
                    row.get("target_id"), row.get("document_id"), row.get("details"), row.get("ip"),
                    row.get("user_agent"), row.get("request_id"), row.get("prev_hash"), row.get("hash"));
            su.execute("alter table audit_events enable trigger user");
        }
        assertThat(integrity.verify().valid()).isTrue();
    }

    @Test
    @DisplayName("A forged row inserted with a guessed hash is detected (the HMAC key is not in the database)")
    void forgedInsertIsDetected() throws Exception {
        Actor owner = actor(Role.OWNER);
        upload(owner, "Before forgery");
        JdbcTemplate su = superuserJdbc();
        Map<String, Object> head = su.queryForMap("select seq, hash from audit_events order by seq desc limit 1");
        long forgedSeq = ((Number) head.get("seq")).longValue() + 1;
        try {
            su.update("insert into audit_events (seq, occurred_at, action, outcome, details, prev_hash, hash) "
                    + "values (?, now(), 'GRANT_REVOKED', 'SUCCESS', '{}', ?, ?)", forgedSeq, head.get("hash"),
                    "0".repeat(64));
            var report = integrity.verify();
            assertThat(report.valid()).isFalse();
            assertThat(report.firstBrokenSeq()).isEqualTo(forgedSeq);
        } finally {
            su.execute("alter table audit_events disable trigger user");
            su.update("delete from audit_events where seq = ?", forgedSeq);
            su.execute("alter table audit_events enable trigger user");
        }
        assertThat(integrity.verify().valid()).isTrue();
    }

    @Test
    @DisplayName("The audit trail is visible to admins only, and its export and verification are themselves audited")
    void auditAccessIsAdminOnly() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor viewer = actor(Role.VIEWER);
        Actor admin = actor(Role.ADMIN);
        for (Actor a : new Actor[]{owner, viewer}) {
            assertThat(status(a, get("/api/admin/audit"))).isEqualTo(403);
            assertThat(status(a, get("/api/admin/audit/export"))).isEqualTo(403);
            assertThat(status(a, get("/api/admin/audit/verify"))).isEqualTo(403);
        }
        assertThat(status(admin, get("/api/admin/audit/verify"))).isEqualTo(200);
        assertThat(status(admin, get("/api/admin/audit/export"))).isEqualTo(200);
        assertThat(countAudit("AUDIT_EXPORTED", "SUCCESS", admin.id(), null)).isEqualTo(1);
    }

    @Test
    @DisplayName("CSV export neutralises spreadsheet formulas planted in user-controlled fields")
    void csvInjectionIsNeutralised() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor admin = actor(Role.ADMIN);
        upload(owner, "=HYPERLINK(\"http://evil.example\",\"x\")", "Test", "x.txt", text("x\n"));
        String csv = perform(admin, get("/api/admin/audit/export")).getResponse().getContentAsString();
        assertThat(csv).doesNotContain(",=HYPERLINK").doesNotContain("\"=HYPERLINK");
    }

    @Test
    @DisplayName("A document's activity is visible to its owner only")
    void documentActivityIsOwnerOnly() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor editor = actor(Role.VIEWER);
        UUID doc = upload(owner, "Activity");
        grant(owner, doc, editor, "EDIT");
        assertThat(status(owner, get("/api/documents/{id}/activity", doc))).isEqualTo(200);
        assertThat(status(editor, get("/api/documents/{id}/activity", doc))).isEqualTo(403);
        assertThat(status(editor, post("/api/documents/{id}/suggestions", doc))).isEqualTo(403);
    }
}
