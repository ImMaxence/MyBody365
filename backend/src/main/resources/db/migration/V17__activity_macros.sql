-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7: the day's activity in two answers, the job and the sessions of sport a week, instead of one level
-- (the levels mixed both and led to overestimate it). A profile saved before keeps its level until the
-- member answers the two questions. And the macro split the member chose (balanced by default).
-- ─────────────────────────────────────────────────────────────────────────────
alter table body_profile add column job varchar(20);
alter table body_profile add column sessions_per_week integer;
alter table body_profile add column macro_split varchar(20) not null default 'BALANCED';
alter table body_profile add constraint body_profile_job_ck check (job is null or job in ('SEATED', 'STANDING', 'PHYSICAL'));
alter table body_profile add constraint body_profile_sessions_ck check (sessions_per_week is null or sessions_per_week between 0 and 14);
alter table body_profile add constraint body_profile_split_ck check (macro_split in ('BALANCED', 'PROTEIN', 'LOW_CARB'));
