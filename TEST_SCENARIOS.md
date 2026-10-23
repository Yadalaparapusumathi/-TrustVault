# TrustVault: complete test-scenario checklist

**Total: 200 scenario definitions, TV-001 through TV-200.** Role, file-type and route variants produce additional
executions; they are not counted as new scenario IDs. This is a manual acceptance/regression checklist, **not**
a claim that 200 automated tests exist or that every scenario has passed. Record results separately.

## Preparation and execution

Use a disposable local/test environment, never confidential production files. Follow [README.md](README.md)
for setup and [docs/API.md](docs/API.md) for exact JSON bodies and response contracts.
Only `admin` is bootstrapped. In the local `dev` profile its public default password is `Admin#Vault2026`;
use the configured password if overridden. No other users or sample files are seeded.

As admin, use **People & roles > New user** to create these optional test fixtures:

| Alias | Suggested username | Role | Purpose |
|---|---|---|---|
| A | admin | ADMIN | Administration; initially no document grants |
| O1 | sumathi | OWNER | Primary document owner |
| O2 | asha | OWNER | Independent owner and transfer target |
| O3 | mounika | OWNER | Ungranted stranger |
| V1 | blessy | VIEWER | READ recipient |
| V2 | prasanna | VIEWER | EDIT recipient |
| V3 | nandini | VIEWER | Ungranted stranger |

Choose temporary passwords satisfying policy; do not reuse production credentials. Complete each user's forced
password change before ordinary document cases. Keep roles in separate browser profiles or independent cookie
jars. Create D1 owned by O1, D2 owned by O2 and D3 unshared by O1. Use harmless TXT/CSV, PDF, PNG/JPEG and OOXML
fixtures. Give D1 two versions, V1 READ and V2 EDIT. Create a separate disposable owner for deletion tests so
the main fixtures remain usable. Save document, grant, suggestion and user UUIDs from authorized responses.

For API tests: `GET /api/auth/csrf`, retain the cookie, then echo `XSRF-TOKEN` as `X-XSRF-TOKEN` on every mutation,
including login and DELETE. Obtain a fresh token after authentication transitions. Except explicit CSRF tests,
send valid tokens and well-formed bodies: a validation failure must not be mistaken for an authorization refusal.
After each rejected mutation, verify from the legitimate owner's session that content/metadata/grants are unchanged
and inspect the audit entry as the owner or admin. Match `X-Request-Id` when investigating.

Run destructive, tampering, clock/expiry and mutation tests only in disposable databases/checkouts. Never disable
audit triggers or edit audit rows in the normal local/live database. A known old audit-chain mismatch must remain
visible; it must not be silently repaired or called a passing integrity test.

## Scenario inventory

| Area | IDs | Count |
|---|---|---:|
| Bootstrap and user administration | TV-001..TV-025 | 25 |
| Authentication and sessions | TV-026..TV-045 | 20 |
| UI, navigation and accessibility | TV-046..TV-060 | 15 |
| Upload and content validation | TV-061..TV-085 | 25 |
| Search, organization and paging | TV-086..TV-105 | 20 |
| Direct-route document isolation | TV-106..TV-125 | 20 |
| Grants, revocation and suggestions | TV-126..TV-145 | 20 |
| Document editing, versions and recovery | TV-146..TV-165 | 20 |
| Audit, alerts and evidence | TV-166..TV-185 | 20 |
| Deployment, resilience and limitations | TV-186..TV-200 | 15 |
| **Total** | **TV-001..TV-200** | **200** |

### 1. Bootstrap and user administration

