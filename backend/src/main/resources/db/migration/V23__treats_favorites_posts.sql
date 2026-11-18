-- ─────────────────────────────────────────────────────────────────────────────
-- 1.9: « Plaisir », a kind of recipe for the pastries and the treats; favourite foods and recipes; what one shares
-- with one's friends (the progress, the meals of a day) and their cheers.
-- ─────────────────────────────────────────────────────────────────────────────
alter table recipe drop constraint recipe_type_ck;
alter table recipe add constraint recipe_type_ck
  check (type in ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'TREAT', 'DRINK'));

-- the community's pastries and sweet treats of 1.7 are « Plaisir » too (their main type stays)
update recipe set types = types || ',TREAT'
where id in (select recipe_id from community_seed where key in (
    'gaufres', 'crepes', 'banana-bread', 'mousse-au-chocolat', 'tiramisu', 'creme-brulee', 'creme-caramel', 'flan-patissier',
    'tarte-aux-pommes', 'tarte-tatin', 'clafoutis-aux-cerises', 'fondant-au-chocolat', 'gateau-au-yaourt',
    'cookies-aux-pepites-de-chocolat', 'brownie', 'cheesecake', 'crumble-aux-pommes', 'ile-flottante', 'far-breton',
    'quatre-quarts', 'madeleines', 'tarte-au-citron-meringuee'))
  and types not like '%TREAT%';

-- a food (Ciqual, Open Food Facts, one's own) or a recipe kept as a favourite, to add it in one tap
create table favorite (
  user_id     uuid        not null references app_user (id) on delete cascade,
  food_id     uuid references food (id) on delete cascade,
  recipe_id   uuid references recipe (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint favorite_one_ck check ((food_id is null) <> (recipe_id is null))
);
create unique index favorite_food_ux on favorite (user_id, food_id) where food_id is not null;
create unique index favorite_recipe_ux on favorite (user_id, recipe_id) where recipe_id is not null;

-- shown to one's friends: a snapshot made by the server when shared (PROGRESS: the way to the goal, DAY: a day's
-- meals), one of each kind a day, kept 30 days
create table friend_post (
  id          uuid primary key,
  user_id     uuid        not null references app_user (id) on delete cascade,
  kind        varchar(12) not null,
  day         date        not null,
  payload     text        not null,
  created_at  timestamptz not null default now(),
  constraint friend_post_kind_ck check (kind in ('PROGRESS', 'DAY')),
  constraint friend_post_one_ux unique (user_id, kind, day)
);
create index friend_post_user_ix on friend_post (user_id, created_at desc);

create table friend_post_cheer (
  post_id     uuid        not null references friend_post (id) on delete cascade,
  user_id     uuid        not null references app_user (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
