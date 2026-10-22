package com.trustvault.suggest;

import com.trustvault.security.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents/{documentId}/suggestions")
public class SuggestionController {

    private final SuggestionService service;

    public SuggestionController(SuggestionService service) {
        this.service = service;
    }

    @PostMapping
    public List<SuggestionService.SuggestionView> suggest(@PathVariable UUID documentId) {
        return service.suggest(CurrentUser.require(), documentId);
    }

    @PostMapping("/{suggestionId}/dismiss")
    public ResponseEntity<Void> dismiss(@PathVariable UUID documentId, @PathVariable UUID suggestionId) {
        service.dismiss(CurrentUser.require(), documentId, suggestionId);
        return ResponseEntity.noContent().build();
    }
}
