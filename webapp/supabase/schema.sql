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
  "phone"      text,
  "address"    text,
  "brands"     jsonb not null default '[]'::jsonb,
  "mapFileUrl" text,
  "team"       text,          -- managing team: ODM | KA | SV (transferable). Customers are a central registry.
  "ownerId"    uuid,          -- auth user who owns the record (for 'own' scope)
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
  "assignee"           text,          -- display label only (name snapshot)
  "team"               text,          -- owning team: ODM | KA | SV
  "ownerId"            uuid,          -- auth user who owns the record (for 'own' scope)
  "mapFileUrl"         text,
  "isExciseTaxable"    boolean default true,
  "retailPriceExVat"   numeric,
  "exciseTax"          numeric,
  "localTax"           numeric,
  "laborCost"          numeric,
  "shippingCost"       numeric,
  "materialCost"       numeric,
  "factoryProfit"      numeric,
  "approvalNumber"     text,
  "status"             text not null default 'pending_legal',
  "createdAt"          timestamptz not null default now()
);
create unique index if not exists products_fgcode_key on public.products ("fgCode");
create index if not exists products_customername_idx on public.products ("customerName");
create index if not exists products_taxid_idx on public.products ("taxId");

-- ---------- orders ----------
create table if not exists public.orders (
  "id"                   text primary key,
  "productId"            text references public.products("id") on delete set null,
  "quantity"             integer,
  "quotationRef"         text,
  "deliveryDate"         text,
  "remarks"              text,
  "assignee"             text,          -- display label only (name snapshot)
  "team"                 text,          -- owning team: ODM | KA | SV
  "ownerId"              uuid,          -- auth user who owns the record (for 'own' scope)
  "totalExciseTax"       numeric,
  "totalLocalTax"        numeric,
  "totalTax"             numeric,
  "poReference"          text,
  "receiptNumber"        text,
  "exciseReceiptFileUrl" text,
  "status"               text not null default 'pending',
  "clearedAt"            timestamptz,
  "createdAt"      timestamptz not null default now()
);
create index if not exists orders_productid_idx on public.orders ("productId");

-- ---------- order_items ----------
-- One PO (orders row) has many line items, each tied to a product + quantity.
-- Per-item taxes are summed into the orders rollup (totalExciseTax/...).
create table if not exists public.order_items (
  "id"             text primary key,
  "orderId"        text not null references public.orders("id") on delete cascade,
  "productId"      text references public.products("id") on delete set null,
  "quantity"       integer,
  "totalExciseTax" numeric,
  "totalLocalTax"  numeric,
  "totalTax"       numeric
);
create index if not exists order_items_orderid_idx on public.order_items ("orderId");
create index if not exists order_items_productid_idx on public.order_items ("productId");

-- ---------- Row Level Security ----------
-- Enable RLS so anon/clients cannot read/write directly.
-- The app talks to these tables ONLY via Next.js API routes using the
-- service_role key, which bypasses RLS. (No public policies on purpose.)
alter table public.customers   enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