Use A unless a case specifies another actor. User deletion retains history; it is not physical row deletion.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-001 | Start with a new empty DB and development seeding enabled. | Exactly admin is created; no owners/viewers/documents/grants; `USER_CREATED` bootstrap event exists. |
| TV-002 | Start an empty disposable DB with seeding disabled. | No accounts or documents are created automatically. |
| TV-003 | Enable seeding without an admin password outside dev. | Startup fails explicitly; no partially created admin. |
| TV-004 | Change an existing account password; restart with seeding enabled. | No duplicate accounts, resets, renames or added sample data. |
| TV-005 | Open development login and click admin; inspect a production build separately. | Dev fills only admin, without signing in automatically; production exposes no picker/default password. |
| TV-006 | Create an OWNER, VIEWER and additional ADMIN using New user. | Roles/names are correct, directory refreshes, each creation is audited; no automatic document access. |
| TV-007 | Sign in as an admin-created user with the temporary password. | Password change is mandatory before document/admin operations. |
| TV-008 | Submit a username differing only by case from an existing one. | `409`; no duplicate identity or extra usable account. |
| TV-009 | Create users with missing/invalid username, display name, email, role or weak password. | Validation errors identify the problem; no invalid user is saved. |
| TV-010 | Filter People & roles by name, username, email and each role; clear filters. | Correct matching rows/counts and full non-deleted directory restored. |
| TV-011 | Edit another user's display name/email. | Changes persist after reload and are audited. |
| TV-012 | Change another user's role, then use their existing session. | New role applies on the next request; no cached old privileges. |
| TV-013 | Attempt to demote an owner who owns live or trashed documents. | `409`; transfer required; role stays OWNER. |
| TV-014 | Attempt to change A's own role or deactivate A. | Server refuses; A remains an active admin. |
| TV-015 | Deactivate a user with two sessions; repeat document/API requests. | Both sessions stop working; new login denied; account remains listed as inactive. |
| TV-016 | Reactivate that non-deleted user. | New login works; previously revoked cookies stay invalid. |
| TV-017 | Reset another user's password. | Existing sessions revoked; new temporary password works and requires change; old password fails. |
| TV-018 | Revoke another user's sessions without changing their password. | All existing cookies fail; new login with the current password works. |
| TV-019 | Transfer a leaver's live and trashed documents to O2. | Owner changes, history stays intact, O2 gains owner access; A gains none. |
| TV-020 | Transfer to self, a VIEWER, an inactive/deleted user or an unknown ID. | Refused; ownership and grants remain unchanged. |
| TV-021 | Select Delete user for a disposable viewer; cancel, reopen, type wrong then correct username. | Cancel/wrong confirmation does nothing; confirmed deletion removes the account and is audited. |
| TV-022 | Delete an owner before and after trashing their only document. | Both attempts return `409`; transfer is required even for trash; denials survive rollback. |
| TV-023 | Transfer all documents, delete the former owner, then inspect versions/history and download as O2. | Deletion succeeds; historical author/grant/audit references survive; content is still accessible to O2. |
| TV-024 | Try self-deletion, deletion of an unknown ID, and repeated deletion of an already-deleted user. | `400`, `404`, `404` respectively; refused attempts are audited. |
| TV-025 | After deletion, try old cookies, login, reset, reactivation, username reuse, directory lookup and grant listing. | Access/login blocked; reset/reactivation `404`, username reuse `409`; absent from directory/live grants; historical rows retained. |

### 2. Authentication and sessions

Use isolated test users for lockout/rate-limit cases, then restore a clean environment.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-026 | Sign in with valid credentials for each role. | Admin lands at administration; owners/viewers at workspace; role shown correctly. |
| TV-027 | Submit an unknown username and a wrong password for a known user. | Same generic `401` response; no user-existence details. |
| TV-028 | Submit empty username/password, then correct the form. | Helpful form error; valid retry works without stale error state. |
| TV-029 | Send malformed login JSON and unknown JSON fields. | Safe validation error; no stack trace, session or accepted unknown fields. |
| TV-030 | Fail a test account's password five times, then use its correct password during lockout. | Account locked for configured 15 minutes; generic refusal; lock event recorded. |
| TV-031 | After lockout expires, sign in correctly. | Login succeeds; failure/lock bookkeeping resets. |
| TV-032 | Exceed 30 login attempts from one test IP within five minutes. | Rate limit returns `429`; no unbounded password-guessing loop. |
| TV-033 | Inspect issued session cookies/storage. | Opaque token; HttpOnly, SameSite Strict; Secure in production; server stores token hash, not raw token. |
| TV-034 | Log out, then replay the old cookie to a protected API. | `401`; logout removed server-side session, not just browser state. |
| TV-035 | Age a disposable session beyond idle timeout; request a document. | `401` after the default 30 minutes idle. |
| TV-036 | Keep a disposable session active past absolute lifetime. | It still expires at the default eight hours. |
| TV-037 | Submit POST/PATCH/DELETE without, and with an incorrect, CSRF token. | `403`; no mutation; security refusal recorded. |
| TV-038 | Repeat those mutations with matching cookie/header tokens. | Authorized requests succeed; DELETE uses CSRF too. |
| TV-039 | While forced password change is pending, call documents, admin and directory APIs directly. | `403 Password change required`; only allowed auth endpoints remain usable. |
| TV-040 | Change password with wrong current password or unchanged replacement. | Refused; password remains unchanged; no false success notice. |
| TV-041 | Try 11/129 characters, deny-listed passwords, username-containing passwords and fewer than five distinct characters. | Policy rejects each; do not assume an uppercase/digit/symbol composition rule. |
| TV-042 | Change to a valid new password with two active sessions. | Current session remains usable; other sessions revoked; old password fails. |
| TV-043 | Open a safe deep link before login and an external/protocol-relative redirect variant. | Safe local destination preserved; external redirect cannot be followed. |
| TV-044 | Log out as O1 and sign in as V3 in the same browser. | Query cache cleared; O1's list/content is not displayed to V3. |
| TV-045 | In an isolated DB, mark a user inactive without deleting their session row. | Next request is denied by the live active check itself; independent-layer regression. |

