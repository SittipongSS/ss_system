-- ============================================================
--  Migration 0381: บังคับลบใบเสนอราคา/ดีลที่มีสาย Rev. ของใบสั่งขายได้
--
--  🐞 UAT บน prod 24/09 (ดีลทดสอบ DL-260900581 · QT-26090383-0 · SO-26090237-0 → Rev. -1):
--    บังคับลบ QT ล้มด้วย error ดิบ `violates foreign key constraint "sales_orders_revisedFromId_fkey"`
--    ⇒ สองใบในสาย Rev. ชี้กันไปมาด้วย FK ON DELETE RESTRICT ทั้งสองทิศ (0161: revisedFromId · supersededById)
--    ⇒ force_delete_quotation (0168) วน force_delete_sales_order ทีละใบ — ลบใบไหนก่อนก็ชน
--    ⇒ ลบ QT หรือดีลที่เคยออก Rev. SO ไม่ได้เลย (ก่อน #1800 ทาง Rev. ไม่เคยถูกใช้บน prod จึงไม่มีใครเจอ)
--
--  ⭐ แก้: ตัดตัวชี้สายโซ่ของใบทั้งหมดใต้ QT นี้ก่อนวนลบ (ทรานแซกชันเดียวกัน — ล้มกลางทาง = ถอยทั้งก้อนเหมือนเดิม)
--    ใบที่ถูกลบทั้งหมดอยู่ใต้ QT นี้ ⇒ ไม่มีใบนอก QT ที่เสียตัวชี้
--  ⚠️ ทางลบ SO ทีละใบ (หน้าใบสั่งขาย) ยังบล็อกสาย Rev. ตามเดิม (salesOrderRevisionChainDeleteBlock) — ไม่แตะ
--  ⚠️ ตัวฟังก์ชันคัดจาก 0168 ทุกตัวอักษร ยกเว้นบล็อก UPDATE หนึ่งก้อน (ยาม forceDeleteRevisionChain.test เทียบทีละตัวอักษร)
--  ⚠️ DDL — รันใน Supabase SQL Editor · ไม่ต้อง deploy โค้ด (มีแต่ฟังก์ชันในฐาน)
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT position('"supersededById" = NULL' IN pg_get_functiondef(
--     'public.force_delete_quotation(text,text,text,text)'::regprocedure)) > 0;          -- true
--   SELECT r.role, has_function_privilege(r.role,
--     'public.force_delete_quotation(text,text,text,text)', 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role);          -- false · false · true
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.force_delete_quotation(
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

  -- ⬇ 0381: ตัดตัวชี้สาย Rev. ของใบใต้ QT นี้ก่อน — ต้นทาง.supersededById ↔ Rev..revisedFromId เป็น FK ON DELETE
  --   RESTRICT ทั้งสองทิศ (0161) ⇒ ลบทีละใบ ใบไหนก่อนก็ชน · ทั้งสายอยู่ใต้ QT เดียวกัน (Rev. ก๊อป quotationId)
  UPDATE public.sales_orders
     SET "revisedFromId" = NULL, "supersededById" = NULL
   WHERE "quotationId" = p_id
     AND ("revisedFromId" IS NOT NULL OR "supersededById" IS NOT NULL);

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

REVOKE ALL ON FUNCTION public.force_delete_quotation(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_quotation(text, text, text, text)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
