-- ============================================================
--  Migration 0424: นัดหมายของลีด + ห้อง Studio (มติเจ้าของ 05/11/2026)
--
--  ⭐ มติเจ้าของ (ถามทีละข้อ 05/11):
--     1. เช็คห้องชนกับ **ทุกนัดที่ใช้ Studio** — นัดที่ MKT กรอกตอนรับลีด + นัดที่ AE บันทึก
--        "นัดประชุม" แบบลูกค้าเข้ามา (AE เลือกห้องด้วย) · ทุกนัดขึ้นปฏิทินนัดที่เดียวกัน
--     2. เวลาพิมพ์เริ่ม–จบเองทุกครั้ง (ไม่ใช่รอบตายตัว)
--     3. ห้องเดียวกันเวลาคาบกัน = **บล็อก** บันทึกไม่ได้ (ฐานกันสองคนกดพร้อมกันด้วย — EXCLUDE ข้างล่าง)
--     4. รูปแบบนัดของ MKT: Studio (ต้องเลือกห้อง) / Online / โทร — สองแบบหลังไม่มีห้อง ไม่เช็คชน แต่ติดธงในรายการ
--     5. นัดที่ MKT กรอก **ยังไม่นับเป็นนัดประชุม** (สถานะลีด/KPI ได้นัดใน 14 วัน) — รอ AE กด "นัดประชุม"
--        ซึ่งเติมช่องจากนัดนี้ให้ · จึงเป็นตารางแยก ไม่ใช่แถว `lead_events` kind='meeting'
--     6. ลีดหนึ่งใบมีนัดที่รออยู่นัดเดียว — บันทึกนัดใหม่ = นัดเดิมที่ยังไม่ถึงเวลาถูกแทนที่ (คืนห้อง)
--        · มีปุ่มยกเลิกนัด · ปิดลีด "ไม่ไปต่อ" = คืนห้องอัตโนมัติ
--
--  ── ทำไมเป็นตารางใหม่ ไม่ใช่คอลัมน์บน sales_leads / lead_events ──────────────────────────────
--   · ด่านกันห้องชนต้องอยู่บน **ตารางเดียว** (EXCLUDE ข้ามตารางไม่ได้) และต้องรวมทั้งนัดของ MKT และของ AE
--   · `lead_events` ไม่มีทางแก้/ยกเลิกแถว (ทั้ง repo มีแต่ insert) — นัดที่ถูกเลื่อนจะกันห้องค้างตลอดไป
--     ตารางนี้ "ปิด" แถวได้ด้วย endedAt/endedReason โดยไม่ลบประวัติ
--   · ใส่นัดของ MKT เป็น kind='meeting' = KPI ได้นัดใน 14 วัน (lead-meeting-rate D14) นับทันทีตอน MKT กรอก
--     ซึ่งขัดมติข้อ 5 และ MKT เป็นผู้ถูกวัด KPI นี้เอง
--
--  ── ทำอะไร ───────────────────────────────────────────────────────────────────────────────
--   ตารางใหม่ public.lead_appointments
--     source   intake (MKT กรอกตอนรับ/แก้ลีด) | meeting (AE บันทึกนัดประชุม — "leadEventId" ชี้แถว lead_events)
--     mode     onsite_at_office (Studio) | online | phone | onsite_customer_visit — ชุดเดียวกับ MEETING_MODES + phone
--     room     studio_01 | studio_02 | studio_03 — มีเฉพาะ onsite_at_office (CHECK บังคับคู่กัน)
--     startAt / endAt  ช่วงครึ่งเปิด [start, end) · จบชนเริ่มพอดี (13:30–15:00 กับ 15:00–16:30) ไม่ถือว่าชน
--     endedAt / endedReason  replaced (มีนัดใหม่แทน) | cancelled (กดยกเลิก) | lead_closed (ปิดลีดไม่ไปต่อ)
--   ⭐ EXCLUDE lead_appointments_room_no_overlap — ห้องเดียวกัน ช่วงเวลาคาบกัน ของ **ลีดต่างใบ** ที่ยังไม่ปิด = ฐานปฏิเสธ
--     (SQLSTATE 23P01 · API แปลงเป็นข้อความไทยบอกว่าชนนัดไหน) · ลีดใบเดียวกันไม่ชนตัวเอง โดยเจตนา:
--     AE ยืนยันนัดที่ MKT จองไว้ (ห้องเดิม เวลาเดิม) ต้องบันทึกได้ — API แทรกนัดใหม่ก่อนแล้วค่อยปิดนัดเดิม
--   "leadEventId" ไม่ผูก FK โดยเจตนา — API สร้างนัดก่อนแถว lead_events (ชนแล้วต้องไม่มีอะไรขยับ)
--
--  ✅ รันบนฐานจริงแล้ว 05/11/2026 (table_ok = 1 · exclusion_ok = 1) — ไม่ต้องรันซ้ำ (รันซ้ำได้ ไม่มีผล)
--
--  ── ผลต่อข้อมูลเดิม ───────────────────────────────────────────────────────────────────────────
--   ไม่มี — ตารางใหม่ว่าง · ไม่ backfill (นัดเดิมของ AE ไม่มีห้อง/เวลาจบ · ข้อความนัดที่ MKT แปะในรายละเอียดลีด
--   ไม่มีห้อง) ⇒ นัดก่อนวันรันไม่ถูกนับในการเช็คห้องชน
--   · ลำดับรันกับ deploy: **รันไฟล์นี้ก่อน deploy** — โค้ดใหม่บันทึกนัดลงตารางนี้ (ก่อนรัน = รับลีดพร้อมนัด/บันทึกนัดประชุม error)
--     ส่วนการอ่าน (ธงในรายการ/ปฏิทิน) ถ้าตารางยังไม่มีจะข้ามเงียบพร้อม log ไม่ล้มทั้งหน้า
--   · โค้ดเก่าบนฐานใหม่ไม่กระทบ (ไม่แตะตารางนี้)
--
--  ── ทางกลับ ────────────────────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.lead_appointments;
--   ⚠️ นัด/ห้องที่บันทึกไว้หายถาวร (เวลานัดของ AE ยังอยู่ที่ lead_events.eventAt) · btree_gist ปล่อยไว้ได้
--  รันซ้ำได้
-- ============================================================

