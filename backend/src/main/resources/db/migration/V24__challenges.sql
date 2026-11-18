-- ─────────────────────────────────────────────────────────────────────────────
-- 1.9: challenges between friends (a weigh-in, the water goal, the meals noted or the photo of the day, every day for
-- 7, 14 or 30 days), a milestone reached as a post for the friends, and an optional evening weigh-in.
-- ─────────────────────────────────────────────────────────────────────────────
create table challenge (
  id          uuid primary key,
  owner_id    uuid        not null references app_user (id) on delete cascade,
  kind        varchar(12) not null,
  start_day   date        not null,
  end_day     date        not null,
  created_at  timestamptz not null default now(),
  constraint challenge_kind_ck check (kind in ('WEIGH', 'WATER', 'MEALS', 'PHOTO')),
  constraint challenge_days_ck check (end_day >= start_day and end_day - start_day < 31)
);
create index challenge_owner_ix on challenge (owner_id);

-- the owner is a member too (JOINED); a friend invited answers (JOINED or DECLINED)
create table challenge_member (
  challenge_id  uuid        not null references challenge (id) on delete cascade,
  user_id       uuid        not null references app_user (id) on delete cascade,
  status        varchar(8)  not null,
  invited_at    timestamptz not null default now(),
  responded_at  timestamptz,
  primary key (challenge_id, user_id),
  constraint challenge_member_status_ck check (status in ('INVITED', 'JOINED', 'DECLINED'))
);
create index challenge_member_user_ix on challenge_member (user_id);

alter table friend_post drop constraint friend_post_kind_ck;
alter table friend_post add constraint friend_post_kind_ck check (kind in ('PROGRESS', 'DAY', 'MILESTONE'));

-- an optional evening weigh-in (1.9), next to the morning one: shown for itself, never in the trend nor the streak
alter table body_log add column evening_weight_kg numeric(5, 2);
alter table body_log add constraint body_log_evening_ck check (evening_weight_kg is null or evening_weight_kg between 30 and 350);
