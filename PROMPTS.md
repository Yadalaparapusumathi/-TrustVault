# PROMPTS.md: how AI was used, and where it was wrong

Tooling: **GitHub Copilot CLI** (agent mode). The main agent built the backend and tests. A second background
agent built the React frontend from a written brief. I directed both, reviewed the output, ran it, and attacked it.

Commit links are relative (`../../commit/<sha>`) so they resolve on the hosted repository.

**Reused context files** (the most useful part, because they show the working method):
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md): the security rules every agent session
  starts with, plus a running list of mistakes AI made in this codebase, so the next session checks for them.
- [`docs/ai/security-review-prompt.md`](docs/ai/security-review-prompt.md): the adversarial review prompt I paste
  with any diff that touches documents, grants, sessions or the audit.
- [`docs/ai/frontend-brief.md`](docs/ai/frontend-brief.md): the brief for the frontend agent.
- [`docs/API.md`](docs/API.md): written *first*, before any code, as the contract between the two agents. Every
  endpoint states who may call it.
- [`scripts/authz-mutation-check.py`](scripts/authz-mutation-check.py): not a prompt but a tool, written after
  entry 7. It is how I check whether an AI-written test actually tests anything.

> **A note on dates.** Entries 1-11 are from 22 October 2026; later entries carry their actual dates.
> Nothing is backdated. The commit history shows the real order.

---

## 1. 2026-10-22: Audit trail: denial logging deadlocked against itself  *(audit trail)*

**Asked:** "Write `AuditService`: an append-only, HMAC-chained audit log in PostgreSQL. Appends must be serialised
so the chain cannot fork. Refused access attempts must be recorded even though the request that was refused rolls
back."

**Produced:** `record()` takes `pg_advisory_xact_lock` and appends the next row. For denials it produced
`recordIndependently()` annotated `@Transactional(propagation = REQUIRES_NEW)`. That is the textbook answer to "must
survive the rollback".

**What was wrong:** the textbook answer deadlocks here. A request that has *already* appended an audit row in its
own transaction holds the advisory lock (for example: the owner uploads, then a later check in the same request
fails). `REQUIRES_NEW` suspends that transaction, opens a second connection, and waits for the same lock, which the
suspended transaction will never release. The thread hangs and the connection pool drains. Nothing in the code
looks wrong: it compiles, and it passes any test where the denial is the *first* audit write in the request.

**Did instead:** `recordIndependently()` now registers a `TransactionSynchronization` and writes the denial in
`afterCompletion` (after the outer transaction has committed or rolled back, so the lock is released) through a
`REQUIRES_NEW` `TransactionTemplate`. With no transaction active it writes immediately. I logged the crash window
this leaves as THREATS.md D-09. Tests: `AuditTrailTest.refusalSurvivesRollback`,
`DocumentIsolationTest.refusalsAreAudited` (15 routes).
Fixed before the first commit: [aea6de6](../../commit/aea6de6) (`backend/.../audit/AuditService.java`).

## 2. 2026-10-22: PDF validator let `/EmbeddedFiles` through  *(upload validation)*

**Asked:** "Validate uploads: allow-list extensions, sniff content with Tika, and reject PDFs with active content
(JavaScript, launch actions, embedded files), including hex-escaped names like `/Java#53cript`."

**Produced:** it decoded the `#xx` escapes correctly, then matched
`Pattern.compile("/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\\b")`.

**What was wrong:** the `\b` after `EmbeddedFile`. The key that actually attaches files in a PDF is
`/EmbeddedFiles` (the name tree in the catalog). In `/EmbeddedFiles` there is no word boundary between `e` and
`s`, so the pattern never matched. A PDF carrying an attached executable was accepted. It was also missing
auto-actions (`/AA`) and form-submission and remote-goto actions.

**How it was caught:** `UploadValidationTest.rejectsHostileFiles["PDF with embedded file"]` returned **201**
instead of 400. The test was written from the threat list, not from the implementation.

