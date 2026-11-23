-- 1.20: a recipe made of foods is fried when its ingredients say so (a fried food, or a fried dish's name with enough fat in it),
-- not its name alone: oven-baked nems are not; null for a recipe noted by hand (its name tells). Filled at the next start
-- (meals/FreeSugarsFill).
alter table recipe add column fried boolean;
