-- 1.20: the free sugars (the WHO's: added, honey, syrups, juices), estimated from what each food is (nutrition/FreeSugars): a
-- recipe's per serving, a meal line's as it was noted. Filled for what exists at the next start (meals/FreeSugarsFill).
alter table recipe add column free_sugars_g numeric(7, 2);
alter table meal_entry add column free_sugars_g numeric(7, 2);

-- 1.20: the meals planned for the days to come (a recipe and how many servings, a usual meal, or a note such as « Restaurant »),
-- turned into a meal line in one tap on the day, and into the shopping list. Not in the backups: a plan for the coming days.
create table meal_plan (
  id uuid primary key,
  user_id uuid not null references app_user(id) on delete cascade,
  day date not null,
  slot varchar(10) not null,
  recipe_id uuid references recipe(id) on delete cascade,
  template_id uuid references meal_template(id) on delete cascade,
  servings numeric(5, 2),
  note varchar(80),
  created_at timestamptz not null default now(),
  constraint meal_plan_one_thing check (num_nonnulls(recipe_id, template_id, note) = 1)
);
create index meal_plan_user_day_ix on meal_plan (user_id, day);
