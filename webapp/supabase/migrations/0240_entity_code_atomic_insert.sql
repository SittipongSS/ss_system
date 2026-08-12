-- ── 0240 · ออกรหัส DL/PJ/PB/SV/SS/IS + insert ในทรานแซกชันเดียว ───────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): ต่อจาก 0237 ที่ปิดเลขข้ามของรหัสลูกค้า/สินค้า —
--   รหัสเอนทิตีที่เหลือมีอาการเดียวกันทุกตัว เพราะฝั่งแอปเรียก generateEntityCode()
--   จองเลขก่อน แล้วค่อย insert อีกคำสั่งหนึ่ง · RPC commit เลขตั้งแต่คำสั่งแรก
--   ⇒ insert ล้มเมื่อไร เลขนั้นหายจากระบบถาวร
--
--   ที่กินเลขจริงในโค้ดเดิม (ไม่ใช่เคสทฤษฎี):
--     · ดีล — insert ล้ม/ชน unique
--     · โครงการ — ลูป retry 5 รอบ ออกรหัสใหม่ทุกรอบที่ 23505 ⇒ กินเลขรอบละใบ
--     · ใบผลิต/นัดบริการที่ gen ทีละหลายใบ — bulk insert ล้มทั้งชุด แต่เลขจองไปครบแล้ว
--       ⇒ หายทีละหลายเลขพร้อมกัน
--
-- ⚠️ **รับหลายแถวเสมอ** (p_rows เป็น array) เพราะสองที่ที่ gen ทีละชุดต้องได้พฤติกรรม
--   เดิม: ล้มใบไหนก็ล้มทั้งชุด ไม่ใช่ค้างครึ่งทาง · ใบเดี่ยวคือ array ที่มีสมาชิกเดียว
--   ทั้งลูปอยู่ในฟังก์ชันเดียว = ทรานแซกชันเดียว ⇒ rollback คืนทุกเลขที่จองในรอบนั้น
--
-- ⚠️ **ยังใช้เคาน์เตอร์ตัวเดิม** entity_number_counters + คีย์ (scope, month) ของ mig 0096
--   ไม่มีตารางใหม่ · ต่างจาก AR/FG (mig 0230) ตรงที่ชุดนี้รันใหม่ทุกเดือนตามเดิม
--
-- ⚠️ **ฟังก์ชันไม่รู้จักรูปแบบรหัส** — รับท่อนหน้า (p_prefix = 'DL-2608') กับความกว้าง
--   มาจากแอป แล้วเติมเฉพาะเลขที่จองได้ · webapp/src/lib/entityCode.js ยังเป็นที่เดียว
--   ที่รู้ว่ารหัสหน้าตาอย่างไร (แพตเทิร์นเดียวกับ 0237)
--
-- ⚠️ ตารางปลายทางมาจาก **scope ที่ whitelist ไว้ในฟังก์ชัน** ไม่ใช่ชื่อตารางจากผู้เรียก
--   และชื่อคอลัมน์ผ่าน quote_ident เสมอ (master_row_columns ของ mig 0237)
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · CREATE OR REPLACE ล้วน = รันซ้ำได้

CREATE OR REPLACE FUNCTION public.create_entity_rows_with_code(
  p_scope  text,
  p_month  text,
  p_prefix text,
  p_width  integer,
  p_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table   text;
  v_no      integer;
  v_seed    integer := 0;
  v_pos     integer;
  v_cols    text;
  v_payload jsonb;
  v_one     jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_i       integer;
BEGIN
  -- scope ที่รับได้ + ตารางของแต่ละตัว (ที่เดียวที่ผูกสองอย่างนี้เข้าด้วยกัน)
  v_table := CASE p_scope
    WHEN 'DL' THEN 'sales_deals'
    WHEN 'PJ' THEN 'projects'
    WHEN 'PB' THEN 'production_jobs'
    WHEN 'SV' THEN 'service_visits'
    WHEN 'SS' THEN 'service_sites'
    WHEN 'IS' THEN 'system_issues'
    ELSE NULL
  END;
  IF v_table IS NULL THEN RAISE EXCEPTION 'entity_scope_unknown: %', p_scope; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'entity_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'entity_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'entity_width_invalid'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'entity_rows_must_be_array'; END IF;
  IF jsonb_array_length(p_rows) = 0 THEN RETURN v_out; END IF;

  -- ⚠️ **ห้ามใช้เลขที่เคยออกไปแล้วซ้ำ แม้แถวนั้นถูกลบทิ้ง** (มติผู้ใช้ 2026-08-12)
  -- เคาน์เตอร์บวกอย่างเดียวจึงไม่ถอยตามการลบแถวอยู่แล้ว · ที่เหลือคือกรณีแถวเคาน์เตอร์
  -- ของ (scope, month) นั้นหายไปเอง (restore บางส่วน/ลบมือ) แล้วฟังก์ชันเริ่มนับ 1 ใหม่
  -- ⇒ ตั้งต้นจาก "เลขสูงสุดที่รหัสในตารางถืออยู่จริง" แทนการเริ่มที่ 1
  -- (mig 0241 มี trigger กันลบ/กันถอยอีกชั้น — ตรงนี้คือด่านสุดท้ายเผื่อของเก่าที่หายไปแล้ว)
  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = p_scope AND month = p_month) THEN
    v_pos := length(p_prefix) + 1;
    -- p_prefix เป็นรูปแบบคงที่ของระบบ (เช่น 'DL-2608') ไม่มี % หรือ _ จึงใช้ LIKE ตรง ๆ ได้
    EXECUTE format(
      'SELECT COALESCE(max(substring(code from %s)::integer), 0) FROM public.%I'
      || ' WHERE code LIKE $1 AND substring(code from %s) ~ ''^[0-9]+$''',
      v_pos, v_table, v_pos
    ) USING p_prefix || '%' INTO v_seed;
  END IF;

  FOR v_i IN 0..jsonb_array_length(p_rows) - 1 LOOP
    INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
    VALUES (p_scope, p_month, v_seed + 1)
    ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
    RETURNING "lastNo" INTO v_no;

    IF v_no > power(10, p_width)::integer - 1 THEN
      RAISE EXCEPTION 'entity_monthly_sequence_exhausted: % %', p_scope, p_month;
    END IF;

    v_payload := (p_rows -> v_i) || jsonb_build_object('code', p_prefix || lpad(v_no::text, p_width, '0'));
    v_cols := public.master_row_columns(v_table, v_payload);
    IF v_cols IS NULL THEN RAISE EXCEPTION 'entity_row_empty'; END IF;

    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s'
      || ' FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING to_jsonb(%I)',
      v_table, v_cols, v_cols, v_table, v_table
    ) USING v_payload INTO v_one;

    v_out := v_out || jsonb_build_array(v_one);
  END LOOP;

  RETURN v_out;
END;
$$;

-- SECURITY DEFINER = ข้าม RLS ได้ ⇒ เปิดให้เฉพาะ service_role (เส้นทางเดียวที่แอปใช้)
REVOKE ALL ON FUNCTION public.create_entity_rows_with_code(text, text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_entity_rows_with_code(text, text, text, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
