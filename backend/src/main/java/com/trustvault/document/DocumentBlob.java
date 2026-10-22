package com.trustvault.document;

import com.trustvault.common.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

@Entity
@Table(name = "document_blobs")
public class DocumentBlob extends AssignedIdEntity {

    @Id
    @Column(name = "version_id")
    private UUID versionId;

    @Column(nullable = false)
    private byte[] ciphertext;

    protected DocumentBlob() {
    }

    public DocumentBlob(UUID versionId, byte[] ciphertext) {
        this.versionId = versionId;
        this.ciphertext = ciphertext;
    }

    @Override
    public UUID getId() {
        return versionId;
    }

    public byte[] getCiphertext() {
        return ciphertext;
    }
}
