-- ─────────────────────────────────────────────────────────────────────────────
-- MyBody365 — accounts, access, sessions and the admin journal
-- ─────────────────────────────────────────────────────────────────────────────

-- People who can use the app. A row exists before the first sign-in when an admin approves a request
-- (google_sub is then filled by the first Google sign-in).
create table app_user (
  id                 uuid primary key,
  email              varchar(254) not null unique,
  google_sub         varchar(255) unique,
  google_email       varchar(254),
  display_name       varchar(80)  not null,
  avatar_url         varchar(1000),
  role               varchar(16)  not null default 'USER',
  status             varchar(16)  not null default 'ACTIVE',
  locale             varchar(5)   not null default 'fr',
  -- "I am 18 or older" and the explicit consent for health data (GDPR art. 9), both required to use the app
  adult_confirmed_at timestamptz,
  health_consent_at  timestamptz,
  created_at         timestamptz  not null default now(),
  last_login_at      timestamptz,
  last_login_method  varchar(16),
  constraint app_user_role_ck check (role in ('USER', 'ADMIN')),
  constraint app_user_status_ck check (status in ('ACTIVE', 'SUSPENDED'))
);

-- "Request access" (new people) and "I lost access to my account" (existing people), reviewed by admins.
create table access_request (
  id          uuid primary key,
  email       varchar(254) not null,
  name        varchar(80)  not null,
  message     varchar(500),
  kind        varchar(16)  not null,
  status      varchar(16)  not null default 'PENDING',
  ip          varchar(64),
  created_at  timestamptz  not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references app_user (id) on delete set null,
  constraint access_request_kind_ck check (kind in ('NEW_ACCESS', 'LOST_ACCESS')),
  constraint access_request_status_ck check (status in ('PENDING', 'APPROVED', 'REJECTED'))
);
create index access_request_status_ix on access_request (status, created_at desc);

-- One-time links made by an admin: INVITE (first sign-in of an approved person) or RECOVERY (lost access).
-- Only the SHA-256 of the token is kept; the link itself is shown once, to the admin who made it.
create table account_link (
  id          uuid primary key,
  user_id     uuid         not null references app_user (id) on delete cascade,
  kind        varchar(16)  not null,
  token_hash  varchar(64)  not null unique,
  created_by  uuid references app_user (id) on delete set null,
  created_at  timestamptz  not null default now(),
  expires_at  timestamptz  not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid references app_user (id) on delete set null,
  constraint account_link_kind_ck check (kind in ('INVITE', 'RECOVERY'))
);
create index account_link_user_ix on account_link (user_id, created_at desc);

-- What admins did, newest first in the admin "Journal".
create table admin_audit (
  id            bigserial primary key,
  actor_id      uuid references app_user (id) on delete set null,
  actor_email   varchar(254) not null,
  action        varchar(48)  not null,
  target_type   varchar(32),
  target_id     varchar(64),
  target_label  varchar(254),
  details       varchar(2000),
  ip            varchar(64),
  created_at    timestamptz  not null default now()
);
create index admin_audit_created_ix on admin_audit (created_at desc);

-- ── Passkeys: Spring Security's JDBC schema (spring-security-webauthn) ───────
create table user_entities (
  id           varchar(1000) not null,
  name         varchar(100)  not null,
  display_name varchar(200),
  primary key (id)
);
create unique index user_entities_name_ix on user_entities (name);

create table user_credentials (
  credential_id                varchar(1000) not null,
  user_entity_user_id          varchar(1000) not null,
  public_key                   bytea         not null,
  signature_count              bigint,
  uv_initialized               boolean,
  backup_eligible              boolean       not null,
  authenticator_transports     varchar(1000),
  public_key_credential_type   varchar(100),
  backup_state                 boolean       not null,
  attestation_object           bytea,
  attestation_client_data_json bytea,
  created                      timestamp,
  last_used                    timestamp,
  label                        varchar(1000) not null,
  primary key (credential_id)
);
create index user_credentials_user_ix on user_credentials (user_entity_user_id);

-- ── HTTP sessions: Spring Session's JDBC schema (PostgreSQL) ──────────────────
create table spring_session (
  primary_id            char(36) not null,
  session_id            char(36) not null,
  creation_time         bigint   not null,
  last_access_time      bigint   not null,
  max_inactive_interval int      not null,
  expiry_time           bigint   not null,
  principal_name        varchar(100),
  constraint spring_session_pk primary key (primary_id)
);
create unique index spring_session_ix1 on spring_session (session_id);
create index spring_session_ix2 on spring_session (expiry_time);
create index spring_session_ix3 on spring_session (principal_name);

create table spring_session_attributes (
  session_primary_id char(36)     not null,
  attribute_name     varchar(200) not null,
  attribute_bytes    bytea        not null,
  constraint spring_session_attributes_pk primary key (session_primary_id, attribute_name),
  constraint spring_session_attributes_fk foreign key (session_primary_id)
    references spring_session (primary_id) on delete cascade
);
