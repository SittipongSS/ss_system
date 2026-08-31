-- ============================================================
--  Migration 0328: เลขใบเสนอราคา (QT) / ใบสั่งขาย (SO) รันยาวทั้งปี ตัดรอบทุกปี
--  (มติผู้ใช้ 2026-09-01: "ใบเสนอราคา ใบสั่งขาย รันไปเรื่อยๆ ตัดทุกปี")
--
--  ⭐ ใบนี้เปลี่ยน **รอบตัดของเลขรัน** อย่างเดียว — รูปแบบเลขไม่เปลี่ยนสักตัวอักษร
--     `QT-{YY}{MM}{RUNNING:4}-{REVISION}` / `SO-…` ยังเป็นรูปแบบที่เผยแพร่อยู่
--     ⇒ ก.ย. 2026 เดินต่อจากเลขสุดท้ายของปี: `QT-26080241` → `QT-26090242`
--       ไม่ใช่ย้อนกลับไปเริ่ม `QT-26090001` แบบยุครายเดือน
--
--  🔴 **`YYMM` ในเลข ≠ ตัวตัดรอบของเลขรัน** — กับดักตัวเดียวกับเลขคำร้อง (docNo.js)
--     และเลขสัญญา (contracts.js) ที่เคยเขียนเตือนไว้แล้วทั้งสองที่
--     · `YYMM` ที่คนเห็นในเลข มาจาก "รูปแบบเลขที่" ของมาตรฐานเอกสาร = **เดือนที่ออกใบ**
--     · ตัวตัดรอบคือ **คีย์ `month` ของตารางตัวนับ** ซึ่งใบนี้เปลี่ยนจาก `'YYMM'` → `'YY'`
--     ⇒ ตารางตัวนับจะมีทั้งแถวยุคเดือน (`'2607'` `'2608'` `'2609'`) และแถวยุคปี (`'26'`)
--       อยู่ด้วยกัน · **ห้ามลบแถวยุคเดือนทิ้ง** (trigger `doc_number_counter_guard`
--       ของ 0242 กันไว้อยู่แล้ว) — มันคือหลักฐานว่าเลขไหนถูกออกไปแล้วในยุคเดือน
--
--  ⚠️ **ต้อง seed แถวปีก่อนสลับฟังก์ชัน** — ถ้าแถว (`'26'`) ยังไม่มี ฟังก์ชันจะเริ่มนับ 1
--     แล้วออกเลขทับเลขที่ออกไปแล้วในปีนี้ ⇒ ⓪ ① ② ③ เรียงลำดับนี้โดยตั้งใจ และทั้งใบ
--     อยู่ใน `BEGIN/COMMIT` เดียว รันครึ่งใบไม่ได้
--
--  🔴 **ท่อน ⓪ คือด่านที่ทำให้ใบนี้ล้มทั้งใบถ้าลืม** — `sales_order_number_counters.month`
--     ถูก CHECK ไว้ตั้งแต่ 0109 ว่าต้องเป็น 4 หลัก (`'YYMM'`) ⇒ คีย์ปี `'26'` ใส่ไม่ผ่าน
--     ทั้งตอน seed และตอนออกใบจริง
--
--  ⚠️ **seed ต้องนับ "เลขที่ออกไปแล้ว" ไม่ใช่ "แถวที่ยังเหลืออยู่"** — ใบที่ถูกลบทิ้ง
--     ไม่เหลือแถวให้นับ แต่เลขของมันถูกออกไปแล้ว (ของจริงวันที่ทำใบนี้: ตัวนับเดือน
--     `2609` = 1 ทั้งที่ไม่มีใบ `QT-2609…` เหลืออยู่ในตารางเลย) ⇒ seed =
--     GREATEST(เลขรันสูงสุดที่ยังมีแถวจริงในปีนั้น, `lastNo` สูงสุดของแถวเดือนในปีเดียวกัน)
--
--  ⚠️ **เพดานเปลี่ยนจาก 9,999 ใบ/เดือน เป็น 9,999 ใบ/ปี** (ความกว้าง `{RUNNING:4}` เท่าเดิม)
--     ปี 2026 ออกไปแล้ว QT 241 ใบ · SO 143 ใบ ⇒ ยังห่างเพดาน · วันที่ใกล้ให้ขยาย
--     ความกว้างที่ "รูปแบบเลขที่" ในหน้าตั้งค่า (ฟังก์ชันอ่านความกว้างจากรูปแบบจริง
--     ไม่ได้ฮาร์ดโค้ด 9999) แล้วเลขชุดใหม่จะยาวขึ้นเอง
--
--  ⚠️ ใบแจ้งชำระภาษีสรรพสามิต (ET) และไทม์ไลน์โครงการ (PT) **ยังตัดรอบรายเดือนตามเดิม**
--     — มติรอบนี้พูดถึงใบเสนอราคากับใบสั่งขายเท่านั้น · ตัวนับของสองชนิดนั้นเป็นคนละ
--     ตารางและคนละฟังก์ชัน ใบนี้ไม่แตะ
--
--  ⚠ รันมือบน Supabase SQL Editor · ไม่ลบ/ไม่แก้แถวเอกสารเดิมแม้แต่แถวเดียว · รันซ้ำได้
--
--  🔍 ตรวจหลังรัน (ต้องได้แถวปีทั้งสองตาราง และค่าต้อง ≥ เลขที่ออกไปแล้ว):
--     SELECT * FROM quote_number_counters ORDER BY month;
--     SELECT * FROM sales_order_number_counters ORDER BY month;
-- ============================================================

