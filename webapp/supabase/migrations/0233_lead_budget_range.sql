-- ============================================================
--  Migration 0233: งบประมาณของลีดเป็น "ช่วง" ได้ (มติผู้ใช้ 2026-08-12)
--
--  ⭐ ที่มา: ทีม Marketing กรอกลีดจากที่ลูกค้าพิมพ์มาในแชท ซึ่งแทบไม่เคยเป็นตัวเลข
--  เดียว — "ประมาณ 3–5 แสน" คือรูปแบบปกติ · ช่องเดียวบังคับให้คนกรอกต้องเลือกข้าง
--  (กรอกตัวต่ำก็ดูงบน้อยกว่าจริง กรอกตัวสูงก็ปั่นตัวเลขในรายงาน) หรือไปพิมพ์ช่วงจริง
--  ทิ้งไว้ในช่องรายละเอียด ซึ่งไม่มีใครเอาไปคำนวณอะไรได้
--
--  ⚠️ **ไม่แตะคอลัมน์ `budget` เดิม** — มันกลายเป็น "ต่ำสุดของช่วง" โดยนิยาม
--  แถวเก่าทุกแถวจึงยังอ่านได้เหมือนเดิมและไม่ต้อง backfill:
--    · budgetMax เป็น NULL  = ระบุตัวเลขเดียว (พฤติกรรมเดิมเป๊ะ)
--    · budgetMax มีค่า      = ช่วง budget…budgetMax
--  การเรียง/รวมยอดที่มีอยู่ยังใช้ `budget` ต่อได้โดยไม่ต้องแก้ (ได้ค่าต่ำสุดของช่วง
--  ซึ่งเป็นฝั่งที่ปลอดภัยกว่าสำหรับตัวเลขคาดการณ์)
--
--  🛑 **ต้องรันก่อน deploy เท่านั้น ไม่ใช่ "รันเมื่อไรก็ได้"** — วัดจริงบนฐานที่ยังไม่ได้รัน
--  (2026-08-12): POST /api/sales-planning/leads ตอบ 500
--  "Could not find the 'budgetMax' column of 'sales_leads' in the schema cache"
--  ⇒ **เปิดลีดใหม่ไม่ได้เลยทั้งระบบ** ไม่ใช่แค่ลีดที่กรอกงบเป็นช่วง
--  (ไม่มีแถวไหนเกิดขึ้น จึงไม่มีข้อมูลเสีย แต่ทีม Marketing ทำงานไม่ได้จนกว่าจะรัน)
--
--  ⚠️ รันมือบน Supabase SQL Editor · เพิ่มคอลัมน์ล้วน ไม่แตะข้อมูลเดิม ปลอดภัยกับโค้ดเก่า
--  (โค้ดเวอร์ชันก่อนหน้าไม่รู้จักคอลัมน์นี้และไม่แตะมัน) ⇒ รันล่วงหน้าได้ทันที
--
--  ⚠️ เลข 0233 จองต่อจาก 0232 ตามกติกาโปรเจกต์ — ถ้าสายอื่น merge ก่อนแล้วกินเลขนี้ไป
--  ให้เลื่อนเลขไฟล์ **โดยไม่แตะเนื้อ SQL** (เคสเดียวกับที่ 0219 → 0223 เคยเจอ)
-- ============================================================

BEGIN;

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS "budgetMax" numeric;

-- ปลายบนต้องไม่ต่ำกว่าปลายล่าง และห้ามมีปลายบนลอย ๆ โดยไม่มีปลายล่าง
-- (แถวแบบนั้นอ่านไม่ออกว่าแปลว่าอะไร และทำให้การเรียงตาม budget ตกไปท้ายตารางเงียบ ๆ)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_leads_budget_range'
  ) THEN
    ALTER TABLE public.sales_leads
      ADD CONSTRAINT sales_leads_budget_range
      CHECK (
        "budgetMax" IS NULL
        OR (budget IS NOT NULL AND "budgetMax" >= budget)
      );
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.sales_leads WHERE "budgetMax" IS NOT NULL;   -- ต้องได้ 0
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.sales_leads'::regclass AND conname = 'sales_leads_budget_range';
--   ต้องได้ 1 แถว

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_budget_range;
-- ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS "budgetMax";
-- NOTIFY pgrst, 'reload schema';
