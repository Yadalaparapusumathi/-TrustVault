package com.trustvault.audit;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

public record AuditEventView(long seq, Instant occurredAt, Actor actor, String action, String outcome,
                             String targetType, String targetId, UUID documentId, JsonNode details, String ip,
                             String userAgent, String requestId) {

    public record Actor(UUID id, String username, String role) {
    }
}
