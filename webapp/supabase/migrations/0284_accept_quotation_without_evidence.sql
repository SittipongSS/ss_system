-- ============================================================
--  Migration 0284: ปิด Won ไม่ต้องแนบหลักฐานแล้ว — หลักฐานย้ายไปอยู่กับใบสั่งขาย
--  (มติผู้ใช้ 2026-08-24)
--
--  ⭐ คำสั่งตั้งต้น: *"การ won QT ขอเปลี่ยนเป็นแค่ modal แจ้งเพื่อยืนยัน ส่วนขั้นใส่
--  คอนเฟิร์มเอาไปอยู่ตอนสร้าง SO ... เพราะการคอนเฟิร์มมันแทบที่คืองวดแรกอยู่แล้ว"*
--
--  ── ของเดิม ────────────────────────────────────────────────────────────────
--  ปิด Won = ฟอร์มบังคับ 5 ช่อง (ประเภทเอกสาร · วันที่ · เลขที่ PO · ไฟล์แนบ ≥1 ·
--  กำหนดชำระ) ทั้งที่สิ่งที่ผู้ใช้กำลังตัดสินคือ "ดีลนี้ปิดได้แล้ว" อย่างเดียว ·
--  หลักฐานชุดนั้นถูกใช้จริงที่ **ใบสั่งขาย**: เลขที่ไหลไป referenceDoc (0246)
--  สลิปไหลไปเป็นหลักฐานงวดแรกตอน freeze (0245/0259) กำหนดชำระไหลไป paymentDueDate
--  ⇒ เก็บที่ต้นทางแล้วส่งต่อ กลายเป็นกรอกก่อนถึงเวลาที่จำเป็นหนึ่งขั้นเสมอ
--
--  ── กติกาใหม่ ─────────────────────────────────────────────────────────────
--  ปิด Won = โมดัลยืนยัน (+ เลือกโครงการถ้าดีลยังลอย ตาม #1385 ที่ย้ายด่านโครงการ
--  มาไว้ที่นี่ที่เดียว) · เอกสารยืนยันคำสั่งซื้อกรอกที่หน้าสร้างใบสั่งขาย (mig 0285)
--  และเป็นด่านของ **การยื่นอนุมัติใบสั่งขาย** ไม่ใช่ด่านของการปิดการขาย
--
--  ── สิ่งที่ไฟล์นี้แก้ ──────────────────────────────────────────────────────
--  คัดนิยาม accept_quotation_atomic ล่าสุด (0246) มาทั้งก้อน แล้ว:
--    1) ถอดด่านหลักฐาน 5 ข้อ (evidence_type_invalid · evidence_date_required ·
--       evidence_doc_no_required · evidence_file_required · payment_due_required)
--    2) `v_won_month` ถอยไปใช้ **เดือนที่กดรับใบ** เมื่อไม่มีวันที่เอกสาร —
--       เดิมอ่านจาก wonDocDate ล้วน ซึ่งจะเป็น NULL ตั้งแต่ใบนี้เป็นต้นไป
--       ⚠️ ยอด Actual ไม่ได้อ่านจากตรงนี้ (mig 0279 ย้ายไปอ่าน approvedAt ของ SO แล้ว)
--       ที่กระทบคือแถว FC ของดีลที่ปิด Won ⇒ FC ไปลงเดือนที่ปิดจริง
--    3) คอลัมน์ won* เขียนเฉพาะเมื่อมีค่าส่งมา — ใบเก่ายังอ่านของเดิมได้เหมือนเดิม
--
--  ⚠️ **ลายเซ็นฟังก์ชันไม่เปลี่ยน** (ยังรับ p_evidence) — โค้ดเก่าที่ยังส่งหลักฐาน
--  มาครบไม่พัง และ deploy สลับลำดับกันได้ · p_evidence = '{}' ก็ผ่าน
--
--  ⚠️ **ไม่ backfill อะไรทั้งสิ้น** — ใบที่ปิด Won ไปแล้วยังถือหลักฐานของตัวเองไว้
--  ที่ quotations.won* ตามเดิม (หน้าจอใบสั่งขายอ่านสองบ้าน: ของใหม่จากใบสั่งขาย
--  ของเก่าจากใบเสนอราคา)
--
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

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
  v_doc_no text := NULLIF(btrim(COALESCE(p_evidence->>'docNo', '')), '');
  v_won_month text;
