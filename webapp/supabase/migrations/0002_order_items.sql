-- Move orders from "1 order = 1 product" to "1 PO (orders) = many order_items".
-- Existing orders each become a PO with a single line item. The orders rollup
-- totals already equal that single item's totals, so no recompute is needed.
--
-- Run once via the Supabase SQL editor or CLI.

-- 1. New optional PO Reference on the header.
alter table public.orders add column if not exists "poReference" text;

-- 2. Line-items table.
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
alter table public.order_items enable row level security;

-- 3. Backfill: one item per existing order.
insert into public.order_items ("id","orderId","productId","quantity","totalExciseTax","totalLocalTax","totalTax")
select 'OIT-'||"id", "id", "productId", "quantity", "totalExciseTax", "totalLocalTax", "totalTax"
from public.orders
where "productId" is not null
on conflict ("id") do nothing;
