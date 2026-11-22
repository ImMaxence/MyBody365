-- 1.17: every notification the app sent a member, for the « Centre des notifications » (latest first, kept 90 days by
-- RetentionJob, not in the backups), and when the member last opened it (what came after is new).
create table notification_log (
    id uuid primary key,
    user_id uuid not null references app_user (id) on delete cascade,
    kind varchar(40) not null,
    title varchar(200) not null,
    body varchar(600) not null,
    url varchar(300) not null,
    created_at timestamptz not null default now()
);
create index notification_log_user_ix on notification_log (user_id, created_at desc);

alter table app_user add column notifications_seen_at timestamptz;

-- 1.17: the daily reminder of the challenges between friends whose day is not done yet, at its own time
alter table notification_pref add column challenge_enabled boolean not null default true;
alter table notification_pref add column challenge_time time not null default '20:00';
alter table notification_pref add column last_challenge date;