**Did instead:** `/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|AA|SubmitForm|ImportData|GoToR)\b`. I also
recorded in THREATS.md E-04 that a byte scan cannot see inside compressed object streams, which is an accepted gap.
Fix: [42a7350](../../commit/42a7350).

## 3. 2026-10-22: The AI's "forged audit row is detected" test could never fail  *(audit trail)*

**Asked:** "Write tests proving the audit chain detects tampering by someone with database superuser access:
edited row, deleted row, inserted forged row."

**Produced:** the forged-insert test opened a superuser connection, called `setAutoCommit(false)`, took the
advisory lock, inserted a row with a fake hash, and then called `integrity.verify()`, finally rolling back.

**What was wrong:** `verify()` runs on the application's own connection pool. The forged row was never committed,
so under READ COMMITTED isolation the verifier **could not see it**. I caught this on review, before running it.
As written, the test would have failed with "chain is valid", which reads like a product bug. The tempting "fix"
for a failing test is to loosen the assertion, and that would have produced a test that verifies nothing. It
looked rigorous (locks, explicit transactions, rollback) and could not observe the thing it claimed to test.

**Did instead:** the test now commits the forged row, asserts that `verify()` reports `firstBrokenSeq` equal to
that exact `seq`, then removes the row (temporarily disabling the trigger as superuser) and asserts the chain is
valid again. Edited-row and deleted-row tests got the same treatment and assert the exact broken sequence.
Fix: [42a7350](../../commit/42a7350) (`AuditTrailTest.forgedInsertIsDetected`).

## 4. 2026-10-22: The CSV-injection test asserted on the wrong thing  *(audit trail)*

**Asked:** "Test that the admin audit CSV export neutralises spreadsheet formula injection."

**Produced:** upload a document named `=HYPERLINK(...)`, export, and assert the CSV does not contain `"=HYPERLINK`.

**What was wrong:** the document name appears inside the JSON `details` column, which starts with `{`, so it was
never at the start of a cell and never dangerous. The test could not fail, whether or not the export escaped
anything. It also chose a field (document name) that only an owner controls, not an attacker.

**Did instead:** the attacker is a low-privilege VIEWER who sends `User-Agent: =HYPERLINK(...)` on a
refused request. The User-Agent is stored in its own audit column, so it does land at the start of a cell. The
test asserts that no cell in the export starts with `= + - @`. Fix: [42a7350](../../commit/42a7350).

## 5. 2026-10-22: AI-written tests passed with an authorisation check removed  *(access control)*

**Asked:** "Write tests proving one user cannot reach another user's documents, that revocation is immediate, and
that admin endpoints are admin-only." The brief warns that the judges will delete an authorisation check and run
the tests.

**Produced:** a good parameterised isolation suite (every document route × stranger/admin), plus revocation and
admin tests. All 136 passed.

**What was wrong:** I did not trust "all green", so I wrote `scripts/authz-mutation-check.py`. It deletes one
check at a time and re-runs the suite. Two mutations **survived**:
1. Removing `!user.isActive()` from `SessionService.authenticate`. Deactivation via the admin API *also* deletes
   the user's sessions, so the per-request active check was never what stopped the request. If someone later
   changes deactivation (for example a directory sync that flips `active` directly), a disabled user keeps
   working and no test notices.
2. Removing `CurrentUser.requireRole(ADMIN)` from an `AdminController` method. The URL rule `/api/admin/**`
   still blocked it, so MockMvc tests stayed green. Defence in depth is worthless if each layer is never tested
   alone.

**Did instead:** added `RevocationTest.inactiveUserIsCheckedPerRequest`, which flips `active` in SQL without
touching sessions. Added `AdminDefenceInDepthTest`, which calls **every** public `AdminController` method by
reflection with an OWNER/VIEWER principal, bypassing the filter chain, so a future admin endpoint without its own
check also fails. All 9 mutations are now killed (table in THREATS.md). Fix: [42a7350](../../commit/42a7350).

## 6. 2026-10-22: Persistence: wrong insert order and merge-instead-of-persist  *(data integrity)*

