-- ============================================================
--  Migration 0346: ออก Rev. ใบสั่งขายแล้ว **แผนงวดชำระต้องตามไปด้วย**
--  แผน docs/service-contract-phase-plan.md §9 ("🔴 ต้องปิดก่อน merge PR-C")
--
--  🐞 **บั๊กที่ปิดงานหน้างานทั้งเส้น** (สำรวจ 06/09/2026 · ยืนยันจากไฟล์จริง)
--    RPC `revise_approved_sales_order_atomic` INSERT แค่ `sales_orders` +
--    `sales_order_lines` ⇒ ใบ Rev. เกิดมาโดย **ไม่มีงวดชำระสักแถว**
--    ⇒ `paidThrough` (lib/sales/paymentCoverage.js) คืน `null`
--    ⇒ `coversDate` ตอบ false ⇒ ด่านเงินของ `visitGate` **บล็อกทุกโซนของไซต์นั้น**
--      ทั้งที่ลูกค้าจ่ายล่วงหน้าไปแล้วและมีสัญญาอยู่จริง
--    ⇒ TS ลงคิวช่างไม่ได้ทั้งใบ จนกว่าจะมีคนตั้งงวดใหม่ กรอกช่วงครอบใหม่ทุกงวด
--      แล้วให้บัญชีรับรองใหม่ทั้งชุด — งานพิมพ์ซ้ำล้วน ๆ ที่ไม่มีใครรู้ว่าต้องทำ
--
--  ⭐ **สิ่งที่ก๊อปคือ "แผน" ไม่ใช่ "เงิน"**
--    ก๊อป: ลำดับงวด · ชื่องวด · สัดส่วน % · วันกำหนดชำระ (SA พิมพ์เอง คำนวณแทนไม่ได้)
--          · **ช่วงครอบบริการ `coversFrom`/`coversTo`** (หัวใจของด่านเงิน) · หมายเหตุ
--    ไม่ก๊อป: สถานะ · หลักฐาน · วันที่จ่ายจริง · คนแจ้ง/คนรับรอง
--
--  🔴 **ทำไมไม่ก๊อปสถานะและหลักฐาน** — สองเหตุผลที่แยกกัน:
--    ① CHECK `sales_order_installments_draft_pending` (0259) บังคับว่า
--       แถวที่ยังไม่ freeze **ต้องเป็น `pending`** · ใบ Rev. เกิดมาเป็น `draft`
--       ⇒ ก๊อป `reported` มาก็ INSERT ไม่ผ่านตั้งแต่แรก
--    ② เหตุผลของ 0259 เอง: *ยอดของงวดร่างยังขยับได้ ⇒ หลักฐานที่แนบไว้จะผูกกับ
--       ตัวเลขที่กำลังจะถูกเขียนทับ* · ใบ Rev. คือใบที่ยอดกำลังจะเปลี่ยน
--    ⇒ เงินที่รับมาจริงยังอยู่ครบที่ใบเดิม (`revised`) ซึ่งอ่านย้อนได้ตลอด
--
--  ⚠️ **`amount` ก๊อปมาเป็นค่าตั้งต้นเท่านั้น** — คอลัมน์เป็น NOT NULL จึงต้องมีค่า
--    ตัวจริงถูกเขียนทับตอนอนุมัติใบ (`freezeInstallments` เขียน percent/amount/label
--    ใหม่จากยอดของใบ ณ วินาทีนั้น) และระหว่างเป็นร่าง จอเห็นค่าสดจาก `withLiveAmounts`
--    ⇒ ยอดที่ก๊อปมาไม่มีทางหลุดไปเป็นตัวเลขบนเอกสาร
--
--  ⚠️ **`freezeInstallments` ไม่แตะ `coversFrom`/`coversTo`** (ตรวจแล้ว) ⇒ ช่วงครอบ
--    ที่ก๊อปมารอดผ่านการอนุมัติ · บัญชีกดรับรองได้ทันทีโดยไม่ต้องให้ SA กรอกใหม่
--    🪤 แต่มันจะ **ลบงวดร่างทั้งชุดแล้วตั้งใหม่** เมื่อจำนวนงวดไม่ตรงกับแผนของ QT
--       (และไม่มีงวดไหนบันทึกเงินไว้) ⇒ ช่วงครอบที่ก๊อปมาจะหายไปด้วย
--       ที่นี่ไม่โดนเพราะก๊อปมาจากใบเดิมซึ่งงวดมาจากแผนของ QT ใบเดียวกัน จำนวนตรงเสมอ
--
--  🪤 **`billingRequestId` ไม่ก๊อป** — คำร้องขอใบวางบิลผูกกับงวดของใบเดิม
--    ก๊อป id มาแปลว่าสองงวดคนละใบชี้คำร้องใบเดียวกัน แล้วไม่มีใครรู้ว่าอันไหนของจริง
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy**
--    (ไม่รัน = RPC ตัวเก่ายังทำงาน ⇒ Rev. ยังไม่ก๊อปงวด · ไม่พังเพิ่ม แต่บั๊กยังอยู่)
-- ============================================================

