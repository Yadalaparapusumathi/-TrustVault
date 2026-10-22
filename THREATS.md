# TrustVault threat model

This file lists the ways I believe TrustVault could be broken, what I did about each one, and what I knowingly
left open. Each entry has an ID. Where a test covers it, the test class and method are named. All tests live in
`backend/src/test/java/com/trustvault/security/` and run against a real PostgreSQL with the production schema,
triggers and role split.

**Status key:** ✅ mitigated and tested · 🟡 partly mitigated · ⚠️ accepted risk (reason given)

## The three non-negotiables, and how they are enforced

1. **Only a grantee reaches a document.** Every document route calls one function,
   `DocumentAccessService.require(...)`. It re-reads the document, the owner and the caller's live grant from the
   database on every request. List and search apply the same rule as a SQL `WHERE` predicate. The client decides
   nothing.
2. **Proof of who reached it.** Every success and every refusal is appended to `audit_events`. That table is
   append-only at three independent layers: database privileges, a trigger, and an HMAC chain keyed outside the
   database. Refusals are written in a separate transaction, so they survive the rollback of the refused request.
3. **Revocation is immediate.** There are no tokens, signed URLs or caches that outlive a grant. The session
   cookie is an opaque random value that is looked up in the database on every request, and grants are looked up
   too. Revoking a grant, deactivating a user, or trashing a document takes effect on the next request.

### Mutation check (what the judges will do)

`python3 scripts/authz-mutation-check.py` removes one authorisation check at a time and re-runs the suite. Every
mutation is currently **KILLED** (the suite fails):

| # | Check removed | Tests that fail |
|---|---|---|
| 0 | "no grant → 404" in `DocumentAccessService` (treat as READ) | 46 |
| 1 | permission-level check (`covers(required)`) | 4 |
| 2 | trashed documents give grantees no access | 1 |
| 3 | access predicate in search SQL | 3 |
| 4 | grant id must belong to the document in the URL | 1 |
| 5 | OWNER role required to upload | 1 |
| 6 | method-level `requireRole(ADMIN)` in `AdminController` | 2 |
| 7 | per-request `user.isActive()` in `SessionService` | 1 |
| 8 | URL rule on `/api/users/directory` | 1 |

Mutation 7 **survived** on the first run. Deactivation also deletes sessions, so no test reached the per-request
check on its own. I added `RevocationTest.inactiveUserIsCheckedPerRequest`. Admin routes had the same problem: a
URL rule and a method check guard each one, so deleting either single layer left the MockMvc tests green.
`AdminDefenceInDepthTest` now calls every admin controller method directly, without the filter chain.

---

