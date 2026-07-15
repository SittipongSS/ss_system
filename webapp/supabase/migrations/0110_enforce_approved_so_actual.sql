-- 0110 - Enforce Approved Sale Orders as the only Actual source.
-- Clears legacy/manual wonValue caches (for example Won deals without QT/SO)
-- and keeps every future sales_deals write derived from approved SO rows.

CREATE OR REPLACE FUNCTION public.enforce_sales_order_actual_on_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
BEGIN
  SELECT COALESCE(sum(so."actualAmount"), 0),
         to_char(max(so."orderDate"), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'approved';

  NEW."wonValue" := v_actual;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'actualSource', 'sale_order',
    'wonMonth', v_won_month,
    'wonValueExVat', v_actual
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_deals_enforce_so_actual_trg ON public.sales_deals;
CREATE TRIGGER sales_deals_enforce_so_actual_trg
BEFORE INSERT OR UPDATE OF stage, "wonValue", metadata
ON public.sales_deals FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_order_actual_on_deal();

-- Recalculate every existing cache now. This intentionally changes legacy Won
-- rows with no approved SO to zero while preserving their lifecycle stage.
DO $$
DECLARE v_deal_id text;
BEGIN
  FOR v_deal_id IN SELECT id FROM public.sales_deals LOOP
    PERFORM public.sync_sales_order_actual(v_deal_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
