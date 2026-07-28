-- 0170 - สลับลำดับขั้นดีล: เสนอไทม์ไลน์ (55%) มาก่อน เสนอราคา (65%)  [มติผู้ใช้ B4]
--
-- ที่มา: ลำดับเดิมคือ ... qualified → quotation(55) → timeline_proposed(65) → ...
-- ซึ่งกลับหัวกับงานจริง (เสนอไทม์ไลน์ให้ลูกค้าดูก่อน แล้วค่อยออกใบเสนอราคา) และเพราะ
-- กลไก "เดินหน้าอย่างเดียว" ทั้งระบบเทียบ **ตำแหน่งใน array** ผลคือดีลที่ออกใบเสนอราคา
-- แล้ว (quotation) พอไปสร้าง/ผูกโครงการ จะถูก **ดึงถอยกลับ** เป็น timeline_proposed
-- เพราะ index ของมันมากกว่า. การแก้จึงต้องสลับลำดับจริง ไม่ใช่แค่เปลี่ยนข้อความ
--
-- ฝั่ง JS สลับที่ DEAL_STAGES + MAIN_SEQUENCE + DEFAULT_PROBABILITY_BY_STAGE
-- ไฟล์นี้ทำฝั่ง DB ซึ่งมี **map เดียวกันซ้ำอยู่ 3 ชุด** ในฟังก์ชันที่ถอยดีลออกจาก Won:
--   * cancel_sales_order_with_reversal_atomic (0116) — ยกเลิก SO ที่อนุมัติแล้ว
--   * unaccept_quotation_atomic               (0138) — ย้อนการรับใบเสนอราคา
--   * revert_deal_out_of_won                  (0168) — ลบใบที่รับแล้วถาวร
-- แก้แค่ฝั่ง JS = ดีลที่ถอยออกจาก Won จะได้ค่าเก่า (quotation 55 / timeline 65)
--
-- แทนที่จะไล่แก้เลขใน 3 ที่แล้วรอให้เพี้ยนกันอีกรอบหน้า → **ยุบเหลือชุดเดียว**
-- (deal_probability_for_stage) แล้วให้ทั้งสามเรียกใช้. ตัวฟังก์ชันคัดจากนิยามล่าสุด
-- ของแต่ละตัวทั้งก้อน เปลี่ยนจุดเดียวคือบล็อก CASE → เรียกฟังก์ชันกลาง
--
-- ไม่ต้อง backfill: นับ prod 2026-07-28 แล้ว ไม่มีดีลแถวไหนมี probability = 55 หรือ 65
-- (stage quotation 8 ใบ / timeline_proposed 11 ใบ ค่าจริงเป็น 20/50/80/100 ที่ผู้ใช้เลือกเอง)
-- ตัวเลขในไฟล์นี้เป็นแค่ค่าตั้งต้นตอนไม่ได้กรอก — ไม่มีข้อมูลเดิมให้แก้
--
-- Idempotent — รันซ้ำได้ · ไม่มี DDL บนตาราง · ไม่มี UPDATE/DELETE ข้อมูล

-- ── 1) แหล่งเดียวของ map ขั้น → % โอกาสปิด ───────────────────────────────
-- ต้องตรงกับ DEFAULT_PROBABILITY_BY_STAGE ใน src/lib/salesPlanning.js เป๊ะ ๆ
-- แก้ที่ไหนต้องแก้อีกที่เสมอ (มีเทสต์ฝั่ง JS อ่านไฟล์นี้มาเทียบให้แล้ว)
CREATE OR REPLACE FUNCTION public.deal_probability_for_stage(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_stage
    WHEN 'lead'              THEN 10
    WHEN 'qualified'         THEN 30
    WHEN 'timeline_proposed' THEN 55
    WHEN 'quotation'         THEN 65
    WHEN 'awaiting_confirm'  THEN 75
    WHEN 'deposit_pending'   THEN 90
    WHEN 'won'               THEN 100
    WHEN 'in_project'        THEN 100
    WHEN 'lost'              THEN 0
    -- ค่าที่ไม่รู้จัก = ค่าตั้งต้นต่ำสุด (ตรงกับ `?? 10` ของ toProbability ฝั่ง JS).
    -- ผู้เรียกทั้งสามกรอง v_target_stage ผ่าน whitelist มาก่อนแล้ว จึงไม่ควรถึงบรรทัดนี้
    ELSE 10
  END;
$$;

REVOKE ALL ON FUNCTION public.deal_probability_for_stage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deal_probability_for_stage(text) TO authenticated, service_role;

-- ── 2) cancel_sales_order_with_reversal_atomic — คัดจาก 0116 ทั้งก้อน ─────
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
    -- ⬇ 0170: เดิมเป็นบล็อก CASE ของตัวเอง — ย้ายไปแหล่งเดียวกลาง
    probability = public.deal_probability_for_stage(v_target_stage),
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

