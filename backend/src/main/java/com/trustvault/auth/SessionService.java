package com.trustvault.auth;

import com.trustvault.common.Hashing;
import com.trustvault.config.AppProperties;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.user.User;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Server-side sessions. The browser holds a random 256-bit token; the database holds only its SHA-256, so a
 * database leak does not yield usable sessions. Every request is checked against this table, which is what makes
 * logout, deactivation and "revoke sessions" immediate. The cost is one indexed lookup per request.
 */
@Service
public class SessionService {

    private static final Duration LAST_SEEN_RESOLUTION = Duration.ofSeconds(60);

    private final UserSessionRepository sessions;
    private final AppProperties properties;
    private final Clock clock;

    public SessionService(UserSessionRepository sessions, AppProperties properties, Clock clock) {
        this.sessions = sessions;
        this.properties = properties;
        this.clock = clock;
    }

    public record IssuedSession(String token, UUID sessionId) {
    }

    @Transactional
    public IssuedSession create(User user, String ip, String userAgent) {
        String token = Hashing.randomToken();
        Instant now = clock.instant();
        UserSession session = new UserSession(hash(token), user, now,
                now.plus(properties.security().sessionAbsoluteTimeout()), ip, userAgent);
        sessions.save(session);
        return new IssuedSession(token, session.getId());
    }

    @Transactional
    public Optional<AuthenticatedUser> authenticate(String token) {
        Optional<UserSession> found = sessions.findByTokenHashWithUser(hash(token));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        UserSession session = found.get();
        Instant now = clock.instant();
        User user = session.getUser();
        boolean expired = !session.getExpiresAt().isAfter(now)
                || !session.getLastSeenAt().plus(properties.security().sessionIdleTimeout()).isAfter(now);
        if (expired || !user.isActive()) {
            sessions.delete(session);
            return Optional.empty();
        }
        if (Duration.between(session.getLastSeenAt(), now).compareTo(LAST_SEEN_RESOLUTION) > 0) {
            session.setLastSeenAt(now);
        }
        return Optional.of(new AuthenticatedUser(user.getId(), user.getUsername(), user.getDisplayName(),
                user.getRole(), user.isMustChangePassword(), session.getId()));
    }

    @Transactional
    public void revoke(UUID sessionId) {
        sessions.deleteById(sessionId);
    }

    @Transactional
    public int revokeAll(UUID userId) {
        return sessions.deleteAllForUser(userId);
    }

    @Transactional
    public int revokeAllExcept(UUID userId, UUID keepSessionId) {
        return sessions.deleteAllForUserExcept(userId, keepSessionId);
    }

    @Transactional(readOnly = true)
    public long countLive(UUID userId) {
        Instant now = clock.instant();
        return sessions.countLive(userId, now, now.minus(properties.security().sessionIdleTimeout()));
    }

    @Scheduled(fixedDelayString = "PT10M", initialDelayString = "PT1M")
    @Transactional
    public void purgeExpired() {
        Instant now = clock.instant();
        sessions.deleteExpired(now, now.minus(properties.security().sessionIdleTimeout()));
    }

    private static String hash(String token) {
        return Hashing.sha256Hex(token.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }
}
