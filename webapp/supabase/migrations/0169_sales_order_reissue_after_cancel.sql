-- 0169 - ยกเลิก SO แล้วต้องออกใบใหม่จาก QT เดิมได้ (ปลดทางตัน)
--
-- ที่มา: ด่าน "1 QT มี SO ได้ใบเดียว" นับ SO **ทุกสถานะรวมที่ยกเลิกแล้ว** ผลคือพอผู้ใช้
-- ยกเลิก SO ด้วยเหตุผลมาตรฐานที่ระบบเสนอเองว่า "แก้รายการ/ราคา — ออก SO ใหม่"
-- (reissue_correction) หรือ "ออก SO ผิด (ผิดใบ/ดีล/ลูกค้า)" (wrong_document) แล้ว
-- **ออกใบใหม่ไม่ได้อีกเลย** ขึ้นแค่ 409 "QT ใบนี้มี Sale Order แล้ว" — ดีลค้าง Won +
-- ใบเสนอราคายัง accepted + ไม่มี SO ที่ใช้งานได้ ทางออกที่เหลือคือให้แอดมินกด restore
-- ใบที่ยกเลิกไปแล้วกลับมา ซึ่งไม่ใช่สิ่งที่ป้ายเหตุผลบอกให้ทำ
--
-- ด่านนี้ควรถามว่า "ยังมี SO ที่ **ใช้งานอยู่** ไหม" ไม่ใช่ "เคยมี SO ไหม":
--   * cancelled            = ตายแล้ว ไม่ควรกัน  (นี่คือบั๊กหลักที่แก้)
--   * supersededById NOT NULL = ถูกแทนที่ด้วย Rev. ถัดไปแล้ว ตัวที่มีชีวิตคือฉบับ Rev.
--     ซึ่งจะถูกด่านนี้ตรวจเองอยู่แล้ว → ข้ามฉบับที่ถูกแทนที่ ไม่งั้น chain ที่ปลายทาง
--     ถูกยกเลิก (base 'revised' → rev1 'cancelled') จะตันซ้ำแบบเดิม
--   * draft / pending_approval / approved / rejected / approval_revoked = ยังมีชีวิต กันตามเดิม
--
-- นิยามคัดจาก 0155 ทั้งก้อน (ตัวล่าสุดของฟังก์ชันนี้ — ห้ามคัดจาก 0146/0109 ที่เก่ากว่า
-- ไม่งั้นท่อออกเลขตามรูปแบบเอกสารหาย) เปลี่ยนจุดเดียวคือเงื่อนไข IF EXISTS
-- Idempotent — รันซ้ำได้ · ไม่แตะข้อมูลเดิมแม้แต่แถวเดียว

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
  -- ⬇ จุดเดียวที่ต่างจาก 0155: นับเฉพาะ SO ที่ยังมีชีวิต (ดูหัวไฟล์)
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
    -- id บรรทัดต้องผูกกับ **SO ใบนี้** ไม่ใช่กับบรรทัดของใบเสนอราคา: เดิมเป็น 'SOL-' || ql.id
    -- ซึ่งซ้ำทันทีเมื่อ QT ใบเดิมออก SO ใบที่สอง (บรรทัดของใบที่ยกเลิกยังอยู่ในตาราง) →
    -- ปลดด่านข้างบนอย่างเดียวจะย้ายทางตันไปเป็น duplicate key แทน. ใช้สูตรเดียวกับ
    -- เส้นทางออก Rev. (0161/0166) เพื่อให้ทั้งระบบออก id บรรทัด SO แบบเดียวกัน
    -- ไม่มีโค้ดไหนอ่านความหมายจาก id นี้ (ความสัมพันธ์อยู่ที่คอลัมน์ "quotationLineId")
    'SOL-' || md5(p_order_id || ':' || ql.id), p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text) TO service_role;

-- Rollback:
-- 1) CREATE OR REPLACE ด้วยนิยามจาก 0155 ทั้งก้อน (ด่านกลับเป็น "เคยมี SO = ห้ามออกใหม่"
--    และ id บรรทัดกลับเป็น 'SOL-' || ql.id)
-- 2) ข้อมูลไม่กระทบ: ไม่มี DDL และไม่มี UPDATE/DELETE ในไฟล์นี้ — SO ที่ออกไปแล้วด้วย
--    id บรรทัดแบบใหม่ยังอยู่ครบและอ่านได้ตามปกติ (id เป็นค่า opaque)

NOTIFY pgrst, 'reload schema';
