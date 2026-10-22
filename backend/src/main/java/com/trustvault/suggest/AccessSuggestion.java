package com.trustvault.suggest;

import com.trustvault.common.AssignedIdEntity;
import com.trustvault.document.Document;
import com.trustvault.document.Permission;
import com.trustvault.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** A recommendation shown to an owner. It carries no access by itself; only a grant does. */
@Entity
@Table(name = "access_suggestions")
public class AccessSuggestion extends AssignedIdEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id")
    private Document document;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "suggested_user_id")
    private User suggestedUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private Permission permission;

    @Column(nullable = false, precision = 4, scale = 3)
    private BigDecimal score;

    /** JSON array of human-readable reasons. */
    @Column(nullable = false)
    private String reasons;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SuggestionStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by")
    private User decidedBy;

    protected AccessSuggestion() {
    }

    public AccessSuggestion(Document document, User suggestedUser, Permission permission, BigDecimal score,
                            String reasons, Instant now) {
        this.id = UUID.randomUUID();
        this.document = document;
        this.suggestedUser = suggestedUser;
        this.permission = permission;
        this.score = score;
        this.reasons = reasons;
        this.status = SuggestionStatus.PENDING;
        this.createdAt = now;
    }

    public void decide(SuggestionStatus outcome, User by, Instant now) {
        this.status = outcome;
        this.decidedBy = by;
        this.decidedAt = now;
    }

    @Override
    public UUID getId() {
        return id;
    }

    public Document getDocument() {
        return document;
    }

    public User getSuggestedUser() {
        return suggestedUser;
    }

    public Permission getPermission() {
        return permission;
    }

    public BigDecimal getScore() {
        return score;
    }

    public String getReasons() {
        return reasons;
    }

    public SuggestionStatus getStatus() {
        return status;
    }
}