**Asked:** "Implement `DocumentService.upload`: validate, encrypt with a per-version data key, store document,
version and blob rows, audit."

**Produced:** entities with application-assigned UUIDs saved through `repository.save()`, with the blob saved
before its version.

**What was wrong:** with an assigned id, Spring Data's `save()` cannot tell the entity is new, so it calls
`merge()`. That runs an extra SELECT, returns a *different* managed instance than the one the code kept using, and
the blob's foreign key pointed at a version that was not yet inserted (FK violation at flush). It only appeared at
runtime.

**Did instead:** introduced `AssignedIdEntity` (implements `Persistable`, `isNew` cleared on `@PostPersist` and
`@PostLoad`) and an explicit order: document → version → blob. Fixed before the first commit:
[aea6de6](../../commit/aea6de6).

## 7. 2026-10-22: Schema types did not match the entities  *(minor)*

**Produced:** `char(64)` for hash and token columns in `V1__schema.sql`, while the entities were mapped as
`String` with `length = 64`.

**What was wrong:** with `ddl-auto: validate`, Hibernate rejected `bpchar` versus `varchar` at startup. The
application never booted. My first attempt at a bulk `sed` fix also mangled `varchar(64)` into `varvarchar(64)`.
That was my mistake, not the AI's, and it shows why I re-run after every "obvious" edit.

**Did instead:** `varchar(64)` throughout, verified by booting against a fresh database. [aea6de6](../../commit/aea6de6).

## 8. 2026-10-22: Parallel agent staged deletions of backend files  *(process)*

**What happened:** while the frontend agent was working in `frontend/`, the working tree ended up with
`backend/pom.xml`, `DocumentService.java`, both `application*.yml`, the Flyway schema and `docs/API.md` staged
as **deleted**. The agent reported that it had run a single `git status`; the cause is not certain. The next test
run failed with "no POM".

**Did instead:** restored everything from commit `aea6de6`. An uncommitted change to `pom.xml` (the Testcontainers
upgrade) was lost and re-applied. Lessons now in my workflow: **commit before starting a parallel agent in the same
tree**, and tell agents "do not run git at all", not "do not commit".
Recovery commit: [a68ac05](../../commit/a68ac05).

## 9. 2026-10-22: Reviewed AI frontend auth code and found no problem; here is what I checked  *(access control, client side)*

The frontend agent wrote the API client, auth provider and redirect handling. I ran
`docs/ai/security-review-prompt.md` against it and checked by hand:
- `src/api/client.ts`: every request uses `credentials: 'same-origin'`; there are no absolute URLs; the CSRF
  header is sent on all non-GET requests; a 403 triggers one CSRF-token refresh and retry, never a loop.
- `src/lib/redirect.ts`: `?next=` rejects `//evil`, `/\evil`, control characters, and anything whose resolved
  origin differs. Covered by `redirect.test.ts`.
- `src/auth/AuthProvider.tsx`: on login, logout **and any 401** the react-query cache is cleared. Without that,
  the next person on a shared computer could see the previous user's cached document list. This was the issue I
  most expected to find, and it was handled.
- `grep` for `dangerouslySetInnerHTML`, `localStorage`, `sessionStorage`, `window.open`: none.

Then I drove the real UI in a headless browser (Playwright + Edge) through upload → share with Bob → Bob downloads
→ revoke → Bob reloads (now "not found or you don't have access", with the `ACCESS_DENIED` row in the owner's
activity tab). No change was needed.
Commits: [b2afa93](../../commit/b2afa93), with a layout-only follow-up in [217b352](../../commit/217b352).

## 10. 2026-10-22: Dependency choice broke against the local Docker version  *(tooling)*

**Produced:** the standard `org.testcontainers:postgresql` / `junit-jupiter` 1.21 test dependencies.

**What was wrong:** Docker Engine 29 requires API ≥ 1.44, which Testcontainers 1.x cannot negotiate, so every
integration test would fail before running. In 2.x the artifacts were renamed (`testcontainers-postgresql`) and
the container class moved package (`org.testcontainers.postgresql.PostgreSQLContainer`).

