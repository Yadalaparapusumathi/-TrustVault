package com.trustvault.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * T-01..T-06: a document is reachable only by someone who was granted it, on every route, and the refusal does not
 * reveal whether the document exists.
 */
class DocumentIsolationTest extends IntegrationTest {

    private Actor owner;
    private Actor stranger;
    private UUID doc;

    @BeforeEach
    void setUp() throws Exception {
        owner = actor(Role.OWNER);
        stranger = actor(Role.OWNER);
        doc = upload(owner, "Salary letter " + UUID.randomUUID());
    }

    /** Every route that touches a single document. If one of them forgets the check, its row fails. */
    static Stream<Arguments> documentRoutes() {
        return Stream.of(
                route("GET detail", id -> get("/api/documents/{id}", id)),
                route("GET content", id -> get("/api/documents/{id}/content", id)),
                route("GET versions", id -> get("/api/documents/{id}/versions", id)),
                route("GET version content", id -> get("/api/documents/{id}/versions/1/content", id)),
                route("GET activity", id -> get("/api/documents/{id}/activity", id)),
                route("GET grants", id -> get("/api/documents/{id}/grants", id)),
                route("PATCH metadata", id -> patch("/api/documents/{id}", id).contentType("application/json")
                        .content("{\"name\":\"pwned\",\"lockVersion\":0}")),
                route("POST new version", id -> multipart("/api/documents/{id}/versions", id)
                        .file(new MockMultipartFile("file", "x.txt", "text/plain", text("overwrite\n")))),
                route("DELETE (trash)", id -> delete("/api/documents/{id}", id)),
                route("POST restore", id -> post("/api/documents/{id}/restore", id)),
                route("DELETE purge", id -> delete("/api/documents/{id}/purge", id)),
                route("POST grant", id -> post("/api/documents/{id}/grants", id).contentType("application/json")
                        .content("{\"userId\":\"" + UUID.randomUUID() + "\",\"permission\":\"READ\"}")),
                route("DELETE grant", id -> delete("/api/documents/{id}/grants/{g}", id, UUID.randomUUID())),
                route("POST suggestions", id -> post("/api/documents/{id}/suggestions", id)),
                route("POST dismiss suggestion", id -> post("/api/documents/{id}/suggestions/{s}/dismiss", id,
                        UUID.randomUUID())));
    }

