-- ── 0240 · เลขใบเสนอราคา (QT) และใบขอราคาผลิต (CR) ออกพร้อมบันทึกแถว ─────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-12): ปิดสองท่อสุดท้ายที่ยังจองเลขแยกจากการบันทึก
--   ต่อจาก 0237 (AR/FG) และ 0238 (DL/PJ/PB/SV/SS/IS)
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
-- ⚠️ ตั้งต้นจากเลขสูงสุดที่มีอยู่จริงถ้าแถวเคาน์เตอร์หาย (กติกาเดียวกับ 0239)
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

-- ── กันเลขซ้ำที่ตัวนับใบเสนอราคา/ใบสั่งขายด้วย (กติกาเดียวกับ 0239) ─────────
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
