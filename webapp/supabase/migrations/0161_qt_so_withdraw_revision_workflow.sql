-- 0161 - QT/SO withdrawal and immutable SO revision workflow.
--
-- Business rules (2026-07-26):
--   * pending submission: the actual proposer or an approver may withdraw;
--   * submitted/approved content is never edited directly;
--   * approved SO changes are an AE Supervisor/Admin-only atomic revision;
--   * signature evidence and issued artifacts remain immutable history.

-- ── 1) SO revision identity ─────────────────────────────────────────────────

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "baseNumber" text,
  ADD COLUMN IF NOT EXISTS "revisionNo" integer NOT NULL DEFAULT 0 CHECK ("revisionNo" >= 0),
  ADD COLUMN IF NOT EXISTS "revisionSeparator" text NOT NULL DEFAULT '-'
    CHECK ("revisionSeparator" ~ '^[-._/]*$'),
  ADD COLUMN IF NOT EXISTS "revisedFromId" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "supersededById" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "revisionReason" text
    CHECK ("revisionReason" IS NULL OR length(btrim("revisionReason")) BETWEEN 10 AND 500),
  ADD COLUMN IF NOT EXISTS "revisedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "revisedBy" text,
  ADD COLUMN IF NOT EXISTS "revisedByName" text;

-- Existing standards normally end in {REVISION}, producing e.g. SO-26070001-0.
-- Preserve that separator when possible. Legacy numbers without a revision
-- suffix become their own base and continue as <old-number>-1.
UPDATE public.sales_orders
SET
  "baseNumber" = CASE
    WHEN "orderNumber" ~ '[-._/]0$' THEN regexp_replace("orderNumber", '[-._/]0$', '')
    ELSE "orderNumber"
  END,
  "revisionSeparator" = CASE
    WHEN "orderNumber" ~ '[-._/]0$' THEN substring("orderNumber" from '([-._/])0$')
    ELSE '-'
  END
WHERE "baseNumber" IS NULL;

ALTER TABLE public.sales_orders
  ALTER COLUMN "baseNumber" SET NOT NULL;

-- A revision intentionally points to the same accepted QT, so the old
-- one-SO-per-QT UNIQUE constraint must become an ordinary lookup index. The
-- create_sales_order_draft RPC still prevents a second independent base SO.
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS "sales_orders_quotationId_key";
CREATE INDEX IF NOT EXISTS sales_orders_quotation_idx
  ON public.sales_orders ("quotationId");

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'revised'));

CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_base_revision_unique_idx
  ON public.sales_orders ("baseNumber", "revisionNo");
CREATE INDEX IF NOT EXISTS sales_orders_revision_chain_idx
  ON public.sales_orders ("revisedFromId", "supersededById");

-- Fill revision identity for every future base SO without duplicating the
-- numbering logic in each create RPC revision.
CREATE OR REPLACE FUNCTION public.normalize_sales_order_revision_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(NEW."baseNumber"), '') IS NULL THEN
    IF NEW."orderNumber" ~ '[-._/]0$' THEN
      NEW."baseNumber" := regexp_replace(NEW."orderNumber", '[-._/]0$', '');
      NEW."revisionSeparator" := substring(NEW."orderNumber" from '([-._/])0$');
    ELSE
      NEW."baseNumber" := NEW."orderNumber";
      NEW."revisionSeparator" := '-';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_revision_identity_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_revision_identity_trg
BEFORE INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.normalize_sales_order_revision_identity();

-- ── 2) Withdraw a pending QT submission ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.withdraw_quotation_submission_atomic(
  p_quote_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_actor_required';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quote_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;

  IF v_quote.status NOT IN ('draft', 'sent', 'rejected')
     OR v_quote."approvalStatus" <> 'pending' THEN
    RAISE EXCEPTION 'quotation_withdraw_state_invalid';
  END IF;
  IF v_quote."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId";
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_deal_not_found'; END IF;

  -- proposer OR current QT approver (deal owner / sales head / admin)
  IF v_quote."approvalRequestedBy" IS DISTINCT FROM p_actor_id
     AND v_deal."ownerId" IS DISTINCT FROM p_actor_id
     AND COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'quotation_withdraw_forbidden';
  END IF;

  UPDATE public.quotations
  SET
    "approvalStatus" = 'not_submitted',
    "approvalRequestedAt" = NULL,
    "approvalRequestedBy" = NULL,
    "approvalRequestedByName" = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'lastSubmissionWithdrawal',
      jsonb_build_object(
        'reason', v_reason,
        'actorId', p_actor_id,
        'actorName', NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
        'actorRole', NULLIF(btrim(COALESCE(p_actor_role, '')), ''),
        'withdrawnAt', v_now
      )
    ),
    "updatedAt" = v_now
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  -- The approval-status trigger clears the active proposer pointer. The
  -- immutable document_signature_evidence row intentionally remains.
  RETURN to_jsonb(v_quote);
