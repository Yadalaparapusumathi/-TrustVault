package com.trustvault.security;

import com.trustvault.user.Role;

import java.util.UUID;

/**
 * The caller, as freshly loaded from the database for this request. Never cached across requests, which is what
 * makes deactivation and role changes take effect immediately.
 */
public record AuthenticatedUser(UUID id, String username, String displayName, Role role, boolean mustChangePassword,
                                UUID sessionId) {

    public boolean hasRole(Role required) {
        return role == required;
    }
}
