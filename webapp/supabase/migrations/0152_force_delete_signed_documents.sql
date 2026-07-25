-- 0152 - break-glass ผู้ดูแลระบบ: ลบใบเสนอราคา/ใบสั่งขายที่มีหลักฐานลายเซ็นได้
--
-- ที่มา: หลักฐานลายเซ็น (0125) + ฉบับตรึง (0130/0139/0148) เป็น immutable และ FK RESTRICT
-- → เอกสารที่เคยอนุมัติ/ตรึงแล้ว **ลบถาวรไม่ได้เลย** แม้กด "บังคับลบ" (forceDelete.js
-- รายงาน blocked ตรง ๆ, QT DELETE ตอบ 409). หลังจากนี้จะยิ่งชนบ่อยเพราะ mig 0151 เปิดทาง
-- ให้เก็บหลักฐาน "ผู้ยื่น" ด้วย = เอกสารเกือบทุกใบที่เดินผ่านคิวจะมี evidence
--
-- มติผู้ใช้ 2026-07-25: ขอทางให้ admin ลบได้ → เปิดช่อง break-glass ตามแพตเทิร์นเดียวกับ
-- mig 0147 (guard ยอม DELETE เมื่อ session flag app.force_delete='1' ที่ตั้งได้จาก RPC เท่านั้น)
-- โดย **UPDATE ยังตายทุกกรณีเหมือนเดิม** — ผ่อนแค่การลบทั้งชุดโดยผู้ดูแลระบบ ไม่ใช่การแก้ประวัติ
--
-- ⚠️ นี่เป็นการผ่อน boundary ที่ Decision 0008 เคยประกาศแข็ง — ชั้น API ต้องจำกัด role=admin
-- และต้องมีพรีวิว cascade + audit ทุกครั้ง (ทำในโค้ดของ PR เดียวกัน)
-- Idempotent — รันซ้ำได้.

-- ── 1) guard 3 ตัวเปิดช่อง force (UPDATE ยังห้ามทั้งหมด) ──
CREATE OR REPLACE FUNCTION public.guard_document_signature_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- break-glass: ตั้ง flag ได้จาก RPC force_delete_* เท่านั้น (local ต่อ transaction)
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'signature_evidence_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'signature_evidence_update_forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_document_signature_evidence_override()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'signature_evidence_override_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'signature_evidence_override_update_forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_issued_document_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'issued_document_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'issued_document_update_forbidden';
END;
$$;

-- ── 2) RPC ลบใบสั่งขายทั้งชุด ──
-- ลำดับสำคัญเพราะ FK RESTRICT พันกัน: ปลด pointer บนเอกสารก่อน → ลบไฟล์แนบของฉบับตรึง →
-- ฉบับตรึง → override → หลักฐาน → ตัวเอกสาร (sales_order_lines เป็น CASCADE จึงตามไปเอง)
CREATE OR REPLACE FUNCTION public.force_delete_sales_order(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issued text[];
BEGIN
  PERFORM set_config('app.force_delete', '1', true);  -- true = local ต่อ transaction

  UPDATE public.sales_orders
     SET "signatureEvidenceId" = NULL, "proposerSignatureEvidenceId" = NULL
   WHERE id = p_id;

  SELECT array_agg(id) INTO v_issued
  FROM public.issued_documents
  WHERE "documentType" = 'sales_order' AND "documentId" = p_id;

  IF v_issued IS NOT NULL THEN
    DELETE FROM public.issued_document_pdf_artifacts WHERE "issuedDocumentId" = ANY(v_issued);
    DELETE FROM public.issued_document_artifacts     WHERE "issuedDocumentId" = ANY(v_issued);
    DELETE FROM public.issued_documents              WHERE id = ANY(v_issued);
  END IF;

  DELETE FROM public.document_signature_evidence_overrides WHERE "salesOrderId" = p_id;
  DELETE FROM public.document_signature_evidence
   WHERE "documentType" = 'sales_order' AND "documentId" = p_id;

  DELETE FROM public.sales_orders WHERE id = p_id;
END;
$$;

-- ── 3) RPC ลบใบเสนอราคาทั้งชุด ──
-- ⚠️ sales_orders."quotationId" เป็น ON DELETE CASCADE (0107:8) → ถ้าลบ QT ตรง ๆ SO ลูกจะถูก
-- ลากลบ แต่ SO ลูกอาจมี evidence/ฉบับตรึงที่ FK RESTRICT → cascade ล้มทั้ง transaction
-- จึงต้องบังคับลบ SO ลูกให้หมดก่อนเสมอ
CREATE OR REPLACE FUNCTION public.force_delete_quotation(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issued text[];
  v_so text;
BEGIN
  PERFORM set_config('app.force_delete', '1', true);

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
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_sales_order(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.force_delete_quotation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_sales_order(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_delete_quotation(text) TO service_role;

-- Rollback guidance:
-- 1) ปิดเส้นทาง force ที่ชั้น API ก่อน (ปุ่มบังคับลบของ admin)
-- 2) CREATE OR REPLACE guard 3 ตัวกลับเป็นเวอร์ชันเดิม (0125:80-91 / 0127:48-59 / 0130:55-66)
--    = ถอดบรรทัด current_setting ออก — ข้อมูลไม่กระทบ
-- 3) DROP FUNCTION force_delete_sales_order(text), force_delete_quotation(text)
-- 4) flag app.force_delete เป็น transaction-local เท่านั้น ไม่ค้างข้าม transaction
--    และตั้งจากภายนอกไม่ได้ (client ใช้ service-role ยิง RPC ได้เฉพาะที่ GRANT ไว้)

NOTIFY pgrst, 'reload schema';
