-- ── 0239 · ห้ามเอาเลขที่เคยออกไปแล้วกลับมาใช้ใหม่ ────────────────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): "การไม่ข้ามเลข ต้องห้ามเอาเลขที่เคยใช้แล้วถูกลบ
--   กลับมาใช้ใหม่ ห้าม reuse"
--
--   สองเรื่องนี้เป็นคนละเรื่องและต้องได้ทั้งคู่:
--     · **ไม่ข้าม** = insert ล้มแล้วเลขต้องคืน  → mig 0237/0238 (ทรานแซกชันเดียว)
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
--   ที่รหัสในตารางถืออยู่จริง แทนการเริ่มที่ 1 (mig 0238 ทำแล้ว · ใบนี้เติมให้ AR/FG)
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
