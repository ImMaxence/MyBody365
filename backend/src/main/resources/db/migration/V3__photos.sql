-- ─────────────────────────────────────────────────────────────────────────────
-- Photos: the daily body photo, one per pose and per day. The pictures live in the object storage
-- (u/{user}/p/{id}.webp and {id}_t.webp for the thumbnail); this table holds what the app lists.
-- ─────────────────────────────────────────────────────────────────────────────

-- storage allowed for the account, in MB; null = the default (STORAGE_QUOTA_MB)
alter table app_user add column storage_quota_mb integer;
alter table app_user add constraint app_user_quota_ck check (storage_quota_mb is null or storage_quota_mb between 0 and 1048576);

create table photo (
  id           uuid primary key,
  user_id      uuid        not null references app_user (id) on delete cascade,
  day          date        not null,
  pose         varchar(8)  not null default 'FRONT',
  width        integer     not null,
  height       integer     not null,
  -- sizes of the stored picture and of its thumbnail, for the quota
  bytes        bigint      not null,
  thumb_bytes  bigint      not null,
  format       varchar(8)  not null,
  created_at   timestamptz not null default now(),
  constraint photo_pose_ck check (pose in ('FRONT', 'SIDE', 'BACK')),
  constraint photo_format_ck check (format in ('webp', 'jpeg')),
  constraint photo_day_pose_uq unique (user_id, day, pose)
);
create index photo_user_day_ix on photo (user_id, day desc);
