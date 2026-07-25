-- 0152 - รับสี accent 'steel' ที่ใบสั่งขายใช้จริงบนเอกสาร
--
-- ปัญหา: หน้าตั้งค่ามาตรฐานเอกสารให้เลือก terracotta/teal/amber/green/navy แต่เอกสาร
-- ใบสั่งขายที่พิมพ์จริงใช้ 'steel' (#1e6091 — มติผู้ใช้ 2026-07-21 ใน salesOrderPrint.js)
-- ซึ่งไม่มีในตัวเลือกและ CHECK ของตารางก็ไม่รับ · แถวที่ seed ไว้ (mig 0123) จึงเป็น 'teal'
-- ทั้งที่เอกสารพิมพ์ออกมาเป็น steel = ค่าที่ตั้งไม่ตรงกับของจริงมาตลอด
--
-- มติ 2026-07-25: เปิดให้เลือกเฉพาะสีที่มีเอกสารใช้จริง (terracotta = ใบเสนอราคา,
-- steel = ใบสั่งขาย) แล้วค่อยเพิ่มตอนมีเอกสารชนิดใหม่
--
-- migration นี้ทำอย่างเดียว: ให้ CHECK รับ 'steel' เพิ่ม
--   · คงค่าเก่า (teal/amber/green/navy) ไว้ในเงื่อนไขด้วย — แถว published เดิมแก้ไม่ได้
--     (trigger document_standard_versions_guard บล็อกการแก้ payload ของแถวที่ไม่ใช่ร่าง)
--     ถ้าตัดออกทันที แถวเดิมจะผิด constraint
--   · ฝั่งแอปมี resolveDocumentAccentKey แปลงคีย์เก่าเป็นสีของเอกสารชนิดนั้นตอนอ่านอยู่แล้ว
--     (teal บนใบสั่งขาย → steel) จึงไม่ต้องแก้ข้อมูลย้อนหลัง
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

DO $$
DECLARE
  v_name text;
BEGIN
  -- ชื่อ constraint มาจาก inline CHECK ตอน CREATE TABLE (mig 0123) — หาโดยดูนิยามจริง
  -- แทนการเดาชื่อ เผื่อฐานข้อมูลตั้งชื่อไว้ต่างออกไป
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.document_standard_versions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%accentKey%'
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.document_standard_versions DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.document_standard_versions
  ADD CONSTRAINT document_standard_versions_accent_key_check
  CHECK ("accentKey" IN ('terracotta', 'steel', 'teal', 'amber', 'green', 'navy'));

NOTIFY pgrst, 'reload schema';
