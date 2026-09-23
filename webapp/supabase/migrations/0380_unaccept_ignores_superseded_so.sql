-- ============================================================
--  Migration 0380: ย้อนการรับใบเสนอราคาได้ เมื่อใบ SO ที่เหลือเป็นใบที่ถูกออก Rev. ทับแล้ว
--
--  🐞 ทางตันที่เจอตอน UAT บน prod 24/09 (ดีลทดสอบ DL-260900581):
--    SO-26090237-0 อนุมัติ → ย้อนการอนุมัติ → ออก Rev. -1 (ใบต้นทางเป็น 'revised') → ยกเลิก -1 โดยไม่เลือกถอยดีล
--    ⇒ unaccept_quotation_atomic (0170) เห็นใบต้นทาง 'revised' = "ไม่ใช่ cancelled" ⇒ RAISE sales_order_exists ทุกครั้ง
--    ⇒ ปุ่ม "ย้อนการรับ" ก็ซ่อน (hasNonCancelledSalesOrder) ⇒ ดีลติด Won ตลอดไป ไม่มีปุ่มไหนพาออก
--    (ก่อน 0376 ทาง Rev. ไม่เคยถูกใช้บน prod จึงไม่มีใครเจอ)
--
--  ⭐ แก้: นับเฉพาะใบที่ยังมีชีวิต = ไม่ cancelled **และ** ไม่ถูกแทน (supersededById IS NULL)
--    นิยามเดียวกับด่านกันสร้าง SO ซ้ำ (create_sales_order_draft · 0363) และ isLiveSalesOrder ฝั่ง JS
--    ใบ Rev. ที่ยังเดินอยู่ (ร่าง/รออนุมัติ/อนุมัติ/ย้อนการอนุมัติ) ยังบล็อกเหมือนเดิม — ไม่ได้เปิดทางลัดใหม่
--
--  ⚠️ ตัวฟังก์ชันคัดจาก 0170 ทุกตัวอักษร ยกเว้นเงื่อนไข supersededById หนึ่งบรรทัด
--    (ยาม src/lib/sales/unacceptIgnoresRevised.test.mjs เทียบทีละตัวอักษร)
--  ⚠️ DDL — รันใน Supabase SQL Editor ก่อน deploy โค้ดของ PR เดียวกัน (โค้ดเก่าเข้ากับฟังก์ชันใหม่ได้ ·
--    โค้ดใหม่บนฟังก์ชันเก่า = ปุ่มขึ้นแต่กดแล้วได้ 409 เดิม)
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT position('"supersededById" IS NULL' IN pg_get_functiondef(
--     'public.unaccept_quotation_atomic(text,text,text,text,text)'::regprocedure)) > 0;   -- true
--   SELECT r.role, has_function_privilege(r.role,
--     'public.unaccept_quotation_atomic(text,text,text,text,text)', 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role);          -- false · false · true
-- ============================================================

BEGIN;

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

  -- 2) SO ที่ยังมีชีวิต = เส้นทางนี้ใช้ไม่ได้ (approved → ย้อน Won ผ่าน 0116;
  --    ร่าง/รออนุมัติ/ตีกลับ → ยกเลิก SO ก่อน)
  --    ⬇ 0380: ใบที่ถูกออก Rev. ทับแล้ว (supersededById) ไม่นับ — นิยามเดียวกับด่านกันสร้างซ้ำ
  --      (create_sales_order_draft) · เดิมใบต้นทาง 'revised' บล็อกตลอดไป = ดีลติด Won
  IF EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE "quotationId" = v_quote.id AND status <> 'cancelled' AND "supersededById" IS NULL
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

COMMIT;

NOTIFY pgrst, 'reload schema';
