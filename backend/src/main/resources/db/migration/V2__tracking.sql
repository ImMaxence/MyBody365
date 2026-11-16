-- ─────────────────────────────────────────────────────────────────────────────
-- Tracking: the body profile filled in after the consents, and the daily body log
-- ─────────────────────────────────────────────────────────────────────────────

-- What the forecast and the calorie target need. One row per account, created by the onboarding.
create table body_profile (
  user_id          uuid primary key references app_user (id) on delete cascade,
  sex              varchar(8)    not null,
  birth_date       date          not null,
  height_cm        numeric(4, 1) not null,
  activity_level   varchar(16)   not null,
  start_weight_kg  numeric(5, 2) not null,
  start_date       date          not null,
  goal_weight_kg   numeric(5, 2) not null,
  -- the pace chosen for the goal, in kg per week (0.25, 0.5, 0.75 or 1)
  weekly_rate_kg   numeric(3, 2) not null,
  updated_at       timestamptz   not null default now(),
  constraint body_profile_sex_ck check (sex in ('FEMALE', 'MALE', 'OTHER')),
  constraint body_profile_activity_ck check (activity_level in ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE')),
  constraint body_profile_height_ck check (height_cm between 100 and 250),
  constraint body_profile_weights_ck check (start_weight_kg between 30 and 350 and goal_weight_kg between 30 and 350),
  constraint body_profile_rate_ck check (weekly_rate_kg between 0.1 and 1.0)
);

-- One line per day: the weigh-in and, optionally, measurements. A day with a weight validates the streak.
create table body_log (
  user_id       uuid          not null references app_user (id) on delete cascade,
  day           date          not null,
  weight_kg     numeric(5, 2),
  body_fat_pct  numeric(4, 1),
  waist_cm      numeric(5, 1),
  hips_cm       numeric(5, 1),
  chest_cm      numeric(5, 1),
  arm_cm        numeric(5, 1),
  thigh_cm      numeric(5, 1),
  note          varchar(200),
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  primary key (user_id, day),
  constraint body_log_weight_ck check (weight_kg is null or weight_kg between 30 and 350),
  constraint body_log_fat_ck check (body_fat_pct is null or body_fat_pct between 2 and 70)
);
create index body_log_user_day_ix on body_log (user_id, day desc);
