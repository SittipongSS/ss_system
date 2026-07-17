-- ============================================================
--  Migration 0112: ข้อมูลสูตรของสินค้า (products)
--  ชื่อสูตร / รหัสสูตร / วันที่สูตร — กรอกที่ฟอร์มเพิ่ม-แก้ไขสินค้า
--  (/database/products). สูตรคือของฝ่าย RD ที่ผูกกับ FG หนึ่งตัว ใช้อ้างอิง
--  ตอนผลิตซ้ำ/ทำ RE-ORDER และตอนสอบถาม RD ว่าสินค้านี้ใช้สูตรไหน เวอร์ชันไหน.
--
--  ทั้งสามคอลัมน์ nullable โดยเจตนา: FG เก่าที่ยังไม่ได้บันทึกสูตร (และสินค้าที่
--  ไม่มีสูตร เช่น กล่อง/บรรจุภัณฑ์) ต้องอยู่ต่อได้โดยไม่ต้อง backfill.
--  formulaDate = วันที่ของตัวสูตร (วันที่ RD ออก/แก้สูตรเวอร์ชันนั้น) ไม่ใช่วันที่
--  บันทึกเข้าระบบ — createdAt/updatedAt ทำหน้าที่นั้นอยู่แล้ว.
--
--  หมายเหตุ: แก้ข้อมูลสูตรของสินค้าที่อนุมัติแล้ว จะเด้งกลับเป็น "รออนุมัติ"
--  ตามกฎ re-approval เดิม (resetApprovalOnEdit) — ไม่ได้ยกเว้นให้เป็นพิเศษ.
--
--  Additive + idempotent. ⚠ รันมือบน Supabase SQL Editor ก่อน/พร้อม deploy.
-- ============================================================

alter table public.products
  add column if not exists "formulaName" text,
  add column if not exists "formulaCode" text,
  add column if not exists "formulaDate" date;

-- ค้นหาสินค้าจากรหัสสูตร (RD ถามด้วยรหัสสูตรบ่อยกว่าชื่อ)
create index if not exists products_formulacode_idx
  on public.products ("formulaCode")
  where "formulaCode" is not null;

NOTIFY pgrst, 'reload schema';