END;
$$;

-- ── 3) Withdraw a pending SO submission ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.withdraw_sales_order_submission_atomic(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_actor_required';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  IF v_order.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'sales_order_withdraw_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  -- proposer OR SO reviewer
  IF v_order."submittedBy" IS DISTINCT FROM p_actor_id
     AND COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'sales_order_withdraw_forbidden';
  END IF;

  UPDATE public.sales_orders
  SET
    status = 'draft',
    "submittedAt" = NULL,
    "submittedBy" = NULL,
    "submittedByName" = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'lastSubmissionWithdrawal',
      jsonb_build_object(
        'reason', v_reason,
        'actorId', p_actor_id,
        'actorName', NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
        'actorRole', NULLIF(btrim(COALESCE(p_actor_role, '')), ''),
        'withdrawnAt', v_now
      )
    ),
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- The status trigger clears active signature pointers; evidence history stays.
  RETURN to_jsonb(v_order);
END;
$$;

-- ── 4) Revoke approved SO by atomically creating a revision ─────────────────

CREATE OR REPLACE FUNCTION public.revise_approved_sales_order_atomic(
  p_order_id text,
  p_revision_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source public.sales_orders%ROWTYPE;
  v_revision public.sales_orders%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_next_revision integer;
  v_order_number text;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_revision_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'sales_order_revision_forbidden';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT * INTO v_source
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  IF v_source.status <> 'approved' THEN
    RAISE EXCEPTION 'sales_order_revision_state_invalid';
  END IF;
  IF v_source."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  IF v_source."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'sales_order_revision_exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE "salesOrderId" = v_source.id
  ) THEN
    RAISE EXCEPTION 'sales_order_revision_filing_exists';
  END IF;

  SELECT COALESCE(max("revisionNo"), 0) + 1
    INTO v_next_revision
  FROM public.sales_orders
  WHERE "baseNumber" = v_source."baseNumber";

  v_order_number := v_source."baseNumber"
    || COALESCE(v_source."revisionSeparator", '-')
    || v_next_revision::text;

  INSERT INTO public.sales_orders (
    id, "orderNumber", "baseNumber", "revisionNo", "revisionSeparator",
    "revisedFromId", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt",
    "approvalMode"
  ) VALUES (
    p_revision_id, v_order_number, v_source."baseNumber", v_next_revision,
    v_source."revisionSeparator", v_source.id, v_source."quotationId",
    v_source."dealId", v_source."projectId", v_source."customerId",
    v_source."customerName", 'draft',
    timezone('Asia/Bangkok', v_now)::date, v_source."paymentDueDate",
    v_source.subtotal, v_source."discountAmount", v_source."vatAmount",
    v_source."totalAmount", v_source."actualAmount", v_source.notes,
    COALESCE(v_source.metadata, '{}'::jsonb) || jsonb_build_object(
      'revisedFrom', v_source."orderNumber",
      'revisionReason', v_reason
    ),
    p_actor_id, NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_now, v_now,
    'standard'
  )
  RETURNING * INTO v_revision;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", unit, "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata, "createdAt"
  )
  SELECT
    'SOL-' || md5(p_revision_id || ':' || line.id),
    v_revision.id, line."quotationLineId", line."productId", line."fgCode",
    line.description, line.qty, line."unitPrice", line.unit,
    line."discountType", line."discountValue", line."discountAmount",
    line."lineTotal", line."sortOrder", line.metadata, v_now
  FROM public.sales_order_lines line
  WHERE line."salesOrderId" = v_source.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sales_order_revision_lines_required';
  END IF;

  UPDATE public.sales_orders
  SET
    status = 'revised',
    "supersededById" = v_revision.id,
    "revisionReason" = v_reason,
    "revisedAt" = v_now,
    "revisedBy" = p_actor_id,
    "revisedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    "updatedAt" = v_now
  WHERE id = v_source.id
  RETURNING * INTO v_source;

  -- status='revised' removes the source from sync_sales_order_actual. The new
  -- draft contributes zero until it is submitted and approved again.
  RETURN jsonb_build_object(
    'source', to_jsonb(v_source),
    'revision', to_jsonb(v_revision)
  );
END;
$$;

-- Only server routes using the service-role client may call workflow RPCs.
REVOKE ALL ON FUNCTION public.withdraw_quotation_submission_atomic(
  text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdraw_sales_order_submission_atomic(
  text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revise_approved_sales_order_atomic(
  text, text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.withdraw_quotation_submission_atomic(
  text, timestamptz, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_sales_order_submission_atomic(
  text, timestamptz, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_approved_sales_order_atomic(
  text, text, timestamptz, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
