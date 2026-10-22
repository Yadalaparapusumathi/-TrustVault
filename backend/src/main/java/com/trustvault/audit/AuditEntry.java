package com.trustvault.audit;

import com.trustvault.security.AuthenticatedUser;
import com.trustvault.security.CurrentUser;
import com.trustvault.user.User;

import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/** Mutable builder for one audit row. The actor defaults to the authenticated caller; null means the system. */
public final class AuditEntry {

    final AuditAction action;
    AuditOutcome outcome = AuditOutcome.SUCCESS;
    UUID actorId;
    String actorUsername;
    String actorRole;
    String targetType;
    String targetId;
    UUID documentId;
    final Map<String, Object> details = new TreeMap<>();

    private AuditEntry(AuditAction action) {
        this.action = action;
        CurrentUser.find().ifPresent(this::actor);
    }

    public static AuditEntry of(AuditAction action) {
        return new AuditEntry(action);
    }

    public AuditEntry outcome(AuditOutcome outcome) {
        this.outcome = outcome;
        return this;
    }

    public AuditEntry actor(AuthenticatedUser user) {
        this.actorId = user.id();
        this.actorUsername = user.username();
        this.actorRole = user.role().name();
        return this;
    }

    public AuditEntry actor(User user) {
        this.actorId = user.getId();
        this.actorUsername = user.getUsername();
        this.actorRole = user.getRole().name();
        return this;
    }

    public AuditEntry systemActor() {
        this.actorId = null;
        this.actorUsername = null;
        this.actorRole = null;
        return this;
    }

    public AuditEntry document(UUID documentId) {
        this.documentId = documentId;
        this.targetType = "DOCUMENT";
        this.targetId = documentId == null ? null : documentId.toString();
        return this;
    }

    public AuditEntry target(String type, Object id) {
        this.targetType = type;
        String value = id == null ? null : id.toString();
        this.targetId = value != null && value.length() > 64 ? value.substring(0, 64) : value;
        return this;
    }

    public AuditEntry detail(String key, Object value) {
        if (value != null) {
            details.put(key, value instanceof Enum<?> e ? e.name() : value);
        }
        return this;
    }
}
