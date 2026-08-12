-- ── 0237 · ออกรหัส AR/FG + insert ในทรานแซกชันเดียว (insert ล้ม = เลขคืน) ──────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): เลขรันของลูกค้า/สินค้า "ข้าม" ได้ เพราะฝั่งแอปจอง
--   เลขผ่าน RPC หนึ่งครั้ง แล้วค่อย insert อีกครั้งหนึ่ง — สองคำสั่ง สองทรานแซกชัน
--   RPC commit เลขไปแล้วตั้งแต่บรรทัดแรก ⇒ insert ล้มเมื่อไร เลขนั้นหายจากระบบถาวร
--   PR ก่อนหน้าย้ายด่านตรวจทุกด่านขึ้นเหนือจุดจองแล้ว เหลือ insert เองที่ยังกินเลขได้
--   (ชน unique จริง ๆ / คอนเนกชันหลุดกลางคัน) ใบนี้ปิดช่องที่เหลือ
--
-- ⚠️ **ยังใช้เคาน์เตอร์ตัวเดิม** `entity_number_counters` + คีย์ (scope='AR'|'FG',
--   month='-') ของ mig 0230 · ไม่มีตารางใหม่ ไม่มีเลขชุดใหม่ ที่เปลี่ยนคือ "บวกเลขกับ
--   insert อยู่ในคำสั่งเดียวกัน" ⇒ RAISE/ล้มตรงไหนก็ตาม เลขที่บวกไปถูก rollback คืน
--   แพตเทิร์นเดียวกับ create_sales_order_draft (mig 0155) ซึ่งไม่เคยมีปัญหาเลขข้าม
--
-- ⚠️ **ฟังก์ชันนี้ไม่รู้จักรูปแบบรหัส** — รับ "ท่อนหน้าเลขรัน" (p_prefix) กับความกว้าง
--   (p_width) มาจากฝั่งแอป แล้วเติมเฉพาะตัวเลขที่จองได้ · webapp/src/lib/master/
--   masterCodes.js ยังเป็นที่เดียวที่รู้ว่า AR-AAAA / FG-AAAA-BB-CCC-DDDDD หน้าตาอย่างไร
--   (ถ้าย้ายรูปแบบมาไว้ใน SQL ด้วย จะมีสองที่ที่รู้ แล้ววันหนึ่งจะไม่ตรงกัน)
--
-- ⚠️ **แถวส่งมาเป็น jsonb แล้วเลือกคอลัมน์ตามคีย์ที่ส่งจริง** — ไม่ใช่ populate ทั้งแถว
--   เพราะคอลัมน์ที่ไม่ได้ส่งจะกลายเป็น NULL ทับ DEFAULT ของตาราง แล้วชน NOT NULL ทันที
--   (customers/products มี "updatedAt" not null default now() ซึ่งฝั่งแอปไม่เคยส่ง)
--   คีย์ที่ไม่ใช่คอลัมน์จริงถูกทิ้งเงียบ ๆ ตรงนี้ — ชื่อคอลัมน์ผ่าน quote_ident เสมอ
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · CREATE OR REPLACE ล้วน = รันซ้ำได้

-- ── ชื่อคอลัมน์ที่จะ insert จริง = คีย์ใน jsonb ∩ คอลัมน์ของตาราง ────────────
CREATE OR REPLACE FUNCTION public.master_row_columns(p_table text, p_row jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table
    AND p_row ? c.column_name;
$$;

-- ── ลูกค้า: จองเลข AR + insert ในคำสั่งเดียว ───────────────────────────────
CREATE OR REPLACE FUNCTION public.create_customer_with_code(
  p_prefix text,
  p_width integer,
  p_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no      integer;
  v_cols    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'master_code_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'master_code_width_invalid'; END IF;

  -- GREATEST กับเลขแรกของ scope: แถวเคาน์เตอร์ที่หายไปหรือถูกตั้งต่ำกว่าที่ mig 0230
  -- วางไว้ ต้องไม่ทำให้ออกรหัส AR-0001 ซึ่งชนช่วงของรหัสรูปแบบเดิม
  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('AR', '-', 1001)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo" + 1, 1001)
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'master_code_sequence_exhausted';
  END IF;

  v_payload := p_row || jsonb_build_object('arCode', p_prefix || lpad(v_no::text, p_width, '0'));
  v_cols := public.master_row_columns('customers', v_payload);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'master_row_empty'; END IF;

  EXECUTE format(
    'INSERT INTO public.customers (%s) SELECT %s'
    || ' FROM jsonb_populate_record(NULL::public.customers, $1) RETURNING to_jsonb(customers)',
    v_cols, v_cols
  ) USING v_payload INTO v_result;

  RETURN v_result;
END;
$$;

-- ── สินค้า: จองเลขรัน FG + insert ในคำสั่งเดียว ────────────────────────────
CREATE OR REPLACE FUNCTION public.create_product_with_code(
  p_prefix text,
  p_width integer,
  p_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no      integer;
  v_cols    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'master_code_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'master_code_width_invalid'; END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('FG', '-', 10001)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo" + 1, 10001)
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'master_code_sequence_exhausted';
  END IF;

  v_payload := p_row || jsonb_build_object('fgCode', p_prefix || lpad(v_no::text, p_width, '0'));
  v_cols := public.master_row_columns('products', v_payload);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'master_row_empty'; END IF;

  EXECUTE format(
    'INSERT INTO public.products (%s) SELECT %s'
    || ' FROM jsonb_populate_record(NULL::public.products, $1) RETURNING to_jsonb(products)',
    v_cols, v_cols
  ) USING v_payload INTO v_result;

  RETURN v_result;
END;
$$;

-- SECURITY DEFINER = ข้าม RLS ได้ ⇒ เปิดให้เฉพาะ service_role (เส้นทางเดียวที่แอปใช้)
-- เหมือน create_sales_order_draft · ห้ามเปิดให้ anon/authenticated เด็ดขาด
REVOKE ALL ON FUNCTION public.master_row_columns(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_with_code(text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_product_with_code(text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_row_columns(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_with_code(text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_product_with_code(text, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
