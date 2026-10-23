# TrustVault API

Base path: `/api`. All request and response bodies are JSON unless stated otherwise.
Errors use RFC 7807 `application/problem+json`:

```json
{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "Document not found", "instance": "/api/documents/…", "requestId": "…" }
```

Validation errors additionally carry `"errors": { "field": "message" }`.

## Authentication model

* `POST /api/auth/login` sets an opaque session cookie `TV_SESSION` (`HttpOnly`, `Secure` in production,
  `SameSite=Strict`, `Path=/`). The server stores only the SHA-256 of the token. Every request re-loads the
  session **and** the user from the database, so deactivation, role changes, logout and session revocation take
  effect on the very next request.
* Sessions expire after 30 minutes idle or 8 hours absolute.
* CSRF: every response sets a readable cookie `XSRF-TOKEN`. Every state-changing request (`POST`, `PUT`, `PATCH`,
  `DELETE`) must echo it in the `X-XSRF-TOKEN` header. Call `GET /api/auth/csrf` once at start-up to obtain it.
* Unauthenticated requests to anything except `login`, `csrf` and `/actuator/health` get `401`.

## Roles

| Role     | Can do |
|----------|--------|
| `ADMIN`  | Manage users, see the audit trail, the activity dashboard and integrity check, transfer ownership of a leaver's documents. **Cannot** read or download any document unless an owner explicitly granted it to them like anyone else. Cannot upload. |
| `OWNER`  | Upload documents (and therefore own them). Full control of the documents they own: edit, new versions, delete/restore/purge, grant and revoke access, see each document's access history. Can use documents others granted to them. Can look up the user directory to share. |
| `VIEWER` | No documents of their own. Can use only documents granted to them, at the granted level. Typical for external partners, auditors, employees receiving letters. |

## Per-document permission

| Effective permission | Comes from | Allows |
|---|---|---|
| `OWNER` | `documents.owner_id` | everything below + delete, restore, purge, grants, activity, suggestions |
| `EDIT`  | active grant | read + update metadata + upload new version |
| `READ`  | active grant | view metadata, list versions, download any version |

A grant is *active* if it is not revoked and its optional `expiresAt` is in the future. Re-sharing is not possible:
only the owner can grant. Documents in the trash are visible only to their owner.

**Not-found vs forbidden.** If the caller has no permission at all on a document, every document endpoint answers
`404` exactly as if the document did not exist (no existence oracle). If the caller can read it but asks for a
higher permission, the answer is `403`. Both are recorded in the audit trail as `ACCESS_DENIED`.

## Common shapes

```ts
UserSummary   = { id: uuid, username: string, displayName: string, role: "ADMIN"|"OWNER"|"VIEWER" }
Me            = UserSummary & { email: string|null, mustChangePassword: boolean }
Page<T>       = { content: T[], page: number, size: number, totalElements: number, totalPages: number }
Classification= "PUBLIC"|"INTERNAL"|"CONFIDENTIAL"|"RESTRICTED"
Permission    = "READ"|"EDIT"
MyPermission  = "OWNER"|"EDIT"|"READ"

DocumentSummary = {
  id: uuid, name: string, category: string, classification: Classification,
  owner: UserSummary, myPermission: MyPermission,
  currentVersion: number, sizeBytes: number, contentType: string,
  createdAt: iso, updatedAt: iso, deletedAt: iso|null, purgeAfter: iso|null
}
DocumentDetail = DocumentSummary & {
  description: string|null, originalFilename: string, sha256: string,
  lockVersion: number        // optimistic-lock token, send back on PATCH
}
Version = { versionNo: number, sizeBytes: number, contentType: string, originalFilename: string,
            sha256: string, uploadedBy: UserSummary, createdAt: iso }
Grant   = { id: uuid, grantee: UserSummary, permission: Permission, grantedBy: UserSummary,
            createdAt: iso, expiresAt: iso|null, source: "MANUAL"|"SUGGESTION" }
Suggestion = { id: uuid, user: UserSummary, permission: Permission, score: number /*0..1*/,
               reasons: string[], status: "PENDING"|"ACCEPTED"|"DISMISSED" }
AuditEvent = {
  seq: number, occurredAt: iso,
  actor: { id: uuid, username: string, role: string } | null,   // null = system
  action: string, outcome: "SUCCESS"|"DENIED"|"FAILURE",
  targetType: string|null, targetId: string|null,
  documentId: uuid|null, details: object, ip: string|null, userAgent: string|null, requestId: string|null
}
IntegrityReport = { valid: boolean, checkedEvents: number, firstBrokenSeq: number|null,
                    headSeq: number|null, headHash: string|null, verifiedAt: iso, message: string }
```