-- ── 3) unaccept_quotation_atomic — คัดจาก 0138 ทั้งก้อน ───────────────────
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
    -- ⬇ 0170: เดิมเป็นบล็อก CASE ของตัวเอง — ย้ายไปแหล่งเดียวกลาง
    probability = public.deal_probability_for_stage(v_target_stage),
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

-- ── 4) revert_deal_out_of_won — คัดจาก 0168 ทั้งก้อน ──────────────────────
CREATE OR REPLACE FUNCTION public.revert_deal_out_of_won(
  p_deal_id text,
  p_quote_number text,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal public.sales_deals%ROWTYPE;
  v_updated public.sales_deals%ROWTYPE;
  v_prev_stage text;
  v_target_stage text;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_deal FROM public.sales_deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- ไม่ใช่ Won = ไม่มีอะไรต้องถอย (เรียกซ้ำได้ปลอดภัย)
  IF v_deal.stage <> 'won' THEN RETURN NULL; END IF;

  SELECT "fromStage" INTO v_prev_stage FROM public.sales_deal_stage_history
  WHERE "dealId" = v_deal.id AND "toStage" = 'won'
  ORDER BY "changedAt" DESC LIMIT 1;

  v_target_stage := COALESCE(NULLIF(v_prev_stage, ''), 'deposit_pending');
  IF v_target_stage NOT IN ('quotation', 'timeline_proposed', 'awaiting_confirm', 'deposit_pending') THEN
    v_target_stage := 'deposit_pending';
  END IF;

  UPDATE public.sales_deals d SET
    stage = v_target_stage,
    -- ⬇ 0170: เดิมเป็นบล็อก CASE ของตัวเอง — ย้ายไปแหล่งเดียวกลาง
    probability = public.deal_probability_for_stage(v_target_stage),
    "confirmedAt" = NULL,
    metadata = (COALESCE(d.metadata, '{}'::jsonb)
        - 'acceptedQuotationId' - 'acceptedQuoteNumber' - 'acceptedQuoteAt'
        - 'wonSource' - 'wonAt' - 'wonMonth' - 'wonValueExVat'
        - 'wonDocType' - 'wonDocDate')
      || jsonb_build_object(
        'unacceptAt', v_now,
        'unacceptBy', COALESCE(p_actor_name, p_actor_id),
        'unacceptFromQuotation', p_quote_number,
        'unacceptReason', COALESCE(v_reason, 'ลบใบเสนอราคาที่รับแล้วถาวร')),
    "updatedAt" = v_now
  WHERE d.id = v_deal.id RETURNING d.* INTO v_updated;

  INSERT INTO public.sales_deal_stage_history (
    id, "dealId", "fromStage", "toStage", "changedBy", "changedByName"
  ) VALUES (
    'DSH-' || replace(gen_random_uuid()::text, '-', ''),
    v_deal.id, v_deal.stage, v_updated.stage, p_actor_id, p_actor_name
  );

  INSERT INTO public.sales_deal_forecasts (
    id, "dealId", "forecastMonth", "forecastAmount", probability, source,
    "createdBy", "createdByName"
  ) VALUES (
    'DFC-' || replace(gen_random_uuid()::text, '-', ''),
    v_updated.id,
    COALESCE(v_updated."forecastMonth", to_char(timezone('Asia/Bangkok', v_now), 'YYYY-MM')),
    COALESCE(v_updated."projectValue", 0),
    v_updated.probability, 'reversal', p_actor_id, p_actor_name
  );

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.revert_deal_out_of_won(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_deal_out_of_won(text, text, text, text, text, text)
  TO service_role;

-- Rollback:
-- 1) CREATE OR REPLACE ทั้งสามฟังก์ชันด้วยนิยามเดิมจาก 0116 / 0138 / 0168 ตามลำดับ
--    (บล็อก CASE เดิมกลับมาอยู่ในตัวฟังก์ชัน)
-- 2) DROP FUNCTION public.deal_probability_for_stage(text);
-- 3) ข้อมูลไม่กระทบ: ไฟล์นี้ไม่มี DDL บนตารางและไม่มี UPDATE/DELETE ข้อมูลเดิม

NOTIFY pgrst, 'reload schema';
