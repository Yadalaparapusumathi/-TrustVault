package com.trustvault.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties(prefix = "trustvault")
public record AppProperties(
        @Valid @NotNull Security security,
        @Valid @NotNull Crypto crypto,
        @Valid @NotNull Upload upload,
        @Valid @NotNull Retention retention,
        @Valid @NotNull Seed seed) {

    public record Security(
            boolean cookieSecure,
            @NotNull Duration sessionIdleTimeout,
            @NotNull Duration sessionAbsoluteTimeout,
            @Min(1) int maxFailedLogins,
            @NotNull Duration lockoutDuration,
            @Min(1) int loginAttemptsPerIpPerWindow,
            @NotNull Duration loginWindow) {
    }

    public record Crypto(
            @NotBlank(message = "TV_MASTER_KEY must be set (32 random bytes, base64)") String masterKey,
            @NotBlank(message = "TV_AUDIT_HMAC_KEY must be set (>= 32 random bytes, base64)") String auditHmacKey) {
    }

    public record Upload(@Min(1) long maxBytes) {
    }

    public record Retention(@Min(1) int trashDays, @NotBlank String purgeCron) {
    }

    public record Seed(boolean enabled, String passwordAdmin, String passwordOwner, String passwordViewer) {
    }
}