## Endpoints

### Auth — public or any authenticated user

| Method | Path | Who | Notes |
|---|---|---|---|
| GET  | `/api/auth/csrf` | anyone | `204`, sets `XSRF-TOKEN` cookie |
| POST | `/api/auth/login` | anyone | `{username, password}` → `200 Me`. `401` generic message for bad user, bad password, locked or inactive account. `429` when rate-limited. |
| POST | `/api/auth/logout` | authenticated | `204`. Deletes the session server-side. |
| GET  | `/api/auth/me` | authenticated | `200 Me` |
| POST | `/api/auth/change-password` | authenticated | `{currentPassword, newPassword}` → `204`. Min 12 chars, not a common password, not containing username. Revokes all *other* sessions. |

When `mustChangePassword` is true, every endpoint except `me`, `logout`, `change-password`, `csrf` answers `403` with
`title: "Password change required"`.

### Documents

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/documents` | authenticated | Search. Query: `q` (name contains), `owner` (username/display name contains), `category` (exact), `classification`, `from`, `to` (ISO date `yyyy-MM-dd`, inclusive, on `createdAt`), `scope` = `all` (default) \| `owned` \| `shared` \| `trash`, `page` (0-based), `size` (≤100, default 20), `sort` = `updatedAt,desc` (fields: `name`,`createdAt`,`updatedAt`,`sizeBytes`). → `Page<DocumentSummary>`. **Only documents the caller can access are ever returned**; the filter is in the SQL. |
| GET | `/api/documents/categories` | authenticated | `string[]` categories of documents the caller can access |
| POST | `/api/documents` | role `OWNER` | `multipart/form-data`: `file` (required), `name`, `description`, `category` (required), `classification` (default `INTERNAL`). → `201 DocumentDetail`. `400` for validation failures, `413` too large, `415` disallowed type. |
| GET | `/api/documents/{id}` | READ | `DocumentDetail` |
| PATCH | `/api/documents/{id}` | EDIT | `{name?, description?, category?, classification?, lockVersion}` → `DocumentDetail`. `409` on stale `lockVersion`. |
| GET | `/api/documents/{id}/content` | READ | Current version bytes. `Content-Disposition: attachment`, `Cache-Control: no-store`, sandbox CSP. |
| GET | `/api/documents/{id}/versions` | READ | `Version[]` newest first |
| POST | `/api/documents/{id}/versions` | EDIT | multipart `file` → `201 DocumentDetail` |
| GET | `/api/documents/{id}/versions/{versionNo}/content` | READ | bytes of that version |
| DELETE | `/api/documents/{id}` | OWNER | Move to trash → `204`. Grantees lose access immediately. Purged automatically after 30 days. |
| POST | `/api/documents/{id}/restore` | OWNER | `DocumentDetail` |
| DELETE | `/api/documents/{id}/purge` | OWNER | Only from trash. Permanently destroys all versions and grants → `204`. The audit trail keeps the record. |
| GET | `/api/documents/{id}/activity` | OWNER | `Page<AuditEvent>` for that document (`page`, `size`) |

Allowed uploads (max 20 MB, content is sniffed, extension must agree with the sniffed type): `pdf`, `docx`, `xlsx`,
`pptx`, `txt`, `csv`, `png`, `jpg`/`jpeg`. PDFs containing JavaScript or launch actions are rejected.

### Grants

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/documents/{id}/grants` | OWNER | Active grants `Grant[]` |
| POST | `/api/documents/{id}/grants` | OWNER | `{userId, permission, expiresAt?, suggestionId?}` → `201 Grant` (or `200` when it changes an existing grant). Cannot grant to yourself or inactive users. `expiresAt` must be in the future. |
| DELETE | `/api/documents/{id}/grants/{grantId}` | OWNER | Revoke → `204`. Effective on the grantee's next request. |

### Access suggestions (assistant)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/documents/{id}/suggestions` | OWNER | Generates and returns `Suggestion[]` (pending). No body. Never changes access. Logged as `ACCESS_SUGGESTED`. (POST because it records the suggestions and an audit entry.) |
| POST | `/api/documents/{id}/suggestions/{suggestionId}/dismiss` | OWNER | `204`, logged as `SUGGESTION_DISMISSED`. |

