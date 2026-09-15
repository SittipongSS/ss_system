-- ============================================================
--  Migration 0358: แถวพัฒนาสูตรจำว่า "การส่งสูตรครั้งนั้นทำอะไรกับทะเบียน" (ม-147)
--
--  ⭐ **ที่มา** — ม-147: ส่งสูตรของรายการรอบแก้ = สร้างสูตรใหม่ชี้กลับสูตรต้นทาง **และเก็บสูตรต้นทางเป็นเลิกใช้**
--    · ลบรายการนั้นทีหลัง (ส่งผิด — แถวพัฒนาสูตร "ดึงกลับ" ไม่ได้) ต้องถอยให้ครบ: ลบสูตรใหม่ + คืนสูตรต้นทาง
--
--  🐞 **เดาจากสภาพทะเบียนไม่ได้** (รีวิว ม-147 รอบสาม · จำลองกับ route จริง) — "สูตรที่แถวถือชี้กลับต้นทาง และต้นทาง
--    เลิกใช้อยู่" เป็นจริงได้โดยที่แถวนี้ **ไม่ได้สร้างอะไรเลย**:
--    · อีกใบของ หมวด × กลิ่น เดียวกันส่งรอบแก้ไปก่อน แล้วแถวนี้แค่ผูกเข้าสูตรนั้น ⇒ ลบแถวนี้ติด 409 ถาวร
--    · ใบนั้นถูกลบทั้งใบ (สูตรค้าง) แล้วแถวนี้ผูกเงียบ ⇒ ลบแถวนี้ **ลบสูตรที่คนอื่นสร้าง** แล้วคืนต้นทางผิด
--    · ต้นทางถูกเลิกใช้ด้วยมือก่อนส่ง (แผน "สร้าง" ไม่ได้เก็บอะไร) ⇒ ลบแถวคืนต้นทางที่คนตั้งใจเก็บ
--  ⇒ **เขียนตอนส่ง ไม่ใช่เดาทีหลัง** (บทเรียนเดียวกับ mig 0355)
--
--  ⭐ ค่า = แผนของ `planFormulaDelivery` · `create` สร้างใหม่ · `revise` สร้างใหม่ + เก็บต้นทาง · `bind` ผูกของที่มีอยู่
--    · ถอยตอนลบทำเฉพาะ `revise` เท่านั้น
--
--  ✅ **ไม่ backfill โดยตั้งใจ** — แถวเก่า = ว่าง = ลบตามกติกาเดิม (ไม่แตะทะเบียน) · ทาง `revise` ยังไม่เคยขึ้น production
--    ⇒ ไม่มีแถวไหนที่ควรเป็น `revise` แต่ว่าง
--
--  ⚠️ **ต้องรันก่อน deploy** — ก้าวส่งสูตรเขียนคอลัมน์นี้ทุกครั้ง · ยังไม่รัน = PostgREST ตีกลับ "column not found" ⇒ ส่งสูตรไม่ได้ทั้งระบบ
--  ✅ รันซ้ำได้ (IF NOT EXISTS · DROP CONSTRAINT IF EXISTS)
-- ============================================================

BEGIN;

ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "producedFormulaAction" text;

ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_produced_formula_action_check;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_produced_formula_action_check
  CHECK ("producedFormulaAction" IS NULL OR "producedFormulaAction" IN ('create', 'revise', 'bind'));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ──────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'dept_request_items' AND column_name = 'producedFormulaAction';   -- 1 แถว
