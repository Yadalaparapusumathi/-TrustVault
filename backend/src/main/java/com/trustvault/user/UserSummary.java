package com.trustvault.user;

import java.util.UUID;

public record UserSummary(UUID id, String username, String displayName, Role role) {

    public static UserSummary of(User user) {
        return user == null ? null
                : new UserSummary(user.getId(), user.getUsername(), user.getDisplayName(), user.getRole());
    }
}
