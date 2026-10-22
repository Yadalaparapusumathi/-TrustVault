package com.trustvault.document;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditOutcome;
import com.trustvault.audit.AuditService;
import com.trustvault.common.ApiException;
import com.trustvault.security.AuthenticatedUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

/**
 * The one place that decides whether a user may act on a document. Every document endpoint calls
 * {@link #require} before touching data; search applies the equivalent predicate in SQL (DocumentSearchService).
 *
 * <p>Rules, all evaluated against the database at call time (no caching, so revocation is immediate):
 * <ul>
 *   <li>The owner has OWNER access.</li>
 *   <li>Anyone else needs an unrevoked, unexpired grant; READ or EDIT.</li>
 *   <li>Roles confer nothing here. An administrator is treated exactly like any other user.</li>
 *   <li>A trashed document exists only for its owner.</li>
 * </ul>
 * A caller with no access at all gets 404, indistinguishable from a missing document; a caller who can see the
 * document but lacks the level needed gets 403. Both are written to the audit trail as ACCESS_DENIED, and that
 * record survives the rollback of the request.
 */
@Service
public class DocumentAccessService {

    private final DocumentRepository documents;
    private final DocumentGrantRepository grants;
    private final AuditService audit;
    private final Clock clock;

    public DocumentAccessService(DocumentRepository documents, DocumentGrantRepository grants, AuditService audit,
                                 Clock clock) {
        this.documents = documents;
        this.grants = grants;
        this.audit = audit;
        this.clock = clock;
    }

    public record Authorized(Document document, Access access) {
    }

    /** Requires {@code required} on a document that is not in the trash. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Authorized require(UUID documentId, AuthenticatedUser user, Access required, String attemptedAction) {
        return check(documentId, user, required, attemptedAction, false);
    }

    /**
     * Like {@link #require} but also succeeds on a trashed document. Only the owner can ever pass this for a
     * trashed document, because grantees have no effective access to one.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Authorized requireIncludingTrash(UUID documentId, AuthenticatedUser user, Access required,
                                            String attemptedAction) {
        return check(documentId, user, required, attemptedAction, true);
    }

    /** Effective access without side effects; empty when the user has none. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Access> effectiveAccess(Document document, UUID userId) {
        if (document.getOwner().getId().equals(userId)) {
            return Optional.of(Access.OWNER);
        }
        if (document.isDeleted()) {
            return Optional.empty();
        }
        return grants.findEffective(document.getId(), userId, clock.instant()).map(g -> Access.of(g.getPermission()));
    }

    private Authorized check(UUID documentId, AuthenticatedUser user, Access required, String attemptedAction,
                             boolean allowTrashed) {
        Optional<Document> found = documents.findWithOwner(documentId);
        if (found.isEmpty()) {
            deny(documentId, user, required, attemptedAction, "no_such_document");
            throw notFound();
        }
        Document document = found.get();
        Optional<Access> access = effectiveAccess(document, user.id());
        if (access.isEmpty()) {
            deny(documentId, user, required, attemptedAction, "no_grant");
            throw notFound();
        }
        if (!access.get().covers(required)) {
            deny(documentId, user, required, attemptedAction, "insufficient_permission:" + access.get());
            throw ApiException.forbidden("You do not have " + required + " access to this document");
        }
        if (document.isDeleted() && !allowTrashed) {
            throw ApiException.conflict("The document is in the trash. Restore it first.");
        }
        return new Authorized(document, access.get());
    }

    private void deny(UUID documentId, AuthenticatedUser user, Access required, String attemptedAction, String reason) {
        audit.recordIndependently(AuditEntry.of(AuditAction.ACCESS_DENIED).actor(user).outcome(AuditOutcome.DENIED)
                .document(documentId).detail("attempted", attemptedAction).detail("required", required)
                .detail("reason", reason));
    }

    private static ApiException notFound() {
        return ApiException.notFound("Document not found");
    }
}
