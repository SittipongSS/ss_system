-- 0064 - Sales Planning to PM link.
-- 0063 introduced sales_deals.projectId. This migration tightens the 1:1 link
-- after the table exists and expands deal stages for Phase 2 handoff states.

ALTER TABLE public.sales_deals
  DROP CONSTRAINT IF EXISTS sales_deals_stage_check;

ALTER TABLE public.sales_deals
  ADD CONSTRAINT sales_deals_stage_check
  CHECK (stage IN (
    'lead',
    'qualified',
    'quotation',
    'timeline_proposed',
    'awaiting_confirm',
    'deposit_pending',
    'won',
    'in_project',
    'lost'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS sales_deals_project_id_uidx
  ON public.sales_deals ("projectId")
  WHERE "projectId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_deals_project_id_fkey'
      AND conrelid = 'public.sales_deals'::regclass
  ) THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_project_id_fkey
      FOREIGN KEY ("projectId")
      REFERENCES public.projects(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_deals_project_id_idx
  ON public.sales_deals ("projectId");

NOTIFY pgrst, 'reload schema';
