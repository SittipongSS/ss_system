-- 0087 - Sales history (year-level actuals vs targets) for the target-planning wizard.
-- Records what was targeted and what was actually sold in past years, at three org
-- levels: company-wide (team null, ownerId null) / team (team set, ownerId null) /
-- AE (team + ownerId). This is the historical *result* baseline the planning wizard
-- reads to project next year's target and to derive team/person/month split ratios.
-- Kept separate from sales_targets (which stores forward-looking *plans*).

CREATE TABLE IF NOT EXISTS public.sales_history (
  id text PRIMARY KEY,
  period text NOT NULL,                    -- 'YYYY' (year) — monthly kept for future seasonal capture
  "periodType" text NOT NULL DEFAULT 'year'
    CHECK ("periodType" IN ('year', 'month')),
  team text,
  "ownerId" text,
  "ownerName" text,
  "targetAmount" numeric NOT NULL DEFAULT 0 CHECK ("targetAmount" >= 0),
  "actualAmount" numeric NOT NULL DEFAULT 0 CHECK ("actualAmount" >= 0),
  source text NOT NULL DEFAULT 'manual'    -- manual | system | mixed (auto-filled from deals vs typed)
    CHECK (source IN ('manual', 'system', 'mixed')),
  notes text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- One row per (period, team, owner). coalesce keeps company-wide / team-level
-- (null) rows distinct instead of NULL-skipping the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS sales_history_period_team_owner_uidx
  ON public.sales_history ("period", "periodType", coalesce(team, ''), coalesce("ownerId", ''));

CREATE INDEX IF NOT EXISTS sales_history_period_idx
  ON public.sales_history ("period", "periodType");

ALTER TABLE public.sales_history ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
