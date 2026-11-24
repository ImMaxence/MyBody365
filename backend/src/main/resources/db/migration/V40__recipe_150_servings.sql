-- 1.20.8: a recipe for up to 150 portions (a buffet, a big batch), 50 before; an ingredient up to 30 kg (150 × 200 g), 10 kg before
alter table recipe drop constraint recipe_servings_ck;
alter table recipe add constraint recipe_servings_ck check (servings between 1 and 150);
alter table recipe_ingredient drop constraint recipe_ingredient_grams_ck;
alter table recipe_ingredient add constraint recipe_ingredient_grams_ck check (grams > 0 and grams <= 30000);
