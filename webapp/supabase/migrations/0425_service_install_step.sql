-- ============================================================
--  Migration 0425: ขั้นเข้าติดตั้ง — งวด "ก่อนติดตั้ง" · คำขอคิวติดตั้ง · ร่องรอยนัดติดตั้ง (PR-1)
--
--  ⭐ มติเจ้าของ (ถามทีละข้อ · แผนเต็ม ~/ss-team/mockups/service-install/PLAN.md · ม็อก canvas SyaNH4AYeBfnkP9EVFCwaz):
--     02/11  ลำดับ ประเมินพื้นที่ › QT › SO › ตั้งงานบริการ › **เข้าติดตั้ง** › (สัญญา) › รอบ Service
--            SA เลือกรายไซต์ "ติดตั้ง / Service" · แจ้งขอคิวรายไซต์ · TS แยกโซนเป็นหลายนัดได้
--     09/11  ก่อนติดตั้งมีด่านเดียว = งวดที่ติดธง "ก่อนติดตั้ง" ซึ่งบัญชีรับรองแล้ว (ใบที่ไม่มีงวดนี้ = ผ่าน)
--            · สัญญาทำ **หลังทุกไซต์ที่เลือกติดตั้งเสร็จ** (สัญญาระบุจำนวนเครื่อง + จุดที่ติด · สัญญาเป็นราย SO)
--            · นัด: SA ขอวัน › TS ยืนยันวัน (ปรับได้ + เหตุ) › SA คอนเฟิร์มลูกค้า **ทุกครั้ง** › นัดขึ้นงานช่าง
--
--  ⭐ หลักของไฟล์นี้: **เก็บเฉพาะการตัดสินใจของคน** — ขั้นของคำขอ (รอมัดจำ · รอ TS ยืนยันวัน · รอ SA คอนเฟิร์ม
--     · นัดยืนยันแล้ว · ติดตั้งแล้ว) **คำนวณสด** ที่ lib/service/installQueue.js ไม่มีคอลัมน์สถานะ (SO-centric ข้อ 7)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--   1) sales_order_installments."beforeInstall" boolean — ธงงวด "ก่อนติดตั้ง"
--      + trigger กันแก้ธงของงวดที่บัญชีรับรองแล้ว (SQLSTATE P0001 'installment_before_install_locked')
--      ⚠️ **ไม่แตะแกนเขียนแผนงวด (`_so_installments_write_plan`)** — ตัวที่รันบน production = 0377 + แพตช์แบบแทนข้อความ
--         ของ 0412 (pg_get_functiondef · lock 8 พารามิเตอร์ · W1) ⇒ ยกเนื้อจาก 0377 มา CREATE OR REPLACE = ถอยแพตช์ 0412 เงียบ ๆ
--         ผลของการไม่แตะ: จัดงวดใหม่ (replan) แถวที่คง id ไว้ = UPDATE ที่ไม่เอ่ยคอลัมน์นี้ ⇒ **ธงคงเดิม** · แถวใหม่ = false (ค่าตั้งต้น)
--         · แถวที่ถูกลบ = ธงหายไปกับแถว (ฝ่ายขายลบงวดนั้นเอง) · Rev. ย้ายงวดด้วย UPDATE "salesOrderId" (0376) ⇒ ธงติดไปเอง
--         · ถ้า PR-2 ต้องให้ธงเดินไปกับ payload ของ replan ต้องปะแบบ 0412 (anchor + ป้าย) ไม่ใช่ CREATE OR REPLACE
--   2) public.service_install_requests — ราย (ใบสั่งขาย × ไซต์) หนึ่งแถว
--        mode 'install' (ติดตั้งเครื่องใหม่) | 'none' (Service · เครื่องอยู่แล้ว — ไม่เข้าคิวติดตั้ง)
--        วันที่ลูกค้าต้องการ + ช่วงเวลา + ผู้ติดต่อ + หมายเหตุ · "requestedAt" = เวลาที่ SA ขอ **ครั้งล่าสุด**
--        (ขอใหม่หลัง TS ยืนยัน = ลูกค้าขอเปลี่ยนวัน ⇒ "changeReason" บังคับที่ API · ตัวตัดสินเทียบกับ "tsConfirmedAt")
--   3) public.service_install_request_zones — โซนที่ SA ขอ (ต้องอยู่ในรอบขายของใบนี้ที่ไซต์นี้ · API ตรวจ)
--   4) service_visits + "installRequestId" · ร่องรอย TS ยืนยันวัน ("tsConfirmed*") · "dateChangeReason"
--      · ร่องรอย SA คอนเฟิร์มลูกค้า ("customerConfirmed*")
--      CHECK: "installRequestId" มีได้เฉพาะ kind = 'install' · คอนเฟิร์มลูกค้าได้หลัง TS ยืนยันเท่านั้น
--   5) public.service_visit_zones — นัดนี้ครอบโซนไหน (นัดติดตั้งแยกโซนเป็นหลายนัดได้ · นัดตามรอบไม่ใช้ตารางนี้)
--   6) public.service_visit_planned_assets — เครื่องจากคลังที่ TS วางไว้ให้นัด (รายโซน · FK คู่ไปที่ service_visit_zones)
--      · เครื่องเดียวกันห้ามอยู่ในนัดติดตั้งที่ยังเปิดสองใบ — API ตรวจ (ต้องรู้สถานะนัด ซึ่งอยู่อีกตาราง)
--
--  ✅ รันบนฐานจริงแล้ว 09/11/2026 (flag_1 = 1 · ตารางใหม่ครบ 4 · visit_cols_8 = 8 · guard_1 = 1) — ไม่ต้องรันซ้ำ (รันซ้ำได้ ไม่มีผล)
--
--  ── ผลต่อข้อมูลเดิม ──────────────────────────────────────────────────────
--   ไม่มี — ธงงวดทุกแถวเป็น false · ตาราง/คอลัมน์ใหม่ว่าง · ไม่ backfill
--   · นัด install เดิม (ไม่มี "installRequestId") ใช้ด่านเดิมทุกข้อ ไม่ขยับ (visitGate เลือกกติกาใหม่เฉพาะนัดที่มีคำขอ)
--   · ลำดับรันกับ deploy: **รันไฟล์นี้ก่อน merge PR-1** · โค้ด PR-1 ยังไม่อ่าน/เขียนตารางใหม่ (มีแต่ตัวตัดสินล้วน)
--     ⇒ โค้ดเก่าบนฐานใหม่ไม่กระทบ
--
--  ── ทางกลับ ─────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.service_visit_planned_assets, public.service_visit_zones,
--     public.service_install_request_zones;
--   ALTER TABLE public.service_visits DROP COLUMN IF EXISTS "installRequestId", DROP COLUMN IF EXISTS "tsConfirmedAt",
--     DROP COLUMN IF EXISTS "tsConfirmedById", DROP COLUMN IF EXISTS "tsConfirmedByName", DROP COLUMN IF EXISTS "dateChangeReason",
--     DROP COLUMN IF EXISTS "customerConfirmedAt", DROP COLUMN IF EXISTS "customerConfirmedById", DROP COLUMN IF EXISTS "customerConfirmedByName";
--   DROP TABLE IF EXISTS public.service_install_requests;
--   DROP TRIGGER IF EXISTS so_installment_before_install_guard ON public.sales_order_installments;
--   DROP FUNCTION IF EXISTS public.so_installment_before_install_guard();
--   ALTER TABLE public.sales_order_installments DROP COLUMN IF EXISTS "beforeInstall";
--   ⚠️ คำขอ/นัด/ธงที่บันทึกไว้หายถาวร
--  ✅ รันซ้ำได้ (IF NOT EXISTS · CREATE OR REPLACE · DROP … IF EXISTS ก่อน ADD/CREATE)
--  ── เช็กหลังรัน (วางต่อท้ายใน SQL Editor) ───────────────────────────────────
--   select
--     (select count(*) from information_schema.columns where table_schema='public' and table_name='sales_order_installments' and column_name='beforeInstall') as flag_1,
--     to_regclass('public.service_install_requests') as req, to_regclass('public.service_install_request_zones') as req_zones,
--     to_regclass('public.service_visit_zones') as visit_zones, to_regclass('public.service_visit_planned_assets') as planned,
--     (select count(*) from information_schema.columns where table_schema='public' and table_name='service_visits'
--        and column_name in ('installRequestId','tsConfirmedAt','tsConfirmedById','tsConfirmedByName','dateChangeReason',
--                            'customerConfirmedAt','customerConfirmedById','customerConfirmedByName')) as visit_cols_8,
--     (select count(*) from pg_trigger where tgname='so_installment_before_install_guard') as guard_1;
-- ============================================================

