-- ─────────────────────────────────────────────────────────────────────────────
-- 0.8: a recipe imported from a recipe site (or written by hand): its ingredients as the site writes
-- them, one per line, the calories per serving entered by the member, and the link to the source.
-- ─────────────────────────────────────────────────────────────────────────────
alter table recipe add column manual_nutrition boolean not null default false;
alter table recipe add column ingredient_lines text;
alter table recipe add column source_url varchar(500);
