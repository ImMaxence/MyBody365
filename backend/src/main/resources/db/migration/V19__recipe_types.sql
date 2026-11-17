-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7: a recipe can be for several meals (a breakfast that is also a snack): all its types, the main one
-- first, comma-separated ("BREAKFAST,SNACK"); type stays the main one. Filtering by a type finds it in either.
-- ─────────────────────────────────────────────────────────────────────────────
alter table recipe add column types varchar(120);
update recipe set types = type;
