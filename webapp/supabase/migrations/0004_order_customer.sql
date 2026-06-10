-- ============================================================
--  Migration 0004: link orders directly to a customer
--  Until now an order's customer was inferred via items → products →
--  customerName/taxId, which allowed one order to mix customers and made
--  the customer↔order link fragile. New orders carry a real customerId
--  (one quotation = one customer) plus a name/taxId snapshot for history.
--  Safe & idempotent. NO backfill — legacy orders keep being derived from
--  their products (customerId stays NULL).
-- ============================================================

alter table public.orders add column if not exists "customerId"     text references public.customers("id") on delete set null;
alter table public.orders add column if not exists "customerName"    text;  -- snapshot at time of order
alter table public.orders add column if not exists "customerTaxId"   text;  -- snapshot at time of order

create index if not exists orders_customerid_idx on public.orders ("customerId");
