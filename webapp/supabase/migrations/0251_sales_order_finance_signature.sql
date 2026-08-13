-- ============================================================
--  Migration 0251: ลายเซ็นฝ่ายบัญชีบนใบสั่งขาย (มติผู้ใช้ 2026-08-13)
--
--  คำสั่งตั้งต้น: *"การอนุมัติ SO ต้องลงลายเซ็นในเอกสารด้วย"*
--
--  ⭐ **ช่องเซ็น "ฝ่ายบัญชี" มีอยู่บนเอกสารตั้งแต่แรกแล้ว** (มติ 2026-08-05 กำหนดช่อง
--  ลงชื่อสามช่อง: ฝ่ายขาย · ผู้จัดการฝ่ายขาย · ฝ่ายบัญชี) — ที่ผ่านมามันว่างเปล่าเพราะ
--  ไม่มีใครเซ็น · ขั้นบัญชีตรวจใบ (mig 0250) จึงเป็นตัวเติมช่องที่สามนี้ ไม่ใช่การ
--  เพิ่มช่องใหม่ให้เอกสาร
--
--  ⚠️ **ไม่แตะ `approvalFingerprint`** — ค่านั้นตรึงตอน AE Supervisor อนุมัติและเป็น
--  ตัวบอกว่า "เนื้อหาถูกแก้หลังอนุมัติหรือยัง" · เขียนทับเมื่อไรระบบจะอ่านว่าใบถูกแก้
--  แล้วบังคับให้อนุมัติใหม่ทั้งใบ · ลายเซ็นบัญชีเก็บ fingerprint ของตัวเองไว้ใน
--  แถว evidence แทน (เป็นหลักฐานว่าบัญชีเห็นเนื้อหาชุดไหนตอนเซ็น)
--
--  ⚠️ **ต้องมีลายเซ็น active ในระบบก่อน** — `capture_document_signature_evidence`
--  จะ RAISE `signature_evidence_signature_required` ถ้าคนกดยังไม่เคยอัปโหลดลายเซ็น
--  ที่หน้า /account ⇒ ผู้ใช้ฝ่ายบัญชีต้องตั้งลายเซ็นก่อนใช้งานจริง
--
--  🛑 **ต้องรันก่อน deploy โค้ด** — โค้ดใหม่เรียก RPC ตัวนี้ตรง ๆ
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

-- ── คอลัมน์: หลักฐานลายเซ็นของฝ่ายบัญชี ─────────────────────────────────
-- แยกจาก `signatureEvidenceId` (ผู้อนุมัติ) และ `proposerSignatureEvidenceId`
-- (ผู้จัดทำ) เพราะเป็นคนละคน คนละเวลา คนละช่องบนเอกสาร
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "financeSignatureEvidenceId" text;

COMMENT ON COLUMN public.sales_orders."financeSignatureEvidenceId" IS
  'หลักฐานลายเซ็นฝ่ายบัญชีตอนตรวจใบผ่าน (mig 0251) — ช่องลงชื่อที่สามบนเอกสาร';

-- ── RPC: บัญชีอนุมัติใบ + ตรึงลายเซ็น ในทรานแซกชันเดียว ──────────────────
--
-- รูปเดียวกับ approve_sales_order_with_signature_evidence_atomic (0197) แต่:
--   · ทำงานบน **แกน financeStatus** ไม่ใช่ `status` ⇒ ไม่แตะสายอนุมัติเอกสาร
--   · ผู้ลงนามคือฝ่ายบัญชี ตรวจด้วย **ฝ่าย** ไม่ใช่ role อย่างเดียว (ดูหมายเหตุข้างล่าง)
CREATE OR REPLACE FUNCTION public.finance_approve_sales_order_with_signature_evidence_atomic(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_finance_note text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_actor_department text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_document_not_found'; END IF;

  -- ⚠️ **ตรวจฝ่าย ไม่ใช่ role อย่างเดียว** — role `staff` ของฝ่ายอื่นก็ถือ
  -- `payments:confirm` ในชั้นแอป (ดู DEPARTMENT_ROLES.FN) ⇒ ถ้าเช็คแต่ role
  -- ฝ่ายคลัง/QC จะเซ็นในช่องบัญชีได้ · admin ผ่านได้ในฐานะ break-glass เหมือนที่อื่น
  IF p_actor_role IS DISTINCT FROM 'admin'
     AND COALESCE(p_actor_department, '') <> 'FN' THEN
    RAISE EXCEPTION 'signature_evidence_forbidden';
  END IF;

  -- ต้องผ่าน AE Supervisor มาแล้ว และอยู่ในคิวของบัญชีจริง ๆ
  IF v_order.status <> 'approved' OR v_order."financeStatus" IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'signature_evidence_approval_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'signature_evidence_approval_stale';
  END IF;

  -- ⚠️ แยกหน้าที่: คนที่ยื่นหรือจัดทำใบ จะมาเซ็นในช่องบัญชีเองไม่ได้
  -- (ไม่มีทาง override เหมือนสายอนุมัติ เพราะบัญชีคือด่านสุดท้ายของใบ)
  IF (v_order."createdBy" IS NOT NULL AND v_order."createdBy" = p_actor_id)
     OR (v_order."submittedBy" IS NOT NULL AND v_order."submittedBy" = p_actor_id)
     OR (v_order."approvedBy" IS NOT NULL AND v_order."approvedBy" = p_actor_id) THEN
    RAISE EXCEPTION 'signature_evidence_separation_required';
  END IF;

  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'sales_order', v_order.id, v_order."orderNumber",
    p_document_fingerprint, 'salesOrder', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now
  );

  UPDATE public.sales_orders SET
    "financeStatus" = 'approved',
    "financeApprovedBy" = p_actor_id,
    "financeApprovedByName" = p_actor_name,
    "financeApprovedAt" = v_now,
    "financeNote" = NULLIF(btrim(COALESCE(p_finance_note, '')), ''),
    "financeSignatureEvidenceId" = v_evidence.id,
    -- ล้างร่องรอยการตีกลับรอบก่อน — ใบนี้ผ่านแล้ว
    "financeRejectedBy" = NULL,
    "financeRejectedByName" = NULL,
    "financeRejectedAt" = NULL,
    "financeRejectReason" = NULL,
    -- ⚠️ **ไม่แตะ `approvalFingerprint` และ `status`** โดยเจตนา — ดูหัวไฟล์
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'document', to_jsonb(v_order),
    'evidence', to_jsonb(v_evidence)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finance_approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
) TO service_role;

COMMIT;

-- Rollback guidance:
--   DROP FUNCTION public.finance_approve_sales_order_with_signature_evidence_atomic(
--     text, text, timestamptz, text, text, text, text, text, text, text);
--   ALTER TABLE public.sales_orders DROP COLUMN "financeSignatureEvidenceId";
-- ใบที่บัญชีอนุมัติไปแล้วยังคง financeStatus = 'approved' ตามเดิม เสียแค่ลิงก์ไปหลักฐาน
-- ลายเซ็น (แถวใน document_signature_evidence ยังอยู่ ไม่ถูกลบ)

NOTIFY pgrst, 'reload schema';
