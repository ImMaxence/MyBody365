-- ─────────────────────────────────────────────────────────────────────────────
-- Engagement: Web Push subscriptions, reminder settings, workout sessions, and the app's own keys.
-- ─────────────────────────────────────────────────────────────────────────────

-- generated once by the app (the VAPID key pair of Web Push), never shown
create table app_secret (
  name        varchar(64) primary key,
  value       text        not null,
  created_at  timestamptz not null default now()
);

-- one row per device where notifications were allowed
create table push_subscription (
  id            uuid primary key,
  user_id       uuid          not null references app_user (id) on delete cascade,
  endpoint      varchar(1000) not null unique,
  p256dh        varchar(200)  not null,
  auth          varchar(100)  not null,
  created_at    timestamptz   not null default now(),
  last_used_at  timestamptz
);
create index push_subscription_user_ix on push_subscription (user_id);

create table notification_pref (
  user_id          uuid primary key references app_user (id) on delete cascade,
  daily_enabled    boolean     not null default true,
  daily_time       time        not null default '08:00',
  gym_enabled      boolean     not null default false,
  -- ISO days of the week, "1,3,5" = Monday, Wednesday, Friday
  gym_days         varchar(20) not null default '1,3,5',
  gym_time         time        not null default '18:00',
  friends_enabled  boolean     not null default true,
  last_daily       date,
  last_gym         date
);

create table workout_session (
  id            uuid primary key,
  user_id       uuid          not null references app_user (id) on delete cascade,
  day           date          not null,
  program       varchar(40)   not null,
  workout       varchar(40)   not null,
  duration_min  integer,
  -- what was done, as the app sent it (exercise ids, sets, weights)
  exercises     text          not null,
  note          varchar(500),
  created_at    timestamptz   not null default now(),
  constraint workout_duration_ck check (duration_min is null or duration_min between 1 and 600)
);
create index workout_session_user_ix on workout_session (user_id, day desc);
