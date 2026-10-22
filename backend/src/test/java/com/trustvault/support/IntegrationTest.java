package com.trustvault.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trustvault.auth.LoginThrottle;
import com.trustvault.auth.SessionCookies;
import com.trustvault.auth.SessionService;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Full-stack tests against a real PostgreSQL (Testcontainers) with the production schema, triggers and role split:
 * Flyway migrates as the container superuser, the application connects as the restricted {@code trustvault_app}.
 * Requests go through the real security filter chain via MockMvc.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTest {

    protected static final String PASSWORD = "Correct-Horse-Battery-9";

    @SuppressWarnings("resource")
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine")
            .withInitScript("init-roles.sql");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "trustvault_app");
        registry.add("spring.datasource.password", () -> "app-test-password");
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
        registry.add("spring.flyway.placeholders.appUser", () -> "trustvault_app");
        registry.add("trustvault.crypto.master-key", () -> "dGVzdC1vbmx5LW1hc3Rlci1rZXktMzItYnl0ZXMhISE=");
        registry.add("trustvault.crypto.audit-hmac-key", () -> "dGVzdC1vbmx5LWF1ZGl0LWhtYWMta2V5LTMyYnl0ZXMh");
        registry.add("trustvault.security.cookie-secure", () -> "false");
        registry.add("trustvault.seed.enabled", () -> "false");
    }

    private static final AtomicInteger COUNTER = new AtomicInteger();
    private static volatile String passwordHash;

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected UserRepository users;
    @Autowired protected SessionService sessions;
    @Autowired protected PasswordEncoder encoder;
    @Autowired protected JdbcTemplate appJdbc;
    @Autowired protected LoginThrottle loginThrottle;

    @BeforeEach
    void resetThrottle() {
        loginThrottle.reset();
    }

    /** A connection as the database superuser: what a DBA, or an attacker holding DBA credentials, could do. */
    protected static JdbcTemplate superuserJdbc() {
        return new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                POSTGRES.getPassword()));
    }

    // ---------------------------------------------------------------- actors

    /** A logged-in user. {@code cookie} is a real server-side session issued by the production SessionService. */
    protected record Actor(User user, Cookie cookie) {
        public UUID id() {
            return user.getId();
        }

        public String username() {
            return user.getUsername();
        }
    }

    protected User newUser(Role role) {
        String username = role.name().toLowerCase() + "-" + COUNTER.incrementAndGet() + "-"
                + UUID.randomUUID().toString().substring(0, 6);
        return users.save(new User(username, "Test " + username, username + "@test.example", hash(), role,
                Instant.now()));
    }

    protected Actor actor(Role role) {
        return login(newUser(role));
    }

    protected Actor login(User user) {
        SessionService.IssuedSession session = sessions.create(user, "127.0.0.1", "test");
        return new Actor(user, new Cookie(SessionCookies.NAME, session.token()));
    }

    private String hash() {
        if (passwordHash == null) {
            passwordHash = encoder.encode(PASSWORD);
        }
        return passwordHash;
    }

    // ---------------------------------------------------------------- requests

    /** Authenticated request with a valid CSRF token, as the real SPA would send it. */
    protected MockHttpServletRequestBuilder as(Actor actor, MockHttpServletRequestBuilder request) {
        return request.cookie(actor.cookie()).with(csrf());
    }

    protected MvcResult perform(Actor actor, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(as(actor, request)).andReturn();
    }

    protected int status(Actor actor, MockHttpServletRequestBuilder request) throws Exception {
        return perform(actor, request).getResponse().getStatus();
    }

    protected JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    protected String toJson(Object value) throws Exception {
        return json.writeValueAsString(value);
    }

    // ---------------------------------------------------------------- documents

    protected static byte[] text(String content) {
        return content.getBytes(StandardCharsets.UTF_8);
    }

    protected UUID upload(Actor owner, String name) throws Exception {
        return upload(owner, name, "Test", "notes.txt", text("Confidential content of " + name + "\n"));
    }

    protected UUID upload(Actor owner, String name, String category, String filename, byte[] content) throws Exception {
        MvcResult result = perform(owner, uploadRequest(name, category, filename, content));
        if (result.getResponse().getStatus() != 201) {
            throw new AssertionError("Upload failed: " + result.getResponse().getStatus() + " "
                    + result.getResponse().getContentAsString());
        }
        return UUID.fromString(body(result).get("id").asText());
    }

    protected static MockMultipartHttpServletRequestBuilder uploadRequest(String name, String category,
                                                                         String filename, byte[] content) {
        MockMultipartHttpServletRequestBuilder request = multipart("/api/documents");
        request.file(new MockMultipartFile("file", filename, "application/octet-stream", content));
        request.param("name", name).param("category", category).param("classification", "CONFIDENTIAL");
        return request;
    }

    protected UUID grant(Actor owner, UUID documentId, Actor grantee, String permission) throws Exception {
        MvcResult result = perform(owner, post("/api/documents/{id}/grants", documentId)
                .contentType("application/json")
                .content(toJson(Map.of("userId", grantee.id(), "permission", permission))));
        int status = result.getResponse().getStatus();
        if (status != 201 && status != 200) {
            throw new AssertionError("Grant failed: " + status + " " + result.getResponse().getContentAsString());
        }
        return UUID.fromString(body(result).get("id").asText());
    }

    // ---------------------------------------------------------------- audit

    protected int countAudit(String action, String outcome, UUID actorId, UUID documentId) {
        Integer n = appJdbc.queryForObject("""
                select count(*) from audit_events
                 where action = ? and outcome = ? and actor_id = ? and (?::uuid is null or document_id = ?::uuid)
                """, Integer.class, action, outcome, actorId, documentId, documentId);
        return n == null ? 0 : n;
    }
}
