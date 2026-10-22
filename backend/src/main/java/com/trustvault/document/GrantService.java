package com.trustvault.document;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditService;
import com.trustvault.common.ApiException;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.suggest.AccessSuggestion;
import com.trustvault.suggest.AccessSuggestionRepository;
import com.trustvault.suggest.SuggestionStatus;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Grants are created, changed and revoked only by the document's owner. There is no re-sharing: an EDIT grantee
 * cannot pass access on. Revocation stamps the row; the next request by the grantee re-reads grants and fails.
 */
@Service
public class GrantService {

    private final DocumentAccessService access;
    private final DocumentGrantRepository grants;
    private final UserRepository users;
    private final AccessSuggestionRepository suggestions;
    private final AuditService audit;
    private final Clock clock;

    public GrantService(DocumentAccessService access, DocumentGrantRepository grants, UserRepository users,
                        AccessSuggestionRepository suggestions, AuditService audit, Clock clock) {
        this.access = access;
        this.grants = grants;
        this.users = users;
        this.suggestions = suggestions;
        this.audit = audit;
        this.clock = clock;
    }

    public record GrantResult(DocumentDtos.GrantView grant, boolean created) {
    }

    @Transactional
    public List<DocumentDtos.GrantView> list(AuthenticatedUser caller, UUID documentId) {
        access.require(documentId, caller, Access.OWNER, "list_grants");
        return grants.findActiveForDocument(documentId, clock.instant()).stream()
                .map(DocumentDtos.GrantView::of).toList();
    }

    @Transactional
    public GrantResult grant(AuthenticatedUser caller, UUID documentId, DocumentDtos.GrantRequest request) {
        Document document = access.require(documentId, caller, Access.OWNER, "grant").document();
        Instant now = clock.instant();
        if (request.userId().equals(caller.id()) || request.userId().equals(document.getOwner().getId())) {
            throw ApiException.badRequest("The owner already has full access");
        }
        User grantee = users.findById(request.userId())
                .filter(User::isActive)
                .orElseThrow(() -> ApiException.badRequest("No active user with that id"));
        if (request.expiresAt() != null && !request.expiresAt().isAfter(now)) {
            throw ApiException.badRequest("Expiry must be in the future");
        }

        GrantSource source = GrantSource.MANUAL;
        AccessSuggestion suggestion = null;
        if (request.suggestionId() != null) {
            suggestion = suggestions.findForDocument(request.suggestionId(), documentId)
                    .filter(s -> s.getStatus() == SuggestionStatus.PENDING)
                    .filter(s -> s.getSuggestedUser().getId().equals(grantee.getId()))
                    .orElseThrow(() -> ApiException.badRequest("The suggestion is not pending for this person"));
            source = GrantSource.SUGGESTION;
        }

        User owner = users.getReferenceById(caller.id());
        Optional<DocumentGrant> live = grants.findLive(documentId, grantee.getId());
        DocumentGrant grant;
        boolean created;
        AuditEntry entry;
        if (live.isPresent()) {
            grant = live.get();
            entry = AuditEntry.of(AuditAction.GRANT_UPDATED).document(documentId)
                    .detail("previousPermission", grant.getPermission())
                    .detail("previousExpiresAt", grant.getExpiresAt() == null ? null : grant.getExpiresAt().toString());
            grant.update(request.permission(), request.expiresAt(), owner, source, now);
            created = false;
        } else {
            grant = new DocumentGrant(document, grantee, request.permission(), owner, source, request.expiresAt(), now);
            grants.save(grant);
            entry = AuditEntry.of(AuditAction.GRANT_CREATED).document(documentId);
            created = true;
        }
        grants.flush();
        if (suggestion != null) {
            suggestion.decide(SuggestionStatus.ACCEPTED, owner, now);
        }
        audit.record(entry.detail("grantId", grant.getId().toString())
                .detail("granteeId", grantee.getId().toString()).detail("grantee", grantee.getUsername())
                .detail("permission", request.permission())
                .detail("expiresAt", request.expiresAt() == null ? null : request.expiresAt().toString())
                .detail("source", source)
                .detail("suggestionId", suggestion == null ? null : suggestion.getId().toString()));
        return new GrantResult(DocumentDtos.GrantView.of(grant), created);
    }

    @Transactional
    public void revoke(AuthenticatedUser caller, UUID documentId, UUID grantId) {
        access.require(documentId, caller, Access.OWNER, "revoke");
        DocumentGrant grant = grants.findById(grantId)
                .filter(g -> g.getDocument().getId().equals(documentId) && g.getRevokedAt() == null)
                .orElseThrow(() -> ApiException.notFound("Grant not found"));
        grant.revoke(users.getReferenceById(caller.id()), clock.instant());
        grants.flush();
        audit.record(AuditEntry.of(AuditAction.GRANT_REVOKED).document(documentId)
                .detail("grantId", grantId.toString())
                .detail("granteeId", grant.getGrantee().getId().toString())
                .detail("grantee", grant.getGrantee().getUsername())
                .detail("permission", grant.getPermission()));
    }
}
