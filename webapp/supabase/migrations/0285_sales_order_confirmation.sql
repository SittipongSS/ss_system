-- ============================================================
--  Migration 0285: เอกสารยืนยันคำสั่งซื้ออยู่กับ "ใบสั่งขาย" ไม่ใช่ตอนปิด Won
--  (มติผู้ใช้ 2026-08-24 · คู่กับ 0284)
--
--  ⭐ หลักฐานที่เคยบังคับตอนปิด Won (สลิป / PO / เอกสารยืนยันการสั่งซื้อ) ย้ายมาเป็น
--  ของใบสั่งขาย เพราะที่นี่คือที่ที่มันถูกใช้จริง: เลขที่ไหลไป referenceDoc · วันที่กับ
--  ไฟล์เป็นหลักฐานประกอบใบ · ส่วน "เงินที่จ่ายมาแล้ว" ลงที่ **งวดที่ 1** ตามกลไก
--  งวดร่างที่บันทึกเงินไว้ก่อนได้ (0259 + installmentPrepaid) — ไม่ต้องมีคอลัมน์เงิน
--  ในตารางใบ
--
--  ── สิ่งที่ไฟล์นี้แก้ ──────────────────────────────────────────────────────
--  1) sales_orders + 4 คอลัมน์: confirmDocType · confirmDocNo · confirmDocDate ·
--     confirmAttachments — **ไม่บังคับตอนสร้าง** แต่เป็นด่านของการ *ยื่นอนุมัติ*
--     (ด่านอยู่ในโค้ด ไม่ใช่ CHECK: ใบร่างที่ยังกรอกไม่ครบต้องบันทึกได้)
--  2) create_sales_order_draft รับ `p_overrides jsonb` — ฟอร์มหน้าสร้างส่ง
--     referenceDoc / notes / เอกสารยืนยัน มาพร้อมกับการออกใบในคำขอเดียว
--     ⇒ ไม่มีจังหวะที่ใบเกิดแล้วยังไม่มีข้อมูลที่คนกรอกไว้แล้ว
--  3) วันที่บนหัวใบ = **วันที่ออกใบ** (เวลาไทย) ไม่ใช่วันที่เอกสารหลักฐานอีกต่อไป —
--     ของเดิมอ่าน wonDocDate ซึ่งจะเป็น NULL ตั้งแต่ 0284 และมติ 2026-08-18 ก็ระบุ
--     อยู่แล้วว่า "วันที่ SO = วันที่สร้างใบ แก้ไม่ได้" · กำหนดชำระอยู่ที่งวดเท่านั้น
--
--  ⚠️ **DROP ตัวเดิม 4 อาร์กิวเมนต์แล้วสร้างตัวใหม่ 5 อาร์กิวเมนต์ (มี DEFAULT)**
--  ในทรานแซกชันเดียว — ถ้าปล่อยทั้งสองตัวไว้ การเรียกด้วย 4 อาร์กิวเมนต์จะกำกวม
--  (function is not unique) · มี DEFAULT ⇒ โค้ดเก่าที่ยังส่ง 4 อาร์กิวเมนต์ยังเรียกได้
--  ⇒ รันใบนี้ก่อน deploy โค้ดได้ ไม่มีช่วงพัง
--
--  ⚠️ **ไม่ backfill** — ใบสั่งขายเก่าไม่มี confirm* (หลักฐานของมันอยู่ที่ใบเสนอราคา
--  ตามเดิม) หน้าจอจึงอ่านสองบ้าน: ของใบก่อน ถ้าไม่มีค่อยถอยไปดูของใบเสนอราคา
--
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "confirmDocType" text,
  ADD COLUMN IF NOT EXISTS "confirmDocNo" text,
  ADD COLUMN IF NOT EXISTS "confirmDocDate" date,
  ADD COLUMN IF NOT EXISTS "confirmAttachments" jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_confirm_doc_type') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_confirm_doc_type
      CHECK ("confirmDocType" IS NULL OR "confirmDocType" IN ('payment_slip','po','order_confirmation'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_confirm_doc_no_len') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_confirm_doc_no_len
      CHECK ("confirmDocNo" IS NULL OR length("confirmDocNo") BETWEEN 1 AND 100);
  END IF;
  -- กันปีพิมพ์ผิดแบบเดียวกับงวดชำระ (`formulaDate = '2202-08-06'` เคยหลุดขึ้น prod)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_confirm_doc_date_sane') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_confirm_doc_date_sane
      CHECK ("confirmDocDate" IS NULL OR "confirmDocDate" BETWEEN '2000-01-01' AND '2100-12-31');
  END IF;
  -- หลักฐานต้องเป็น array เสมอ — object หลุดเข้ามาแล้ว .map() ฝั่งหน้าเว็บพังทั้งการ์ด
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_confirm_attachments_array') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_confirm_attachments_array
      CHECK (jsonb_typeof("confirmAttachments") = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.sales_orders."confirmDocType" IS
  'ชนิดเอกสารยืนยันคำสั่งซื้อ (payment_slip/po/order_confirmation) — ย้ายมาจากตอนปิด Won (0284)';
COMMENT ON COLUMN public.sales_orders."confirmDocNo" IS
  'เลขที่เอกสารยืนยัน — ค่าตั้งต้นของ referenceDoc (บังคับเมื่อเป็น PO)';
COMMENT ON COLUMN public.sales_orders."confirmDocDate" IS 'วันที่บนเอกสารยืนยันคำสั่งซื้อ';
COMMENT ON COLUMN public.sales_orders."confirmAttachments" IS
  'ไฟล์เอกสารยืนยันคำสั่งซื้อ (ref เดียวกับ wonAttachments เดิม)';

-- ── คัดนิยามล่าสุด (0246) มาทั้งก้อน + รับ p_overrides และเปลี่ยนที่มาของ orderDate
DROP FUNCTION IF EXISTS public.create_sales_order_draft(text, text, text, text);

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

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) TO service_role;

COMMIT;
