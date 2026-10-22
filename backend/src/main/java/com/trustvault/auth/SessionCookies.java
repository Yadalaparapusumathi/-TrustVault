package com.trustvault.auth;

import com.trustvault.config.AppProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

@Component
public class SessionCookies {

    public static final String NAME = "TV_SESSION";

    private final AppProperties properties;

    public SessionCookies(AppProperties properties) {
        this.properties = properties;
    }

    public Optional<String> read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        for (Cookie cookie : cookies) {
            if (NAME.equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank()
                    && cookie.getValue().length() <= 128) {
                return Optional.of(cookie.getValue());
            }
        }
        return Optional.empty();
    }

    /** Session cookie (no Max-Age) so it disappears when the browser closes; the server enforces expiry anyway. */
    public void write(HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, base(token).build().toString());
    }

    public void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, base("").maxAge(Duration.ZERO).build().toString());
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(properties.security().cookieSecure())
                .sameSite("Strict")
                .path("/");
    }
}
