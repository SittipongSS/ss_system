-- ============================================================
--  Migration 0188: รอบบริการ + ตารางนัดเข้าไซต์ (S-2)
--  แผน docs/service-production-scheduling-plan.md §4.2
--
--  ⭐ `service_visits` คือ "ตาราง" ที่ผู้ใช้ขอตั้งแต่ต้น — หนึ่งแถว = หนึ่งนัด
--  ส่วน `service_plans` คือรอบที่ทำให้นัดถูก gen ล่วงหน้าโดยไม่ต้องจำเอง
--
--  ⚠ **ไม่มีคอลัมน์ `slot` (เช้า/บ่าย)** — เก็บคู่กับเวลาจริงเมื่อไหร่ก็เพี้ยนหากัน
--    เมื่อนั้น (บทเรียนสูตรภาษี 4 ชุด) · "เช้า/บ่าย/เต็มวัน" เป็นปุ่มลัดใน UI ที่เติม
--    startTime/endTime ให้ · ปฏิทินจัดกลุ่มจากเวลาจริงเสมอ
--
--  ⚠ `time` ไม่ใช่ `timestamptz` — งานนี้เป็นเวลาไทยล้วน เก็บ date+time แยกกัน
--    ปลอดภัยกว่าของที่แปลงโซนแล้วเลื่อนวันเงียบ ๆ
--
--  ⚠ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน รันก่อน deploy ได้เลย
--    ต้องรัน **หลัง** 0187 (FK ชี้ไป service_sites / service_assets)
-- ============================================================

BEGIN;

-- ── รอบบริการของไซต์ (ทุก N วัน) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_plans (
  id              text PRIMARY KEY,
  "siteId"        text NOT NULL REFERENCES public.service_sites(id) ON DELETE CASCADE,
  "salesOrderId"  text,                      -- สัญญาบริการที่ครอบรอบนี้ (ถ้ามี)
  kind            text NOT NULL CHECK (kind IN ('refill', 'maintenance', 'inspect')),
  -- 30 = ทุกเดือน · เพดาน 365 เพราะรอบที่ยาวกว่าปีคือพิมพ์ผิด ไม่ใช่นโยบาย
  "everyDays"     integer NOT NULL CHECK ("everyDays" BETWEEN 1 AND 365),
  "startDate"     date NOT NULL,
  "endDate"       date,
  "assigneeId"    text, "assigneeName" text, -- ช่างประจำ = ค่าตั้งต้นของนัดที่ gen
  "isActive"      boolean NOT NULL DEFAULT true,
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_plans_dates_sane CHECK (
    "startDate" BETWEEN '2000-01-01' AND '2100-12-31'
    AND ("endDate" IS NULL OR "endDate" BETWEEN '2000-01-01' AND '2100-12-31')
  ),
  CONSTRAINT service_plans_end_after_start CHECK (
    "endDate" IS NULL OR "endDate" >= "startDate"
  )
);

CREATE INDEX IF NOT EXISTS service_plans_site_idx
  ON public.service_plans ("siteId") WHERE "isActive";

