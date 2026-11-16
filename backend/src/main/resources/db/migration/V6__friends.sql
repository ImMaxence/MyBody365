-- ─────────────────────────────────────────────────────────────────────────────
-- Friends: invitations by link or QR code, friendships, nudges, photos shared one by one, and the
-- reports members send about what is shared with them (a reported photo is the only kind an admin sees).
-- ─────────────────────────────────────────────────────────────────────────────

-- a friend link: only the SHA-256 of its token is kept; usable by several friends until it expires
create table friend_invite (
  token_hash  varchar(64) primary key,
  user_id     uuid        not null references app_user (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index friend_invite_user_ix on friend_invite (user_id);

-- one row per pair, the smaller id first
create table friendship (
  user_a      uuid        not null references app_user (id) on delete cascade,
  user_b      uuid        not null references app_user (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendship_order_ck check (user_a < user_b)
);
create index friendship_b_ix on friendship (user_b);

-- at most one nudge a day from one friend to another
create table friend_nudge (
  from_id  uuid not null references app_user (id) on delete cascade,
  to_id    uuid not null references app_user (id) on delete cascade,
  day      date not null,
  primary key (from_id, to_id, day)
);

create table photo_share (
  photo_id    uuid        not null references photo (id) on delete cascade,
  friend_id   uuid        not null references app_user (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (photo_id, friend_id)
);
create index photo_share_friend_ix on photo_share (friend_id);

create table report (
  id           uuid primary key,
  reporter_id  uuid references app_user (id) on delete set null,
  target_type  varchar(8)   not null,
  target_id    uuid         not null,
  owner_id     uuid references app_user (id) on delete cascade,
  reason       varchar(16)  not null,
  comment      varchar(500),
  status       varchar(10)  not null default 'OPEN',
  created_at   timestamptz  not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references app_user (id) on delete set null,
  constraint report_type_ck check (target_type in ('RECIPE', 'PHOTO')),
  constraint report_reason_ck check (reason in ('INAPPROPRIATE', 'ILLEGAL', 'SPAM', 'OTHER')),
  constraint report_status_ck check (status in ('OPEN', 'DISMISSED', 'ACTIONED'))
);
create unique index report_open_uq on report (reporter_id, target_type, target_id) where status = 'OPEN';
create index report_status_ix on report (status, created_at);
