-- ============================================================
--  Migration 0016: แยก "การขึ้นทะเบียนภาษีสรรพสามิต" ออกจาก products
--  เดิม products = catalog + ลูกค้า + workflow ขึ้นทะเบียน รวมในแถวเดียว.
--  ตอนนี้:
--    - products  = master catalog ล้วน (FG เกิดที่ master, ไม่ผูกลูกค้า)
--    - excise_registrations = 1 แถว/(สินค้า+ลูกค้า) ที่ยื่นขึ้นทะเบียนภาษี
--  คอลัมน์ลูกค้า/สถานะบน products คงไว้ (backward-compat) แต่เลิกใช้.
--  Additive + idempotent.
-- ============================================================

-- หมายเหตุ: ไม่ผูก FK constraint จริง — products/customers บน live DB ไม่มี
-- unique/PK บน "id" ที่ FK อ้างได้ (ตารางถูกสร้างจากสคริปต์ insert). ความสัมพันธ์
-- ถูกบังคับที่ชั้น API เหมือนคอนเวนชัน RLS-เปิด-ไม่มี-policy ของโปรเจกต์นี้.
create table if not exists public.excise_registrations (
  "id"              text primary key,
  "productId"       text,   -- -> products.id (logical FK)
  "customerId"      text,   -- -> customers.id (logical FK)
  -- snapshot สำหรับแสดงผล/ประวัติ (ดึงตอนยื่น)
  "fgCode"          text,
  "productName"     text,
  "brandName"       text,
  "customerName"    text,
  "taxId"           text,
  -- snapshot อัตราภาษีต่อหน่วย ณ เวลายื่น
  "isExciseTaxable" boolean,
  "taxableOverride" boolean,
  "exciseTax"       numeric,
  "localTax"        numeric,
  -- workflow
  "status"          text not null default 'pending_legal',
  "approvalNumber"  text,
  "approvedBy"      text,
  "approvedByName"  text,
  "approvedAt"      timestamptz,
  "rejectionReason" text,
  -- ownership / scope (team-scoped เหมือน products)
  "team"            text,
  "ownerId"         text,
  "assignee"        text,
  "metadata"        jsonb not null default '{}'::jsonb,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now()
);

alter table public.excise_registrations enable row level security;

create index if not exists excise_reg_product_idx  on public.excise_registrations ("productId");
create index if not exists excise_reg_customer_idx on public.excise_registrations ("customerId");
create index if not exists excise_reg_status_idx   on public.excise_registrations ("status");
-- 1 สินค้า ขึ้นทะเบียนให้ 1 ลูกค้าได้ครั้งเดียว
create unique index if not exists excise_reg_prod_cust_uniq
  on public.excise_registrations ("productId", "customerId");

-- ── Backfill: ยก products ที่อยู่ใน pipeline ภาษีอยู่แล้ว → เป็น registration ──
-- ห่อด้วย DO/EXECUTE + exception handler: ถ้า schema ของ products ในฐานข้อมูลนี้
-- ไม่มีคอลัมน์ที่อ้าง (เช่นยังไม่ได้รัน migration 0006) ให้ "ข้าม" backfill โดยไม่ทำ
-- ให้ migration ล้มเหลว — ตารางถูกสร้างเรียบร้อยแล้วและพร้อมใช้งานได้ทันที.
do $$
begin
  execute $q$
    insert into public.excise_registrations (
      "id", "productId", "customerId", "fgCode", "productName", "brandName",
      "customerName", "taxId", "isExciseTaxable", "taxableOverride", "exciseTax", "localTax",
      "status", "approvalNumber", "approvedBy", "approvedByName", "approvedAt", "rejectionReason",
      "team", "ownerId", "assignee", "createdAt", "updatedAt"
    )
    select
      'REG-' || substring(p."id" from 5),
      p."id", p."customerId", p."fgCode", p."productDescription", p."brandName",
      p."customerName", p."taxId", p."isExciseTaxable", p."taxableOverride", p."exciseTax", p."localTax",
      coalesce(p."status", 'pending_legal'), p."approvalNumber", p."approvedBy", p."approvedByName",
      p."approvedAt", p."rejectionReason",
      p."team", p."ownerId", p."assignee", coalesce(p."createdAt", now()), now()
    from public.products p
    where p."status" is not null
    on conflict ("productId", "customerId") do nothing
  $q$;
exception
  when undefined_column or undefined_table then
    raise notice 'ข้าม backfill registration (products schema ไม่ตรง): %', sqlerrm;
end $$;
