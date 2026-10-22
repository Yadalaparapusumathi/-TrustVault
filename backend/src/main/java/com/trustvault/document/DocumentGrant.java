package com.trustvault.document;

import com.trustvault.user.User;
import com.trustvault.common.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A named person's access to one document. Revocation is a timestamp, not a delete, so history survives. */
@Entity
@Table(name = "document_grants")
public class DocumentGrant extends AssignedIdEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id")
    private Document document;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "grantee_id")
    private User grantee;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private Permission permission;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "granted_by")
    private User grantedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GrantSource source;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "revoked_by")
    private User revokedBy;

    protected DocumentGrant() {
    }

    public DocumentGrant(Document document, User grantee, Permission permission, User grantedBy, GrantSource source,
                         Instant expiresAt, Instant now) {
        this.id = UUID.randomUUID();
        this.document = document;
        this.grantee = grantee;
        this.permission = permission;
        this.grantedBy = grantedBy;
        this.source = source;
        this.expiresAt = expiresAt;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(Permission permission, Instant expiresAt, User by, GrantSource source, Instant now) {
        this.permission = permission;
        this.expiresAt = expiresAt;
        this.grantedBy = by;
        this.source = source;
        this.updatedAt = now;
    }

    public void revoke(User by, Instant now) {
        this.revokedAt = now;
        this.revokedBy = by;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public Document getDocument() {
        return document;
    }

    public User getGrantee() {
        return grantee;
    }

    public Permission getPermission() {
        return permission;
    }

    public User getGrantedBy() {
        return grantedBy;
    }

    public GrantSource getSource() {
        return source;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
