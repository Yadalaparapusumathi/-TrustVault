package com.trustvault.admin;

import com.trustvault.user.Role;
import com.trustvault.user.UserSummary;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AdminDtos {

    private AdminDtos() {
    }

    public record AdminUser(UUID id, String username, String displayName, Role role, String email, boolean active,
                            Instant lockedUntil, Instant lastLoginAt, Instant createdAt, long ownedDocuments,
                            long activeSessions, boolean mustChangePassword) {
    }

    public record CreateUserRequest(
            @NotBlank @Pattern(regexp = "^[a-z0-9][a-z0-9._-]{2,63}$",
                    message = "3-64 lowercase letters, digits, '.', '_' or '-'") String username,
            @NotBlank @Size(max = 120) String displayName,
            @Email @Size(max = 254) String email,
            @NotNull Role role,
            @NotBlank @Size(max = 128) String temporaryPassword) {
    }

    public record UpdateUserRequest(@Size(min = 1, max = 120) String displayName, @Email @Size(max = 254) String email,
                                    Role role, Boolean active) {
    }

    public record ResetPasswordRequest(@NotBlank @Size(max = 128) String temporaryPassword) {
    }

    public record TransferRequest(@NotNull UUID toUserId) {
    }

    public record TransferResult(int transferred) {
    }

    public record Totals(long users, long activeUsers, long documents, long trashedDocuments, long activeGrants,
                         long events24h, long denied24h, long downloads24h) {
    }

    public record Alert(String severity, String type, String message, UserSummary actor, long count, Instant since) {
    }

    public record DayActivity(String date, long uploads, long downloads, long denied, long permissionChanges) {
    }

    public record Dashboard(Totals totals, List<Alert> alerts, List<DayActivity> activityByDay,
                            List<com.trustvault.audit.AuditEventView> recentPermissionChanges,
                            List<com.trustvault.audit.AuditEventView> recentDenied,
                            com.trustvault.audit.IntegrityReport integrity) {
    }
}
