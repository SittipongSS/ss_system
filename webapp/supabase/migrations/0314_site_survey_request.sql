-- ============================================================
--  Migration 0314: คำร้องประเมินพื้นที่ (SA → TS)
--  แผน docs/site-survey-request-plan.md §5.1 · §5.1a
--
--  ⭐ ที่มา: ระบบมีแต่ "ครึ่งหลัง" ของกรวย — ไซต์เกิดได้ทางเดียวคือหลังใบสั่งขาย
--     อนุมัติแล้ว (ตัวช่วยงานเข้าใหม่) · ครึ่งหน้าที่หายไปคือ **ก่อนเสนอราคา**:
--     ยังไม่รู้ว่าพื้นที่กี่ตารางเมตร จึงยังไม่รู้ว่าต้องใช้กี่แพ็คเกจ จึงตั้งราคาไม่ได้
--
--  ⚠️ additive ล้วนทุกข้อ — รันก่อน deploy ได้
--  ⚠️ ต้องรัน 0313 ก่อน (คนละเรื่องกัน แต่เลขต้องเรียง)
-- ============================================================

BEGIN;

-- ── 1) ฝ่าย TS รับคำร้องได้ ────────────────────────────────────────────
-- CHECK เดิมรับแค่ RD/PC/FN (mig 0212) — ไม่ขยาย เปิดใบไม่ได้เลยสักใบ
ALTER TABLE public.dept_requests DROP CONSTRAINT IF EXISTS dept_requests_dept_check;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_dept_check
  CHECK (dept IN ('RD', 'PC', 'FN', 'TS'));

-- ── 2) เวลาบนใบ ───────────────────────────────────────────────────────
-- ⭐ **ใช้คอลัมน์วันที่เดิม เปลี่ยนแค่ป้าย** — หัวข้ออื่นเรียก `requestedDueDate`
--    ว่า "วันที่ต้องการรับงาน" · หัวข้อนี้เรียกว่า "วันที่ต้องการให้เข้าพื้นที่"
--    ผ่านทะเบียน `form` ของหัวข้อ (แพตเทิร์นเดียวกับ titleLabel/bodyLabel)
-- 🔴 เพิ่มคอลัมน์วันที่ตัวใหม่ = ฟอร์มมีช่องวันที่สองช่อง ซึ่งคือความสับสนที่กำลังแก้
--    ⇒ เพิ่มเฉพาะ "เวลา" ที่ระบบคำร้องยังไม่มี
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "requestedDueTime" time,
  ADD COLUMN IF NOT EXISTS "committedDueTime" time;

COMMENT ON COLUMN public.dept_requests."requestedDueTime" IS
  'เวลาที่ผู้ขอต้องการ (คู่กับ requestedDueDate) — หัวข้อประเมินพื้นที่: เวลาที่อยากให้ TS เข้าพื้นที่';
COMMENT ON COLUMN public.dept_requests."committedDueTime" IS
  'เวลาที่ฝ่ายรับปาก (คู่กับ committedDueDate) — หัวข้อประเมินพื้นที่: เวลานัดเข้าพื้นที่จริง';

-- ── 3) หนึ่งใบ = หนึ่งไซต์ ────────────────────────────────────────────
-- ⚠️ **ไม่มี FK โดยเจตนา** — แพตเทิร์นเดียวกับ scentId/quotationId/salesOrderId
--    ที่ตารางนี้มีอยู่แล้วสำหรับหัวข้ออื่น · ร่างที่ยังไม่เลือกไซต์ปล่อยว่างได้
-- ⭐ ทำไมหนึ่งไซต์: `service_visits.siteId` เป็น NOT NULL รายไซต์ ⇒ ใบที่มีสามสถานที่
--    ต้องมีสามนัด แต่ใบมีช่อง "วันกำหนด" ช่องเดียว · หนึ่งไซต์ต่อใบ = หนึ่งใบหนึ่งนัด
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "siteId" text;

COMMENT ON COLUMN public.dept_requests."siteId" IS
  'ไซต์บริการที่ใบนี้ครอบ (หัวข้อ site_survey) — 1 ใบ = 1 ไซต์ · ไม่มี FK โดยเจตนา · ว่างได้ตอนร่าง';

CREATE INDEX IF NOT EXISTS dept_requests_site_idx
  ON public.dept_requests ("siteId") WHERE "siteId" IS NOT NULL;

