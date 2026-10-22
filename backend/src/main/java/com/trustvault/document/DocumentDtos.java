package com.trustvault.document;

import com.trustvault.user.UserSummary;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class DocumentDtos {

    private DocumentDtos() {
    }

    public record DocumentSummary(UUID id, String name, String category, Classification classification,
                                  UserSummary owner, Access myPermission, int currentVersion, long sizeBytes,
                                  String contentType, Instant createdAt, Instant updatedAt, Instant deletedAt,
                                  Instant purgeAfter) {

        static DocumentSummary of(Document d, Access access) {
            return new DocumentSummary(d.getId(), d.getName(), d.getCategory(), d.getClassification(),
                    UserSummary.of(d.getOwner()), access, d.getCurrentVersion(), d.getSizeBytes(), d.getContentType(),
                    d.getCreatedAt(), d.getUpdatedAt(), d.getDeletedAt(), d.getPurgeAfter());
        }
    }

    public record DocumentDetail(UUID id, String name, String category, Classification classification,
                                 UserSummary owner, Access myPermission, int currentVersion, long sizeBytes,
                                 String contentType, Instant createdAt, Instant updatedAt, Instant deletedAt,
                                 Instant purgeAfter, String description, String originalFilename, String sha256,
                                 long lockVersion) {

        static DocumentDetail of(Document d, Access access) {
            return new DocumentDetail(d.getId(), d.getName(), d.getCategory(), d.getClassification(),
                    UserSummary.of(d.getOwner()), access, d.getCurrentVersion(), d.getSizeBytes(), d.getContentType(),
                    d.getCreatedAt(), d.getUpdatedAt(), d.getDeletedAt(), d.getPurgeAfter(), d.getDescription(),
                    d.getOriginalFilename(), d.getSha256(), d.getLockVersion());
        }
    }

    public record VersionView(int versionNo, long sizeBytes, String contentType, String originalFilename,
                              String sha256, UserSummary uploadedBy, Instant createdAt) {

        static VersionView of(DocumentVersion v) {
            return new VersionView(v.getVersionNo(), v.getSizeBytes(), v.getContentType(), v.getOriginalFilename(),
                    v.getSha256(), UserSummary.of(v.getUploadedBy()), v.getCreatedAt());
        }
    }

    public record UpdateRequest(@Size(max = 200) String name, @Size(max = 2000) String description,
                                @Size(max = 50) String category, Classification classification,
                                @NotNull Long lockVersion) {
    }

    public record Download(byte[] bytes, String filename, String contentType) {
    }

    public record GrantView(UUID id, UserSummary grantee, Permission permission, UserSummary grantedBy,
                            Instant createdAt, Instant expiresAt, GrantSource source) {

        static GrantView of(DocumentGrant g) {
            return new GrantView(g.getId(), UserSummary.of(g.getGrantee()), g.getPermission(),
                    UserSummary.of(g.getGrantedBy()), g.getCreatedAt(), g.getExpiresAt(), g.getSource());
        }
    }

    public record GrantRequest(@NotNull UUID userId, @NotNull Permission permission, Instant expiresAt,
                               UUID suggestionId) {
    }
}
