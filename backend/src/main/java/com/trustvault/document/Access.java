package com.trustvault.document;

/** Effective access of one user to one document, ordered weakest to strongest. */
public enum Access {
    READ, EDIT, OWNER;

    public boolean covers(Access required) {
        return this.ordinal() >= required.ordinal();
    }

    static Access of(Permission permission) {
        return permission == Permission.EDIT ? EDIT : READ;
    }
}
