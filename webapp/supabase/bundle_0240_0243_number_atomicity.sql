-- ══════════════════════════════════════════════════════════════════════════════
--  ชุดรวม: เลขที่ระบบรันให้ "ห้ามข้าม ห้ามซ้ำ" — mig 0240 · 0241 · 0242 · 0243
--
--  วางทั้งไฟล์นี้ใน Supabase → SQL Editor แล้ว Run ครั้งเดียวได้เลย
--  (เนื้อในคือสี่ใบเรียงตามลำดับ ไม่มีอะไรเพิ่ม-ลด · CREATE OR REPLACE ล้วน รันซ้ำได้)
--
--  ครอบคลุม
--    0240  DL · PJ · PB · SV · SS · IS   ออกรหัสพร้อม insert (รับหลายแถวต่อครั้ง)
--    0241  กันเลขที่ออกไปแล้วถูกออกซ้ำ    trigger กันเคาน์เตอร์ถอย/ถูกลบ/ถูก truncate
--          + แทนนิยาม AR/FG ของ 0237 ให้ตั้งต้นจากรหัสสูงสุดที่มีจริงถ้าแถวหาย
--    0242  QT (ใบเสนอราคา) · CR (ใบขอราคาผลิต)
--    0243  เลขที่คำร้อง (dept_requests) — ทั้งกดส่งและเปิด-ส่งในจังหวะเดียว
--
--  ⚠️ ต้องรัน **ก่อน** deploy โค้ดของ PR นี้ — โค้ดใหม่เรียกฟังก์ชันเหล่านี้ตรง ๆ
--     ถ้า deploy ก่อนรัน การสร้างดีล/โครงการ/ใบผลิต/นัด/ไซต์/เรื่องแจ้งระบบ/
--     ใบเสนอราคา/ใบขอราคาผลิต/คำร้อง จะพังทันที
--
--  ⚠️ 0237 (AR/FG) รันไปแล้วเมื่อ 2026-08-12 — ไฟล์นี้ไม่ได้รวมไว้ ไม่ต้องรันซ้ำ
--     (0241 เป็นตัวแทนนิยามของมันด้วยอยู่แล้ว)
-- ══════════════════════════════════════════════════════════════════════════════



-- ┌────────────────────────────────────────────────────────────────────────┐
-- │  0240_entity_code_atomic_insert.sql                                  │
-- └────────────────────────────────────────────────────────────────────────┘

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


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │  0241_entity_counter_no_reuse.sql                                    │
-- └────────────────────────────────────────────────────────────────────────┘

