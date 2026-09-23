-- ============================================================
--  Migration 0376: ออก Rev. ใบสั่งขาย = **ย้าย** งวดชำระไปใบ Rev. ทั้งแถว (ไม่ก๊อป)
--                  (แผน so-payment-unlock-replan PR1 · มติเจ้าของ 23/09/2026 · D2/D3 รับค่าที่เสนอ)
--
--  ⭐ หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว"
--    · แถวงวดย้ายตามใบที่ยังใช้งานอยู่ ห้ามก๊อปเป็นแถวที่สอง · ทุกการย้ายบันทึกใน "movedFrom" ของแถว
--    · ยอด/หลักฐาน/ใบกำกับ/คำร้องวางบิล/ช่วงครอบของแถวที่มีเงินไม่เปลี่ยนเด็ดขาด
--    · Σ amount ทุกงวด = sales_orders."totalAmount" (±0.005)
--
--  🐞 **ของเดิม (0346 → ยกมาใน 0363) ก๊อปงวดเป็นแถวใหม่สถานะ pending**
--    ⇒ งวดที่บัญชีรับรองแล้วบนใบเดิมกลายเป็น "รอชำระ" บนใบ Rev. ⇒ ฝ่ายขายแจ้งสลิปเดิมซ้ำ บัญชีรับรองซ้ำ
--      = เงินก้อนเดียวสองแถว (ทะเบียนบัญชีนับซ้ำ) · เหตุที่ย้อนการอนุมัติถูกล็อกทั้งใบเมื่อมีงวดรับเงินแล้ว
--      (paymentLockReason) ⇒ ใบที่รับเงินแล้วแก้เอกสารไม่ได้เลย (คำขอ A ของเจ้าของ)
--    ⇒ ไฟล์นี้เปลี่ยนก้อนงวดของ RPC ออก Rev. เป็น UPDATE "salesOrderId" ของแถวเดิม — บัญชีไม่ต้องรับรองซ้ำ
--      และโค้ด JS รอบเดียวกันปลดด่าน paymentLockReason ออกจาก "ย้อนการอนุมัติ" (ยกเลิกยังล็อกจนถึง PR3)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) sales_order_installments."movedFrom" jsonb NOT NULL DEFAULT '[]' + CHECK เป็นอาเรย์
--     รูปของหนึ่งรายการ: {salesOrderId, orderNumber, quotationId, reason:'revision', movedAt, byId, byName}
--     · ด่านอ่านไฟล์หลักฐาน (payment-file) ยอมรับ path ใต้โฟลเดอร์ของใบ/QT ที่แถวเคยอยู่ผ่านคอลัมน์นี้
--     · PR3 (ยกเงินจากใบที่ยกเลิก) ต่อท้ายด้วย reason 'carry' ในคอลัมน์เดียวกัน
--  2) revise_approved_sales_order_atomic (ลายเซ็นเดิม) — คัดจาก 0363 ทุกตัวอักษร ยกเว้นสองก้อน
--     (เทสต์ salesOrderRevisionCarry เทียบทีละตัวอักษร):
--     · ก้อน "แผนงวดชำระ" (INSERT … SELECT ของ 0346) ⇒ ล็อกงวดของใบต้นทาง FOR UPDATE → Σ ≠ ยอดใบ = RAISE
--       'sales_order_revision_installments_mismatch' → UPDATE ย้ายทุกสถานะ + ต่อท้าย movedFrom + updatedAt
--     · RETURN เพิ่ม 'moved' = {count, confirmedCount, confirmedAmount, reportedCount, reportedAmount, openAmount}
--       (route ใช้ทำสรุป audit · ไม่มีคีย์นี้ = ฐานยังไม่ได้รันไฟล์นี้ ⇒ route ใส่ warning)
--  3) สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated · GRANT service_role (เหมือน 0363)
--
--  ⭐ อนุมัติใบ Rev. ภายหลัง: freezeInstallments เห็นทุกแถวตรึงยอดแล้ว ⇒ ไม่เขียนอะไร (PR0) · financeStatus ของใบ
--     Rev. เกิดเป็น NULL (ไม่สืบจากใบเดิม) ⇒ อนุมัติแล้วเป็น pending = กลับเข้าคิวให้บัญชีปิดใหม่ (มติ D2)
--  ⭐ ระหว่างใบถูกย้อนการอนุมัติ/ใบ Rev. ยังเป็นร่าง แจ้งชำระ+รับรองงวดได้ตามปกติ (มติ D3) — แถวตรึงยอดแล้ว
--
--  ⛔ ไม่แตะ: sales_orders / quotations / sales_order_lines นอกจากที่ 0363 ทำอยู่แล้ว ⇒ ยอด Actual และเดือน Actual
--     ไม่ขยับจากไฟล์นี้ · CHECK/index ของงวด (0245 · 0259 · 0260 · 0320 · 0348 · 0374) · trigger ใด ๆ
--  ⛔ ไม่ backfill — ณ 23/09 ใบ revised = 0 และ approval_revoked = 0 (วัดจาก prod) · Σ งวด ≠ ยอดใบ = 0 ใบ
--  🔐 ฟังก์ชันไม่ใช่ SECURITY DEFINER (เหมือน 0363) — service_role เรียกผ่าน route เท่านั้น
--
--  🛑 **รันก่อน deploy โค้ด JS ของ PR1** — โค้ดใหม่ปลดด่านย้อนการอนุมัติ ถ้า RPC ยังเป็นตัวก๊อป
--     เงินที่รับแล้วจะถูกก๊อปเป็นงวดค้างรับบนใบ Rev. (นับซ้ำ + ยืมสลิปซ้ำ)
--     · route ย้อนการอนุมัติถามคอลัมน์ "movedFrom" ก่อน (limit 0) — ไม่มี = ตอบ 503 ไม่ย้อนให้
--     · route ออก Rev. ใส่ warning เมื่อผลลัพธ์ไม่มี 'moved'
--     · รันแล้วโค้ดที่ deploy อยู่ยังทำงานได้: คอลัมน์ใหม่มีค่าตั้งต้น · ลายเซ็น RPC เดิม · ปุ่มย้อนการอนุมัติของโค้ดเดิม
--       ยังล็อกใบที่มีเงินรับแล้วอยู่ (ใบที่ไม่มีเงินรับแล้ว ย้ายแถวที่ยังไม่รับเงินไปใบ Rev. — ปลอดภัยกว่าก๊อป)
--     · CI check:columns แดงจนกว่าจะรัน (payment-file · route ย้อนการอนุมัติ เลือกคอลัมน์ "movedFrom")
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE FUNCTION)
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ROLLBACK คืนทุกอย่างรวมใบ Rev. ที่สร้าง) ───────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายไฟล์ด้วยบล็อกข้างล่าง (ตัด BEGIN; บรรทัดแรกทิ้ง)
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อกข้างล่างทั้งก้อน
--  แทนค่า <...> ก่อนรัน: <SO> = id ของใบจาก SELECT แรก (ใบ pipeline ที่อนุมัติแล้ว มีงวด ไม่มีใบยื่นภาษี) ·
--  <adminId> = id ผู้ใช้ admin (จาก Auth) · ใบเกิด error กลางทาง = ทรานแซกชันล้มทั้งก้อน
--
--   BEGIN;
--   SELECT o.id, o."orderNumber", o."totalAmount", count(i.*) AS rows, sum(i.amount) AS total,
--          count(*) FILTER (WHERE i.status = 'confirmed') AS confirmed
--     FROM public.sales_orders o JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
--    WHERE o.status = 'approved' AND o.origin = 'pipeline' AND o."supersededById" IS NULL
--      AND NOT EXISTS (SELECT 1 FROM public.orders f WHERE f."salesOrderId" = o.id)
--    GROUP BY o.id ORDER BY confirmed DESC, o."createdAt" DESC LIMIT 5;
--   CREATE TEMP TABLE smoke_0376 ON COMMIT DROP AS
--     SELECT id, status, amount, "frozenAt", evidence, "taxInvoiceNo", "billingRequestId", "coversTo"
--       FROM public.sales_order_installments WHERE "salesOrderId" = '<SO>';
--   SELECT public.revoke_sales_order_approval_atomic('<SO>',
--     (SELECT "updatedAt" FROM public.sales_orders WHERE id = '<SO>'),
--     'smoke 0376 ทดสอบย้ายงวด', '<adminId>', 'smoke 0376', 'admin') ->> 'status';     -- คาด approval_revoked
--   SELECT public.revise_approved_sales_order_atomic('<SO>', 'SOR-smoke0376',
--     (SELECT "updatedAt" FROM public.sales_orders WHERE id = '<SO>'),
--     NULL, '<adminId>', 'smoke 0376', 'admin') -> 'moved';               -- count = rows · confirmedCount = confirmed
--   SELECT count(*) FROM public.sales_order_installments WHERE "salesOrderId" = '<SO>';        -- 0
--   SELECT count(*) FROM public.sales_order_installments i JOIN smoke_0376 s USING (id)
--    WHERE i."salesOrderId" = 'SOR-smoke0376' AND i.status = s.status AND i.amount = s.amount
--      AND i."frozenAt" IS NOT DISTINCT FROM s."frozenAt" AND i.evidence = s.evidence
--      AND i."taxInvoiceNo" IS NOT DISTINCT FROM s."taxInvoiceNo"
--      AND i."billingRequestId" IS NOT DISTINCT FROM s."billingRequestId"
--      AND i."coversTo" IS NOT DISTINCT FROM s."coversTo"
--      AND i."movedFrom" -> -1 ->> 'salesOrderId' = '<SO>';                    -- = rows (ทุกแถวย้ายครบ ไม่เปลี่ยนรูป)
--   SELECT status, "financeStatus" FROM public.sales_orders WHERE id = 'SOR-smoke0376';        -- draft · null
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'sales_order_installments' AND column_name = 'movedFrom';
--                                                        -- jsonb · NO · '[]'::jsonb
--   SELECT conname FROM pg_constraint WHERE conname = 'sales_order_installments_moved_from_array';   -- 1 แถว
--   SELECT count(*) FROM public.sales_order_installments WHERE "movedFrom" <> '[]'::jsonb;         -- 0 (ไม่ backfill)
--   SELECT position('sales_order_revision_installments_mismatch' IN pg_get_functiondef(
--     'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)'::regprocedure)) > 0;  -- true
--   SELECT r.role, has_function_privilege(r.role,
--     'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)', 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role);     -- false · false · true
--   แล้วรัน `npm run check:columns` ในเครื่อง (ต้องเขียวก่อน deploy โค้ด JS)
-- ============================================================

