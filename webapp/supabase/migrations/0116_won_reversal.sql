-- 0116 - ย้อน Won ผ่านการยกเลิก SO (มติผู้ใช้ 2026-07-18).
-- inverse ของ accept_quotation_atomic (0102): เมื่อยกเลิก SO ที่อนุมัติแล้ว (เหตุฝั่ง
-- ลูกค้า) ระบบถอยดีลออกจาก Won พร้อมกันแบบ atomic — เลือกปลายทางได้ 'reopen'
-- (กลับสถานะก่อน Won) หรือ 'lost' (ลูกค้าเลิกถาวร).
--
-- ทำในทรานแซกชันเดียว: ยกเลิก SO → ใบเสนอราคาที่ accept → cancelled → ถอยดีล +
-- ล้าง metadata การ Won + บันทึกประวัติสถานะ/forecast. wonValue ไม่ตั้งเอง —
-- trigger enforce_sales_order_actual_on_deal (0110) คำนวณใหม่จาก approved SO (=0
-- เพราะ SO เพิ่งถูกยกเลิกในขั้นแรก) ให้อัตโนมัติ.

CREATE OR REPLACE FUNCTION public.cancel_sales_order_with_reversal_atomic(
  p_order_id text,
  p_reason_code text,
  p_reason_note text,
  p_actor_id text,
  p_actor_name text,
  p_reverse_to text,
  p_lost_reason text,
  p_history_id text,
  p_forecast_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_updated_deal public.sales_deals%ROWTYPE;
  v_accepted_qt_id text;
  v_prev_stage text;
  v_target_stage text;
  v_now timestamptz := now();
BEGIN
  IF p_reverse_to NOT IN ('reopen', 'lost') THEN RAISE EXCEPTION 'reversal_target_invalid'; END IF;

  -- 1) ล็อก + ยกเลิก SO (ต้องเป็น approved — ตัวที่นับ Actual)
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF v_order.status <> 'approved' THEN RAISE EXCEPTION 'sales_order_not_approved'; END IF;

  UPDATE public.sales_orders SET
    status = 'cancelled', "cancelledAt" = v_now,
    "cancelledBy" = COALESCE(p_actor_name, p_actor_id),
    "cancelReasonCode" = p_reason_code,
    "cancelReason" = NULLIF(p_reason_note, ''),
    "updatedAt" = v_now
  WHERE id = v_order.id;

  -- 2) ล็อกดีล (ต้องอยู่สถานะ Won)
  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_order."dealId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;
  IF v_deal.stage <> 'won' THEN RAISE EXCEPTION 'deal_not_won'; END IF;

  -- 3) ใบเสนอราคาที่ accept แล้ว → cancelled (ดีลไม่ได้ปิดด้วยใบนี้อีก). ใบพี่น้องที่
  -- ถูกปิด (closed) ตอน Won คงไว้เป็นประวัติ — เปิดดีลใหม่แล้วออกใบใหม่ได้.
  UPDATE public.quotations SET status = 'cancelled', "updatedAt" = v_now
  WHERE "dealId" = v_deal.id AND status = 'accepted'
  RETURNING id INTO v_accepted_qt_id;

  -- 4) สถานะก่อน Won จากประวัติ (fallback deposit_pending); จำกัดเฉพาะสถานะเปิดที่ถูกต้อง
  SELECT "fromStage" INTO v_prev_stage FROM public.sales_deal_stage_history
  WHERE "dealId" = v_deal.id AND "toStage" = 'won'
  ORDER BY "changedAt" DESC LIMIT 1;

  IF p_reverse_to = 'lost' THEN
    v_target_stage := 'lost';
  ELSE
    v_target_stage := COALESCE(NULLIF(v_prev_stage, ''), 'deposit_pending');
    IF v_target_stage NOT IN ('quotation', 'timeline_proposed', 'awaiting_confirm', 'deposit_pending') THEN
      v_target_stage := 'deposit_pending';
    END IF;
  END IF;

  -- 5) ถอยดีล — ล้าง metadata การ Won (wonValue ให้ trigger 0110 คำนวณใหม่จาก approved SO)
  UPDATE public.sales_deals d SET
    stage = v_target_stage,
    probability = CASE v_target_stage
      WHEN 'lost' THEN 0
      WHEN 'quotation' THEN 55
      WHEN 'timeline_proposed' THEN 65
      WHEN 'awaiting_confirm' THEN 75
      ELSE 90 END,
    "confirmedAt" = NULL,
    "lostReason" = CASE WHEN v_target_stage = 'lost' THEN NULLIF(p_lost_reason, '') ELSE NULL END,
    metadata = (COALESCE(d.metadata, '{}'::jsonb)
        - 'acceptedQuotationId' - 'acceptedQuoteNumber' - 'acceptedQuoteAt'
        - 'wonSource' - 'wonAt' - 'wonMonth' - 'wonValueExVat'
        - 'wonDocType' - 'wonDocDate')
      || jsonb_build_object(
        'wonReversedAt', v_now,
        'wonReversedBy', COALESCE(p_actor_name, p_actor_id),
        'wonReversedFromSO', v_order."orderNumber",
        'wonReversalReason', p_reason_code),
    "updatedAt" = v_now
  WHERE d.id = v_deal.id RETURNING d.* INTO v_updated_deal;

  -- 6) ประวัติสถานะ won → เป้าหมาย
  INSERT INTO public.sales_deal_stage_history (
    id, "dealId", "fromStage", "toStage", "changedBy", "changedByName"
  ) VALUES (
    p_history_id, v_deal.id, v_deal.stage, v_updated_deal.stage, p_actor_id, p_actor_name
  );

  -- 7) forecast บันทึกการย้อน (reopen = มูลค่าคาดการณ์ปัจจุบัน; lost = 0)
  INSERT INTO public.sales_deal_forecasts (
    id, "dealId", "forecastMonth", "forecastAmount", probability, source,
    "createdBy", "createdByName"
  ) VALUES (
    p_forecast_id, v_deal.id,
    COALESCE(v_updated_deal."forecastMonth", to_char(timezone('Asia/Bangkok', v_now), 'YYYY-MM')),
    CASE WHEN v_target_stage = 'lost' THEN 0 ELSE COALESCE(v_updated_deal."projectValue", 0) END,
    v_updated_deal.probability, 'reversal', p_actor_id, p_actor_name
  );

  RETURN jsonb_build_object(
    'order', to_jsonb((SELECT o FROM public.sales_orders o WHERE o.id = v_order.id)),
    'deal', to_jsonb(v_updated_deal),
    'cancelledQuotationId', v_accepted_qt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sales_order_with_reversal_atomic(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_sales_order_with_reversal_atomic(text, text, text, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
