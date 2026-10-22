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

> **A note on dates.** All entries below are from 22 October 2026, the day the work was done. I have not backdated
> anything. The commit history shows the real order.

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