**Did instead:** pinned `testcontainers.version` to 2.0.5 with a comment explaining why, and used the 2.x names.
[a68ac05](../../commit/a68ac05).

## 11. 2026-10-22: Workspace redesign exposed a combined-search race

**Asked:** Completely redesign the UI with Poppins/Outfit fonts, make role-specific functionality discoverable,
and compare it with the original confidential-document requirements. Keep server-side access checks intact.

**Produced:** A new visual system, personal and administrative landing pages, explicit navigation to shared files
and recovery, grid/list browsing, a workspace guide, and a named-grant permission/expiry editor using the existing API.

**What was wrong:** A new interaction test changed the document name and owner filters together. Both debounce
callbacks ran in the same render cycle, but React Router's `setSearchParams` callback does not queue updates like
React state. The owner update overwrote the name filter. The initial font import also assumed an Outfit
`latin.css` export that the package does not supply; the production build caught it. Browser inspection showed a
document-header status strip incorrectly nested inside its horizontal action row.

**Did instead:** Merge pending library filter updates against a ref synchronised with navigation; the regression
test asserts that name, owner, category, dates and sort are sent together to the server. Import Outfit through its
actual package entry point and self-host both fonts. Move the status strip below the header row. Interaction tests
also exercise role landing, preservation of deep links and forced password changes, grid/list controls, and
explicit grant updates including server rejection. The browser's existing audit-chain mismatch warning was not
hidden or "fixed" by modifying historical events.

**Commit:** Pending; these edits have not been committed. No historical commit link is invented.

## 12. 2026-10-23: Admin-only bootstrap and audit-preserving account deletion

**Asked:** Replace the default users, then superseded that request with "add only admin by default; admin will
add all other users" and requested a visible Delete user option. Also requested all test scenarios in Markdown
and a reusable full-project implementation prompt.

**Produced:** An admin-only bootstrap, normal dev-only admin sign-in shortcut, an admin DELETE endpoint,
typed-confirmation dialog, permanent account tombstones, session revocation, ownership-transfer prerequisite,
integration/component tests, and the accompanying documentation.

**What needed correction:** The first plan renamed six legacy demo accounts. That no longer matched the latest
request, so its uncommitted migration/config/tests were removed rather than applied to existing data. Hard
deletion would break document/version/grant references and the continuity of the audit evidence. Deactivation
alone would be misleading under an irreversible Delete label. An initial UI patch also put the Delete menu
item in mutation arguments instead of the row menu; interaction tests found the absent control. Type checking
then rejected an unsupported Testing Library `exact` option.

**Did instead:** Keep only bootstrap admin; all others are created through the existing admin workflow.
Deletion is explicitly documented as irreversible soft deletion, separate from reversible deactivation.
Retain historical identities and audit rows; hide deleted accounts from directory/totals/live grants, refuse
self-deletion, and require transfer of live and trashed documents. Lock user rows to serialize deletion with
login/new ownership, prevent reactivation through normal APIs and a database constraint, and append success
and refusal events through AuditService. The new route is covered in AdminBoundaryTest, direct controller
defence-in-depth checks and mutation index 9. Move the Delete item into the real row menu and remove the
unsupported test option. The 200-scenario checklist is a definition inventory, not a claim of 200 executed tests.

**Commit:** Pending for this update; no commit was requested and no fix SHA is invented.

---

## 13. 2026-10-23: Make user deletion discoverable and check the running application

**Asked:** "I don't see delete user option in Admin page."

**Found:** Delete existed only inside each person's three-dot menu. Both local frontend listeners served that
code, but the backend still ran an older IntelliJ-launched build: an authenticated OPTIONS request to the user
route advertised PATCH and OPTIONS, not DELETE. A source change alone does not update a running JVM.

