-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7: the community's first recipes, written by the MyBody365 team (resources/community). Each one is added once:
-- its key stays here even when an admin deletes the recipe, so that it never comes back.
-- ─────────────────────────────────────────────────────────────────────────────
create table community_seed (
  key        varchar(140) primary key,
  recipe_id  uuid references recipe (id) on delete set null,
  seeded_at  timestamptz not null default now()
);
