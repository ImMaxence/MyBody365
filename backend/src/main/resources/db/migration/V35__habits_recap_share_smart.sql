-- 1.19: « Mes repas habituels »: a meal one has often (its name, the slot it is for, its lines as they were noted, with what
-- they were worth), added again in one tap
create table meal_template (
  id uuid primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  name varchar(80) not null,
  slot varchar(10),
  items jsonb not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index meal_template_user_ix on meal_template (user_id);

-- 1.19: a read-only link for a coach or a dietitian: only the hash of its token is kept, what it shows, until when, revocable,
-- how many times it was opened
create table share_link (
  id uuid primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  token_hash varchar(64) not null unique,
  label varchar(60),
  scopes varchar(40) not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  opened_count integer not null default 0,
  last_opened_at timestamptz
);
create index share_link_user_ix on share_link (user_id);

-- 1.19: the weigh-in and photo reminders at the time one does them (opt-in, worked out each night from the last two weeks),
-- and the monthly recap, said once a month
alter table notification_pref
  add column smart_time boolean not null default false,
  add column smart_daily_time time,
  add column smart_photo_time time,
  add column last_recap varchar(7);
