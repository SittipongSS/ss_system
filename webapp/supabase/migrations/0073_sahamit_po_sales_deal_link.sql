-- ============================================================
--  Migration 0073: sahamit_pos.salesDealId — เชื่อม PO ↔ ดีลแผนการขาย
--  แยก "ปิด Won เข้าดีล" (action หลัก) ออกจากการสร้าง PM project (ออปชัน).
--  PO หนึ่งใบ settle เข้าดีลได้หนึ่งดีล (ดีลที่ split เป็นลูกก็ได้) — เก็บ id ไว้
--  ที่หัว PO เพื่อ idempotent + โชว์ลิงก์บนหน้า PO + ให้ create-project ใช้ซ้ำ.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (เหมือน 0005-0072).
-- ============================================================

ALTER TABLE public.sahamit_pos
  ADD COLUMN IF NOT EXISTS "salesDealId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sahamit_pos_sales_deal_id_fkey'
      AND conrelid = 'public.sahamit_pos'::regclass
  ) THEN
    ALTER TABLE public.sahamit_pos
      ADD CONSTRAINT sahamit_pos_sales_deal_id_fkey
      FOREIGN KEY ("salesDealId")
      REFERENCES public.sales_deals(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sahamit_pos_sales_deal_id_idx
  ON public.sahamit_pos ("salesDealId");

NOTIFY pgrst, 'reload schema';