BEGIN;

-- ── 1) ร่องรอยการย้ายของแถวงวด ──────────────────────────────────────────────────
-- ต่อท้ายเสมอ ห้ามทับ (แถวหนึ่งย้ายได้หลายทอด: Rev. ซ้อน Rev. · PR3 ยกเงินจากใบที่ยกเลิก)
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "movedFrom" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sales_order_installments
  DROP CONSTRAINT IF EXISTS sales_order_installments_moved_from_array;
ALTER TABLE public.sales_order_installments
  ADD CONSTRAINT sales_order_installments_moved_from_array CHECK (jsonb_typeof("movedFrom") = 'array');

COMMENT ON COLUMN public.sales_order_installments."movedFrom" IS
  'ประวัติการย้ายแถวงวดนี้ข้ามใบ (0376) — [{salesOrderId, orderNumber, quotationId, reason: revision|carry, movedAt, byId, byName}] ต่อท้ายเสมอ · ด่านอ่านไฟล์หลักฐานยอมรับโฟลเดอร์ของใบ/QT ที่อยู่ในนี้ · [] = ไม่เคยย้าย';

-- ── 2) ทอด SO → SO Rev. (ยกจาก 0363 ทั้งก้อน · ก้อนงวดชำระเปลี่ยนจากก๊อปเป็นย้าย · RETURN เพิ่ม moved) ──
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
    "customerNameEn", "billingAddressEn", "shippingAddressEn",
    -- ── เติม 2026-09-17 (0363) — กำหนดส่งสินค้าเดินตามไปกับ Rev. ใหม่ ────────
    -- ไม่ก๊อป = ออก Rev. แล้ววันส่งที่ตกลงกับลูกค้าหายเงียบ ๆ
    "deliveryDueDate"
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
    v_source."customerNameEn", v_source."billingAddressEn", v_source."shippingAddressEn",
    v_source."deliveryDueDate"
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

  /* ── 0376 · แผนงวดชำระ **ย้ายทั้งแถว** ไปใบ Rev. (แทนก้อน "ก๊อปงวด" ของ 0346 ที่ 0363 ยกมา) ─────────
     ⭐ หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว" (แผน so-payment-unlock-replan PR1 · มติเจ้าของ 23/09)
     🐞 ของเดิมก๊อปงวดเป็นแถวใหม่สถานะ pending ⇒ งวดที่บัญชีรับรองแล้วบนใบเดิมกลายเป็นงวดค้างรับบนใบ Rev.
       (แจ้งสลิปเดิมซ้ำ + รับรองซ้ำ = เงินก้อนเดียวสองแถว)
     ⭐ ย้ายทุกสถานะ · id/seq/ยอด/frozenAt/หลักฐาน/คนแจ้ง/คนรับรอง/ใบกำกับ/คำร้องวางบิล/ช่วงครอบ/ชนิดงวดคงเดิม
       ⇒ บัญชีไม่ต้องรับรองซ้ำ · "จ่ายถึง" ของใบ Rev. เท่าของเดิมทันทีที่ใบ Rev. อนุมัติ
       ⇒ CHECK ของงวด (0245 · 0259 · 0320 · 0348 · 0374) ผ่านเอง — รูปแถวไม่เปลี่ยน เปลี่ยนแค่เจ้าของ
     ⭐ ร่องรอยต่อท้าย "movedFrom" (ไม่ทับ) — ด่านอ่านไฟล์หลักฐานยอมรับ path ใต้โฟลเดอร์ของใบเดิมผ่านตัวนี้
     ⚠️ ล็อกแถวก่อน แล้วตรวจ Σ = ยอดใบ (±0.005) — ใบ Rev. ยกยอดของใบเดิมทั้งก้อน (บรรทัดคัดมาทั้งดุ้น)
       ⇒ ชุดที่ไม่เท่ายอดใบคือข้อมูลที่ผิดอยู่แล้ว ย้ายไปก็ได้ใบ Rev. ที่แผนผิด (freezeInstallments ไม่แก้ให้)
     ⚠️ ใบที่ไม่มีงวด (ใบก่อน 0245) ย้ายศูนย์แถว — ถูกต้องแล้ว ensureInstallments ตั้งให้ตอนอนุมัติเหมือนเดิม
     ⚠️ "updatedAt" ของแถวขยับ ⇒ หน้าต่างที่เปิดค้างไว้ได้ 409 แล้วโหลดใหม่ (optimistic lock ของ PR0) */
  PERFORM 1 FROM public.sales_order_installments inst
   WHERE inst."salesOrderId" = v_source.id
   FOR UPDATE;
  IF FOUND AND abs(
    (SELECT COALESCE(sum(inst.amount), 0) FROM public.sales_order_installments inst
      WHERE inst."salesOrderId" = v_source.id)
    - COALESCE(v_source."totalAmount", 0)
  ) >= 0.005 THEN
    RAISE EXCEPTION 'sales_order_revision_installments_mismatch';
  END IF;

  UPDATE public.sales_order_installments
  SET
    "salesOrderId" = v_revision.id,
    "movedFrom" = "movedFrom" || jsonb_build_array(jsonb_build_object(
      'salesOrderId', v_source.id,
      'orderNumber', v_source."orderNumber",
      'quotationId', v_source."quotationId",
      'reason', 'revision',
      'movedAt', v_now,
      'byId', p_actor_id,
      'byName', NULLIF(btrim(COALESCE(p_actor_name, '')), '')
    )),
    "updatedAt" = v_now
  WHERE "salesOrderId" = v_source.id;

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
    'revision', to_jsonb(v_revision),
    /* 0376 — ผลการย้ายงวด นับจากแถวที่อยู่บนใบ Rev. จริง (ใบเพิ่งเกิดในทรานแซกชันนี้ ⇒ มีแต่แถวที่ย้ายมา)
       route ใช้ทำสรุป audit · openAmount = งวดที่ยังไม่มีเงิน (pending/rejected) */
    'moved', (
      SELECT jsonb_build_object(
        'count', count(*),
        'confirmedCount', count(*) FILTER (WHERE inst.status = 'confirmed'),
        'confirmedAmount', COALESCE(sum(inst.amount) FILTER (WHERE inst.status = 'confirmed'), 0),
        'reportedCount', count(*) FILTER (WHERE inst.status = 'reported'),
        'reportedAmount', COALESCE(sum(inst.amount) FILTER (WHERE inst.status = 'reported'), 0),
        'openAmount', COALESCE(sum(inst.amount) FILTER (WHERE inst.status IN ('pending', 'rejected')), 0)
      )
      FROM public.sales_order_installments inst
      WHERE inst."salesOrderId" = v_revision.id
    )
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
