-- ============================================================
--  Migration 0341: ใบสั่งขายสืบภาษาเอกสารจากใบเสนอราคาที่มันออกต่อมา
--
--  🐞 **อาการเดียวกับที่ 0295 สร้างขึ้นมาเพื่อแก้ — แต่ยังงอกกลับได้ทุกใบใหม่**
--     0295 (2026-08-27) เพิ่ม `sales_orders."docLanguage"` แล้ว backfill จากใบเสนอราคา
--     ที่ผูกอยู่ · แต่ **เส้นสร้างใบไม่เคยก๊อปค่านั้น** ⇒ ใบที่ออกหลังจากนั้นได้
--     `DEFAULT 'th'` เสมอ ไม่ว่าใบเสนอราคาต้นทางจะเป็นภาษาอะไร
--     ⇒ backfill แก้อดีตได้ครั้งเดียว แล้วปัญหาก็งอกกลับมาเรื่อย ๆ
--
--  วัดบน production วันที่เขียนใบนี้:
--    · ใบเสนอราคาภาษาอังกฤษ 15 ใบ
--    · ใบสั่งขาย **134 ใบ เป็นภาษาไทยทั้งหมด — ไม่มีสักใบที่เป็นอังกฤษ**
--    · `SO-26090144-0` ออกจาก `QT-26080167-0` (อังกฤษ) แต่ตัวเองเป็นไทย
--  ตรงกับถ้อยคำที่ 0295 เขียนไว้เองว่าเป็นปัญหา:
--    "ลูกค้าต่างชาติได้ใบเสนอราคาภาษาอังกฤษ แล้วพอถึงใบสั่งขายกลับเป็นไทย"
--
--  ── กลไกของบั๊ก (เหมือน 0340 เป๊ะ) ────────────────────────────────────────
--  `create_sales_order_draft` ก๊อปหัวใบด้วย **รายการคอลัมน์ที่เขียนไว้ตายตัว** ส่วน
--  ตาราง `sales_orders` โตขึ้นเรื่อย ๆ ⇒ คอลัมน์ที่เพิ่มทีหลังไม่ถูกก๊อปโดยอัตโนมัติ
--  · 0295 เพิ่มคอลัมน์แต่ไม่ได้ไปแตะฟังก์ชันนี้ · 0328 คัดลอกนิยามเดิมมาแก้เรื่องเลขรัน
--    จึงพารายการที่ขาดอยู่แล้วมาต่อ
--  ⇒ ใบนี้มาพร้อม **ยามในชุดเทสต์** ที่ไล่ทุกคอลัมน์ของ `sales_orders` แล้วบังคับให้
--    แต่ละตัวถูกประกาศว่า "ก๊อป" หรือ "ตั้งใจไม่ก๊อป" (แพตเทิร์นเดียวกับที่ 0340 วางไว้)
--
--  ── ที่ **ไม่** ก๊อป และตั้งใจไม่ก๊อป ──────────────────────────────────────
--   · `serviceRounds` ของบรรทัด — 0326 เคยก๊อป แล้ว 0328 ถอดออก · **ถูกแล้ว**:
--     มติ 2026-08-31 รอบสอง ย้ายช่องกรอกไปที่ใบสั่งขาย ⇒ `quotation_lines` ไม่มีใคร
--     เขียนค่านั้นอีก (0326 จดไว้เองว่า "เส้นก๊อป QT→SO ก็ไม่มีค่าให้ก๊อป ไม่เสียหาย")
--   · `ownerId`/`ownerName` — trigger `snapshot_sales_order_owner` (0294) แช่ให้ตอน
--     **หัวหน้าฝ่ายขายอนุมัติ** ไม่ใช่ตอนสร้าง ⇒ ก๊อปมาตั้งแต่ร่างจะได้เจ้าของยอดผิดรอบ
--     (คอลัมน์นี้ **มีคนอ่านจริง** — รายงานยอดขายจัดกลุ่มด้วยมัน)
--   · `serviceContractId` — ใบใหม่ยังไม่ผูกสัญญาโดยนิยาม
--   · ร่องรอยของ workflow ทั้งชุด (ยื่น/อนุมัติ/บัญชี/ยกเลิก/ลายเซ็น/สายฉบับ)
--
--  ── ② ตามคืนใบที่ออกไปแล้ว ────────────────────────────────────────────────
--  ใบที่ยังเป็นร่างแก้ภาษาเองบนจอได้อยู่แล้ว และใบที่อนุมัติแล้วก็ยังเปลี่ยนได้ตามมติ
--  2026-08-27 ("ภาษาเปลี่ยนแค่กระดาษที่พิมพ์ ไม่ใช่ข้อเสนอ") — แต่ไม่มีใครรู้ว่าต้องไป
--  เปลี่ยน ⇒ ใบนี้ตามคืนให้เฉพาะใบที่ภาษาไม่ตรงกับใบเสนอราคาต้นทาง (วันที่เขียน: 1 ใบ)
--  ⚠️ คำสั่งเดียวกับที่ 0295 ใช้ทุกตัวอักษร ⇒ ใบที่ตั้งค่าตรงกันแล้วไม่ถูกแตะ
--
--  ⚠️ **ต้องรันก่อน deploy** — ไม่มีโค้ดฝั่งแอปเปลี่ยนพฤติกรรมนี้ ทั้งหมดอยู่ในฟังก์ชัน
--     ⇒ ไม่รัน = ใบใหม่ยังเป็นไทยเหมือนเดิมโดยไม่มีอะไรฟ้อง
--
--  idempotent: CREATE OR REPLACE + UPDATE ที่กรองเฉพาะแถวที่ยังไม่ตรง
-- ============================================================

BEGIN;

-- ① เส้นสร้างใบสืบภาษาจากใบเสนอราคา
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

-- ② ตามคืนใบที่ออกไปแล้วซึ่งภาษาไม่ตรงกับใบเสนอราคาต้นทาง
--    (คำสั่งเดียวกับที่ 0295 ใช้ · กรองเฉพาะแถวที่ยังไม่ตรง ⇒ รันซ้ำแตะ 0 แถว)
UPDATE public.sales_orders so
SET "docLanguage" = q."docLanguage"
FROM public.quotations q
WHERE q.id = so."quotationId"
  AND q."docLanguage" IN ('th', 'en')
  AND so."docLanguage" IS DISTINCT FROM q."docLanguage";

COMMIT;
