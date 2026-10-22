package com.trustvault.security;

import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** T-10..T-15: taking access away works on the very next request, with the same session the user already holds. */
class RevocationTest extends IntegrationTest {

    private Actor owner;
    private Actor grantee;
    private UUID doc;

    @BeforeEach
    void setUp() throws Exception {
        owner = actor(Role.OWNER);
        grantee = actor(Role.VIEWER);
        doc = upload(owner, "Contract " + UUID.randomUUID());
    }

    @Test
    @DisplayName("Revoking a grant stops the grantee's very next download, on the session they already hold")
    void revokeIsImmediate() throws Exception {
        UUID grantId = grant(owner, doc, grantee, "READ");
        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(200);

        assertThat(status(owner, delete("/api/documents/{id}/grants/{g}", doc, grantId))).isEqualTo(204);

        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(404);
        assertThat(status(grantee, get("/api/documents/{id}", doc))).isEqualTo(404);
        assertThat(status(grantee, get("/api/documents/{id}/versions/1/content", doc))).isEqualTo(404);
        assertThat(body(perform(grantee, get("/api/documents"))).get("content").findValuesAsText("id"))
                .doesNotContain(doc.toString());
        assertThat(countAudit("GRANT_REVOKED", "SUCCESS", owner.id(), doc)).isEqualTo(1);
    }

    @Test
    @DisplayName("Downgrading EDIT to READ removes edit rights immediately")
    void downgradeIsImmediate() throws Exception {
        grant(owner, doc, grantee, "EDIT");
        long lock = body(perform(grantee, get("/api/documents/{id}", doc))).get("lockVersion").asLong();
        grant(owner, doc, grantee, "READ");

        assertThat(status(grantee, patch("/api/documents/{id}", doc).contentType("application/json")
                .content("{\"description\":\"x\",\"lockVersion\":" + lock + "}"))).isEqualTo(403);
        assertThat(status(grantee, get("/api/documents/{id}", doc))).isEqualTo(200);
    }

    @Test
    @DisplayName("An expired grant gives no access, without any job having to run")
    void expiredGrantIsDead() throws Exception {
        UUID grantId = grant(owner, doc, grantee, "READ");
        appJdbc.update("update document_grants set expires_at = now() - interval '1 second' where id = ?", grantId);

        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(404);
    }

    @Test
    @DisplayName("Trashing a document cuts off every grantee at once; restore brings the grants back")
    void trashCutsOffGrantees() throws Exception {
        grant(owner, doc, grantee, "READ");
        assertThat(status(owner, delete("/api/documents/{id}", doc))).isEqualTo(204);

        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(404);
        assertThat(status(grantee, get("/api/documents/{id}", doc))).isEqualTo(404);
        assertThat(status(owner, get("/api/documents/{id}/content", doc))).isEqualTo(409);

        assertThat(status(owner, post("/api/documents/{id}/restore", doc))).isEqualTo(200);
        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(200);
    }

    @Test
    @DisplayName("Purging destroys the content and the grants; nobody can reach it again")
    void purgeIsFinal() throws Exception {
        grant(owner, doc, grantee, "READ");
        assertThat(status(owner, delete("/api/documents/{id}/purge", doc))).isEqualTo(409);
        assertThat(status(owner, delete("/api/documents/{id}", doc))).isEqualTo(204);
        assertThat(status(owner, delete("/api/documents/{id}/purge", doc))).isEqualTo(204);

        assertThat(status(owner, get("/api/documents/{id}", doc))).isEqualTo(404);
        assertThat(status(grantee, get("/api/documents/{id}", doc))).isEqualTo(404);
        Integer blobs = appJdbc.queryForObject("""
                select count(*) from document_blobs b join document_versions v on v.id = b.version_id
                 where v.document_id = ?""", Integer.class, doc);
        assertThat(blobs).isZero();
        assertThat(countAudit("DOCUMENT_PURGED", "SUCCESS", owner.id(), doc)).isEqualTo(1);
    }

