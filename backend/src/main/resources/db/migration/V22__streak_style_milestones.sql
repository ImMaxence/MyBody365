-- ─────────────────────────────────────────────────────────────────────────────
-- 1.8: the streak's own look (an icon and a colour chosen by the member, the flame by default), and milestones of
-- one's own on the way to the goal (a weight, an optional reward, the day it was reached).
-- ─────────────────────────────────────────────────────────────────────────────
alter table app_user add column streak_icon varchar(16);
alter table app_user add column streak_color varchar(16);

create table weight_milestone (
  id          uuid primary key,
  user_id     uuid          not null references app_user (id) on delete cascade,
  target_kg   numeric(5, 1) not null,
  reward      varchar(80),
  reached_on  date,
  created_at  timestamptz   not null default now(),
  constraint weight_milestone_target_ck check (target_kg between 30 and 300),
  constraint weight_milestone_unique unique (user_id, target_kg)
);
