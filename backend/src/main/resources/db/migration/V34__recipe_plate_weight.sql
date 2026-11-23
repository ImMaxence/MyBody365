-- 1.18: what a serving of a recipe weighs on the plate, cooked (recipe/PlateWeight.java): « 412 kcal la part » says how big
-- a part is. Filled at start for the recipes there already, kept up to date at each save
alter table recipe add column plate_g numeric(7, 1);
