-- ============================================================
--  0363 · กำหนดส่งสินค้าบนใบสั่งขาย (`deliveryDueDate`)
--
--  ⭐ **มติผู้ใช้ 2026-09-17** — PR1 ของสายเอกสาร FM-SA-04 / FM-SA-07
--    ทั้งสองแบบฟอร์มมีช่อง "กำหนดส่งสินค้า / Due Date" อยู่บนกระดาษ แต่**ทั้งระบบ
--    ไม่มีที่เก็บค่านี้เลย** ⇒ ถ้าไม่เพิ่มก่อน ทั้งสองใบต้องพิมพ์วันเดียวกันซ้ำสองที่
--    แล้วเถียงกันเอง
--
--  ⚠️ **คนละอันกับสองช่องวันที่ที่มีอยู่แล้ว** — สามอันนี้ห้ามเอามาใช้แทนกัน
--    · `orderDate`       วันที่ออกใบ = วันที่สร้างใบ แก้ไม่ได้ (มติ 2026-08-18)
--    · `paymentDueDate`  กำหนด**ชำระ**ระดับใบ (ของจริงอยู่ที่งวด `sales_order_installments`)
--    · `deliveryDueDate` กำหนด**ส่งของ** ⇐ ใบนี้ · เป็นคำสัญญากับลูกค้า ไม่ใช่เรื่องเงิน
--
--  ⚠️ **ว่างได้ และว่างไม่เท่ากับวันนี้** — ใบที่ยังไม่ตกลงวันส่งต้องบันทึกได้
--    (ถ้าบังคับกรอก AE ที่รอลูกค้าเคาะวันจะตั้งใบร่างไม่ได้เลย = ทางตันแบบเดียวกับ
--    ที่ดีล Won เคยเจอ) ⇒ NULL = "ยังไม่ตกลง" ซึ่งเป็นข้อเท็จจริง ไม่ใช่ข้อมูลขาด
--
--  ⚠️ **ต้องแก้ RPC สองตัวด้วย ไม่ใช่แค่เพิ่มคอลัมน์** (บทเรียน 0341/0343: คอลัมน์
--    ถูกเพิ่มไว้แต่ RPC ไม่รู้จัก ⇒ ค่าที่ฟอร์มส่งมาถูกทิ้งเงียบ แล้วจอตอบ "บันทึกแล้ว")
--    · `create_sales_order_draft`            รับคีย์ `deliveryDueDate` ใน `p_overrides`
--    · `revise_approved_sales_order_atomic`  ก๊อปค่าเดิมไปยัง Rev. ใหม่
--    plpgsql ไม่มี "เติมทีละบรรทัด" ⇒ ยกฟังก์ชันมาทั้งก้อน (create จาก **0343** ·
--    revise จาก **0346**) แล้วเติมคอลัมน์เดียว — ของเดิมทุกบรรทัดยกมาครบ
--
--  🪤 **`create_historical_sales_order` (0360) ไม่แตะโดยตั้งใจ** — ใบย้อนหลังคีย์จาก
--    ชีตซึ่งไม่มีคอลัมน์วันส่ง ⇒ ค่าเป็น NULL ตามจริง · เปิดรับเมื่อไรต้องมีข้อมูลจริง
--    ให้กรอกก่อน ไม่ใช่เดาจากวันที่อื่นในชีต
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy**
--    (ไม่รัน = ฟอร์มส่งคีย์ที่ฐานไม่มี ⇒ สร้างใบไม่ผ่านทั้งใบ)
-- ============================================================

BEGIN;

-- ── ① คอลัมน์ ──────────────────────────────────────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "deliveryDueDate" date;

COMMENT ON COLUMN public.sales_orders."deliveryDueDate" IS
  'กำหนดส่งสินค้าที่ตกลงกับลูกค้า (0363) — คนละอันกับ orderDate (วันออกใบ) และ paymentDueDate (กำหนดชำระ) · NULL = ยังไม่ตกลงวันส่ง ไม่ใช่ข้อมูลขาด';