-- ── ★ นัดเข้าไซต์ = แถวบน "ตาราง" ที่ผู้ใช้ขอ ────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_visits (
  id              text PRIMARY KEY,
  code            text UNIQUE,               -- SV-YYMMXXXX (next_entity_number scope 'SV')
  -- RESTRICT: ลบไซต์ที่ยังมีประวัติการเข้าไม่ได้ (ประวัติคือของมีค่าที่สุดของโมดูล)
  "siteId"        text NOT NULL REFERENCES public.service_sites(id) ON DELETE RESTRICT,
  -- SET NULL: ลบรอบทิ้งแล้วนัดที่เคย gen ต้องอยู่ต่อในฐานะงานนอกรอบ
  "planId"        text REFERENCES public.service_plans(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (
                    kind IN ('install', 'refill', 'maintenance', 'repair', 'inspect', 'remove')),

  "scheduledDate" date NOT NULL,
  "startTime"     time, "endTime" time,      -- ว่าง = นัดไว้ทั้งวัน ยังไม่ระบุเวลา
  "assigneeId"    text, "assigneeName" text,
  "assistantIds"  jsonb NOT NULL DEFAULT '[]'::jsonb,

  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'done', 'rescheduled', 'cancelled')),
  "actualDate"    date, "actualStartTime" time, "actualEndTime" time,

  summary         text CHECK (summary IS NULL OR length(summary) <= 2000),
  "customerSignatureUrl" text,
  attachments     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- โยงนัดเดิมที่ถูกเลื่อนมา — ประวัติการเลื่อนอ่านย้อนได้เป็นสาย
  "rescheduledFromId" text REFERENCES public.service_visits(id) ON DELETE SET NULL,

  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_visits_time_window CHECK (
    "startTime" IS NULL OR "endTime" IS NULL OR "startTime" < "endTime"
  ),
  CONSTRAINT service_visits_actual_time_window CHECK (
    "actualStartTime" IS NULL OR "actualEndTime" IS NULL OR "actualStartTime" < "actualEndTime"
  ),
  CONSTRAINT service_visits_dates_sane CHECK (
    "scheduledDate" BETWEEN '2000-01-01' AND '2100-12-31'
    AND ("actualDate" IS NULL OR "actualDate" BETWEEN '2000-01-01' AND '2100-12-31')
  ),
  CONSTRAINT service_visits_assistants_array CHECK (
    jsonb_typeof("assistantIds") = 'array'
  ),
  CONSTRAINT service_visits_attachments_array CHECK (
    jsonb_typeof(attachments) = 'array'
  ),
  -- ปิดงานแล้วต้องรู้ว่าเข้าจริงวันไหน ไม่งั้น `nextAfterDone` คำนวณรอบถัดไปไม่ได้
  -- (รอบถัดไปนับจาก **วันที่ทำจริง** ไม่ใช่วันที่นัดไว้)
  CONSTRAINT service_visits_done_needs_actual_date CHECK (
    status <> 'done' OR "actualDate" IS NOT NULL
  )
);

-- ปฏิทินอ่านด้วยช่วงวันเสมอ (สัปดาห์/เดือน) → ดัชนีตามวันคือตัวหลัก
CREATE INDEX IF NOT EXISTS service_visits_date_idx
  ON public.service_visits ("scheduledDate");
CREATE INDEX IF NOT EXISTS service_visits_assignee_date_idx
  ON public.service_visits ("assigneeId", "scheduledDate");
CREATE INDEX IF NOT EXISTS service_visits_site_date_idx
  ON public.service_visits ("siteId", "scheduledDate" DESC);
-- gen นัดตามรอบต้องเช็คว่ามีนัดของรอบนั้นวันนั้นแล้วหรือยัง
CREATE INDEX IF NOT EXISTS service_visits_plan_date_idx
  ON public.service_visits ("planId", "scheduledDate") WHERE "planId" IS NOT NULL;

-- ── ของที่ใช้จริงในนัด (มติ §10.2: บันทึกอย่างเดียว ไม่ตัดสต็อก) ──────────
CREATE TABLE IF NOT EXISTS public.service_visit_items (
  id              text PRIMARY KEY,
  "visitId"       text NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  "assetId"       text REFERENCES public.service_assets(id) ON DELETE SET NULL,
  "productId"     text,
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  -- ⚠️ qty ว่างได้ — "เติมน้ำหอมขวดนึง" ที่ยังไม่ได้ชั่งจริงมี · ห้ามแปลงเป็น 0
  qty             numeric CHECK (qty IS NULL OR qty > 0),
  unit            text CHECK (unit IS NULL OR length(unit) <= 30),
  note            text CHECK (note IS NULL OR length(note) <= 500),
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_visit_items_visit_idx
  ON public.service_visit_items ("visitId");

ALTER TABLE public.service_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visit_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_plans, public.service_visits, public.service_visit_items
  FROM anon, authenticated;
GRANT  ALL ON TABLE public.service_plans, public.service_visits, public.service_visit_items
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
