package com.trustvault.document;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface DocumentBlobRepository extends JpaRepository<DocumentBlob, UUID> {
}
