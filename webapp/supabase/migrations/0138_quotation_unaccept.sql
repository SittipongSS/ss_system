-- 0138 - ย้อนการรับใบเสนอราคา (un-accept — มติผู้ใช้ 2026-07-21).
-- inverse ของ accept_quotation_atomic (0102) สำหรับกรณี "รับใบผิด" ที่ยังไม่มี Sale Order:
-- เดิมถอย Won ได้ทางเดียวคือยกเลิก SO ที่อนุมัติแล้ว (0116) — ถ้ายังไม่มี SO คือทางตัน.
-- เครื่องมือเฉพาะกิจของหัวหน้าทีม/แอดมิน (admin / ae_supervisor — gate ที่ route)
-- + เหตุผลบังคับ 10–500 ตัวอักษร เก็บใน metadata (แนวเดียวกับ 0127).
--
-- ขอบเขต (ยึด precedent 0116):
--   * ใบ accepted → กลับ 'sent'; ฟิลด์หลักฐาน Won บนใบ (acceptedAt/acceptedBy/
--     wonDocType/wonDocDate/wonPaymentDueDate/wonAttachments) คงไว้เป็นประวัติ —
--     0116 ก็เปลี่ยนเฉพาะ status ไม่ล้างฟิลด์เหล่านี้; การ accept ครั้งถัดไปเขียนทับเอง.
--   * ใบพี่น้องที่ถูกปิด (closed) ตอน Won ไม่แตะ — เหมือน 0116 (เปิดดีลแล้วออกใบใหม่ได้).
--   * ดีลถอยกลับสถานะก่อน Won จากประวัติ (whitelist + fallback เดียวกับ 0116),
--     ล้าง metadata การ Won ชุดเดียวกัน; wonValue ไม่ตั้งเอง — trigger
--     enforce_sales_order_actual_on_deal (0110) คำนวณใหม่จาก approved SO (=0).
--   * มี SO ที่ยังไม่ยกเลิกอ้างใบนี้ → บล็อก: SO อนุมัติแล้วต้องไปทางย้อน Won ของ
--     0116 (ถอนยอด Actual พร้อมกัน), SO ร่าง/รออนุมัติ/ตีกลับต้องยกเลิก SO ก่อน.

CREATE OR REPLACE FUNCTION public.unaccept_quotation_atomic(
  p_quote_id text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_updated_quote public.quotations%ROWTYPE;
  v_updated_deal public.sales_deals%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_prev_stage text;
  v_target_stage text;
  v_now timestamptz := now();
BEGIN
  -- เหตุผลบังคับ 10–500 ตัวอักษร (validate ซ้ำชั้น DB — route ตรวจก่อนแล้วแต่กันยิงตรง)
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'unaccept_reason_invalid';
  END IF;

  -- 1) ล็อกใบ → ดีล (ลำดับเดียวกับ accept_quotation_atomic 0102 — กัน deadlock)
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_accepted'; END IF;

  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;
  IF v_deal.stage <> 'won' THEN RAISE EXCEPTION 'deal_not_won'; END IF;

  -- 2) SO ที่ยังไม่ยกเลิก = เส้นทางนี้ใช้ไม่ได้ (approved → ย้อน Won ผ่าน 0116;
  --    ร่าง/รออนุมัติ/ตีกลับ → ยกเลิก SO ก่อน)
  IF EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE "quotationId" = v_quote.id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'sales_order_exists';
  END IF;

  -- 3) ใบกลับ 'sent' — คงฟิลด์หลักฐาน Won ไว้เป็นประวัติ (precedent 0116);
  --    บันทึกผู้สั่ง/เหตุผล/เวลาไว้ใน metadata.unaccept
  UPDATE public.quotations SET
    status = 'sent',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'unaccept', jsonb_build_object(
        'reason', v_reason,
        'by', p_actor_id,
        'byName', p_actor_name,
        'byRole', p_actor_role,
        'at', v_now
      )
    ),
    "updatedAt" = v_now
  WHERE id = v_quote.id RETURNING * INTO v_updated_quote;

  -- 4) สถานะก่อน Won จากประวัติ (fallback deposit_pending); จำกัดเฉพาะสถานะเปิดที่ถูกต้อง
  SELECT "fromStage" INTO v_prev_stage FROM public.sales_deal_stage_history
  WHERE "dealId" = v_deal.id AND "toStage" = 'won'
  ORDER BY "changedAt" DESC LIMIT 1;

  v_target_stage := COALESCE(NULLIF(v_prev_stage, ''), 'deposit_pending');
  IF v_target_stage NOT IN ('quotation', 'timeline_proposed', 'awaiting_confirm', 'deposit_pending') THEN
    v_target_stage := 'deposit_pending';
  END IF;

  -- 5) ถอยดีล — ล้าง metadata การ Won ชุดเดียวกับ 0116 (wonValue ให้ trigger 0110 คำนวณใหม่)
  UPDATE public.sales_deals d SET
    stage = v_target_stage,
    probability = CASE v_target_stage
      WHEN 'quotation' THEN 55
      WHEN 'timeline_proposed' THEN 65
      WHEN 'awaiting_confirm' THEN 75
      ELSE 90 END,
    "confirmedAt" = NULL,
    metadata = (COALESCE(d.metadata, '{}'::jsonb)
        - 'acceptedQuotationId' - 'acceptedQuoteNumber' - 'acceptedQuoteAt'
        - 'wonSource' - 'wonAt' - 'wonMonth' - 'wonValueExVat'
        - 'wonDocType' - 'wonDocDate')
      || jsonb_build_object(
        'unacceptAt', v_now,
        'unacceptBy', COALESCE(p_actor_name, p_actor_id),
        'unacceptFromQuotation', v_quote."quoteNumber",
        'unacceptReason', v_reason),
    "updatedAt" = v_now
  WHERE d.id = v_deal.id RETURNING d.* INTO v_updated_deal;

  -- 6) ประวัติสถานะ won → เป้าหมาย (ลายเซ็นฟังก์ชันไม่รับ id จาก caller — สร้างเอง)
  INSERT INTO public.sales_deal_stage_history (
    id, "dealId", "fromStage", "toStage", "changedBy", "changedByName"
  ) VALUES (
    'DSH-' || replace(gen_random_uuid()::text, '-', ''),
    v_deal.id, v_deal.stage, v_updated_deal.stage, p_actor_id, p_actor_name
  );

  -- 7) forecast บันทึกการย้อน (มูลค่าคาดการณ์ปัจจุบัน — แบบเดียวกับ 0116 ปลายทาง reopen)
  INSERT INTO public.sales_deal_forecasts (
    id, "dealId", "forecastMonth", "forecastAmount", probability, source,
    "createdBy", "createdByName"
  ) VALUES (
    'DFC-' || replace(gen_random_uuid()::text, '-', ''),
    v_deal.id,
    COALESCE(v_updated_deal."forecastMonth", to_char(timezone('Asia/Bangkok', v_now), 'YYYY-MM')),
    COALESCE(v_updated_deal."projectValue", 0),
    v_updated_deal.probability, 'reversal', p_actor_id, p_actor_name
  );

  RETURN jsonb_build_object('quotation', to_jsonb(v_updated_quote), 'deal', to_jsonb(v_updated_deal));
END;
$$;

REVOKE ALL ON FUNCTION public.unaccept_quotation_atomic(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unaccept_quotation_atomic(text, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
