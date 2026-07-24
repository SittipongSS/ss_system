-- 0148 - ขยาย issued-document snapshot (0130) ให้รองรับใบสั่งขาย (SO) ด้วย
--
-- ที่มา: QT ตรึง snapshot ตอนอนุมัติ (immutable HTML + ฝังรูปลายเซ็น) reprint จากฉบับตรึง
-- เสมอ แต่ SO ยังพิมพ์แบบ client + โหลดรูปลายเซ็นสดตอนพิมพ์ (ไม่ตรึง). มติผู้ใช้ 2026-07-24:
-- ยกระดับ SO ให้ตรึง snapshot เหมือน QT (immutable + reprint คงที่).
--
-- ตาราง issued_documents (0130) ผูกแน่นกับ quotation: CHECK documentType='quotation',
-- FK quotationId, documentStandardVersionId NOT NULL (มาตรฐานเอกสาร versioned ของ QT).
-- SO ไม่มี versioned standard/commercial preset → ขยายตารางให้รับ 2 ชนิดแบบ branch ตาม type
-- (แพทเทิร์นเดียวกับ document_signature_evidence ที่รับทั้ง quotation/sales_order อยู่แล้ว).
-- Idempotent.

-- 1) คอลัมน์ + FK ของ SO
ALTER TABLE public.issued_documents
  ADD COLUMN IF NOT EXISTS "salesOrderId" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT;

-- 2) SO ไม่มีมาตรฐานเอกสาร versioned → ผ่อน NOT NULL (QT ยังบังคับผ่าน CHECK identity ข้างล่าง)
ALTER TABLE public.issued_documents
  ALTER COLUMN "documentStandardVersionId" DROP NOT NULL;

-- 3) documentType รับ sales_order เพิ่ม (constraint เดิมผูกชื่อคอลัมน์ = *_documentType_check)
ALTER TABLE public.issued_documents DROP CONSTRAINT IF EXISTS "issued_documents_documentType_check";
ALTER TABLE public.issued_documents
  ADD CONSTRAINT "issued_documents_documentType_check" CHECK ("documentType" IN ('quotation', 'sales_order'));

-- 4) identity CHECK แบบ branch ตาม type (แทน table-level CHECK เดิมที่บังคับ quotation ล้วน)
--    quotation: quotationId=documentId + ต้องมี standard version + ไม่มี salesOrderId
--    sales_order: salesOrderId=documentId + ไม่มี quotationId (standard/preset เป็น null ได้)
ALTER TABLE public.issued_documents DROP CONSTRAINT IF EXISTS "issued_documents_check";
ALTER TABLE public.issued_documents
  ADD CONSTRAINT "issued_documents_identity_check" CHECK (
    ("documentType" = 'quotation'
       AND "quotationId" IS NOT NULL AND "quotationId" = "documentId"
       AND "documentStandardVersionId" IS NOT NULL AND "salesOrderId" IS NULL)
    OR ("documentType" = 'sales_order'
       AND "salesOrderId" IS NOT NULL AND "salesOrderId" = "documentId"
       AND "quotationId" IS NULL)
  );

CREATE INDEX IF NOT EXISTS issued_documents_sales_order_idx
  ON public.issued_documents ("salesOrderId") WHERE "salesOrderId" IS NOT NULL;

