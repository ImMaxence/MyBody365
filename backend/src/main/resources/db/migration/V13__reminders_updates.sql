-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1: water reminders, a word to everyone when a new version comes out, and a few values the app
-- keeps for itself (the last version announced).
-- ─────────────────────────────────────────────────────────────────────────────
alter table notification_pref
  -- "drink some water" at 10:00, 13:00, 16:00 and 19:00 when the day is behind (needs the glasses of water on)
  add column water_enabled   boolean     not null default false,
  -- a notification when a new version of the app is deployed
  add column updates_enabled boolean     not null default true,
  -- the last water reminder sent (at most one per time slot)
  add column last_water      timestamptz;

create table app_state (
  name        varchar(64) primary key,
  value       text        not null,
  updated_at  timestamptz not null default now()
);
-- the version running before this one: 1.1.0 itself is announced on its first start (ReleaseNotifier)
insert into app_state (name, value) values ('announced_version', '1.0.0');
