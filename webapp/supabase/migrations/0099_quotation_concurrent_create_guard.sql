-- 0099 - Prevent two users from creating active initial quotations for one deal.
-- The API performs a friendly early check; this unique index is the final atomic
-- guard for requests that pass that check at the same time.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.quotations
    WHERE COALESCE("revisionNo", 0) = 0
      AND status IN ('draft', 'sent', 'accepted')
    GROUP BY "dealId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'duplicate active initial quotations exist; reconcile them before migration 0099';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quotations_one_active_initial_per_deal_uidx
  ON public.quotations ("dealId")
  WHERE COALESCE("revisionNo", 0) = 0
    AND status IN ('draft', 'sent', 'accepted');

NOTIFY pgrst, 'reload schema';
