-- 0142 - ระบบขอราคาต้นทุน PR6: ร่องรอยการป้อนต้นทุนกลับสินค้า (FG)
--
-- เมื่อผู้บริหารอนุมัติราคาผลิตแล้ว ฝ่ายขายกด "ป้อนเป็นต้นทุน FG" เพื่อเขียน
-- products.costPrice ของสินค้าที่ผูกไว้. ต้องเก็บร่องรอยไว้ที่ตัวรายการเพราะ:
--   • กันป้อนซ้ำโดยไม่ตั้งใจ (ปุ่มหายไปเมื่อป้อนแล้ว)
--   • ตอบได้ว่าต้นทุนของ FG ตัวนี้มาจากใบไหน ชั้นจำนวนไหน ใครกด เมื่อไหร่
--     — product_price_history บอกว่า "ราคาเปลี่ยน" แต่ไม่ได้ผูกกลับมาที่ใบขอราคา
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

ALTER TABLE public.costing_request_items
  ADD COLUMN IF NOT EXISTS "costFedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "costFedById"   text,
  ADD COLUMN IF NOT EXISTS "costFedByName" text,
  -- ราคาที่เขียนลง FG จริง ๆ ณ ตอนนั้น (ชั้นอ้างอิง = ชั้น MOQ ถ้ามี)
  ADD COLUMN IF NOT EXISTS "costFedPrice"  numeric,
  ADD COLUMN IF NOT EXISTS "costFedTierQty" numeric;

-- ป้อนแล้วต้องมีหลักฐานครบ (เวลา + ราคา) หรือไม่มีเลย
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'costing_request_items_cost_feed_complete'
  ) THEN
    ALTER TABLE public.costing_request_items
      ADD CONSTRAINT costing_request_items_cost_feed_complete
      CHECK ("costFedAt" IS NULL OR "costFedPrice" IS NOT NULL);
  END IF;
END;
$$;

-- Rollback guidance:
-- 1) ถอนได้ด้วย ALTER TABLE ... DROP COLUMN ทั้ง 5 (+ DROP CONSTRAINT ก่อน)
--    — ข้อมูลที่หายคือร่องรอยว่าใบไหนป้อนต้นทุนไปแล้ว ตัว costPrice บน products
--    ไม่ถูกแตะ และ product_price_history ยังเก็บประวัติราคาไว้ครบ
-- 2) ผลข้างเคียงของการถอน: ปุ่ม "ป้อนเป็นต้นทุน FG" จะกลับมาโผล่ให้กดซ้ำได้

NOTIFY pgrst, 'reload schema';
