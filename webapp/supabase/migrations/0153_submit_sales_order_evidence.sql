-- 0153 - ยื่นอนุมัติใบสั่งขาย = การลงนามของผู้จัดทำ (บันทึกหลักฐาน atomic)
--
-- ที่มา: ช่อง "ผู้จัดทำ" บนเอกสารแสดงแค่รูป+ชื่อ (stamp เชิงภาพจากลายเซ็น active) ไม่มีวันที่
-- และ Evidence เพราะไม่มีจุดที่ถือว่า "ลงนาม" จริง. มติผู้ใช้ 2026-07-25: ให้การกดยื่นอนุมัติ
-- เป็น explicit signing action → บันทึก evidence บทบาท proposer (mig 0151) พร้อมกันในทรานแซกชันเดียว
--
-- เดิม submit เป็น plain UPDATE ในแอป (sales-orders/[id]/route.js) — ถ้าเก็บ evidence แยก
-- คำสั่งจะมีช่วงที่สถานะเปลี่ยนแต่หลักฐานยังไม่เกิด (หรือกลับกัน) จึงต้องยกมาเป็น RPC
--
-- ⚠️ ผลข้างเคียงที่ตั้งใจ: **ผู้ยื่นต้องมีลายเซ็นในบัญชี** ไม่งั้น capture โยน
--    signature_evidence_signature_required → ทั้งทรานแซกชัน rollback (สถานะไม่เปลี่ยน)
--    ต้องปิดรายงาน cohort ให้ทีมอัปลายเซ็นครบก่อน deploy (PR #706)
-- Idempotent — รันซ้ำได้ (CREATE OR REPLACE ทั้งไฟล์)

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

  -- ความครบของเอกสาร: ชุดเดียวกับที่ approve RPC ตรวจ (0127:143-158) — ยื่นของที่ไม่ครบ
  -- ไปให้หัวหน้าตรวจไม่มีประโยชน์ และหลักฐานจะผูกกับเนื้อหาที่ยังใช้ไม่ได้
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

-- Rollback guidance:
-- 1) เปลี่ยน action submit ในแอปกลับไปเป็น plain UPDATE (ไม่บังคับลายเซ็นตอนยื่น)
-- 2) DROP FUNCTION submit_sales_order_with_signature_evidence_atomic(...)
-- 3) แถว evidence บทบาท proposer ที่เกิดแล้วคงอยู่เป็นประวัติ (ลบไม่ได้ ยกเว้น force delete
--    ของ mig 0152) และ pointer proposerSignatureEvidenceId ยังชี้ได้ปกติ — ไม่ต้องล้าง

NOTIFY pgrst, 'reload schema';
