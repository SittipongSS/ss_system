-- ============================================================
--  Migration 0034: customers.customerType (บุคคลธรรมดา / นิติบุคคล)
--  ใช้เลือกชุดเอกสารแนบที่ต้องใช้ (identity/registration docs ต่างกัน):
--   • company    (นิติบุคคล) — หนังสือรับรอง, ภ.พ.20, บัตร/ทะเบียนบ้านกรรมการ,
--                 หนังสือมอบอำนาจ, แผนที่บริษัท
--   • individual (บุคคลธรรมดา) — บัตรประชาชน, ทะเบียนบ้าน, เอกสารเปลี่ยนชื่อ
--  ของเดิมทั้งหมดเป็นบริษัท → default 'company'.
--  additive + idempotent. ⚠ รันมือบน Supabase (เหมือน 0005-0033).
-- ============================================================

alter table public.customers add column if not exists "customerType" text not null default 'company';

update public.customers set "customerType" = 'company' where "customerType" is null;