### 3. UI, navigation and accessibility

Use desktop and narrow/mobile viewports; do not confuse hidden controls with server authorization.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-046 | Visit login, workspace, document detail and administration. | Consistent premium layout; self-hosted Poppins headings and Outfit body typography load. |
| TV-047 | Navigate all sidebar entries for every role. | Role-appropriate pages are discoverable; admin has People & roles, activity and audit. |
| TV-048 | Open the workspace guide and dismiss it using Escape and its close control. | Guide explains real actions; focus returns predictably. |
| TV-049 | Test mobile sidebar open, navigation and close. | No obscured main actions or unintended horizontal viewport scrolling. |
| TV-050 | Switch library grid/list modes and use document actions in each. | Same authorized documents and behavior in both modes. |
| TV-051 | Load an owner/viewer workspace with no accessible documents. | Clear empty state; never another user's files or fabricated totals. |
| TV-052 | Delay an API response and inspect loading indicators. | Loading/skeleton state rather than false empty or success state. |
| TV-053 | Fail an API request, use Retry, then restore service. | Visible safe error; successful retry refreshes the real data. |
| TV-054 | Keyboard-navigate forms, row menus, dialogs and tabs. | Controls have accessible labels; focus visible; dialog focus contained and restored. |
| TV-055 | Open destructive dialogs and press Cancel or Escape before confirmation. | No delete, purge, revoke or deactivate request occurs. |
| TV-056 | Double-click a pending mutation's submit button. | Pending UI prevents duplicate submission and indicates progress. |
| TV-057 | Enter harmless markup characters in a name/description and render them. | Rejected safely or rendered as literal text, never executable HTML. |
| TV-058 | Inspect an READ-only detail page and try its unavailable operations through the API. | UI hides/disables editing; server independently denies higher privileges. |
| TV-059 | Resize document access/activity/version tabs and admin tables on mobile. | Controls remain usable; intentional inner scrolling does not hide the page navigation. |
| TV-060 | Simulate a session-expiry `401` while navigating. | Auth state/cache cleared and sign-in shown; no repeated retry loop or stale confidential screen. |

### 4. Upload and content validation

