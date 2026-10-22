package com.trustvault.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** T-60..T-63: the assistant suggests, a person decides, and both are on the record. */
class SuggestionTest extends IntegrationTest {

    @Test
    @DisplayName("Suggestions never grant access; accepting one is an explicit, audited grant linked to the suggestion")
    void suggestionsNeverWidenAccess() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor colleague = actor(Role.VIEWER);
        UUID earlier = upload(owner, "Earlier", "Finance", "a.txt", text("a\n"));
        grant(owner, earlier, colleague, "READ");
        UUID doc = upload(owner, "Budget", "Finance", "b.txt", text("b\n"));

        JsonNode suggestions = body(perform(owner, post("/api/documents/{id}/suggestions", doc)));
        assertThat(suggestions.findValuesAsText("username")).contains(colleague.username());
        assertThat(status(colleague, get("/api/documents/{id}", doc))).isEqualTo(404);
        assertThat(countAudit("ACCESS_SUGGESTED", "SUCCESS", owner.id(), doc)).isEqualTo(1);

        String suggestionId = null;
        for (JsonNode s : suggestions) {
            if (s.get("user").get("username").asText().equals(colleague.username())) {
                suggestionId = s.get("id").asText();
            }
        }
        assertThat(status(owner, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", colleague.id(), "permission", "READ",
                        "suggestionId", suggestionId))))).isEqualTo(201);
        assertThat(status(colleague, get("/api/documents/{id}", doc))).isEqualTo(200);

        String details = appJdbc.queryForObject("select details from audit_events where action = 'GRANT_CREATED' "
                + "and document_id = ?", String.class, doc);
        assertThat(json.readTree(details).get("suggestionId").asText()).isEqualTo(suggestionId);
        assertThat(json.readTree(details).get("source").asText()).isEqualTo("SUGGESTION");
    }

    @Test
    @DisplayName("Suggestions only draw on the owner's own sharing and never re-suggest someone access was taken from")
    void suggestionsRespectHistory() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor otherOwner = actor(Role.OWNER);
        Actor revoked = actor(Role.VIEWER);
        Actor sharedByOthers = actor(Role.VIEWER);

        UUID earlier = upload(owner, "Earlier", "Legal", "a.txt", text("a\n"));
        UUID g = grant(owner, earlier, revoked, "READ");
        perform(owner, delete("/api/documents/{id}/grants/{g}", earlier, g));
        UUID theirs = upload(otherOwner, "Theirs", "Legal", "t.txt", text("t\n"));
        grant(otherOwner, theirs, sharedByOthers, "READ");

        UUID doc = upload(owner, "New", "Legal", "n.txt", text("n\n"));
        List<String> suggested = body(perform(owner, post("/api/documents/{id}/suggestions", doc)))
                .findValuesAsText("username");
        assertThat(suggested).doesNotContain(revoked.username(), sharedByOthers.username(), owner.username());
    }

    @Test
    @DisplayName("A suggestion id cannot be replayed on another document or for a different person")
    void suggestionIsBoundToDocumentAndPerson() throws Exception {
        Actor owner = actor(Role.OWNER);
        Actor colleague = actor(Role.VIEWER);
        Actor other = actor(Role.VIEWER);
        UUID earlier = upload(owner, "Earlier", "Ops", "a.txt", text("a\n"));
        grant(owner, earlier, colleague, "READ");
        UUID doc = upload(owner, "Doc", "Ops", "b.txt", text("b\n"));
        UUID otherDoc = upload(owner, "Other", "Ops", "c.txt", text("c\n"));
        String sid = body(perform(owner, post("/api/documents/{id}/suggestions", doc))).get(0).get("id").asText();

        assertThat(status(owner, post("/api/documents/{id}/grants", otherDoc).contentType("application/json")
                .content(toJson(Map.of("userId", colleague.id(), "permission", "READ", "suggestionId", sid)))))
                .isEqualTo(400);
        assertThat(status(owner, post("/api/documents/{id}/grants", doc).contentType("application/json")
                .content(toJson(Map.of("userId", other.id(), "permission", "READ", "suggestionId", sid)))))
                .isEqualTo(400);
        assertThat(status(other, get("/api/documents/{id}", doc))).isEqualTo(404);
    }
}