BEGIN;

-- ── 1) ธงงวด "ก่อนติดตั้ง" ──────────────────────────────────────────────
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "beforeInstall" boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sales_order_installments."beforeInstall" IS
  'งวด "ก่อนติดตั้ง" (มติ 02/11 + 09/11/2026 · mig 0425) — ทุกงวดที่ติดธงต้องบัญชีรับรองก่อน TS ยืนยันวันติดตั้งได้ · ใบที่ไม่มีงวดติดธง = ผ่าน · แก้ธงได้จนบัญชีรับรอง';

CREATE OR REPLACE FUNCTION public.so_installment_before_install_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."beforeInstall" IS DISTINCT FROM OLD."beforeInstall" AND OLD.status = 'confirmed' THEN
    RAISE EXCEPTION 'installment_before_install_locked';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.so_installment_before_install_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS so_installment_before_install_guard ON public.sales_order_installments;
CREATE TRIGGER so_installment_before_install_guard
  BEFORE UPDATE OF "beforeInstall" ON public.sales_order_installments
  FOR EACH ROW EXECUTE FUNCTION public.so_installment_before_install_guard();


-- ── 2) คำขอติดตั้ง ราย (ใบสั่งขาย × ไซต์) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_install_requests (
  id                   text PRIMARY KEY,
  "salesOrderId"       text NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  "siteId"             text NOT NULL REFERENCES public.service_sites(id) ON DELETE RESTRICT,
  mode                 text NOT NULL CHECK (mode IN ('install', 'none')),
  "requestedDate"      date,
  "requestedStartTime" time,
  "requestedEndTime"   time,
  "contactName"        text CHECK ("contactName" IS NULL OR length(btrim("contactName")) BETWEEN 1 AND 150),
  "contactPhone"       text CHECK ("contactPhone" IS NULL OR length(btrim("contactPhone")) BETWEEN 1 AND 40),
  note                 text CHECK (note IS NULL OR length(note) <= 1000),
  "changeReason"       text CHECK ("changeReason" IS NULL OR length(btrim("changeReason")) BETWEEN 5 AND 500),
  "requestedAt"        timestamptz,
  "requestedById"      text,
  "requestedByName"    text,   -- snapshot ชื่อ ณ ตอนกด (ห้ามซิงก์ตามบัญชี)
  "decidedAt"          timestamptz NOT NULL DEFAULT now(),
  "decidedById"        text,
  "decidedByName"      text,   -- คนเลือก ติดตั้ง/Service
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_install_requests_order_site_uk UNIQUE ("salesOrderId", "siteId"),
  -- วันที่ขอกับเวลาที่ขอมาคู่กันเสมอ · Service (none) ไม่มีคำขอคิว
  CONSTRAINT service_install_requests_ask_pair CHECK (("requestedAt" IS NULL) = ("requestedDate" IS NULL)),
  CONSTRAINT service_install_requests_none_no_ask CHECK (mode <> 'none' OR "requestedAt" IS NULL),
  CONSTRAINT service_install_requests_time_order CHECK (
    "requestedStartTime" IS NULL OR "requestedEndTime" IS NULL OR "requestedStartTime" < "requestedEndTime"
  ),
  CONSTRAINT service_install_requests_dates_sane CHECK (
    "requestedDate" IS NULL OR "requestedDate" BETWEEN '2000-01-01' AND '2100-12-31'
  )
);
CREATE INDEX IF NOT EXISTS service_install_requests_site_idx ON public.service_install_requests ("siteId");
ALTER TABLE public.service_install_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_install_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.service_install_requests TO service_role;
COMMENT ON TABLE public.service_install_requests IS
  'คำขอคิวติดตั้ง ราย (ใบสั่งขาย × ไซต์) (mig 0425) — mode install|none (SA เลือก) · วันที่ลูกค้าต้องการ · ขั้นของคำขอคำนวณสดที่ lib/service/installQueue.js ห้ามเก็บ';