Use O1. For rejected uploads verify no document/version/blob is committed; server-side validator rejections
should record `UPLOAD_REJECTED`. Transport/parser failures may use the request/security error path instead.
Use only benign fixtures and local validation tests, not actual malware.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-061 | Upload a valid TXT with name, description, category and classification. | `201`; exact metadata, owner O1, version 1, correct size/hash; upload audited. |
| TV-062 | Upload a valid plain PDF without active features. | Accepted; authorized download reproduces the bytes. |
| TV-063 | Upload valid DOCX, XLSX and PPTX fixtures. | Each supported OOXML type accepted with consistent metadata. |
| TV-064 | Upload valid PNG and JPG/JPEG fixtures. | Supported images accepted; extension/type agree. |
| TV-065 | Upload a valid UTF-8 CSV including non-ASCII text. | CSV content preserved; no encoding corruption. |
| TV-066 | O1 uploads with blank optional name. | Safe filename-derived document name is used. |
| TV-067 | Upload missing file, missing category, and empty file variants. | Validation failure, no partial document. |
| TV-068 | Upload a supported file just below and at 20 MiB (20,971,520 bytes). | Validator size boundary respected; valid content not rejected merely for equalling the limit. |
| TV-069 | Upload a supported file above 20 MiB and above servlet limits. | Rejected with size error (`413`); no persisted blob; server remains responsive. |
| TV-070 | Upload an unsupported executable/archive/HTML extension using harmless bytes. | Disallowed type rejected; no extension-only acceptance. |
| TV-071 | Rename harmless HTML or unrelated bytes to `.pdf`/`.png`. | Content mismatch rejected despite filename or claimed MIME. |
| TV-072 | Send a misleading client Content-Type with a supported fixture. | Server relies on content checks, not client MIME as an authorization to accept. |
| TV-073 | Use filenames containing traversal separators, quotes or control characters. | Safe validation/filename handling; no path traversal or response-header injection. |
| TV-074 | Upload a text/CSV fixture with invalid UTF-8 or NUL bytes. | Rejected with a safe validation error. |
| TV-075 | Upload text/CSV containing HTML/script markup. | Rejected by content policy; not served as active content. |
| TV-076 | Upload a harmless PDF fixture declaring JavaScript or Launch actions. | Rejected, including hex-escaped PDF name variants. |
| TV-077 | Test PDF fixtures with EmbeddedFile and EmbeddedFiles names. | Both singular and plural forms rejected. |
| TV-078 | Test RichMedia, XFA, AA, SubmitForm, ImportData and GoToR PDF fixtures. | Each disallowed active feature rejected. |
| TV-079 | Upload corrupt or truncated PDF/image/OOXML fixtures. | Rejected where structural validation applies; record any accepted parser gap rather than assuming antivirus coverage. |
| TV-080 | Upload OOXML missing required package parts. | Invalid package rejected. |
| TV-081 | Upload harmless OOXML fixtures containing macro/ActiveX package markers. | Rejected without running any active content. |
| TV-082 | Upload an OOXML fixture exceeding 5,000 ZIP entries. | Bounded package validation rejects it. |
| TV-083 | Upload an image whose declared dimensions exceed 50 million pixels. | Rejected; no unbounded image decode/allocation. |
| TV-084 | As VIEWER and ADMIN, submit a valid new-document multipart upload. | `403` despite valid file; OWNER-only upload check enforced. |
| TV-085 | Submit rejected file variants as new versions of D1. | Same validator applies; original version, current version number and bytes remain intact. |

### 5. Search, organization and paging

Create several authorized and unauthorized documents with overlapping names/categories and known creation dates.
All expected counts refer only to the actor's authorized rows.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-086 | Search by a document-name substring with varied case. | Case-insensitive contains match. |
| TV-087 | Search owner by username fragment and display-name fragment. | Authorized documents belonging to matching owners only. |
| TV-088 | Filter category with varied case and a partial category. | Case-insensitive exact category match, not substring matching. |
| TV-089 | Filter each classification, including PUBLIC. | Correct authorized subset; PUBLIC never means anonymously accessible. |
| TV-090 | Filter a creation-date range with documents exactly at both UTC date boundaries. | Inclusive from/to behavior. |
| TV-091 | Use only from, then only to. | Open-ended range works without fabricating a missing date bound. |
| TV-092 | Submit from later than to and a malformed date. | Safe `400` response. |
| TV-093 | Combine name, owner, category, classification and dates. | Intersection of all filters; no filter silently dropped. |
| TV-094 | Change name and owner quickly within the same debounce interval. | Both query values reach the server; neither overwrites the other. |
| TV-095 | Clear filters and use browser Back/Forward. | URL and visible controls/results stay synchronized. |
| TV-096 | Switch All, Owned, Shared and Trash scopes. | Correct access/scope filtering; viewers never obtain owned or foreign trash rows. |
| TV-097 | Page through results with mixed authorized and unauthorized records. | SQL filters before paging; correct totals; no empty post-filtered pages. |
| TV-098 | Request size 0, a negative page and size greater than 100. | Page normalized to at least 0; size clamped to 1..100, not assumed to return `400`. |
| TV-099 | Sort by name, createdAt, updatedAt and sizeBytes in both directions. | Correct ordering on allowed fields. |
| TV-100 | Submit an unsupported sort field. | `400`; no arbitrary SQL/order expression accepted. |
| TV-101 | Search for a known inaccessible document by exact name and owner. | Empty authorized result; counts reveal nothing about that document. |
| TV-102 | Request category suggestions as different users. | Only categories from each user's accessible documents appear. |
| TV-103 | Revoke V1's D1 grant, then refresh existing search/category queries. | D1 and its otherwise-invisible category disappear on the next request. |
| TV-104 | Search strings containing apostrophes, percent and underscore. | Safe parameterization/escaping; no SQL errors or unintended authorization widening. |
| TV-105 | Compare workspace totals with authorized list totals beyond one page. | Counts use server totals, not the length of a recent-files preview. |

