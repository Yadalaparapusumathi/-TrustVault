# TrustVault

TrustVault is a platform for sharing confidential documents: salary letters, contracts, drawings and audit papers.
It is built around three promises:

1. **A document is reachable only by someone who was granted it.** The server decides on every request and every
   route: metadata, download, versions, grants, search, suggestions and admin.
2. **You can prove who reached it.** Every upload, download, change, deletion, permission change and every
   *refused* attempt is written to an append-only audit log. The log is HMAC-chained, and the database refuses
   updates and deletes on it.
3. **Revoking access works immediately.** There are no bearer tokens or signed URLs to outlive a revocation.
   Each request is authorised against the live grant table.

| | |
|---|---|
| Backend | Java 21, Spring Boot 3.5, Spring Security, Flyway, PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite, TanStack Query, Tailwind CSS |
| Tests | JUnit 5 + Testcontainers (real PostgreSQL), Vitest + Testing Library |

**Documents:**

| Document | Purpose |
|---|---|
| [THREATS.md](THREATS.md) | Threat model: about 70 entries. Each says what was done, what was accepted, and which test covers it |
| [PROMPTS.md](PROMPTS.md) | How AI was used and where it was wrong |
| [WRITEUP.md](WRITEUP.md) | What was built, what was not, the permission model, and what is unfinished |
| [docs/API.md](docs/API.md) | Every endpoint and who is allowed to call it |

---

## Roles

| Role | Can | Cannot |
|---|---|---|
| **ADMIN** | Manage users: create, change role, deactivate, delete, reset password, revoke sessions. Read and export the full audit log. Verify the audit chain. See the activity dashboard and alerts. | **Read any document.** The admin has no implicit document access. An admin can read a document only if an owner grants it, exactly like anyone else. The admin can transfer a leaver's documents to another owner. That transfer is audited, and the admin gains no access from it. Admin is an operator, not a super-reader. Admins cannot upload. |
| **OWNER** | Upload documents. Manage the documents they own: edit metadata, upload new versions, trash, restore, grant and revoke READ/EDIT. Get AI access suggestions. Use any document granted to them. | Touch documents they neither own nor were granted. |
| **VIEWER** | Use documents explicitly granted to them. READ lets them view and download. EDIT also lets them change metadata and upload new versions. | Upload new documents. Share, or re-share. Delete. |

