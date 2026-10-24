#!/bin/sh
# Idempotent equivalent of deploy/db/01-roles.sh for a managed PostgreSQL (RDS), run with the master user's
# credentials in PGHOST/PGUSER/PGPASSWORD before the backend starts. Passwords are re-applied on every run so the
# roles follow the values in Secrets Manager. PostgreSQL 16 requires the creator to hold membership before it can
# hand ownership of the database/schema to trustvault_owner, hence the GRANT ... TO CURRENT_USER.
set -eu
psql -v ON_ERROR_STOP=1 -d postgres -v owner_pw="$TV_DB_OWNER_PASSWORD" -v app_pw="$TV_DB_APP_PASSWORD" <<'SQL'
SELECT pg_advisory_lock(7240101);
SELECT 'CREATE ROLE trustvault_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trustvault_owner') \gexec
SELECT 'CREATE ROLE trustvault_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trustvault_app') \gexec
ALTER ROLE trustvault_owner PASSWORD :'owner_pw';
ALTER ROLE trustvault_app PASSWORD :'app_pw';
GRANT trustvault_owner TO CURRENT_USER;
SELECT 'CREATE DATABASE trustvault OWNER trustvault_owner'
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'trustvault') \gexec
REVOKE ALL ON DATABASE trustvault FROM PUBLIC;
GRANT CONNECT ON DATABASE trustvault TO trustvault_owner, trustvault_app;
\connect trustvault
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO trustvault_owner;
GRANT USAGE ON SCHEMA public TO trustvault_app;
SQL
echo "database roles ready"