-- ── 0241 · ห้ามเอาเลขที่เคยออกไปแล้วกลับมาใช้ใหม่ ────────────────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): "การไม่ข้ามเลข ต้องห้ามเอาเลขที่เคยใช้แล้วถูกลบ
--   กลับมาใช้ใหม่ ห้าม reuse"
--
--   สองเรื่องนี้เป็นคนละเรื่องและต้องได้ทั้งคู่:
--     · **ไม่ข้าม** = insert ล้มแล้วเลขต้องคืน  → mig 0237/0240 (ทรานแซกชันเดียว)
--     · **ไม่ซ้ำ**  = แถวถูกลบทีหลังแล้วเลขนั้นต้องไม่ถูกออกให้ใบอื่นอีก → ใบนี้
--
--   เลขที่ออกไปแล้วอยู่บนใบเสนอราคา/ใบสั่งขาย/เอกสารที่ส่งลูกค้า/ทะเบียนสรรพสามิต
--   ⇒ ออกซ้ำเมื่อไร เอกสารสองใบคนละเรื่องจะอ้างรหัสเดียวกัน แล้วไม่มีอะไรบอกว่าอันไหนจริง
--
-- ⚠️ **ตัวเคาน์เตอร์เองบวกอย่างเดียวอยู่แล้ว** — ลบดีล/โครงการ/ใบผลิตทิ้ง เคาน์เตอร์
--   ไม่ถอยตาม ⇒ เลขที่ถูกลบจะกลายเป็นช่องว่างถาวร ซึ่ง**ถูกต้องตามที่ต้องการ**
--   (การลบจริงมีอยู่หลายทาง เช่น ลบดีล · deleteProjectDeep · rollback ของ
--    sahamit/po/create-project ที่ลบโครงการทิ้งเมื่อ template ล้ม)
--
--   ที่ยังทำให้ reuse ได้คือ "เคาน์เตอร์ถอยหรือหาย" ซึ่งใบนี้ปิดสามทาง:
--     ① UPDATE ให้ "lastNo" ต่ำลง (แก้มือ · สคริปต์ซิงก์ที่ลืม GREATEST)
--     ② DELETE แถวเคาน์เตอร์ทิ้ง (แล้วฟังก์ชันเริ่มนับใหม่)
--     ③ TRUNCATE ทั้งตาราง (row trigger ไม่จับ ต้องมี statement trigger แยก)
--   ส่วนกรณี "แถวเคาน์เตอร์หายไปก่อนหน้านี้" จับที่ตัวฟังก์ชัน: ตั้งต้นจากเลขสูงสุด
--   ที่รหัสในตารางถืออยู่จริง แทนการเริ่มที่ 1 (mig 0240 ทำแล้ว · ใบนี้เติมให้ AR/FG)
--
-- ⚠️ ยังไม่คุ้ม `quote_number_counters` (mig 0092) และ `sales_order_number_counters`
--   (mig 0109) — สองตัวนั้นยังจองเลขแยกจาก insert อยู่ (ยกเว้น SO ที่อยู่ใน
--   create_sales_order_draft แล้ว) ค่อยทำพร้อมกันตอนยกสองท่อนั้น
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · รันซ้ำได้

-- ── ① ② ③ กันเคาน์เตอร์ถอย/หาย ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.entity_number_counter_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- ทางออกที่ต้อง "ประกาศเจตนา" ก่อนเสมอ: SET app.entity_counter_unlock = 'on';
  -- มีไว้สำหรับการเลิกใช้ scope ทั้งตัว (เช่น mig 0158 ล้าง 'MR' · 0174 ล้าง 'IQ')
  -- ซึ่งชอบธรรมเพราะ scope นั้นไม่มีใครออกรหัสอีกแล้ว — ไม่ใช่ทางลัดสำหรับ scope ที่ยังใช้อยู่
  IF COALESCE(current_setting('app.entity_counter_unlock', true), '') = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entity_number_counter_delete_forbidden: % %', OLD.scope, OLD.month
      USING HINT = 'ลบแถวเคาน์เตอร์ = เลขที่เคยออกไปแล้วจะถูกออกซ้ำ · ตั้งใจล้าง scope ที่เลิกใช้จริง ให้สั่ง SET app.entity_counter_unlock = ''on''; ก่อน แล้ว RESET หลังเสร็จ';
  END IF;
  IF NEW.scope IS DISTINCT FROM OLD.scope OR NEW.month IS DISTINCT FROM OLD.month THEN
    RAISE EXCEPTION 'entity_number_counter_key_immutable: % % -> % %', OLD.scope, OLD.month, NEW.scope, NEW.month;
  END IF;
  IF NEW."lastNo" < OLD."lastNo" THEN
    RAISE EXCEPTION 'entity_number_counter_rewind_forbidden: % % (% -> %)', OLD.scope, OLD.month, OLD."lastNo", NEW."lastNo"
      USING HINT = 'เคาน์เตอร์เดินหน้าอย่างเดียว · ซิงก์จากข้อมูลจริงต้องใช้ GREATEST เสมอ';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_number_counter_guard_row ON public.entity_number_counters;
CREATE TRIGGER entity_number_counter_guard_row
  BEFORE UPDATE OR DELETE ON public.entity_number_counters
  FOR EACH ROW EXECUTE FUNCTION public.entity_number_counter_guard();

