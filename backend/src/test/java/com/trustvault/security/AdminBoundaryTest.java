package com.trustvault.security;

import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** T-50..T-55: administrators run the system but cannot read documents; nobody else can use admin functions. */
class AdminBoundaryTest extends IntegrationTest {

    static Stream<Arguments> adminRoutes() {
        UUID someone = UUID.randomUUID();
        return Stream.of(
                Arguments.of("dashboard", get("/api/admin/dashboard")),
                Arguments.of("audit", get("/api/admin/audit")),
                Arguments.of("audit actions", get("/api/admin/audit/actions")),
                Arguments.of("audit export", get("/api/admin/audit/export")),
                Arguments.of("audit verify", get("/api/admin/audit/verify")),
                Arguments.of("list users", get("/api/admin/users")),
                Arguments.of("create user", post("/api/admin/users").contentType("application/json").content(
                        "{\"username\":\"evil\",\"displayName\":\"Evil\",\"role\":\"ADMIN\",\"temporaryPassword\":\"Evil-password-123\"}")),
                Arguments.of("update user", patch("/api/admin/users/{id}", someone).contentType("application/json")
                        .content("{\"role\":\"ADMIN\"}")),
                Arguments.of("reset password", post("/api/admin/users/{id}/reset-password", someone)
                        .contentType("application/json").content("{\"temporaryPassword\":\"Evil-password-123\"}")),
                Arguments.of("revoke sessions", post("/api/admin/users/{id}/revoke-sessions", someone)),
                Arguments.of("transfer", post("/api/admin/users/{id}/transfer-documents", someone)
                        .contentType("application/json").content("{\"toUserId\":\"" + someone + "\"}")));
    }

    @ParameterizedTest(name = "OWNER: {0}")
    @MethodSource("adminRoutes")
    void ownerCannotUseAdminRoutes(String name, MockHttpServletRequestBuilder request) throws Exception {
        assertThat(status(actor(Role.OWNER), request)).as(name).isEqualTo(403);
    }

    @ParameterizedTest(name = "VIEWER: {0}")
    @MethodSource("adminRoutes")
    void viewerCannotUseAdminRoutes(String name, MockHttpServletRequestBuilder request) throws Exception {
        assertThat(status(actor(Role.VIEWER), request)).as(name).isEqualTo(403);
    }

    @Test
    @DisplayName("A role-check refusal on an admin route is audited")
    void adminRefusalIsAudited() throws Exception {
        Actor viewer = actor(Role.VIEWER);
        status(viewer, get("/api/admin/users"));
        assertThat(countAudit("ACCESS_DENIED", "DENIED", viewer.id(), null)).isGreaterThanOrEqualTo(1);
    }

    @Test
    @DisplayName("An admin's document search returns nothing they were not granted")
    void adminSeesNoDocuments() throws Exception {
        Actor owner = actor(Role.OWNER);
        String name = "Board minutes " + UUID.randomUUID();
        upload(owner, name);
        Actor admin = actor(Role.ADMIN);
        assertThat(body(perform(admin, get("/api/documents").param("q", name))).get("totalElements").asInt()).isZero();
        assertThat(body(perform(admin, get("/api/documents").param("owner", owner.username())))
                .get("totalElements").asInt()).isZero();
    }

    @Test
    @DisplayName("An admin cannot change their own role or deactivate themselves")
    void adminCannotLockThemselvesOut() throws Exception {
        Actor admin = actor(Role.ADMIN);
        assertThat(status(admin, patch("/api/admin/users/{id}", admin.id()).contentType("application/json")
                .content(toJson(Map.of("active", false))))).isEqualTo(400);
        assertThat(status(admin, patch("/api/admin/users/{id}", admin.id()).contentType("application/json")
                .content(toJson(Map.of("role", "VIEWER"))))).isEqualTo(400);
    }

    @Test
    @DisplayName("Admin-created users must change their temporary password before doing anything")
    void createdUserMustChangePassword() throws Exception {
        Actor admin = actor(Role.ADMIN);
        String username = "new-" + UUID.randomUUID().toString().substring(0, 8);
        assertThat(status(admin, post("/api/admin/users").contentType("application/json").content(toJson(Map.of(
                "username", username, "displayName", "New Person", "role", "OWNER",
                "temporaryPassword", "Temporary-Pass-123"))))).isEqualTo(201);
        Actor created = login(users.findByUsernameIgnoreCase(username).orElseThrow());
        assertThat(status(created, get("/api/documents"))).isEqualTo(403);
    }

    @Test
    @DisplayName("An owner who still owns documents cannot be demoted until they are transferred")
    void cannotDemoteOwnerWithDocuments() throws Exception {
        Actor owner = actor(Role.OWNER);
        upload(owner, "Still mine");
        Actor admin = actor(Role.ADMIN);
        assertThat(status(admin, patch("/api/admin/users/{id}", owner.id()).contentType("application/json")
                .content(toJson(Map.of("role", "VIEWER"))))).isEqualTo(409);
    }
}
