package com.trustvault.suggest;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface AccessSuggestionRepository extends JpaRepository<AccessSuggestion, UUID> {

    @Modifying
    @Query("update AccessSuggestion s set s.status = com.trustvault.suggest.SuggestionStatus.SUPERSEDED "
            + "where s.document.id = :documentId and s.status = com.trustvault.suggest.SuggestionStatus.PENDING")
    int supersedePending(@Param("documentId") UUID documentId);

    @Query("select s from AccessSuggestion s join fetch s.suggestedUser where s.id = :id and s.document.id = :documentId")
    Optional<AccessSuggestion> findForDocument(@Param("id") UUID id, @Param("documentId") UUID documentId);
}
