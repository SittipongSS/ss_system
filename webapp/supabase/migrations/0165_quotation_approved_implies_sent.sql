-- 0165 - อนุมัติใบเสนอราคา = ถือว่าส่งลูกค้าแล้ว (มติผู้ใช้ 2026-07-26).
--
-- เดิมหลังอนุมัติ ใบยังเป็น status='draft' แล้วผู้ใช้ต้องกดปุ่ม "ส่งให้ลูกค้า" อีกทีเพื่อ
-- เปลี่ยนเป็น 'sent' — ปุ่มนั้นไม่ส่งอีเมล ไม่แจ้งเตือน ไม่ทำอะไรนอกจากเปลี่ยนตัวอักษร
-- (การส่งจริงเกิดนอกระบบ) ผลคือ:
--   * ป้ายสถานะบนใบที่อนุมัติแล้วยังเขียนว่า "ฉบับร่าง" ซึ่งขัดกับความจริง
--   * ใบที่อนุมัติแล้วไม่มีปุ่มหลักเลย ขั้นถัดไปที่ควรทำ (Won) จมอยู่ในแถวปุ่มรอง
--
-- มติ: **อนุมัติแล้วให้อนุมานว่าส่งลูกค้าแล้ว** — RPC ตั้ง status='sent' ให้ในทรานแซกชัน
-- เดียวกับการอนุมัติ (ไม่ใช่ UPDATE ตามหลัง ซึ่งจะพลาดแล้วเหลือใบ approved ที่ยังเป็นร่าง)
-- แล้วปุ่ม "ส่งให้ลูกค้า" ถูกถอดออกจากหน้าเว็บ วันที่อนุมัติ = วันที่ถือว่าส่ง
--
-- สถานะ 'sent' ของใบเสนอราคาแทบไม่มีพฤติกรรมของตัวเองอยู่แล้ว — ทุกจุดในโค้ดจับคู่
-- 'sent' กับ 'draft' เสมอ (แก้ได้เท่ากัน · Won ได้เท่ากัน · ออก Rev. ได้เท่ากัน) จึงไม่มี
-- ผลข้างเคียงกับด่านอื่น. ใบเก่าที่ค้างเป็น approved+draft อยู่แล้วไม่ backfill โดยเจตนา:
-- ยังกด Won ได้ตามปกติ และจะเข้าเส้นทางใหม่เองเมื่อมีการอนุมัติรอบถัดไป (Rev.)
--
-- นิยามนี้คัดลอกจาก mig 0125:237 ทั้งก้อน เปลี่ยนบรรทัดเดียวคือเพิ่ม status = 'sent'
-- (ห้ามลอกจากที่อื่น — 0125 คือนิยามล่าสุดของฟังก์ชันนี้ ยังไม่เคยถูก replace)

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
    -- อนุมัติ = ถือว่าส่งลูกค้าแล้ว (มติ 2026-07-26) — บรรทัดเดียวที่ต่างจาก 0125
    status = 'sent',
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

NOTIFY pgrst, 'reload schema';