COMMENT ON COLUMN public.service_install_requests."requestedAt" IS
  'เวลาที่ฝ่ายขายขอคิว **ครั้งล่าสุด** — ใหม่กว่า "tsConfirmedAt" ของนัด = ลูกค้าขอเปลี่ยนวัน รอ TS ยืนยันใหม่';

-- ── 3) โซนที่ขอติดตั้ง ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_install_request_zones (
  "requestId"  text NOT NULL REFERENCES public.service_install_requests(id) ON DELETE CASCADE,
  "zoneId"     text NOT NULL REFERENCES public.service_zones(id) ON DELETE RESTRICT,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("requestId", "zoneId")
);
CREATE INDEX IF NOT EXISTS service_install_request_zones_zone_idx ON public.service_install_request_zones ("zoneId");
ALTER TABLE public.service_install_request_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_install_request_zones FROM anon, authenticated;
GRANT ALL ON TABLE public.service_install_request_zones TO service_role;

-- ── 4) นัดติดตั้ง: ต้นเรื่อง + ร่องรอยการตัดสินใจ ───────────────────────────────
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS "installRequestId" text REFERENCES public.service_install_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "tsConfirmedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "tsConfirmedById" text,
  ADD COLUMN IF NOT EXISTS "tsConfirmedByName" text,
  ADD COLUMN IF NOT EXISTS "dateChangeReason" text,
  ADD COLUMN IF NOT EXISTS "customerConfirmedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "customerConfirmedById" text,
  ADD COLUMN IF NOT EXISTS "customerConfirmedByName" text;
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_install_request_kind;
ALTER TABLE public.service_visits ADD CONSTRAINT service_visits_install_request_kind
  CHECK ("installRequestId" IS NULL OR kind = 'install');
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_customer_after_ts;
ALTER TABLE public.service_visits ADD CONSTRAINT service_visits_customer_after_ts
  CHECK ("customerConfirmedAt" IS NULL OR "tsConfirmedAt" IS NOT NULL);
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_date_change_reason_len;
ALTER TABLE public.service_visits ADD CONSTRAINT service_visits_date_change_reason_len
  CHECK ("dateChangeReason" IS NULL OR length(btrim("dateChangeReason")) BETWEEN 5 AND 500);
