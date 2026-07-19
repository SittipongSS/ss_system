-- 0124 - save_quotation_content: persist patch.metadata (ผู้รับผิดชอบเอกสาร).
--
-- Formalizes the hotfix already run manually on Supabase production on 2026-07-19
-- (referred to as "mig 0119" at the time, before 0119 was taken by
-- 0119_product_category_imports.sql). Idempotent — re-running on production
-- recreates the same function body that is already live.
--
-- Bug: the RPC's UPDATE whitelists columns and had no `metadata` line, so the
-- editor's patch.metadata (aeOwner / preparedBy / aeSupervisor) was silently
-- discarded on save. QTs created without people (e.g. Sahamit auto-QT) could
-- then never be sent. Fix = the single `metadata` CASE line below; everything
-- else is copied verbatim from 0098_document_workflow_core.sql.

-- Save quotation header + optional replacement lines in one DB transaction.
CREATE OR REPLACE FUNCTION public.save_quotation_content(
  p_quote_id text,
  p_content jsonb,
  p_lines jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_before public.quotations%ROWTYPE;
  v_after public.quotations%ROWTYPE;
  v_line_count integer;
BEGIN
  SELECT * INTO v_before FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_before.status NOT IN ('draft', 'sent', 'rejected') THEN
    RAISE EXCEPTION 'quotation_read_only';
  END IF;
  IF p_content ? 'status' AND p_content->>'status' NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'quotation_status_transition_invalid';
  END IF;

  UPDATE public.quotations q SET
    "quoteDate" = CASE WHEN p_content ? 'quoteDate' THEN (p_content->>'quoteDate')::date ELSE q."quoteDate" END,
    "validUntil" = CASE WHEN p_content ? 'validUntil' THEN NULLIF(p_content->>'validUntil', '')::date ELSE q."validUntil" END,
    "paymentTerms" = CASE WHEN p_content ? 'paymentTerms' THEN NULLIF(p_content->>'paymentTerms', '') ELSE q."paymentTerms" END,
    notes = CASE WHEN p_content ? 'notes' THEN NULLIF(p_content->>'notes', '') ELSE q.notes END,
    status = CASE WHEN p_content ? 'status' THEN p_content->>'status' ELSE q.status END,
    subtotal = CASE WHEN p_content ? 'subtotal' THEN (p_content->>'subtotal')::numeric ELSE q.subtotal END,
    "vatAmount" = CASE WHEN p_content ? 'vatAmount' THEN (p_content->>'vatAmount')::numeric ELSE q."vatAmount" END,
    "totalAmount" = CASE WHEN p_content ? 'totalAmount' THEN (p_content->>'totalAmount')::numeric ELSE q."totalAmount" END,
    "discountType" = CASE WHEN p_content ? 'discountType' THEN NULLIF(p_content->>'discountType', '') ELSE q."discountType" END,
    "discountValue" = CASE WHEN p_content ? 'discountValue' THEN (p_content->>'discountValue')::numeric ELSE q."discountValue" END,
    "discountAmount" = CASE WHEN p_content ? 'discountAmount' THEN (p_content->>'discountAmount')::numeric ELSE q."discountAmount" END,
    "vatRate" = CASE WHEN p_content ? 'vatRate' THEN (p_content->>'vatRate')::numeric ELSE q."vatRate" END,
    "paymentPlan" = CASE WHEN p_content ? 'paymentPlan' THEN p_content->'paymentPlan' ELSE q."paymentPlan" END,
    "approvalStatus" = CASE WHEN p_content ? 'approvalStatus' THEN p_content->>'approvalStatus' ELSE q."approvalStatus" END,
    "approvalReason" = CASE WHEN p_content ? 'approvalReason' THEN NULLIF(p_content->>'approvalReason', '') ELSE q."approvalReason" END,
    "approvalRequestedAt" = CASE WHEN p_content ? 'approvalRequestedAt' THEN NULLIF(p_content->>'approvalRequestedAt', '')::timestamptz ELSE q."approvalRequestedAt" END,
    "approvalRequestedBy" = CASE WHEN p_content ? 'approvalRequestedBy' THEN NULLIF(p_content->>'approvalRequestedBy', '') ELSE q."approvalRequestedBy" END,
    "approvalRequestedByName" = CASE WHEN p_content ? 'approvalRequestedByName' THEN NULLIF(p_content->>'approvalRequestedByName', '') ELSE q."approvalRequestedByName" END,
    "approvalFingerprint" = CASE WHEN p_content ? 'approvalFingerprint' THEN NULLIF(p_content->>'approvalFingerprint', '') ELSE q."approvalFingerprint" END,
    "approvedAt" = CASE WHEN p_content ? 'approvedAt' THEN NULLIF(p_content->>'approvedAt', '')::timestamptz ELSE q."approvedAt" END,
    "approvedBy" = CASE WHEN p_content ? 'approvedBy' THEN NULLIF(p_content->>'approvedBy', '') ELSE q."approvedBy" END,
    "approvedByName" = CASE WHEN p_content ? 'approvedByName' THEN NULLIF(p_content->>'approvedByName', '') ELSE q."approvedByName" END,
    metadata = CASE WHEN p_content ? 'metadata' THEN p_content->'metadata' ELSE q.metadata END,
    "updatedAt" = COALESCE(NULLIF(p_content->>'updatedAt', '')::timestamptz, now())
  WHERE q.id = p_quote_id
  RETURNING q.* INTO v_after;

  IF p_lines IS NOT NULL THEN
    DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;
    INSERT INTO public.quotation_lines (
      id, "quotationId", "productId", "fgCode", description, qty, "unitPrice",
      "discountType", "discountValue", "discountAmount", "lineTotal", source,
      "sortOrder", metadata
    )
    SELECT
      x.id, p_quote_id, x."productId", x."fgCode", x.description, x.qty,
      x."unitPrice", x."discountType", x."discountValue", x."discountAmount",
      x."lineTotal", COALESCE(x.source, 'manual'), COALESCE(x."sortOrder", 0),
      COALESCE(x.metadata, '{}'::jsonb)
    FROM jsonb_to_recordset(p_lines) AS x(
      id text, "productId" text, "fgCode" text, description text, qty numeric,
      "unitPrice" numeric, "discountType" text, "discountValue" numeric,
      "discountAmount" numeric, "lineTotal" numeric, source text,
      "sortOrder" integer, metadata jsonb
    );
  END IF;

  IF v_after.status = 'sent' THEN
    SELECT count(*) INTO v_line_count FROM public.quotation_lines
    WHERE "quotationId" = p_quote_id;
    IF v_line_count = 0 THEN RAISE EXCEPTION 'quotation_lines_required'; END IF;
    IF NOT (v_after."totalAmount" > 0) THEN RAISE EXCEPTION 'quotation_total_zero'; END IF;
    IF v_after."approvalStatus" NOT IN ('not_required', 'approved') THEN
      RAISE EXCEPTION 'quotation_approval_required';
    END IF;
    IF v_after."approvalStatus" = 'approved' AND v_after."approvalFingerprint" IS NULL THEN
      RAISE EXCEPTION 'quotation_approval_stale';
    END IF;
  END IF;

  RETURN to_jsonb(v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
