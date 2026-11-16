-- ─────────────────────────────────────────────────────────────────────────────
-- Meals: the foods (Ciqual, Open Food Facts, the account's own), recipes, and what was eaten each day.
-- Every meal line keeps a copy of the nutrients it was logged with: a food updated or removed later
-- never changes the past.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;

-- Nutrients per 100 g. source: CIQUAL (imported by an admin, one row per food and table version),
-- OFF (Open Food Facts, cached when searched or scanned), USER (entered by an account, private).
create table food (
  id                    uuid primary key,
  source                varchar(8)    not null,
  source_code           varchar(32),
  source_version        varchar(16),
  owner_id              uuid references app_user (id) on delete cascade,
  name                  varchar(200)  not null,
  name_en               varchar(200),
  brand                 varchar(160),
  category              varchar(160),
  -- lower case, without accents: what the search looks into (trigram index)
  search_name           varchar(400)  not null,
  kcal                  numeric(7, 2) not null,
  protein_g             numeric(6, 2),
  carbs_g               numeric(6, 2),
  sugars_g              numeric(6, 2),
  fat_g                 numeric(6, 2),
  sat_fat_g             numeric(6, 2),
  fiber_g               numeric(6, 2),
  salt_g                numeric(7, 3),
  nutriscore            char(1),
  nutriscore_estimated  boolean       not null default false,
  serving_g             numeric(7, 2),
  -- an older Ciqual version: kept for the meals logged with it, hidden from searches
  superseded            boolean       not null default false,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),
  constraint food_source_ck check (source in ('CIQUAL', 'OFF', 'USER')),
  constraint food_owner_ck check ((source = 'USER') = (owner_id is not null)),
  constraint food_kcal_ck check (kcal between 0 and 1000),
  constraint food_nutriscore_ck check (nutriscore is null or nutriscore in ('a', 'b', 'c', 'd', 'e'))
);
create unique index food_off_code_uq on food (source_code) where source = 'OFF';
create unique index food_ciqual_uq on food (source_code, source_version) where source = 'CIQUAL';
create index food_owner_ix on food (owner_id) where owner_id is not null;
create index food_search_trgm_ix on food using gin (search_name gin_trgm_ops);

-- One line per Ciqual import started by an admin, with its progress (polled by the admin screen).
create table ciqual_import (
  id           uuid primary key,
  version      varchar(16),
  status       varchar(12)  not null,
  step         varchar(24),
  progress     integer      not null default 0,
  foods        integer,
  message      varchar(500),
  started_by   uuid references app_user (id) on delete set null,
  started_at   timestamptz  not null default now(),
  finished_at  timestamptz,
  constraint ciqual_import_status_ck check (status in ('RUNNING', 'DONE', 'UP_TO_DATE', 'FAILED'))
);

create table recipe (
  id             uuid primary key,
  owner_id       uuid          not null references app_user (id) on delete cascade,
  name           varchar(120)  not null,
  type           varchar(12)   not null,
  servings       integer       not null,
  notes          varchar(4000),
  -- in the community view; hidden: removed from it by a moderator
  shared         boolean       not null default false,
  hidden         boolean       not null default false,
  image_format   varchar(8),
  image_bytes    bigint,
  image_version  integer       not null default 0,
  -- per serving, computed when the recipe is saved
  kcal           numeric(7, 1) not null default 0,
  protein_g      numeric(6, 1),
  carbs_g        numeric(6, 1),
  fat_g          numeric(6, 1),
  sugars_g       numeric(6, 1),
  fiber_g        numeric(6, 1),
  sat_fat_g      numeric(6, 1),
  salt_g         numeric(6, 2),
  serving_g      numeric(7, 1),
  nutriscore     char(1),
  score          integer       not null default 0,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  shared_at      timestamptz,
  constraint recipe_type_ck check (type in ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'DRINK')),
  constraint recipe_servings_ck check (servings between 1 and 50)
);
create index recipe_owner_ix on recipe (owner_id);
create index recipe_community_ix on recipe (score desc, shared_at desc) where shared and not hidden;

create table recipe_ingredient (
  id          uuid primary key,
  recipe_id   uuid          not null references recipe (id) on delete cascade,
  position    integer       not null,
  food_id     uuid references food (id) on delete set null,
  name        varchar(200)  not null,
  grams       numeric(7, 1) not null,
  kcal        numeric(7, 2) not null,
  protein_g   numeric(6, 2),
  carbs_g     numeric(6, 2),
  sugars_g    numeric(6, 2),
  fat_g       numeric(6, 2),
  sat_fat_g   numeric(6, 2),
  fiber_g     numeric(6, 2),
  salt_g      numeric(7, 3),
  constraint recipe_ingredient_grams_ck check (grams > 0 and grams <= 10000)
);
create index recipe_ingredient_recipe_ix on recipe_ingredient (recipe_id, position);

create table recipe_vote (
  recipe_id  uuid      not null references recipe (id) on delete cascade,
  user_id    uuid      not null references app_user (id) on delete cascade,
  value      smallint  not null,
  primary key (recipe_id, user_id),
  constraint recipe_vote_value_ck check (value in (-1, 1))
);

create table meal_entry (
  id          uuid primary key,
  user_id     uuid          not null references app_user (id) on delete cascade,
  day         date          not null,
  slot        varchar(10)   not null,
  food_id     uuid references food (id) on delete set null,
  recipe_id   uuid references recipe (id) on delete set null,
  name        varchar(200)  not null,
  detail      varchar(200),
  grams       numeric(7, 1),
  servings    numeric(5, 2),
  kcal        numeric(7, 1) not null,
  protein_g   numeric(6, 1),
  carbs_g     numeric(6, 1),
  fat_g       numeric(6, 1),
  sugars_g    numeric(6, 1),
  fiber_g     numeric(6, 1),
  sat_fat_g   numeric(6, 1),
  salt_g      numeric(6, 2),
  nutriscore  char(1),
  created_at  timestamptz   not null default now(),
  constraint meal_entry_slot_ck check (slot in ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
  constraint meal_entry_amount_ck check (grams is not null or servings is not null)
);
create index meal_entry_user_day_ix on meal_entry (user_id, day);
create index meal_entry_user_recent_ix on meal_entry (user_id, created_at desc);
