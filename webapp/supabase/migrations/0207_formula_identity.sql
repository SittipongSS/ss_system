-- ══════════════════════════════════════════════════════════════════════
--  0207: ตัวตนของสูตร = หมวดสินค้า × กลิ่น (P2d)
--
--  ── ที่มา ───────────────────────────────────────────────────────────
--  วันนี้ตัวตนของสูตรคือ "รหัส" อย่างเดียว (formulas_code_uk) ซึ่งเป็นรหัสที่ RD
--  พิมพ์เอง ⇒ ระบบไม่มีทางรู้ว่าสองสูตรหมายถึงของชิ้นเดียวกันหรือเปล่า
--  มติผู้ใช้: **สูตร = หมวด × กลิ่น** (เทียนหอมกลิ่น A กับก้านไม้หอมกลิ่น A เป็น
--  คนละสูตร · เทียนหอมกลิ่น A สองแถวคือของซ้ำ)
--
--  ⚠️ **ช่อง "ลูกค้า" ต้องออกจากฟอร์มสูตร** — วันนี้กรอกเองและเว้นว่างได้ ⇒ เปิดทาง
--  ให้สูตรผูกลูกค้า A แต่ใช้กลิ่นของลูกค้า B โดยไม่มีอะไรห้าม · เปลี่ยนเป็น
--  **server เติมจากกลิ่น** ⇒ ความขัดแย้งเป็นไปไม่ได้เชิงโครงสร้าง
--
--  🔍 สภาพ prod (2026-08-05): formulas 7 แถว · ผูกกลิ่นแล้ว 6 · มีลูกค้าครบ 7
--     · มีกลิ่น 1 ตัว (SCT-mse21tnm3onb) ที่มีสูตรชี้อยู่ 2 แถว
--       ⇒ **ยังไม่ชนตัวตนใหม่** เพราะ categoryCode เพิ่งเกิดในไฟล์นี้และเป็น NULL
--         ทั้งหมด (index เป็น partial) · จะชนก็ต่อเมื่อ RD ใส่หมวดเดียวกันให้ทั้งคู่
--         ซึ่งตอนนั้น "ชน" คือคำตอบที่ถูก — มันคือของซ้ำจริง
--
--  ⚠️ **ก่อนรัน: ดูรายการนี้ก่อน** — ถ้ามีแถว แปลว่ามีสูตรที่ลูกค้าไม่ตรงกับลูกค้า
--     ของกลิ่นที่มันใช้ และข้อ 5 ข้างล่างจะเขียนทับด้วยลูกค้าของกลิ่น
--       SELECT f.id, f.code, f.name, f."customerId" AS formula_customer,
--              s."customerId" AS scent_customer
--         FROM formulas f JOIN scents s ON s.id = f."scentId"
--        WHERE f."customerId" IS DISTINCT FROM s."customerId";
--
--  ⚠ รันมือบน Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1) หมวดสินค้า — ครึ่งหนึ่งของตัวตนใหม่
--
-- เก็บเป็น "MM-TTT" ซึ่งเป็นรูปที่ทั้งระบบใช้อยู่แล้ว (dept_request_items.categoryCode
-- จาก 0204 ใช้ CHECK ตัวเดียวกันเป๊ะ) — ไม่แตก main/type เป็นสองคอลัมน์
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.formulas
  ADD COLUMN IF NOT EXISTS "categoryCode" text;

ALTER TABLE public.formulas
  DROP CONSTRAINT IF EXISTS formulas_category_code_fmt;
ALTER TABLE public.formulas
  ADD CONSTRAINT formulas_category_code_fmt
  CHECK ("categoryCode" IS NULL OR "categoryCode" ~ '^[0-9]{2}-[0-9]{3}$');

CREATE INDEX IF NOT EXISTS formulas_category_idx
  ON public.formulas ("categoryCode") WHERE "categoryCode" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 2) ชื่อทางการค้า + สายพันธุ์ + เจ้าของ + ดีลต้นทาง (คู่ขนานกับ scents ใน 0205)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.formulas
  ADD COLUMN IF NOT EXISTS "customerTradeName"   text,
  ADD COLUMN IF NOT EXISTS "derivedFromFormulaId" text,
  ADD COLUMN IF NOT EXISTS "ownerId"             text,
  ADD COLUMN IF NOT EXISTS "ownerName"           text,
  ADD COLUMN IF NOT EXISTS "dealId"              text;

ALTER TABLE public.formulas
  DROP CONSTRAINT IF EXISTS formulas_trade_name_len;
ALTER TABLE public.formulas
  ADD CONSTRAINT formulas_trade_name_len
  CHECK ("customerTradeName" IS NULL OR length(btrim("customerTradeName")) BETWEEN 1 AND 200);

ALTER TABLE public.formulas
  DROP CONSTRAINT IF EXISTS formulas_derived_from_fk;
ALTER TABLE public.formulas
  ADD CONSTRAINT formulas_derived_from_fk
  FOREIGN KEY ("derivedFromFormulaId") REFERENCES public.formulas(id) ON DELETE SET NULL;