-- ── ② สร้างใบร่างจาก QT Won (ยกจาก 0343 ทั้งก้อน + คอลัมน์ใหม่สองฝั่ง) ──────
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
  v_year text;
  v_seed integer := 0;
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
  /* ⭐ 0363: กำหนดส่งสินค้า — ค่าเดียวในใบที่ไม่มีต้นทางใน QT ให้สืบ ฝ่ายขายกรอกเอง
     ⚠️ ไม่มีค่า = NULL ไม่ใช่วันนี้ — "ยังไม่ตกลงวันส่ง" ต่างจาก "ส่งวันนี้" */
  v_delivery_due date := NULLIF(v_overrides->>'deliveryDueDate', '')::date;
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
  -- ⭐ คีย์ถังนับ = **ปี** (0328) · เดือนยังอยู่ในตัวเลขผ่าน v_pattern ข้างล่าง
  v_year := to_char(v_now, 'YY');

  -- รูปแบบจากมาตรฐานที่เผยแพร่ (มี unique partial index กันไว้ว่ามีได้ชนิดละใบเดียว)
  -- ไม่มี/ว่าง → รูปแบบเดิมของระบบ · ห้ามออกเลขไม่ได้เพราะตารางตั้งค่าไม่พร้อม
  SELECT NULLIF(btrim(v."numberingPattern"), '') INTO v_pattern
  FROM public.document_standard_versions v
  WHERE v."documentKey" = 'salesOrder' AND v.status = 'published';
  v_pattern := COALESCE(v_pattern, 'SO-{YY}{MM}{RUNNING:4}-{REVISION}');

  -- ความกว้างเลขรันตามรูปแบบจริง — ด่าน "เลขเต็มรอบ" ต้องขยับตามด้วย ไม่ใช่ 9999 ตายตัว
  v_running_width := COALESCE((substring(v_pattern from '\{RUNNING:(\d)\}'))::integer, 4);

  -- แถวของปีนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ QT/0241)
  -- ปีใหม่ปกติจะไม่มีแถวยุคเดือนของปีนั้น ⇒ ได้ 0 แล้วเริ่ม 0001 ตามที่ควรเป็น
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_number_counters WHERE month = v_year) THEN
    SELECT COALESCE(max("lastNo"), 0) INTO v_seed
    FROM public.sales_order_number_counters
    WHERE month LIKE v_year || '%' AND length(month) = 4;
  END IF;

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > power(10, v_running_width)::integer - 1 THEN
    RAISE EXCEPTION 'sales_order_yearly_sequence_exhausted';
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
    -- ── เติม 2026-09-02 (0341) — ตกหล่นมาตั้งแต่ 0295 เพิ่มคอลัมน์ ──────────
    "docLanguage",
    -- ── เติม 2026-09-03 (0343) — คู่ภาษาอังกฤษของชื่อ/ที่อยู่ ────────────────
    "customerNameEn", "billingAddressEn", "shippingAddressEn",
    -- ── เติม 2026-09-17 (0363) — กำหนดส่งสินค้า ─────────────────────────────
    "deliveryDueDate",
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
    /* ภาษาเอกสารสืบจากใบเสนอราคาที่ใบนี้ออกต่อมา — กติกาเดียวกับที่ 0295 ใช้ backfill
       ⚠️ คอลัมน์เป็น NOT NULL และ CHECK ยอมแค่ 'th'/'en' ⇒ กันค่าแปลก/NULL ไว้ที่นี่
          ไม่ใช่ปล่อยให้ CHECK ตีกลับตอนสร้างใบ (คนกดจะเจอ error ที่อ่านไม่ออก) */
    CASE WHEN v_quote."docLanguage" IN ('th', 'en') THEN v_quote."docLanguage" ELSE 'th' END,
    /* ข้อความอังกฤษก๊อปดิบ ๆ ไม่ต้อง COALESCE — ว่างคือ "ไม่มีอังกฤษให้พิมพ์" ซึ่งมี
       ความหมายของมันเอง (จอถอยไปไทยแล้วเตือน) · ยัดไทยลงช่องอังกฤษแทน = ทั้งระบบ
       แยกไม่ออกอีกต่อไปว่าใบไหนมีอังกฤษจริง */
    v_quote."customerNameEn", v_quote."billingAddressEn", v_quote."shippingAddressEn",
    v_delivery_due,
    jsonb_build_object('source', 'quotation', 'quoteNumber', v_quote."quoteNumber"),
    p_actor_id, p_actor_name, now(), now()
  FROM public.sales_deals d WHERE d.id = v_quote."dealId"
  RETURNING * INTO v_order;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", "unit", "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata
  )
  SELECT
    'SOL-' || md5(p_order_id || ':' || ql.id), p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) TO service_role;

-- ── ③ ทอด SO → SO Rev. (ยกจาก 0346 ทั้งก้อน + คอลัมน์ใหม่สองฝั่ง) ──────────
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

COMMIT;

NOTIFY pgrst, 'reload schema';
