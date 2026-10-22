package com.trustvault.auth;

import com.trustvault.common.ApiException;
import com.trustvault.security.CurrentUser;
import com.trustvault.security.RequestIdFilter;
import com.trustvault.security.RequestMetadata;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final AuthService authService;
    private final SessionService sessionService;
    private final SessionCookies cookies;
    private final LoginThrottle throttle;

    public AuthController(AuthService authService, SessionService sessionService, SessionCookies cookies,
                          LoginThrottle throttle) {
        this.authService = authService;
        this.sessionService = sessionService;
        this.cookies = cookies;
        this.throttle = throttle;
    }

    /** The CSRF cookie is written by CsrfCookieFilter on every response; this endpoint just gives the SPA a call to make. */
    @GetMapping("/csrf")
    public ResponseEntity<Void> csrf() {
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    public AuthDtos.Me login(@Valid @RequestBody AuthDtos.LoginRequest body, HttpServletRequest request,
                             HttpServletResponse response) {
        RequestMetadata meta = RequestMetadata.from(request, MDC.get(RequestIdFilter.MDC_KEY));
        if (!throttle.tryAcquire(meta.ip())) {
            log.warn("Login rate limit exceeded for {}", meta.ip());
            throw ApiException.tooManyRequests("Too many login attempts. Try again later.");
        }
        // A login always starts a fresh session (no fixation); any session presented with the request is discarded.
        CurrentUser.find().ifPresent(u -> sessionService.revoke(u.sessionId()));
        AuthService.LoginResult result = authService.login(body.username(), body.password(), meta.ip(), meta.userAgent());
        if (result instanceof AuthService.LoginResult.Success success) {
            cookies.write(response, success.session().token());
            return AuthDtos.Me.of(success.user());
        }
        cookies.clear(response);
        throw ApiException.unauthorized("Invalid username or password, or the account is locked or disabled");
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletResponse response) {
        authService.logout(CurrentUser.require());
        cookies.clear(response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public AuthDtos.Me me() {
        return authService.me(CurrentUser.require());
    }

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody AuthDtos.ChangePasswordRequest body) {
        authService.changePassword(CurrentUser.require(), body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent().build();
    }
}
