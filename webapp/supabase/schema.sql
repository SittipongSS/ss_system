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
  "volumeUnit"         text default 'ml',
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
  "approvedBy"         uuid,          -- LG user who registered the product
  "approvedByName"     text,          -- name snapshot of the approver
  "approvedAt"         timestamptz,
  "rejectionReason"    text,          -- set when sent back for correction (status='rejected')
  "taxableOverride"    boolean,       -- NULL = auto (FG code); TRUE/FALSE = LG override
  "status"             text not null default 'pending_legal',  -- pending_legal | approved | rejected
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
  "customerId"           text references public.customers("id") on delete set null,  -- billing customer (1 order = 1 customer)
  "customerName"         text,          -- snapshot at time of order
  "customerTaxId"        text,          -- snapshot at time of order
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
  "receiptNumber"        text,          -- S&S invoice/receipt no. (Sales step)
  "taxDueDate"           text,          -- legal deadline to file/pay excise
  "exciseReceiptFileUrl" text,          -- scanned Excise receipt / ภส. document
  "exciseReceiptNumber"  text,          -- Excise Dept receipt no.
  "exciseTaxPaidAmount"  numeric,       -- amount actually paid to Excise Dept
  "taxFormRef"           text,          -- ภส. form ref (e.g. ภส.03-07)
  "filedAt"              timestamptz,   -- when LG completed filing
  "filedBy"              uuid,          -- LG user who filed
  "filedByName"          text,          -- name snapshot of the filer
  "rejectionReason"      text,          -- set when sent back for correction (status='rejected')
  "status"               text not null default 'pending',  -- pending | received | filing | complete | rejected
  "clearedAt"            timestamptz,
  "createdAt"      timestamptz not null default now()
);
create index if not exists orders_productid_idx on public.orders ("productId");
create index if not exists orders_customerid_idx on public.orders ("customerId");

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
