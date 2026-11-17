-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4: Open Food Facts kept on our side, like Ciqual. An admin updates it from the app: the full export
-- is downloaded, the products sold in France (with a name and an energy) go to the food table. Searches
-- and barcodes then stay on our server.
-- ─────────────────────────────────────────────────────────────────────────────
create table off_import (
  id           uuid primary key,
  status       varchar(12)  not null,
  step         varchar(24),
  progress     integer      not null default 0,
  products     integer,
  message      varchar(500),
  started_by   uuid references app_user (id) on delete set null,
  started_at   timestamptz  not null default now(),
  finished_at  timestamptz,
  constraint off_import_status_ck check (status in ('RUNNING', 'DONE', 'FAILED'))
);
