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
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "documents")
public class Document extends AssignedIdEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false, length = 50)
    private String category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Classification classification;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id")
    private User owner;

    @Column(name = "current_version", nullable = false)
    private int currentVersion;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deleted_by")
    private User deletedBy;

    @Column(name = "purge_after")
    private Instant purgeAfter;

    @Version
    @Column(name = "lock_version", nullable = false)
    private long lockVersion;

    protected Document() {
    }

    public Document(String name, String description, String category, Classification classification, User owner,
                    Instant now) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.description = description;
        this.category = category;
        this.classification = classification;
        this.owner = owner;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void applyVersion(DocumentVersion version, Instant now) {
        this.currentVersion = version.getVersionNo();
        this.sizeBytes = version.getSizeBytes();
        this.contentType = version.getContentType();
        this.originalFilename = version.getOriginalFilename();
        this.sha256 = version.getSha256();
        this.updatedAt = now;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void moveToTrash(User by, Instant now, Instant purgeAfter) {
        this.deletedAt = now;
        this.deletedBy = by;
        this.purgeAfter = purgeAfter;
        this.updatedAt = now;
    }

    public void restore(Instant now) {
        this.deletedAt = null;
        this.deletedBy = null;
        this.purgeAfter = null;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Classification getClassification() {
        return classification;
    }

    public void setClassification(Classification classification) {
        this.classification = classification;
    }

    public User getOwner() {
        return owner;
    }

    public void setOwner(User owner) {
        this.owner = owner;
    }

    public int getCurrentVersion() {
        return currentVersion;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getContentType() {
        return contentType;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getSha256() {
        return sha256;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public Instant getPurgeAfter() {
        return purgeAfter;
    }

    public long getLockVersion() {
        return lockVersion;
    }
}
