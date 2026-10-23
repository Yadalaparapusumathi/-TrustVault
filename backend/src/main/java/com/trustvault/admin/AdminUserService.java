package com.trustvault.admin;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditOutcome;
import com.trustvault.audit.AuditService;
import com.trustvault.auth.PasswordPolicy;
import com.trustvault.auth.SessionService;
import com.trustvault.common.ApiException;
import com.trustvault.config.AppProperties;
import com.trustvault.document.DocumentGrantRepository;
import com.trustvault.document.DocumentRepository;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.suggest.AccessSuggestionRepository;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * User lifecycle. Administrators manage accounts but gain no document access through any of these operations,
 * including ownership transfer.
 */
@Service
public class AdminUserService {

    private final UserRepository users;
    private final DocumentRepository documents;
    private final DocumentGrantRepository grants;
    private final AccessSuggestionRepository suggestions;
    private final SessionService sessions;
    private final PasswordEncoder encoder;
    private final PasswordPolicy policy;
    private final AuditService audit;
    private final JdbcTemplate jdbc;
    private final AppProperties properties;
    private final Clock clock;

    public AdminUserService(UserRepository users, DocumentRepository documents, DocumentGrantRepository grants,
                            AccessSuggestionRepository suggestions, SessionService sessions, PasswordEncoder encoder,
                            PasswordPolicy policy, AuditService audit, JdbcTemplate jdbc, AppProperties properties,
                            Clock clock) {
        this.users = users;
        this.documents = documents;
        this.grants = grants;
        this.suggestions = suggestions;
        this.sessions = sessions;
        this.encoder = encoder;
        this.policy = policy;
        this.audit = audit;
        this.jdbc = jdbc;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AdminDtos.AdminUser> list() {
        Instant now = clock.instant();
        Map<UUID, Long> owned = new HashMap<>();
        jdbc.query("SELECT owner_id, count(*) AS n FROM documents GROUP BY owner_id",
                rs -> {
                    owned.put(rs.getObject("owner_id", UUID.class), rs.getLong("n"));
                });
        Map<UUID, Long> live = new HashMap<>();
        jdbc.query("SELECT user_id, count(*) AS n FROM user_sessions WHERE expires_at > ? AND last_seen_at > ? GROUP BY user_id",
                rs -> {
                    live.put(rs.getObject("user_id", UUID.class), rs.getLong("n"));
                }, Timestamp.from(now), Timestamp.from(now.minus(properties.security().sessionIdleTimeout())));
        return users.findByDeletedAtIsNullOrderByDisplayNameAsc().stream()
                .map(u -> view(u, owned.getOrDefault(u.getId(), 0L), live.getOrDefault(u.getId(), 0L)))
                .toList();
    }

    @Transactional
    public AdminDtos.AdminUser create(AdminDtos.CreateUserRequest request) {
        String username = request.username().trim().toLowerCase(java.util.Locale.ROOT);
        if (users.findByUsernameIgnoreCase(username).isPresent()) {
            throw ApiException.conflict("That username is taken");
        }
        policy.validate(request.temporaryPassword(), username);
        User user = new User(username, request.displayName().strip(), blankToNull(request.email()),
                encoder.encode(request.temporaryPassword()), request.role(), clock.instant());
        user.setMustChangePassword(true);
        users.saveAndFlush(user);
        audit.record(AuditEntry.of(AuditAction.USER_CREATED).target("USER", user.getId())
                .detail("username", username).detail("role", request.role()));
        return view(user, 0, 0);
    }

    @Transactional
    public AdminDtos.AdminUser update(AuthenticatedUser admin, UUID id, AdminDtos.UpdateUserRequest request) {
        User user = load(id);
        boolean self = user.getId().equals(admin.id());
        Instant now = clock.instant();

        if (request.displayName() != null || request.email() != null) {
            String displayName = request.displayName() == null ? user.getDisplayName() : request.displayName().strip();
            String email = request.email() == null ? user.getEmail() : blankToNull(request.email());
            if (!displayName.equals(user.getDisplayName()) || !Objects.equals(email, user.getEmail())) {
                user.setDisplayName(displayName);
                user.setEmail(email);
                audit.record(AuditEntry.of(AuditAction.USER_UPDATED).target("USER", id)
                        .detail("username", user.getUsername()).detail("displayName", displayName));
            }
        }
        if (request.role() != null && request.role() != user.getRole()) {
            if (self) {
                throw ApiException.badRequest("You cannot change your own role");
            }
            if (user.getRole() == Role.OWNER && documents.countByOwnerId(id) > 0) {
                throw ApiException.conflict("This user still owns documents. Transfer them to another owner first.");
            }
            Role previous = user.getRole();
            user.setRole(request.role());
            audit.record(AuditEntry.of(AuditAction.ROLE_CHANGED).target("USER", id)
                    .detail("username", user.getUsername()).detail("from", previous).detail("to", request.role()));
        }
        if (request.active() != null && request.active() != user.isActive()) {
            if (self) {
                throw ApiException.badRequest("You cannot deactivate your own account");
            }
            user.setActive(request.active());
            if (!request.active()) {
                int revoked = sessions.revokeAll(id);
                audit.record(AuditEntry.of(AuditAction.USER_DEACTIVATED).target("USER", id)
                        .detail("username", user.getUsername()).detail("sessionsRevoked", revoked));
            } else {
                audit.record(AuditEntry.of(AuditAction.USER_REACTIVATED).target("USER", id)
                        .detail("username", user.getUsername()));
            }
        }
        user.touch(now);
        users.flush();
        return view(user, documents.countByOwnerId(id), sessions.countLive(id));
    }

    @Transactional
    public void resetPassword(AuthenticatedUser admin, UUID id, String temporaryPassword) {
        User user = load(id);
        if (user.getId().equals(admin.id())) {
            throw ApiException.badRequest("Use change password for your own account");
        }
        policy.validate(temporaryPassword, user.getUsername());
        user.changePassword(encoder.encode(temporaryPassword), true, clock.instant());
        int revoked = sessions.revokeAll(id);
        audit.record(AuditEntry.of(AuditAction.PASSWORD_RESET).target("USER", id)
                .detail("username", user.getUsername()).detail("sessionsRevoked", revoked));
    }

    @Transactional
    public void revokeSessions(UUID id) {
        User user = load(id);
        int revoked = sessions.revokeAll(id);
        audit.record(AuditEntry.of(AuditAction.SESSIONS_REVOKED).target("USER", id)
                .detail("username", user.getUsername()).detail("sessionsRevoked", revoked));
    }

    @Transactional
    public void delete(AuthenticatedUser admin, UUID id) {
        User user;
        try {
            user = load(id);
            if (id.equals(admin.id())) {
                throw ApiException.badRequest("You cannot delete your own account");
            }
            if (documents.countByOwnerId(id) > 0) {
                throw ApiException.conflict("This user still owns documents, including trash. Transfer them to another owner first.");
            }
        } catch (ApiException e) {
            audit.recordIndependently(AuditEntry.of(AuditAction.USER_DELETED).outcome(AuditOutcome.DENIED)
                    .target("USER", id).detail("reason", e.getMessage()));
            throw e;
        }
        user.delete(clock.instant());
        int revoked = sessions.revokeAll(id);
        audit.record(AuditEntry.of(AuditAction.USER_DELETED).target("USER", id)
                .detail("username", user.getUsername()).detail("sessionsRevoked", revoked)
                .detail("reason", "account-removed-history-retained"));
    }

    /**
     * Hands a leaver's documents to another owner. Any grant the new owner previously held on those documents is
     * retired (ownership supersedes it) and pending suggestions are dropped. One audit row per document so each
     * document's own history shows the change.
     */
    @Transactional
    public AdminDtos.TransferResult transferDocuments(UUID fromId, UUID toId) {
        if (fromId.equals(toId)) {
            throw ApiException.badRequest("Source and target are the same user");
        }
        // Serialize deletion and ownership changes in a stable order, including both transfer participants.
        users.lockByIds(List.of(fromId, toId));
        User from = load(fromId);
        User to = users.findById(toId)
                .filter(u -> u.isActive() && u.getRole() == Role.OWNER)
                .orElseThrow(() -> ApiException.badRequest("The target must be an active user with the OWNER role"));
        List<UUID> ids = documents.findIdsByOwner(fromId);
        Instant now = clock.instant();
        for (UUID docId : ids) {
            grants.findLive(docId, toId).ifPresent(g -> g.revoke(to, now));
            suggestions.supersedePending(docId);
        }
        grants.flush();
        int count = documents.transferOwnership(from, to);
        for (UUID docId : ids) {
            audit.record(AuditEntry.of(AuditAction.OWNERSHIP_TRANSFERRED).document(docId)
                    .detail("from", from.getUsername()).detail("to", to.getUsername()));
        }
        return new AdminDtos.TransferResult(count);
    }

    private User load(UUID id) {
        return users.lockByIds(List.of(id)).stream().filter(u -> !u.isDeleted()).findFirst()
                .orElseThrow(() -> ApiException.notFound("User not found"));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static AdminDtos.AdminUser view(User u, long owned, long liveSessions) {
        return new AdminDtos.AdminUser(u.getId(), u.getUsername(), u.getDisplayName(), u.getRole(), u.getEmail(),
                u.isActive(), u.getLockedUntil(), u.getLastLoginAt(), u.getCreatedAt(), owned, liveSessions,
                u.isMustChangePassword());
    }
}
