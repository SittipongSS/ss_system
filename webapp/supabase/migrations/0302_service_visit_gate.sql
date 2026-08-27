-- ============================================================
--  Migration 0302: ด่านเข้าไซต์ — ร่อง "ใครปล่อยเข้าคิว" และ "ใครข้ามด่าน"
--
--  มติ docs/service-business-system-plan.md §6 + มติผู้ใช้ 2026-08-28:
--    **สร้างร่างได้เสมอ แต่ต้องครบถึงเข้าคิวได้** — TS ไม่ใช่ต้นทางของงาน
--    ร่างไม่ขึ้นตาราง ไม่นับภาระ ไม่โผล่ในงานวันนี้ของช่าง จนผ่านด่าน 4 ข้อ:
--      1. ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด        [SA]      🅿 รอระบบสัญญา
--      2. ไม่มีงวดเลยกำหนดที่บัญชียังไม่รับรอง   [SA → FN] 🅿 รอระบบสัญญา
--      3. มีช่างผู้รับผิดชอบ                      [TS]      ✅ ใช้ได้แล้ว
--      4. วันนัดอยู่ในช่วงที่ไซต์ยอมให้เข้า      [TS]      ✅ ใช้ได้แล้ว
--
--  ⭐ **ข้ามได้โดยหัวหน้า พร้อมเหตุผลบังคับ + ลงบันทึก** (ข้อบังคับ §6 ข้อ 2) —
--  ของจริงมี 25 จุดที่วิ่งอยู่ตอนนี้ทั้งที่หมดสัญญา ถ้าบล็อกแข็งวันแรก งานหยุดทันที
--
--  ⚠️ ไม่มีคอลัมน์ "ผลการตรวจด่าน" โดยเจตนา — ด่านคำนวณสดจากข้อมูลจริงเสมอ
--  (กติกาเดียวกับ serviceStatus ที่ห้ามเก็บ) · เก็บแค่ **ร่องรอยการตัดสินใจของคน**
--
--  ⚠️ รันมือบน Supabase SQL Editor · additive ล้วน รันก่อน deploy ได้
-- ============================================================

BEGIN;

ALTER TABLE public.service_visits
  -- ใครเป็นคนปล่อยร่างเข้าคิว (draft → scheduled) และเมื่อไร
  ADD COLUMN IF NOT EXISTS "queuedById"   text,
  ADD COLUMN IF NOT EXISTS "queuedByName" text,
  ADD COLUMN IF NOT EXISTS "queuedAt"     timestamptz,
  -- ข้ามด่าน: ใคร เมื่อไร เพราะอะไร · ติดกับใบถาวร ขึ้นบนใบส่งงานด้วย
  ADD COLUMN IF NOT EXISTS "gateOverrideById"   text,
  ADD COLUMN IF NOT EXISTS "gateOverrideByName" text,
  ADD COLUMN IF NOT EXISTS "gateOverrideAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "gateOverrideReason" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_visits_gate_override_reason') THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_gate_override_reason CHECK (
        "gateOverrideAt" IS NULL OR (
          "gateOverrideReason" IS NOT NULL
          AND length(btrim("gateOverrideReason")) BETWEEN 10 AND 500
        )
      );
  END IF;
END $$;

-- คิวรอจัดต้องอ่านเร็วโดยไม่กวาดทั้งตาราง (หน้าจัดคิวเปิดค้างทั้งวัน)
CREATE INDEX IF NOT EXISTS service_visits_draft_idx
  ON public.service_visits ("scheduledDate") WHERE status = 'draft';

COMMENT ON COLUMN public.service_visits."gateOverrideReason" IS
  'เหตุผลที่หัวหน้าปล่อยนัดขึ้นตารางทั้งที่ด่านยังไม่ครบ (≥10 ตัว) — ติดกับใบถาวรและขึ้นบนใบส่งงาน';
COMMENT ON COLUMN public.service_visits."queuedAt" IS
  'เวลาที่ร่างถูกปล่อยเข้าคิว (draft → scheduled) — ไม่ใช่เวลาที่สร้างนัด';

COMMIT;

NOTIFY pgrst, 'reload schema';