-- ── 4) นัดประเมินอยู่บนตารางช่างตัวเดิม ───────────────────────────────
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_kind_check;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_kind_check
  CHECK (kind IN ('install', 'refill', 'maintenance', 'repair', 'inspect', 'remove', 'survey'));

-- นัดที่เกิดจากใบประเมิน — เลื่อนนัดแล้วใบขยับตามได้เพราะรู้ว่าเป็นของใบไหน
-- ⚠️ ไม่มี FK: `dept_requests` เป็นตารางของอีกโมดูล และใบถูกลบได้ แต่ประวัตินัดต้องอยู่
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS "requestId" text;

COMMENT ON COLUMN public.service_visits."requestId" IS
  'ใบคำร้องที่ทำให้เกิดนัดนี้ (หัวข้อ site_survey) — ไม่มี FK · ลบใบแล้วประวัตินัดต้องอยู่';

CREATE INDEX IF NOT EXISTS service_visits_request_idx
  ON public.service_visits ("requestId") WHERE "requestId" IS NOT NULL;

-- ── 5) ไซต์รู้ว่าตัวเองเกิดจากใบประเมินใบไหน ──────────────────────────
-- แพตเทิร์นเดียวกับ projectId (0299) / customerAddressId (0313) — บอกที่มาอย่างเดียว
ALTER TABLE public.service_sites
  ADD COLUMN IF NOT EXISTS "surveyRequestId" text;

COMMENT ON COLUMN public.service_sites."surveyRequestId" IS
  'ใบประเมินที่คลอดไซต์นี้ — ไม่มี FK โดยเจตนา (ใบลบได้ ไซต์ต้องอยู่)';

-- ── 6) ที่อยู่ของพื้นที่ในตึก ─────────────────────────────────────────
-- 🔴 **ต้องเป็นช่องแยก ห้ามให้พิมพ์รวมในชื่อ** — ของจริงคนพิมพ์ "ล็อบบี้ชั้น G"
--    รวมกันหมด แล้วเรียงตามชั้นไม่ได้ · ช่างที่เดินไล่ชั้นต้องอ่านชื่อเดาเอง
--    และวันที่ห้างเปลี่ยนชื่อชั้น (G → M) ต้องแก้ชื่อโซนทุกแถวด้วยมือ
-- ⚠️ คงที่ข้ามการวัดทุกรอบ จึงเป็นของโซน ไม่ใช่ของใบ (ต่างจากขนาด — ดูข้อ 7)
ALTER TABLE public.service_zones
  ADD COLUMN IF NOT EXISTS building text CHECK (building IS NULL OR length(building) <= 60),
  ADD COLUMN IF NOT EXISTS floor    text CHECK (floor    IS NULL OR length(floor)    <= 30);

COMMENT ON COLUMN public.service_zones.building IS 'อาคาร — ที่อยู่ของพื้นที่ในตึก คงที่ข้ามการวัดทุกรอบ';
COMMENT ON COLUMN public.service_zones.floor    IS 'ชั้น (G · B1 · M ก็ได้ ไม่ใช่แค่ตัวเลข)';

