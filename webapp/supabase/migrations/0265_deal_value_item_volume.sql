-- ============================================================
--  Migration 0265: แถวมูลค่าคาดการณ์ของดีล เพิ่ม "ปริมาตร + หน่วยปริมาตร"
--  (มติผู้ใช้ 2026-08-17 รอบสอง — ต่อจาก mig 0264)
--
--  คำสั่งตั้งต้น: *"เพิ่ม ปริมาตร และ หน่วย ด้วย"*
--
--  ⚠️ **คนละช่องกับ `unit` ที่มีอยู่แล้ว** — กับดักที่ lib/master/units.js เตือนไว้ตรง ๆ
--  ว่าสองช่องนี้สลับกันได้ง่าย:
--      unit         = **หน่วยขาย** สิ่งที่นับขาย (ชิ้น · ขวด · ลัง) → คูณกับราคาต่อหน่วย
--      volume       = **ขนาดของหนึ่งหน่วยขาย** (100) ไม่เข้าสูตรคิดเงิน
--      "volumeUnit" = หน่วยของขนาดนั้น (ml · g · kg · L)
--  ⇒ อ่านรวมกันได้ประโยคเดียวกับฝั่งสินค้า: "1 ชิ้น = 100 ml"
--
--  ทั้งคู่ **ไม่บังคับ** — ดีลที่ขายเป็นงาน/ครั้ง (บริการ) ไม่มีปริมาตรให้กรอก และการ
--  บังคับจะทำให้คนกรอกเลขมั่วเพื่อผ่านฟอร์ม · แต่ถ้ากรอกปริมาตรแล้วต้องมีหน่วยเสมอ
--  (ตัวเลขลอยที่ไม่มีหน่วยอ่านไม่ได้ว่า 100 อะไร)
--
--  🛑 ต้องรันก่อน deploy โค้ด · additive ล้วน ไม่แตะแถวเดิม · รันซ้ำได้
--  ⚠️ รันมือบน Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE public.sales_deal_value_items
  ADD COLUMN IF NOT EXISTS volume       numeric,
  ADD COLUMN IF NOT EXISTS "volumeUnit" text;

ALTER TABLE public.sales_deal_value_items
  DROP CONSTRAINT IF EXISTS sales_deal_value_items_volume_sane;
ALTER TABLE public.sales_deal_value_items
  ADD CONSTRAINT sales_deal_value_items_volume_sane CHECK (
    (volume IS NULL OR volume > 0)
    AND ("volumeUnit" IS NULL OR length(btrim("volumeUnit")) BETWEEN 1 AND 20)
    -- กรอกขนาดแล้วต้องบอกหน่วย — '100' เฉย ๆ อ่านไม่ออกว่าอะไร
    AND (volume IS NULL OR "volumeUnit" IS NOT NULL)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
