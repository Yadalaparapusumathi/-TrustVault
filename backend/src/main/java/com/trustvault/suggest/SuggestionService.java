package com.trustvault.suggest;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditService;
import com.trustvault.common.ApiException;
import com.trustvault.document.Access;
import com.trustvault.document.Document;
import com.trustvault.document.DocumentAccessService;
import com.trustvault.document.DocumentGrant;
import com.trustvault.document.DocumentGrantRepository;
import com.trustvault.document.Permission;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import com.trustvault.user.UserSummary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Access assistant. Recommends people an owner might want to share a document with, and explains why.
 *
 * <p>Design constraints, all deliberate:
 * <ul>
 *   <li>It never grants. Its output is a row in access_suggestions; only POST /grants by the owner changes access.</li>
 *   <li>It only learns from the calling owner's own sharing history, so a suggestion cannot reveal anything about
 *       documents the owner cannot already see (e.g. "Bob has the CFO's salary file").</li>
 *   <li>It is deterministic and explainable (a scoring rule, not an LLM), and no document content or metadata is
 *       sent to any third party.</li>
 *   <li>Every set of suggestions shown, and every acceptance or dismissal, is audited.</li>
 * </ul>
 */
@Service
public class SuggestionService {

    static final String ENGINE = "rule-based-v1";
    private static final int MAX_SUGGESTIONS = 5;
    private static final double MIN_SCORE = 0.15;
    private static final Set<String> STOPWORDS = Set.of("the", "and", "for", "with", "from", "draft", "final",
            "copy", "version", "document", "file", "new", "letter", "report");

    private final DocumentAccessService access;
    private final DocumentGrantRepository grants;
    private final AccessSuggestionRepository suggestions;
    private final UserRepository users;
    private final AuditService audit;
    private final ObjectMapper mapper;
    private final Clock clock;

    public SuggestionService(DocumentAccessService access, DocumentGrantRepository grants,
                             AccessSuggestionRepository suggestions, UserRepository users, AuditService audit,
                             ObjectMapper mapper, Clock clock) {
        this.access = access;
        this.grants = grants;
        this.suggestions = suggestions;
        this.users = users;
        this.audit = audit;
        this.mapper = mapper;
        this.clock = clock;
    }

    public record SuggestionView(UUID id, UserSummary user, Permission permission, double score, List<String> reasons,
                                 SuggestionStatus status) {
    }

    private static final class Candidate {
        final User user;
        int sharedTotal;
        int sameCategory;
        int sameCategoryEdit;
        final Set<String> similarNames = new LinkedHashSet<>();

        Candidate(User user) {
            this.user = user;
        }
    }

