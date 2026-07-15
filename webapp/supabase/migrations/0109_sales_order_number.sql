-- 0109 - Sale Order document number: SO-YYMMXXXX-R
-- Example: SO-26070001-0. The four-digit sequence resets each Bangkok month.

CREATE TABLE IF NOT EXISTS public.sales_order_number_counters (
  month text PRIMARY KEY CHECK (month ~ '^\d{4}$'),
  "lastNo" integer NOT NULL DEFAULT 0 CHECK ("lastNo" >= 0)
);
ALTER TABLE public.sales_order_number_counters ENABLE ROW LEVEL SECURITY;

-- Preserve numbers already using the target format and start above their
-- highest monthly sequence.
INSERT INTO public.sales_order_number_counters (month, "lastNo")
SELECT substring("orderNumber" from 4 for 4),
       max(substring("orderNumber" from 8 for 4)::integer)
FROM public.sales_orders
WHERE "orderNumber" ~ '^SO-\d{8}-\d+$'
GROUP BY 1
ON CONFLICT (month) DO UPDATE
SET "lastNo" = GREATEST(public.sales_order_number_counters."lastNo", EXCLUDED."lastNo");

-- Convert legacy SO-QT-* numbers deterministically. Existing target-format
-- numbers are left untouched; new numbers continue after their monthly max.
WITH legacy AS (
  SELECT so.id,
         to_char(timezone('Asia/Bangkok', so."createdAt"), 'YYMM') AS month,
         row_number() OVER (
           PARTITION BY to_char(timezone('Asia/Bangkok', so."createdAt"), 'YYMM')
           ORDER BY so."createdAt", so.id
         ) AS monthly_row
  FROM public.sales_orders so
  WHERE so."orderNumber" !~ '^SO-\d{8}-\d+$'
), numbered AS (
  SELECT legacy.id,
         'SO-' || legacy.month ||
         lpad((COALESCE(c."lastNo", 0) + legacy.monthly_row)::text, 4, '0') ||
         '-0' AS new_number
  FROM legacy
  LEFT JOIN public.sales_order_number_counters c ON c.month = legacy.month
)
UPDATE public.sales_orders so
SET "orderNumber" = numbered.new_number,
    "updatedAt" = now()
FROM numbered
WHERE so.id = numbered.id;

-- Re-seed after the legacy conversion.
INSERT INTO public.sales_order_number_counters (month, "lastNo")
SELECT substring("orderNumber" from 4 for 4),
       max(substring("orderNumber" from 8 for 4)::integer)
FROM public.sales_orders
WHERE "orderNumber" ~ '^SO-\d{8}-\d+$'
GROUP BY 1
ON CONFLICT (month) DO UPDATE
SET "lastNo" = GREATEST(public.sales_order_number_counters."lastNo", EXCLUDED."lastNo");

DROP FUNCTION IF EXISTS public.create_sales_order_draft(text, text, text, text);

CREATE FUNCTION public.create_sales_order_draft(
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
  v_month text;
  v_running_no integer;
  v_order_number text;
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

  v_month := to_char(timezone('Asia/Bangkok', now()), 'YYMM');
  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_month, 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > 9999 THEN RAISE EXCEPTION 'sales_order_monthly_sequence_exhausted'; END IF;
  v_order_number := 'SO-' || v_month || lpad(v_running_no::text, 4, '0') || '-0';

  INSERT INTO public.sales_orders (
    id, "orderNumber", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    p_order_id, v_order_number, v_quote.id, v_quote."dealId", d."projectId",
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

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