## A. Broken access control (direct object access)

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| A-01 | **IDOR**: guess or steal a document UUID and call `/api/documents/{id}` or any sub-route. | All 15 single-document routes go through `DocumentAccessService.require`. UUIDs are random v4, but the design does not rely on that. | ✅ `DocumentIsolationTest.strangerIsRefusedEverywhere` (parameterised over every route) |
| A-02 | **Existence oracle**: 403 vs 404 reveals that a secret document exists. | No access → **404**, identical to an unknown id, including the message. A malformed UUID → 404 as well. 403 only when the caller already has READ and asks for more. | ✅ same test (checks the unknown id too), `malformedIdIs404` |
| A-03 | **Admin reads everything**, as admins usually can. | The ADMIN role confers **no** document access. Admins run users and the audit, not content. | ✅ `adminIsRefusedEverywhere`, `AdminBoundaryTest.adminSeesNoDocuments` |
| A-04 | **Vertical escalation inside a document**: READ → edit, upload a version, delete, share. | Ordered `Access` levels `READ < EDIT < OWNER`. Delete, restore, purge, share, activity and suggestions require OWNER. There is no re-sharing. | ✅ `readGranteeIsLimitedToReading`, `editGranteeCannotReshareOrDelete` |
| A-05 | **Cross-document grant id**: revoke or alter a grant by sending its id under a document you own. | A grant is looked up only together with the `documentId` from the path. | ✅ `grantIdsAreScopedToTheirDocument` (and mutation 4) |
| A-06 | **Search and listing leak**: names, counts, categories or owner filter reveal documents. | The access predicate is part of the SQL `WHERE`, so totals and pages count accessible rows only. Categories come from accessible documents only. | ✅ `searchIsFilteredInTheDatabase` |
| A-07 | **LIKE wildcard abuse** (`%`, `_`, `\`) to match everything or probe. | User input is escaped (`Like.contains`) with an explicit escape character. | ✅ `searchWildcardsAreEscaped` |
| A-08 | **Sort injection or sorting by sensitive fields** (`owner.passwordHash`). | Sort fields are whitelisted; anything else → 400. | ✅ `sortIsWhitelisted` |
| A-09 | **Mass assignment**: send `ownerId`, `role`, `id` in JSON. | DTOs are records with only the allowed fields, and Jackson `fail-on-unknown-properties: true`. | ✅ `massAssignmentIsRejected` |
| A-10 | **Self-grant / owner grant / grant to inactive user / back-dated expiry / bogus permission `OWNER`.** | Each is validated server-side → 400. | ✅ `grantValidation` |
| A-11 | **Viewer uploads** or **viewer enumerates users** (directory = list of names to phish). | Upload requires the OWNER role, checked in the service. The directory is limited to OWNER/ADMIN by URL rule. | ✅ `viewerRestrictions` (mutations 5 and 8) |
| A-12 | **Old versions**: a revoked or READ user fetches `/versions/1/content`. | Version routes use the same `require`. | ✅ `RevocationTest.revokeIsImmediate`, isolation test |
| A-13 | **Trashed document still reachable by grantees.** | `effectiveAccess` returns nothing for non-owners when a document is trashed. Owners get 409 until they restore it. | ✅ `trashCutsOffGrantees` (mutation 2) |
| A-14 | **Ownership transfer gives the admin a back door.** | Transfer can only go to an active OWNER, never to the admin performing it. The successor's previous grant on those documents is revoked, so there are no duplicate paths. Audited per document. | ✅ `transferDoesNotLeakToAdmin`, `transferTargetMustBeOwner` |
| A-15 | **Routes I didn't think of** (actuator, static paths, error pages). | `anyRequest().denyAll()`; the actuator exposes only `health` without details; Spring's `/error` reveals nothing (`include-message: never`). | ✅ `AuthenticationTest.denyByDefault` |
| A-16 | **Removing one layer goes unnoticed** (defence in depth that is never tested in depth). | The reflection test calls every `AdminController` method without the security filter. | ✅ `AdminDefenceInDepthTest` (mutation 6) |

## B. Authentication and sessions

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| B-01 | **Stolen session token from the DB or backups.** | Only SHA-256(token) is stored; the token is 256 bits of randomness. | ✅ by design (`SessionService`) |
| B-02 | **XSS steals the session.** | The cookie is `HttpOnly; SameSite=Strict; Secure`. The SPA has a strict CSP (`script-src 'self'`, no inline script), and React escapes output; the frontend never uses `dangerouslySetInnerHTML`. | ✅ `loginIssuesHardenedCookie` |
| B-03 | **CSRF.** | `SameSite=Strict`, plus Spring double-submit token (`XSRF-TOKEN` cookie → `X-XSRF-TOKEN` header) on every state-changing request. | ✅ `csrfRequired` |
| B-04 | **Credential stuffing / brute force.** | Per-account lockout (5 failures → 15 min, audited) and a per-IP sliding window (30 per 5 min → 429). BCrypt cost 12. | ✅ `lockout`, `ipThrottle` |
| B-05 | **Username enumeration** via different messages or timing. | Identical 401 message for unknown user, bad password, locked and inactive. Unknown users are checked against a dummy BCrypt hash so timing matches. | ✅ `noUsernameOracle` (message); 🟡 timing not measured by a test |
| B-06 | **Session fixation.** | A new random session is created at login and any session presented at login is deleted. | ✅ by design |
| B-07 | **Long-lived sessions after someone leaves.** | Idle timeout 30 min, absolute 8 h. Every request checks the user is still active. Admin "revoke sessions", password reset and deactivation delete all sessions. | ✅ `deactivationKillsSessions`, `inactiveUserIsCheckedPerRequest`, `adminCanKillSessions`, `logoutIsServerSide` |
| B-08 | **Weak or default passwords.** | 12–128 characters, deny-list of common passwords, may not contain the username. Admin-created and reset accounts must change their password, and they can call nothing else until they do (`PasswordChangeEnforcementFilter`). Seed passwords come from env, not from code. | ✅ `passwordPolicy`, `forcedPasswordChange`, `createdUserMustChangePassword` |
| B-09 | **Password change doesn't kick an attacker who already has a session.** | Changing a password revokes all *other* sessions. | ✅ by design (`AuthService.changePassword`) |
| B-10 | **Forged or garbage session cookie.** | Looked up by hash → absent → 401. | ✅ `unauthenticated` |
| B-11 | **Admin locks themselves out or self-escalates and erases tracks.** | Admins cannot change their own role or deactivate themselves. All admin actions are audited. | ✅ `adminCannotLockThemselvesOut` |
| B-12 | **No MFA.** | ⚠️ **Accepted.** A stolen password is enough for one account. I would add TOTP/WebAuthn next, for admins first. This is the biggest gap in the authentication design. | ⚠️ |

## C. Revocation ("taking access away works immediately")

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| C-01 | **Cached authorisation** (JWT claims, in-memory ACL cache) keeps working after revoke. | No authorisation caching anywhere. Grants are read from PostgreSQL per request. Cost: one indexed lookup per request (`ux_grants_active` partial unique index), which I accept. | ✅ `revokeIsImmediate` |
| C-02 | **Download links** (pre-signed URLs) survive revocation. | There are none. Bytes are only streamed by the API after an authorisation check. | ✅ by design |
| C-03 | **Downgrade EDIT → READ** not effective. | Same per-request read. | ✅ `downgradeIsImmediate` |
| C-04 | **Expired grants** still work until a cleanup job runs. | Expiry is part of the query (`expires_at > now`); no job is involved. | ✅ `expiredGrantIsDead` |
| C-05 | **A download already in flight** at the moment of revocation completes. | ⚠️ **Accepted.** The check happens at request start and the audit row is written before any bytes are sent, so the record shows it. Aborting mid-stream is not worth the complexity for files ≤ 20 MB. | ⚠️ |
| C-06 | **Copies already downloaded** stay with the person. | ⚠️ **Inherent.** No web platform can unsend a file. The audit trail proves *who* had it, and that is the evidence the brief asks for. Watermarking per recipient would help attribution and is listed as future work. | ⚠️ |
| C-07 | **Browser or proxy cache** keeps a copy. | `Cache-Control: no-store, private` and `Pragma: no-cache` on content; every API response is non-cacheable. | ✅ `UploadValidationTest.downloadHeaders` |

## D. Audit trail integrity

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| D-01 | **Application bug or compromised app edits or deletes audit rows.** | The app connects as `trustvault_app`, which has only `SELECT, INSERT` on `audit_events`. | ✅ `appRoleCannotAlterAudit` (verifies `current_user` is the restricted role) |
| D-02 | **Schema owner or migration edits rows.** | `BEFORE UPDATE/DELETE/TRUNCATE` triggers raise an exception, even for the owner. | ✅ `triggerBlocksOwner` |
| D-03 | **DB superuser disables the triggers and edits a row.** | Each row carries `HMAC-SHA256(key, prev_hash ‖ canonical(row))`. The key (`TV_AUDIT_HMAC_KEY`) is only in the app's environment, never in the DB. Verification (admin "Re-verify", plus the dashboard alert `AUDIT_TAMPERING`) pinpoints the first broken `seq`. | ✅ `tamperingIsDetected` |
| D-04 | **Superuser deletes a row from the middle.** | Sequence gaps and broken `prev_hash` links are detected. | ✅ `deletionIsDetected` |
| D-05 | **Superuser inserts a forged row.** | Cannot compute a valid HMAC without the key. | ✅ `forgedInsertIsDetected` |
| D-06 | **Truncating the tail** (deleting the newest N rows) leaves a valid shorter chain. | 🟡 The app logs an `AUDIT_ANCHOR seq/hash` line every 5 minutes to stdout. Shipped to a separate log store, an anchor proves that a later head existed. **Gap:** not shipped anywhere in this deployment, and nothing compares the anchors automatically. Next step: write anchors to an external WORM store (e.g. S3 Object Lock). | 🟡 |
| D-07 | **Someone holding both DB superuser and the app host** (and so the HMAC key) rewrites everything consistently. | ⚠️ **Accepted.** Only external anchoring (D-06) defeats this. Documented, not built. | ⚠️ |
| D-08 | **Refused attempts disappear** because the request rolls back. | Denials are written with `recordIndependently`: deferred until after the outer transaction ends, then written in a new transaction. | ✅ `refusalSurvivesRollback`, `refusalsAreAudited` |
| D-09 | **Crash between rollback and the deferred denial write** loses that denial. | ⚠️ **Accepted.** The window is milliseconds. Fixing it would need an outbox, and the attacker cannot trigger it. | ⚠️ |
| D-10 | **Concurrent writers fork the chain.** | `pg_advisory_xact_lock` serialises appends. The first draft deadlocked here (see PROMPTS.md entry 1). | ✅ by design + all tests |
| D-11 | **Download happens but no audit row** (e.g. audit after streaming fails). | The audit row is inserted in the same transaction *before* the bytes are returned. If it fails, the download fails. | ✅ `lifecycleIsRecorded` |
| D-12 | **CSV export formula injection**: an attacker puts `=HYPERLINK(...)` in their User-Agent or a document name, and the admin opens the export in Excel. | Every cell starting with `= + - @ \t \r` is prefixed with `'`. | ✅ `csvInjectionIsNeutralised` |
| D-13 | **Audit visible to non-admins** (it contains document names and IPs). | Admin only (URL + method). Owners see the activity of *their* documents only. | ✅ `auditAccessIsAdminOnly`, `documentActivityIsOwnerOnly` |
| D-14 | **Audit export or verification itself not audited.** | `AUDIT_EXPORTED` and `AUDIT_VERIFIED` are recorded. | ✅ `auditAccessIsAdminOnly` |
| D-15 | **Log injection** (newlines in usernames or filenames forging log lines). | The audit stores structured columns; details are JSON. Filenames are sanitised. The request id is server-generated (a client `X-Request-Id` is ignored). | ✅ by design |
| D-16 | **Admins can see document *names* in the audit**, which may themselves be sensitive ("Redundancy plan – J. Smith"). | ⚠️ **Accepted.** Investigations need names. Owners should name documents with that in mind. | ⚠️ |

## E. Uploaded content

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| E-01 | **Executables or HTML uploaded under a safe extension.** | Extension allow-list (pdf, docx, xlsx, pptx, txt, csv, png, jpg/jpeg). The type is sniffed from the bytes (Apache Tika) and must agree with the extension. | ✅ `rejectsHostileFiles` (17 cases) |
| E-02 | **Stored XSS via SVG/HTML** opened from the app origin. | SVG and HTML are not allowed. Every download is `Content-Disposition: attachment` with `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`, so even a mislabelled file cannot run on our origin. | ✅ `downloadHeaders` |
| E-03 | **Active PDF content** (JavaScript, Launch, embedded files, XFA, auto-actions). | Rejects `/JavaScript /JS /Launch /EmbeddedFile(s) /RichMedia /XFA /AA /SubmitForm /ImportData /GoToR`, after decoding `#xx` name escapes. My first regex let `/EmbeddedFiles` through; the test caught it. | ✅ (hex-escape and embedded-file cases included) |
| E-04 | **PDF keywords hidden inside compressed object streams** (`/ObjStm` + FlateDecode). | ⚠️ **Accepted gap.** The scan is over raw bytes. A full parser (PDFBox) or CDR is the real fix. Mitigated by "download only, never rendered in our origin". | ⚠️ |
| E-05 | **Office macros / ActiveX.** | Only OOXML (`.docx/.xlsx/.pptx`, never `.docm`). `vbaProject.bin` and `activeX` parts are rejected, and the main part must exist (a renamed zip is rejected). | ✅ macro and fake-docx cases |
| E-06 | **Zip bombs / huge images.** | Upload cap 20 MB at the servlet and validator. The zip central directory is inspected, not extracted. Images are limited to 50 M pixels (header only). | 🟡 no dedicated bomb test |
| E-07 | **Text files carrying binary or other encodings.** | `.txt/.csv` must be valid UTF-8 with no NUL bytes and no HTML/script tags. | ✅ NUL and non-UTF-8 cases |
| E-08 | **CSV uploads with formulas** (`=cmd|...`) opened by a recipient. | ⚠️ **Accepted.** The content is the owner's own data; rewriting it would corrupt legitimate spreadsheets. | ⚠️ |
| E-09 | **Path traversal / header injection via filename.** | Filenames are reduced to a safe base name; CR/LF/NUL/`/` are stripped; RFC 5987 encoding in `Content-Disposition`. Files are never written to the filesystem by name. | ✅ `filenameIsSanitised` |
| E-10 | **No antivirus scan.** | ⚠️ **Accepted for this scope.** ClamAV as a sidecar is the obvious next step. The allow-list and active-content rejection cover the most common attack paths. | ⚠️ |

## F. Storage and cryptography

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| F-01 | **Database dump or backup leaks file contents.** | Envelope encryption: every version has its own AES-256-GCM data key, wrapped by `TV_MASTER_KEY`, which is held outside the DB. | ✅ `contentIsEncryptedAtRest` |
| F-02 | **Ciphertext swapping**: a DB-level attacker copies a victim's blob into their own document row. | GCM AAD = `documentId ‖ versionId`, so the swapped blob fails authentication (500 with no content). | ✅ `ciphertextIsBoundToItsDocument` |
| F-03 | **Files on disk or in an object store reachable without the app.** | Files live only inside PostgreSQL as ciphertext. There is no public bucket and no static path. | ✅ by design |
| F-04 | **Integrity of stored content.** | GCM tag, plus a SHA-256 of the plaintext stored and shown to the owner. | ✅ by design |
| F-05 | **Master key rotation / compromise.** | 🟡 A format byte in every wrapped key allows a future key id. Rotation (re-wrapping data keys) is not built. | 🟡 |
| F-06 | **Keys in source control.** | Production keys come from env only; the app refuses to start without them. Dev keys live in `application-dev.yml` and are marked "dev only". | ✅ by design |
| F-07 | **Storing files in PostgreSQL limits scale** (20 MB × many). | ⚠️ **Accepted.** One transactional store keeps authorisation, audit and bytes consistent. For larger scale, move ciphertext to object storage keyed by version id; the access path stays the same. | ⚠️ |
| F-08 | **Deleted documents linger.** | Trash → purge after 30 days (scheduled, audited as system), or immediately by the owner. Purge deletes blobs, versions and grants; the audit keeps the record. | ✅ `purgeIsFinal` |

## G. AI assistant (access suggestions)

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| G-01 | **The assistant widens access on its own.** | Suggestions are rows in `access_suggestions` with status PENDING. They never create a grant. A grant is only created by the owner's explicit `POST /grants`. | ✅ `suggestionsNeverWidenAccess` |
| G-02 | **No record of what was suggested vs decided.** | `ACCESS_SUGGESTED` (with candidates, scores and reasons), `GRANT_CREATED` with `source=SUGGESTION` and `suggestionId`, and `SUGGESTION_DISMISSED`. | ✅ same test |
| G-03 | **Suggestions leak information** about other owners' sharing ("Bob shares Finance docs with Dave"). | The model learns **only from the requesting owner's own grants**. | ✅ `suggestionsRespectHistory` |
| G-04 | **Re-suggesting someone whose access was deliberately taken away.** | Previously revoked grantees on the owner's documents are excluded. | ✅ `suggestionsRespectHistory` |
| G-05 | **Suggestion replay**: accept a suggestion id on another document or for another person to tag a grant as "AI suggested". | The suggestion must be PENDING, for this document and this grantee. | ✅ `suggestionIsBoundToDocumentAndPerson` |
| G-06 | **Prompt injection / data sent to a third-party LLM.** | The assistant is deterministic and rule-based (`rule-based-v1`); no document content or names leave the system. I chose this deliberately (see WRITEUP.md). | ✅ by design |

## H. Web, transport and infrastructure

| ID | Threat | What I did | Status / tests |
|---|---|---|---|
| H-01 | **Clickjacking.** | `frame-ancestors 'none'`, `X-Frame-Options: DENY` (API and SPA). | ✅ headers configured |
| H-02 | **No TLS / downgrade.** | Caddy with automatic certificates in the prod overlay. HSTS. `Secure` cookies by default (must be explicitly disabled for localhost). | ✅ config |
| H-03 | **Spoofed `X-Forwarded-For`** to dodge the IP throttle or forge audit IPs. | Only internal proxies are trusted (Tomcat RemoteIpValve defaults). Caddy overwrites client-supplied XFF. The backend and DB containers have no published ports and sit on an `internal: true` network. | 🟡 depends on deploying behind the provided proxies |
| H-04 | **Login throttle is per-instance memory.** | ⚠️ **Accepted** for a single instance. With more than one replica, move it to PostgreSQL or Redis. Account lockout is in the DB, so it already works across instances. | ⚠️ |
| H-05 | **Verbose errors leak internals.** | RFC 7807 responses with generic messages. Stack traces are never sent. A request id is included for support. | ✅ `GlobalExceptionHandler` |
| H-06 | **Container breakout / lateral movement.** | Non-root images, `read_only` root FS, `cap_drop: ALL`, `no-new-privileges`. The DB is reachable only from the backend. | ✅ compose config |
| H-07 | **Least privilege in the DB.** | Three roles: superuser (init only), `trustvault_owner` (migrations), `trustvault_app` (runtime, no DDL, no audit UPDATE/DELETE). | ✅ `appRoleCannotAlterAudit` |
| H-08 | **Dependency vulnerabilities.** | 🟡 Current Spring Boot 3.5 / React 18 and a lockfile, but there is no automated SCA (Dependabot / OWASP DC) in CI yet. | 🟡 |
| H-09 | **Denial of service** (large uploads, expensive search). | Size caps; page size ≤ 100; indexes on search columns. No global rate limit beyond login. | 🟡 accepted |
| H-10 | **Open redirect after login** (`?next=https://evil`). | The frontend only accepts same-origin relative paths for `next`. | ✅ frontend `redirect.test.ts` |

## I. Process and people

| ID | Threat | What I did | Status |
|---|---|---|---|
| I-01 | **Leaver keeps access.** | Admin deactivation → sessions deleted, all access gone on the next request. Transfer moves their documents to a successor. | ✅ tests in C/B |
| I-02 | **Over-sharing with externals** (contractors and auditors are VIEWERs). | Grants can carry an expiry (the seed uses 30 days for the auditor). The dashboard flags `RESTRICTED_SHARED`. | ✅ |
| I-03 | **Insider exfiltration by a legitimate grantee.** | Cannot be prevented, only detected: `BULK_DOWNLOAD` alert (≥ 20 downloads per hour), `REPEATED_DENIALS` (≥ 5 / ≥ 20 per 24 h), `USERNAME_PROBING`, `ACCOUNT_LOCKED`. | 🟡 detection only |
| I-04 | **Admin gives themselves access indirectly**: creates an OWNER account, transfers a leaver's documents to it, or resets an owner's password and logs in as them. | Not preventable while admins manage identities, but none of it is silent: `USER_CREATED`, `OWNERSHIP_TRANSFERRED`/`PASSWORD_RESET`, then the new account's `DOCUMENT_DOWNLOADED`, all with the admin as actor where applicable. The dashboard flags `ADMIN_GRANTED` whenever anyone is given the ADMIN role. A two-person rule for transfers and resets is the proper fix. | ⚠️ accepted, visible in audit |

## Things I deliberately did not build (and why)

- **Folders with inheritance and groups.** These are the classic source of "given one file, can now see forty".
  Per-document grants to named people are exactly what the brief asks for, and every access is explainable by a
  single row.
- **Public / anonymous share links.** A bearer link cannot be tied to a person, which contradicts proving *who*
  reached a document. External people get a VIEWER account with an expiring grant instead.
- **Re-sharing by grantees.** Only the owner can widen access.
- **In-browser preview.** Rendering untrusted PDFs or Office files on our origin is a major XSS/parser risk.
  Downloads with a sandbox CSP are safer.
