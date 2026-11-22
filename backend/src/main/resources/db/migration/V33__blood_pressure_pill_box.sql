-- 1.17: two optional modules, off until the member turns them on in the profile: the blood pressure (morning and evening,
-- the average of 1 to 3 readings) and the pill box (one's treatments, their times, the intakes ticked, a reminder).
alter table app_user add column bp_enabled boolean not null default false;
alter table app_user add column pills_enabled boolean not null default false;

create table bp_log (
    user_id uuid not null references app_user (id) on delete cascade,
    day date not null,
    moment varchar(10) not null,
    systolic smallint not null,
    diastolic smallint not null,
    pulse smallint,
    readings smallint not null default 1,
    measured_at timestamptz not null default now(),
    primary key (user_id, day, moment)
);

-- the blood pressure reminders, morning and evening, each at most once a day and only when not measured yet
alter table notification_pref add column bp_reminder boolean not null default true;
alter table notification_pref add column bp_morning time not null default '07:30';
alter table notification_pref add column bp_evening time not null default '21:00';
alter table notification_pref add column last_bp_morning date;
alter table notification_pref add column last_bp_evening date;

create table medication (
    id uuid primary key,
    user_id uuid not null references app_user (id) on delete cascade,
    name varchar(60) not null,
    dose varchar(40),
    -- « 08:00,20:00 »: the times of the day it is taken
    times varchar(60) not null,
    -- ISO days, « 1,2,3,4,5,6,7 »
    days varchar(20) not null default '1,2,3,4,5,6,7',
    reminders boolean not null default true,
    created_at timestamptz not null default now()
);
create index medication_user_ix on medication (user_id);

create table medication_intake (
    medication_id uuid not null references medication (id) on delete cascade,
    day date not null,
    slot time not null,
    taken_at timestamptz not null default now(),
    primary key (medication_id, day, slot)
);

-- a reminder sent for an intake (never twice, kept 30 days by RetentionJob)
create table medication_reminder (
    medication_id uuid not null references medication (id) on delete cascade,
    day date not null,
    slot time not null,
    primary key (medication_id, day, slot)
);
