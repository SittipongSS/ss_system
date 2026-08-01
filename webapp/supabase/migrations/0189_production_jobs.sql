-- ============================================================
--  Migration 0189: งานผลิต (P-2)
--  แผน docs/service-production-scheduling-plan.md §3.2
--
--  ⭐ ที่มา: ไลน์ผลิตมีตัวตนแล้ว (mig 0186) แต่ยังไม่มี "งาน" ให้วางลงไลน์ —
--  ขั้น "ผลิตสินค้า" บนไทม์ไลน์ยังเป็นแท่ง 3 วันที่ไม่ผูกกับอะไร และ SO ที่อนุมัติ
--  แล้วก็ไม่มีอะไรบอกว่าใครต้องผลิตอะไรก่อน
--
--  ⚠️ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน รันก่อน deploy ได้เลย
--    ต้องรัน **หลัง** 0186 (FK ชี้ไป production_lines)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.production_jobs (
  id              text PRIMARY KEY,
  code            text UNIQUE,               -- PB-YYMMXXXX (next_entity_number scope 'PB')

  -- ── ที่มาของงาน ──
  -- ⚠️ logical link ข้ามโมดูล (แพตเทิร์นเดียวกับ material_deliveries) — ไม่ใส่ FK
  --    ไป projects/deals เพราะโครงการถูกลบ/รวมได้ แล้วงานผลิตที่ทำไปแล้วต้องอยู่ต่อ
  "projectId"     text,
  "dealId"        text,
  "salesOrderId"  text REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  -- ⚠️ ไม่ unique — งานหนึ่งบรรทัด SO แตกเป็นหลายใบได้ (ผสม→บรรจุ) ตามมติ §10.1
  "salesOrderLineId" text,

  "productId"     text REFERENCES public.products(id) ON DELETE SET NULL,
  "fgCode"        text,                      -- snapshot เสมอ
  "productName"   text,                      -- snapshot เสมอ
  qty             numeric NOT NULL CHECK (qty > 0),
  unit            text CHECK (unit IS NULL OR length(unit) <= 30),
  "dueDate"       date,                      -- ต้องเสร็จก่อนวันไหน

  -- ── ชั้นแผน (มติ §10.1: งานหนึ่งใบจอง "ไลน์เดียว") ──
  -- SET NULL: ลบไลน์แล้วงานต้องอยู่ต่อในฐานะงานที่ยังไม่ได้วางไลน์
  "lineId"        text REFERENCES public.production_lines(id) ON DELETE SET NULL,
  "plannedStart"  date,
  -- ว่าง = ใช้ capacityPerDay ของไลน์ · ระบุ = งานนี้เดินช้ากว่า/เร็วกว่าปกติ
  "ratePerDay"    numeric CHECK ("ratePerDay" IS NULL OR "ratePerDay" > 0),
  -- {"2026-08-04": 0} = วันนั้นไม่เดินงานใบนี้ (ไลน์ไปทำงานอื่น)
  "dayOverrides"  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ── สถานะจริง ──
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'planned', 'in_progress', 'done', 'cancelled')),
  "actualStart"   date,
  "actualFinish"  date,
  "qtyProduced"   numeric CHECK ("qtyProduced" IS NULL OR "qtyProduced" >= 0),

  "ownerId"       text, "ownerName" text,    -- PC ผู้วางแผน
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),

  -- กันปีพิมพ์ผิดแบบที่เจอมาแล้วบน prod (`formulaDate = '2202-08-06'`)
  CONSTRAINT production_jobs_dates_sane CHECK (
    ("dueDate" IS NULL OR "dueDate" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("plannedStart" IS NULL OR "plannedStart" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("actualStart" IS NULL OR "actualStart" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("actualFinish" IS NULL OR "actualFinish" BETWEEN '2000-01-01' AND '2100-12-31')
  ),
  CONSTRAINT production_jobs_finish_after_start CHECK (
    "actualStart" IS NULL OR "actualFinish" IS NULL OR "actualFinish" >= "actualStart"
  ),
  CONSTRAINT production_jobs_day_overrides_object CHECK (
    jsonb_typeof("dayOverrides") = 'object'
  ),
  -- ⭐ วางคิวแล้วต้องรู้ว่า "ไลน์ไหน เริ่มวันไหน" — ไม่งั้นงานสถานะ planned จะลอย
  -- อยู่บนบอร์ดโดยไม่มีช่องให้วาง แล้วคนอ่านบอร์ดจะเชื่อว่ายังไม่มีคิว ทั้งที่มี
  CONSTRAINT production_jobs_planned_needs_line CHECK (
    status = 'draft' OR status = 'cancelled'
    OR ("lineId" IS NOT NULL AND "plannedStart" IS NOT NULL)
  )
);

-- คิวงานเปิดหน้าแล้วเรียงตามกำหนดส่งเสมอ — ดัชนีตามสถานะ+กำหนดส่งคือตัวหลัก
CREATE INDEX IF NOT EXISTS production_jobs_status_due_idx
  ON public.production_jobs (status, "dueDate");
-- บอร์ดอ่านเป็นช่วงวันของไลน์
CREATE INDEX IF NOT EXISTS production_jobs_line_start_idx
  ON public.production_jobs ("lineId", "plannedStart")
  WHERE "lineId" IS NOT NULL;
-- การ์ดบนหน้า SO/โครงการ
CREATE INDEX IF NOT EXISTS production_jobs_sales_order_idx
  ON public.production_jobs ("salesOrderId") WHERE "salesOrderId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_jobs_project_idx
  ON public.production_jobs ("projectId") WHERE "projectId" IS NOT NULL;

-- ⭐ กันสร้างงานร่างซ้ำจาก SO บรรทัดเดิม — auto-draft ถูกเรียกซ้ำได้ทุกครั้งที่มี
-- คนเปิดคิว/กดปุ่ม ถ้าไม่กัน คิวจะบวมด้วยงานเดียวกันสิบใบภายในสัปดาห์เดียว
-- ⚠️ partial: เฉพาะงานที่ระบบสร้างเอง (draft) — PC แตกงานเองเป็นหลายใบได้ตามมติ §10.1
CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_autodraft_uk
  ON public.production_jobs ("salesOrderLineId")
  WHERE "salesOrderLineId" IS NOT NULL AND status = 'draft';

ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.production_jobs FROM anon, authenticated;
GRANT  ALL ON TABLE public.production_jobs TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
