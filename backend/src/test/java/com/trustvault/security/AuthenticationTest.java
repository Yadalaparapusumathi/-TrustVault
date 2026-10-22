package com.trustvault.security;

import com.trustvault.auth.SessionCookies;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** T-20..T-27: authentication, sessions, CSRF and the forced password change. */
class AuthenticationTest extends IntegrationTest {

    private MvcResult login(String username, String password, String ip) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).with(r -> {
            r.setRemoteAddr(ip);
            return r;
        }).contentType("application/json").content(toJson(Map.of("username", username, "password", password))))
                .andReturn();
    }

    @Test
    @DisplayName("Login issues an HttpOnly, SameSite=Strict session cookie and works for protected endpoints")
    void loginIssuesHardenedCookie() throws Exception {
        User user = newUser(Role.OWNER);
        MockHttpServletResponse response = login(user.getUsername(), PASSWORD, "10.0.0.1").getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        String setCookie = response.getHeaders("Set-Cookie").stream()
                .filter(h -> h.startsWith(SessionCookies.NAME + "=")).findFirst().orElseThrow();
        assertThat(setCookie).contains("HttpOnly").contains("SameSite=Strict").contains("Path=/");
        Cookie cookie = response.getCookie(SessionCookies.NAME);
        assertThat(mvc.perform(get("/api/auth/me").cookie(cookie)).andReturn().getResponse().getStatus())
                .isEqualTo(200);
    }

    @Test
    @DisplayName("Wrong password and unknown user give the same answer")
    void noUsernameOracle() throws Exception {
        User user = newUser(Role.VIEWER);
        MockHttpServletResponse wrong = login(user.getUsername(), "Wrong-password-123", "10.0.0.2").getResponse();
        MockHttpServletResponse unknown = login("nobody-" + System.nanoTime(), "Wrong-password-123", "10.0.0.2")
                .getResponse();

        assertThat(wrong.getStatus()).isEqualTo(401);
        assertThat(unknown.getStatus()).isEqualTo(401);
        assertThat(json.readTree(wrong.getContentAsString()).get("detail"))
                .isEqualTo(json.readTree(unknown.getContentAsString()).get("detail"));
    }

    @Test
    @DisplayName("An account locks after repeated failures, even for the right password, and the lock is audited")
    void lockout() throws Exception {
        User user = newUser(Role.VIEWER);
        for (int i = 0; i < 5; i++) {
            assertThat(login(user.getUsername(), "Wrong-password-123", "10.0.0.3").getResponse().getStatus())
                    .isEqualTo(401);
        }
        assertThat(login(user.getUsername(), PASSWORD, "10.0.0.3").getResponse().getStatus()).isEqualTo(401);
        assertThat(appJdbc.queryForObject("select count(*) from audit_events where action = 'ACCOUNT_LOCKED' "
                + "and target_id = ?", Integer.class, user.getId().toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("Too many login attempts from one address are rate limited")
    void ipThrottle() throws Exception {
        int last = 0;
        for (int i = 0; i < 40; i++) {
            last = login("nobody-" + i, "Wrong-password-123", "10.0.0.4").getResponse().getStatus();
        }
        assertThat(last).isEqualTo(429);
    }

    @Test
    @DisplayName("Requests without a session get 401; a forged session token gets 401")
    void unauthenticated() throws Exception {
        assertThat(mvc.perform(get("/api/documents")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(get("/api/documents").cookie(new Cookie(SessionCookies.NAME, "forged-token")))
                .andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    @DisplayName("State-changing requests without the CSRF token are refused, even with a valid session")
    void csrfRequired() throws Exception {
        Actor owner = actor(Role.OWNER);
        var doc = upload(owner, "CSRF target");
        int status = mvc.perform(delete("/api/documents/{id}", doc).cookie(owner.cookie())).andReturn()
                .getResponse().getStatus();
        assertThat(status).isEqualTo(403);
        assertThat(status(owner, get("/api/documents/{id}", doc))).isEqualTo(200);
    }

    @Test
    @DisplayName("A user who must change their password can do nothing else until they have")
    void forcedPasswordChange() throws Exception {
        User user = newUser(Role.OWNER);
        user.setMustChangePassword(true);
        users.save(user);
        Actor actor = login(user);

        assertThat(status(actor, get("/api/documents"))).isEqualTo(403);
        assertThat(status(actor, get("/api/auth/me"))).isEqualTo(200);
        assertThat(status(actor, post("/api/auth/change-password").contentType("application/json")
                .content(toJson(Map.of("currentPassword", PASSWORD, "newPassword", "A-much-better-passphrase-42")))))
                .isEqualTo(204);
        assertThat(status(actor, get("/api/documents"))).isEqualTo(200);
    }

    @Test
    @DisplayName("Weak new passwords are rejected")
    void passwordPolicy() throws Exception {
        Actor actor = actor(Role.VIEWER);
        for (String weak : new String[]{"short", "password1234", actor.username() + "-Abc123!"}) {
            assertThat(status(actor, post("/api/auth/change-password").contentType("application/json")
                    .content(toJson(Map.of("currentPassword", PASSWORD, "newPassword", weak))))).as(weak)
                    .isEqualTo(400);
        }
    }

    @Test
    @DisplayName("Anything outside the API and health check is denied")
    void denyByDefault() throws Exception {
        Actor admin = actor(Role.ADMIN);
        assertThat(status(admin, get("/actuator/env"))).isIn(401, 403, 404);
        assertThat(status(admin, get("/actuator/heapdump"))).isIn(401, 403, 404);
        assertThat(mvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus()).isEqualTo(200);
    }
}