**Changed:** Add a visible Delete button in a sticky Actions column, keep the existing confirmation and
self-deletion protection, and add Manage users to the admin overview. Tests now open deletion without a menu
and ensure the overview link remains available even when dashboard data fails. Restart the backend with its
actual application arguments and environment preserved in memory, removing only the IntelliJ launcher agent;
no database/encryption settings were guessed or credentials written to files. The updated live endpoint now
advertises DELETE. A temporary synthetic viewer was created, signed in, required to change its password and
deleted; its session and subsequent login were refused, its deletion was audited, and the pre-existing directory
was unchanged. The temporary account was removed through the normal audited deletion flow.

**Commit:** Pending for this follow-up; no commit requested.

## Reusable master implementation prompt

Copy the following prompt into a new project. Replace placeholders before use. This is an implementation brief,
not an assertion that deployment, MFA, antivirus or every listed manual scenario already exists in TrustVault.

```text
You are building <PROJECT_NAME>, a confidential-document platform for <ORGANIZATION_OR_USE_CASE>.
Build a complete, working application, not static mockups or a CRUD demo with hidden buttons.
The wrong person must not reach a document through any route, and the system must prove who reached it
or was refused. Use only synthetic development data. Do not transmit confidential files to external AI.

PROJECT PARAMETERS
- Product name: <PROJECT_NAME>
- Repository: <REPOSITORY>
- Public hostname/deployment target: <HOST_OR_NOT_YET_SELECTED>
- Recommended backend: Java 21, Spring Boot 3.5, Spring Security, Spring Data JPA.
- Recommended database: PostgreSQL with Flyway migrations.
- Recommended frontend: React, TypeScript, Vite, React Router, TanStack Query, Tailwind.
- Typography: self-hosted Poppins headings and Outfit body font.
- If the project already has a different stack, preserve it unless explicitly asked to migrate.
  Implement equivalent security invariants; explain meaningful tradeoffs before changing architecture.

WORKING METHOD
1. Inspect existing code, requirements, Markdown files, configuration and dirty worktree before editing.
2. Preserve unrelated work. Make complete, focused changes; never disable security to make a demo work.
3. Describe the permission model and API contract before wiring screens to endpoints.
4. Implement real API/database behavior end-to-end. No fake counts, pretend uploads or success toasts
   for unimplemented actions. Surface errors through safe, actionable responses and UI feedback.
5. Test actual role/grant boundaries, including direct HTTP requests without the UI.
6. Keep THREATS.md, PROMPTS.md, API docs and the setup instructions truthful as work proceeds.
7. Verify the changed paths and production build. Report incomplete/blocked work plainly.
8. Do not fabricate commit history, deployment URLs, screenshots, test results or videos.
9. Do not use agents/workflows or install tools unnecessarily. Use existing tooling and conventions.

NON-NEGOTIABLE SECURITY INVARIANTS
- A single central DocumentAccessService (or equivalent) makes document authorization decisions.
  Every single-document route calls require/requireIncludingTrash before reading document information,
  versions, grants, activity, suggestions or bytes.
- Permission is per document, granted to named users. No folder/category inheritance or admin bypass.
- No document permission means 404, indistinguishable from an unknown ID. Use 403 for a caller who
  can READ but lacks the required higher permission. Unauthenticated requests require authentication.
  Role-gated admin/upload/directory routes may use 403 for wrong roles.
- SQL must filter document search, category suggestions and counts by live authorization before paging.
  Never fetch an unauthorized page and filter it in application code.
- Check server-side session, active account, role and document grants on every request.
  No authorization cache, public bearer link, presigned URL or expiring download URL.
- Revocation takes effect on the next request, including previously copied URLs and old versions.
  Be honest: already delivered bytes and in-flight transfers cannot be recalled.
- Owners alone grant/revoke, trash/restore/purge, view document activity and control suggestions.
- READ includes detail, versions and download. EDIT adds metadata changes and new versions, not ownership.
- ADMIN manages identities and global audit/operations; it has zero implicit document access and cannot
  upload. An explicit owner-granted READ/EDIT permission works normally for an admin.
- Every completed sensitive operation is audited within its transaction. Every refusal is independently
  audited so rollback cannot erase it. Use only the central AuditService for inserts.
- Never UPDATE, DELETE or TRUNCATE audit_events through application code. No log "repair" by rewriting.

IDENTITY, AUTHENTICATION AND DEFAULT ACCOUNTS
- Bootstrap ONLY an administrator on a fresh empty database, behind an explicit seed setting.
  No default owners, viewers, documents, grants or simulated audit incidents.
- Backend dev profile may supply a clearly public local admin password. Production requires an explicit
  secret and must not ship a default password. Never silently reset existing accounts on startup.
- A development-only frontend shortcut may fill the admin credentials but must call normal sign-in.
  Exclude the shortcut and public dev password from production bundles.
- Administrator creates all other users through People & roles > New user, choosing OWNER, VIEWER or ADMIN.
- New accounts and admin resets use temporary passwords and require password change before other actions.
- Use salted strong password hashing, generic login errors, account lockout and per-IP throttling.
  Suggested defaults: BCrypt cost 12, five failures/15-minute lockout, 30 attempts per IP/five minutes.
- Passwords: 12-128 characters, deny common values, reject username inclusion and trivial repetition.
- Use opaque server-side sessions; store only token hashes. Cookies: HttpOnly, Secure under TLS,
  SameSite Strict. Suggested timeouts: 30 minutes idle, eight hours absolute.
- Every mutation sends X-XSRF-TOKEN matching the CSRF cookie. Apply to login and DELETE as well.
- Logout removes the session server-side. Password change revokes other sessions; reset/deactivation/
  account deletion revokes all target sessions.
- Clear frontend confidential query state on logout, account switch and session-expiry 401.
- Validate post-login redirects against the same origin; never trust an arbitrary next URL.
- Admin directory supports search/role filters, create/edit, reset password, revoke sessions,
  deactivate/reactivate, transfer documents and a visible Delete user action.
- Deactivate is reversible. Delete is explicitly irreversible account removal with history retention:
  mark deleted/inactive, hide from directory and live totals, revoke sessions, preserve identity/audit/
  version/grant references, reserve the username, and disallow later reset/reactivation.
- Require transfer of all owned documents, including trash, before deleting/demoting an owner.
  Target must be an active OWNER. Refuse self-deletion, self-deactivation and self-demotion.
- Use a typed username confirmation and explain soft deletion versus data erasure. Report conflicts
  visibly without closing the dialog as if deletion succeeded.
- Serialize account removal with new ownership assignments/login to avoid races. Preserve audit evidence;
  never cascade-delete documents or audit history when removing a person.
- Existing installations must retain data on upgrade. Remove obsolete demo accounts only through
  deliberate admin actions; never reset a database just to alter defaults.

DOCUMENT MANAGEMENT AND STORAGE
- Upload, organize by category/classification, search, edit metadata, version, download and recover documents.
- Metadata: name, description, category, classification, owner, timestamps, file type/size/hash,
  current version, optimistic-lock token, deletion/retention metadata.
- Suggested bounds: name 200, description 2000, category 50 characters, upload 20 MiB.
- Supported types: PDF, DOCX, XLSX, PPTX, TXT, CSV, PNG, JPG/JPEG. Add extensions only with content checks.
- All original uploads and version uploads go through one FileValidator.
- Check extension/content agreement, nonempty bytes, size, safe filenames and structural validity.
- Reject PDF active-content names, including hex-escaped names and EmbeddedFile/EmbeddedFiles.
  Document compressed-object-stream limitations; do not call a regex an antivirus engine.
- Inspect OOXML required parts and reject macro/ActiveX content; bound ZIP entry processing.
- Bound image dimensions; reject invalid text encoding, NUL and disallowed HTML/script markup.
- Encrypt each version with a fresh AES-256-GCM data key; wrap with an external master key.
  Keep ciphertext separate from metadata. File bytes are reachable only through authorized API handlers.
- Downloads use attachment disposition, no-store/private policy, nosniff and sandbox CSP.
- Preserve prior version bytes and uploader attribution. Validate lockVersion to reject stale updates.
- Search name/owner case-insensitively, exact category, classification and inclusive UTC creation dates.
  Support All/Owned/Shared/Trash scopes, allowlisted sorting and bounded paging.
- Merge simultaneous debounced filters without losing one update. URL state and Back/Forward must agree.
- Trash immediately denies grantees; only owner can inspect recovery context.
  Restore re-enables only still-valid grants. Purge only from trash, destroys all file versions, keeps audit.
- Use a documented retention period (for example 30 days) with an audited scheduled purge.

SHARING AND SUGGESTIONS
- Owners select active named people from a limited searchable directory; VIEWER cannot enumerate users.
- Grant READ or EDIT, optional future expiry; allow explicit update/downgrade/expiry removal/revocation.
- Scope every grant/suggestion child ID to its document to prevent cross-document ID substitution.
- Reject self-grants, inactive/deleted/unknown recipients and invalid expiry.
- Suggestions are optional, explainable and deterministic over the current owner's sharing history only.
  Never disclose another owner's private documents or send content to a third party.
- Generate, accept and dismiss through explicit user actions. Never widen access automatically.
  Audit suggestions and the human decision, linking accepted suggestions to resulting grants.
- Exclude already-granted, inactive/deleted and deliberately revoked recipients.

AUDIT AND ADMINISTRATIVE OPERATIONS
- Audit uploads, views/downloads, edits, versions, trash/restore/purge, grants/revocations, transfers,
  auth events, user changes/deletions, and refused attempts.
- Record actor identity/role, target, action, outcome, UTC time, safe details, request ID, IP and user-agent.
  Never record passwords, raw tokens, plaintext confidential content or cryptographic keys.
- Append-only DB permissions plus mutation-blocking triggers; runtime app role is not schema owner/DBA.
- HMAC-chain canonical events with a key external to the database. Serialize appends so the chain cannot fork.
- Successes commit atomically with business writes. Denials survive rollback through independent logging.
  Do not start REQUIRES_NEW while an outer transaction holds the audit advisory lock; defer the denial write
  until completion and explicitly document its residual crash window.
- Verify chain integrity and identify the first broken sequence. Surface tampering; never hide/reset warnings.
- Admin dashboard: activity trend, authorized operational counts, recent permission changes, denied attempts,
  repeated-denial/bulk-download/login-probing/lockout/restricted-sharing/admin-promotion/integrity alerts.
- Search/filter/paginate global audit; export bounded CSV with formula-injection neutralization.
- Document key compromise, tail truncation without external anchoring and privileged-admin indirect access.

PREMIUM FRONTEND REQUIREMENTS
- A calm evergreen sidebar, light neutral canvas, restrained lime accents, clear cards and subtle borders/shadows.
- Use Poppins/Outfit self-hosted fonts, consistent spacing/radius, useful icons and strong readable hierarchy.
- Responsive desktop/tablet/mobile layouts, not a desktop table squeezed into a phone viewport.
- Login, mandatory password change, personal workspace overview, library grid/list, advanced filters,
  upload dialog, document overview/metadata/version/access/activity panels, sharing/expiry editor, trash/
  restore/purge, admin dashboard, audit log and People & roles directory.
- Role-specific landing pages and workspace guide. Never confuse an intentionally empty admin library with
  missing functionality; explain admin's lack of document access.
- Counts must come from authorized server totals, not the first result page or invented demo data.
- Shared grid/table action implementation where practical; mutations use real endpoints and invalidate
  relevant query caches, counts and audit data.
- Accessible labels, focus-visible controls, keyboard menus, modal focus trapping/restoration and Escape.
- Honest loading/empty/error/denied states, safe notifications, required-field feedback, pending-state controls.
- Destructive confirmations state the actual result and prerequisites; do not hide rejected mutations.
- No dangerouslySetInnerHTML, sensitive localStorage or client-only authorization.
- Treat animation as decoration: respect reduced motion and keep essential controls discoverable.

API CONTRACT
- Document every endpoint, role/effective permission, request body, response, status and error shape.
- Prefer consistent RFC 7807 errors without SQL, stack traces or internal class names.
- Typical routes:
  /api/auth/{csrf,login,logout,me,change-password}
  /api/documents, /api/documents/categories
  /api/documents/{id} (GET/PATCH/DELETE)
  /api/documents/{id}/content
  /api/documents/{id}/versions and /versions/{versionNo}/content
  /api/documents/{id}/{restore,purge,activity,grants,suggestions}
  scoped grant revoke and suggestion dismiss routes
  /api/users/directory
  /api/admin/{dashboard,audit,users}
  /api/admin/audit/{actions,export,verify}
  /api/admin/users/{id} (PATCH/DELETE)
  /api/admin/users/{id}/{reset-password,revoke-sessions,transfer-documents}
- All single-document handlers must be in the authorization-route inventory. Protect admin endpoints both
  at URL/security-filter and method level, and test each layer independently.

ENGINEERING AND VALIDATION
- Records/typed DTOs, constructor injection, central errors, service-level transactions, safe parameterized SQL.
- Assigned UUID entities must use proper new-entity semantics, not accidental merge-on-save.
- Match schema types exactly; do not use char(n) for fields mapped as varchar.
- Real PostgreSQL integration tests with restricted production-like app privileges and separate migrations role.
- Cover owner/viewer/admin isolation across every document route, unknown versus inaccessible IDs,
  cross-document child IDs, downgrade/revoke/expiry, account deletion, sessions/CSRF, uploads, audit and search.
- A new endpoint must enter the parameterized route list and authorization-mutation inventory.
- Remove one authorization check and prove a meaningful assertion fails. A compiler or Docker failure is not
  evidence of mutation detection. Defense-in-depth tests must bypass other layers deliberately.
- Audit-tampering tests must commit controlled fixtures before checking via another connection; only in
  disposable databases. Never run those manipulations against real history.
- Frontend tests cover landing/deep links/forced password change, combined filters, grant editing, deletion
  confirmation/success/refusal and safe session transitions.
- Run appropriate integration tests, frontend tests, lint and production type-check/build.
  Inspect production assets for dev-only credentials and normal browser flows on desktop/mobile.
- Use a small, focused regression case for every fixed behavioral bug, not tests that restate constants.

DELIVERABLES
- Working source, migration/schema and clean-clone setup, configuration examples without real secrets.
- README: architecture, role model, admin-only bootstrap, how admin creates test users, deployment,
  backups/keys, limitations and honest readiness status.
- docs/API.md: endpoint-by-endpoint authorization.
- THREATS.md: specific attacks, mitigation, evidence and accepted risk with honest rationale.
- PROMPTS.md: at least five actually dated AI-use entries; prompt, output, precise mistake, correction and
  real fix-commit link once committed. At least two concern authorization/access/audit.
  Preserve real history and reused prompts; never manufacture errors or backdate entries.
- TEST_SCENARIOS.md: uniquely numbered scenarios, exact verified count, fixtures created through admin,
  steps/expected outcomes, direct API tests, variants, destructive-test safety and result template.
  Distinguish definitions, automated executions and scenarios actually run.
- WRITEUP.md: built scope, intentional omissions, permission model, storage/revocation/audit tradeoffs,
  AI mistakes and unfinished items.
- Deployment scripts and operational steps; real live URL and demo video only when actually available.
- Final handoff: meaningful changes, required restart/migration steps and truthful remaining limitations.

ACCEPTANCE BAR
Demonstrate admin creating O1/O2/V1/V2; owners have isolated documents; grant READ then EDIT; download versions;
revoke and replay old URLs; trash/restore; transfer an owner's documents then delete their account; inspect
the immutable record; prove an ungranted admin and unrelated owner/viewer receive uniform 404s.
A polished screen is not a substitute for these server-enforced boundaries.
```