-- ── 7) 🆕 ผลวัด: รายใบ × รายโซน ───────────────────────────────────────
--
-- 🔴 **ทำไมไม่เก็บที่ `service_zones`** (มติผู้ใช้ 2026-08-29):
--    *"ไม่ทับค่า เพราะอาจจะเป็นคนละโซนของดีลนั้น ซึ่งการเสนอราคาอาจจะรวมการ
--      ประเมินพื้นที่ 2 ครั้งก็ได้"*
--    ⇒ หนึ่งดีลมีใบประเมินได้หลายใบ · หนึ่งโซนถูกวัดได้หลายรอบ · ห้ามทับกัน
--    เก็บที่โซนเมื่อไร ใบที่สองจะลบผลของใบแรกทิ้ง แล้วใบเสนอราคาที่อ้างใบแรก
--    จะอ่านตัวเลขที่ไม่ตรงกับที่เสนอไป
--
-- ⚠️ **ขนาด "ล่าสุด" ของโซนคำนวณตอนอ่าน ห้ามเก็บเป็นคอลัมน์** — อ่านจากแถวของ
--    ใบที่ใหม่ที่สุด (กติกาเดียวกับ serviceStatus ห้ามเก็บ Expired)
CREATE TABLE IF NOT EXISTS public.service_survey_zones (
  id            text PRIMARY KEY,
  "requestId"   text NOT NULL REFERENCES public.dept_requests(id) ON DELETE CASCADE,
  -- ⚠️ NULL ได้เฉพาะตอนร่าง — โซนได้รหัส ZN ตอนกดส่งใบ ไม่ใช่ตอนพิมพ์
  --    ⇒ ร่างที่ไม่ได้ส่งไม่ทิ้งอะไรไว้ในทะเบียนโซนเลย
  --    ด่าน "ส่งแล้วต้องมี zoneId ทุกแถว" อยู่ที่ API — UNIQUE ข้างล่างไม่กันแถว NULL
  "zoneId"      text REFERENCES public.service_zones(id) ON DELETE RESTRICT,
  -- ชื่อ ณ ตอนเปิดใบ · โซนถูกเปลี่ยนชื่อทีหลัง ใบเก่ายังอ่านได้ว่าตอนนั้นเรียกอะไร
  "zoneName"    text NOT NULL CHECK (length(btrim("zoneName")) BETWEEN 1 AND 150),

  -- ⭐ หนึ่งพื้นที่วัดได้หลายส่วน — พื้นที่จริงไม่ใช่กล่องสี่เหลี่ยม (รูปตัว L)
  --    และ **แต่ละส่วนมีความสูงของตัวเอง** (โถงกลางสูง ทางเดินข้างเตี้ย)
  --    [{ id, label, widthM, lengthM, heightM }] — เมตรเท่านั้น ไม่มีดรอปดาวน์หน่วย
  parts         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- จุดที่ติดตั้งได้ (ช่างแจ้ง) + ที่เลือกติดตั้งจริง (หัวหน้าเลือก)
  --    [{ id, label, note, selected }]
  spots         jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- 🔴 คนละตัวเลขกับ service_zone_terms.packageQty (ลูกค้าซื้อจริงกี่แพ็คเกจ)
  --    ตัวนี้คือ "TS ว่าควรใช้กี่แพ็คเกจ" — ซื้อน้อยกว่าที่ประเมินเป็นเรื่องปกติ
  --    และส่วนต่างคือข้อมูลที่ฝ่ายขายต้องเห็น · ห้ามยุบรวม
  "packageQty"  integer CHECK ("packageQty" IS NULL OR "packageQty" > 0),

  -- ⚠️ 'cut' เป็นของแถวใบ ไม่ใช่ของโซน — TS ตัดพื้นที่ในใบนี้ ไม่ได้แปลว่าโซนตายถาวร
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'cut', 'added')),
  "cutReason"   text CHECK ("cutReason" IS NULL OR length("cutReason") <= 500),
  note          text CHECK (note IS NULL OR length(note) <= 1000),

  "surveyedAt"     timestamptz,
  "surveyedById"   text, "surveyedByName" text,
  "sortOrder"      integer NOT NULL DEFAULT 0,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),

  -- ตัดพื้นที่ออกต้องบอกเหตุผลเสมอ · เพิ่มไม่ต้อง
  -- (ของที่หายไปจากสิ่งที่ SA จะเสนอราคา คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน)
  CONSTRAINT service_survey_zones_cut_needs_reason CHECK (
    status <> 'cut' OR ("cutReason" IS NOT NULL AND length(btrim("cutReason")) >= 5)
  )
);

-- โซนเดิมถูกใส่ซ้ำในใบเดียวไม่ได้ — ⚠️ ไม่กันแถวที่ zoneId ยังว่าง (ร่าง) โดยเจตนา
CREATE UNIQUE INDEX IF NOT EXISTS service_survey_zones_request_zone_uk
  ON public.service_survey_zones ("requestId", "zoneId") WHERE "zoneId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_survey_zones_request_idx
  ON public.service_survey_zones ("requestId");
-- ประวัติการวัดของโซน: ครั้งที่ 1 / 2 / … เรียงตามเวลา (ไม่มีคอลัมน์ rev)
CREATE INDEX IF NOT EXISTS service_survey_zones_zone_idx
  ON public.service_survey_zones ("zoneId", "createdAt" DESC) WHERE "zoneId" IS NOT NULL;

ALTER TABLE public.service_survey_zones ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.service_survey_zones IS
  'ผลวัดพื้นที่ รายใบคำร้อง × รายโซน (mig 0314) — ประเมินซ้ำไม่ทับของเดิม · ขนาดล่าสุดของโซนอ่านจากแถวที่ใหม่ที่สุด ห้ามเก็บเป็นคอลัมน์บนโซน';

COMMIT;

NOTIFY pgrst, 'reload schema';
