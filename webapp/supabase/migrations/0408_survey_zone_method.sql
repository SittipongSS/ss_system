-- ============================================================
--  Migration 0408: วิธีประเมินรายพื้นที่ (ลงหน้างาน / ประเมินจากแบบ)
--  แผน ~/ss-team/mockups/survey-desk-assessment/PLAN.md §1 · มติเจ้าของ 08–09/10
--
--  ⭐ ที่มา: คำร้องประเมินพื้นที่ 5 จาก 10 ใบแรกเป็นงานจากแบบแปลนหรือหน้างานยังไม่พร้อม
--    แต่ระบบไม่มีที่บอกว่า "ใบนี้ประเมินจากแบบ" — ทีมจึงเปิดนัดปลอม กด "ไปแล้วเข้าไม่ได้"
--    และแนบไฟล์แบบแปลนลงช่องภาพกว้างเพื่อให้ผ่านด่าน · มติ: วิธีประเมินเก็บ **รายพื้นที่**
--    (ใบเดียวผสมได้) · "ใบนี้ต้องมีนัดไหม" คำนวณจากแถวพื้นที่เสมอ ไม่เก็บซ้ำ
--
--  ⭐ ใบนี้เพิ่มคอลัมน์อย่างเดียว — ไม่มี backfill ไม่มี DML:
--    service_survey_zones
--      method               'onsite' (ค่าตั้งต้น = พฤติกรรมเดิมทุกแถว) | 'drawing'
--      methodReason         เหตุผลตอนสลับวิธี (ฝ่ายขายเห็น) ≤ 300 ตัวอักษร
--      methodChangedAt      เวลาที่สลับครั้งล่าสุด · NULL = ไม่เคยสลับ
--      methodChangedByName  ชื่อคนสลับ (ภาพนิ่ง ไม่ซิงก์ตามบัญชี)
--    dept_requests
--      surveyConfirm        ที่หัวหน้าเลือกตอนส่งผล: 'needed' = ต้องยืนยันหน้างาน ·
--                           'not_needed' = ไม่ต้องยืนยันหน้างาน · NULL = ยังไม่ได้ส่ง/ไม่มีพื้นที่จากแบบ
--      surveyConfirmOfId    ใบยืนยันหน้างานชี้กลับใบเดิม (text ไม่มี FK — แบบเดียวกับ
--                           service_visits."requestId" ใน 0314)
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน merge โค้ดที่อ่าน/เขียนคอลัมน์พวกนี้**
--    (PostgREST ปฏิเสธคีย์ที่ไม่รู้จัก ⇒ เพิ่มพื้นที่ในใบประเมินไม่ได้ทั้งระบบ — บทเรียน 0351)
--  ⚠ รันก่อน deploy ได้อย่างปลอดภัย — โค้ดเก่าไม่เอ่ยชื่อคอลัมน์ใหม่ และทุกแถวเดิมได้ 'onsite'
--  ⚠ รันซ้ำได้ทั้งใบ
--  ⚠ ถอยโค้ดไม่ต้องถอดคอลัมน์ (เพิ่มอย่างเดียว) · เมื่อมีแถว 'drawing' แล้ว ห้ามถอยกติกาวิธีประเมิน
--    ให้ปิดสวิตช์ SURVEY_DRAWING_METHOD แทน
-- ============================================================

BEGIN;

-- ── 1) วิธีประเมินต่อพื้นที่ ────────────────────────────────────────────────
ALTER TABLE public.service_survey_zones
  ADD COLUMN IF NOT EXISTS "method"              text NOT NULL DEFAULT 'onsite',
  ADD COLUMN IF NOT EXISTS "methodReason"        text,
  ADD COLUMN IF NOT EXISTS "methodChangedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "methodChangedByName" text;

ALTER TABLE public.service_survey_zones
  DROP CONSTRAINT IF EXISTS service_survey_zones_method_check;
ALTER TABLE public.service_survey_zones
  ADD CONSTRAINT service_survey_zones_method_check
  CHECK ("method" IN ('onsite','drawing'));

ALTER TABLE public.service_survey_zones
  DROP CONSTRAINT IF EXISTS service_survey_zones_method_reason_len;
ALTER TABLE public.service_survey_zones
  ADD CONSTRAINT service_survey_zones_method_reason_len
  CHECK ("methodReason" IS NULL OR length("methodReason") <= 300);

COMMENT ON COLUMN public.service_survey_zones."method" IS
  'วิธีประเมินของพื้นที่: onsite = ลงหน้างาน · drawing = ประเมินจากแบบ (0408)';

-- ── 2) ที่หัวหน้าเลือกตอนส่งผล + ลิงก์ใบยืนยันหน้างาน ──────────────────────────
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "surveyConfirm"     text,
  ADD COLUMN IF NOT EXISTS "surveyConfirmOfId" text;

ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_survey_confirm_check;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_survey_confirm_check
  CHECK ("surveyConfirm" IS NULL OR "surveyConfirm" IN ('needed','not_needed'));

CREATE INDEX IF NOT EXISTS dept_requests_survey_confirm_of_idx
  ON public.dept_requests ("surveyConfirmOfId") WHERE "surveyConfirmOfId" IS NOT NULL;

COMMENT ON COLUMN public.dept_requests."surveyConfirm" IS
  'คำร้องประเมินพื้นที่: needed = ต้องยืนยันหน้างาน · not_needed = ไม่ต้องยืนยันหน้างาน (0408)';
COMMENT ON COLUMN public.dept_requests."surveyConfirmOfId" IS
  'ใบยืนยันหน้างาน → id ของคำร้องเดิมที่ประเมินจากแบบ (0408)';

COMMIT;

NOTIFY pgrst, 'reload schema';
