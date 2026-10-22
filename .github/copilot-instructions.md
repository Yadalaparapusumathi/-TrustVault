# Instructions for AI assistants working on TrustVault

TrustVault is a confidential-document platform. Treat every change as a security change.

## Non-negotiable rules
1. **Authorisation is server-side and central.** Every route that touches a single document MUST call
   `DocumentAccessService.require(...)` (or `requireIncludingTrash`) before reading anything else about it.
   Never check access in a controller, a DTO mapper or the frontend only.
2. **No access → 404, never 403**, identical to an unknown id. 403 only when the caller has READ and needs more.
3. **The ADMIN role confers no document access.** Do not add admin bypasses "for support".
4. **No caching of authorisation decisions** and no pre-signed/expiring URLs. Revocation must work on the next
   request.
5. **Every success and every refusal is audited.** Use `AuditService.record` inside the transaction for successes
   and `recordIndependently` for denials (they must survive rollback). Never write to `audit_events` any other way.
   Never add UPDATE/DELETE on that table.
6. **Search must filter in SQL**, never post-filter a page in Java (that leaks counts and breaks paging).
7. **Uploads go through `FileValidator`.** Do not add an extension without a content check for it.
8. **Every new endpoint needs a test that fails if its check is removed.** Add it to the parameterised route list
   in `DocumentIsolationTest` or `AdminBoundaryTest`, and add a mutation to `scripts/authz-mutation-check.py`.

## Things previous AI output got wrong here (check for them)
- `@Transactional(REQUIRES_NEW)` while the outer transaction holds the audit advisory lock → self-deadlock.
- Regexes with `\b` after a PDF name that has a plural form (`/EmbeddedFile\b` misses `/EmbeddedFiles`).
- Tests that "verify" something through another connection while the data is uncommitted.
- Tests that pass because two layers protect the same thing; test each layer alone.
- `char(n)` columns (Hibernate validate expects `varchar`).

## Conventions
- Java 21, Spring Boot 3.5, records for DTOs, constructor injection, `ApiException` factories for errors (RFC 7807).
- Entities with assigned UUIDs extend `AssignedIdEntity` (avoids merge-on-save).
- Tests are integration tests on Testcontainers PostgreSQL (`IntegrationTest` base); the app connects as the
  restricted `trustvault_app` role exactly as in production.
- Frontend: React + TypeScript, react-query, no `dangerouslySetInnerHTML`, no localStorage for anything sensitive,
  all mutations send `X-XSRF-TOKEN`.
