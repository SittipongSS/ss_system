-- ============================================================
--  Migration 0326 (M3 ของเฟสสัญญาบริการ): จำนวนรอบบริการที่ขายไว้ต่อบรรทัด
--                                          (มติผู้ใช้ 2026-08-27 · ทางเข้าเคาะ 2026-08-31)
--
--  คำสั่งตั้งต้น: *"มากับแพ็คเกจตอนขาย (SA ระบุเช่น 12 รอบ/ปี) — TS เห็นรอบบริการ"*
--
--  ⭐ **กรอกที่ใบเสนอราคา ไม่ใช่ใบสั่งขาย** (มติผู้ใช้ 2026-08-31) — แผนเดิมเขียนว่า
--  กรอกที่ฟอร์มสร้าง SO แต่ **บรรทัดใบสั่งขายแก้ไม่ได้ทั้งระบบ**: มันคือ snapshot ที่
--  RPC ก๊อปจาก quotation_lines ตอนสร้างใบ (ฟอร์มสร้างเขียนไว้เองว่า "คัดลอกจาก QT
--  ตอนสร้าง แก้ที่นี่ไม่ได้" · หน้ารายละเอียดใช้ QuotationReadOnlyLineItems)
--  ⇒ ที่เก็บอยู่ทั้งสองตาราง แต่ **ต้นทางที่คนพิมพ์คือใบเสนอราคาที่เดียว**
--  แก้ตัวเลข = ออก Rev. ที่ใบเสนอราคา ตามกฎเดิมของบรรทัดทั้งระบบ
--
--  ⭐ **เก็บที่บรรทัด ไม่ใช่ที่ใบ** — ใบเดียวขายได้หลายแพ็คเกจที่รอบไม่เท่ากัน
--  (เช่น เครื่องโถงกลาง 12 รอบ/ปี + ห้องน้ำ 6 รอบ/ปี) ⇒ เก็บที่ใบจะตอบไม่ได้ว่ารอบไหน
--  ของแพ็คไหน · บรรทัดคือหน่วยที่ TS เอาไปจัดสรรลงโซนอยู่แล้ว (service_zone_terms)
--
--  ⚠️ **เป็นข้อผูกพันอ้างอิง ไม่ใช่ตัวบังคับ** (มติผู้ใช้) — planGen ไม่อ่านค่านี้มา
--  บังคับจำนวนนัด · รอบจริงเลื่อน/งด/แถมได้ตามหน้างาน · ตัวเลขนี้ไว้ตอบว่า
--  "ขายไว้กี่รอบ" เวลาเทียบกับที่ทำไปแล้ว และเป็นฐานของยอดที่คุยกับลูกค้า
--
--  ⚠️ NULL = **ยังไม่ระบุ** ไม่ใช่ศูนย์ — บรรทัดสายสินค้าไม่มีรอบอยู่แล้ว และใบเก่า
--  ทั้งหมดจะเป็น NULL ซึ่งถูกต้อง · CHECK จึงยอม NULL แต่ห้าม 0/ติดลบ
--  (0 รอบ = ขายบริการที่ไม่ต้องไปเลย ซึ่งไม่มีความหมาย)
--
--  ⛔ **ค่านี้ไม่เข้า approvalFingerprint ของใบเสนอราคา** (quotationApprovalFingerprint.js)
--  เหตุผลเดียวกับ docLanguage: fingerprint ของใบที่อนุมัติไปแล้วถูกตรึงไว้ในคอลัมน์
--  บน production ⇒ เพิ่มคีย์ใหม่เข้าไปวันนี้ = ใบที่อนุมัติแล้วทุกใบกลายเป็น
--  "เนื้อหาเปลี่ยนหลังอนุมัติ" พร้อมกันทั้งระบบ
--
--  ── ของที่ต้องแก้พร้อมกันเพราะบรรทัดถูกก๊อปสี่ทอด ─────────────────────────
--  QT (save) → QT Rev. → SO (create) → SO Rev. · ทอดไหนลืมใส่ ตัวเลขหายเงียบทอดนั้น
--    1. save_quotation_content            — บันทึกใบเสนอราคา (นิยามล่าสุด: 0267)
--    2. create_sales_order_draft          — QT → SO           (นิยามล่าสุด: 0285)
--    3. revise_approved_sales_order_atomic — SO → SO Rev.     (นิยามล่าสุด: 0166)
--    4. quotations/[id]/revise/route.js   — QT → QT Rev. (ฝั่ง JS · อยู่ในคอมมิตเดียวกัน)
--  ทั้งสามนิยามข้างล่างถูก **สกัดจากไฟล์ต้นทางด้วยสคริปต์** แล้วเติม "serviceRounds"
--  จุดเดียวต่อก้อน — ไม่ได้พิมพ์ใหม่ด้วยมือ (กันบั๊กคอลัมน์หายตอนคัดลอก mig 0124/0244)
--
--  🛑 **ต้องรันก่อน deploy** — master_row_assignments/PostgREST ทิ้งคีย์ที่ยังไม่มี
--  คอลัมน์เงียบ ๆ ไม่ error ⇒ deploy ก่อนรัน = SA กรอกจำนวนรอบแล้วค่าหายโดยไม่มีใครรู้
--  รันซ้ำได้ (idempotent)
-- ============================================================

BEGIN;

ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS "serviceRounds" integer;
ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS "serviceRounds" integer;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotation_lines_service_rounds_positive') THEN
    ALTER TABLE public.quotation_lines
      ADD CONSTRAINT quotation_lines_service_rounds_positive
      CHECK ("serviceRounds" IS NULL OR "serviceRounds" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_lines_service_rounds_positive') THEN
    ALTER TABLE public.sales_order_lines
      ADD CONSTRAINT sales_order_lines_service_rounds_positive
      CHECK ("serviceRounds" IS NULL OR "serviceRounds" > 0);
  END IF;
END $mig$;

COMMENT ON COLUMN public.quotation_lines."serviceRounds" IS
  'จำนวนรอบบริการที่ขายไว้ในบรรทัดนี้ (มติผู้ใช้ 2026-08-27) — ต้นทางที่คนพิมพ์ · ไหลไปที่ sales_order_lines ตอนสร้างใบสั่งขาย · NULL = ยังไม่ระบุ/ไม่ใช่งานบริการ';
COMMENT ON COLUMN public.sales_order_lines."serviceRounds" IS
  'จำนวนรอบบริการที่ขายไว้ในบรรทัดนี้ — snapshot ที่ก๊อปมาจากบรรทัดใบเสนอราคา แก้ที่นี่ไม่ได้ (แก้ = ออก Rev. ที่ QT) · ข้อผูกพันอ้างอิง ไม่ได้บังคับจำนวนนัดที่ระบบสร้าง';

-- ── 1/3 · save_quotation_content ─────────────────────────────────────────
-- คัดลอกนิยามล่าสุด (0267) มาทั้งก้อน + เพิ่ม "serviceRounds" ที่ส่วน quotation_lines
-- ส่วน UPDATE public.quotations (whitelist คอลัมน์บนหัวใบ) คงเดิมทุกตัวอักษร
CREATE OR REPLACE FUNCTION public.save_quotation_content(
  p_quote_id text,
  p_content jsonb,
  p_lines jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_before public.quotations%ROWTYPE;
  v_after public.quotations%ROWTYPE;
  v_line_count integer;
BEGIN
  SELECT * INTO v_before FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_before.status NOT IN ('draft', 'sent', 'rejected') THEN
    RAISE EXCEPTION 'quotation_read_only';
  END IF;
  IF p_content ? 'status' AND p_content->>'status' NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'quotation_status_transition_invalid';
  END IF;

  UPDATE public.quotations q SET
    "quoteDate" = CASE WHEN p_content ? 'quoteDate' THEN (p_content->>'quoteDate')::date ELSE q."quoteDate" END,
    "validUntil" = CASE WHEN p_content ? 'validUntil' THEN NULLIF(p_content->>'validUntil', '')::date ELSE q."validUntil" END,
    "paymentTerms" = CASE WHEN p_content ? 'paymentTerms' THEN NULLIF(p_content->>'paymentTerms', '') ELSE q."paymentTerms" END,
    notes = CASE WHEN p_content ? 'notes' THEN NULLIF(p_content->>'notes', '') ELSE q.notes END,
    status = CASE WHEN p_content ? 'status' THEN p_content->>'status' ELSE q.status END,
    subtotal = CASE WHEN p_content ? 'subtotal' THEN (p_content->>'subtotal')::numeric ELSE q.subtotal END,
    "vatAmount" = CASE WHEN p_content ? 'vatAmount' THEN (p_content->>'vatAmount')::numeric ELSE q."vatAmount" END,
    "totalAmount" = CASE WHEN p_content ? 'totalAmount' THEN (p_content->>'totalAmount')::numeric ELSE q."totalAmount" END,
    "discountType" = CASE WHEN p_content ? 'discountType' THEN NULLIF(p_content->>'discountType', '') ELSE q."discountType" END,
    "discountValue" = CASE WHEN p_content ? 'discountValue' THEN (p_content->>'discountValue')::numeric ELSE q."discountValue" END,
    "discountAmount" = CASE WHEN p_content ? 'discountAmount' THEN (p_content->>'discountAmount')::numeric ELSE q."discountAmount" END,
    "vatRate" = CASE WHEN p_content ? 'vatRate' THEN (p_content->>'vatRate')::numeric ELSE q."vatRate" END,
    "paymentPlan" = CASE WHEN p_content ? 'paymentPlan' THEN p_content->'paymentPlan' ELSE q."paymentPlan" END,
    "docLanguage" = CASE WHEN p_content ? 'docLanguage' THEN COALESCE(NULLIF(p_content->>'docLanguage', ''), q."docLanguage") ELSE q."docLanguage" END,
    -- เอกสารอ้างอิง (0266) — ข้อความอิสระที่คนทำใบพิมพ์เอง ขึ้นในบล็อกอ้างอิงบนเอกสาร
    "referenceNote" = CASE WHEN p_content ? 'referenceNote' THEN NULLIF(p_content->>'referenceNote', '') ELSE q."referenceNote" END,
    -- ที่อยู่บนใบ (0202/0203) — "ใบนี้ใช้ที่อยู่ไหนของลูกค้า" เป็นข้อมูลของเอกสารเอง
    -- ทั้งข้อความ (snapshot ณ วันออกใบ) และ id (ฉบับ Rev. ใช้ดึงสดของที่อยู่ตัวเดิม)
    "billingAddress" = CASE WHEN p_content ? 'billingAddress' THEN NULLIF(p_content->>'billingAddress', '') ELSE q."billingAddress" END,
    "shippingAddress" = CASE WHEN p_content ? 'shippingAddress' THEN NULLIF(p_content->>'shippingAddress', '') ELSE q."shippingAddress" END,
    "branchCode" = CASE WHEN p_content ? 'branchCode' THEN NULLIF(p_content->>'branchCode', '') ELSE q."branchCode" END,
    "billingAddressId" = CASE WHEN p_content ? 'billingAddressId' THEN NULLIF(p_content->>'billingAddressId', '') ELSE q."billingAddressId" END,
    "shippingAddressId" = CASE WHEN p_content ? 'shippingAddressId' THEN NULLIF(p_content->>'shippingAddressId', '') ELSE q."shippingAddressId" END,
    "approvalStatus" = CASE WHEN p_content ? 'approvalStatus' THEN p_content->>'approvalStatus' ELSE q."approvalStatus" END,
    "approvalReason" = CASE WHEN p_content ? 'approvalReason' THEN NULLIF(p_content->>'approvalReason', '') ELSE q."approvalReason" END,
    "approvalRequestedAt" = CASE WHEN p_content ? 'approvalRequestedAt' THEN NULLIF(p_content->>'approvalRequestedAt', '')::timestamptz ELSE q."approvalRequestedAt" END,
    "approvalRequestedBy" = CASE WHEN p_content ? 'approvalRequestedBy' THEN NULLIF(p_content->>'approvalRequestedBy', '') ELSE q."approvalRequestedBy" END,
    "approvalRequestedByName" = CASE WHEN p_content ? 'approvalRequestedByName' THEN NULLIF(p_content->>'approvalRequestedByName', '') ELSE q."approvalRequestedByName" END,
    "approvalFingerprint" = CASE WHEN p_content ? 'approvalFingerprint' THEN NULLIF(p_content->>'approvalFingerprint', '') ELSE q."approvalFingerprint" END,
    "approvedAt" = CASE WHEN p_content ? 'approvedAt' THEN NULLIF(p_content->>'approvedAt', '')::timestamptz ELSE q."approvedAt" END,
    "approvedBy" = CASE WHEN p_content ? 'approvedBy' THEN NULLIF(p_content->>'approvedBy', '') ELSE q."approvedBy" END,
    "approvedByName" = CASE WHEN p_content ? 'approvedByName' THEN NULLIF(p_content->>'approvedByName', '') ELSE q."approvedByName" END,
    metadata = CASE WHEN p_content ? 'metadata' THEN p_content->'metadata' ELSE q.metadata END,
    "updatedAt" = COALESCE(NULLIF(p_content->>'updatedAt', '')::timestamptz, now())
  WHERE q.id = p_quote_id
  RETURNING q.* INTO v_after;

  IF p_lines IS NOT NULL THEN
    DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;
    INSERT INTO public.quotation_lines (
      id, "quotationId", "productId", "fgCode", description, qty, "unitPrice",
      "unit", "discountType", "discountValue", "discountAmount", "lineTotal", source,
      "sortOrder", metadata, "serviceRounds"
    )
    SELECT
      x.id, p_quote_id, x."productId", x."fgCode", x.description, x.qty,
      x."unitPrice", COALESCE(NULLIF(x."unit", ''), 'ชิ้น'), x."discountType",
      x."discountValue", x."discountAmount",
      x."lineTotal", COALESCE(x.source, 'manual'), COALESCE(x."sortOrder", 0),
      COALESCE(x.metadata, '{}'::jsonb), x."serviceRounds"
    FROM jsonb_to_recordset(p_lines) AS x(
      id text, "productId" text, "fgCode" text, description text, qty numeric,
      "unitPrice" numeric, "unit" text, "discountType" text, "discountValue" numeric,
      "discountAmount" numeric, "lineTotal" numeric, source text,
      "sortOrder" integer, metadata jsonb, "serviceRounds" integer
    );
  END IF;

  -- ยอดรวม 0 ไม่บล็อกอีกต่อไป (มติ 2026-07-18) — accept ยังบังคับ > 0 ที่ RPC ของมันเอง
  IF v_after.status = 'sent' THEN
    SELECT count(*) INTO v_line_count FROM public.quotation_lines
    WHERE "quotationId" = p_quote_id;
    IF v_line_count = 0 THEN RAISE EXCEPTION 'quotation_lines_required'; END IF;
    IF v_after."approvalStatus" NOT IN ('not_required', 'approved') THEN
      RAISE EXCEPTION 'quotation_approval_required';
    END IF;
    IF v_after."approvalStatus" = 'approved' AND v_after."approvalFingerprint" IS NULL THEN
      RAISE EXCEPTION 'quotation_approval_stale';
    END IF;
  END IF;

  RETURN to_jsonb(v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) TO service_role;

-- ── 2/3 · create_sales_order_draft ───────────────────────────────────────
-- คัดลอกนิยามล่าสุด (0285) มาทั้งก้อน + เพิ่ม "serviceRounds" ที่ INSERT บรรทัด
CREATE OR REPLACE FUNCTION public.create_sales_order_draft(
  p_quote_id text,
  p_order_id text,
  p_actor_id text,
  p_actor_name text,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
  v_now timestamp;
  v_month text;
  v_pattern text;
  v_running_width integer;
  v_running_no integer;
  v_order_number text;
  v_overrides jsonb := COALESCE(p_overrides, '{}'::jsonb);
  v_confirm_type text := NULLIF(v_overrides->>'confirmDocType', '');
  v_confirm_no text := NULLIF(btrim(COALESCE(v_overrides->>'confirmDocNo', '')), '');
  v_confirm_date date := NULLIF(v_overrides->>'confirmDocDate', '')::date;
  v_confirm_files jsonb := COALESCE(v_overrides->'confirmAttachments', '[]'::jsonb);
  v_reference_doc text := NULLIF(btrim(COALESCE(v_overrides->>'referenceDoc', '')), '');
  v_notes text := NULLIF(v_overrides->>'notes', '');
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_won'; END IF;
  -- นับเฉพาะ SO ที่ยังมีชีวิต (0246)
  IF EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE "quotationId" = v_quote.id
      AND status <> 'cancelled'
      AND "supersededById" IS NULL
  ) THEN
    RAISE EXCEPTION 'sales_order_already_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;
  IF v_confirm_type IS NOT NULL AND v_confirm_type NOT IN ('payment_slip','po','order_confirmation') THEN
    RAISE EXCEPTION 'sales_order_confirm_type_invalid';
  END IF;
  IF jsonb_typeof(v_confirm_files) <> 'array' THEN
    RAISE EXCEPTION 'sales_order_confirm_files_invalid';
  END IF;

  v_now := timezone('Asia/Bangkok', now());
  v_month := to_char(v_now, 'YYMM');

  -- รูปแบบจากมาตรฐานที่เผยแพร่ (มี unique partial index กันไว้ว่ามีได้ชนิดละใบเดียว)
  -- ไม่มี/ว่าง → รูปแบบเดิมของระบบ · ห้ามออกเลขไม่ได้เพราะตารางตั้งค่าไม่พร้อม
  SELECT NULLIF(btrim(v."numberingPattern"), '') INTO v_pattern
  FROM public.document_standard_versions v
  WHERE v."documentKey" = 'salesOrder' AND v.status = 'published';
  v_pattern := COALESCE(v_pattern, 'SO-{YY}{MM}{RUNNING:4}-{REVISION}');

  -- ความกว้างเลขรันตามรูปแบบจริง — ด่าน "เลขเต็มเดือน" ต้องขยับตามด้วย ไม่ใช่ 9999 ตายตัว
  v_running_width := COALESCE((substring(v_pattern from '\{RUNNING:(\d)\}'))::integer, 4);

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_month, 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > power(10, v_running_width)::integer - 1 THEN
    RAISE EXCEPTION 'sales_order_monthly_sequence_exhausted';
  END IF;

  v_order_number := v_pattern;
  v_order_number := replace(v_order_number, '{YYYY}', to_char(v_now, 'YYYY'));
  v_order_number := replace(v_order_number, '{YY}', to_char(v_now, 'YY'));
  v_order_number := replace(v_order_number, '{MM}', to_char(v_now, 'MM'));
  v_order_number := replace(v_order_number, '{DD}', to_char(v_now, 'DD'));
  v_order_number := replace(v_order_number, '{RUNNING:3}', lpad(v_running_no::text, 3, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:4}', lpad(v_running_no::text, 4, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:5}', lpad(v_running_no::text, 5, '0'));
  v_order_number := replace(v_order_number, '{REVISION}', '0');

  INSERT INTO public.sales_orders (
    id, "orderNumber", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    "referenceDoc", "confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments",
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    p_order_id, v_order_number, v_quote.id, v_quote."dealId", d."projectId",
    v_quote."customerId", v_quote."customerName", 'draft',
    -- ⭐ วันที่บนหัวใบ = วันที่ออกใบ (มติ 2026-08-18: "วันที่ SO = วันที่สร้างใบ แก้ไม่ได้")
    v_now::date,
    -- กำหนดชำระอยู่ที่งวดเท่านั้น — ช่องบนหัวใบเหลือไว้ให้ใบเก่าที่มีค่าอยู่แล้ว
    v_quote."wonPaymentDueDate",
    v_quote.subtotal, COALESCE(v_quote."discountAmount", 0),
    v_quote."vatAmount", v_quote."totalAmount",
    GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0)),
    COALESCE(v_notes, v_quote.notes),
    -- เลขที่เอกสารยืนยันเป็นค่าตั้งต้นของเอกสารอ้างอิง (ผู้กรอกทับได้จากฟอร์ม)
    COALESCE(v_reference_doc, v_confirm_no, v_quote."wonDocNo"),
    v_confirm_type, v_confirm_no, v_confirm_date, v_confirm_files,
    jsonb_build_object('source', 'quotation', 'quoteNumber', v_quote."quoteNumber"),
    p_actor_id, p_actor_name, now(), now()
  FROM public.sales_deals d WHERE d.id = v_quote."dealId"
  RETURNING * INTO v_order;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", "unit", "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata, "serviceRounds"
  )
  SELECT
    'SOL-' || md5(p_order_id || ':' || ql.id), p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata, ql."serviceRounds"
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) TO service_role;

