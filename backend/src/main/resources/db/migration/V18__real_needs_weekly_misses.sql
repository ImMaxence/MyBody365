-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7: the calorie target from the member's real numbers (meals and weigh-ins of the last weeks), when
-- they ask for it; off by default, the formula counts.
-- ─────────────────────────────────────────────────────────────────────────────
alter table body_profile add column adaptive_tdee boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7: the summary of the week, a notification on Sunday evening (nothing personal in its text).
-- ─────────────────────────────────────────────────────────────────────────────
alter table notification_pref add column weekly_enabled boolean not null default true;
alter table notification_pref add column last_weekly date;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7: the ingredient lines of imported recipes that found no food, or no weight: what to add to the table
-- of usual foods. The lines of public recipe sites only, nobody's name with them.
-- ─────────────────────────────────────────────────────────────────────────────
create table ingredient_miss (
  key      varchar(120) not null,
  reason   varchar(10)  not null check (reason in ('FOOD', 'WEIGHT')),
  example  varchar(300) not null,
  count    integer      not null default 1,
  last_at  timestamptz  not null default now(),
  primary key (key, reason)
);
create index ingredient_miss_count_ix on ingredient_miss (count desc, last_at desc);
