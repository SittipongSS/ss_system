-- ============================================================
--  Migration 0006: ผูก products → customers ด้วย FK จริง
--  เดิม products เชื่อมลูกค้าด้วยการ match customerName/taxId (เปราะ).
--  ตอนนี้เพิ่ม "customerId" FK + "categoryCode" (อ้าง product_types).
--  คง customerName/taxId เป็น snapshot ต่อ → backward compatible 100%.
--  ไม่ backfill ในไฟล์นี้ (ดู scripts/backfill-product-customer.mjs).
--  Additive + idempotent.
-- ============================================================

alter table public.products add column if not exists "customerId"   text references public.customers("id") on delete set null;
alter table public.products add column if not exists "categoryCode" text;        -- เช่น '01-002' = mainCategoryCode-typeCode
alter table public.products add column if not exists "metadata"     jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists "updatedAt"     timestamptz not null default now();

create index if not exists products_customerid_idx   on public.products ("customerId");
create index if not exists products_categorycode_idx on public.products ("categoryCode");