    @Transactional
    public List<SuggestionView> suggest(AuthenticatedUser caller, UUID documentId) {
        Document document = access.require(documentId, caller, Access.OWNER, "suggest").document();
        Instant now = clock.instant();

        Set<UUID> excluded = new HashSet<>();
        excluded.add(caller.id());
        grants.findActiveForDocument(documentId, now).forEach(g -> excluded.add(g.getGrantee().getId()));
        // Someone the owner deliberately removed from this document is not proposed again.
        excluded.addAll(grants.findPreviouslyRevokedGrantees(documentId));

        Set<String> targetTokens = tokens(document.getName());
        Map<UUID, Candidate> candidates = new LinkedHashMap<>();
        for (DocumentGrant g : grants.findActiveOnDocumentsOwnedBy(caller.id(), now)) {
            Document other = g.getDocument();
            User grantee = g.getGrantee();
            if (other.getId().equals(documentId) || excluded.contains(grantee.getId()) || !grantee.isActive()) {
                continue;
            }
            Candidate c = candidates.computeIfAbsent(grantee.getId(), id -> new Candidate(grantee));
            c.sharedTotal++;
            if (other.getCategory().equalsIgnoreCase(document.getCategory())) {
                c.sameCategory++;
                if (g.getPermission() == Permission.EDIT) {
                    c.sameCategoryEdit++;
                }
            }
            Set<String> overlap = new HashSet<>(tokens(other.getName()));
            overlap.retainAll(targetTokens);
            if (!overlap.isEmpty() && c.similarNames.size() < 3) {
                c.similarNames.add(other.getName());
            }
        }

        record Scored(Candidate candidate, double score, List<String> reasons) {
        }
        List<Scored> ranked = new ArrayList<>();
        for (Candidate c : candidates.values()) {
            double score = 0.5 * Math.min(c.sameCategory, 3) / 3.0
                    + 0.2 * Math.min(c.sharedTotal, 5) / 5.0
                    + (c.similarNames.isEmpty() ? 0 : 0.3);
            List<String> reasons = new ArrayList<>();
            if (c.sameCategory > 0) {
                reasons.add("Has access to " + c.sameCategory + " other '" + document.getCategory()
                        + "' document" + (c.sameCategory == 1 ? "" : "s") + " you own");
            }
            if (!c.similarNames.isEmpty()) {
                reasons.add("Has access to your similarly named document"
                        + (c.similarNames.size() == 1 ? " " : "s ")
                        + c.similarNames.stream().map(n -> "'" + n + "'").collect(Collectors.joining(", ")));
            }
            reasons.add("You currently share " + c.sharedTotal + " document" + (c.sharedTotal == 1 ? "" : "s")
                    + " with them");
            if (score >= MIN_SCORE) {
                ranked.add(new Scored(c, Math.min(score, 1.0), reasons));
            }
        }
        ranked.sort(Comparator.comparingDouble(Scored::score).reversed()
                .thenComparing(s -> s.candidate().user.getDisplayName()));

        suggestions.supersedePending(documentId);
        List<SuggestionView> result = new ArrayList<>();
        List<Map<String, Object>> auditList = new ArrayList<>();
        for (Scored s : ranked.subList(0, Math.min(MAX_SUGGESTIONS, ranked.size()))) {
            Permission permission = s.candidate().sameCategoryEdit * 2 > s.candidate().sameCategory
                    ? Permission.EDIT : Permission.READ;
            BigDecimal score = BigDecimal.valueOf(s.score()).setScale(3, RoundingMode.HALF_UP);
            AccessSuggestion row = new AccessSuggestion(document, s.candidate().user, permission, score,
                    toJson(s.reasons()), now);
            suggestions.save(row);
            result.add(view(row, s.reasons()));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("suggestionId", row.getId().toString());
            item.put("userId", s.candidate().user.getId().toString());
            item.put("username", s.candidate().user.getUsername());
            item.put("permission", permission.name());
            item.put("score", score);
            auditList.add(item);
        }
        suggestions.flush();
        audit.record(AuditEntry.of(AuditAction.ACCESS_SUGGESTED).document(documentId)
                .detail("engine", ENGINE).detail("suggestions", auditList));
        return result;
    }

    @Transactional
    public void dismiss(AuthenticatedUser caller, UUID documentId, UUID suggestionId) {
        access.require(documentId, caller, Access.OWNER, "dismiss_suggestion");
        AccessSuggestion suggestion = suggestions.findForDocument(suggestionId, documentId)
                .filter(s -> s.getStatus() == SuggestionStatus.PENDING)
                .orElseThrow(() -> ApiException.notFound("Suggestion not found"));
        suggestion.decide(SuggestionStatus.DISMISSED, users.getReferenceById(caller.id()), clock.instant());
        suggestions.flush();
        audit.record(AuditEntry.of(AuditAction.SUGGESTION_DISMISSED).document(documentId)
                .detail("suggestionId", suggestionId.toString())
                .detail("userId", suggestion.getSuggestedUser().getId().toString())
                .detail("username", suggestion.getSuggestedUser().getUsername())
                .detail("permission", suggestion.getPermission()));
    }

    private SuggestionView view(AccessSuggestion s, List<String> reasons) {
        return new SuggestionView(s.getId(), UserSummary.of(s.getSuggestedUser()), s.getPermission(),
                s.getScore().doubleValue(), reasons, s.getStatus());
    }

    static Set<String> tokens(String name) {
        return Arrays.stream(name.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .filter(t -> t.length() >= 4 && !STOPWORDS.contains(t) && !t.chars().allMatch(Character::isDigit))
                .collect(Collectors.toSet());
    }

    private String toJson(List<String> reasons) {
        try {
            return mapper.writeValueAsString(reasons);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
