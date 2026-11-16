-- ─────────────────────────────────────────────────────────────────────────────
-- 0.8: recipes for friends, a unique username for each account (to find a friend), friend requests,
-- and a profile picture of one's own.
-- ─────────────────────────────────────────────────────────────────────────────

-- who sees a recipe: the owner only, the owner's friends, or every member (the community);
-- "shared" stays, true exactly for PUBLIC (the community queries keep using it)
alter table recipe add column visibility varchar(8) not null default 'PRIVATE';
update recipe set visibility = 'PUBLIC' where shared;
alter table recipe add constraint recipe_visibility_ck check (visibility in ('PRIVATE', 'FRIENDS', 'PUBLIC'));
alter table recipe add constraint recipe_shared_ck check (shared = (visibility = 'PUBLIC'));
create index recipe_owner_visible_ix on recipe (owner_id) where visibility <> 'PRIVATE';

-- the username: lowercase letters, digits, dot and underscore, 3 to 20 characters, unique.
-- Made from the name ("Léa Martin" → "leamartin"), with "_2", "_3"… when taken: a name alone never
-- holds "_", so the numbered ones cannot collide with another name. The member can change it later.
create function username_stem(name text) returns text language sql immutable as $$
  select case when length(s) < 3 then s || 'fit' else s end
  from (select coalesce(nullif(left(regexp_replace(lower(translate(coalesce(name, ''),
          'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
          'aaaaaaceeeeiiiinooooouuuuyyoeAAAAAACEEEEIIIINOOOOOUUUUYY')), '[^a-z0-9]+', '', 'g'), 14), ''), 'membre') as s) x
$$;

alter table app_user add column username varchar(20);
with numbered as (
  select id, username_stem(display_name) as stem,
         row_number() over (partition by username_stem(display_name) order by created_at, id) as n
  from app_user
)
update app_user u
set username = n.stem || case when n.n > 1 then '_' || n.n::text else '' end
from numbered n
where n.id = u.id;
alter table app_user alter column username set not null;
alter table app_user add constraint app_user_username_ck check (username ~ '^[a-z0-9._]{3,20}$');
create unique index app_user_username_ux on app_user (username);

-- every new account (whatever creates it: Google sign-in, an admin, an access request) gets one at once
create function app_user_username() returns trigger language plpgsql as $$
declare
  stem text := username_stem(new.display_name);
  candidate text := stem;
  n integer := 1;
begin
  if new.username is not null then
    return new;
  end if;
  while exists (select 1 from app_user where username = candidate) loop
    n := n + 1;
    candidate := stem || '_' || n;
  end loop;
  new.username := candidate;
  return new;
end
$$;
create trigger app_user_username_tg before insert on app_user for each row execute function app_user_username();

-- a friend request sent from a username search: accepted (a friendship), declined or withdrawn (deleted)
create table friend_request (
  from_id     uuid        not null references app_user (id) on delete cascade,
  to_id       uuid        not null references app_user (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (from_id, to_id),
  constraint friend_request_self_ck check (from_id <> to_id)
);
create index friend_request_to_ix on friend_request (to_id);

-- a picture uploaded by the member (WebP, square, in the bucket under u/{id}/avatar_{version}.webp);
-- without one, the Google picture (avatar_url) is shown
alter table app_user add column avatar_version integer;
alter table app_user add column avatar_bytes bigint;
