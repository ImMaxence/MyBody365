-- ─────────────────────────────────────────────────────────────────────────────
-- 0.8: glasses of water (250 ml), an optional tracker: off until the member sets a goal in their profile.
-- ─────────────────────────────────────────────────────────────────────────────
create table water_log (
  user_id  uuid     not null references app_user (id) on delete cascade,
  day      date     not null,
  glasses  smallint not null,
  primary key (user_id, day),
  constraint water_log_glasses_ck check (glasses between 1 and 40)
);

-- the daily goal in glasses; null: the tracker is off
alter table app_user add column water_goal integer;
alter table app_user add constraint app_user_water_goal_ck check (water_goal between 1 and 30);
