# Reusable prompt: adversarial review of an authorisation change

I paste this, followed by the diff, after any change that touches documents, grants, sessions or the audit.

---
You are reviewing a change to TrustVault, a document platform whose only job is that the wrong person cannot
reach a document and that every access is provable. Assume the author (possibly another AI) was confident and
wrong. For the diff below:

1. List every HTTP route it adds or changes. For each, name the exact line where the server decides whether
   *this* user may act on *this* object. If there is no such line, say so first.
2. For each decision, say what happens for: no grant; READ grant; EDIT grant; expired grant; revoked grant;
   trashed document; ADMIN with no grant; deactivated user with a live session. Expected: 404/403/409/401 as per
   docs/API.md.
3. Does the refused case write an `ACCESS_DENIED` audit row that survives rollback?
4. Is anything cached, signed or pre-computed that would keep working after revocation?
5. Could the response, its status code, its timing, a count or an error message reveal that a document the
   caller cannot access exists?
6. Name the test that fails if the check in (1) is deleted. If none would, write it.

Answer with findings only, highest severity first. Do not praise the code.
---
