#!/bin/sh
# Runs once, on first start of an empty Postgres volume (docker-entrypoint-initdb.d).
# Creates two least-privilege roles:
#   trustvault_owner - owns the schema; used only by Flyway migrations. Not a superuser.
#   trustvault_app   - used by the running application. Gets INSERT/SELECT only on audit_events (granted in V1 migration).
set -eu
: "${TV_DB_OWNER_PASSWORD:?TV_DB_OWNER_PASSWORD must be set}"
: "${TV_DB_APP_PASSWORD:?TV_DB_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$TV_DB_OWNER_PASSWORD" -v app_pw="$TV_DB_APP_PASSWORD" <<'SQL'
CREATE ROLE trustvault_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE trustvault_app   LOGIN PASSWORD :'app_pw'   NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE trustvault OWNER trustvault_owner;
REVOKE ALL ON DATABASE trustvault FROM PUBLIC;
GRANT CONNECT ON DATABASE trustvault TO trustvault_owner, trustvault_app;
\connect trustvault
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO trustvault_owner;
GRANT USAGE ON SCHEMA public TO trustvault_app;
SQL