BEGIN
  -- หลักฐานไม่บังคับแล้ว (มติ 2026-08-24) — ตรวจเฉพาะ "ถ้าส่งมาต้องเป็นค่าที่รู้จัก"
  IF v_doc_type IS NOT NULL AND v_doc_type NOT IN ('payment_slip','po','order_confirmation') THEN
    RAISE EXCEPTION 'quotation_evidence_type_invalid';
  END IF;
  IF jsonb_typeof(v_files) <> 'array' THEN
    RAISE EXCEPTION 'quotation_evidence_type_invalid';
  END IF;

  -- ⭐ เดือนของ FC = เดือนของเอกสารหลักฐานถ้ามี ไม่งั้นเดือนที่กดรับใบ (เวลาไทย)
  -- ⚠️ ต้อง AT TIME ZONE ก่อน to_char — session ของ Supabase เป็น UTC ใบที่รับ
  -- ตอน 01:00 น. ไทยของวันที่ 1 จะตกไปเดือนก่อนหน้าถ้าอ่านดิบ (บทเรียนจาก 0279)
  v_won_month := to_char(COALESCE(v_doc_date, (v_now AT TIME ZONE 'Asia/Bangkok')::date), 'YYYY-MM');

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
  -- ด่านโครงการยังอยู่ที่นี่ที่เดียว (#1385) — ผู้เรียกผูกโครงการให้ก่อนในคำขอเดียวกัน
  IF v_deal."projectId" IS NULL THEN RAISE EXCEPTION 'deal_project_required'; END IF;
  IF v_deal.stage IN ('lost', 'won', 'in_project') THEN RAISE EXCEPTION 'deal_closed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotations
    WHERE "dealId" = v_deal.id AND status = 'accepted' AND id <> v_quote.id
  ) THEN RAISE EXCEPTION 'deal_already_has_accepted_quotation'; END IF;

  -- ยอด Won = ยอดก่อน VAT; GREATEST กัน VAT ที่มากกว่ายอดรวม (ข้อมูลเพี้ยน) ไม่ให้ติดลบ
  -- 0 ผ่านได้ (ถอด quotation_won_value_zero — มติ 2026-08-03)
  v_won_value := GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0));

  -- คอลัมน์หลักฐานเขียนเฉพาะที่ส่งมา — ไม่มีหลักฐาน = คงค่าเดิม (NULL สำหรับใบใหม่)
  UPDATE public.quotations SET
    status = 'accepted', "acceptedAt" = v_now,
    "acceptedBy" = COALESCE(p_actor_name, p_actor_id),
    "wonDocType" = COALESCE(v_doc_type, "wonDocType"),
    "wonDocDate" = COALESCE(v_doc_date, "wonDocDate"),
    "wonPaymentDueDate" = COALESCE(v_due_date, "wonPaymentDueDate"),
    "wonAttachments" = CASE WHEN jsonb_array_length(v_files) > 0 THEN v_files ELSE "wonAttachments" END,
    "wonDocNo" = COALESCE(v_doc_no, "wonDocNo"),
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
      'wonValueExVat', v_won_value
    ) || CASE
      WHEN v_doc_type IS NULL AND v_doc_date IS NULL THEN '{}'::jsonb
      ELSE jsonb_strip_nulls(jsonb_build_object(
        'wonDocType', v_doc_type,
        'wonDocDate', to_char(v_doc_date, 'YYYY-MM-DD')
      ))
    END,
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

COMMIT;
