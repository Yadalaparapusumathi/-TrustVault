package com.trustvault.user;

public enum Role {
    ADMIN, OWNER, VIEWER;

    public String authority() {
        return "ROLE_" + name();
    }
}
