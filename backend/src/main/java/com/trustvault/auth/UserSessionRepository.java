package com.trustvault.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

    @Query("select s from UserSession s join fetch s.user where s.tokenHash = :hash")
    Optional<UserSession> findByTokenHashWithUser(@Param("hash") String hash);

    @Modifying
    @Query("delete from UserSession s where s.user.id = :userId")
    int deleteAllForUser(@Param("userId") UUID userId);

    @Modifying
    @Query("delete from UserSession s where s.user.id = :userId and s.id <> :keep")
    int deleteAllForUserExcept(@Param("userId") UUID userId, @Param("keep") UUID keep);

    @Modifying
    @Query("delete from UserSession s where s.expiresAt < :now or s.lastSeenAt < :idleCutoff")
    int deleteExpired(@Param("now") Instant now, @Param("idleCutoff") Instant idleCutoff);

    @Query("select count(s) from UserSession s where s.user.id = :userId and s.expiresAt > :now and s.lastSeenAt > :idleCutoff")
    long countLive(@Param("userId") UUID userId, @Param("now") Instant now, @Param("idleCutoff") Instant idleCutoff);
}