BEGIN;

-- ── ⓪ ปลดด่านที่บังคับให้คีย์ถังนับเป็น 4 หลัก ──────────────────────────────
--
-- 🔴 `sales_order_number_counters.month` มี CHECK `~ '^\d{4}$'` มาตั้งแต่ 0109 (ตอนนั้น
--    คีย์เป็น 'YYMM' เสมอจึงสมเหตุผล) ⇒ **ใส่คีย์ปี '26' ไม่ผ่าน** ทั้งตอน seed และตอน
--    ออกใบจริง · ถ้าลืมท่อนนี้ อาการคือใบสั่งขายสร้างไม่ได้ทั้งระบบ ไม่ใช่เลขเพี้ยนเงียบ ๆ
--    (ตาราง `quote_number_counters` ไม่มี CHECK ตัวนี้ — คนละใบ คนละคนเขียน)
-- ⚠️ ลบแบบ **หาชื่อเอาเอง** เพราะ CHECK ตัวเดิมเป็นชื่อที่ Postgres ตั้งให้ (ไม่ได้ตั้งชื่อ
--    ไว้ใน 0109) และกรองด้วยนิยามที่พูดถึง `month` เท่านั้น — ห้ามลบ CHECK ของ "lastNo"
--    ที่กันค่าติดลบไปด้วย
DO $ck$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.sales_order_number_counters'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%month%'
      AND conname <> 'sales_order_number_counters_month_shape'
  LOOP
    EXECUTE format('ALTER TABLE public.sales_order_number_counters DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_number_counters_month_shape') THEN
    ALTER TABLE public.sales_order_number_counters
      ADD CONSTRAINT sales_order_number_counters_month_shape
      CHECK (month ~ '^[0-9]{2}$' OR month ~ '^[0-9]{4}$');
  END IF;
END
$ck$;

COMMENT ON COLUMN public.sales_order_number_counters.month IS
  'คีย์ถังนับ — ''YY'' (ปี · ตั้งแต่ 0328) สำหรับเลขที่ออกใหม่ · ''YYMM'' คือแถวยุคเดือนที่เก็บไว้เป็นหลักฐาน';
COMMENT ON COLUMN public.quote_number_counters.month IS
  'คีย์ถังนับ — ''YY'' (ปี · ตั้งแต่ 0328) สำหรับเลขที่ออกใหม่ · ''YYMM'' คือแถวยุคเดือนที่เก็บไว้เป็นหลักฐาน';

-- ── ① seed แถว "ปี" จากเลขที่ออกไปแล้วจริง (ต้องมาก่อนสลับฟังก์ชัน) ─────────
--
-- `right(…, 4)` ใช้ได้เพราะ regex ข้างบนบังคับรูป `QT-` + 8 ตัวเลขไว้แล้ว (รูปแบบที่
-- เผยแพร่อยู่คือ `{YY}{MM}{RUNNING:4}` ไม่มีท่อนท้ายหลังเลขรัน) — ถ้าวันหนึ่งรูปแบบ
-- เปลี่ยนทรง ใบ seed ใบใหม่ต้องอ่านความกว้างจากรูปแบบ ไม่ใช่คัดบรรทัดนี้ไปใช้ต่อ
DO $seed$
DECLARE
  v_year text := to_char(timezone('Asia/Bangkok', now()), 'YY');
  v_qt   integer;
  v_so   integer;
BEGIN
  SELECT GREATEST(
    COALESCE((SELECT max(right(q."baseNumber", 4)::integer)
                FROM public.quotations q
               WHERE q."baseNumber" ~ ('^QT-' || v_year || '[0-9]{6}$')), 0),
    COALESCE((SELECT max(c."lastNo")
                FROM public.quote_number_counters c
               WHERE c.month LIKE v_year || '%' AND length(c.month) = 4), 0)
  ) INTO v_qt;

  SELECT GREATEST(
    COALESCE((SELECT max(right(o."baseNumber", 4)::integer)
                FROM public.sales_orders o
               WHERE o."baseNumber" ~ ('^SO-' || v_year || '[0-9]{6}$')), 0),
    COALESCE((SELECT max(c."lastNo")
                FROM public.sales_order_number_counters c
               WHERE c.month LIKE v_year || '%' AND length(c.month) = 4), 0)
  ) INTO v_so;

  -- ON CONFLICT ใช้ GREATEST เสมอ — trigger `doc_number_counter_guard` (0242) ห้ามถอย
  INSERT INTO public.quote_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_qt)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo", EXCLUDED."lastNo");

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_so)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo", EXCLUDED."lastNo");

  RAISE NOTICE 'ตัวนับปี % — ใบเสนอราคาเริ่มต่อจาก % · ใบสั่งขายเริ่มต่อจาก %', v_year, v_qt, v_so;
