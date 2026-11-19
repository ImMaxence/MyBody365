-- 1.13: twenty « Biscoff » told apart and the best ones first, a health score out of 10 in place of the Nutri-Score,
-- drinks measured in millilitres, and « Healthy » recipes.

-- what Open Food Facts says of a product besides its nutrients (filled by the next import of the local copy): its size on
-- the shelf, its generic name, its food group (PNNS), how processed it is (NOVA 1 to 4), its additives, whether it holds
-- sweeteners, its share of fruit, vegetables and legumes, and how many people scanned it
alter table food add column quantity varchar(60);
alter table food add column generic_name varchar(200);
alter table food add column pnns varchar(40);
alter table food add column nova smallint;
alter table food add column additives smallint;
alter table food add column sweeteners boolean not null default false;
alter table food add column fruit_veg numeric(5, 1);
alter table food add column scans integer;
-- how many members noted the food over the last year (counted every hour): the popularity the searches rank by
alter table food add column uses integer not null default 0;

-- a recipe's share of fruit, vegetables, legumes and nuts (its health score counts it)
alter table recipe add column fruit_veg numeric(5, 1);
-- a recipe with an alcoholic drink in it has no health score (no amount of alcohol is good for health)
alter table recipe add column alcohol boolean not null default false;

-- a meal line keeps its health score as it keeps its nutrients, and whether it was measured in millilitres
alter table meal_entry add column health numeric(3, 1);
alter table meal_entry add column liquid boolean not null default false;

-- « Healthy », the recipes put first on the recipes page
alter table recipe drop constraint recipe_type_ck;
alter table recipe add constraint recipe_type_ck
  check (type in ('HEALTHY', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'TREAT', 'DRINK'));