-- ── 3/3 · revise_approved_sales_order_atomic ─────────────────────────────
-- คัดลอกนิยามล่าสุด (0166) มาทั้งก้อน + เพิ่ม "serviceRounds" ที่ INSERT บรรทัด
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

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน:
--   SELECT count(*) FROM public.quotation_lines   WHERE "serviceRounds" IS NOT NULL;  -- ควรได้ 0
--   SELECT count(*) FROM public.sales_order_lines WHERE "serviceRounds" IS NOT NULL;  -- ควรได้ 0
--   SELECT conname FROM pg_constraint
--    WHERE conname IN ('quotation_lines_service_rounds_positive',
--                      'sales_order_lines_service_rounds_positive');                  -- ควรได้ 2 แถว
--   -- ทั้งสามนิยามต้องมีคำว่า serviceRounds อยู่ในตัวมันเอง:
--   SELECT p.proname, position('serviceRounds' in pg_get_functiondef(p.oid)) > 0 AS has_rounds
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('save_quotation_content','create_sales_order_draft',
--                        'revise_approved_sales_order_atomic');                        -- ควรได้ true ทั้ง 3
--
-- Rollback guidance:
--   ⚠️ ถอยคอลัมน์ = ตัวเลขที่ SA พิมพ์ไปแล้วหาย · ตรวจ count ข้างบนก่อนเสมอ
--   ALTER TABLE public.quotation_lines   DROP CONSTRAINT quotation_lines_service_rounds_positive,   DROP COLUMN "serviceRounds";
--   ALTER TABLE public.sales_order_lines DROP CONSTRAINT sales_order_lines_service_rounds_positive, DROP COLUMN "serviceRounds";
--   แล้วรัน 0267 / 0285 / 0166 ซ้ำเพื่อคืนนิยามฟังก์ชันเดิม (ทั้งสามไฟล์รันซ้ำได้)