-- 5) RPC ตรึง snapshot ของ SO — คู่ขนานกับ capture_issued_quotation_snapshot_atomic (0130)
--    ต่างที่: ผูก sales_orders (status='approved'), ไม่ validate standard/preset (SO ไม่มี),
--    evidence.documentType='sales_order'. Idempotent ตาม contentFingerprint เช่นเดียวกัน.
CREATE OR REPLACE FUNCTION public.capture_issued_sales_order_snapshot_atomic(
  p_snapshot_id text,
  p_artifact_id text,
  p_sales_order_id text,
  p_content_fingerprint text,
  p_resolved_payload jsonb,
  p_artifact_html text,
  p_artifact_sha256 text,
  p_signature_evidence_id text,
  p_layout_version text,
  p_locale text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_existing public.issued_documents%ROWTYPE;
  v_snapshot public.issued_documents%ROWTYPE;
  v_artifact public.issued_document_artifacts%ROWTYPE;
  v_sequence integer;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_snapshot_id), '') IS NULL
     OR NULLIF(btrim(p_artifact_id), '') IS NULL
     OR NULLIF(btrim(p_sales_order_id), '') IS NULL
     OR NULLIF(btrim(p_signature_evidence_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL
     OR NULLIF(btrim(p_layout_version), '') IS NULL
     OR NULLIF(btrim(p_locale), '') IS NULL THEN
    RAISE EXCEPTION 'issued_document_identity_required';
  END IF;
  IF p_content_fingerprint IS NULL OR p_content_fingerprint !~ '^sha256:[0-9a-f]{64}$'
     OR p_artifact_sha256 IS NULL OR p_artifact_sha256 !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'issued_document_fingerprint_invalid';
  END IF;
  IF p_resolved_payload IS NULL OR jsonb_typeof(p_resolved_payload) <> 'object' THEN
    RAISE EXCEPTION 'issued_document_payload_invalid';
  END IF;
  IF NULLIF(btrim(p_artifact_html), '') IS NULL THEN
    RAISE EXCEPTION 'issued_document_artifact_invalid';
  END IF;

  -- ล็อก SO; ตรึงได้เฉพาะที่อนุมัติแล้ว และต้องผูก evidence ตัวเดียวกับตอนอนุมัติ
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issued_document_document_not_found'; END IF;
  IF v_order.status <> 'approved' THEN
    RAISE EXCEPTION 'issued_document_document_state_invalid';
  END IF;
  IF v_order."signatureEvidenceId" IS DISTINCT FROM p_signature_evidence_id THEN
    RAISE EXCEPTION 'issued_document_signature_mismatch';
  END IF;

  SELECT * INTO v_evidence
  FROM public.document_signature_evidence
  WHERE id = p_signature_evidence_id
    AND "documentType" = 'sales_order'
    AND "documentId" = p_sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'issued_document_signature_required'; END IF;

  -- Idempotency: เนื้อหาเดิม (fingerprint เดิม) คืนฉบับที่ตรึงแล้ว ไม่สร้าง sequence ซ้ำ
  SELECT * INTO v_existing
  FROM public.issued_documents
  WHERE "documentType" = 'sales_order'
    AND "documentId" = p_sales_order_id
    AND "contentFingerprint" = p_content_fingerprint;
  IF FOUND THEN
    SELECT * INTO v_artifact
    FROM public.issued_document_artifacts
    WHERE "issuedDocumentId" = v_existing.id;
    RETURN jsonb_build_object(
      'snapshot', to_jsonb(v_existing),
      'artifact', to_jsonb(v_artifact),
      'reused', true
    );
  END IF;

  SELECT COALESCE(max("issueSequence"), 0) + 1 INTO v_sequence
  FROM public.issued_documents
  WHERE "documentType" = 'sales_order' AND "documentId" = p_sales_order_id;

  INSERT INTO public.issued_documents (
    id, "documentType", "documentId", "salesOrderId", "documentNumber",
    "issueSequence", "contentFingerprint", "resolvedPayload",
    "documentStandardVersionId", "commercialPresetVersionId", "signatureEvidenceId",
    "layoutTemplateVersion", "locale", "issuedAt", "issuedBy", "issuedByName", "createdAt"
  ) VALUES (
    p_snapshot_id, 'sales_order', p_sales_order_id, p_sales_order_id, v_order."orderNumber",
    v_sequence, p_content_fingerprint, p_resolved_payload,
    NULL, NULL, p_signature_evidence_id,
    p_layout_version, p_locale, v_now, p_actor_id, p_actor_name, v_now
  ) RETURNING * INTO v_snapshot;

  INSERT INTO public.issued_document_artifacts (
    id, "issuedDocumentId", "mimeType", "content", "sha256", "sizeBytes",
    "generatorVersion", "createdAt"
  ) VALUES (
    p_artifact_id, v_snapshot.id, 'text/html', p_artifact_html, p_artifact_sha256,
    octet_length(p_artifact_html), p_layout_version, v_now
  ) RETURNING * INTO v_artifact;

  RETURN jsonb_build_object(
    'snapshot', to_jsonb(v_snapshot),
    'artifact', to_jsonb(v_artifact),
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_issued_sales_order_snapshot_atomic(
  text, text, text, text, jsonb, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_issued_sales_order_snapshot_atomic(
  text, text, text, text, jsonb, text, text, text, text, text, text, text
) TO service_role;

-- Rollback guidance:
-- 1) ปิด caller (SO approve hook) + reprint route ของ SO ก่อน
-- 2) เก็บแถว issued_documents/artifacts ของ SO ไว้ (immutable) — ไม่ backfill/ลบ
-- 3) SO reprint fallback ไปเรนเดอร์สด (buildSalesOrderPrintHTML) เหมือนเดิม
-- 4) คืน schema เดิมยาก (มี SO rows แล้ว) — คงคอลัมน์/constraint ใหม่ไว้ได้ ไม่กระทบ QT

NOTIFY pgrst, 'reload schema';
