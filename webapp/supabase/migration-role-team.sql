-- ============================================================
--  Migration: role + team data scope
--  Adds team-ownership columns so the API can scope records by
--  team / owner. Safe & idempotent — run once in Supabase SQL Editor.
--  (New databases get these via schema.sql already.)
-- ============================================================

-- customers: central registry, but a team manages each one (transferable)
alter table public.customers add column if not exists "team"    text;
alter table public.customers add column if not exists "ownerId" uuid;

-- products: owned by a team + an individual
alter table public.products  add column if not exists "team"    text;
alter table public.products  add column if not exists "ownerId" uuid;

-- orders (PO): owned by a team + an individual
alter table public.orders    add column if not exists "team"    text;
alter table public.orders    add column if not exists "ownerId" uuid;

-- Indexes for scope filtering (team / own).
create index if not exists customers_team_idx  on public.customers ("team");
create index if not exists customers_owner_idx on public.customers ("ownerId");
create index if not exists products_team_idx   on public.products  ("team");
create index if not exists products_owner_idx  on public.products  ("ownerId");
create index if not exists orders_team_idx     on public.orders    ("team");
create index if not exists orders_owner_idx    on public.orders    ("ownerId");

-- NOTE: existing rows have team = NULL / ownerId = NULL. A supervisor (view
-- scope 'all') still sees them; team members (view scope 'team') will not see
-- NULL-team rows. Backfill them to the right team/owner when teams are set up,
-- e.g.:  update public.products set "team" = 'KA', "ownerId" = '<uuid>' where ...;
