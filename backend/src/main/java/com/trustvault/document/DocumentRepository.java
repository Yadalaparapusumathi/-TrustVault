package com.trustvault.document;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<Document, UUID>, JpaSpecificationExecutor<Document> {

    @Query("select d from Document d join fetch d.owner where d.id = :id")
    java.util.Optional<Document> findWithOwner(@Param("id") UUID id);

    @Query("select d.id from Document d where d.deletedAt is not null and d.purgeAfter < :now")
    List<UUID> findDueForPurge(@Param("now") Instant now);

    long countByOwnerId(UUID ownerId);

    long countByDeletedAtIsNull();

    long countByDeletedAtIsNotNull();

    @Modifying
    @Query("update Document d set d.owner = :to, d.lockVersion = d.lockVersion + 1 where d.owner = :from")
    int transferOwnership(@Param("from") com.trustvault.user.User from, @Param("to") com.trustvault.user.User to);

    @Query("select d.id from Document d where d.owner.id = :ownerId")
    List<UUID> findIdsByOwner(@Param("ownerId") UUID ownerId);

    @Query("""
            select distinct d.category from Document d
            where d.deletedAt is null
              and (d.owner.id = :userId or exists (
                    select g.id from DocumentGrant g where g.document = d and g.grantee.id = :userId
                    and g.revokedAt is null and (g.expiresAt is null or g.expiresAt > :now)))
            order by d.category
            """)
    List<String> findAccessibleCategories(@Param("userId") UUID userId, @Param("now") Instant now);
}
