-- ============================================================
--  Migration 0234: ช่อง "เอกสารอ้างอิง" ของใบสั่งขาย (IS-26080017 · มติผู้ใช้ 2026-08-12)
--
--  ⭐ ที่มา: AE แจ้งเองว่า "SO ขอช่องเพิ่มเอกสารอ้างอิง" — ใบสั่งขายอ้าง QT ได้อยู่แล้ว
--  (คอลัมน์ quotationId) แต่เอกสารฝั่ง **ลูกค้า** ไม่มีที่อยู่: เลขที่ PO ของลูกค้า ·
--  เลขสัญญา · เลขอ้างอิงในระบบจัดซื้อของเขา · ทุกวันนี้ไปกองอยู่ในช่อง `notes`
--  ปนกับข้อความอื่น ⇒ ค้นไม่เจอ และไม่มีใครรู้ว่าใบไหนมีเลขอ้างอิงแล้วบ้าง
--
--  ⚠️ **ไม่ยืมช่อง `notes`** — notes เป็นข้อความอิสระที่พิมพ์ลงเอกสารได้ ส่วนช่องนี้
--  เป็น "ตัวชี้ไปเอกสารอีกใบ" ซึ่งต้องค้นได้และโชว์เป็นคอลัมน์ในตาราง สองอย่างนี้
--  อยู่ช่องเดียวกันเมื่อไรก็ค้นเจอขยะปนทุกครั้ง
--
--  ⚠️ **ไม่ NOT NULL และไม่มีค่าตั้งต้น** — ใบเก่าทุกใบยังอ่านได้เหมือนเดิม
--  และใบที่ลูกค้าไม่ได้ออก PO มาก็ไม่ต้องกรอกอะไร
--
--  🛑 **ต้องรันก่อน deploy** — บทเรียนจาก 0233 (2026-08-12): โค้ดใหม่ส่งคีย์ที่ DB
--  ยังไม่มี ⇒ PostgREST ตอบ 500 "Could not find the column ... in the schema cache"
--  แล้วการ **แก้ใบสั่งขายพังทั้งระบบ** ไม่ใช่แค่ใบที่กรอกช่องใหม่
--  ⚠️ SQL นี้ปลอดภัยกับโค้ดเวอร์ชันปัจจุบัน (ไม่รู้จักคอลัมน์จึงไม่แตะ) ⇒ รันล่วงหน้าได้ทันที
--
--  ⚠️ รันมือบน Supabase SQL Editor · เพิ่มคอลัมน์ล้วน ไม่แตะข้อมูลเดิม
-- ============================================================

BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "referenceDoc" text;

-- ยาวเกินจอ = ข้อมูลผิด ไม่ใช่เลขอ้างอิง (กติกาเดียวกับช่องข้อความอื่นในโปรเจกต์นี้)
-- 200 ตัวอักษรพอสำหรับ "PO-2569-00123 · สัญญาเลขที่ ABC/2569" ซึ่งเป็นรูปแบบที่ยาวสุด
-- ที่เจอจริง · ยาวกว่านี้แปลว่าคนกำลังใช้ช่องนี้เป็นช่องหมายเหตุ ซึ่งมี `notes` อยู่แล้ว
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_reference_doc_len'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_reference_doc_len
      CHECK ("referenceDoc" IS NULL OR length("referenceDoc") <= 200);
  END IF;
END $$;

-- ค้นด้วยเลขอ้างอิงเป็นเหตุผลหลักที่ช่องนี้เกิด (ผู้ใช้ขอ "ค้นหาได้" มาพร้อมกัน)
-- ⚠️ ตัวกรองฝั่งจอเป็น substring ไม่แคร์ตัวพิมพ์ ⇒ index ต้องเป็น lower() ไม่งั้น
-- ไม่มีใครได้ใช้มัน · WHERE ตัดใบที่ไม่มีเลขอ้างอิงทิ้ง (ส่วนใหญ่ของตาราง)
CREATE INDEX IF NOT EXISTS sales_orders_reference_doc_idx
  ON public.sales_orders (lower("referenceDoc"))
  WHERE "referenceDoc" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.sales_orders WHERE "referenceDoc" IS NOT NULL;   -- ต้องได้ 0
-- SELECT count(*) FROM pg_constraint WHERE conname = 'sales_orders_reference_doc_len';  -- 1
-- SELECT count(*) FROM pg_indexes WHERE indexname = 'sales_orders_reference_doc_idx';   -- 1

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.sales_orders_reference_doc_idx;
-- ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_reference_doc_len;
-- ALTER TABLE public.sales_orders DROP COLUMN IF EXISTS "referenceDoc";
-- NOTIFY pgrst, 'reload schema';