-- TRUNCATE ไม่ผ่าน row trigger — ต้องดักที่ระดับ statement แยกอีกตัว
CREATE OR REPLACE FUNCTION public.entity_number_counter_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.entity_counter_unlock', true), '') = 'on' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'entity_number_counter_truncate_forbidden'
    USING HINT = 'ล้างตารางนี้ = ทุก scope เริ่มนับหนึ่งใหม่ แล้วรหัสที่ออกไปแล้วจะถูกออกซ้ำทั้งระบบ';
END;
$$;

DROP TRIGGER IF EXISTS entity_number_counter_guard_truncate ON public.entity_number_counters;
CREATE TRIGGER entity_number_counter_guard_truncate
  BEFORE TRUNCATE ON public.entity_number_counters
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_number_counter_no_truncate();

-- ── AR/FG: ตั้งต้นจากรหัสสูงสุดที่มีอยู่จริง ถ้าแถวเคาน์เตอร์หายไปแล้ว ───────
-- (แทนที่นิยามของ mig 0237 — ส่วนอื่นเหมือนเดิมทุกบรรทัด)
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
  v_seed    integer := 1000;   -- เลขแรกที่จะออกคือ 1001 (mig 0230)
  v_cols    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'master_code_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'master_code_width_invalid'; END IF;

  -- แถวเคาน์เตอร์หาย = ต้องไม่เริ่มนับใหม่ทับเลขที่ออกไปแล้ว (มติผู้ใช้ 2026-08-12)
  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'AR' AND month = '-') THEN
    SELECT GREATEST(v_seed, COALESCE(max(substring("arCode" from length(p_prefix) + 1)::integer), 0))
    INTO v_seed
    FROM public.customers
    WHERE "arCode" LIKE p_prefix || '%'
      AND substring("arCode" from length(p_prefix) + 1) ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('AR', '-', v_seed + 1)
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
  v_seed    integer := 10000;  -- เลขแรกที่จะออกคือ 10001 (mig 0230)
  v_cols    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'master_code_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'master_code_width_invalid'; END IF;

  -- ⚠️ เลขรัน FG นับรวมทั้งระบบ (mig 0230) — ท่อนหน้าต่างกันทุกลูกค้า/หมวด จึงหา
  -- เลขสูงสุดจาก **ท่อนท้ายของรหัส FG รูปแบบใหม่ทุกใบ** ไม่ใช่เฉพาะ prefix ของใบนี้
  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'FG' AND month = '-') THEN
    SELECT GREATEST(v_seed, COALESCE(max(split_part("fgCode", '-', 5)::integer), 0))
    INTO v_seed
    FROM public.products
    WHERE "fgCode" ~ '^FG-\d{4}-\d{2}-\d{3}-\d{5}$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('FG', '-', v_seed + 1)
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

