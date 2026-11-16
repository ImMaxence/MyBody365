-- ─────────────────────────────────────────────────────────────────────────────
-- Backups: the Google Drive link of an account (its refresh token, encrypted) and the backups waiting
-- to be restored once their preview is confirmed.
-- ─────────────────────────────────────────────────────────────────────────────

create table drive_link (
  user_id            uuid primary key references app_user (id) on delete cascade,
  -- AES-GCM, key derived from the OAuth client secret: useless without the server's configuration
  refresh_token_enc  text         not null,
  auto_backup        boolean      not null default true,
  created_at         timestamptz  not null default now(),
  last_backup_at     timestamptz,
  last_status        varchar(12),
  last_error         varchar(300)
);

-- an uploaded (or downloaded) backup, kept one hour for its preview to be confirmed
create table restore_upload (
  token       varchar(64) primary key,
  user_id     uuid         not null references app_user (id) on delete cascade,
  storage_key varchar(300) not null,
  created_at  timestamptz  not null default now()
);
create index restore_upload_created_ix on restore_upload (created_at);
