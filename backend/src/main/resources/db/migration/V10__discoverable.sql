-- ─────────────────────────────────────────────────────────────────────────────
-- 0.8: suggestions while typing a username (friends search). A member can opt out: they are then only
-- found with their exact username.
-- ─────────────────────────────────────────────────────────────────────────────
alter table app_user add column discoverable boolean not null default true;
create index app_user_username_prefix_ix on app_user (username text_pattern_ops);
