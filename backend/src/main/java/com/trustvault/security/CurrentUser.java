package com.trustvault.security;

import com.trustvault.common.ApiException;
import com.trustvault.user.Role;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

public final class CurrentUser {

    private CurrentUser() {
    }

    public static Optional<AuthenticatedUser> find() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthenticatedUser user) {
            return Optional.of(user);
        }
        return Optional.empty();
    }

    public static AuthenticatedUser require() {
        return find().orElseThrow(() -> ApiException.unauthorized("Authentication required"));
    }

    public static AuthenticatedUser requireRole(Role role) {
        AuthenticatedUser user = require();
        if (!user.hasRole(role)) {
            throw ApiException.forbidden("This action requires the " + role + " role");
        }
        return user;
    }
}
