-- 0125 - Phase 5B: atomic signature evidence for controlled document approvals.
--
-- New approvals for FM-SA-01 and FM-SA-03 require the approver's active
-- signature. Evidence, signature version, controlled form version and the
-- document approval transition are committed in one transaction. Existing
-- approvals remain legacy rows and are intentionally not backfilled.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "signatureEvidenceId" text;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "signatureEvidenceId" text,
  ADD COLUMN IF NOT EXISTS "approvalFingerprint" text;

CREATE TABLE IF NOT EXISTS public.document_signature_evidence (
  id                          text PRIMARY KEY,
  "documentType"              text NOT NULL CHECK ("documentType" IN ('quotation', 'sales_order')),
  "documentId"                text NOT NULL,
  "quotationId"               text REFERENCES public.quotations(id) ON DELETE RESTRICT,
  "salesOrderId"              text REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  "documentNumber"            text NOT NULL CHECK (length(btrim("documentNumber")) BETWEEN 1 AND 100),
  "approvalSequence"          integer NOT NULL CHECK ("approvalSequence" > 0),
  "signatureVersionId"        text NOT NULL REFERENCES public.user_signature_versions(id) ON DELETE RESTRICT,
  "documentStandardVersionId" text NOT NULL REFERENCES public.document_standard_versions(id) ON DELETE RESTRICT,
  "documentFingerprint"       text NOT NULL CHECK ("documentFingerprint" ~ '^sha256:[0-9a-f]{64}$'),
  "signerId"                  text NOT NULL CHECK (length(btrim("signerId")) > 0),
  "signerName"                text,
  "signerRole"                text,
  "signerTeam"                text,
  "signatureAssetSnapshot"    jsonb NOT NULL CHECK (jsonb_typeof("signatureAssetSnapshot") = 'object'),
  "controlledFormSnapshot"    jsonb NOT NULL CHECK (jsonb_typeof("controlledFormSnapshot") = 'object'),
  "signedAt"                  timestamptz NOT NULL,
  "createdAt"                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("documentType", "documentId", "approvalSequence"),
  CHECK (
    ("documentType" = 'quotation'
      AND "quotationId" IS NOT NULL
      AND "quotationId" = "documentId"
      AND "salesOrderId" IS NULL)
    OR
    ("documentType" = 'sales_order'
      AND "salesOrderId" IS NOT NULL
      AND "salesOrderId" = "documentId"
      AND "quotationId" IS NULL)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_signature_evidence_fk'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_signature_evidence_fk
      FOREIGN KEY ("signatureEvidenceId")
      REFERENCES public.document_signature_evidence(id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_signature_evidence_fk'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_signature_evidence_fk
      FOREIGN KEY ("signatureEvidenceId")
      REFERENCES public.document_signature_evidence(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS document_signature_evidence_document_idx
  ON public.document_signature_evidence ("documentType", "documentId", "approvalSequence" DESC);
CREATE INDEX IF NOT EXISTS document_signature_evidence_signer_idx
  ON public.document_signature_evidence ("signerId", "signedAt" DESC);
CREATE INDEX IF NOT EXISTS document_signature_evidence_signature_version_idx
  ON public.document_signature_evidence ("signatureVersionId");
CREATE INDEX IF NOT EXISTS document_signature_evidence_standard_version_idx
  ON public.document_signature_evidence ("documentStandardVersionId");

CREATE OR REPLACE FUNCTION public.guard_document_signature_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'signature_evidence_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'signature_evidence_update_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS document_signature_evidence_guard ON public.document_signature_evidence;
CREATE TRIGGER document_signature_evidence_guard
BEFORE UPDATE OR DELETE ON public.document_signature_evidence
FOR EACH ROW EXECUTE FUNCTION public.guard_document_signature_evidence();

CREATE OR REPLACE FUNCTION public.clear_inactive_signature_evidence_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'quotations' AND NEW."approvalStatus" IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND NEW.status IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
    NEW."approvalFingerprint" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_clear_signature_evidence_trg ON public.quotations;
CREATE TRIGGER quotations_clear_signature_evidence_trg
BEFORE UPDATE OF "approvalStatus" ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.clear_inactive_signature_evidence_pointer();

DROP TRIGGER IF EXISTS sales_orders_clear_signature_evidence_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_clear_signature_evidence_trg
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.clear_inactive_signature_evidence_pointer();

CREATE OR REPLACE FUNCTION public.capture_document_signature_evidence(
  p_evidence_id text,
  p_document_type text,
  p_document_id text,
  p_document_number text,
  p_document_fingerprint text,
  p_document_standard_key text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_signed_at timestamptz
)
RETURNS public.document_signature_evidence
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_signature public.user_signatures%ROWTYPE;
  v_signature_version public.user_signature_versions%ROWTYPE;
  v_standard public.document_standards%ROWTYPE;
  v_standard_version public.document_standard_versions%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_sequence integer;
BEGIN
  IF NULLIF(btrim(p_evidence_id), '') IS NULL
     OR NULLIF(btrim(p_document_id), '') IS NULL
     OR NULLIF(btrim(p_document_number), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL
     OR p_signed_at IS NULL THEN
    RAISE EXCEPTION 'signature_evidence_identity_required';
  END IF;
  IF p_document_type NOT IN ('quotation', 'sales_order')
     OR p_document_standard_key NOT IN ('quotation', 'salesOrder') THEN
    RAISE EXCEPTION 'signature_evidence_document_type_invalid';
  END IF;
  IF p_document_fingerprint IS NULL OR p_document_fingerprint !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'signature_evidence_fingerprint_invalid';
  END IF;

  SELECT * INTO v_signature
  FROM public.user_signatures
  WHERE "userId" = p_actor_id
  FOR UPDATE;
  IF NOT FOUND OR v_signature."activeVersionId" IS NULL THEN
    RAISE EXCEPTION 'signature_evidence_signature_required';
  END IF;

  SELECT * INTO v_signature_version
  FROM public.user_signature_versions
  WHERE id = v_signature."activeVersionId"
    AND "signatureId" = v_signature.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_signature_missing'; END IF;

  SELECT * INTO v_standard
  FROM public.document_standards
  WHERE "documentKey" = p_document_standard_key;
  IF NOT FOUND OR v_standard."publishedVersionId" IS NULL THEN
    RAISE EXCEPTION 'signature_evidence_standard_required';
  END IF;

  SELECT * INTO v_standard_version
  FROM public.document_standard_versions
  WHERE id = v_standard."publishedVersionId"
    AND "documentKey" = p_document_standard_key
    AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_standard_missing'; END IF;

  SELECT COALESCE(max("approvalSequence"), 0) + 1 INTO v_sequence
  FROM public.document_signature_evidence
  WHERE "documentType" = p_document_type AND "documentId" = p_document_id;

  INSERT INTO public.document_signature_evidence (
    id, "documentType", "documentId", "quotationId", "salesOrderId",
    "documentNumber", "approvalSequence", "signatureVersionId", "documentStandardVersionId",
    "documentFingerprint", "signerId", "signerName", "signerRole", "signerTeam",
    "signatureAssetSnapshot", "controlledFormSnapshot", "signedAt", "createdAt"
  ) VALUES (
    p_evidence_id, p_document_type, p_document_id,
    CASE WHEN p_document_type = 'quotation' THEN p_document_id ELSE NULL END,
    CASE WHEN p_document_type = 'sales_order' THEN p_document_id ELSE NULL END,
    p_document_number, v_sequence, v_signature_version.id, v_standard_version.id,
    p_document_fingerprint, p_actor_id, p_actor_name, p_actor_role, p_actor_team,
    jsonb_build_object(
      'versionId', v_signature_version.id,
      'versionNumber', v_signature_version."versionNumber",
      'storageBucket', v_signature_version."storageBucket",
      'storagePath', v_signature_version."storagePath",
      'mimeType', v_signature_version."mimeType",
      'sizeBytes', v_signature_version."sizeBytes",
      'sha256', v_signature_version.sha256,
      'width', v_signature_version.width,
      'height', v_signature_version.height
    ),
    jsonb_build_object(
      'versionId', v_standard_version.id,
      'documentKey', v_standard_version."documentKey",
      'versionNumber', v_standard_version."versionNumber",
      'formCode', v_standard_version."formCode",
      'revision', v_standard_version.revision,
      'effectiveDate', to_char(v_standard_version."effectiveDate", 'YYYY-MM-DD'),
      'titleTh', v_standard_version."titleTh",
      'titleEn', v_standard_version."titleEn",
      'accentKey', v_standard_version."accentKey",
      'numberingPattern', v_standard_version."numberingPattern"
    ),
    p_signed_at, p_signed_at
  ) RETURNING * INTO v_evidence;

  RETURN v_evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_quotation_with_signature_evidence_atomic(
  p_quote_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_approval_notes text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_document_not_found'; END IF;
  IF v_quote."approvalStatus" <> 'pending' THEN
    RAISE EXCEPTION 'signature_evidence_approval_state_invalid';
  END IF;
  IF v_quote.status NOT IN ('draft', 'sent', 'rejected') THEN
    RAISE EXCEPTION 'signature_evidence_document_state_invalid';
  END IF;
  IF v_quote."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'signature_evidence_approval_stale';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = p_quote_id) THEN
    RAISE EXCEPTION 'signature_evidence_lines_required';
  END IF;

  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId";
  IF NOT FOUND OR v_deal.stage = 'lost' THEN
    RAISE EXCEPTION 'signature_evidence_deal_invalid';
  END IF;
  IF (p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'ae_supervisor'))
     AND v_deal."ownerId" IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'signature_evidence_forbidden';
  END IF;

  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'quotation', v_quote.id, v_quote."quoteNumber",
    p_document_fingerprint, 'quotation', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now
  );

  UPDATE public.quotations SET
    "approvalStatus" = 'approved',
    "approvalFingerprint" = p_document_fingerprint,
    "approvedAt" = v_now,
    "approvedBy" = p_actor_id,
    "approvedByName" = p_actor_name,
    "approvalNotes" = NULLIF(btrim(COALESCE(p_approval_notes, '')), ''),
    "signatureEvidenceId" = v_evidence.id,
    "updatedAt" = v_now
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  RETURN jsonb_build_object('document', to_jsonb(v_quote), 'evidence', to_jsonb(v_evidence));
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_approval_note text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_document_not_found'; END IF;
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'ae_supervisor') THEN
    RAISE EXCEPTION 'signature_evidence_forbidden';
  END IF;
  IF v_order.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'signature_evidence_approval_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'signature_evidence_approval_stale';
  END IF;
  IF v_order."createdBy" IS NOT NULL AND v_order."createdBy" = p_actor_id THEN
    RAISE EXCEPTION 'signature_evidence_separation_required';
  END IF;
  IF v_order."submittedBy" IS NOT NULL AND v_order."submittedBy" = p_actor_id THEN
    RAISE EXCEPTION 'signature_evidence_separation_required';
  END IF;
  IF v_order."orderDate" IS NULL
     OR NOT (v_order."actualAmount" > 0)
     OR v_order."projectId" IS NULL
     OR NULLIF(btrim(COALESCE(v_order."customerName", '')), '') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.quotations q
       WHERE q.id = v_order."quotationId"
         AND q."dealId" = v_order."dealId"
         AND q.status = 'accepted'
     )
     OR NOT EXISTS (SELECT 1 FROM public.sales_order_lines WHERE "salesOrderId" = p_order_id) THEN
    RAISE EXCEPTION 'signature_evidence_document_incomplete';
  END IF;

  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'sales_order', v_order.id, v_order."orderNumber",
    p_document_fingerprint, 'salesOrder', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now
  );

  UPDATE public.sales_orders SET
    status = 'approved',
    "approvalFingerprint" = p_document_fingerprint,
    "approvedAt" = v_now,
    "approvedBy" = p_actor_id,
    "approvedByName" = p_actor_name,
    "approvalNote" = NULLIF(btrim(COALESCE(p_approval_note, '')), ''),
    "signatureEvidenceId" = v_evidence.id,
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('document', to_jsonb(v_order), 'evidence', to_jsonb(v_evidence));
END;
$$;

ALTER TABLE public.document_signature_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_signature_evidence FROM anon, authenticated;
GRANT ALL ON TABLE public.document_signature_evidence TO service_role;

REVOKE ALL ON FUNCTION public.capture_document_signature_evidence(
  text, text, text, text, text, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_quotation_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.capture_document_signature_evidence(
  text, text, text, text, text, text, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_quotation_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text
) TO service_role;

-- Rollback guidance:
-- 1) Disable application callers before removing enforcement.
-- 2) Keep document_signature_evidence and every referenced signature/form version.
-- 3) Never backfill, update or delete approval evidence during rollback.

NOTIFY pgrst, 'reload schema';
