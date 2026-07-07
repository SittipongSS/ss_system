-- 0075 - Hierarchical sales targets.
-- A target can now be a yearly anchor ('YYYY') or a monthly figure ('YYYY-MM'),
-- at three org levels: SA-wide (team null, ownerId null) / team (team set,
-- ownerId null) / AE (team + ownerId). Legacy monthly rows keep targetMonth;
-- yearly rows leave it null.

ALTER TABLE public.sales_targets
  ADD COLUMN IF NOT EXISTS "periodType" text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS period text;

-- Backfill existing (monthly) rows: their month key is the period.
UPDATE public.sales_targets
  SET period = "targetMonth"
  WHERE period IS NULL;

-- Year-level rows have no month, so targetMonth is no longer required.
ALTER TABLE public.sales_targets ALTER COLUMN "targetMonth" DROP NOT NULL;

ALTER TABLE public.sales_targets
  DROP CONSTRAINT IF EXISTS sales_targets_month_owner_unique;

ALTER TABLE public.sales_targets
  DROP CONSTRAINT IF EXISTS sales_targets_period_type_check;
ALTER TABLE public.sales_targets
  ADD CONSTRAINT sales_targets_period_type_check
  CHECK ("periodType" IN ('year', 'month'));

-- Uniqueness is now per (period, periodType, team, owner); coalesce keeps the
-- SA-wide / team-level (null) rows distinct instead of NULL-skipping the index.
DROP INDEX IF EXISTS sales_targets_month_team_owner_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS sales_targets_period_team_owner_uidx
  ON public.sales_targets ("period", "periodType", coalesce(team, ''), coalesce("ownerId", ''));

CREATE INDEX IF NOT EXISTS sales_targets_period_idx
  ON public.sales_targets ("period", "periodType");

NOTIFY pgrst, 'reload schema';
