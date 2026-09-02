-- ============================================================
--  Migration 0340: ฉบับ Rev. ของใบสั่งขายต้องไม่ทิ้งข้อมูลที่ผูกไว้แล้ว
--
--  🐞 `revise_approved_sales_order_atomic` ก๊อปหัวใบด้วย **รายการคอลัมน์ที่เขียนไว้
--     ตายตัวตั้งแต่ 0166** ส่วนตาราง `sales_orders` โตขึ้นเรื่อย ๆ หลังจากนั้น
--     ⇒ ทุกคอลัมน์ที่เพิ่มหลัง 0166 หายไปเงียบ ๆ ทุกครั้งที่ออก Rev.
--     0326 เคยแตะฟังก์ชันนี้แล้ว แต่คอมเมนต์ของมันเขียนไว้เองว่า *"คัดลอกนิยามล่าสุด
--     (0166) มาทั้งก้อน + เพิ่ม serviceRounds"* ⇒ เติมเฉพาะของที่กำลังทำ ไม่ได้ไล่ทั้งชุด
--
--  ── เจ็ดคอลัมน์ที่เติมกลับ ────────────────────────────────────────────────
--   · `serviceContractId` (0324) — สัญญาบริการที่ครอบใบนี้ · หลุดแล้ว = ใบ Rev. เกิดมา
--     เป็น "ยังไม่ผูกสัญญา" ทุกครั้ง แล้วงานบริการทั้งเส้นติดด่านใหม่ทั้งที่สัญญามีอยู่จริง
--   · `docLanguage` (0295) — NOT NULL DEFAULT 'th' ⇒ Rev. ของใบภาษาอังกฤษกลับเป็นไทย
--     เงียบ ๆ ซึ่งเป็น**อาการเดียวกับที่ 0295 สร้างขึ้นมาเพื่อแก้** (ลูกค้าต่างชาติได้
--     ใบเสนอราคาอังกฤษ แล้วพอถึงใบสั่งขายกลับเป็นไทย)
--   · `referenceDoc` (0285) — ข้อความอิสระที่คนทำใบพิมพ์เอง · ทะเบียนค้นด้วยช่องนี้ด้วย
--   · `confirmDocType` / `confirmDocNo` / `confirmDocDate` / `confirmAttachments` (0285)
--     เอกสารยืนยันคำสั่งซื้อจากลูกค้า ซึ่งเป็น **ด่านของการยื่นอนุมัติ**
--     (`salesOrderConfirmationGate`) ⇒ ไม่ก๊อป = AE ต้องไปขอสลิป/PO ใบเดิมจากลูกค้ามา
--     แนบใหม่ทุกครั้งที่ออก Rev. ทั้งที่เป็นคำสั่งซื้อฉบับเดียวกัน
--     ⚠️ ปลอดภัยที่จะก๊อป: `confirmAttachments` เป็น jsonb ของ **ตัวไฟล์**
--        (storagePath/bucket) ไม่ใช่ id ของแถวใน `attachments` ⇒ ไม่มีการอ้างข้าม entity
--
--  ── ที่ **ไม่** ก๊อปต่อ และตั้งใจไม่ก๊อป ────────────────────────────────────
--   ร่องรอยของ *ใบเดิม* ที่ฉบับใหม่ต้องเริ่มใหม่ทั้งหมด:
--   ยื่น/อนุมัติ/ตีกลับ (`submitted*` `approved*` `rejected*` `approvalNote`
--   `approvalFingerprint` `approvalOverrideReason`) · ขั้นบัญชี (`finance*`) ·
--   ยกเลิก (`cancel*`) · ลายเซ็น (`signatureEvidenceId` `proposerSignatureEvidenceId`) ·
--   สายฉบับ (`supersededById` `revised*` `revisionReason` — ฟังก์ชันเซ็ตเองอยู่แล้ว) ·
--   `ownerId`/`ownerName` ของใบ (ไม่มีจอไหนอ่าน — เจ้าของงานอ่านจากดีล)
--
--  ⚠️ **ไม่มีข้อมูลให้ backfill** — ตรวจ production แล้วยังไม่มีใบ Rev. สักใบ
--     (`revisionNo > 0` = 0 แถว) ⇒ ใบนี้เป็น DDL ล้วน ไม่แตะแถวเดิม
--
--  ⚠️ **ต้องรันก่อน deploy** — โค้ดฝั่งแอปไม่ได้เปลี่ยนพฤติกรรมตรงนี้ แต่เทสต์ที่ล็อก
--     รายการคอลัมน์อ่านไฟล์ migration ⇒ ถ้าไม่รัน ฟังก์ชันบนฐานจะยังเป็นตัวเก่า
--     แล้ว Rev. ใบถัดไปก็ยังทิ้งข้อมูลเหมือนเดิมโดยไม่มีอะไรฟ้อง
--
--  idempotent: CREATE OR REPLACE ล้วน รันซ้ำได้
-- ============================================================

BEGIN;

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
    "confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments"
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
    COALESCE(v_source."confirmAttachments", '[]'::jsonb)
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
