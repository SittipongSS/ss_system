-- ══════════════════════════════════════════════════════════════════════
--  0206: เก็บรหัสตัวอย่างไว้ แล้วทิ้งตารางรอบของกลิ่น (P2)
--
--  ⚠️ **ไฟล์นี้ถูกแก้หลัง merge แต่ก่อนรันครั้งแรก** — ตอนเขียนครั้งแรกมีแต่
--  DROP TABLE เพราะแผนบอกว่า "sampleCode ไม่ใช้แล้ว" · พอไปนับของจริงก่อนรัน
--  พบว่า **ทั้ง 29 แถวมี sampleCode** ที่เป็นรหัสมีระบบ ⇒ เพิ่มขั้นเก็บของเข้ามา
--  (ยังไม่เคยรันบน prod จึงแก้ไฟล์เดิมได้ ไม่ต้องออกเลขใหม่)
--
--  ⚠️⚠️ **รันไฟล์นี้หลัง deploy โค้ดที่เลิกอ่าน scent_revisions แล้วเท่านั้น**
--     ลำดับที่ถูก: 0205 → merge + deploy → 0206 นี้
--     รันก่อน deploy = หน้าทะเบียนกลิ่นพังทั้งหน้าทันที (โค้ดเก่า join ตารางนี้
--     ทุกครั้งที่อ่านกลิ่น ทั้ง loadScents และ findScent)
--
--  ⚠️ **ต้องรัน 0205 มาก่อนเสมอ** — 0205 เป็นตัวที่ยก `sentAt` ของทั้ง 29 แถว
--     ขึ้นไปไว้บน scents · ข้ามไปรันไฟล์นี้ตรง ๆ = วันที่ส่งกลิ่นหายถาวร
--     ตรวจก่อนรัน:  SELECT count(*) FROM scents WHERE "sentAt" IS NOT NULL;  -- ต้อง 29
--
--  ── ทำไมทิ้ง ────────────────────────────────────────────────────────
--  มติผู้ใช้ 2026-08-04: ลูกค้าให้แก้ ⇒ ได้ **กลิ่นตัวใหม่** ที่มีรหัส ชื่อ วันที่
--  ของตัวเอง แล้วชี้กลับตัวเดิมด้วย `derivedFromScentId` (0205)
--  ⇒ กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต ⇒ ตารางรอบไม่มีของให้เก็บอีก
--
--  ครึ่ง "ผลตอบรับ" (feedbackStatus/feedbackAt/feedback) ไม่เคยถูกใช้เลยบน prod
--  (0 แถวที่ไม่ใช่ 'pending') และย้ายไปอยู่บน **แถวคำร้อง** แล้ว —
--  `dept_request_items.outcome` ∈ (confirmed | revise | rejected) จาก 0204
--
--  ⚠️ `UPDATE_KINDS.scent.feedback` ใน lib/master/updateTypes.js **ห้ามลบ** ทั้งที่
--  เลิกเขียนใหม่แล้ว — entity_updates มีแถวเก่าที่ใช้ kind นั้นอยู่ ถอดทะเบียน
--  เมื่อไร เหตุการณ์เก่าในเธรดจะกลายเป็นช่องว่าง
--
--  ⚠ รันมือบน Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 0) ⭐ **เก็บของที่ยังมีค่าไว้ก่อนทิ้งตาราง**
--
-- 🔍 ตรวจของจริงก่อนรัน (2026-08-05) แล้วพบว่า **ทั้ง 29 แถวมี `sampleCode`**
--    และเป็นรหัสที่มีระบบจริง ไม่ใช่ค่าขยะ: PF4400101-103 · PF1092501…PF1095401 ·
--    PF8020101-103 · PF7670101-103 · PF1190101-103
--    ⇒ แผนเดิมเขียนว่า "sampleCode ไม่ใช้แล้ว ตัดทิ้งได้" ซึ่ง **ไม่ตรงกับข้อมูล**
--
-- ⚠️ นี่คือ *คนละรหัส* กับ `scents.code` — code คือรหัสกลิ่นในทะเบียน ส่วน
--    sampleCode คือรหัสของ **ตัวอย่างที่ส่งออกไปจริง** (กลิ่นทั้ง 29 ตัวมี code อยู่แล้ว
--    เพราะ CHECK scents_code_required_when_accepted บังคับตั้งแต่พ้นสถานะร่าง)
--    ⇒ ทิ้งไปคือเสียสายที่โยงกลับไปหาขวดที่ลูกค้าถืออยู่
--
-- เก็บเป็น **คอลัมน์** ไม่ใช่ยัดลงข้อความ — repo นี้มีบทเรียนเรื่องยัดข้อมูลมีโครงสร้าง
-- ลงช่องข้อความอิสระอยู่แล้ว (0171: ชื่อกลิ่นไปโผล่ในช่องชื่อสูตร 10 แถว)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scents
  ADD COLUMN IF NOT EXISTS "sampleCode" text;

