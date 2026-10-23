# TrustVault: write-up

## What I built

TrustVault is a document vault for confidential files, with three roles (admin, owner, viewer). It is a Spring Boot
API on PostgreSQL with a React single-page app.

- **Documents:**
  - upload, with server-side validation;
  - metadata: name, description, category, classification (`PUBLIC` / `INTERNAL` / `CONFIDENTIAL` / `RESTRICTED`);
  - versions: every upload is kept, and any version can be downloaded;
  - trash, restore and permanent purge, with a 30-day automatic purge;
  - search by name, owner, category, classification and date range, with paging and sorting.
- **Sharing:**
  - per-document `READ` or `EDIT` grants to named people, with an optional expiry;
  - the owner can grant, change and revoke;
  - the admin can transfer a leaver's documents to another owner.
- **Storage:**
  - each version is encrypted with its own AES-256-GCM key, which is wrapped by a master key held outside the
    database;
  - ciphertext lives in PostgreSQL, so there is no file path or object-store URL that could be reached without
    going through the API.
- **Audit:**
  - every upload, download, change, deletion, restore, purge, grant, revocation, login, logout, lockout, admin
    action and **every refused attempt** is recorded;
  - each record carries the actor, IP address, user agent and request id;
  - rows are HMAC-chained;
  - the application's database role can only `INSERT` and `SELECT` on the audit table, and triggers block
    `UPDATE`, `DELETE` and `TRUNCATE` even for the table owner;
  - an integrity check finds the exact sequence number where the chain breaks.
- **Admin:**
  - admin-only bootstrap; other accounts created by an administrator with mandatory first-login password change;
  - user management: create, change role, deactivate/reactivate, audit-preserving account deletion, reset password, kill sessions;
  - a dashboard with alerts: repeated denials, bulk downloads, username probing, account lockouts, restricted
    documents shared, someone made admin, audit tampering;
  - a filterable audit log with CSV export (cells are protected against formula injection);
  - a chain-verify button.
- **Access assistant:** suggests people an owner might share a document with, and explains each suggestion. It
  never grants anything. The owner confirms, and the suggestion, the acceptance or dismissal, and the resulting
  grant are each audited and linked.
- **Tests:**
  - backend integration tests against real PostgreSQL, including user deletion and bootstrap coverage;
  - a mutation script covering 10 individual authorisation checks (counts and evidence in THREATS.md);
  - frontend unit/component tests, including role landing, grid/list actions, combined search filters and grant editing.

The workspace was redesigned with self-hosted Poppins and Outfit typography, an evergreen sidebar, an overview
for owners/viewers, visible shared-file and recovery navigation, and grid/list document browsing. The administrator
lands on system activity instead of an intentionally empty document library. A role-specific workspace guide
explains where each operation lives. Existing grants now have an explicit edit action for permission and expiry.
The redesign does not add any backend endpoint, public link, document preview or authorisation bypass.