ALTER TABLE public.formulas
  DROP CONSTRAINT IF EXISTS formulas_derived_not_self;
ALTER TABLE public.formulas
  ADD CONSTRAINT formulas_derived_not_self
  CHECK ("derivedFromFormulaId" IS NULL OR "derivedFromFormulaId" <> id);

DROP INDEX IF EXISTS formulas_derived_idx;
CREATE INDEX formulas_derived_idx
  ON public.formulas ("derivedFromFormulaId") WHERE "derivedFromFormulaId" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3) สถานะ 'developing' — สูตรที่ RD รับแล้วแต่ยังทำอยู่
--
-- ⚠️ CHECK เดิมของ 0171 สร้างแบบมีชื่อ (formulas_status_check โดยปริยาย) แต่ **ห้าม
-- เดาชื่อ** — ค้นจากนิยามแล้ว DROP ตัวที่เจอ (บทเรียนกับดักข้อ 4 ของแผน)
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.formulas'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
       AND pg_get_constraintdef(oid) ILIKE '%archived%'
  LOOP
    EXECUTE format('ALTER TABLE public.formulas DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.formulas
  ADD CONSTRAINT formulas_status_check
  CHECK (status IN ('draft', 'developing', 'active', 'archived'));

-- ────────────────────────────────────────────────────────────────────────
-- 4) ⭐ ตัวตน: หมวด × กลิ่น
--
-- **ไม่ใส่ customerId ในคีย์** — `scents.customerId` เป็น NOT NULL (มติ 9: ไม่มีกลิ่น
-- กลาง) ⇒ กลิ่นบอกลูกค้าอยู่แล้ว · ใส่ซ้ำ = แหล่งความจริงที่สองที่ drift ได้
--
-- partial: สูตรฐานที่ไม่ผูกกลิ่น (มีจริงแต่น้อย) และร่างที่ยังไม่ใส่หมวด ไม่เข้าคีย์
-- `status <> 'archived'`: สูตรที่เลิกใช้แล้วไม่กันที่ของสูตรใหม่
--
-- ⚠️ DROP ก่อน CREATE เสมอ — `IF NOT EXISTS` ของ index เทียบ **ชื่อ** ไม่ใช่นิยาม
-- (บทเรียน 0181/0182) แก้นิยามแล้วรันซ้ำจะเงียบและไม่มีผล
-- ────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS formulas_identity_uk;
CREATE UNIQUE INDEX formulas_identity_uk
  ON public.formulas ("categoryCode", "scentId")
  WHERE "categoryCode" IS NOT NULL AND "scentId" IS NOT NULL AND status <> 'archived';

-- ────────────────────────────────────────────────────────────────────────
-- 5) ลูกค้าของสูตรมาจากกลิ่นเสมอ
--
-- ⚠️ **ทับของเดิม ไม่ใช่เติมเฉพาะที่ว่าง** — ของเดิมทั้ง 7 แถวมีลูกค้าอยู่แล้ว
-- ถ้าเติมเฉพาะที่ว่างก็จะไม่มีอะไรเกิดขึ้น และความขัดแย้งที่ตั้งใจปิดจะยังอยู่
-- (ดูคิวรีตรวจที่หัวไฟล์ — ต้องดูก่อนว่ามีแถวไหนจะโดนทับบ้าง)
--
-- สูตรที่ไม่ผูกกลิ่น = สูตรฐาน ไม่แตะ ลูกค้าเดิมอยู่ต่อ
-- ────────────────────────────────────────────────────────────────────────
UPDATE public.formulas f
   SET "customerId"   = s."customerId",
       "customerName" = s."customerName",
       "updatedAt"    = now()
  FROM public.scents s
 WHERE s.id = f."scentId"
   AND f."customerId" IS DISTINCT FROM s."customerId";

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────
-- ต้องได้ 0 — ลูกค้าของสูตรตรงกับลูกค้าของกลิ่นทุกแถวแล้ว
-- SELECT count(*) FROM formulas f JOIN scents s ON s.id = f."scentId"
--  WHERE f."customerId" IS DISTINCT FROM s."customerId";
--
-- ต้องมี index ชื่อนี้และเป็น partial ตามนิยามข้างบน
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'formulas_identity_uk';
--
-- ต้องรับ 'developing' ได้แล้ว
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.formulas'::regclass AND conname = 'formulas_status_check';
--
-- ── Rollback ───────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS formulas_identity_uk;
-- ALTER TABLE public.formulas
--   DROP COLUMN IF EXISTS "categoryCode", DROP COLUMN IF EXISTS "customerTradeName",
--   DROP COLUMN IF EXISTS "derivedFromFormulaId", DROP COLUMN IF EXISTS "ownerId",
--   DROP COLUMN IF EXISTS "ownerName", DROP COLUMN IF EXISTS "dealId";
-- (ลูกค้าที่ถูกทับในข้อ 5 ย้อนไม่ได้ — ดูคิวรีตรวจที่หัวไฟล์ก่อนรัน)