ALTER TABLE public.scents
  DROP CONSTRAINT IF EXISTS scents_sample_code_len;
ALTER TABLE public.scents
  ADD CONSTRAINT scents_sample_code_len
  CHECK ("sampleCode" IS NULL OR length(btrim("sampleCode")) BETWEEN 1 AND 100);

DO $$
BEGIN
  IF to_regclass('public.scent_revisions') IS NOT NULL THEN
    -- รหัสตัวอย่างของ Rev ล่าสุด (ของจริงมีตัวเดียวต่อกลิ่นอยู่แล้ว)
    UPDATE public.scents s
       SET "sampleCode" = r."sampleCode"
      FROM (
        SELECT DISTINCT ON ("scentId") "scentId", "sampleCode"
          FROM public.scent_revisions
         WHERE NULLIF(btrim(COALESCE("sampleCode", '')), '') IS NOT NULL
         ORDER BY "scentId", "revisionNo" DESC
      ) r
     WHERE r."scentId" = s.id
       AND s."sampleCode" IS NULL;

    -- หมายเหตุของรอบ (prod = 3 แถว เช่น "กำหนดส่ง: 02/07/2569") ต่อท้ายหมายเหตุ
    -- ของกลิ่น — ช่องข้อความอิสระ → ช่องข้อความอิสระ ความหมายไม่เพี้ยน
    -- ⚠️ ต่อท้าย ไม่ทับ · และไม่ต่อซ้ำถ้ารันไฟล์นี้สองรอบ
    UPDATE public.scents s
       SET note = btrim(concat_ws(E'\n', NULLIF(btrim(COALESCE(s.note, '')), ''), r.note))
      FROM (
        SELECT DISTINCT ON ("scentId") "scentId", btrim(note) AS note
          FROM public.scent_revisions
         WHERE NULLIF(btrim(COALESCE(note, '')), '') IS NOT NULL
         ORDER BY "scentId", "revisionNo" DESC
      ) r
     WHERE r."scentId" = s.id
       AND POSITION(r.note IN COALESCE(s.note, '')) = 0;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 1) ทิ้งตาราง
--
-- CASCADE ไม่จำเป็น: ไม่มี FK ตัวไหนชี้เข้ามาที่ตารางนี้ (มันเป็นฝั่งลูกอย่างเดียว)
-- ใส่แล้วจะกลายเป็นการอนุญาตให้ลบของที่มองไม่เห็นไปด้วย จึงตั้งใจไม่ใส่
-- ────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.scent_revisions;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────
-- SELECT to_regclass('public.scent_revisions');                 -- ต้องได้ NULL
-- SELECT count(*) FROM scents WHERE "sentAt" IS NOT NULL;       -- ยังต้องได้ 29
-- SELECT count(*) FROM scents WHERE "sampleCode" IS NOT NULL;   -- ต้องได้ 29
-- SELECT count(*) FROM scents WHERE note ILIKE '%กำหนดส่ง%'
--                                OR note ILIKE '%วันที่สูตรกลิ่น%';  -- ต้องได้ 3
--
-- ── Rollback ───────────────────────────────────────────────────────────
-- ไม่มี — ตารางถูกลบแล้วกู้จาก backup ของ Supabase เท่านั้น
-- (ข้อมูลที่ยังมีความหมายถูกยกไป scents."sentAt" ตั้งแต่ 0205)
