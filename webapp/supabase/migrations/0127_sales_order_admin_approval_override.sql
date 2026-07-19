-- 0127 - Controlled Admin break-glass for Sale Order self-approval.
--
-- Normal separation-of-duty remains the default. Only an Admin may approve an
-- SO they created/submitted, and only with a mandatory reason. The exception is
-- stored both on the active SO approval and in an immutable evidence extension.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "approvalMode" text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "approvalOverrideReason" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_orders_approval_mode_check'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_approval_mode_check CHECK (
        ("approvalMode" = 'standard' AND "approvalOverrideReason" IS NULL)
        OR
        ("approvalMode" = 'admin_override'
          AND length(btrim("approvalOverrideReason")) BETWEEN 10 AND 500)
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.document_signature_evidence_overrides (
  "evidenceId"       text PRIMARY KEY
    REFERENCES public.document_signature_evidence(id) ON DELETE RESTRICT,
  "salesOrderId"     text NOT NULL
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  "overrideType"     text NOT NULL DEFAULT 'separation_of_duty'
    CHECK ("overrideType" = 'separation_of_duty'),
  reason             text NOT NULL
    CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
  "actorId"          text NOT NULL CHECK (length(btrim("actorId")) > 0),
  "actorName"        text,
  "actorRole"        text NOT NULL CHECK ("actorRole" = 'admin'),
  "contextSnapshot"  jsonb NOT NULL
    CHECK (jsonb_typeof("contextSnapshot") = 'object'),
  "createdAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_signature_evidence_overrides_so_idx
  ON public.document_signature_evidence_overrides ("salesOrderId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION public.guard_document_signature_evidence_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'signature_evidence_override_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'signature_evidence_override_update_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS document_signature_evidence_override_guard
  ON public.document_signature_evidence_overrides;
CREATE TRIGGER document_signature_evidence_override_guard
BEFORE UPDATE OR DELETE ON public.document_signature_evidence_overrides
FOR EACH ROW EXECUTE FUNCTION public.guard_document_signature_evidence_override();

-- Reset the active override projection whenever an SO leaves approved state.
CREATE OR REPLACE FUNCTION public.clear_inactive_sales_order_signature_evidence_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
    NEW."approvalFingerprint" := NULL;
    NEW."approvalMode" := 'standard';
    NEW."approvalOverrideReason" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
);

CREATE FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_approval_note text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_separation_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_override_reason text := NULLIF(btrim(COALESCE(p_separation_override_reason, '')), '');
  v_self_approval boolean;
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

  v_self_approval :=
    (v_order."createdBy" IS NOT NULL AND v_order."createdBy" = p_actor_id)
    OR
    (v_order."submittedBy" IS NOT NULL AND v_order."submittedBy" = p_actor_id);

  IF v_self_approval AND p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'signature_evidence_separation_required';
  END IF;
  IF v_self_approval AND (
    v_override_reason IS NULL OR length(v_override_reason) NOT BETWEEN 10 AND 500
  ) THEN
    RAISE EXCEPTION 'signature_evidence_override_reason_required';
  END IF;
  IF NOT v_self_approval AND v_override_reason IS NOT NULL THEN
    RAISE EXCEPTION 'signature_evidence_override_not_applicable';
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
     OR NOT EXISTS (
       SELECT 1 FROM public.sales_order_lines WHERE "salesOrderId" = p_order_id
     ) THEN
    RAISE EXCEPTION 'signature_evidence_document_incomplete';
  END IF;

  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'sales_order', v_order.id, v_order."orderNumber",
    p_document_fingerprint, 'salesOrder', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now
  );

  IF v_self_approval THEN
    INSERT INTO public.document_signature_evidence_overrides (
      "evidenceId", "salesOrderId", reason,
      "actorId", "actorName", "actorRole", "contextSnapshot", "createdAt"
    ) VALUES (
      v_evidence.id, v_order.id, v_override_reason,
      p_actor_id, p_actor_name, p_actor_role,
      jsonb_build_object(
        'createdBy', v_order."createdBy",
        'createdByName', v_order."createdByName",
        'submittedBy', v_order."submittedBy",
        'submittedByName', v_order."submittedByName",
        'expectedUpdatedAt', p_expected_updated_at,
        'approvalMode', 'admin_override'
      ),
      v_now
    );
  END IF;

  UPDATE public.sales_orders SET
    status = 'approved',
    "approvalFingerprint" = p_document_fingerprint,
    "approvedAt" = v_now,
    "approvedBy" = p_actor_id,
    "approvedByName" = p_actor_name,
    "approvalNote" = NULLIF(btrim(COALESCE(p_approval_note, '')), ''),
    "approvalMode" = CASE WHEN v_self_approval THEN 'admin_override' ELSE 'standard' END,
    "approvalOverrideReason" = CASE WHEN v_self_approval THEN v_override_reason ELSE NULL END,
    "signatureEvidenceId" = v_evidence.id,
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'document', to_jsonb(v_order),
    'evidence', to_jsonb(v_evidence),
    'approvalMode', CASE WHEN v_self_approval THEN 'admin_override' ELSE 'standard' END
  );
END;
$$;

ALTER TABLE public.document_signature_evidence_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_signature_evidence_overrides FROM anon, authenticated;
GRANT ALL ON TABLE public.document_signature_evidence_overrides TO service_role;

REVOKE ALL ON FUNCTION public.guard_document_signature_evidence_override()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
