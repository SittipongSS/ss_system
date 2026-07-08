-- 0069 - Sales Planning governance.
-- Adds lightweight monthly forecast review and per-deal document checklist.

CREATE TABLE IF NOT EXISTS public.sales_forecast_reviews (
  id text PRIMARY KEY,
  "reviewMonth" text NOT NULL,
  team text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected')),
  "summaryAmount" numeric NOT NULL DEFAULT 0 CHECK ("summaryAmount" >= 0),
  "dealCount" integer NOT NULL DEFAULT 0 CHECK ("dealCount" >= 0),
  notes text,
  "reviewedBy" text,
  "reviewedByName" text,
  "reviewedAt" timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_forecast_reviews_month_team_unique UNIQUE ("reviewMonth", team)
);

CREATE INDEX IF NOT EXISTS sales_forecast_reviews_month_team_idx
  ON public.sales_forecast_reviews ("reviewMonth", team);
CREATE UNIQUE INDEX IF NOT EXISTS sales_forecast_reviews_month_team_uidx
  ON public.sales_forecast_reviews ("reviewMonth", coalesce(team, ''));

CREATE TABLE IF NOT EXISTS public.sales_deal_documents (
  id text PRIMARY KEY,
  "dealId" text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('customer_brief', 'quotation', 'deposit_proof', 'po', 'tax_docs', 'other')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'received', 'waived')),
  "dueDate" date,
  notes text,
  "attachmentId" text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_deal_documents_deal_status_idx
  ON public.sales_deal_documents ("dealId", status);
CREATE INDEX IF NOT EXISTS sales_deal_documents_due_idx
  ON public.sales_deal_documents ("dueDate");

ALTER TABLE public.sales_forecast_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_deal_documents ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