### 6. Direct-route document isolation

For **each TV-106..TV-120**, use an existing D1 ID and valid body/child ID, then repeat with an unknown document
UUID. Execute as O3, V3 and ungranted A in separate sessions. Both existing-but-inaccessible and unknown IDs
must return the same safe **404**, with no metadata/bytes and an `ACCESS_DENIED` audit entry. Restore fixtures
before testing owner-only destructive success paths. These 15 definitions correspond to the parameterized
route list in `DocumentIsolationTest`.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-106 | `GET /api/documents/{id}`. | Uniform audited `404`; no detail leak. |
| TV-107 | `GET /api/documents/{id}/content`. | Uniform audited `404`; no current bytes. |
| TV-108 | `GET /api/documents/{id}/versions`. | Uniform audited `404`; no version metadata. |
| TV-109 | `GET /api/documents/{id}/versions/1/content`. | Uniform audited `404`; no historical bytes. |
| TV-110 | `GET /api/documents/{id}/activity`. | Uniform audited `404`; no actor/activity disclosure. |
| TV-111 | `GET /api/documents/{id}/grants`. | Uniform audited `404`; no recipient disclosure. |
| TV-112 | `PATCH /api/documents/{id}` with valid metadata and lockVersion. | Uniform audited `404`; metadata unchanged. |
| TV-113 | Multipart `POST /api/documents/{id}/versions`. | Uniform audited `404`; no version/blob created. |
| TV-114 | `DELETE /api/documents/{id}`. | Uniform audited `404`; document not trashed. |
| TV-115 | `POST /api/documents/{id}/restore`. | Uniform audited `404`; no restore. |
| TV-116 | `DELETE /api/documents/{id}/purge`. | Uniform audited `404`; no permanent deletion. |
| TV-117 | `POST /api/documents/{id}/grants` with a valid named recipient. | Uniform audited `404`; no new access. |
| TV-118 | `DELETE /api/documents/{id}/grants/{grantId}`. | Uniform audited `404`; grant unchanged. |
| TV-119 | `POST /api/documents/{id}/suggestions`. | Uniform audited `404`; no sharing-history disclosure. |
| TV-120 | `POST /api/documents/{id}/suggestions/{suggestionId}/dismiss`. | Uniform audited `404`; suggestion unchanged. |
| TV-121 | As V1 with READ, attempt metadata/version edits and owner-only actions. | `403` (not `404`) for insufficient privilege; read remains allowed. |
| TV-122 | As V2 with EDIT, attempt sharing, trash, restore, purge, activity and suggestions. | Owner-only operations return `403`; EDIT never means OWNER. |
| TV-123 | Remove cookies and request document/admin routes directly. | Authentication required (`401`), regardless of hidden UI controls. |
| TV-124 | Use malformed document ID path values and cross-document child grant/suggestion IDs. | Safe not-found/scoping refusal; no existence detail or changes to another document. |
| TV-125 | Give A an explicit READ grant, use D1, revoke it, retry. | Admin can use only the explicit grant, loses it immediately, and never gains implicit access to D2. |

### 7. Grants, revocation and suggestions

