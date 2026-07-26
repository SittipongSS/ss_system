-- 0168 - ลบใบเสนอราคาที่ "รับแล้ว (Won)" ถาวร ต้องถอยดีลออกจาก Won ให้ด้วย
--
-- บั๊กจริงบน prod (2026-07-26, ผู้ใช้เจอเอง): ดีล TEST_Deal ของ บริษัท เซนท์ แอนด์
-- เซนส์ แลบอราทอรี่ จำกัด ค้างที่ stage='won' ทั้งที่ใบเสนอราคาที่ทำให้ Won
-- (QT-26070001-1) ถูกลบถาวรไปแล้ว → เปิดหน้าสร้างใบเสนอราคาก็ไม่เห็นลูกค้ารายนี้
-- (ดีล Won ถูกตัดออกจากตัวเลือกโดยเจตนา) และกด "ย้อนการรับ" ก็ไม่ได้เพราะปุ่มนั้น
-- อยู่บนหน้าใบเสนอราคาที่ถูกลบไปแล้ว = ทางตัน
--
-- เหตุ: ทางลบถาวรเรียกแค่ cleanupQuotationOrphans (lib/forceDelete.js) ซึ่งลบเฉพาะคีย์
-- metadata.acceptedQuotationId — ดีลใบนี้ไม่มีคีย์นั้นเลย (มี acceptedQuoteNumber)
-- จึงไม่ได้แตะดีลแม้แต่ฟิลด์เดียว. ตรรกะถอย Won ที่ถูกต้องมีอยู่แล้วใน
-- unaccept_quotation_atomic (0138) แต่ทางลบไม่เคยเรียกใช้
--
-- แก้: ยก §4–7 ของ 0138 เป็นฟังก์ชันกลาง revert_deal_out_of_won() แล้วให้
-- force_delete_quotation() เรียกให้เองในทรานแซกชันเดียวกับการลบ — ลบใบที่ Won แล้ว
-- ดีลจะถอยออกจาก Won เสมอ ไม่ต้องพึ่งให้คนไปตามแก้ทีหลัง
--
-- ปิดท้ายด้วยการซ่อมดีลที่ค้างอยู่แล้ว (บน prod มี 1 ใบ) — เงื่อนไขแคบ: Won ที่มาจาก
-- ใบเสนอราคา + ไม่มีใบ accepted เหลือ + ไม่มี SO ที่ยังไม่ยกเลิก
-- Idempotent — รันซ้ำได้

-- ── 1) ฟังก์ชันกลาง: ถอยดีลออกจาก Won ─────────────────────────────────────────
-- คัดจาก unaccept_quotation_atomic (0138) §4–7 ทั้งชุด: สถานะก่อน Won จากประวัติ →
-- probability ตามขั้น → ล้าง metadata การ Won → ลง stage history → ลง forecast 'reversal'
-- ต่างกันแค่ไม่แตะตัวใบ (ใบถูกลบไปแล้ว/กำลังจะถูกลบ) และไม่ล้มถ้าดีลไม่ได้ Won
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

-- ── 2) force_delete_quotation: ลบแล้วถอยดีลให้ในทรานแซกชันเดียว ───────────────
-- เปลี่ยน return type (void → jsonb) จึงต้อง DROP ก่อน · พารามิเตอร์ผู้ทำมี DEFAULT
-- ให้ผู้เรียกเดิมที่ส่งแค่ p_id ยังใช้ได้
DROP FUNCTION IF EXISTS public.force_delete_quotation(text);
DROP FUNCTION IF EXISTS public.force_delete_quotation(text, text, text, text);

