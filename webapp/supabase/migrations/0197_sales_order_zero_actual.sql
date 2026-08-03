-- 0197 - ใบสั่งขาย: ยอดก่อน VAT 0 บาท ยื่นและอนุมัติได้
--
-- ต่อจาก 0196 (QT ยอด 0 ปิด Won ได้ — มติผู้ใช้ 2026-08-03): ถ้าฝั่ง SO ยังบังคับ
-- "actualAmount" > 0 ใบที่ปิด Won ด้วยยอด 0 จะเดินต่อไม่ได้เลย — สร้าง SO ได้แต่ยื่น
-- ไม่ได้ (signature_evidence_document_incomplete) กลายเป็นดีลที่ Won แล้วค้างกลางทาง
-- และ Actual ไม่มีวันถูกนับ.
--
-- ถอดเงื่อนไข `NOT (v_order."actualAmount" > 0)` ออกจากชุด "ความครบของเอกสาร" ของ
-- RPC สองตัว — เงื่อนไขอื่นในชุดเดียวกันคงเดิมทุกบรรทัด (ต้องมีวันที่ · ต้องมีโครงการ ·
-- ต้องมีชื่อลูกค้า · ต้องอ้าง QT ที่ accepted ของดีลเดียวกัน · ต้องมีบรรทัดสินค้า)
-- และด่านอื่นทั้งหมดคงเดิม (forbidden / state_invalid / stale / separation_required /
-- override_not_applicable):
--   * submit_sales_order_with_signature_evidence_atomic  — คัดจากนิยามล่าสุด 0153
--   * approve_sales_order_with_signature_evidence_atomic — คัดจากนิยามล่าสุด 0150
--
-- ปลายทางรับ 0 ได้อยู่แล้ว: trigger enforce_sales_order_actual_on_deal (0110) เขียน
-- wonValue = ผลรวม actualAmount ของ SO ที่อนุมัติแล้ว — ผลรวม 0 คือค่าที่ถูกต้อง.
--
-- Idempotent — รันซ้ำได้ (CREATE OR REPLACE ทั้งไฟล์ ไม่แตะลายเซ็นฟังก์ชัน).

-- ── 1) ยื่นอนุมัติ (คัดจาก 0153:15-92) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_sales_order_with_signature_evidence_atomic(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
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
  v_order public.sales_orders%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_document_not_found'; END IF;

  IF v_order.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'signature_evidence_submit_state_invalid';
  END IF;
  -- optimistic guard: ยกมาจาก .eq('status', before.status) เดิมให้แข็งขึ้นเป็น updatedAt
  -- (กันเคสแก้เนื้อหาจากอีกหน้าต่างแล้วยื่นทับ = หลักฐานผูก fingerprint ที่ไม่ตรงของจริง)
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'signature_evidence_approval_stale';
  END IF;

  -- ความครบของเอกสาร: ชุดเดียวกับที่ approve RPC ตรวจ — ยื่นของที่ไม่ครบไปให้หัวหน้า
  -- ตรวจไม่มีประโยชน์ และหลักฐานจะผูกกับเนื้อหาที่ยังใช้ไม่ได้
  -- (ยอด 0 ไม่นับว่า "ไม่ครบ" อีกต่อไป — มติ 2026-08-03)
  IF v_order."orderDate" IS NULL
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

  -- หลักฐานผู้จัดทำ: ตรึงลายเซ็น active + มาตรฐานเอกสารที่เผยแพร่ + fingerprint เนื้อหา
  -- signedAt = submittedAt = v_now ตัวเดียวกัน → วันที่บนเอกสารตรงกับเวลาที่ลงนามจริง
  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'sales_order', v_order.id, v_order."orderNumber",
    p_document_fingerprint, 'salesOrder', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now, 'proposer'
  );

  UPDATE public.sales_orders SET
    status = 'pending_approval',
    "submittedAt" = v_now,
    "submittedBy" = p_actor_id,
    "submittedByName" = p_actor_name,
    "proposerSignatureEvidenceId" = v_evidence.id,
    "rejectedAt" = NULL,
    "rejectedBy" = NULL,
    "rejectedByName" = NULL,
    "rejectionReason" = NULL,
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'document', to_jsonb(v_order),
    'evidence', to_jsonb(v_evidence)
  );
END;
$$;

-- หมายเหตุ: RPC นี้ไม่ตรวจสิทธิ์/scope ทีม (DB ไม่รู้ salesPlanningEditScope) — ชั้น API
-- ยังต้อง gate canEditSalesPlanning + inSalesEditScope เหมือนเดิม เช่นเดียวกับ approve RPC

REVOKE ALL ON FUNCTION public.submit_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sales_order_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text
) TO service_role;

-- ── 2) อนุมัติ (คัดจาก 0150:56-166) ──────────────────────────────────────────
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

  -- (ยอด 0 ไม่นับว่า "ไม่ครบ" อีกต่อไป — มติ 2026-08-03)
  IF v_order."orderDate" IS NULL
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

-- Rollback guidance: recreate ทั้งสองฟังก์ชันจาก 0153 / 0150 ตามลำดับ (ใส่บรรทัด
-- `OR NOT (v_order."actualAmount" > 0)` กลับเข้าไปในชุดความครบของเอกสาร) — SO ยอด 0
-- ที่อนุมัติไปแล้วจะยังอยู่และ Actual ยังเป็น 0 ตามเดิม ไม่มีอะไรต้องล้าง

NOTIFY pgrst, 'reload schema';