    @Test
    @DisplayName("Deactivating a user kills their existing session on the next request")
    void deactivationKillsSessions() throws Exception {
        grant(owner, doc, grantee, "READ");
        Actor admin = actor(Role.ADMIN);

        assertThat(status(admin, patch("/api/admin/users/{id}", grantee.id()).contentType("application/json")
                .content(toJson(Map.of("active", false))))).isEqualTo(200);

        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(401);
        assertThat(status(grantee, get("/api/auth/me"))).isEqualTo(401);
    }

    @Test
    @DisplayName("An inactive account is refused on every request even if its session rows still exist")
    void inactiveUserIsCheckedPerRequest() throws Exception {
        grant(owner, doc, grantee, "READ");
        // Deactivated by a path that does not delete sessions (e.g. a direct directory sync).
        appJdbc.update("update users set active = false where id = ?", grantee.id());

        assertThat(status(grantee, get("/api/documents/{id}/content", doc))).isEqualTo(401);
    }

    @Test
    @DisplayName("Admin 'revoke sessions' and 'reset password' log the user out everywhere")
    void adminCanKillSessions() throws Exception {
        Actor admin = actor(Role.ADMIN);
        Actor second = login(grantee.user());

        assertThat(status(admin, post("/api/admin/users/{id}/revoke-sessions", grantee.id()))).isEqualTo(204);
        assertThat(status(grantee, get("/api/auth/me"))).isEqualTo(401);
        assertThat(status(second, get("/api/auth/me"))).isEqualTo(401);

        Actor third = login(grantee.user());
        assertThat(status(admin, post("/api/admin/users/{id}/reset-password", grantee.id())
                .contentType("application/json")
                .content(toJson(Map.of("temporaryPassword", "Temporary-Pass-77"))))).isEqualTo(204);
        assertThat(status(third, get("/api/auth/me"))).isEqualTo(401);
    }

    @Test
    @DisplayName("Logout deletes the session server-side; a copied cookie stops working")
    void logoutIsServerSide() throws Exception {
        assertThat(status(grantee, post("/api/auth/logout"))).isEqualTo(204);
        assertThat(status(grantee, get("/api/auth/me"))).isEqualTo(401);
    }

    @Test
    @DisplayName("Transferring documents away from a leaver removes the new owner's old grant and gives the admin nothing")
    void transferDoesNotLeakToAdmin() throws Exception {
        Actor admin = actor(Role.ADMIN);
        Actor successor = actor(Role.OWNER);
        grant(owner, doc, successor, "READ");

        assertThat(status(admin, post("/api/admin/users/{id}/transfer-documents", owner.id())
                .contentType("application/json").content(toJson(Map.of("toUserId", successor.id())))))
                .isEqualTo(200);

        assertThat(status(successor, delete("/api/documents/{id}", doc))).isEqualTo(204);
        assertThat(status(owner, get("/api/documents/{id}", doc))).isEqualTo(404);
        assertThat(status(admin, get("/api/documents/{id}", doc))).isEqualTo(404);
    }

    @Test
    @DisplayName("Transfer to an admin or viewer is refused, so documents can never be handed to a non-owner role")
    void transferTargetMustBeOwner() throws Exception {
        Actor admin = actor(Role.ADMIN);
        assertThat(status(admin, post("/api/admin/users/{id}/transfer-documents", owner.id())
                .contentType("application/json").content(toJson(Map.of("toUserId", admin.id()))))).isEqualTo(400);
        assertThat(status(admin, post("/api/admin/users/{id}/transfer-documents", owner.id())
                .contentType("application/json").content(toJson(Map.of("toUserId", grantee.id()))))).isEqualTo(400);
        assertThat(status(admin, get("/api/documents/{id}", doc))).isEqualTo(404);
    }
}
