-- TrustVault schema. Runs as the schema owner (spring.flyway.user).
-- The application connects as ${appUser}, which receives only the privileges granted at the bottom of this file.

CREATE TABLE users (
    id                   uuid PRIMARY KEY,
    username             varchar(64) NOT NULL,
    display_name         varchar(120) NOT NULL,
    email                varchar(254),
    password_hash        varchar(100) NOT NULL,
    role                 varchar(16)  NOT NULL CHECK (role IN ('ADMIN', 'OWNER', 'VIEWER')),
    active               boolean      NOT NULL DEFAULT true,
    must_change_password boolean      NOT NULL DEFAULT false,
    failed_login_count   integer      NOT NULL DEFAULT 0,
    locked_until         timestamptz,
    last_login_at        timestamptz,
    password_changed_at  timestamptz  NOT NULL,
    created_at           timestamptz  NOT NULL,
    updated_at           timestamptz  NOT NULL
);
CREATE UNIQUE INDEX ux_users_username ON users (lower(username));

CREATE TABLE user_sessions (
    id           uuid PRIMARY KEY,
    token_hash   varchar(64) NOT NULL UNIQUE,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    expires_at   timestamptz NOT NULL,
    ip           varchar(64) ,
    user_agent   varchar(255)
);
CREATE INDEX ix_sessions_user ON user_sessions (user_id);

CREATE TABLE documents (
    id                uuid PRIMARY KEY,
    name              varchar(200)  NOT NULL,
    description       varchar(2000),
    category          varchar(50)   NOT NULL,
    classification    varchar(16)   NOT NULL CHECK (classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')),
    owner_id          uuid          NOT NULL REFERENCES users (id),
    current_version   integer       NOT NULL,
    size_bytes        bigint        NOT NULL,
    content_type      varchar(100)  NOT NULL,
    original_filename varchar(255)  NOT NULL,
    sha256            varchar(64) NOT NULL,
    created_at        timestamptz   NOT NULL,
    updated_at        timestamptz   NOT NULL,
    deleted_at        timestamptz,
    deleted_by        uuid REFERENCES users (id),
    purge_after       timestamptz,
    lock_version      bigint        NOT NULL DEFAULT 0
);
CREATE INDEX ix_documents_owner ON documents (owner_id);
CREATE INDEX ix_documents_created ON documents (created_at);
CREATE INDEX ix_documents_category ON documents (category);
CREATE INDEX ix_documents_purge ON documents (purge_after) WHERE deleted_at IS NOT NULL;

CREATE TABLE document_versions (
    id                uuid PRIMARY KEY,
    document_id       uuid         NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    version_no        integer      NOT NULL,
    size_bytes        bigint       NOT NULL,
    content_type      varchar(100) NOT NULL,
    original_filename varchar(255) NOT NULL,
    sha256            varchar(64) NOT NULL,
    uploaded_by       uuid         NOT NULL REFERENCES users (id),
    created_at        timestamptz  NOT NULL,
    -- data key wrapped (AES-256-GCM) with the master key; never stored in clear
    wrapped_key       bytea        NOT NULL,
    UNIQUE (document_id, version_no)
);

-- Ciphertext lives apart from metadata so metadata queries never page file bytes in.
CREATE TABLE document_blobs (
    version_id uuid PRIMARY KEY REFERENCES document_versions (id) ON DELETE CASCADE,
    ciphertext bytea NOT NULL
);

CREATE TABLE document_grants (
    id          uuid PRIMARY KEY,
    document_id uuid        NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    grantee_id  uuid        NOT NULL REFERENCES users (id),
    permission  varchar(8)  NOT NULL CHECK (permission IN ('READ', 'EDIT')),
    granted_by  uuid        NOT NULL REFERENCES users (id),
    source      varchar(16) NOT NULL CHECK (source IN ('MANUAL', 'SUGGESTION')),
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,
    expires_at  timestamptz,
    revoked_at  timestamptz,
    revoked_by  uuid REFERENCES users (id)
);
-- At most one live grant per person per document.
CREATE UNIQUE INDEX ux_grants_active ON document_grants (document_id, grantee_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_grants_grantee ON document_grants (grantee_id) WHERE revoked_at IS NULL;

CREATE TABLE access_suggestions (
    id                uuid PRIMARY KEY,
    document_id       uuid          NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    suggested_user_id uuid          NOT NULL REFERENCES users (id),
    permission        varchar(8)    NOT NULL CHECK (permission IN ('READ', 'EDIT')),
    score             numeric(4, 3) NOT NULL,
    reasons           text          NOT NULL,
    status            varchar(16)   NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DISMISSED', 'SUPERSEDED')),
    created_at        timestamptz   NOT NULL,
    decided_at        timestamptz,
    decided_by        uuid REFERENCES users (id)
);
CREATE INDEX ix_suggestions_doc ON access_suggestions (document_id, status);

-- Append-only, HMAC-chained audit log. No foreign keys on purpose: the record must outlive purged documents
-- and deleted users.
CREATE TABLE audit_events (
    seq            bigint PRIMARY KEY CHECK (seq > 0),
    occurred_at    timestamptz NOT NULL,
    actor_id       uuid,
    actor_username varchar(64) ,
    actor_role     varchar(16),
    action         varchar(40) NOT NULL,
    outcome        varchar(10) NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
    target_type    varchar(30),
    target_id      varchar(64) ,
    document_id    uuid,
    details        text        NOT NULL,
    ip             varchar(64) ,
    user_agent     varchar(255),
    request_id     varchar(64) ,
    prev_hash      varchar(64) NOT NULL,
    hash           varchar(64) NOT NULL UNIQUE
);
CREATE INDEX ix_audit_occurred ON audit_events (occurred_at);
CREATE INDEX ix_audit_document ON audit_events (document_id, seq);
CREATE INDEX ix_audit_actor ON audit_events (actor_id, occurred_at);
CREATE INDEX ix_audit_action ON audit_events (action, occurred_at);

CREATE FUNCTION audit_events_reject_change() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_audit_events_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_events_reject_change();

CREATE TRIGGER trg_audit_events_no_truncate
    BEFORE TRUNCATE ON audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION audit_events_reject_change();

-- Least privilege for the runtime role. Skipped when the platform only offers a single database user
-- (the triggers and the HMAC chain still apply in that case; see THREATS.md).
DO
$$
    DECLARE
        app_role text := '${appUser}';
    BEGIN
        IF app_role <> '' AND app_role <> current_user AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', current_schema(), app_role);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON users, user_sessions, documents, document_versions, '
                               || 'document_blobs, document_grants, access_suggestions TO %I', app_role);
            EXECUTE format('REVOKE ALL ON audit_events FROM %I', app_role);
            EXECUTE format('GRANT SELECT, INSERT ON audit_events TO %I', app_role);
        END IF;
    END
$$;
