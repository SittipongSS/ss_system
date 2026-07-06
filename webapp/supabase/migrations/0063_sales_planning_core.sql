-- 0063 - Sales Planning Phase 1 core.
-- Greenfield commercial spine: deals, targets, activities, stage history, and
-- forecast snapshots. PM/project linking and quotations are later phases.

CREATE TABLE IF NOT EXISTS public.sales_deals (
  id text PRIMARY KEY,
  "customerId" text REFERENCES public.customers(id) ON DELETE SET NULL,
  "customerName" text,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'lead'
    CHECK (stage IN ('lead', 'qualified', 'quotation', 'awaiting_confirm', 'deposit_pending', 'won', 'lost')),
  "projectValue" numeric NOT NULL DEFAULT 0 CHECK ("projectValue" >= 0),
  probability integer NOT NULL DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  "forecastMonth" text,
  "expectedCloseDate" date,
  "depositPaid" boolean NOT NULL DEFAULT false,
  "confirmedAt" timestamptz,
  "lostReason" text,
  notes text,
  "ownerId" text,
  "ownerName" text,
  team text,
  "projectId" text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_deals_team_stage_idx
  ON public.sales_deals (team, stage);
CREATE INDEX IF NOT EXISTS sales_deals_owner_idx
  ON public.sales_deals ("ownerId");
CREATE INDEX IF NOT EXISTS sales_deals_forecast_month_idx
  ON public.sales_deals ("forecastMonth");
CREATE INDEX IF NOT EXISTS sales_deals_customer_idx
  ON public.sales_deals ("customerId");

CREATE TABLE IF NOT EXISTS public.sales_targets (
  id text PRIMARY KEY,
  "targetMonth" text NOT NULL,
  team text,
  "ownerId" text,
  "ownerName" text,
  "targetAmount" numeric NOT NULL DEFAULT 0 CHECK ("targetAmount" >= 0),
  notes text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_targets_month_owner_unique UNIQUE ("targetMonth", team, "ownerId")
);

CREATE INDEX IF NOT EXISTS sales_targets_month_team_idx
  ON public.sales_targets ("targetMonth", team);
CREATE UNIQUE INDEX IF NOT EXISTS sales_targets_month_team_owner_uidx
  ON public.sales_targets ("targetMonth", coalesce(team, ''), coalesce("ownerId", ''));

CREATE TABLE IF NOT EXISTS public.sales_deal_activities (
  id text PRIMARY KEY,
  "dealId" text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'call', 'meeting', 'email', 'next_step')),
  body text NOT NULL,
  "dueDate" date,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_deal_activities_deal_created_idx
  ON public.sales_deal_activities ("dealId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public.sales_deal_stage_history (
  id text PRIMARY KEY,
  "dealId" text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  "fromStage" text,
  "toStage" text NOT NULL,
  "changedBy" text,
  "changedByName" text,
  "changedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_deal_stage_history_deal_idx
  ON public.sales_deal_stage_history ("dealId", "changedAt" DESC);

CREATE TABLE IF NOT EXISTS public.sales_deal_forecasts (
  id text PRIMARY KEY,
  "dealId" text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  "forecastMonth" text NOT NULL,
  "forecastAmount" numeric NOT NULL DEFAULT 0 CHECK ("forecastAmount" >= 0),
  probability integer NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  source text NOT NULL DEFAULT 'sales',
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_deal_forecasts_month_idx
  ON public.sales_deal_forecasts ("forecastMonth");
CREATE INDEX IF NOT EXISTS sales_deal_forecasts_deal_idx
  ON public.sales_deal_forecasts ("dealId", "createdAt" DESC);

ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_deal_forecasts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
