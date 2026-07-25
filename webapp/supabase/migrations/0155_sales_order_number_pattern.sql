-- 0155 - เลขที่ใบสั่งขายมาจาก "รูปแบบเลขที่" ของมาตรฐานเอกสารที่เผยแพร่
--
-- ที่มา: หน้าตั้งค่า → มาตรฐานเอกสาร มีช่อง numberingPattern มาตั้งแต่ mig 0123 (validate
-- ครบ ตรึงลงหลักฐานลายเซ็นด้วย) แต่ไม่มีใครเอาไปใช้ออกเลขจริง — ฝั่งใบเสนอราคาประกอบ
-- สตริงเองใน JS ส่วนใบสั่งขายประกอบเองในฟังก์ชันนี้ ('SO-' || month || lpad(...) || '-0')
-- แก้รูปแบบในหน้าตั้งค่าแล้วเลขที่ออกใหม่จึงไม่ขยับเลย.
--
-- คัดจากนิยามล่าสุด (0146 — ตัวที่เพิ่ม unit เข้าบรรทัด SO ห้ามทำหาย) แล้วเปลี่ยนเฉพาะ
-- ท่อนออกเลข · ตัวนับยังเป็น sales_order_number_counters ตัวเดิม atomic ต่อเดือนเหมือนเดิม
-- ไม่ backfill เลขเก่าแม้แต่ใบเดียว · UNIQUE บน "orderNumber" ยังเป็นด่านสุดท้าย.
--
-- ⚠ ชุด token ต้องตรงกับ formatDocumentNumber ใน webapp/src/lib/documentStandards.js
--   (ใบเสนอราคาใช้ฝั่ง JS) — เพิ่ม/แก้ token ต้องแก้สองที่คู่กันเสมอ.
-- Idempotent — รันซ้ำได้.

CREATE OR REPLACE FUNCTION public.create_sales_order_draft(
  p_quote_id text,
  p_order_id text,
  p_actor_id text,
  p_actor_name text
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
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_won'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_orders WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'sales_order_already_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
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
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    p_order_id, v_order_number, v_quote.id, v_quote."dealId", d."projectId",
    v_quote."customerId", v_quote."customerName", 'draft',
    COALESCE(v_quote."wonDocDate", v_quote."acceptedAt"::date, v_quote."quoteDate"),
    v_quote."wonPaymentDueDate", v_quote.subtotal, COALESCE(v_quote."discountAmount", 0),
    v_quote."vatAmount", v_quote."totalAmount",
    GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0)), v_quote.notes,
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
    'SOL-' || ql.id, p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
