-- ============================================================
--  Migration 0032: customers สาขา (branchCode) + ที่อยู่จัดส่ง (shippingAddress)
--  - branchCode: เอกสารภาษีไทยต้องระบุสาขา. '00000' = สำนักงานใหญ่ (ค่าเริ่มต้น).
--  - shippingAddress: ที่อยู่จัดส่ง แยกจาก address (ที่อยู่ออกเอกสาร/บิล).
--    null = ใช้ที่อยู่ออกเอกสารเป็นที่อยู่จัดส่ง.
--  - ปรับ unique: taxId เดี่ยว (จาก 0031) -> (taxId, branchCode) เพื่อให้
--    บริษัทเดียว (taxId เดียว) มีได้หลายสาขา. branchCode not null + default
--    '00000' จึงทำให้ composite ใช้งานได้จริง (null ไม่ทำให้ unique หลุด).
--  additive + idempotent. ⚠ รันมือบน Supabase (เหมือน 0005-0031).
-- ============================================================

alter table public.customers add column if not exists "branchCode"      text not null default '00000';
alter table public.customers add column if not exists "shippingAddress" text;

update public.customers set "branchCode" = '00000' where "branchCode" is null;

-- taxId เดิม unique เดี่ยว -> composite รองรับหลายสาขา.
drop index if exists customers_taxid_key;
create unique index if not exists customers_taxid_branch_key on public.customers ("taxId", "branchCode");