Use O1 as owner except where specified; refresh fixture permissions before each independent case.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-126 | Grant V1 READ on D1 using named directory selection. | D1 appears for V1; view/version downloads allowed; audited grant creation. |
| TV-127 | Grant V2 EDIT on D1. | Metadata changes/new versions allowed; sharing/deletion still owner-only. |
| TV-128 | Update V1's existing READ grant to EDIT. | Same named user's grant updated, no duplicate active grant; `GRANT_UPDATED`. |
| TV-129 | Downgrade EDIT to READ while recipient stays signed in. | Subsequent edits/version uploads return `403` without logout. |
| TV-130 | Grant with a future expiry, then move test time beyond expiry. | Access ends on the next request; UI refresh cannot retain permission. |
| TV-131 | Enter past or malformed expiry. | Validation error; prior valid grant remains unchanged. |
| TV-132 | Edit a grant without changing expiry, then explicitly clear expiry. | Unchanged expiry retains intended timestamp; clear removes the expiry, only after owner confirmation. |
| TV-133 | Grant to self, an inactive/deleted user or an unknown UUID. | Refused; no owner duplication or unusable recipient grant. |
| TV-134 | Revoke a live READ grant while V1 has D1 open. | Next detail/download/version request returns `404`; open UI is not a reusable authorization token. |
| TV-135 | After revocation, replay a previously copied current/historical download URL. | Server rechecks permission; no presigned or cached authorization survives. |
| TV-136 | As O1, revoke a grant belonging to O2's D2 using a D1 URL. | Child ID scoping refuses; D2 recipient access unchanged. |
| TV-137 | Re-grant a previously revoked recipient manually. | Explicit new owner decision restores only the chosen access and is audited. |
| TV-138 | Request directory lookup as OWNER/ADMIN and VIEWER. | First two receive limited active matches; VIEWER gets `403`. |
| TV-139 | Generate suggestions after building relevant sharing history on O1's documents. | Explainable pending suggestions; no access is created automatically. |
| TV-140 | Inspect suggested reasons when O2 owns similar private documents. | No O2 document titles, recipients or confidential history disclosed. |
| TV-141 | Accept a pending suggestion through a grant request with suggestionId. | Human-confirmed grant, source SUGGESTION, linked accepted status and audit. |
| TV-142 | Dismiss a pending suggestion. | Dismissal audited; no grant added. |
| TV-143 | Generate suggestions with an inactive/deleted, already-granted or previously-revoked candidate. | Excluded candidates are not proposed for that target document. |
| TV-144 | Accept/dismiss a suggestion using a mismatched document or recipient. | Scoped validation refuses; no access is widened. |
| TV-145 | Refresh suggestions repeatedly and inspect network traffic. | Deterministic owner-history logic; no external AI transmission or implicit grants. |

### 8. Document editing, versions and recovery

Use separate documents for destructive cases. Expected retention is the configured default 30 days.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-146 | O1 edits D1 name, description, category and classification. | Changes persist; lockVersion advances; change audit records the operation. |
| TV-147 | Submit name over 200, description over 2,000 or category over 50 characters directly. | Server validation refuses even if a UI input allows more characters. |
| TV-148 | Update D1 using a stale lockVersion from another browser. | `409`; no overwrite of the newer edit. |
| TV-149 | V2 with EDIT uploads a second valid version. | New current version and actor recorded; owner stays O1. |
| TV-150 | List versions and download each as V1. | Correct version numbers, uploader, size/hash and bytes. |
| TV-151 | Request an unknown version of an accessible document. | Safe not-found result; does not return the current version as fallback. |
| TV-152 | Compare current-content download with latest version-content download. | Identical bytes and hash for the same current version. |
| TV-153 | Inspect successful download headers. | Attachment disposition, no-store/private caching policy, nosniff and sandbox CSP. |
| TV-154 | O1 trashes D1, then V1/V2 request metadata/content/versions. | Owner sees trash; all grantees lose access immediately. |
| TV-155 | Owner opens trashed metadata/activity and requests content. | Owner can inspect recovery context; content download returns `409` while trashed. |
| TV-156 | Owner restores D1. | Document returns to library; still-valid grants work again; restore audited. |
| TV-157 | Let a grant expire while D1 is trashed, then restore. | Expired/revoked access does not revive. |
| TV-158 | Attempt permanent purge of a live document. | Refused; document must first be in trash. |
| TV-159 | Purge a trashed disposable document with confirmation. | Metadata, all versions/blobs/grants removed; audit evidence retained. |
| TV-160 | Request a purged document and old version URLs as owner and former grantee. | Safe `404`; no bytes recoverable through API. |
| TV-161 | In isolated fixtures, expire trash retention and execute the purge job. | Eligible trash removed; live and not-yet-eligible trash left alone; purge audited. |
| TV-162 | Transfer D1 to O2 while O2 has an old explicit grant. | O2 becomes owner; redundant recipient grant retired; pending suggestions superseded. |
| TV-163 | After transfer, retry former owner's previous owner-only actions. | No ownership rights remain unless separate access explicitly exists; new owner controls the document. |
| TV-164 | Fail an upload/version transaction deliberately in an integration test. | No partial document/version/blob or false committed success audit. |
| TV-165 | Race account deletion against new ownership using isolated service/transaction tests. | Deletion and upload/transfer serialize; no new document assigned after account deletion commits. |