To accept, the owner calls `POST /grants` with `suggestionId`; the grant is logged with `source: SUGGESTION` and the
suggestion is marked `ACCEPTED`.

### Directory

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/api/users/directory?q=` | role `OWNER` or `ADMIN` | Up to 20 active `UserSummary` matching username/display name. Viewers cannot enumerate users. |

### Administration — role `ADMIN` only

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/dashboard` | `Dashboard` (below) |
| GET | `/api/admin/audit` | Filters: `actor` (username), `action`, `outcome`, `documentId`, `from`, `to` (ISO date), `page`, `size` → `Page<AuditEvent>`, newest first |
| GET | `/api/admin/audit/actions` | `string[]` of known actions |
| GET | `/api/admin/audit/export` | Same filters, `text/csv` (max 50 000 rows). Logged as `AUDIT_EXPORTED`. |
| GET | `/api/admin/audit/verify` | `IntegrityReport` — recomputes the HMAC chain over the whole log |
| GET | `/api/admin/users` | `AdminUser[]`, excluding deleted accounts (inactive accounts remain visible) |
| POST | `/api/admin/users` | `{username, displayName, email?, role, temporaryPassword}` → `201 AdminUser`. User must change password at first login. |
| PATCH | `/api/admin/users/{id}` | `{displayName?, email?, role?, active?}` → `AdminUser`. Deactivation kills all sessions at once. Cannot deactivate/demote yourself. Cannot demote an owner who still owns documents (transfer first). |
| DELETE | `/api/admin/users/{id}` | `204`. Audit-preserving soft deletion: deactivates permanently, revokes sessions, removes from directory and user totals. `400` for self-deletion; `409` while any documents, including trash, are owned; `404` for unknown/already-deleted users. Transfer documents first. Username and historical references remain reserved; no reactivation/reset of deleted accounts. Successes and business refusals are audited as `USER_DELETED`; role/CSRF refusals use the security audit path. |
| POST | `/api/admin/users/{id}/reset-password` | `{temporaryPassword}` → `204`; kills sessions; forces change at next login |
| POST | `/api/admin/users/{id}/revoke-sessions` | `204` |
| POST | `/api/admin/users/{id}/transfer-documents` | `{toUserId}` → `{transferred: number}`. Target must be an active `OWNER`. Admin gains no access. |

```ts
AdminUser = UserSummary & { email: string|null, active: boolean, lockedUntil: iso|null, lastLoginAt: iso|null,
                            createdAt: iso, ownedDocuments: number, activeSessions: number, mustChangePassword: boolean }
Dashboard = {
  totals: { users: number, activeUsers: number, documents: number, trashedDocuments: number,
            activeGrants: number, events24h: number, denied24h: number, downloads24h: number },
  alerts: { severity: "HIGH"|"MEDIUM"|"LOW", type: string, message: string,
            actor: UserSummary|null, count: number, since: iso }[],
  activityByDay: { date: "yyyy-MM-dd", uploads: number, downloads: number, denied: number, permissionChanges: number }[], // last 14 days
  recentPermissionChanges: AuditEvent[],   // last 10
  recentDenied: AuditEvent[],              // last 10
  integrity: IntegrityReport
}
```

### Audit actions

`LOGIN_SUCCESS, LOGIN_FAILED, ACCOUNT_LOCKED, LOGOUT, PASSWORD_CHANGED, DOCUMENT_UPLOADED, UPLOAD_REJECTED,
DOCUMENT_VIEWED, DOCUMENT_DOWNLOADED, DOCUMENT_UPDATED, VERSION_UPLOADED, DOCUMENT_DELETED, DOCUMENT_RESTORED,
DOCUMENT_PURGED, GRANT_CREATED, GRANT_UPDATED, GRANT_REVOKED, ACCESS_DENIED, ACCESS_SUGGESTED, SUGGESTION_DISMISSED,
USER_CREATED, USER_UPDATED, USER_DEACTIVATED, USER_REACTIVATED, USER_DELETED, ROLE_CHANGED, PASSWORD_RESET, SESSIONS_REVOKED,
OWNERSHIP_TRANSFERRED, AUDIT_EXPORTED, AUDIT_VERIFIED`

### Operations

| Method | Path | Who |
|---|---|---|
| GET | `/actuator/health` | anyone (status only, no details) |

Every other actuator endpoint is disabled.
