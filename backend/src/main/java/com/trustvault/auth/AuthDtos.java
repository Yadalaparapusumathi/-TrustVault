package com.trustvault.auth;

import com.trustvault.security.AuthenticatedUser;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(@NotBlank @Size(max = 64) String username, @NotBlank @Size(max = 128) String password) {
    }

    public record ChangePasswordRequest(@NotBlank @Size(max = 128) String currentPassword,
                                        @NotBlank @Size(max = 128) String newPassword) {
    }

    public record Me(UUID id, String username, String displayName, Role role, String email,
                     boolean mustChangePassword) {

        static Me of(User u) {
            return new Me(u.getId(), u.getUsername(), u.getDisplayName(), u.getRole(), u.getEmail(),
                    u.isMustChangePassword());
        }

        static Me of(AuthenticatedUser u, String email) {
            return new Me(u.id(), u.username(), u.displayName(), u.role(), email, u.mustChangePassword());
        }
    }
}
