package com.trustvault.document;

import com.trustvault.audit.AuditEventView;
import com.trustvault.common.PageResponse;
import com.trustvault.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** HTTP surface only. Every authorisation decision is delegated to the services, which call DocumentAccessService. */
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documents;
    private final DocumentSearchService search;
    private final GrantService grants;

    public DocumentController(DocumentService documents, DocumentSearchService search, GrantService grants) {
        this.documents = documents;
        this.search = search;
        this.grants = grants;
    }

    @GetMapping
    public PageResponse<DocumentDtos.DocumentSummary> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String owner,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Classification classification,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String scope,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return search.search(CurrentUser.require(),
                new DocumentSearchService.Criteria(q, owner, category, classification, from, to, scope, page, size, sort));
    }

    @GetMapping("/categories")
    public List<String> categories() {
        return search.categories(CurrentUser.require());
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentDtos.DocumentDetail upload(@RequestPart("file") MultipartFile file,
                                              @RequestParam(required = false) String name,
                                              @RequestParam(required = false) String description,
                                              @RequestParam(required = false) String category,
                                              @RequestParam(required = false) Classification classification) {
        return documents.upload(CurrentUser.require(), file, name, description, category, classification);
    }

    @GetMapping("/{id}")
    public DocumentDtos.DocumentDetail get(@PathVariable UUID id) {
        return documents.get(CurrentUser.require(), id);
    }

    @PatchMapping("/{id}")
    public DocumentDtos.DocumentDetail update(@PathVariable UUID id,
                                              @Valid @RequestBody DocumentDtos.UpdateRequest request) {
        return documents.update(CurrentUser.require(), id, request);
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<byte[]> content(@PathVariable UUID id) {
        return asAttachment(documents.download(CurrentUser.require(), id, null));
    }

    @GetMapping("/{id}/versions")
    public List<DocumentDtos.VersionView> versions(@PathVariable UUID id) {
        return documents.listVersions(CurrentUser.require(), id);
    }

    @PostMapping(path = "/{id}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentDtos.DocumentDetail addVersion(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
        return documents.addVersion(CurrentUser.require(), id, file);
    }

    @GetMapping("/{id}/versions/{versionNo}/content")
    public ResponseEntity<byte[]> versionContent(@PathVariable UUID id, @PathVariable int versionNo) {
        return asAttachment(documents.download(CurrentUser.require(), id, versionNo));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> trash(@PathVariable UUID id) {
        documents.moveToTrash(CurrentUser.require(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/restore")
    public DocumentDtos.DocumentDetail restore(@PathVariable UUID id) {
        return documents.restore(CurrentUser.require(), id);
    }

    @DeleteMapping("/{id}/purge")
    public ResponseEntity<Void> purge(@PathVariable UUID id) {
        documents.purge(CurrentUser.require(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/activity")
    public PageResponse<AuditEventView> activity(@PathVariable UUID id,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "25") int size) {
        return documents.activity(CurrentUser.require(), id, page, size);
    }

    @GetMapping("/{id}/grants")
    public List<DocumentDtos.GrantView> listGrants(@PathVariable UUID id) {
        return grants.list(CurrentUser.require(), id);
    }

    @PostMapping("/{id}/grants")
    public ResponseEntity<DocumentDtos.GrantView> grant(@PathVariable UUID id,
                                                        @Valid @RequestBody DocumentDtos.GrantRequest request) {
        GrantService.GrantResult result = grants.grant(CurrentUser.require(), id, request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.grant());
    }

    @DeleteMapping("/{id}/grants/{grantId}")
    public ResponseEntity<Void> revoke(@PathVariable UUID id, @PathVariable UUID grantId) {
        grants.revoke(CurrentUser.require(), id, grantId);
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<byte[]> asAttachment(DocumentDtos.Download download) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(download.filename(), StandardCharsets.UTF_8).build());
        headers.setContentType(MediaType.parseMediaType(download.contentType()));
        headers.setCacheControl(CacheControl.noStore().cachePrivate());
        headers.setPragma("no-cache");
        headers.setContentLength(download.bytes().length);
        return new ResponseEntity<>(download.bytes(), headers, HttpStatus.OK);
    }
}
