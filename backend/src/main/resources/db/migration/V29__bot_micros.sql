-- 1.14: the team account (the community's recipes) is a bot: it cannot sign in, nor be deleted, suspended or promoted.
-- Vitamins and minerals per 100 g (a food) or per serving (a recipe), as a JSON object of the keys the app knows:
-- a (vitamin A, µg RE), d (µg), e (mg), c (mg), b1, b2, b6 (mg), b9 (µg), b12 (µg), ca, fe, mg, k, zn (mg).

alter table app_user drop constraint app_user_role_ck;
alter table app_user add constraint app_user_role_ck check (role in ('USER', 'ADMIN', 'BOT'));
update app_user set role = 'BOT' where email = 'equipe@mybody365.invalid';

alter table food add column micros jsonb;
alter table recipe add column micros jsonb;
