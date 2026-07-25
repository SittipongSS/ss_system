-- 0150 - อนุมัติเอกสาร: เลิกบังคับ "เหตุผล" ตอน Admin Override
--
-- มติผู้ใช้ 2026-07-25: ตอนอนุมัติให้เด้งแค่กล่อง "ยืนยันอนุมัติ" ทั้งใบเสนอราคาและใบสั่งขาย
-- ไม่ต้องกรอกหมายเหตุ และ **ไม่บังคับเหตุผลเมื่อ admin อนุมัติใบที่ตัวเองสร้าง/ยื่น**
-- (เดิม 0127 บังคับ 10–500 ตัวอักษร ทั้งที่ระดับ CHECK และ RPC)
--
-- ยังบันทึกแถว override ทุกครั้งเหมือนเดิม (ใครอนุมัติใบตัวเอง เมื่อไหร่ contextSnapshot ครบ)
-- — เสียแค่ "เหตุผลเป็นข้อความ"; กติกาแยกหน้าที่ (non-admin ห้ามอนุมัติใบตัวเอง) ไม่เปลี่ยน
--
-- หมายเหตุ: ตาราง overrides มี guard ห้าม UPDATE/DELETE ระดับแถว — การ ALTER COLUMN/CONSTRAINT
-- เป็น DDL ไม่ผ่าน row trigger จึงทำได้ และแถวเดิมที่มีเหตุผลอยู่แล้วคงค่าไว้ทุกแถว.
-- Idempotent — รันซ้ำได้.

-- ── 1) sales_orders: ผ่อน CHECK ที่ผูก approvalMode กับความยาวเหตุผล ──
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_approval_mode_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_approval_mode_check CHECK (
    ("approvalMode" = 'standard' AND "approvalOverrideReason" IS NULL)
    OR
    ("approvalMode" = 'admin_override'
      AND ("approvalOverrideReason" IS NULL
           OR length(btrim("approvalOverrideReason")) BETWEEN 1 AND 500))
  );

-- ── 2) overrides.reason: nullable + ผ่อนความยาวขั้นต่ำ ──
ALTER TABLE public.document_signature_evidence_overrides
  ALTER COLUMN reason DROP NOT NULL;

-- ชื่อ CHECK เดิมมาจาก inline constraint ใน CREATE TABLE (0127:35-36) — เก็บกวาดทุกตัวที่คุม
-- ความยาว reason เพื่อไม่ต้องเดาชื่อ แล้วสร้างใหม่ที่ยอม NULL
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.document_signature_evidence_overrides'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%reason%'
      AND pg_get_constraintdef(oid) ILIKE '%btrim%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.document_signature_evidence_overrides DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.document_signature_evidence_overrides
  ADD CONSTRAINT document_signature_evidence_overrides_reason_check
  CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500);

-- ── 3) recreate approve RPC: เอา guard "ต้องมีเหตุผล" ออก ──
-- คัดลอกทั้งฟังก์ชันจากนิยามล่าสุด (0127:91-205) แล้วถอดเฉพาะ RAISE
-- signature_evidence_override_reason_required; guard อื่นคงเดิมทุกบรรทัด
-- (forbidden / approval_state_invalid / approval_stale / separation_required /
--  override_not_applicable / document_incomplete)
CREATE OR REPLACE FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_approval_note text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_separation_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_override_reason text := NULLIF(btrim(COALESCE(p_separation_override_reason, '')), '');
  v_self_approval boolean;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_document_not_found'; END IF;
  IF p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'ae_supervisor') THEN
    RAISE EXCEPTION 'signature_evidence_forbidden';
  END IF;
  IF v_order.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'signature_evidence_approval_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'signature_evidence_approval_stale';
  END IF;

  v_self_approval :=
    (v_order."createdBy" IS NOT NULL AND v_order."createdBy" = p_actor_id)
    OR
    (v_order."submittedBy" IS NOT NULL AND v_order."submittedBy" = p_actor_id);

  IF v_self_approval AND p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'signature_evidence_separation_required';
  END IF;
  -- เหตุผล override เป็น optional แล้ว (มติ 2026-07-25) — ส่งมาก็เก็บ ไม่ส่งก็ผ่าน
  IF NOT v_self_approval AND v_override_reason IS NOT NULL THEN
    RAISE EXCEPTION 'signature_evidence_override_not_applicable';
  END IF;

  IF v_order."orderDate" IS NULL
     OR NOT (v_order."actualAmount" > 0)
     OR v_order."projectId" IS NULL
     OR NULLIF(btrim(COALESCE(v_order."customerName", '')), '') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.quotations q
       WHERE q.id = v_order."quotationId"
         AND q."dealId" = v_order."dealId"
         AND q.status = 'accepted'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.sales_order_lines WHERE "salesOrderId" = p_order_id
     ) THEN
    RAISE EXCEPTION 'signature_evidence_document_incomplete';
  END IF;

  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'sales_order', v_order.id, v_order."orderNumber",
    p_document_fingerprint, 'salesOrder', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now
  );

  IF v_self_approval THEN
    INSERT INTO public.document_signature_evidence_overrides (
      "evidenceId", "salesOrderId", reason,
      "actorId", "actorName", "actorRole", "contextSnapshot", "createdAt"
    ) VALUES (
      v_evidence.id, v_order.id, v_override_reason,
      p_actor_id, p_actor_name, p_actor_role,
      jsonb_build_object(
        'createdBy', v_order."createdBy",
        'createdByName', v_order."createdByName",
        'submittedBy', v_order."submittedBy",
        'submittedByName', v_order."submittedByName",
        'expectedUpdatedAt', p_expected_updated_at,
        'approvalMode', 'admin_override'
      ),
      v_now
    );
  END IF;

  UPDATE public.sales_orders SET
    status = 'approved',
    "approvalFingerprint" = p_document_fingerprint,
    "approvedAt" = v_now,
    "approvedBy" = p_actor_id,
    "approvedByName" = p_actor_name,
    "approvalNote" = NULLIF(btrim(COALESCE(p_approval_note, '')), ''),
    "approvalMode" = CASE WHEN v_self_approval THEN 'admin_override' ELSE 'standard' END,
    "approvalOverrideReason" = CASE WHEN v_self_approval THEN v_override_reason ELSE NULL END,
    "signatureEvidenceId" = v_evidence.id,
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'document', to_jsonb(v_order),
    'evidence', to_jsonb(v_evidence),
    'approvalMode', CASE WHEN v_self_approval THEN 'admin_override' ELSE 'standard' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text, text, text
) TO service_role;

-- Rollback guidance:
-- 1) คืน CHECK 2 ตัวเป็นเวอร์ชัน 0127 (BETWEEN 10 AND 500) — ต้องไม่มีแถว override ที่
--    reason IS NULL ค้างอยู่ ไม่งั้น ADD CONSTRAINT จะล้ม (ต้องลบแถวนั้นด้วย force_delete)
-- 2) recreate RPC กลับเป็น 0127:91-205 (ใส่ RAISE override_reason_required คืน)
-- 3) ALTER COLUMN reason SET NOT NULL (เงื่อนไขเดียวกับข้อ 1)

NOTIFY pgrst, 'reload schema';
