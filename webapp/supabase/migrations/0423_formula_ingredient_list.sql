-- ============================================================
--  Migration 0423: Ingredient List ของสูตร (ม-158 · มติเจ้าของ 03/11/2026)
--
--  ⭐ มติเจ้าของ (ถามทีละข้อ 03/11):
--     1. รูปแบบ = ข้อความยาวช่องเดียว (รายชื่อสาร INCI เรียงตามสัดส่วน คั่นด้วยจุลภาค) — ไม่ใช่ตาราง ไม่ใช่ไฟล์แนบ
--     2. เก็บที่ **ทะเบียนสูตร** — หนึ่งสูตร = หนึ่ง Ingredient List · หน้าสูตร หน้า FG และคำร้องอ่านตัวเดียวกัน
--     3. **บังคับ** ตอน RD ใส่ราคาแถวที่ลูกค้าคอนเฟิร์มแล้ว (รวมปุ่ม "ใช้ราคานี้") — ไม่มี = ปิดแถวไม่ได้
--     4. หมวด 02-020 (หัวน้ำหอม · ราคา F ลงที่กลิ่น) ไม่ต้องใส่
--     5. โชว์ที่หน้าสูตร (RD แก้ได้) · หน้าคำร้อง · หน้า FG · Excel ทะเบียนสูตร
--
--  ── ทำอะไร ───────────────────────────────────────────────────────────────────────────────
--   คอลัมน์ใหม่ formulas."ingredientList" text — ว่างได้ (สูตรเดิมทั้งหมดยังไม่มี · ไม่ backfill)
--   · ยาวไม่เกิน 5000 ตัวอักษร (ค่าเดียวกับ INGREDIENT_LIST_MAX_LENGTH ใน lib/master/ingredientList.js —
--     เทสต์ ingredientList.test.mjs ยึดให้เท่ากัน) · ห้ามเป็นช่องว่างล้วน (ว่าง = NULL เท่านั้น)
--   · ด่าน "บังคับ" อยู่ที่ API ขั้นราคา ไม่ใช่ที่ฐาน — สูตรที่ยังไม่ถึงขั้นราคาต้องว่างได้
--
--  ── ผลต่อข้อมูลเดิม ───────────────────────────────────────────────────────────────────────────
--   ไม่มี — คอลัมน์ใหม่เป็น NULL ทุกแถว · ไม่แตะ trigger / RLS (ตารางเปิด RLS ไว้แล้วตั้งแต่ 0171 · เข้าถึงผ่าน service role)
--   · ลำดับรันกับ deploy: **รันไฟล์นี้ก่อน deploy** — โค้ดใหม่อ่าน/เขียนคอลัมน์นี้ (ก่อนรัน = หน้าสูตร/ขั้นราคา error คอลัมน์ไม่มี)
--     โค้ดเก่าบนฐานใหม่ไม่กระทบ (ไม่อ่านคอลัมน์นี้)
--
--  ── ทางกลับ ────────────────────────────────────────────────────────────────────────────────
--   ALTER TABLE public.formulas DROP COLUMN IF EXISTS "ingredientList";
--   ⚠️ ข้อมูลที่ RD กรอกไว้หายถาวร (ไม่มีถังขยะ — กู้ได้จาก audit_logs.before/after เท่านั้น)
--  รันซ้ำได้
-- ============================================================

ALTER TABLE public.formulas
  ADD COLUMN IF NOT EXISTS "ingredientList" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.formulas'::regclass AND conname = 'formulas_ingredient_list_check'
  ) THEN
    ALTER TABLE public.formulas
      ADD CONSTRAINT formulas_ingredient_list_check
      CHECK ("ingredientList" IS NULL OR length(btrim("ingredientList")) BETWEEN 1 AND 5000);
  END IF;
END $$;

COMMENT ON COLUMN public.formulas."ingredientList" IS
  'Ingredient List (INCI เรียงตามสัดส่วน) — RD กรอกตอนใส่ราคาแถวที่ลูกค้าคอนเฟิร์ม หรือที่หน้าสูตร · ม-158 (0423)';

-- ตรวจท้าย
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'formulas' AND column_name = 'ingredientList';
