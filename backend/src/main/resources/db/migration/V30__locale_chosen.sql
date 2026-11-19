-- 1.14: whether the account chose its language. Until it does, the app follows the language of the phone or the browser,
-- and tells it to the server for the notifications. An account in English chose it (French was the default).
alter table app_user add column locale_chosen boolean not null default false;
update app_user set locale_chosen = true where locale = 'en';
