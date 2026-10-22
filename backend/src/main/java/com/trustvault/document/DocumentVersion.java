package com.trustvault.document;

import com.trustvault.user.User;
import com.trustvault.common.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "document_versions")
public class DocumentVersion extends AssignedIdEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id")
    private Document document;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(nullable = false, length = 64)
    private String sha256;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "uploaded_by")
    private User uploadedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "wrapped_key", nullable = false)
    private byte[] wrappedKey;

    protected DocumentVersion() {
    }

    public DocumentVersion(UUID id, Document document, int versionNo, long sizeBytes, String contentType,
                           String originalFilename, String sha256, User uploadedBy, Instant createdAt,
                           byte[] wrappedKey) {
        this.id = id;
        this.document = document;
        this.versionNo = versionNo;
        this.sizeBytes = sizeBytes;
        this.contentType = contentType;
        this.originalFilename = originalFilename;
        this.sha256 = sha256;
        this.uploadedBy = uploadedBy;
        this.createdAt = createdAt;
        this.wrappedKey = wrappedKey;
    }

    public UUID getId() {
        return id;
    }

    public Document getDocument() {
        return document;
    }

    public int getVersionNo() {
        return versionNo;
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

    public User getUploadedBy() {
        return uploadedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public byte[] getWrappedKey() {
        return wrappedKey;
    }
}
