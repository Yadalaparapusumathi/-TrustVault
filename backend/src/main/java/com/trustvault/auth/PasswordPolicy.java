package com.trustvault.auth;

import com.trustvault.common.ApiException;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

/** NIST 800-63B style: length and a deny-list, no composition rules. */
@Component
public class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    private static final Set<String> COMMON = Set.of(
            "password1234", "password123!", "123456789012", "qwertyuiop12", "welcome12345", "letmein12345",
            "administrator", "trustvault123", "changeme1234", "passw0rd1234", "iloveyou1234", "qwerty123456",
            "1q2w3e4r5t6y", "abc123456789", "password12345", "summer202612", "winter202612");

    public void validate(String password, String username) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw ApiException.badRequest("Password must be at least " + MIN_LENGTH + " characters");
        }
        if (password.length() > MAX_LENGTH) {
            throw ApiException.badRequest("Password must be at most " + MAX_LENGTH + " characters");
        }
        String lower = password.toLowerCase(Locale.ROOT);
        if (COMMON.contains(lower) || lower.chars().distinct().count() < 5) {
            throw ApiException.badRequest("Password is too common or too simple");
        }
        if (username != null && lower.contains(username.toLowerCase(Locale.ROOT))) {
            throw ApiException.badRequest("Password must not contain the username");
        }
    }
}
