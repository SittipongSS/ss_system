-- 0166 - แยก "ยกเลิกอนุมัติ" กับ "ออก Rev." ของใบสั่งขายเป็นสองขั้น (มติผู้ใช้ 2026-07-26).
--
-- เดิมเป็นปุ่มเดียว (revise_approved_sales_order_atomic ใน mig 0161): approved →
-- สร้าง Rev. ใหม่ + เปลี่ยนใบเดิมเป็น 'revised' ในคลิกเดียว. มติใหม่ให้แยกเป็นสองขั้น
-- เพราะการยกเลิกอนุมัติเป็นการกระทำที่มีน้ำหนักของตัวเอง — **ยอด Actual หลุดทันที**
-- ผู้ใช้ควรเห็นผลนั้นก่อน แล้วจึงตัดสินใจว่าจะออกฉบับใหม่อย่างไร
--
--   approved ──[ยกเลิกอนุมัติ]──► approval_revoked ──[ออก Rev.]──► revised + ร่างใหม่
--   Actual นับ                     Actual หลุด · อ่านอย่างเดียว        ร่างใหม่รออนุมัติ
--                                  ปุ่มเดียวคือ ออก Rev.
--
-- ⚠️ สถานะกลาง **ห้ามแก้เนื้อหาได้** — ไม่งั้นจะกลายเป็นช่องแก้ทับใบที่เคยอนุมัติ ซึ่งเป็น
-- สิ่งที่กติกา "หลังอนุมัติห้ามแก้ทับฉบับเดิม" ตั้งใจปิด. canEditSalesOrderContent รับเฉพาะ
-- draft/rejected อยู่แล้วจึงกันให้เองโดยไม่ต้องแก้
--
-- เหตุผลกรอกครั้งเดียวตอนยกเลิกอนุมัติ แล้วขั้นออก Rev. ใช้ค่าเดิมต่อ — เป็นเจตนาเดียว
-- ที่ถูกแบ่งเป็นสองคลิก ไม่ใช่สองเหตุการณ์ที่ไม่เกี่ยวกัน
--
-- Actual ไม่ต้องแตะเอง: sales_order_actual_trigger (0107/0108) รวมเฉพาะ status='approved'
-- ทุกครั้งที่แถวถูก UPDATE — ย้ายไป approval_revoked ยอดจึงหลุดเองอย่างถูกต้อง

-- ── 1) สถานะกลาง ────────────────────────────────────────────────────────────

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'rejected',
    'cancelled', 'revised', 'approval_revoked'
  ));

-- ── 2) ขั้นที่ 1: ยกเลิกอนุมัติ ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_sales_order_approval_atomic(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_actor_required';
  END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'sales_order_revision_forbidden';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  IF v_order.status <> 'approved' THEN
    RAISE EXCEPTION 'sales_order_revoke_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  IF v_order."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'sales_order_revision_exists';
  END IF;
  -- ด่านใบยื่นภาษีย้ายมาอยู่ขั้นนี้ เพราะนี่คือจุดที่ Actual หลุดจริง (เดิมอยู่ที่ขั้นออก Rev.)
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE "salesOrderId" = v_order.id
  ) THEN
    RAISE EXCEPTION 'sales_order_revision_filing_exists';
  END IF;

  UPDATE public.sales_orders
  SET
    status = 'approval_revoked',
    -- เหตุผลของ "เจตนาจะแก้" เก็บตั้งแต่ขั้นนี้ ขั้นออก Rev. ใช้ค่าเดิมต่อไม่ต้องถามซ้ำ
    "revisionReason" = v_reason,
    "revisedAt" = v_now,
    "revisedBy" = p_actor_id,
    "revisedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- trigger 0151 ล้าง pointer ลายเซ็นผู้อนุมัติ (สถานะไม่ใช่ approved แล้ว) — แถวหลักฐาน
  -- และ issued snapshot ของฉบับที่เคยอนุมัติยังอยู่ครบเป็นประวัติ ลบไม่ได้
  RETURN to_jsonb(v_order);
END;
$$;

