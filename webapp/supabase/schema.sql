-- ============================================================
--  Excise Tax Manager — Supabase schema
--  Run this in Supabase Dashboard → SQL Editor (once).
--  Column names are camelCase (quoted) to match the existing
--  API/JSON shape so the frontend needs no changes.
-- ============================================================

-- ---------- customers ----------
create table if not exists public.customers (
  "id"         text primary key,
  "arCode"     text not null,
  "name"       text not null,
  "taxId"      text,
  "address"    text,
  "brands"     jsonb not null default '[]'::jsonb,
  "mapFileUrl" text,
  "createdAt"  timestamptz not null default now()
);
create unique index if not exists customers_arcode_key on public.customers ("arCode");

-- ---------- products ----------
create table if not exists public.products (
  "id"                 text primary key,
  "fgCode"             text not null,
  "productDescription" text,
  "brandName"          text,
  "customerName"       text,
  "taxId"              text,
  "address"            text,
  "volume"             numeric,
  "costPrice"          numeric,
  "retailPriceIncVat"  numeric,
  "assignee"           text,
  "mapFileUrl"         text,
  "isExciseTaxable"    boolean default true,
  "retailPriceExVat"   numeric,
  "exciseTax"          numeric,
  "localTax"           numeric,
  "laborCost"          numeric,
  "shippingCost"       numeric,
  "materialCost"       numeric,
  "factoryProfit"      numeric,
  "status"             text not null default 'pending_legal',
  "createdAt"          timestamptz not null default now()
);
create unique index if not exists products_fgcode_key on public.products ("fgCode");
create index if not exists products_customername_idx on public.products ("customerName");
create index if not exists products_taxid_idx on public.products ("taxId");

-- ---------- orders ----------
create table if not exists public.orders (
  "id"             text primary key,
  "productId"      text references public.products("id") on delete set null,
  "quantity"       integer,
  "quotationRef"   text,
  "deliveryDate"   text,
  "remarks"        text,
  "assignee"       text,
  "totalExciseTax" numeric,
  "totalLocalTax"  numeric,
  "totalTax"       numeric,
  "status"         text not null default 'pending_payment',
  "clearedAt"      timestamptz,
  "createdAt"      timestamptz not null default now()
);
create index if not exists orders_productid_idx on public.orders ("productId");

-- ---------- Row Level Security ----------
-- Enable RLS so anon/clients cannot read/write directly.
-- The app talks to these tables ONLY via Next.js API routes using the
-- service_role key, which bypasses RLS. (No public policies on purpose.)
alter table public.customers enable row level security;
alter table public.products  enable row level security;
alter table public.orders    enable row level security;
