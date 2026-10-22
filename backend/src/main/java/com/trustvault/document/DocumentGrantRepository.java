package com.trustvault.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentGrantRepository extends JpaRepository<DocumentGrant, UUID> {

    /** The single query every per-document authorisation decision for a non-owner rests on. */
    @Query("""
            select g from DocumentGrant g
            where g.document.id = :documentId and g.grantee.id = :userId
              and g.revokedAt is null and (g.expiresAt is null or g.expiresAt > :now)
            """)
    Optional<DocumentGrant> findEffective(@Param("documentId") UUID documentId, @Param("userId") UUID userId,
                                          @Param("now") Instant now);

    /** Live row regardless of expiry; used when changing a grant so the partial unique index is respected. */
    @Query("select g from DocumentGrant g where g.document.id = :documentId and g.grantee.id = :userId and g.revokedAt is null")
    Optional<DocumentGrant> findLive(@Param("documentId") UUID documentId, @Param("userId") UUID userId);

    @Query("""
            select g from DocumentGrant g join fetch g.grantee join fetch g.grantedBy
            where g.document.id = :documentId and g.revokedAt is null and (g.expiresAt is null or g.expiresAt > :now)
            order by g.createdAt
            """)
    List<DocumentGrant> findActiveForDocument(@Param("documentId") UUID documentId, @Param("now") Instant now);

    @Query("""
            select g from DocumentGrant g
            where g.grantee.id = :userId and g.document.id in :documentIds
              and g.revokedAt is null and (g.expiresAt is null or g.expiresAt > :now)
            """)
    List<DocumentGrant> findEffectiveForUser(@Param("userId") UUID userId,
                                             @Param("documentIds") Collection<UUID> documentIds,
                                             @Param("now") Instant now);

    @Query("""
            select g from DocumentGrant g join fetch g.grantee join fetch g.document d
            where d.owner.id = :ownerId and d.deletedAt is null and g.revokedAt is null
              and (g.expiresAt is null or g.expiresAt > :now)
            """)
    List<DocumentGrant> findActiveOnDocumentsOwnedBy(@Param("ownerId") UUID ownerId, @Param("now") Instant now);

    @Query("select distinct g.grantee.id from DocumentGrant g where g.document.id = :documentId and g.revokedAt is not null")
    List<UUID> findPreviouslyRevokedGrantees(@Param("documentId") UUID documentId);

    @Query("select count(g) from DocumentGrant g where g.revokedAt is null and (g.expiresAt is null or g.expiresAt > :now)")
    long countActive(@Param("now") Instant now);
}
