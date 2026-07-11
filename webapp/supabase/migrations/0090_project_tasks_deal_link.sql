-- 0090 - timeline segment ต่อดีล (Sales Revamp เฟส B).
-- ทุก task ติดป้ายดีลเจ้าของ → 1 ดีล = 1 segment ของไทม์ไลน์ (anchor/regen แยกต่อ
-- segment, Gantt โครงการรวมเป็น swimlane). จำเป็นเชิงเทคนิค: regen จับคู่ task
-- ด้วยชื่อ — หลายดีลประเภทเดียวกันในโครงการจะชื่อชนกัน ต้อง scope ต่อ dealId.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS "dealId" text REFERENCES public.sales_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_tasks_deal_idx
  ON public.project_tasks ("dealId");

-- backfill: ยุค 1:1 โครงการมีดีลเดียว → task ทั้งชุดเป็นของดีลนั้น
-- (task ของโครงการที่ไม่มีดีลผูก คง NULL = segment "ทั่วไป" ของโครงการ)
UPDATE public.project_tasks pt
  SET "dealId" = sd.id
  FROM public.sales_deals sd
  WHERE sd."projectId" = pt."projectId" AND pt."dealId" IS NULL;

NOTIFY pgrst, 'reload schema';
