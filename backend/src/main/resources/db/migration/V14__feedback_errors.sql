-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2: what members tell the creator (an idea, a bug), and the errors the app runs into, on the phones
-- and on the server, for the admins. Both can be archived once handled.
-- ─────────────────────────────────────────────────────────────────────────────
create table feedback (
  id           uuid          primary key,
  user_id      uuid          references app_user (id) on delete set null,
  kind         varchar(8)    not null,
  message      varchar(2000) not null,
  app_version  varchar(20),
  device       varchar(300),
  created_at   timestamptz   not null default now(),
  archived_at  timestamptz,
  constraint feedback_kind_ck check (kind in ('IDEA', 'BUG', 'OTHER'))
);
create index feedback_created_ix on feedback (created_at desc);

create table error_log (
  id           uuid          primary key,
  -- the same error again (same place, same message) only counts on its open line
  fingerprint  varchar(64)   not null,
  source       varchar(8)    not null,
  message      varchar(500)  not null,
  detail       varchar(8000),
  path         varchar(300),
  app_version  varchar(20),
  device       varchar(300),
  user_id      uuid          references app_user (id) on delete set null,
  occurrences  integer       not null default 1,
  first_seen   timestamptz   not null default now(),
  last_seen    timestamptz   not null default now(),
  archived_at  timestamptz,
  constraint error_log_source_ck check (source in ('APP', 'SERVER'))
);
create unique index error_log_open_ux on error_log (fingerprint) where archived_at is null;
create index error_log_seen_ix on error_log (last_seen desc);
