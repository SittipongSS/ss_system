-- 0088 - Deal type + formula name (Sales Revamp เฟส A).
-- ยกประเภทดีลจาก metadata.projectType (jsonb) เป็นคอลัมน์จริง 3 ค่า และเปิด SCENT
-- เป็น type โครงการ (template แยกใน lib/pm/templates.js). formulaName = ชื่อสูตรกลิ่น
-- (จุดปลั๊กอิน RD ในอนาคต — ตอนนี้เก็บเป็น text).
-- ดูแผน: webapp/SALES_REVAMP_PLAN.md §2.2 + DEAL_PROJECT_RESTRUCTURE_PLAN.md §3.

ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "dealType" text NOT NULL DEFAULT 'NPD',
  ADD COLUMN IF NOT EXISTS "formulaName" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_deals_deal_type_check'
      AND conrelid = 'public.sales_deals'::regclass
  ) THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_deal_type_check
      CHECK ("dealType" IN ('SCENT', 'NPD', 'RE-ORDER'));
  END IF;
END $$;

-- backfill จาก metadata.projectType (มีแค่ NPD/RE-ORDER — ดีลเก่าไม่มี SCENT)
UPDATE public.sales_deals
  SET "dealType" = CASE WHEN metadata->>'projectType' = 'RE-ORDER' THEN 'RE-ORDER' ELSE 'NPD' END
  WHERE metadata ? 'projectType';

CREATE INDEX IF NOT EXISTS sales_deals_type_idx
  ON public.sales_deals ("dealType");

-- โครงการ: เปิดรับ type SCENT (ดีล SCENT ก่อตั้งโครงการด้วย template ตัวเอง) + ชื่อสูตร
-- (โครงการกลิ่นเดิมอ้างสูตรโดยไม่มีดีล SCENT)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS "formulaName" text;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_type_check CHECK ("type" IN ('SCENT', 'NPD', 'RE-ORDER'));

NOTIFY pgrst, 'reload schema';