REVOKE ALL ON FUNCTION public.create_customer_with_code(text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_product_with_code(text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_with_code(text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_product_with_code(text, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │  0242_quote_costing_atomic_number.sql                                │
-- └────────────────────────────────────────────────────────────────────────┘

-- ── 0242 · เลขใบเสนอราคา (QT) และใบขอราคาผลิต (CR) ออกพร้อมบันทึกแถว ─────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): ปิดสองท่อสุดท้ายที่ยังจองเลขแยกจากการบันทึก
--   ต่อจาก 0237 (AR/FG) และ 0240 (DL/PJ/PB/SV/SS/IS)
--
--   QT — createQuotationDraft เรียก generateQuoteNumber() ก่อน แล้วค่อย insert
--        ⇒ insert ล้ม (ลูกค้า/ที่อยู่/ยอดเงินไม่ผ่าน constraint) = เลขใบเสนอราคาหายถาวร
--   CR — ออกเลขตอน "กดส่งผู้บริหาร" แล้ว UPDATE แถวเดิม ⇒ UPDATE ล้ม = เลขหาย
--        และถ้ากดส่งซ้ำหลังจากนั้น จะได้เลขใหม่อีกใบ (guard 0141 ห้ามเปลี่ยนเลขที่ออกแล้ว
--        ก็จริง แต่เลขที่ถูกจองไปตอนล้มไม่มีใครถืออยู่แล้ว)
--
-- ⚠️ **QT ยังใช้ quote_number_counters ตัวเดิม (mig 0092)** ไม่ย้ายมา entity_number_counters
--   เพราะการย้ายแหล่งเลขของเอกสารที่ออกไปหาลูกค้าแล้วมีความเสี่ยงมากกว่าที่ได้
--   ส่วน CR ใช้ entity_number_counters scope 'CR' ตามเดิม
--
-- ⚠️ **ฟังก์ชันไม่รู้จักรูปแบบเลข** — QT รับ prefix/ความกว้าง/ท่อนท้าย/ตัวคั่น มาจากแอป
--   ซึ่งแตกมาจาก "รูปแบบเลขที่" ของมาตรฐานเอกสารที่เผยแพร่ (mig 0123) ผ่าน
--   documentNumberSlots() ใน lib/documentStandards.js — ที่เดียวที่รู้จัก token
--
-- ⚠️ ตั้งต้นจากเลขสูงสุดที่มีอยู่จริงถ้าแถวเคาน์เตอร์หาย (กติกาเดียวกับ 0241)
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · CREATE OR REPLACE ล้วน = รันซ้ำได้

-- ── รายชื่อคอลัมน์สำหรับ UPDATE (คู่กับ master_row_columns ของ 0237) ────────
CREATE OR REPLACE FUNCTION public.master_row_assignments(p_table text, p_row jsonb, p_alias text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT string_agg(
    format('%I = %I.%I', c.column_name, p_alias, c.column_name),
    ', ' ORDER BY c.ordinal_position
  )
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table
    AND p_row ? c.column_name;
$$;

-- ── QT: ออกเลข + insert ใบเสนอราคาในคำสั่งเดียว ────────────────────────────
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

  -- แถวเคาน์เตอร์ของเดือนนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (มติ 2026-08-12)
  IF NOT EXISTS (SELECT 1 FROM public.quote_number_counters WHERE month = p_month) THEN
    SELECT COALESCE(max(substring("baseNumber" from length(p_prefix) + 1 for p_width)::integer), 0)
    INTO v_seed
    FROM public.quotations
    WHERE "baseNumber" LIKE p_prefix || '%'
      AND substring("baseNumber" from length(p_prefix) + 1 for p_width) ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.quote_number_counters AS c (month, "lastNo")
  VALUES (p_month, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'quote_monthly_sequence_exhausted: %', p_month;
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

-- ── CR: ออกเลขที่เอกสาร + UPDATE แถวเดิมในคำสั่งเดียว ──────────────────────
-- ใบขอราคาผลิตมีตัวตนก่อนมีเลข (เลขออกตอนกดส่งผู้บริหาร — guard 0141 ห้ามเปลี่ยนทีหลัง)
-- ⇒ ไม่ใช่ insert-with-code แต่เป็น update-with-code · ใบที่มีเลขแล้วส่งซ้ำต้องไม่กินเลขใหม่
CREATE OR REPLACE FUNCTION public.assign_costing_doc_no(
  p_id     text,
  p_month  text,
  p_prefix text,
  p_width  integer,
  p_patch  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc     text;
  v_no      integer;
  v_seed    integer := 0;
  v_sets    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'costing_id_required'; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'costing_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'costing_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'costing_width_invalid'; END IF;

  -- ล็อกแถวก่อนอ่านเลขเดิม — สองคนกดส่งพร้อมกันต้องไม่ได้เลขคนละใบบนใบเดียวกัน
  SELECT "docNo" INTO v_doc FROM public.costing_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'costing_request_not_found: %', p_id; END IF;

  IF v_doc IS NULL OR v_doc = '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'CR' AND month = p_month) THEN
      SELECT COALESCE(max(substring("docNo" from length(p_prefix) + 1)::integer), 0)
      INTO v_seed
      FROM public.costing_requests
      WHERE "docNo" LIKE p_prefix || '%'
        AND substring("docNo" from length(p_prefix) + 1) ~ '^[0-9]+$';
    END IF;

    INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
    VALUES ('CR', p_month, v_seed + 1)
    ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
    RETURNING "lastNo" INTO v_no;

    IF v_no > power(10, p_width)::integer - 1 THEN
      RAISE EXCEPTION 'costing_monthly_sequence_exhausted: %', p_month;
    END IF;
    v_doc := p_prefix || lpad(v_no::text, p_width, '0');
  END IF;

  v_payload := COALESCE(p_patch, '{}'::jsonb) || jsonb_build_object('docNo', v_doc);
  v_sets := public.master_row_assignments('costing_requests', v_payload, 'r');
  IF v_sets IS NULL THEN RAISE EXCEPTION 'costing_patch_empty'; END IF;

  EXECUTE format(
    'UPDATE public.costing_requests t SET %s'
    || ' FROM jsonb_populate_record(NULL::public.costing_requests, $1) r'
    || ' WHERE t.id = $2 RETURNING to_jsonb(t)',
    v_sets
  ) USING v_payload, p_id INTO v_result;

  IF v_result IS NULL THEN RAISE EXCEPTION 'costing_request_not_updated: %', p_id; END IF;
  RETURN v_result;
END;
$$;

-- ── กันเลขซ้ำที่ตัวนับใบเสนอราคา/ใบสั่งขายด้วย (กติกาเดียวกับ 0241) ─────────
-- ตัวนับสองตัวนี้มีคีย์แค่ month (ไม่มี scope) จึงใช้ guard คนละตัวกับ entity_number_counters
-- อ่านค่าผ่าน to_jsonb(OLD/NEW) เพื่อไม่ผูกกับชื่อคอลัมน์ของตารางใดตารางหนึ่ง
CREATE OR REPLACE FUNCTION public.doc_number_counter_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb;
BEGIN
  IF COALESCE(current_setting('app.entity_counter_unlock', true), '') = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'doc_number_counter_delete_forbidden: % %', TG_TABLE_NAME, COALESCE(v_old->>'month', '')
      USING HINT = 'ลบแถวเคาน์เตอร์ = เลขที่ออกไปแล้วจะถูกออกซ้ำ · ตั้งใจล้างจริงให้สั่ง SET LOCAL app.entity_counter_unlock = ''on''; ก่อน';
  END IF;

  v_new := to_jsonb(NEW);
  IF v_new->>'month' IS DISTINCT FROM v_old->>'month' THEN
    RAISE EXCEPTION 'doc_number_counter_key_immutable: % % -> %', TG_TABLE_NAME, v_old->>'month', v_new->>'month';
  END IF;
  IF (v_new->>'lastNo')::integer < (v_old->>'lastNo')::integer THEN
    RAISE EXCEPTION 'doc_number_counter_rewind_forbidden: % % (% -> %)',
      TG_TABLE_NAME, v_old->>'month', v_old->>'lastNo', v_new->>'lastNo'
      USING HINT = 'เคาน์เตอร์เดินหน้าอย่างเดียว · ซิงก์จากข้อมูลจริงต้องใช้ GREATEST เสมอ';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_number_counter_guard_row ON public.quote_number_counters;
CREATE TRIGGER quote_number_counter_guard_row
  BEFORE UPDATE OR DELETE ON public.quote_number_counters
  FOR EACH ROW EXECUTE FUNCTION public.doc_number_counter_guard();

DROP TRIGGER IF EXISTS sales_order_number_counter_guard_row ON public.sales_order_number_counters;
CREATE TRIGGER sales_order_number_counter_guard_row
  BEFORE UPDATE OR DELETE ON public.sales_order_number_counters
  FOR EACH ROW EXECUTE FUNCTION public.doc_number_counter_guard();

DROP TRIGGER IF EXISTS quote_number_counter_guard_truncate ON public.quote_number_counters;
CREATE TRIGGER quote_number_counter_guard_truncate
  BEFORE TRUNCATE ON public.quote_number_counters
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_number_counter_no_truncate();

DROP TRIGGER IF EXISTS sales_order_number_counter_guard_truncate ON public.sales_order_number_counters;
CREATE TRIGGER sales_order_number_counter_guard_truncate
  BEFORE TRUNCATE ON public.sales_order_number_counters
  FOR EACH STATEMENT EXECUTE FUNCTION public.entity_number_counter_no_truncate();

REVOKE ALL ON FUNCTION public.master_row_assignments(text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_quotation_with_number(text, text, integer, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_costing_doc_no(text, text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_row_assignments(text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_quotation_with_number(text, text, integer, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_costing_doc_no(text, text, text, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │  0243_request_doc_no_atomic.sql                                      │
-- └────────────────────────────────────────────────────────────────────────┘

-- ── 0243 · เลขที่คำร้อง (dept_requests) ออกพร้อมบันทึกแถว ─────────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): ใบสุดท้ายของชุด "เลขห้ามข้าม ห้ามซ้ำ"
--   ต่อจาก 0237 (AR/FG) · 0240 (DL/PJ/PB/SV/SS/IS) · 0241 (กัน reuse) · 0242 (QT/CR)
--
-- ⚠️ **ท่อนี้เลขข้ามจริงบน production แล้ว ไม่ใช่เคสทฤษฎี** — บั๊กที่ผู้ใช้แจ้งเอง
--   (IS-26080010 · 2026-08-11): ใบที่ถูกตีกลับกลับเป็นร่างโดยยังถือ docNo เดิม แต่เส้นทาง
--   กดส่งออกเลขใหม่ทุกครั้ง แล้ว UPDATE ไปชน trigger dept_request_doc_no_immutable
--   ⇒ ตัวนับ RQ เดือน 2608 วิ่งไปถึง 37 ทั้งที่เลขที่ออกจริงสูงสุดคือ RQ-26080029
--   (แปลว่ากินทิ้งไป 8 เลข) · โค้ดแก้อาการนั้นไปแล้วด้วย ensureRequestDocNo
--   แต่โครงยังเป็น "จองเลขก่อน แล้วค่อยเขียนแถว" ซึ่งกินเลขได้อยู่ดีทุกครั้งที่เขียนล้ม
--
-- ⚠️ คำร้องมีสองทางเข้า จึงมีสองฟังก์ชัน:
--     · กดส่งใบที่มีอยู่ (สายปกติ)      → assign_dept_request_doc_no  (update-with-code)
--     · เปิดแล้วส่งในจังหวะเดียว (ขอ    → create_dept_request_with_doc_no (insert-with-code)
--       อัปเดตกำหนดของเข้าจากหน้าโครงการ)
--
-- ⚠️ **ใบที่มีเลขแล้วต้องไม่กินเลขใหม่** — ตีกลับแล้วส่งซ้ำคือใบเดิม (มติ mig 0209)
--   ฟังก์ชัน assign จึงล็อกแถวแล้วอ่าน docNo เดิมก่อนเสมอ
--
-- ⚠️ **scope ไม่ whitelist ตายตัว** ต่างจาก 0240 — scope ของคำร้องมาจาก "หัวข้อ"
--   (requestDocScope ใน lib/master/requestTypes.js) ซึ่งเพิ่มได้เรื่อย ๆ ตามหัวข้อใหม่
--   ที่นี่จึงตรวจแค่รูปทรง (A-Z 2–4 ตัว) แล้วปล่อยให้ฝั่งแอปเป็นเจ้าของกติกา
--   ⇒ ตารางปลายทางคงที่ (dept_requests) จึงไม่มีความเสี่ยงเรื่องตารางผิด
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · CREATE OR REPLACE ล้วน = รันซ้ำได้

-- ── ตัวช่วยร่วม: เลขถัดไปของ scope+เดือน (ตั้งต้นจากเลขสูงสุดที่มีจริงถ้าแถวหาย) ──
CREATE OR REPLACE FUNCTION public.next_request_running_no(
  p_scope  text,
  p_month  text,
  p_prefix text,
  p_width  integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seed integer := 0;
  v_no   integer;
BEGIN
  IF p_scope !~ '^[A-Z]{2,4}$' THEN RAISE EXCEPTION 'request_scope_invalid: %', p_scope; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'request_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'request_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'request_width_invalid'; END IF;

  -- แถวเคาน์เตอร์หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ 0241)
  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = p_scope AND month = p_month) THEN
    SELECT COALESCE(max(substring("docNo" from length(p_prefix) + 1)::integer), 0)
    INTO v_seed
    FROM public.dept_requests
    WHERE "docNo" LIKE p_prefix || '%'
      AND substring("docNo" from length(p_prefix) + 1) ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES (p_scope, p_month, v_seed + 1)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'request_monthly_sequence_exhausted: % %', p_scope, p_month;
  END IF;
  RETURN v_no;
END;
$$;

-- ── กดส่ง: ออกเลข (ถ้ายังไม่มี) + UPDATE ในคำสั่งเดียว ─────────────────────
CREATE OR REPLACE FUNCTION public.assign_dept_request_doc_no(
  p_id     text,
  p_scope  text,
  p_month  text,
  p_prefix text,
  p_width  integer,
  p_patch  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc     text;
  v_no      integer;
  v_sets    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'request_id_required'; END IF;

  -- ล็อกแถวก่อนอ่านเลขเดิม — สองคนกดส่งพร้อมกันต้องไม่ได้คนละเลขบนใบเดียวกัน
  SELECT "docNo" INTO v_doc FROM public.dept_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dept_request_not_found: %', p_id; END IF;

  -- ใบที่ถูกตีกลับยังถือเลขเดิม (มติ mig 0209) ⇒ ส่งซ้ำต้องไม่กินเลขใหม่
  IF v_doc IS NULL OR v_doc = '' THEN
    v_no := public.next_request_running_no(p_scope, p_month, p_prefix, p_width);
    v_doc := p_prefix || lpad(v_no::text, p_width, '0');
  END IF;

  v_payload := COALESCE(p_patch, '{}'::jsonb) || jsonb_build_object('docNo', v_doc);
  v_sets := public.master_row_assignments('dept_requests', v_payload, 'r');
  IF v_sets IS NULL THEN RAISE EXCEPTION 'request_patch_empty'; END IF;

  EXECUTE format(
    'UPDATE public.dept_requests t SET %s'
    || ' FROM jsonb_populate_record(NULL::public.dept_requests, $1) r'
    || ' WHERE t.id = $2 RETURNING to_jsonb(t)',
    v_sets
  ) USING v_payload, p_id INTO v_result;

  IF v_result IS NULL THEN RAISE EXCEPTION 'dept_request_not_updated: %', p_id; END IF;
  RETURN v_result;
END;
$$;

-- ── เปิดแล้วส่งในจังหวะเดียว: ออกเลข + insert ในคำสั่งเดียว ────────────────
CREATE OR REPLACE FUNCTION public.create_dept_request_with_doc_no(
  p_scope  text,
  p_month  text,
  p_prefix text,
  p_width  integer,
  p_row    jsonb
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
  v_no := public.next_request_running_no(p_scope, p_month, p_prefix, p_width);
  v_payload := p_row || jsonb_build_object('docNo', p_prefix || lpad(v_no::text, p_width, '0'));

  v_cols := public.master_row_columns('dept_requests', v_payload);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'request_row_empty'; END IF;

  EXECUTE format(
    'INSERT INTO public.dept_requests (%s) SELECT %s'
    || ' FROM jsonb_populate_record(NULL::public.dept_requests, $1) RETURNING to_jsonb(dept_requests)',
    v_cols, v_cols
  ) USING v_payload INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.next_request_running_no(text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_dept_request_doc_no(text, text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_dept_request_with_doc_no(text, text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_request_running_no(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_dept_request_doc_no(text, text, text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_dept_request_with_doc_no(text, text, text, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