    private static Arguments route(String name, Function<UUID, MockHttpServletRequestBuilder> request) {
        return Arguments.of(name, request);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("documentRoutes")
    @DisplayName("A user with no grant gets 404 on every document route, identical to a non-existent id")
    void strangerIsRefusedEverywhere(String name, Function<UUID, MockHttpServletRequestBuilder> request)
            throws Exception {
        assertThat(status(stranger, request.apply(doc))).as(name).isEqualTo(404);
        assertThat(status(stranger, request.apply(UUID.randomUUID()))).as(name + " (unknown id)").isEqualTo(404);
        // ...and nothing changed for the owner.
        JsonNode detail = body(perform(owner, get("/api/documents/{id}", doc)));
        assertThat(detail.get("name").asText()).startsWith("Salary letter");
        assertThat(detail.get("deletedAt").isNull()).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("documentRoutes")
    @DisplayName("An administrator has no implicit access to documents")
    void adminIsRefusedEverywhere(String name, Function<UUID, MockHttpServletRequestBuilder> request)
            throws Exception {
        Actor admin = actor(Role.ADMIN);
        assertThat(status(admin, request.apply(doc))).as(name).isEqualTo(404);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("documentRoutes")
    @DisplayName("Every refused attempt is written to the audit trail with the actor")
    void refusalsAreAudited(String name, Function<UUID, MockHttpServletRequestBuilder> request) throws Exception {
        int before = countAudit("ACCESS_DENIED", "DENIED", stranger.id(), doc);
        status(stranger, request.apply(doc));
        assertThat(countAudit("ACCESS_DENIED", "DENIED", stranger.id(), doc)).as(name).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("A READ grantee can view and download, but cannot change, delete, version or share")
    void readGranteeIsLimitedToReading() throws Exception {
        Actor reader = actor(Role.VIEWER);
        grant(owner, doc, reader, "READ");

        assertThat(status(reader, get("/api/documents/{id}", doc))).isEqualTo(200);
        assertThat(perform(reader, get("/api/documents/{id}/content", doc)).getResponse().getContentAsString())
                .startsWith("Confidential content");
        assertThat(status(reader, patch("/api/documents/{id}", doc).contentType("application/json")
                .content("{\"name\":\"x\",\"lockVersion\":0}"))).isEqualTo(403);
        assertThat(status(reader, multipart("/api/documents/{id}/versions", doc)
                .file(new MockMultipartFile("file", "x.txt", "text/plain", text("v2\n"))))).isEqualTo(403);
        assertThat(status(reader, delete("/api/documents/{id}", doc))).isEqualTo(403);
        assertThat(status(reader, get("/api/documents/{id}/grants", doc))).isEqualTo(403);
        assertThat(status(reader, get("/api/documents/{id}/activity", doc))).isEqualTo(403);
        assertThat(status(reader, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", stranger.id(), "permission", "READ"))))).isEqualTo(403);
        assertThat(status(stranger, get("/api/documents/{id}", doc))).isEqualTo(404);
    }

    @Test
    @DisplayName("An EDIT grantee can edit and add versions, but cannot delete, re-share or escalate")
    void editGranteeCannotReshareOrDelete() throws Exception {
        Actor editor = actor(Role.VIEWER);
        grant(owner, doc, editor, "EDIT");
        long lock = body(perform(editor, get("/api/documents/{id}", doc))).get("lockVersion").asLong();

        assertThat(status(editor, patch("/api/documents/{id}", doc).contentType("application/json")
                .content("{\"description\":\"edited\",\"lockVersion\":" + lock + "}"))).isEqualTo(200);
        assertThat(status(editor, multipart("/api/documents/{id}/versions", doc)
                .file(new MockMultipartFile("file", "v2.txt", "text/plain", text("v2\n"))))).isEqualTo(201);
        assertThat(status(editor, delete("/api/documents/{id}", doc))).isEqualTo(403);
        assertThat(status(editor, delete("/api/documents/{id}/purge", doc))).isEqualTo(403);
        assertThat(status(editor, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", stranger.id(), "permission", "READ"))))).isEqualTo(403);
        assertThat(status(stranger, get("/api/documents/{id}", doc))).isEqualTo(404);
    }

    @Test
    @DisplayName("A grant id from another document cannot be revoked through a document the caller owns")
    void grantIdsAreScopedToTheirDocument() throws Exception {
        Actor reader = actor(Role.VIEWER);
        UUID victimGrant = grant(owner, doc, reader, "READ");
        UUID attackersDoc = upload(stranger, "Mine");

        assertThat(status(stranger, delete("/api/documents/{id}/grants/{g}", attackersDoc, victimGrant)))
                .isEqualTo(404);
        assertThat(status(reader, get("/api/documents/{id}/content", doc))).isEqualTo(200);
    }

    @Test
    @DisplayName("Search, filters and categories never return or hint at documents the caller cannot access")
    void searchIsFilteredInTheDatabase() throws Exception {
        String secretCategory = "Secret-" + UUID.randomUUID().toString().substring(0, 8);
        String secretName = "Merger plan " + UUID.randomUUID();
        upload(owner, secretName, secretCategory, "plan.txt", text("merger\n"));

        for (String query : new String[]{
                "/api/documents?q=" + secretName,
                "/api/documents?category=" + secretCategory,
                "/api/documents?owner=" + owner.username(),
                "/api/documents?scope=trash",
                "/api/documents?scope=shared&owner=" + owner.username(),
                "/api/documents?size=100"}) {
            JsonNode page = body(perform(stranger, get(query)));
            assertThat(page.get("content").findValuesAsText("name")).as(query)
                    .noneMatch(n -> n.equals(secretName) || n.startsWith("Salary letter"));
        }
        assertThat(perform(stranger, get("/api/documents/categories")).getResponse().getContentAsString())
                .doesNotContain(secretCategory);
        assertThat(body(perform(owner, get("/api/documents?q=" + secretName))).get("totalElements").asInt())
                .isEqualTo(1);
    }

    @Test
    @DisplayName("Search wildcards cannot be used to match everything or probe other users' documents")
    void searchWildcardsAreEscaped() throws Exception {
        for (String q : new String[]{"%", "_", "%25", "\\"}) {
            JsonNode page = body(perform(stranger, get("/api/documents").param("q", q)));
            assertThat(page.get("content").findValuesAsText("name")).as(q)
                    .noneMatch(n -> n.startsWith("Salary letter"));
        }
    }

    @Test
    @DisplayName("Unsupported sort fields are rejected instead of being passed to the query")
    void sortIsWhitelisted() throws Exception {
        assertThat(status(owner, get("/api/documents").param("sort", "owner.passwordHash,asc"))).isEqualTo(400);
    }

    @Test
    @DisplayName("A malformed document id is answered exactly like an unknown one")
    void malformedIdIs404() throws Exception {
        assertThat(status(stranger, get("/api/documents/{id}", "not-a-uuid"))).isEqualTo(404);
        assertThat(status(stranger, get("/api/documents/{id}", "../admin/users"))).isIn(400, 404);
    }

    @Test
    @DisplayName("An owner cannot grant to themselves, to an inactive user, or with an expiry in the past")
    void grantValidation() throws Exception {
        assertThat(status(owner, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", owner.id(), "permission", "READ"))))).isEqualTo(400);
        assertThat(status(owner, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", UUID.randomUUID(), "permission", "READ"))))).isEqualTo(400);
        assertThat(status(owner, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", stranger.id(), "permission", "READ",
                        "expiresAt", "2001-01-01T00:00:00Z"))))).isEqualTo(400);
        assertThat(status(owner, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", stranger.id(), "permission", "OWNER"))))).isEqualTo(400);
        assertThat(status(stranger, get("/api/documents/{id}", doc))).isEqualTo(404);
    }

    @Test
    @DisplayName("Unknown JSON properties are rejected, so fields like ownerId cannot be smuggled in")
    void massAssignmentIsRejected() throws Exception {
        long lock = body(perform(owner, get("/api/documents/{id}", doc))).get("lockVersion").asLong();
        assertThat(status(owner, patch("/api/documents/{id}", doc).contentType("application/json")
                .content("{\"ownerId\":\"" + stranger.id() + "\",\"lockVersion\":" + lock + "}"))).isEqualTo(400);
        assertThat(status(stranger, get("/api/documents/{id}", doc))).isEqualTo(404);
    }

    @Test
    @DisplayName("A viewer cannot upload, and cannot enumerate the user directory")
    void viewerRestrictions() throws Exception {
        Actor viewer = actor(Role.VIEWER);
        assertThat(status(viewer, uploadRequest("x", "Test", "x.txt", text("x\n")))).isEqualTo(403);
        assertThat(status(viewer, get("/api/users/directory").param("q", "a"))).isEqualTo(403);
    }
}
