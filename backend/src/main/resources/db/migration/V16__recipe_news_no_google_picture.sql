-- ─────────────────────────────────────────────────────────────────────────────
-- 1.6: a recipe shown to friends (or to everyone) is announced to the owner's friends by a notification,
-- once. The recipes already shown count as announced.
-- ─────────────────────────────────────────────────────────────────────────────
alter table recipe add column announced_at timestamptz;
update recipe set announced_at = coalesce(shared_at, created_at) where visibility <> 'PRIVATE';
create index recipe_announced_ix on recipe (owner_id, announced_at) where announced_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.6: no Google picture any more, the first letter of the name until the member picks a photo. The pictures
-- copied from Google are the first version of the Google accounts' pictures (a photo picked afterwards has
-- a later version): back to the initial, their files deleted from the bucket by AvatarCleanup.
-- ─────────────────────────────────────────────────────────────────────────────
create table avatar_cleanup (
  user_id  uuid    primary key references app_user (id) on delete cascade,
  version  integer not null
);
insert into avatar_cleanup (user_id, version)
  select id, avatar_version from app_user where google_sub is not null and avatar_version = 1;
update app_user set avatar_version = null, avatar_bytes = null where google_sub is not null and avatar_version = 1;
update app_user set avatar_url = null where avatar_url is not null;