**Per-document permissions** are `READ` and `EDIT`, granted to a named user. A grant can optionally expire.
Ownership is implicit full control. There are no folders, groups or inheritance, so the effective permission is
always a single row lookup. See [WRITEUP.md](WRITEUP.md#permission-model) for the reasons.

If you cannot access a document, the answer is `404`, never `403`. You cannot tell "exists but not yours" from
"does not exist".

## Default administrator and account management

Only **one administrator** is created on an empty database when the `dev` profile is active, or when
`TV_SEED_ENABLED=true`. No owners, viewers, sample documents or sample grants are created.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin#Vault2026` |

When running the frontend with `npm run dev`, the sign-in page shows **Local test accounts**.
Select a username to fill in its default credentials, then click **Sign in**. These shortcuts use normal
backend authentication; they do not bypass permissions and are omitted from production builds.
The development picker now offers **only admin**. If you override `TV_SEED_PASSWORD_ADMIN`, replace the filled
password with your configured value. Production has no default password: explicitly configure the bootstrap
password, rotate it after setup, and disable seeding.

Sign in as admin, open **People & roles**, and select **New user**. Choose OWNER or VIEWER and supply a temporary
password. Each new user must change it at first sign-in. An owner can then upload documents and grant named
viewers READ or EDIT access. Admin's empty document library is intentional, not a missing feature.

To delete an account, open its **Actions (...) → Delete user**, read the warning, type the username and confirm.
**Transfer documents** to another active owner first if the account owns anything, including trash.
Deletion permanently blocks sign-in, revokes sessions and removes the account from the directory. The database
retains the historical user identity, version/grant references and immutable audit trail; this is an
audit-preserving **soft deletion**, not data erasure. Deleted accounts cannot be reactivated or have their
username reused. Use **Deactivate** instead when removal should be reversible. Self-deletion is refused.

**Existing installations:** restart/rebuild the backend to apply Flyway `V2__user_deletion.sql`; rebuild or reload
the frontend. Existing accounts, passwords, documents and audit records are not automatically deleted or renamed.
Remove unwanted legacy demo accounts through the admin UI after transferring their documents. Do not reset
the database or rewrite historical audit records to obtain an admin-only directory.

Code changes are in `seed/DataSeeder`, `admin/AdminUserService`, `admin/AdminController`, `user/User`,
`user/UserRepository`, the V2 migration, and the frontend login/admin API/hooks/directory. User-row locking
serializes deletion with new document ownership and login; the database also forbids active deleted accounts.
The former owner/viewer seed password settings and pending legacy-name migration were removed.

Testing guide: [TEST_SCENARIOS.md](TEST_SCENARIOS.md). Copy-ready project brief:
[master implementation prompt](PROMPTS.md#reusable-master-implementation-prompt).

**Live URL:** _not yet deployed. See [Deliverable status](#deliverable-status)._

---

## Running it locally (no Docker)

### Prerequisites

You need:
- Java 21 and Maven 3.9+
- Node 20+ and npm
- PostgreSQL 14+ that you can reach as a superuser

### 1. Database (one time)

```bash
psql -U postgres -v owner_pw='owner-dev-pw' -v app_pw='app-dev-pw' -f deploy/db/manual-setup.sql
```

This creates two roles that are not superusers:
- `trustvault_owner` owns the schema and is used only by Flyway.
- `trustvault_app` is what the running application uses. It can only `INSERT` and `SELECT` on `audit_events`.

Tables, triggers and grants are created by Flyway when the backend first starts.

### 2. Backend (port 8080)

```bash
cd backend
mvn -q -DskipTests package
TV_DB_URL=jdbc:postgresql://localhost:5432/trustvault \
TV_DB_OWNER_PASSWORD=owner-dev-pw TV_DB_APP_PASSWORD=app-dev-pw \
java -jar target/trustvault.jar --spring.profiles.active=dev
```

The `dev` profile:
- disables the `Secure` cookie flag, so plain `http://localhost` works;
- supplies **public, dev-only** encryption and audit keys;
- bootstraps the administrator only, if the database has no users.

Never use the `dev` profile on a server.

### 3. Frontend (port 5173)

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `localhost:8080`, so the browser sees one origin. This is the
same arrangement as production, where nginx serves the SPA and proxies `/api`.

### Finding the features

The UI uses locally served **Poppins** headings and **Outfit** body text; it makes no font requests to third parties.
Owners and viewers land on their personal overview; administrators land on the system overview.
The question-mark button opens a guide tailored to the signed-in role.

| Requirement | Where to use it |
|---|---|
| Authentication and three roles | Sign-in page; role shown in the workspace; password changes in the account menu |
| Upload, organise and manage | Owners: **My documents → Upload document**; category/classification fields; grid or list view |
| Search by name, owner, category and date | **All documents** filters, with sorting and pagination; filtering remains server-side |
| Read/edit grants to named people | Open an owned document → **Access → Invite someone in** |
| Change or revoke access | **Access → Edit / Revoke** on an existing grant; optional expiry |
| Versions and downloads | Open a document → **Versions** or **Download**; EDIT grants allow a new version |
| Delete and recover | **Move to trash**, then **Trash & recovery** for restore or permanent deletion |
| Upload validation | Upload dialog feedback; server checks content/type/size rather than trusting the browser |
| Document audit trail | Owners: document **Activity** tab, including refused requests |
| Administrative oversight | Admin **Overview**, **Audit trail** (filters, event details, CSV), and **People & roles** |
| Isolation tests | `backend/src/test/java/com/trustvault/security/DocumentIsolationTest.java` and `scripts/authz-mutation-check.py` |

The overview counts come from authorised API results, not mock numbers or counts of a single page.
There are intentionally no public links, inherited folder permissions or in-browser document previews.
The UI is not an authorisation layer: all existing backend checks still apply to every request.

---

## Tests

```bash
# Backend: 139 tests against a real PostgreSQL (Testcontainers, so needs a running Docker daemon)
cd backend && mvn test

# Frontend: lint, unit/component tests, production build
cd frontend && npm run lint && npm test -- --run && npm run build
```

The security tests live in `backend/src/test/java/com/trustvault/security/`:

| Test class | What it proves |
|---|---|
| `DocumentIsolationTest` | No route returns another user's document, version, grant list or search hit. This includes ID guessing, version-ID swapping and search filters. |
| `RevocationTest` | Revoking a grant, deactivating a user, changing a role or resetting a password takes effect on the very next request. Expired grants stop working. |
| `AuditTrailTest` | Every action, including refused ones, is logged. The app's DB role cannot `UPDATE` or `DELETE` audit rows. A superuser edit, delete or insert is detected at the exact sequence number. |
| `AuthenticationTest` | Lockout, throttling, CSRF, session fixation and timeouts. |
| `UploadValidationTest` | File-type checks: magic bytes over the extension, active PDF content, macro-enabled Office files, zip bombs, path-traversal names. |
| `AdminBoundaryTest`, `AdminDefenceInDepthTest` | The admin cannot read documents. Non-admins cannot reach `/api/admin/**`, even when the URL filter is removed. |
| `SuggestionTest` | AI suggestions never create a grant, never leak other owners' data, and are audited. |

### Proving the tests test something

[`scripts/authz-mutation-check.py`](scripts/authz-mutation-check.py) removes one authorisation check at a time from
the production code, runs the suite, and expects it to **fail**. Each of the 9 mutations is reverted afterwards.

```bash
python3 scripts/authz-mutation-check.py      # from the repo root; needs Docker for Testcontainers
```

The last run killed all 9 mutations. The table is in [THREATS.md](THREATS.md#mutation-check-what-the-judges-will-do).

---

## Deploying

The repository ships a container setup:
- `docker-compose.yml`: postgres, backend and nginx-served frontend on an internal network. Containers are
  read-only, and only the frontend is published, on `127.0.0.1`.
- `docker-compose.prod.yml`: adds Caddy for automatic HTTPS.

```bash
cp .env.example .env            # fill in every value; generate keys with: openssl rand -base64 32
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> **Honest status:** these files were written and reviewed, but the full compose stack has **not** been run end to
> end. A first attempt hit a registry timeout, and container work was then paused at the project owner's request.
> The backend and frontend have each been run and tested natively, as described above.

**Without containers**, deploy it like any Spring Boot + static SPA app:
1. Run the jar with the variables below, as a non-root user behind TLS.
2. Serve `frontend/dist` from a web server that proxies `/api/` to the jar. See `frontend/nginx.conf` for the
   headers.
3. Point it at a PostgreSQL that was prepared with `deploy/db/manual-setup.sql`.

### Configuration

| Variable | Required | Meaning |
|---|---|---|
| `TV_DB_URL` | yes | JDBC URL, e.g. `jdbc:postgresql://db:5432/trustvault` |
| `TV_DB_OWNER_PASSWORD` | yes | Password for `trustvault_owner`. Used for migrations only. |
| `TV_DB_APP_PASSWORD` | yes | Password for `trustvault_app`. Used at runtime. |
| `TV_MASTER_KEY` | yes | 32 random bytes, base64. Wraps each file's data key. **Losing it makes files unreadable.** |
| `TV_AUDIT_HMAC_KEY` | yes | 32 or more random bytes, base64. Keys the audit chain. Keep it out of the database and its backups. |
| `TV_COOKIE_SECURE` | no (`true`) | Set to `false` only for plain-HTTP local testing. |
| `TV_SESSION_IDLE` / `TV_SESSION_ABSOLUTE` | no (`30m` / `8h`) | Session lifetimes. |
| `TV_SEED_ENABLED` | no (`false`) | Creates only `admin` on an **empty** database. |
| `TV_SEED_PASSWORD_ADMIN` | if seeding | Administrator bootstrap password. Public fallback exists only in the local `dev` profile. |

The backend refuses to start if either key is missing or too short.

### Operating it

- **Integrity check:** Admin → Audit → *Verify chain*, or `GET /api/admin/audit/verify`. This recomputes the
  whole HMAC chain and reports the first broken sequence number. The dashboard raises an `AUDIT_TAMPERING` alert
  if the last verification failed.
- **Backups:** back up PostgreSQL. It holds the metadata, the audit log and the encrypted file contents. Store
  `TV_MASTER_KEY` and `TV_AUDIT_HMAC_KEY` separately from the backups.
- **Retention:** trashed documents are restorable for 30 days, then purged at 03:15 every night. Audit rows are
  never purged.
- **Logs:** every response carries `X-Request-Id`. The same ID is in the application log and in the audit row.

---

## Repository layout

```
backend/            Spring Boot API (src/main/java/com/trustvault/{auth,document,audit,admin,storage,suggest,...})
  src/main/resources/db/migration/   Flyway schema: tables, audit triggers, role grants
  src/test/java/.../security/        Security test suite
frontend/           React SPA
deploy/             DB role setup, Caddyfile
docs/API.md         API reference with authorisation per endpoint
docs/ai/            Reusable AI prompts and context (see PROMPTS.md)
scripts/            Authorisation mutation check
```

## Deliverable status

| Deliverable | Status |
|---|---|
| Source, tests, schema, setup scripts, API docs, THREATS.md, PROMPTS.md, write-up | ✅ In this repository |
| Public Git repository | ⏳ Push to GitHub. Commit links in PROMPTS.md resolve once it is pushed. |
| Live URL with seed data | ⏳ Not deployed yet |
| Five-minute demo video | ⏳ Not recorded yet |
