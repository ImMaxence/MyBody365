-- 1.12: the reminder of the photo of the day is on unless one turns it off, the eggs of the shopping lists go to the
-- dairy aisle, and the products of Open Food Facts keep their picture and the date their page was last changed.

alter table notification_pref alter column photo_enabled set default true;
-- out for a day only (1.11): on for everybody, as for the newcomers
update notification_pref set photo_enabled = true where not photo_enabled;

-- « Œufs bio » was read without its ligature: it went to « Autres », weighed instead of counted
update shopping_item set aisle = 'DAIRY'
where aisle = 'OTHER' and (lower(name) like 'œuf%' or lower(name) like 'oeuf%');
update shopping_item set unit = 'PIECE'
where unit = 'G' and grams is not null and (lower(name) like 'œuf%' or lower(name) like 'oeuf%');

-- the front picture of the product on images.openfoodfacts.org (its path there, the server fetches it: the phone never
-- calls Open Food Facts), and when its page was last changed (last_modified_t)
alter table food add column image_path varchar(160);
alter table food add column source_updated_at timestamptz;
