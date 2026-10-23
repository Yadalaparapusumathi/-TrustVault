package com.trustvault.document;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditOutcome;
import com.trustvault.audit.AuditEventView;
import com.trustvault.audit.AuditQueryService;
import com.trustvault.audit.AuditService;
import com.trustvault.common.PageResponse;
import com.trustvault.common.ApiException;
import com.trustvault.config.AppProperties;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.storage.EnvelopeCipher;
import com.trustvault.storage.FileValidator;
import com.trustvault.storage.ValidatedFile;
import com.trustvault.suggest.AccessSuggestionRepository;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class DocumentService {

    private final DocumentRepository documents;
    private final DocumentVersionRepository versions;
    private final DocumentBlobRepository blobs;
    private final AccessSuggestionRepository suggestions;
    private final UserRepository users;
    private final DocumentAccessService access;
    private final FileValidator validator;
    private final EnvelopeCipher cipher;
    private final AuditService audit;
    private final AuditQueryService auditQuery;
    private final AppProperties properties;
    private final Clock clock;

    public DocumentService(DocumentRepository documents, DocumentVersionRepository versions,
                           DocumentBlobRepository blobs, AccessSuggestionRepository suggestions, UserRepository users,
                           DocumentAccessService access, FileValidator validator, EnvelopeCipher cipher,
                           AuditService audit, AuditQueryService auditQuery, AppProperties properties,
                           Clock clock) {
        this.auditQuery = auditQuery;
        this.documents = documents;
        this.versions = versions;
        this.blobs = blobs;
        this.suggestions = suggestions;
        this.users = users;
        this.access = access;
        this.validator = validator;
        this.cipher = cipher;
        this.audit = audit;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public DocumentDtos.DocumentDetail upload(AuthenticatedUser caller, MultipartFile file, String name,
                                              String description, String category, Classification classification) {
        if (!caller.hasRole(Role.OWNER)) {
            audit.recordIndependently(AuditEntry.of(AuditAction.ACCESS_DENIED).outcome(AuditOutcome.DENIED)
                    .target("DOCUMENT", null).detail("attempted", "upload").detail("reason", "role"));
            throw ApiException.forbidden("Only document owners can upload documents");
        }
        String cleanCategory = MetadataRules.category(category);
        String cleanDescription = MetadataRules.description(description);
        ValidatedFile valid = validateOrAudit(file, null);
        String cleanName = MetadataRules.name(name == null || name.isBlank() ? stripExtension(valid.filename()) : name);

        // Hold the account lock until commit so deletion cannot race a new ownership assignment.
        User owner = users.lockByIds(List.of(caller.id())).stream()
                .filter(User::isActive).findFirst().orElseThrow(() -> {
                    audit.recordIndependently(AuditEntry.of(AuditAction.ACCESS_DENIED).outcome(AuditOutcome.DENIED)
                            .target("DOCUMENT", null).detail("attempted", "upload").detail("reason", "inactive_owner"));
                    return ApiException.forbidden("An active document owner is required");
                });
        Instant now = clock.instant();
        Document document = new Document(cleanName, cleanDescription, cleanCategory,
                classification == null ? Classification.INTERNAL : classification, owner, now);
        StoredVersion stored = sealVersion(document, 1, valid, owner, now);
        document.applyVersion(stored.version(), now);
        documents.save(document);
        versions.save(stored.version());
        blobs.save(stored.blob());
        audit.record(AuditEntry.of(AuditAction.DOCUMENT_UPLOADED).document(document.getId())
                .detail("name", cleanName).detail("category", cleanCategory)
                .detail("classification", document.getClassification()).detail("filename", valid.filename())
                .detail("sizeBytes", valid.bytes().length).detail("sha256", valid.sha256()));
        return DocumentDtos.DocumentDetail.of(document, Access.OWNER);
    }

    @Transactional
    public DocumentDtos.DocumentDetail get(AuthenticatedUser caller, UUID id) {
        DocumentAccessService.Authorized auth = access.requireIncludingTrash(id, caller, Access.READ, "view");
        audit.record(AuditEntry.of(AuditAction.DOCUMENT_VIEWED).document(id).detail("access", auth.access()));
        return DocumentDtos.DocumentDetail.of(auth.document(), auth.access());
    }

    @Transactional
    public DocumentDtos.DocumentDetail update(AuthenticatedUser caller, UUID id, DocumentDtos.UpdateRequest request) {
        DocumentAccessService.Authorized auth = access.require(id, caller, Access.EDIT, "update");
        Document document = auth.document();
        if (request.lockVersion() != document.getLockVersion()) {
            throw ApiException.conflict("The document was changed by someone else. Reload and try again.");
        }
        AuditEntry entry = AuditEntry.of(AuditAction.DOCUMENT_UPDATED).document(id);
        boolean changed = false;
        if (request.name() != null) {
            String value = MetadataRules.name(request.name());
            if (!value.equals(document.getName())) {
                entry.detail("name", change(document.getName(), value));
                document.setName(value);
                changed = true;
            }
        }
        if (request.description() != null) {
            String value = MetadataRules.description(request.description());
            if (!Objects.equals(value, document.getDescription())) {
                entry.detail("description", "changed");
                document.setDescription(value);
                changed = true;
            }
        }
        if (request.category() != null) {
            String value = MetadataRules.category(request.category());
            if (!value.equals(document.getCategory())) {
                entry.detail("category", change(document.getCategory(), value));
                document.setCategory(value);
                changed = true;
            }
        }
        if (request.classification() != null && request.classification() != document.getClassification()) {
            entry.detail("classification", change(document.getClassification().name(), request.classification().name()));
            document.setClassification(request.classification());
            changed = true;
        }
        if (changed) {
            document.touch(clock.instant());
            documents.saveAndFlush(document);
            audit.record(entry);
        }
        return DocumentDtos.DocumentDetail.of(document, auth.access());
    }

    @Transactional
    public List<DocumentDtos.VersionView> listVersions(AuthenticatedUser caller, UUID id) {
        access.require(id, caller, Access.READ, "list_versions");
        return versions.findByDocument(id).stream().map(DocumentDtos.VersionView::of).toList();
    }

    @Transactional
    public DocumentDtos.DocumentDetail addVersion(AuthenticatedUser caller, UUID id, MultipartFile file) {
        DocumentAccessService.Authorized auth = access.require(id, caller, Access.EDIT, "upload_version");
        Document document = auth.document();
        ValidatedFile valid = validateOrAudit(file, id);
        User uploader = users.getReferenceById(caller.id());
        Instant now = clock.instant();
        StoredVersion stored = sealVersion(document, document.getCurrentVersion() + 1, valid, uploader, now);
        DocumentVersion version = stored.version();
        versions.save(version);
        blobs.save(stored.blob());
        document.applyVersion(version, now);
        documents.saveAndFlush(document);
        audit.record(AuditEntry.of(AuditAction.VERSION_UPLOADED).document(id)
                .detail("versionNo", version.getVersionNo()).detail("filename", valid.filename())
                .detail("sizeBytes", valid.bytes().length).detail("sha256", valid.sha256()));
        return DocumentDtos.DocumentDetail.of(document, auth.access());
    }

    /**
     * The audit row is committed together with the decision to release the bytes, before any byte leaves the
     * server. If the audit write fails, the download fails.
     */
    @Transactional
    public DocumentDtos.Download download(AuthenticatedUser caller, UUID id, Integer versionNo) {
        DocumentAccessService.Authorized auth = access.require(id, caller, Access.READ, "download");
        Document document = auth.document();
        int wanted = versionNo == null ? document.getCurrentVersion() : versionNo;
        DocumentVersion version = versions.findByDocumentAndNo(id, wanted)
                .orElseThrow(() -> ApiException.notFound("Version not found"));
        DocumentBlob blob = blobs.findById(version.getId())
                .orElseThrow(() -> new IllegalStateException("Missing blob for version " + version.getId()));
        byte[] plaintext = cipher.open(new EnvelopeCipher.Sealed(version.getWrappedKey(), blob.getCiphertext()),
                id, version.getId());
        audit.record(AuditEntry.of(AuditAction.DOCUMENT_DOWNLOADED).document(id)
                .detail("versionNo", wanted).detail("access", auth.access()).detail("sha256", version.getSha256()));
        return new DocumentDtos.Download(plaintext, version.getOriginalFilename(), version.getContentType());
    }

    @Transactional
    public void moveToTrash(AuthenticatedUser caller, UUID id) {
        Document document = access.require(id, caller, Access.OWNER, "delete").document();
        Instant now = clock.instant();
        document.moveToTrash(users.getReferenceById(caller.id()), now,
                now.plus(Duration.ofDays(properties.retention().trashDays())));
        suggestions.supersedePending(id);
        documents.saveAndFlush(document);
        audit.record(AuditEntry.of(AuditAction.DOCUMENT_DELETED).document(id).detail("name", document.getName())
                .detail("purgeAfter", document.getPurgeAfter().toString()));
    }

    @Transactional
    public DocumentDtos.DocumentDetail restore(AuthenticatedUser caller, UUID id) {
        Document document = access.requireIncludingTrash(id, caller, Access.OWNER, "restore").document();
        if (!document.isDeleted()) {
            throw ApiException.conflict("The document is not in the trash");
        }
        document.restore(clock.instant());
        documents.saveAndFlush(document);
        audit.record(AuditEntry.of(AuditAction.DOCUMENT_RESTORED).document(id).detail("name", document.getName()));
        return DocumentDtos.DocumentDetail.of(document, Access.OWNER);
    }

    @Transactional
    public void purge(AuthenticatedUser caller, UUID id) {
        Document document = access.requireIncludingTrash(id, caller, Access.OWNER, "purge").document();
        if (!document.isDeleted()) {
            throw ApiException.conflict("Move the document to the trash before deleting it permanently");
        }
        purgeNow(document, "owner");
    }

    /** Deletes the document row; versions, ciphertext, grants and suggestions go with it (ON DELETE CASCADE). */
    @Transactional
    public void purgeNow(Document document, String reason) {
        AuditEntry entry = AuditEntry.of(AuditAction.DOCUMENT_PURGED).document(document.getId())
                .detail("name", document.getName()).detail("versions", document.getCurrentVersion())
                .detail("sha256", document.getSha256()).detail("reason", reason);
        if ("retention".equals(reason)) {
            entry.systemActor();
        }
        documents.delete(document);
        documents.flush();
        audit.record(entry);
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditEventView> activity(AuthenticatedUser caller, UUID id, int page, int size) {
        access.requireIncludingTrash(id, caller, Access.OWNER, "view_activity");
        return auditQuery.search(AuditQueryService.Filter.forDocument(id), page, size);
    }

    private ValidatedFile validateOrAudit(MultipartFile file, UUID documentId) {
        try {
            return validator.validate(file);
        } catch (ApiException e) {
            AuditEntry entry = AuditEntry.of(AuditAction.UPLOAD_REJECTED).outcome(AuditOutcome.FAILURE)
                    .detail("reason", e.getMessage())
                    .detail("filename", file == null ? null : truncate(file.getOriginalFilename()));
            if (documentId != null) {
                entry.document(documentId);
            }
            audit.recordIndependently(entry);
            throw e;
        }
    }

    private record StoredVersion(DocumentVersion version, DocumentBlob blob) {
    }

    /** Encrypts the content; the caller persists version then blob, in that order, because of the foreign key. */
    private StoredVersion sealVersion(Document document, int versionNo, ValidatedFile file, User uploader,
                                      Instant now) {
        UUID versionId = UUID.randomUUID();
        EnvelopeCipher.Sealed sealed = cipher.seal(file.bytes(), document.getId(), versionId);
        DocumentVersion version = new DocumentVersion(versionId, document, versionNo, file.bytes().length,
                file.contentType(), file.filename(), file.sha256(), uploader, now, sealed.wrappedKey());
        return new StoredVersion(version, new DocumentBlob(versionId, sealed.ciphertext()));
    }

    private static String stripExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    private static String change(String from, String to) {
        return from + " → " + to;
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        String clean = value.replaceAll("\\p{Cntrl}", "");
        return clean.length() > 200 ? clean.substring(0, 200) : clean;
    }
}