CREATE INDEX IF NOT EXISTS service_visits_install_request_idx
  ON public.service_visits ("installRequestId") WHERE "installRequestId" IS NOT NULL;
COMMENT ON COLUMN public.service_visits."installRequestId" IS
  'คำขอคิวติดตั้งที่ทำให้เกิดนัดนี้ (mig 0425) — มีเฉพาะ kind install · นัด install เดิมที่ไม่มีค่านี้ใช้ด่านเดิม';
COMMENT ON COLUMN public.service_visits."dateChangeReason" IS
  'เหตุที่ TS ยืนยันวันไม่ตรงกับวันที่ฝ่ายขายขอ (บังคับที่ API เมื่อวันไม่ตรง) — ฝ่ายขายเห็นตอนคอนเฟิร์มลูกค้า';
COMMENT ON COLUMN public.service_visits."customerConfirmedAt" IS
  'ฝ่ายขายคอนเฟิร์มนัดกับลูกค้าแล้ว (ทุกครั้ง · มติ 09/11) — ด่านข้อ ⑤ ของนัดติดตั้ง · ว่าง = ช่างยังไม่เห็นงาน';

-- ── 5) โซนของนัด ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_visit_zones (
  "visitId"    text NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  "zoneId"     text NOT NULL REFERENCES public.service_zones(id) ON DELETE RESTRICT,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("visitId", "zoneId")
);
CREATE INDEX IF NOT EXISTS service_visit_zones_zone_idx ON public.service_visit_zones ("zoneId");
ALTER TABLE public.service_visit_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_visit_zones FROM anon, authenticated;
GRANT ALL ON TABLE public.service_visit_zones TO service_role;
COMMENT ON TABLE public.service_visit_zones IS
  'โซนที่นัดครอบ (mig 0425) — ใช้กับนัดติดตั้งที่ TS แยกโซนเป็นหลายนัด · นัดตามรอบครอบทั้งไซต์ ไม่มีแถวที่นี่';

-- ── 6) เครื่องที่ TS วางไว้ให้นัด ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_visit_planned_assets (
  "visitId"    text NOT NULL,
  "zoneId"     text NOT NULL,
  "assetId"    text NOT NULL REFERENCES public.service_assets(id) ON DELETE RESTRICT,
  "sortOrder"  integer NOT NULL DEFAULT 0,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("visitId", "assetId"),
  CONSTRAINT service_visit_planned_assets_zone_fk FOREIGN KEY ("visitId", "zoneId")
    REFERENCES public.service_visit_zones ("visitId", "zoneId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS service_visit_planned_assets_asset_idx ON public.service_visit_planned_assets ("assetId");
ALTER TABLE public.service_visit_planned_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_visit_planned_assets FROM anon, authenticated;
GRANT ALL ON TABLE public.service_visit_planned_assets TO service_role;
COMMENT ON TABLE public.service_visit_planned_assets IS
  'เครื่องจากคลังที่ TS วางให้นัดติดตั้ง รายโซน (mig 0425) — หนึ่งเครื่อง = หนึ่งจุดบนจอช่าง · ผลจริงอยู่ที่ service_visit_assets';

COMMIT;
NOTIFY pgrst, 'reload schema';
