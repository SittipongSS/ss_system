-- 0196 - accept_quotation_atomic: เลิกบล็อกใบยอด 0 บาทตอนปิด Won
--
-- มติผู้ใช้ 2026-08-03: ใบเสนอราคายอดก่อน VAT 0 บาท "ปิด Won" ได้ — ขยายจากมติ
-- 2026-07-18 ที่เปิดให้เฉพาะการส่งลูกค้า (ดู 0137 + lib/documentWorkflow.js). ใบที่ลด
-- หรือแถมจนเหลือ 0 ก็เป็นดีลที่ปิดได้จริง ยอด Won 0 ที่เขียนลงดีลคือค่าที่ถูกต้องของใบ
-- นั้น ไม่ใช่ข้อมูลหาย — เหตุผลเดิม ("การรับใบจะไปล้างมูลค่าดีลเป็น 0") จึงตกไป.
--
-- ถอด 2 ด่านที่กันยอด 0 ออกจากนิยาม 0102 (ยังเป็นนิยามล่าสุด — ไม่มี migration หลัง
-- จากนั้นแตะฟังก์ชันนี้ 0116/0138/0168/0170 แตะแต่ฝั่ง unaccept/revert):
--   * quotation_total_zero      — ยอดรวมทั้งใบ (รวม VAT) ต้อง > 0
--   * quotation_won_value_zero  — ยอดก่อน VAT ที่จะเขียนเป็น wonValue ต้อง > 0
-- ด่านอื่นคงเดิมทุกบรรทัด: หลักฐานบังคับ · quotation_lines_required ·
-- quotation_approval_required / _stale · deal_project_required · deal_closed ·
-- deal_already_has_accepted_quotation.
--
-- ปลายทางรับยอด 0 ได้อยู่แล้ว: sales_deal_forecasts."forecastAmount" CHECK >= 0 (0063)
-- และ Actual บนแดชบอร์ดอ่าน wonValue เฉพาะเมื่อ metadata.actualSource = 'sale_order'
-- (lib/sales/dashboardMetrics.js) ใบ 0 บาทจึงไม่ทำให้ยอดรวมเพี้ยน.
--
-- คัดทั้งฟังก์ชันจาก 0102. Idempotent — รันซ้ำได้.

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
  -- (ถอด quotation_total_zero — มติ 2026-08-03: ยอด 0 ปิด Won ได้)
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

  -- ยอด Won = ยอดก่อน VAT; GREATEST กัน VAT ที่มากกว่ายอดรวม (ข้อมูลเพี้ยน) ไม่ให้ติดลบ
  -- 0 ผ่านได้ (ถอด quotation_won_value_zero — มติ 2026-08-03)
  v_won_value := GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0));

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
