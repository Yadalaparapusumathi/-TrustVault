package com.trustvault.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentVersionRepository extends JpaRepository<DocumentVersion, UUID> {

    @Query("select v from DocumentVersion v join fetch v.uploadedBy where v.document.id = :documentId order by v.versionNo desc")
    List<DocumentVersion> findByDocument(@Param("documentId") UUID documentId);

    @Query("select v from DocumentVersion v where v.document.id = :documentId and v.versionNo = :versionNo")
    Optional<DocumentVersion> findByDocumentAndNo(@Param("documentId") UUID documentId, @Param("versionNo") int versionNo);
}