BEGIN;

-- ── ทอด SO → SO Rev. (คัดจาก 0343 ทั้งก้อน + ก้อนงวดชำระท้ายสุด) ──────────
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
    "approvalMode",
    -- ── เติม 2026-09-02 (0340) — เจ็ดคอลัมน์ที่ตกหล่นสะสมมาตั้งแต่ 0166 ──────
    "serviceContractId", "docLanguage", "referenceDoc",
    "confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments",
    -- ── เติม 2026-09-03 (0343) — คู่ภาษาอังกฤษของชื่อ/ที่อยู่ ────────────────
    -- ไม่ก๊อป = Rev. ของใบภาษาอังกฤษถอยไปพิมพ์ไทยเงียบ ๆ ทั้งที่ต้นฉบับพิมพ์อังกฤษได้
    "customerNameEn", "billingAddressEn", "shippingAddressEn"
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
    'standard',
    v_source."serviceContractId", v_source."docLanguage", v_source."referenceDoc",
    v_source."confirmDocType", v_source."confirmDocNo", v_source."confirmDocDate",
    COALESCE(v_source."confirmAttachments", '[]'::jsonb),
    v_source."customerNameEn", v_source."billingAddressEn", v_source."shippingAddressEn"
  )
  RETURNING * INTO v_revision;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", unit, "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata, "createdAt", "serviceRounds"
  )
  SELECT
    'SOL-' || md5(p_revision_id || ':' || line.id),
    v_revision.id, line."quotationLineId", line."productId", line."fgCode",
    line.description, line.qty, line."unitPrice", line.unit,
    line."discountType", line."discountValue", line."discountAmount",
    line."lineTotal", line."sortOrder", line.metadata, v_now, line."serviceRounds"
  FROM public.sales_order_lines line
  WHERE line."salesOrderId" = v_source.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sales_order_revision_lines_required';
  END IF;

  /* ── เติม 2026-09-06 (0346) — แผนงวดชำระ ────────────────────────────────
     🔴 **ก้อนนี้คือของที่ขาดไปตั้งแต่ 0166** · ไม่มีมัน = ใบ Rev. ของงานบริการ
       เกิดมาโดยไม่มีงวด ⇒ `paidThrough` เป็น null ⇒ ด่านเงินบล็อกนัดทั้งไซต์

     ⚠️ **`status` บังคับ `pending` และไม่ประทับ `frozenAt`** — CHECK ของ 0259
       บังคับไว้ และเหตุผลของมันใช้กับใบ Rev. เต็ม ๆ (ยอดกำลังจะเปลี่ยน)
     ⚠️ **id เป็น md5 ของ (ใบใหม่ : งวดเดิม)** — แพตเทิร์นเดียวกับบรรทัดขายข้างบน
       ⇒ รันซ้ำได้ผลเดิม ไม่เกิดแถวซ้ำ (RPC ทั้งตัวกันด้วย `supersededById` อยู่แล้ว
       แต่ id ที่เดาได้ทำให้ตามรอยย้อนได้ว่าแถวไหนมาจากงวดไหน)
     ⚠️ ใบที่ยังไม่เคยมีงวด (ใบเก่าก่อน mig 0245) ก๊อปแล้วได้ศูนย์แถว — ถูกต้องแล้ว
       `ensureInstallments` จะตั้งให้เองตอนอนุมัติเหมือนเดิม */
  INSERT INTO public.sales_order_installments (
    id, "salesOrderId", seq, label, percent, amount,
    "dueDate", "coversFrom", "coversTo", status, note,
    "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    'SOI-' || md5(p_revision_id || ':' || inst.id),
    v_revision.id, inst.seq, inst.label, inst.percent, inst.amount,
    inst."dueDate", inst."coversFrom", inst."coversTo", 'pending', inst.note,
    p_actor_id, NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_now, v_now
  FROM public.sales_order_installments inst
  WHERE inst."salesOrderId" = v_source.id;

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

REVOKE ALL ON FUNCTION public.revise_approved_sales_order_atomic(
  text, text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_approved_sales_order_atomic(
  text, text, timestamptz, text, text, text, text
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