CREATE FUNCTION public.force_delete_quotation(
  p_id text,
  p_actor_id text DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_actor_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_issued text[];
  v_so text;
  v_deal jsonb := NULL;
BEGIN
  PERFORM set_config('app.force_delete', '1', true);

  -- อ่านใบไว้ก่อนลบ — หลังลบแล้วไม่มีทางรู้ว่ามันเคย accepted และผูกดีลใบไหน
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_id;

  FOR v_so IN SELECT id FROM public.sales_orders WHERE "quotationId" = p_id LOOP
    PERFORM public.force_delete_sales_order(v_so);
  END LOOP;

  UPDATE public.quotations
     SET "signatureEvidenceId" = NULL, "proposerSignatureEvidenceId" = NULL
   WHERE id = p_id;

  SELECT array_agg(id) INTO v_issued
  FROM public.issued_documents
  WHERE "documentType" = 'quotation' AND "documentId" = p_id;

  IF v_issued IS NOT NULL THEN
    DELETE FROM public.issued_document_pdf_artifacts WHERE "issuedDocumentId" = ANY(v_issued);
    DELETE FROM public.issued_document_artifacts     WHERE "issuedDocumentId" = ANY(v_issued);
    DELETE FROM public.issued_documents              WHERE id = ANY(v_issued);
  END IF;

  DELETE FROM public.document_signature_evidence
   WHERE "documentType" = 'quotation' AND "documentId" = p_id;

  DELETE FROM public.quotations WHERE id = p_id;

  -- ใบที่ลบเป็นแหล่ง Won ของดีล → ถอยดีลออกจาก Won (ไม่งั้นดีลค้าง Won ตลอดกาล
  -- และเปิดใบใหม่ไม่ได้เพราะดีล Won ถูกตัดออกจากตัวเลือก)
  IF v_quote.id IS NOT NULL AND v_quote.status = 'accepted' AND v_quote."dealId" IS NOT NULL THEN
    v_deal := public.revert_deal_out_of_won(
      v_quote."dealId",
      v_quote."quoteNumber",
      'ลบใบเสนอราคาที่รับแล้ว (Won) ถาวร — บังคับลบโดยผู้ดูแลระบบ',
      p_actor_id, p_actor_name, p_actor_role
    );
  END IF;

  RETURN jsonb_build_object(
    'quotationId', p_id,
    'quoteNumber', v_quote."quoteNumber",
    'wasAccepted', COALESCE(v_quote.status = 'accepted', false),
    'dealReverted', v_deal IS NOT NULL,
    'deal', v_deal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_deal_out_of_won(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_deal_out_of_won(text, text, text, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.force_delete_quotation(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_quotation(text, text, text, text)
  TO service_role;

-- ── 3) ซ่อมดีลที่ค้าง Won อยู่แล้ว ──────────────────────────────────────────────
-- เงื่อนไขแคบโดยเจตนา: Won ที่ "มาจากใบเสนอราคา" เท่านั้น (Won ที่บันทึกมือไม่แตะ) +
-- ไม่มีใบ accepted เหลือให้กด "ย้อนการรับ" + ไม่มี SO ที่ยังไม่ยกเลิก (ถ้ามี SO อยู่
-- ต้องไปทาง "ยกเลิกใบสั่งขายพร้อมย้อนสถานะ" ไม่ใช่ถอยเงียบ ๆ ที่นี่)
DO $$
DECLARE
  r record;
  v_fixed integer := 0;
BEGIN
  FOR r IN
    SELECT d.id, COALESCE(d.metadata->>'acceptedQuoteNumber', '(ใบที่ถูกลบ)') AS quote_number
    FROM public.sales_deals d
    WHERE d.stage = 'won'
      AND d.metadata->>'wonSource' = 'quotation'
      AND NOT EXISTS (
        SELECT 1 FROM public.quotations q
        WHERE q."dealId" = d.id AND q.status = 'accepted'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_orders so
        JOIN public.quotations q2 ON q2.id = so."quotationId"
        WHERE q2."dealId" = d.id AND so.status <> 'cancelled'
      )
  LOOP
    PERFORM public.revert_deal_out_of_won(
      r.id, r.quote_number,
      'ซ่อมข้อมูล (mig 0168): ใบเสนอราคาที่ทำให้ดีล Won ถูกลบถาวรไปแล้ว แต่ดีลค้างที่ Won',
      'migration-0168', 'Migration 0168', 'system'
    );
    v_fixed := v_fixed + 1;
  END LOOP;
  RAISE NOTICE 'mig 0168: ถอยดีลที่ค้าง Won ทั้งหมด % ใบ', v_fixed;
END $$;

NOTIFY pgrst, 'reload schema';