### 9. Audit, alerts and evidence

Only use tampering fixtures in isolated Testcontainers/disposable databases. Preserve normal audit history.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-166 | Perform upload, view, download, update and new-version actions. | Corresponding successful events contain actor, target, time and request metadata. |
| TV-167 | Perform trash, restore, purge, grant creation/update/revocation and transfer. | Each completed change leaves an attributable audit record. |
| TV-168 | Trigger unknown/inaccessible-document and insufficient-permission refusals. | Denials audited even when business transaction rolls back. |
| TV-169 | In an integration test, append an event then trigger a refusal/rollback. | Denial survives after rollback without nested advisory-lock self-deadlock. |
| TV-170 | Inspect login failure, lockout, logout, password change/reset and user deletion events. | No raw passwords, session tokens or encryption keys in details. |
| TV-171 | Verify a clean chain via `GET /api/admin/audit/verify`. | Valid report with checked count/head; verification action audited. |
| TV-172 | On disposable DB, attempt audit UPDATE/DELETE/TRUNCATE as runtime role. | Privileges/triggers reject all; app cannot rewrite history. |
| TV-173 | In controlled committed fixtures, alter a historical audit row as privileged tester. | Verification detects the expected first broken sequence. |
| TV-174 | In controlled committed fixtures, remove a middle row or insert a forged row. | Integrity check detects break/gap/forgery; do not verify uncommitted changes from another connection. |
| TV-175 | Verify while multiple transactions append audit events. | Serialized chain remains coherent; no fork or duplicated sequence. |
| TV-176 | Filter audit by actor, action, outcome, document and date range. | Correct intersection and paging; quick filters preserve other selected filters. |
| TV-177 | Export filtered audit CSV. | Same filter semantics; download header/row limit; `AUDIT_EXPORTED` recorded. |
| TV-178 | Use a benign formula-leading User-Agent value in an audit event, then export. | CSV cell neutralized; verify the cell itself, not JSON embedded elsewhere. |
| TV-179 | Read D1 activity as O1, V1, O3 and A. | Only owner receives document activity; READ is insufficient; global admin audit is separate. |
| TV-180 | Inspect the action selector after deleting a user. | USER_DELETED is available; success/refusal distinguishable without modifying prior events. |
| TV-181 | Generate five, then twenty denied attempts in 24 hours using disposable users. | Repeated-denial alert reaches medium/high configured thresholds. |
| TV-182 | Generate twenty authorized downloads within an hour. | Bulk-download alert appears without exposing bytes in dashboard data. |
| TV-183 | Generate unknown-user failures, a lockout, restricted sharing and admin promotion fixtures. | Corresponding administrative alerts appear according to configured thresholds. |
| TV-184 | Make an isolated integrity check fail and load the dashboard. | Prominent tampering warning; no false healthy indicator or automatic log rewrite. |
| TV-185 | Call every admin route as OWNER/VIEWER, then invoke controller methods without URL filters. | Each layer independently refuses; new Delete user route included; role refusals audited through HTTP security path. |

### 10. Deployment, resilience and explicitly accepted limitations