-- `=` ของ text ใน EXCLUDE แบบ gist ต้องใช้ btree_gist (Supabase มีให้ · ติดตั้งลง schema extensions ตามแนวของแพลตฟอร์ม)
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.lead_appointments (
  id text PRIMARY KEY,
  "leadId" text NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('intake', 'meeting')),
  mode text NOT NULL CHECK (mode IN ('onsite_at_office', 'online', 'phone', 'onsite_customer_visit')),
  room text CHECK (room IS NULL OR room IN ('studio_01', 'studio_02', 'studio_03')),
  "startAt" timestamptz NOT NULL,
  "endAt" timestamptz NOT NULL,
  "leadEventId" text,
  "endedAt" timestamptz,
  "endedReason" text CHECK ("endedReason" IS NULL OR "endedReason" IN ('replaced', 'cancelled', 'lead_closed')),
  "endedBy" text,
  "endedByName" text,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_appointments_range_check CHECK ("endAt" > "startAt" AND "endAt" - "startAt" <= interval '12 hours'),
  CONSTRAINT lead_appointments_room_mode_check CHECK ((mode = 'onsite_at_office') = (room IS NOT NULL)),
  CONSTRAINT lead_appointments_ended_check CHECK (("endedAt" IS NULL) = ("endedReason" IS NULL))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lead_appointments'::regclass AND conname = 'lead_appointments_room_no_overlap'
  ) THEN
    ALTER TABLE public.lead_appointments
      ADD CONSTRAINT lead_appointments_room_no_overlap
      EXCLUDE USING gist (
        room WITH =,
        "leadId" WITH <>,
        tstzrange("startAt", "endAt", '[)') WITH &&
      ) WHERE (room IS NOT NULL AND "endedAt" IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_appointments_lead_idx ON public.lead_appointments ("leadId", "startAt" DESC);
CREATE INDEX IF NOT EXISTS lead_appointments_active_start_idx ON public.lead_appointments ("startAt") WHERE "endedAt" IS NULL;

ALTER TABLE public.lead_appointments ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- เช็คหลังรัน: ต้องได้ 1 แถว (ตาราง) และ constraint กันห้องชน 1 ตัว
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_appointments') AS table_ok,
  (SELECT count(*) FROM pg_constraint WHERE conname = 'lead_appointments_room_no_overlap') AS exclusion_ok;
