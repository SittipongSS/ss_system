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
