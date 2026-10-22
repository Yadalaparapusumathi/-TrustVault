-- Mirrors deploy/db/01-roles.sh: the app connects as a role that is NOT the schema owner,
-- so the audit-table privilege restrictions are exercised for real in tests.
CREATE ROLE trustvault_app LOGIN PASSWORD 'app-test-password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
