package com.trustvault.security;

import com.trustvault.common.ApiException;
import com.trustvault.document.Classification;
import com.trustvault.document.DocumentService;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class UserDeletionTest extends IntegrationTest {

    @Autowired DocumentService documentService;

    @Test
    void deletionRevokesAccessButPreservesHistoryAndCannotBeUndone() throws Exception {
        Actor admin = actor(Role.ADMIN);
        Actor owner = actor(Role.OWNER);
        Actor viewer = actor(Role.VIEWER);
        Actor secondSession = login(viewer.user());
        UUID document = upload(owner, "Retained evidence");
        UUID grantId = grant(owner, document, viewer, "READ");
        assertThat(status(viewer, get("/api/documents/{id}/content", document))).isEqualTo(200);
        var evidence = appJdbc.queryForList("select * from audit_events where actor_id = ?", viewer.id());
        long before = body(perform(admin, get("/api/admin/dashboard"))).path("totals").path("users").asLong();

        assertThat(status(admin, delete("/api/admin/users/{id}", viewer.id()))).isEqualTo(204);
        var retained = users.findById(viewer.id()).orElseThrow();
        assertThat(retained.isDeleted()).isTrue();
        assertThat(retained.isActive()).isFalse();
        assertThat(sessions.countLive(viewer.id())).isZero();
        assertThat(status(viewer, get("/api/documents/{id}/content", document))).isEqualTo(401);
        assertThat(status(secondSession, get("/api/auth/me"))).isEqualTo(401);
        assertThat(mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content(toJson(Map.of("username", viewer.username(), "password", PASSWORD))))
                .andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(body(perform(admin, get("/api/admin/users"))).toString()).doesNotContain(viewer.id().toString());
        assertThat(body(perform(owner, get("/api/users/directory").param("q", viewer.username()))).size()).isZero();
        assertThat(body(perform(admin, get("/api/admin/dashboard"))).path("totals").path("users").asLong())
                .isEqualTo(before - 1);
        assertThat(status(admin, patch("/api/admin/users/{id}", viewer.id()).contentType("application/json")
                .content("{\"active\":true}"))).isEqualTo(404);
        assertThat(status(admin, post("/api/admin/users/{id}/reset-password", viewer.id())
                .contentType("application/json").content("{\"temporaryPassword\":\"Replacement-Pass-123\"}"))).isEqualTo(404);
        assertThat(status(admin, post("/api/admin/users").contentType("application/json").content(toJson(Map.of(
                "username", viewer.username(), "displayName", "Replacement", "role", "VIEWER",
                "temporaryPassword", "Replacement-Pass-123"))))).isEqualTo(409);
        assertThat(appJdbc.queryForList("select * from audit_events where actor_id = ?", viewer.id()))
                .containsAll(evidence);
        assertThat(appJdbc.queryForObject("select count(*) from document_grants where id = ?", Integer.class, grantId))
                .isEqualTo(1);
        assertThat(body(perform(owner, get("/api/documents/{id}/grants", document))).toString())
                .doesNotContain(viewer.id().toString());
        assertThat(status(owner, get("/api/documents/{id}/content", document))).isEqualTo(200);
        assertThat(countAudit("USER_DELETED", "SUCCESS", admin.id(), null)).isEqualTo(1);
        assertThat(status(admin, delete("/api/admin/users/{id}", viewer.id()))).isEqualTo(404);
        assertThat(countAudit("USER_DELETED", "DENIED", admin.id(), null)).isEqualTo(1);
    }

    @Test
    void ownedDocumentsIncludingTrashMustBeTransferredBeforeDeletion() throws Exception {
        Actor admin = actor(Role.ADMIN);
        Actor owner = actor(Role.OWNER);
        Actor successor = actor(Role.OWNER);
        UUID document = upload(owner, "Leaver document");
        assertThat(status(admin, delete("/api/admin/users/{id}", owner.id()))).isEqualTo(409);
        assertThat(status(owner, delete("/api/documents/{id}", document))).isEqualTo(204);
        assertThat(status(admin, delete("/api/admin/users/{id}", owner.id()))).isEqualTo(409);
        assertThat(users.findById(owner.id()).orElseThrow().isActive()).isTrue();
        assertThat(countAudit("USER_DELETED", "DENIED", admin.id(), null)).isEqualTo(2);

        assertThat(status(admin, post("/api/admin/users/{id}/transfer-documents", owner.id())
                .contentType("application/json").content(toJson(Map.of("toUserId", successor.id()))))).isEqualTo(200);
        assertThat(status(admin, delete("/api/admin/users/{id}", owner.id()))).isEqualTo(204);
        assertThat(status(successor, post("/api/documents/{id}/restore", document))).isEqualTo(200);
        assertThat(status(successor, get("/api/documents/{id}/content", document))).isEqualTo(200);
        assertThat(status(admin, get("/api/documents/{id}/content", document))).isEqualTo(404);
        assertThat(appJdbc.queryForObject("select uploaded_by from document_versions where document_id = ?",
                UUID.class, document)).isEqualTo(owner.id());
    }

    @Test
    void selfDeletionAndUnknownIdsAreAuditedAndCsrfIsRequired() throws Exception {
        Actor admin = actor(Role.ADMIN);
        Actor viewer = actor(Role.VIEWER);
        assertThat(status(admin, delete("/api/admin/users/{id}", admin.id()))).isEqualTo(400);
        assertThat(status(admin, delete("/api/admin/users/{id}", UUID.randomUUID()))).isEqualTo(404);
        assertThat(countAudit("USER_DELETED", "DENIED", admin.id(), null)).isEqualTo(2);
        assertThat(mvc.perform(delete("/api/admin/users/{id}", viewer.id()).cookie(admin.cookie()))
                .andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(users.findById(viewer.id()).orElseThrow().isDeleted()).isFalse();
        assertThat(status(admin, get("/api/auth/me"))).isEqualTo(200);
    }

    @Test
    void aResolvedIdentityCannotUploadAfterDeletionCommits() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor admin = actor(Role.ADMIN);
        var caller = new AuthenticatedUser(owner.id(), owner.username(), owner.user().getDisplayName(),
                Role.OWNER, false, UUID.randomUUID());
        assertThat(status(admin, delete("/api/admin/users/{id}", owner.id()))).isEqualTo(204);
        var file = new MockMultipartFile("file", "notes.txt", "text/plain", text("Late upload"));
        assertThatThrownBy(() -> documentService.upload(caller, file, "Late", null, "Test", Classification.INTERNAL))
                .isInstanceOf(ApiException.class).hasMessageContaining("active");
        assertThat(appJdbc.queryForObject("select count(*) from documents where owner_id = ?", Integer.class, owner.id()))
                .isZero();
    }
}