The subsequent account-management update adds `DELETE /api/admin/users/{id}`. It retains historical user rows
and immutable audit events, rejects self-deletion and requires ownership transfer (including trash).
Deletion cannot be reversed; deactivation remains available for temporary suspension. Removed accounts cannot
sign in, appear in the directory, be reset/reactivated, or have their usernames reused. New installations contain
only the admin account; existing installations are never wiped automatically. See [TEST_SCENARIOS.md](TEST_SCENARIOS.md)
for the manual checklist and [PROMPTS.md](PROMPTS.md#reusable-master-implementation-prompt) for the reusable brief.

## Permission model, in my own words

A document has exactly one **owner**. Everyone else has either one **grant** on that document, or nothing. A grant
names one person and one level:
- `READ` lets them see and download.
- `EDIT` also lets them change metadata and upload new versions.

Only the owner can grant, revoke, trash, restore or purge. There are no folders, groups, inheritance or re-sharing.
So the question "can Carol open this?" is always answered by one row, and the audit trail can always say why she
could.

The role decides what kind of user you are, not what you can see:
- VIEWERs cannot upload or own documents.
- OWNERs can.
- ADMINs run the system but have **no implicit access to any document**. An admin who wants to read a file must be
  granted it like anyone else.

Admins can still give themselves access indirectly: reset an owner's password, or transfer documents to an account
they control. That route is not silent, though. Every step is in the audit log with the admin as the actor, and
the dashboard flags it. THREATS.md I-04 says plainly that this is accepted, and that a two-person rule is the real
fix.

The server enforces all of this in one place, `DocumentAccessService.check()`. Every document route calls it, and
search applies the same rule inside the SQL `WHERE` clause. A refusal returns `404`, never `403`, so a probe cannot
tell "not yours" from "does not exist". Every refusal is audited as `ACCESS_DENIED`.

**What "revoke immediately" means here.** Every request carries an opaque session id. The server looks up the
session, the user's active flag and role, and the grant row on *every* request. Nothing is cached, and there are no
JWTs, signed URLs or pre-generated download links. So:
- revoking a grant stops the next request;
- deactivating a user deletes their sessions;
- a password reset deletes their sessions;
- a role change applies on their next request, because the role is read from the database each time.

**The cost** is a few indexed lookups per request. That is invisible at this scale. Under heavy load I would add a
short-lived cache with explicit invalidation on revoke, *not* a token with a lifetime. The other cost: a download
already streaming when access is revoked will finish. I treat a download as one atomic act, which the audit log
records as having happened before the revocation.

## What I deliberately did not build

| Not built | Why |
|---|---|
| Folders with inherited permissions, and groups | This is exactly the "one file → forty files" failure in the brief. Named per-document grants are explainable by one row. |
| Public share links | A bearer URL cannot say *who* opened the document. Externals get a VIEWER account and an expiring grant. |
| Re-sharing by grantees | Only the owner widens access. |
| In-browser preview | Rendering untrusted PDFs or Office files on our origin is an XSS and parser risk. Download only, with `Content-Disposition: attachment`, `nosniff` and a sandbox CSP. |
| MFA, SSO | Session handling is built so these can be added in front of it. Not done in this time box (THREATS B-section). |
| Antivirus / content disarm | A sidecar such as ClamAV is the next step (E-10). |
| A real LLM in the assistant | Sending names and document metadata to a third-party model is itself a leak, and a model's output is harder to explain to an auditor. The assistant is a deterministic scoring rule over the owner's *own* sharing history. |
| Master-key rotation, HSM/KMS | Envelope encryption makes rotation a re-wrap of the data keys rather than a re-encryption of every file, but the job itself is not written. |
| External anchoring of the audit chain | See "Unfinished" below. |

## How I used AI, and where it was wrong

I used AI for most of the code, with a written API contract first, a security-review prompt, and a
repository-level instruction file. These are reused across the work and linked from PROMPTS.md. The pattern I saw
repeatedly: **the AI was most confidently wrong exactly where the brief said it would be, in authorisation and the
audit trail.** It was wrong in ways that compile, look rigorous and pass tests:

- **Audit denials deadlocked.** A refused request is logged in its own transaction, so the record survives the
  rollback. That transaction waited on the HMAC-chain lock held by the request it was logging.
- **Tests that could not fail.** One "forged audit row is detected" test inserted a row that was never committed,
  so the verifier could never see it.
- **Tests that passed with a check removed.** I wrote the mutation script *because* the first test suite passed
  with an authorisation check deleted (PROMPTS #5).
- **A file-validation regex that missed `/EmbeddedFiles`.**
- **A parallel agent staged deletions of backend files.**

Each of these is in PROMPTS.md with what I did about it and the commit.

## What is unfinished, and the known gaps

Honest list. Each of these is also in THREATS.md with its status.

- **Not deployed.** There is no live URL or demo video yet. The commit history covers a short period, not a week.
  I did not fake it.
- **The container stack has not been run end to end.** The Dockerfiles, compose files and Caddy config are written
  and reviewed. The backend and frontend have each been run natively, tested, and driven through the full UI flow
  (upload → share → download → revoke → refused) in a headless browser.
- **Audit tail truncation (D-06, D-07).** The HMAC chain detects any edit, insert or deletion *inside* the chain.
  Deleting the newest rows leaves a shorter chain that is still valid. The app logs a periodic anchor (sequence and
  hash), but nothing ships it to write-once storage. Someone holding both the DB superuser and the HMAC key can
  rewrite consistently. External anchoring is the fix.
- **The login IP throttle is in memory (H-04).** That is fine for one instance. Account lockout is in the
  database, so it already holds across instances.
- **PDF active content inside compressed object streams (E-04)** is not detected, because the scan is over raw
  bytes. Files are never rendered in our origin, which limits the impact. A real parser or CDR is the fix.
- **No automated dependency scanning in CI (H-08)**, and no CI pipeline at all yet.
- **Admin self-escalation through password reset or transfer (I-04)** is audited and flagged, but not prevented.