-- ── 3) ขั้นที่ 2: ออก Rev. จากใบที่ยกเลิกอนุมัติแล้ว ──────────────────────────
-- นิยามคัดจาก 0161 ทั้งก้อน เปลี่ยน 3 จุด:
--   * สถานะต้นทาง 'approved' → 'approval_revoked'
--   * p_reason ว่างได้ → ใช้เหตุผลที่เก็บไว้ตอนยกเลิกอนุมัติ (กรอกครั้งเดียว)
--   * ด่านใบยื่นภาษีย้ายไปขั้นยกเลิกอนุมัติแล้ว (คงไว้เป็นตาข่ายชั้นสอง)

CREATE OR REPLACE FUNCTION public.revise_approved_sales_order_atomic(
  p_order_id text,
  p_revision_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source public.sales_orders%ROWTYPE;
  v_revision public.sales_orders%ROWTYPE;
  v_reason text;
  v_next_revision integer;
  v_order_number text;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_revision_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'sales_order_revision_forbidden';
  END IF;

  SELECT * INTO v_source
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  IF v_source.status <> 'approval_revoked' THEN
    RAISE EXCEPTION 'sales_order_revision_state_invalid';
  END IF;
  IF v_source."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  IF v_source."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'sales_order_revision_exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE "salesOrderId" = v_source.id
  ) THEN
    RAISE EXCEPTION 'sales_order_revision_filing_exists';
  END IF;

  -- เหตุผลกรอกไว้แล้วตอนยกเลิกอนุมัติ; ส่งมาใหม่ก็ได้ (ทับของเดิม)
  v_reason := btrim(COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), v_source."revisionReason", ''));
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT COALESCE(max("revisionNo"), 0) + 1
    INTO v_next_revision
  FROM public.sales_orders
  WHERE "baseNumber" = v_source."baseNumber";

  v_order_number := v_source."baseNumber"
    || COALESCE(v_source."revisionSeparator", '-')
    || v_next_revision::text;

  INSERT INTO public.sales_orders (
    id, "orderNumber", "baseNumber", "revisionNo", "revisionSeparator",
    "revisedFromId", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt",
    "approvalMode"
  ) VALUES (
    p_revision_id, v_order_number, v_source."baseNumber", v_next_revision,
    v_source."revisionSeparator", v_source.id, v_source."quotationId",
    v_source."dealId", v_source."projectId", v_source."customerId",
    v_source."customerName", 'draft',
    timezone('Asia/Bangkok', v_now)::date, v_source."paymentDueDate",
    v_source.subtotal, v_source."discountAmount", v_source."vatAmount",
    v_source."totalAmount", v_source."actualAmount", v_source.notes,
    COALESCE(v_source.metadata, '{}'::jsonb) || jsonb_build_object(
      'revisedFrom', v_source."orderNumber",
      'revisionReason', v_reason
    ),
    p_actor_id, NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_now, v_now,
    'standard'
  )
  RETURNING * INTO v_revision;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", unit, "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata, "createdAt"
  )
  SELECT
    'SOL-' || md5(p_revision_id || ':' || line.id),
    v_revision.id, line."quotationLineId", line."productId", line."fgCode",
    line.description, line.qty, line."unitPrice", line.unit,
    line."discountType", line."discountValue", line."discountAmount",
    line."lineTotal", line."sortOrder", line.metadata, v_now
  FROM public.sales_order_lines line
  WHERE line."salesOrderId" = v_source.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sales_order_revision_lines_required';
  END IF;

  UPDATE public.sales_orders
  SET
    status = 'revised',
    "supersededById" = v_revision.id,
    "revisionReason" = v_reason,
    "revisedAt" = COALESCE(v_source."revisedAt", v_now),
    "revisedBy" = COALESCE(v_source."revisedBy", p_actor_id),
    "revisedByName" = COALESCE(v_source."revisedByName", NULLIF(btrim(COALESCE(p_actor_name, '')), '')),
    "updatedAt" = v_now
  WHERE id = v_source.id
  RETURNING * INTO v_source;

  -- ทั้ง approval_revoked และ revised หลุดจาก sync_sales_order_actual อยู่แล้ว
  -- (นับเฉพาะ 'approved') ยอด Actual จึงไม่ขยับซ้ำที่ขั้นนี้
  RETURN jsonb_build_object(
    'source', to_jsonb(v_source),
    'revision', to_jsonb(v_revision)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_sales_order_approval_atomic(
  text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_sales_order_approval_atomic(
  text, timestamptz, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