These are readiness/limitation assessments as well as regression cases. Report blocked/known-gap results honestly.

| ID | Steps / scenario | Expected result |
|---|---|---|
| TV-186 | Follow clean-clone setup with empty PostgreSQL and required keys. | Migrations apply, runtime restricted role connects, health/login work; admin-only bootstrap. |
| TV-187 | Upgrade an existing V1 installation without dropping tables. | V2 adds deletion state/constraint; existing users/files/history remain intact. |
| TV-188 | Rebuild frontend and reload a nested route directly. | SPA fallback works; API proxy works; delete controls reflect deployed backend version. |
| TV-189 | Omit/shorten crypto keys or use incorrect DB credentials. | Startup fails visibly rather than running without encryption/auditing. |
| TV-190 | Examine runtime DB privileges and production configuration. | App is not DBA/schema owner; dev profile/public defaults absent; secrets externalized. |
| TV-191 | Request health and other actuator routes anonymously. | Health exposes status only; no unrestricted configuration/metrics/debug endpoints. |
| TV-192 | Inspect browser network/storage and deployed static assets. | No public blob URLs, confidential localStorage or dev credential picker in production bundle. |
| TV-193 | Restore a disposable backup together with separately secured correct keys. | Authorized documents decrypt; audit verification works; runtime roles remain restricted. |
| TV-194 | Restore without correct master/audit key in isolation. | Failure is explicit; encrypted content cannot be silently recovered and broken integrity is not called valid. |
| TV-195 | Run authorization mutation checks serially in a disposable checkout. | Tests fail for removed checks, including delete's admin check; compilation/Docker failure is not evidence of a killed mutation. |
| TV-196 | Assess PDF compressed-object streams and antivirus/CDR expectations. | Record current byte-scan limitations; do not claim comprehensive malware detection. |
| TV-197 | Assess MFA, enterprise SSO and public-link requests. | Mark MFA/SSO as not built; public/presigned links intentionally absent; named access remains required. |
| TV-198 | Revoke access while a download is already in flight and inspect previously saved bytes. | Next request denied; already delivered/in-flight bytes cannot be recalled. Document this boundary honestly. |
| TV-199 | Assess privileged tail truncation, key compromise and the denial-after-rollback crash window. | Record accepted limitations from THREATS.md; no unsupported claim of external anchoring or perfect crash-proof logging. |
| TV-200 | Execute the five-minute role demo against the intended deployment. | Admin creates accounts; owner uploads/shares; viewer reads; revoke blocks next request; audit proves it. Record real URL/video or mark unfinished. |

## Automated checks and coverage mapping

From the repository root:

```bash
mvn -f backend/pom.xml test
cd frontend
npm test
npm run lint
npm run build
```

Backend security tests use real PostgreSQL Testcontainers with production-like role restrictions:
`DocumentIsolationTest` (15 direct routes), `AdminBoundaryTest`, `AdminDefenceInDepthTest`,
`AuthenticationTest`, `RevocationTest`, `UploadValidationTest`, `AuditTrailTest`, `SuggestionTest` and
`UserDeletionTest`. Bootstrap coverage is in `seed/DataSeederTest`. Frontend interaction coverage includes
`LoginPage.test.tsx`, `admin-workspace.test.tsx` and `workspace.test.tsx`.
This mapping identifies related suites, not proof that every manual row is automated.

The mutation script supports selected numeric indices, including index 9 for Delete user's controller check.
It modifies source files and uses a shared `/tmp/mut.bak`: **run serially in a disposable checkout**, never
alongside edits or another mutation run. Inspect actual assertion failures; the script currently treats any
nonzero Maven exit as KILLED, including infrastructure failures. Restore a passing baseline afterwards.

## Results template

Copy one row per execution into your test report; do not mark scenarios passed merely because they are listed.
For role/file variants include the variant in the execution column.

| Scenario | Execution / actor | Build + environment | Actual result / status | Evidence / request ID | Defect |
|---|---|---|---|---|---|
| TV-nnn | Actor and variant | Fill in | NOT RUN | Fill in | None recorded |

Use **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**, or **KNOWN GAP**. Attach only synthetic/redacted screenshots
and logs. Reference [THREATS.md](THREATS.md) for accepted risks rather than converting them into false passes.
