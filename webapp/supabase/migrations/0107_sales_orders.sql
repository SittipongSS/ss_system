-- 0107 - Sale Order is the canonical Actual source.
-- A sales user explicitly creates and checks an SO draft from a Won quotation.
-- Actual starts only after an AE Supervisor approves the submitted SO.

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id text PRIMARY KEY,
  "orderNumber" text NOT NULL UNIQUE,
  "quotationId" text NOT NULL UNIQUE REFERENCES public.quotations(id) ON DELETE CASCADE,
  "dealId" text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  "projectId" text REFERENCES public.projects(id) ON DELETE SET NULL,
  "customerId" text REFERENCES public.customers(id) ON DELETE SET NULL,
  "customerName" text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled')),
  "orderDate" date NOT NULL,
  "paymentDueDate" date,
  subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  "discountAmount" numeric NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "vatAmount" numeric NOT NULL DEFAULT 0 CHECK ("vatAmount" >= 0),
  "totalAmount" numeric NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),
  "actualAmount" numeric NOT NULL DEFAULT 0 CHECK ("actualAmount" >= 0),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "cancelledAt" timestamptz,
  "cancelledBy" text,
  "cancelReason" text,
  "submittedAt" timestamptz,
  "submittedBy" text,
  "submittedByName" text,
  "approvedAt" timestamptz,
  "approvedBy" text,
  "approvedByName" text,
  "approvalNote" text,
  "rejectedAt" timestamptz,
  "rejectedBy" text,
  "rejectedByName" text,
  "rejectionReason" text
);

CREATE INDEX IF NOT EXISTS sales_orders_deal_idx
  ON public.sales_orders ("dealId", "orderDate" DESC);
CREATE INDEX IF NOT EXISTS sales_orders_project_idx
  ON public.sales_orders ("projectId", "orderDate" DESC);
CREATE INDEX IF NOT EXISTS sales_orders_status_idx
  ON public.sales_orders (status, "orderDate" DESC);

CREATE TABLE IF NOT EXISTS public.sales_order_lines (
  id text PRIMARY KEY,
  "salesOrderId" text NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  "quotationLineId" text REFERENCES public.quotation_lines(id) ON DELETE SET NULL,
  "productId" text REFERENCES public.products(id) ON DELETE SET NULL,
  "fgCode" text,
  description text,
  qty numeric NOT NULL CHECK (qty > 0),
  "unitPrice" numeric NOT NULL DEFAULT 0 CHECK ("unitPrice" >= 0),
  "discountType" text,
  "discountValue" numeric NOT NULL DEFAULT 0 CHECK ("discountValue" >= 0),
  "discountAmount" numeric NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  "lineTotal" numeric NOT NULL DEFAULT 0 CHECK ("lineTotal" >= 0),
  "sortOrder" integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_order_lines_order_idx
  ON public.sales_order_lines ("salesOrderId", "sortOrder");

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;

-- Keep the existing wonValue column as a compatibility cache. Every dashboard
-- already reads it, but from this migration onward its value is derived from SO.
CREATE OR REPLACE FUNCTION public.sync_sales_order_actual(p_deal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
BEGIN
  SELECT COALESCE(sum("actualAmount"), 0),
         to_char(max("orderDate"), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'approved';

  UPDATE public.sales_deals d SET
    "wonValue" = v_actual,
    metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonMonth', v_won_month,
      'wonValueExVat', v_actual
    ),
    "updatedAt" = now()
  WHERE d.id = p_deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_order_actual_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_sales_order_actual(OLD."dealId");
    RETURN OLD;
  END IF;
  PERFORM public.sync_sales_order_actual(NEW."dealId");
  IF TG_OP = 'UPDATE' AND OLD."dealId" IS DISTINCT FROM NEW."dealId" THEN
    PERFORM public.sync_sales_order_actual(OLD."dealId");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_sync_actual_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_sync_actual_trg
AFTER INSERT OR UPDATE OF status, "actualAmount", "orderDate", "dealId" OR DELETE
ON public.sales_orders FOR EACH ROW
EXECUTE FUNCTION public.sales_order_actual_trigger();

-- The existing quotation Won RPC writes wonValue for backward compatibility.
-- Once SO exists, intercept that write: a quotation-backed deal may expose
-- Actual only from approved Sale Orders (zero while no SO is approved).
CREATE OR REPLACE FUNCTION public.enforce_sales_order_actual_on_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_actual numeric;
BEGIN
  IF NEW.stage IN ('won', 'in_project') AND EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q."dealId" = NEW.id AND q.status = 'accepted'
  ) THEN
    SELECT COALESCE(sum(so."actualAmount"), 0) INTO v_actual
    FROM public.sales_orders so
    WHERE so."dealId" = NEW.id AND so.status = 'approved';
    NEW."wonValue" := v_actual;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonValueExVat', v_actual
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_deals_enforce_so_actual_trg ON public.sales_deals;
CREATE TRIGGER sales_deals_enforce_so_actual_trg
BEFORE INSERT OR UPDATE OF stage, "wonValue", metadata
ON public.sales_deals FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_order_actual_on_deal();

CREATE OR REPLACE FUNCTION public.create_sales_order_draft(
  p_quote_id text,
  p_order_id text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_won'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_orders WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'sales_order_already_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;

  INSERT INTO public.sales_orders (
    id, "orderNumber", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    p_order_id, 'SO-' || v_quote."quoteNumber", v_quote.id, v_quote."dealId", d."projectId",
    v_quote."customerId", v_quote."customerName", 'draft',
    COALESCE(v_quote."wonDocDate", v_quote."acceptedAt"::date, v_quote."quoteDate"),
    v_quote."wonPaymentDueDate", v_quote.subtotal, COALESCE(v_quote."discountAmount", 0),
    v_quote."vatAmount", v_quote."totalAmount",
    GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0)), v_quote.notes,
    jsonb_build_object('source', 'quotation', 'quoteNumber', v_quote."quoteNumber"),
    p_actor_id, p_actor_name, now(), now()
  FROM public.sales_deals d WHERE d.id = v_quote."dealId"
  RETURNING * INTO v_order;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata
  )
  SELECT
    'SOL-' || ql.id, p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_sales_order_actual(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_sales_order_actual(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text) TO service_role;

-- Existing QT Won rows become eligible for manual SO creation, but stop
-- contributing Actual until their SO is explicitly reviewed and approved.
DO $$
DECLARE v_deal_id text;
BEGIN
  FOR v_deal_id IN SELECT DISTINCT "dealId" FROM public.quotations WHERE status = 'accepted' LOOP
    PERFORM public.sync_sales_order_actual(v_deal_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