END
$seed$;

-- ── ② QT: คัดนิยามล่าสุด (0242) มาทั้งก้อน เปลี่ยนเฉพาะความหมายของ p_month ────
--
-- `p_month` = **คีย์ถังนับ** ที่แอปส่งมา (lib/salesPlanning.js) — ตั้งแต่ใบนี้เป็น `'YY'`
-- ฟังก์ชันไม่เคยตีความค่านี้เองอยู่แล้ว มันแค่เอาไปเป็นคีย์ ⇒ ฝั่ง SQL แทบไม่ต้องแก้
-- ⚠️ ชื่อพารามิเตอร์ยังเป็น `p_month` (เปลี่ยนชื่อ = ต้อง DROP ฟังก์ชันก่อน และผู้เรียก
--    ที่ส่ง named argument จะพังทันที) — ชื่อผิดความหมายแลกกับการไม่ต้องล้มฟังก์ชันที่
--    ใบเสนอราคาทุกใบเรียกใช้ · คอมเมนต์นี้คือที่ที่บอกความหมายจริง
CREATE OR REPLACE FUNCTION public.create_quotation_with_number(
  p_month     text,
  p_prefix    text,
  p_width     integer,
  p_tail      text,
  p_separator text,
  p_row       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no      integer;
  v_seed    integer := 0;
  v_base    text;
  v_cols    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'quote_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'quote_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'quote_width_invalid'; END IF;

  -- แถวเคาน์เตอร์ของรอบนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (มติ 2026-08-12)
  --
  -- 🪤 กิ่งนี้ทำงานสองจังหวะที่ต่างกันมาก:
  --    · **ปีใหม่** (ปกติ) — ยังไม่มีทั้งแถวปีและใบของปีนั้น ⇒ ได้ 0 แล้วเริ่ม 0001 ถูกต้อง
  --    · **แถวหายกลางปี** (ไม่ควรเกิด · trigger กันลบไว้) — `LIKE p_prefix || '%'` ผูกกับ
  --      **เดือนที่ออกใบ** ไม่ใช่ทั้งปี ⇒ นับได้แค่ใบของเดือนนี้ · จึงต้อง GREATEST กับ
  --      `lastNo` ของแถวยุคเดือนในปีเดียวกันด้วย ไม่งั้นเลขถอยกลับไปชนใบที่ออกไปแล้ว
  IF NOT EXISTS (SELECT 1 FROM public.quote_number_counters WHERE month = p_month) THEN
    SELECT COALESCE(max(substring("baseNumber" from length(p_prefix) + 1 for p_width)::integer), 0)
    INTO v_seed
    FROM public.quotations
    WHERE "baseNumber" LIKE p_prefix || '%'
      AND substring("baseNumber" from length(p_prefix) + 1 for p_width) ~ '^[0-9]+$';

    v_seed := GREATEST(v_seed, COALESCE((
      SELECT max("lastNo") FROM public.quote_number_counters
      WHERE month LIKE p_month || '%' AND length(month) = 4
    ), 0));
  END IF;

  INSERT INTO public.quote_number_counters AS c (month, "lastNo")
  VALUES (p_month, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  -- เพดานเป็น "ต่อปี" แล้วตั้งแต่ 0328 — ชื่อ exception บอกรอบให้ตรงกับความจริง
  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'quote_yearly_sequence_exhausted: %', p_month;
  END IF;

  -- เลขฐานผูกสายฉบับแก้ไข · เลขเต็มของฉบับแรก = ฐาน + ตัวคั่น + '0'
  v_base := p_prefix || lpad(v_no::text, p_width, '0') || COALESCE(p_tail, '');
  v_payload := p_row || jsonb_build_object(
    'baseNumber', v_base,
    'quoteNumber', v_base || COALESCE(p_separator, '') || '0'
  );

  v_cols := public.master_row_columns('quotations', v_payload);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'quote_row_empty'; END IF;

  EXECUTE format(
    'INSERT INTO public.quotations (%s) SELECT %s'
    || ' FROM jsonb_populate_record(NULL::public.quotations, $1) RETURNING to_jsonb(quotations)',
    v_cols, v_cols
  ) USING v_payload INTO v_result;

  RETURN v_result;
END;
$$;

-- ── ③ SO: คัดนิยามล่าสุด (0285) มาทั้งก้อน เปลี่ยนเฉพาะคีย์ถังนับ ────────────
--
-- ต่างจาก QT ตรงที่ **คีย์ถังนับคิดในนี้** ไม่ได้รับมาจากแอป (ใบสั่งขายเกิดจาก RPC
-- ล้วน ๆ ไม่มีฝั่ง JS ประกอบเลข) ⇒ จุดที่เปลี่ยนคือ `v_month` เดิม `to_char(…, 'YYMM')`
-- ⚠️ ท่อประกอบเลข (`{YY}{MM}` จาก v_pattern) **ห้ามแตะ** — เลขที่คนเห็นยังต้องมีเดือน
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

REVOKE ALL ON FUNCTION public.create_quotation_with_number(text, text, integer, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quotation_with_number(text, text, integer, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
