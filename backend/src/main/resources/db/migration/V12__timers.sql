-- ─────────────────────────────────────────────────────────────────────────────
-- 1.0: the timers a member saves under a name of their own (effort, rest, rounds).
-- ─────────────────────────────────────────────────────────────────────────────
create table timer_preset (
  id          uuid        primary key,
  user_id     uuid        not null references app_user (id) on delete cascade,
  name        varchar(30) not null,
  work_s      integer     not null,
  rest_s      integer     not null,
  rounds      integer     not null,
  created_at  timestamptz not null default now(),
  constraint timer_preset_values_ck check (work_s between 5 and 3600 and rest_s between 0 and 600 and rounds between 1 and 30)
);
create index timer_preset_user_ix on timer_preset (user_id, created_at);
