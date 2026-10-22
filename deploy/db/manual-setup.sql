-- One-time database setup for a PostgreSQL you run yourself (no Docker).
-- Run as a superuser:
--   psql -U postgres -v owner_pw='...' -v app_pw='...' -f deploy/db/manual-setup.sql
-- Equivalent to deploy/db/01-roles.sh, which the Docker image runs automatically.
-- Tables, triggers and grants are created afterwards by Flyway when the backend starts.

CREATE ROLE trustvault_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE trustvault_app   LOGIN PASSWORD :'app_pw'   NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE trustvault OWNER trustvault_owner;
REVOKE ALL ON DATABASE trustvault FROM PUBLIC;
GRANT CONNECT ON DATABASE trustvault TO trustvault_owner, trustvault_app;
\connect trustvault
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO trustvault_owner;
GRANT USAGE ON SCHEMA public TO trustvault_app;
