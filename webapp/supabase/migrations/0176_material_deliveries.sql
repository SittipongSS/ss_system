-- ============================================================
--  Migration 0176: รายการของเข้า PM/RM ระดับโครงการ (material_deliveries)
--  แผน docs/cross-department-requests-plan.md ชั้น C (PR-4)
--
--  ⚠ เลข 0172 ที่เขียนไว้ในแผนตอนแรกถูกใช้ไปแล้ว (deal_feed_to_entity_updates)
--    และ 0175 เป็น deal_forecast_levels → ใบนี้เป็น 0176
--
--  ของเดิม: การติดตามของเข้ามีเฉพาะสายสหมิตร (sahamit_material_tracking —
--  pmDueDate/rmDueDate/arrivedAt ราย PO line) · งานทั่วไปมีแค่ task เดียวใน
--  ไทม์ไลน์ "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" (45 วัน) ที่ไม่มี
--  อะไรอยู่ข้างใน → SA ถาม PC ทีไรก็ต้องไล่ถามเป็นรายตัวนอกระบบ
--  (คำขอตั้งต้นของผู้ใช้: "ขอเช็คสถานะติดตามการเข้าของ PM และ RM เพื่อติดตาม
--   กำหนดการผลิต")
--
--  ⚠ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน **รันก่อน deploy ได้เลย**
--    (ไม่เหมือน 0173 ที่ rename ตารางที่โค้ดใช้อยู่)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.material_deliveries (
  id              text PRIMARY KEY,
  -- logical link ข้ามโมดูล (แพตเทิร์นเดียวกับ costing_requests 0141) — ไม่ใส่ FK
  -- ไปที่ projects เพราะการลบโครงการมี deleteProjectDeep กวาดเองอยู่แล้ว
  "projectId"     text NOT NULL,
  "dealId"        text,
  -- ผูกวัสดุในทะเบียนถ้ามี (ปิดบั๊กตระกูล "จับคู่ด้วยข้อความ") · label เป็น snapshot เสมอ
  "materialId"    text REFERENCES public.material_prices(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  qty             numeric CHECK (qty IS NULL OR qty > 0),
  unit            text CHECK (unit IS NULL OR length(unit) <= 30),
  "poRef"         text CHECK ("poRef" IS NULL OR length("poRef") <= 100),  -- เลข PR/PO ภายนอก (Express)
  "dueDate"       date,                             -- กำหนดถึง
  "arrivedAt"     date,                             -- มาแล้ว (null = ยังไม่มา)
  "ownerId"       text, "ownerName" text,           -- PC ผู้รับผิดชอบ
  -- มติ 13: แถวส่วนใหญ่ "กาง" มาจากบรรทัดของใบขอราคาผลิตที่อนุมัติแล้ว
  -- SET NULL: ลบใบ CR แล้วรายการของเข้าต้องอยู่ต่อ (ของสั่งไปแล้วจริง)
  "costingRequestId" text REFERENCES public.costing_requests(id) ON DELETE SET NULL,
  "componentId"      text,                          -- บรรทัดต้นทางในใบ (logical link)
  source          text NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'costing')),
  -- คำร้องติดตามที่ทำให้แถวนี้ถูกอัปเดตล่าสุด (logical link ไม่ใส่ FK — คำร้องถูกลบได้
  -- แต่ข้อมูลของเข้าต้องอยู่ต่อ)
  "requestId"     text,
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  -- กันปีพิมพ์ผิดแบบที่เจอมาแล้วบน prod (`formulaDate = '2202-08-06'`)
  CONSTRAINT material_deliveries_dates_sane CHECK (
    ("dueDate"   IS NULL OR "dueDate"   BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("arrivedAt" IS NULL OR "arrivedAt" BETWEEN '2000-01-01' AND '2100-12-31')
  )
);

CREATE INDEX IF NOT EXISTS material_deliveries_project_idx
  ON public.material_deliveries ("projectId", "dueDate");
-- คิว "ยังไม่มา" ของโครงการ = คำถามที่ถามบ่อยที่สุด
CREATE INDEX IF NOT EXISTS material_deliveries_open_idx
  ON public.material_deliveries ("projectId") WHERE "arrivedAt" IS NULL;
CREATE INDEX IF NOT EXISTS material_deliveries_deal_idx
  ON public.material_deliveries ("dealId") WHERE "dealId" IS NOT NULL;

-- ⚠ กดปุ่ม "กางจากใบขอราคาผลิต" ซ้ำต้องไม่ได้แถวซ้ำ (idempotent ที่ระดับ DB
--   ไม่ใช่พึ่งว่า client จะไม่กดสองครั้ง) — partial เพราะแถวที่พิมพ์เองไม่มี componentId
CREATE UNIQUE INDEX IF NOT EXISTS material_deliveries_component_uk
  ON public.material_deliveries ("projectId", "componentId")
  WHERE "componentId" IS NOT NULL;

ALTER TABLE public.material_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_deliveries FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_deliveries TO service_role;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
