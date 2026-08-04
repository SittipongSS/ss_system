-- ══════════════════════════════════════════════════════════════════════
--  0205: วันที่ส่งกลิ่นย้ายมาอยู่บนตัวกลิ่น + ชื่อทางการค้า + สายพันธุ์ (P2)
--
--  ⭐ **ไฟล์นี้เป็นส่วน "เพิ่มของ" ล้วน — ไม่ลบอะไรเลย**
--     ตัวที่ DROP TABLE scent_revisions คือ `0206` ซึ่งต้องรัน **ทีหลัง**
--
--  ⚠️⚠️ **ลำดับการรันกลับด้านจากทุกครั้งที่ผ่านมา**
--     1) รัน 0205 นี้ก่อน  ← ทำตอนนี้ (โค้ดเก่ายังทำงานได้ปกติ คอลัมน์ใหม่ไม่มีใครแตะ)
--     2) merge + deploy โค้ดที่เลิกอ่าน scent_revisions
--     3) รัน 0206 (DROP TABLE)
--     สลับ 1↔2 เมื่อไร หน้าทะเบียนกลิ่นจะโชว์ "ยังไม่ส่ง" ทั้ง 29 แถวชั่วคราว
--     สลับ 2↔3 เมื่อไร หน้าทะเบียนกลิ่นพังทั้งหน้า (โค้ดเก่า join ตารางที่หายไปแล้ว)
--
--  ── ที่มา ───────────────────────────────────────────────────────────
--  มติผู้ใช้ 2026-08-04: **ลูกค้าให้แก้ = ได้กลิ่นตัวใหม่ ไม่ใช่ Rev. ของตัวเดิม**
--  ⇒ กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต ⇒ ตาราง scent_revisions ไม่มีของให้เก็บ
--
--  ⚠️ **แต่ข้อมูลที่อยู่ในนั้นมีค่าและต้องไม่หาย** — สภาพ prod (2026-08-05):
--     · scent_revisions = 29 แถว · scents = 33 · มี currentRevisionNo > 0 อยู่ 29
--     · feedbackStatus <> 'pending' = **0 แถว** ⇒ ครึ่ง "ผลตอบรับ" ไม่เคยถูกใช้เลย
--       แต่ครึ่ง "บันทึกว่าส่งแล้ว" ถูกใช้จริง 29 ครั้ง
--  ⇒ ยก `sentAt` ขึ้นมาไว้บนตัวกลิ่น แล้วค่อยทิ้งตาราง (ไม่ใช่ทิ้งทั้งก้อน)
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1) วันที่ส่งกลิ่นให้ลูกค้า — ช่องเดียวบนตัวกลิ่น
--
-- ไม่มี CHECK บังคับว่าต้องมาหลัง createdAt โดยตั้งใจ — RD บันทึกย้อนหลังเป็นปกติ
-- (ของส่งไปเมื่อสัปดาห์ก่อน เพิ่งมากรอกวันนี้) เหมือนที่ 0204 ตัดสินไว้กับ 4 ก้าว
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scents
  ADD COLUMN IF NOT EXISTS "sentAt"     date,
  ADD COLUMN IF NOT EXISTS "sentById"   text,
  ADD COLUMN IF NOT EXISTS "sentByName" text;

-- ────────────────────────────────────────────────────────────────────────
-- 2) ⭐ ยกวันที่ส่งจากตารางรอบขึ้นมา — **ต้องทำก่อน 0206 เท่านั้น**
--
-- DISTINCT ON = เอา Rev ล่าสุดของกลิ่นแต่ละตัว (ของจริงส่วนใหญ่มีตัวเดียวอยู่แล้ว)
-- ห่อด้วย to_regclass เพื่อให้ไฟล์นี้รันซ้ำได้แม้ 0206 ทิ้งตารางไปแล้ว
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.scent_revisions') IS NOT NULL THEN
    UPDATE public.scents s
       SET "sentAt"     = r."sentAt",
           "sentById"   = r."sentById",
           "sentByName" = r."sentByName"
      FROM (
        SELECT DISTINCT ON ("scentId")
               "scentId", "sentAt", "sentById", "sentByName"
          FROM public.scent_revisions
         WHERE "sentAt" IS NOT NULL
         ORDER BY "scentId", "revisionNo" DESC
      ) r
     WHERE r."scentId" = s.id
       AND s."sentAt" IS NULL;   -- ไม่ทับของที่กรอกใหม่ไปแล้ว
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 3) ชื่อที่ลูกค้าตั้งเอง
--
-- ⚠️ **ห้ามแสดงแทนรหัส/ชื่อของเรา ต้องแสดงคู่กันเสมอ** — ปล่อยให้แทนกันเมื่อไร
-- จะเข้าโรคเดิมที่ 0171 บันทึกไว้ (prod มีสินค้า 10 แถวที่เอาชื่อกลิ่นไปกรอก
-- ช่องชื่อสูตร เพราะไม่มีที่เก็บที่ถูกต้อง)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scents
  ADD COLUMN IF NOT EXISTS "customerTradeName" text;

