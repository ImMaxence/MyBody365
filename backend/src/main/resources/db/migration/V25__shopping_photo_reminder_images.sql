-- 1.11: the shopping list (by supermarket aisle), its own reminder for the photo of the day, and the photos of the
-- community's recipes (Wikimedia Commons, credited).

create table shopping_item (
    id          uuid primary key,
    user_id     uuid not null references app_user (id) on delete cascade,
    -- the food it comes from (a recipe's ingredient); null: a line typed by the member
    food_id     uuid references food (id) on delete set null,
    name        varchar(300) not null,
    -- the weight for all the recipes added (null: no weight, a line typed by the member)
    grams       numeric(9, 1),
    -- G, ML (a liquid, 1 g = 1 ml) or PIECE (eggs: grams / piece_g)
    unit        varchar(8)  not null default 'G',
    aisle       varchar(24) not null,
    checked     boolean     not null default false,
    -- the recipes it is for, "Ratatouille, Chili con carne"
    recipes     varchar(400),
    created_at  timestamptz not null default now(),
    constraint shopping_item_unit_ck check (unit in ('G', 'ML', 'PIECE'))
);
create index shopping_item_user_ix on shopping_item (user_id);

alter table notification_pref add column photo_enabled boolean not null default false;
alter table notification_pref add column photo_time time not null default '19:00';
alter table notification_pref add column last_photo date;

-- who took the photo of a recipe, its licence and its page (a free photo to credit)
alter table recipe add column image_credit varchar(200);
alter table recipe add column image_license varchar(60);
alter table recipe add column image_source varchar(500);

-- each community photo is added once (one an admin removes never comes back)
create table community_image (
    key       varchar(160) primary key,
    recipe_id uuid,
    added_at  timestamptz not null default now()
);
