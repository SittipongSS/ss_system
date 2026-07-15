-- 0102 - หลักฐานการปิด Won บนใบเสนอราคา + ปิดใบอื่นในดีล (feedback ผู้ใช้ 2026-07-15)
-- 1) การรับใบ (accept) ต้องมีหลักฐานสั่งซื้อ: ไฟล์แนบ ≥1 + ประเภทเอกสาร + วันที่เอกสาร
--    และถ้าไม่ใช่เอกสารการชำระ (สลิป) ต้องระบุกำหนดชำระ — บังคับที่ RPC ตัวเดียวกับการปิดดีล
-- 2) ใบอื่นในดีลที่ยังไม่จบ (draft/sent/rejected) → status 'closed' (ล็อกแก้/ลบ/Revise)
-- 3) เดือนที่นับยอด AT (wonMonth) = เดือนของวันที่เอกสาร ไม่ใช่เดือนที่กดปุ่ม

-- ── สถานะใหม่ 'closed' ──
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_check
  CHECK (status IN ('draft','sent','accepted','rejected','cancelled','revised','closed'));

-- ── คอลัมน์หลักฐาน (เก็บบนใบที่ accept — ไฟล์จริงอยู่ Drive/Supabase, แถวนี้เก็บ ref) ──
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "wonDocType" text
    CHECK ("wonDocType" IS NULL OR "wonDocType" IN ('payment_slip','po','order_confirmation')),
  ADD COLUMN IF NOT EXISTS "wonDocDate" date,
  ADD COLUMN IF NOT EXISTS "wonPaymentDueDate" date,
  ADD COLUMN IF NOT EXISTS "wonAttachments" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── แทนที่ RPC เดิม (0101) — ลายเซ็นใหม่รับ p_evidence ──
DROP FUNCTION IF EXISTS public.accept_quotation_atomic(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.accept_quotation_atomic(
  p_quote_id text,
  p_current_fingerprint text,
  p_actor_id text,
  p_actor_name text,
  p_history_id text,
  p_forecast_id text,
  p_evidence jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_accepted public.quotations%ROWTYPE;
  v_updated_deal public.sales_deals%ROWTYPE;
  v_won_value numeric;
  v_now timestamptz := now();
  v_doc_type text := p_evidence->>'docType';
  v_doc_date date := NULLIF(p_evidence->>'docDate', '')::date;
  v_due_date date := NULLIF(p_evidence->>'paymentDueDate', '')::date;
  v_files jsonb := COALESCE(p_evidence->'attachments', '[]'::jsonb);
  v_won_month text;
BEGIN
  -- หลักฐานบังคับ (validate ซ้ำชั้น DB — route ตรวจก่อนแล้วแต่กันยิงตรง)
  IF v_doc_type IS NULL OR v_doc_type NOT IN ('payment_slip','po','order_confirmation') THEN
    RAISE EXCEPTION 'quotation_evidence_type_invalid';
  END IF;
  IF v_doc_date IS NULL THEN RAISE EXCEPTION 'quotation_evidence_date_required'; END IF;
  IF jsonb_typeof(v_files) <> 'array' OR jsonb_array_length(v_files) < 1 THEN
    RAISE EXCEPTION 'quotation_evidence_file_required';
  END IF;
  -- เอกสารที่ไม่ใช่การชำระเงิน (PO/ยืนยันสั่งซื้อ) ต้องมีกำหนดชำระ
  IF v_doc_type <> 'payment_slip' AND v_due_date IS NULL THEN
    RAISE EXCEPTION 'quotation_payment_due_required';
  END IF;

  v_won_month := to_char(v_doc_date, 'YYYY-MM');

  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status IN ('accepted', 'cancelled', 'rejected', 'revised', 'closed') THEN
    RAISE EXCEPTION 'quotation_not_acceptable';
  END IF;
  IF NOT (v_quote."totalAmount" > 0) THEN RAISE EXCEPTION 'quotation_total_zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;
  IF v_quote."approvalStatus" NOT IN ('not_required', 'approved') THEN
    RAISE EXCEPTION 'quotation_approval_required';
  END IF;
  IF v_quote."approvalStatus" = 'approved' AND
     (v_quote."approvalFingerprint" IS NULL OR v_quote."approvalFingerprint" <> p_current_fingerprint) THEN
    RAISE EXCEPTION 'quotation_approval_stale';
  END IF;

  SELECT * INTO v_deal FROM public.sales_deals
  WHERE id = v_quote."dealId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;
  IF v_deal."projectId" IS NULL THEN RAISE EXCEPTION 'deal_project_required'; END IF;
  IF v_deal.stage IN ('lost', 'won', 'in_project') THEN RAISE EXCEPTION 'deal_closed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotations
    WHERE "dealId" = v_deal.id AND status = 'accepted' AND id <> v_quote.id
  ) THEN RAISE EXCEPTION 'deal_already_has_accepted_quotation'; END IF;

  v_won_value := GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0));
  IF NOT (v_won_value > 0) THEN RAISE EXCEPTION 'quotation_won_value_zero'; END IF;

  UPDATE public.quotations SET
    status = 'accepted', "acceptedAt" = v_now,
    "acceptedBy" = COALESCE(p_actor_name, p_actor_id),
    "wonDocType" = v_doc_type,
    "wonDocDate" = v_doc_date,
    "wonPaymentDueDate" = v_due_date,
    "wonAttachments" = v_files,
    "updatedAt" = v_now
  WHERE id = v_quote.id RETURNING * INTO v_accepted;

  -- ใบอื่นในดีลที่ยังเปิดอยู่ → ปิด (ล็อกแก้/ลบ/Revise — ดีลจบด้วยใบที่ accept แล้ว)
  -- revised/cancelled เป็น read-only อยู่แล้ว คงสถานะเดิมไว้เป็นประวัติ
  UPDATE public.quotations SET status = 'closed', "updatedAt" = v_now
  WHERE "dealId" = v_deal.id AND id <> v_quote.id
    AND status IN ('draft', 'sent', 'rejected');

  UPDATE public.sales_deals d SET
    stage = 'won',
    "wonValue" = v_won_value,
    probability = 100,
    "confirmedAt" = v_now,
    metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'acceptedQuotationId', v_quote.id,
      'acceptedQuoteNumber', v_quote."quoteNumber",
      'acceptedQuoteAt', v_now,
      'wonSource', 'quotation',
      'wonAt', v_now,
      'wonMonth', v_won_month,
      'wonValueExVat', v_won_value,
      'wonDocType', v_doc_type,
      'wonDocDate', to_char(v_doc_date, 'YYYY-MM-DD')
    ),
    "updatedAt" = v_now
  WHERE d.id = v_deal.id RETURNING d.* INTO v_updated_deal;

  IF v_deal.stage IS DISTINCT FROM v_updated_deal.stage THEN
    INSERT INTO public.sales_deal_stage_history (
      id, "dealId", "fromStage", "toStage", "changedBy", "changedByName"
    ) VALUES (
      p_history_id, v_deal.id, v_deal.stage, v_updated_deal.stage, p_actor_id, p_actor_name
    );
  END IF;

  INSERT INTO public.sales_deal_forecasts (
    id, "dealId", "forecastMonth", "forecastAmount", probability, source,
    "createdBy", "createdByName"
  ) VALUES (
    p_forecast_id, v_deal.id, v_won_month, v_won_value, 100, 'quotation',
    p_actor_id, p_actor_name
  );

  RETURN jsonb_build_object('quotation', to_jsonb(v_accepted), 'deal', to_jsonb(v_updated_deal));
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quotation_atomic(text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_quotation_atomic(text, text, text, text, text, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
