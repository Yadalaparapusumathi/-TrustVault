package com.trustvault.auth;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditOutcome;
import com.trustvault.audit.AuditService;
import com.trustvault.common.ApiException;
import com.trustvault.config.AppProperties;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final SessionService sessions;
    private final AuditService audit;
    private final PasswordPolicy policy;
    private final AppProperties properties;
    private final Clock clock;
    /** Hash of a random value, checked for unknown users so response time does not reveal which usernames exist. */
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder encoder, SessionService sessions, AuditService audit,
                       PasswordPolicy policy, AppProperties properties, Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.sessions = sessions;
        this.audit = audit;
        this.policy = policy;
        this.properties = properties;
        this.clock = clock;
        this.dummyHash = encoder.encode(com.trustvault.common.Hashing.randomToken());
    }

    public sealed interface LoginResult permits LoginResult.Success, LoginResult.Failure {
        record Success(User user, SessionService.IssuedSession session) implements LoginResult {
        }

        record Failure() implements LoginResult {
        }
    }

    /** Never throws for bad credentials: the failure bookkeeping must commit. The caller turns Failure into 401. */
    @Transactional
    public LoginResult login(String username, String password, String ip, String userAgent) {
        Instant now = clock.instant();
        Optional<User> found = users.lockByUsername(username.trim());
        if (found.isEmpty()) {
            encoder.matches(password, dummyHash);
            audit.record(AuditEntry.of(AuditAction.LOGIN_FAILED).systemActor().outcome(AuditOutcome.FAILURE)
                    .target("USER", null).detail("attemptedUsername", sanitize(username)).detail("reason", "unknown_user"));
            return new LoginResult.Failure();
        }
        User user = found.get();
        boolean passwordOk = encoder.matches(password, user.getPasswordHash());
        String reason = null;
        if (!user.isActive()) {
            reason = "inactive";
        } else if (user.isLocked(now)) {
            reason = "locked";
        } else if (!passwordOk) {
            reason = "bad_password";
            user.recordFailedLogin(properties.security().maxFailedLogins(),
                    now.plus(properties.security().lockoutDuration()));
            if (user.isLocked(now)) {
                audit.record(AuditEntry.of(AuditAction.ACCOUNT_LOCKED).systemActor().outcome(AuditOutcome.FAILURE)
                        .target("USER", user.getId()).detail("username", user.getUsername())
                        .detail("lockedUntil", user.getLockedUntil().toString()));
            }
        }
        if (reason != null) {
            audit.record(AuditEntry.of(AuditAction.LOGIN_FAILED).systemActor().outcome(AuditOutcome.FAILURE)
                    .target("USER", user.getId()).detail("attemptedUsername", user.getUsername()).detail("reason", reason));
            return new LoginResult.Failure();
        }
        user.recordSuccessfulLogin(now);
        SessionService.IssuedSession session = sessions.create(user, ip, userAgent);
        audit.record(AuditEntry.of(AuditAction.LOGIN_SUCCESS).actor(user).target("USER", user.getId())
                .detail("sessionId", session.sessionId().toString()));
        return new LoginResult.Success(user, session);
    }

    @Transactional
    public void logout(AuthenticatedUser user) {
        sessions.revoke(user.sessionId());
        audit.record(AuditEntry.of(AuditAction.LOGOUT).target("USER", user.id()));
    }

    @Transactional
    public void changePassword(AuthenticatedUser caller, String currentPassword, String newPassword) {
        User user = users.lockByIds(List.of(caller.id())).stream().filter(User::isActive).findFirst()
                .orElseThrow(() -> {
                    audit.recordIndependently(AuditEntry.of(AuditAction.PASSWORD_CHANGED).outcome(AuditOutcome.DENIED)
                            .target("USER", caller.id()).detail("reason", "inactive_account"));
                    return ApiException.unauthorized("Authentication required");
                });
        if (!encoder.matches(currentPassword, user.getPasswordHash())) {
            audit.recordIndependently(AuditEntry.of(AuditAction.PASSWORD_CHANGED).outcome(AuditOutcome.FAILURE)
                    .target("USER", user.getId()).detail("reason", "wrong_current_password"));
            throw ApiException.badRequest("Current password is incorrect");
        }
        policy.validate(newPassword, user.getUsername());
        if (encoder.matches(newPassword, user.getPasswordHash())) {
            throw ApiException.badRequest("New password must differ from the current one");
        }
        user.changePassword(encoder.encode(newPassword), false, clock.instant());
        int revoked = sessions.revokeAllExcept(user.getId(), caller.sessionId());
        audit.record(AuditEntry.of(AuditAction.PASSWORD_CHANGED).target("USER", user.getId())
                .detail("otherSessionsRevoked", revoked));
    }

    @Transactional(readOnly = true)
    public AuthDtos.Me me(AuthenticatedUser caller) {
        return users.findById(caller.id()).map(AuthDtos.Me::of)
                .orElseThrow(() -> ApiException.unauthorized("Authentication required"));
    }

    private static String sanitize(String value) {
        String clean = value == null ? "" : value.replaceAll("\\p{Cntrl}", "");
        return clean.length() > 64 ? clean.substring(0, 64) : clean;
    }
}
