package com.trustvault.document;

import com.trustvault.common.ApiException;
import com.trustvault.common.Like;
import com.trustvault.common.PageResponse;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.user.User;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Search never fetches a document and then filters it in Java: the "can this user see it" predicate is part of the
 * WHERE clause, so counts, pages and sort order are computed over accessible rows only and nothing else is ever
 * loaded for the caller.
 */
@Service
public class DocumentSearchService {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt", "updatedAt", "sizeBytes");
    private static final int MAX_PAGE_SIZE = 100;

    private final DocumentRepository documents;
    private final DocumentGrantRepository grants;
    private final Clock clock;

    public DocumentSearchService(DocumentRepository documents, DocumentGrantRepository grants, Clock clock) {
        this.documents = documents;
        this.grants = grants;
        this.clock = clock;
    }

    public enum Scope {
        ALL, OWNED, SHARED, TRASH;

        static Scope parse(String raw) {
            if (raw == null || raw.isBlank()) {
                return ALL;
            }
            try {
                return valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Unknown scope: use all, owned, shared or trash");
            }
        }
    }

    public record Criteria(String q, String owner, String category, Classification classification, LocalDate from,
                           LocalDate to, String scope, int page, int size, String sort) {
    }

    @Transactional(readOnly = true)
    public PageResponse<DocumentDtos.DocumentSummary> search(AuthenticatedUser caller, Criteria c) {
        Instant now = clock.instant();
        UUID me = caller.id();
        Scope scope = Scope.parse(c.scope());
        if (c.from() != null && c.to() != null && c.from().isAfter(c.to())) {
            throw ApiException.badRequest("'from' must not be after 'to'");
        }
        int size = Math.min(Math.max(c.size(), 1), MAX_PAGE_SIZE);
        int page = Math.max(c.page(), 0);

        Specification<Document> spec = (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();
            Join<Document, User> owner = ownerJoin(root, query);
            Predicate isOwner = cb.equal(owner.get("id"), me);
            Predicate hasGrant = cb.exists(activeGrantSubquery(root, query, cb, me, now));
            switch (scope) {
                case ALL -> {
                    where.add(cb.isNull(root.get("deletedAt")));
                    where.add(cb.or(isOwner, hasGrant));
                }
                case OWNED -> {
                    where.add(cb.isNull(root.get("deletedAt")));
                    where.add(isOwner);
                }
                case SHARED -> {
                    where.add(cb.isNull(root.get("deletedAt")));
                    where.add(cb.not(isOwner));
                    where.add(hasGrant);
                }
                case TRASH -> {
                    where.add(cb.isNotNull(root.get("deletedAt")));
                    where.add(isOwner);
                }
            }
            if (notBlank(c.q())) {
                where.add(cb.like(cb.lower(root.get("name")), Like.contains(c.q()), '\\'));
            }
            if (notBlank(c.owner())) {
                String pattern = Like.contains(c.owner());
                where.add(cb.or(cb.like(cb.lower(owner.get("username")), pattern, '\\'),
                        cb.like(cb.lower(owner.get("displayName")), pattern, '\\')));
            }
            if (notBlank(c.category())) {
                where.add(cb.equal(cb.lower(root.get("category")), c.category().trim().toLowerCase(java.util.Locale.ROOT)));
            }
            if (c.classification() != null) {
                where.add(cb.equal(root.get("classification"), c.classification()));
            }
            if (c.from() != null) {
                where.add(cb.greaterThanOrEqualTo(root.get("createdAt"), c.from().atStartOfDay().toInstant(ZoneOffset.UTC)));
            }
            if (c.to() != null) {
                where.add(cb.lessThan(root.get("createdAt"), c.to().plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));
            }
            return cb.and(where.toArray(Predicate[]::new));
        };

        Page<Document> result = documents.findAll(spec, PageRequest.of(page, size, parseSort(c.sort())));
        Map<UUID, Access> accessById = accessFor(me, result.getContent(), now);
        return PageResponse.of(result, d -> DocumentDtos.DocumentSummary.of(d, accessById.get(d.getId())));
    }

    @Transactional(readOnly = true)
    public List<String> categories(AuthenticatedUser caller) {
        return documents.findAccessibleCategories(caller.id(), clock.instant());
    }

    /** Fetch-join the owner for the page query (avoids N+1); plain join for the count query. */
    @SuppressWarnings("unchecked")
    private static Join<Document, User> ownerJoin(Root<Document> root, jakarta.persistence.criteria.CriteriaQuery<?> query) {
        boolean countQuery = query != null
                && (Long.class == query.getResultType() || long.class == query.getResultType());
        return countQuery ? root.join("owner", JoinType.INNER)
                : (Join<Document, User>) root.<Document, User>fetch("owner", JoinType.INNER);
    }

    private static Subquery<UUID> activeGrantSubquery(Root<Document> root, jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                      jakarta.persistence.criteria.CriteriaBuilder cb, UUID me, Instant now) {
        Subquery<UUID> sub = query.subquery(UUID.class);
        Root<DocumentGrant> g = sub.from(DocumentGrant.class);
        sub.select(g.get("id")).where(
                cb.equal(g.get("document"), root),
                cb.equal(g.get("grantee").get("id"), me),
                cb.isNull(g.get("revokedAt")),
                cb.or(cb.isNull(g.get("expiresAt")), cb.greaterThan(g.get("expiresAt"), now)));
        return sub;
    }

    private Map<UUID, Access> accessFor(UUID me, List<Document> page, Instant now) {
        List<UUID> notOwned = page.stream().filter(d -> !d.getOwner().getId().equals(me)).map(Document::getId).toList();
        Map<UUID, Access> map = notOwned.isEmpty() ? new java.util.HashMap<>()
                : grants.findEffectiveForUser(me, notOwned, now).stream()
                .collect(Collectors.toMap(g -> g.getDocument().getId(), g -> Access.of(g.getPermission()),
                        (a, b) -> a, java.util.HashMap::new));
        page.stream().filter(d -> d.getOwner().getId().equals(me)).forEach(d -> map.put(d.getId(), Access.OWNER));
        return map;
    }

    private static Sort parseSort(String raw) {
        if (raw == null || raw.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "updatedAt");
        }
        String[] parts = raw.split(",");
        String field = parts[0].trim();
        if (!SORTABLE.contains(field)) {
            throw ApiException.badRequest("Cannot sort by '" + field + "'");
        }
        Sort.Direction direction = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        return Sort.by(direction, field).and(Sort.by(Sort.Direction.ASC, "id"));
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