ALTER TABLE public.scents
  DROP CONSTRAINT IF EXISTS scents_trade_name_len;
ALTER TABLE public.scents
  ADD CONSTRAINT scents_trade_name_len
  CHECK ("customerTradeName" IS NULL OR length(btrim("customerTradeName")) BETWEEN 1 AND 200);

-- ────────────────────────────────────────────────────────────────────────
-- 4) สายพันธุ์ — "แก้มาจากกลิ่นตัวไหน"
--
-- ⭐ ดีกว่า Rev. ตรงที่ Rev. บังคับให้เป็นเส้นตรง แต่งานจริงแตกกิ่งได้ — ลูกค้า
-- ให้แก้ทั้ง A และ C พร้อมกัน แล้วเลือกตัวที่แตกจาก A
--
-- ⚠️ เก็บเป็น **id ไม่ใช่ข้อความ** — โรคประจำถิ่นของ repo นี้คือ "จับคู่ด้วยข้อความ"
-- SET NULL ไม่ใช่ RESTRICT: ลบกลิ่นต้นทางแล้วกลิ่นลูกต้องอยู่ต่อได้ (ด่านกันลบอยู่
-- ที่ชั้นแอป — deleteScentError + scentForcePreview)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scents
  ADD COLUMN IF NOT EXISTS "derivedFromScentId" text;

ALTER TABLE public.scents
  DROP CONSTRAINT IF EXISTS scents_derived_from_fk;
ALTER TABLE public.scents
  ADD CONSTRAINT scents_derived_from_fk
  FOREIGN KEY ("derivedFromScentId") REFERENCES public.scents(id) ON DELETE SET NULL;

-- กันชี้ตัวเอง (วนลูปสั้นที่สุดที่เป็นไปได้ — ยาวกว่านั้นแอปเป็นคนกัน)
ALTER TABLE public.scents
  DROP CONSTRAINT IF EXISTS scents_derived_not_self;
ALTER TABLE public.scents
  ADD CONSTRAINT scents_derived_not_self
  CHECK ("derivedFromScentId" IS NULL OR "derivedFromScentId" <> id);

DROP INDEX IF EXISTS scents_derived_idx;
CREATE INDEX scents_derived_idx
  ON public.scents ("derivedFromScentId") WHERE "derivedFromScentId" IS NOT NULL;

-- ⚠️ `currentRevisionNo` **ไม่ลบ** — ไม่มีใครอ่านแล้ว แต่การ DROP คอลัมน์บนตาราง
-- ที่มีของจริงแลกมาด้วยความเสี่ยงโดยไม่ได้อะไรกลับมา (บทเรียนเดียวกับ 0171 ที่
-- ปล่อยสามช่องข้อความบน products ไว้)

COMMIT;

-- ⚠️ PostgREST แคช schema — ไม่ NOTIFY แล้วคอลัมน์ใหม่จะ 404 และ `const { data }`
-- จะกลืน error กลายเป็น "ไม่พบกลิ่น"
NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────
-- SELECT count(*) FROM scents WHERE "sentAt" IS NOT NULL;   -- ควรได้ 29
-- SELECT count(*) FROM scents;                               -- 33
--
-- ⚠️ **ก่อนรัน 0206 ให้ดูสองช่องนี้ก่อนว่ามีข้อความที่ต้องเก็บไหม** (จะหายไปกับตาราง)
-- SELECT "scentId", "sampleCode", note FROM scent_revisions
--  WHERE NULLIF(btrim(COALESCE("sampleCode", '')), '') IS NOT NULL
--     OR NULLIF(btrim(COALESCE(note, '')), '') IS NOT NULL;
--
-- ── Rollback ───────────────────────────────────────────────────────────
-- ALTER TABLE public.scents
--   DROP COLUMN IF EXISTS "sentAt", DROP COLUMN IF EXISTS "sentById",
--   DROP COLUMN IF EXISTS "sentByName", DROP COLUMN IF EXISTS "customerTradeName",
--   DROP COLUMN IF EXISTS "derivedFromScentId";
