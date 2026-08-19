-- ── 0271 · เลขที่เอกสาร PDR (DDMMYY-XXX) ────────────────────────────
--
-- ⭐ ที่มา (IS-26080030 ข้อ 1 · RD แจ้งเอง 2026-08-18 · มติผู้ใช้ 2026-08-20):
--   หัวเอกสาร PDR ต้องมีเลขที่เอกสารของฝ่าย RD ต่อท้ายรหัสแบบฟอร์ม แบบเดียวกับ
--   กระดาษเดิม `FM-RD-01-170869-016` ⇒ ส่วนที่ระบบต้องออกให้คือ **170869-016**
--     · DDMMYY = วันที่ RD **รับเรื่อง** (พ.ศ. 2 หลัก — 2569 ⇒ 69)
--     · XXX    = เลขรัน 3 หลัก **ตัดรอบทุกเดือน**
--
-- ⚠️ **ไม่ใช่ `docNo`** — `docNo` (SB-26080001) คือเลขที่คำร้อง ออกตอนผู้ขอกดส่ง
--   และแก้ไม่ได้ที่ระดับ trigger · เลขที่เอกสารนี้เป็นของ **ฝ่ายปลายทาง** ออกคนละ
--   จังหวะ (ตอนรับเรื่อง) จึงต้องเป็นคอลัมน์ของตัวเอง ห้ามเปิด `docNo` มาใช้ซ้ำ
--
-- ⚠️ **ตัวนับแยกจาก SB** (มติผู้ใช้ 2026-08-20) — ไม่ได้ตัดเลขรันของ `docNo` มาใช้
--   เพราะสองเลขออกคนละจังหวะ: ใบที่ส่งเดือนนี้แต่ RD รับเดือนหน้าจะได้เลขที่เอกสาร
--   ของเดือนหน้า · และ `docNo` กว้าง 4 หลักแต่เลขที่เอกสารกว้าง 3 ⇒ ตัดมาใช้ตรง ๆ
--   จะล้นเงียบ ๆ ที่ใบที่ 1000 ของเดือน
--
-- ⚠️ **ออกเลขพร้อม UPDATE ในคำสั่งเดียว** เหมือน 0243 — จองเลขก่อนแล้วค่อยเขียนแถว
--   คือท่าที่เคยทำให้ตัวนับ RQ วิ่งเกินเลขที่ออกจริง 8 เลขบน production มาแล้ว
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · รันซ้ำได้

ALTER TABLE public.dept_requests ADD COLUMN IF NOT EXISTS "pdrRefNo" text;

COMMENT ON COLUMN public.dept_requests."pdrRefNo" IS
  'เลขที่เอกสาร PDR รูปแบบ DDMMYY-XXX (วันที่รับเรื่อง พ.ศ. · เลขรันตัดรอบเดือน) — คนละตัวกับ docNo';

-- เลขที่ออกไปแล้วห้ามซ้ำ (ใบที่ยังไม่ออกเลขเป็น NULL ได้ไม่จำกัด)
CREATE UNIQUE INDEX IF NOT EXISTS dept_requests_pdr_ref_no_key
  ON public.dept_requests ("pdrRefNo") WHERE "pdrRefNo" IS NOT NULL;

-- ── ออกเลขไม่ได้แล้วแก้: กติกาเดียวกับ docNo ─────────────────────────────
--
-- ⚠️ เขียนทับ `guard_dept_request` ทั้งตัว (ของเดิมอยู่ที่ 0173) — plpgsql ไม่มี
--   "เติมเงื่อนไข" ต้องประกาศใหม่ทั้งฟังก์ชัน ⇒ ด่านเดิมทั้งสามข้อต้องยกมาครบ
CREATE OR REPLACE FUNCTION public.guard_dept_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'dept_request_delete_forbidden';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'dept_request_doc_no_immutable';
  END IF;
  -- เลขที่พิมพ์ลงกระดาษไปแล้วต้องตามกลับมาที่ใบเดิมได้เสมอ
  IF OLD."pdrRefNo" IS NOT NULL AND NEW."pdrRefNo" IS DISTINCT FROM OLD."pdrRefNo" THEN
    RAISE EXCEPTION 'dept_request_pdr_ref_no_immutable';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'dept_request_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ── ออกเลข + บันทึก patch ในคำสั่งเดียว (โครงเดียวกับ 0243) ─────────────
--
-- ⚠️ **ตัวนับใช้ตาราง `entity_number_counters` ร่วมกับเลขอื่น** (scope 'PDR') แต่
--   ไม่ได้เรียก `next_request_running_no` ของ 0243 ซ้ำ เพราะฟังก์ชันนั้น seed
--   ตัวนับที่หายจาก `dept_requests."docNo" LIKE prefix%` ⇒ prefix ของเลขที่เอกสาร
--   เปลี่ยนทุกวัน (DDMMYY) มันจึง seed ไม่เจออะไรเลยแล้วเริ่มนับ 1 ทับของเดิม
--   ⇒ ที่นี่ seed ด้วย LIKE ที่ปิดตาช่องวัน ('__' || MMYY || '-%') แทน
CREATE OR REPLACE FUNCTION public.assign_pdr_ref_no(
  p_id     text,
  p_month  text,
  p_prefix text,
  p_like   text,
  p_width  integer,
  p_patch  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref     text;
  v_seed    integer := 0;
  v_no      integer;
  v_sets    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'request_id_required'; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'request_month_required'; END IF;
  IF p_prefix !~ '^[0-9]{6}-$' THEN RAISE EXCEPTION 'pdr_ref_prefix_invalid: %', p_prefix; END IF;
  IF p_like IS NULL OR p_like = '' THEN RAISE EXCEPTION 'pdr_ref_like_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'request_width_invalid'; END IF;

  -- ล็อกแถวก่อนอ่านเลขเดิม — สองคนกดพร้อมกันต้องไม่ได้คนละเลขบนใบเดียวกัน
  SELECT "pdrRefNo" INTO v_ref FROM public.dept_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dept_request_not_found: %', p_id; END IF;

  -- มีเลขแล้วใช้เลขเดิม — กดซ้ำ/รับเรื่องซ้ำต้องไม่กินเลขใหม่ (กติกาเดียวกับ docNo)
  IF v_ref IS NULL OR v_ref = '' THEN
    -- แถวตัวนับหาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ 0241)
    IF NOT EXISTS (
      SELECT 1 FROM public.entity_number_counters WHERE scope = 'PDR' AND month = p_month
    ) THEN
      SELECT COALESCE(max(substring("pdrRefNo" from 8)::integer), 0)
      INTO v_seed
      FROM public.dept_requests
      WHERE "pdrRefNo" LIKE p_like
        AND substring("pdrRefNo" from 8) ~ '^[0-9]+$';
    END IF;

    INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
    VALUES ('PDR', p_month, v_seed + 1)
    ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
    RETURNING "lastNo" INTO v_no;

    IF v_no > power(10, p_width)::integer - 1 THEN
      RAISE EXCEPTION 'pdr_ref_monthly_sequence_exhausted: %', p_month;
    END IF;

    v_ref := p_prefix || lpad(v_no::text, p_width, '0');
  END IF;

  v_payload := COALESCE(p_patch, '{}'::jsonb) || jsonb_build_object('pdrRefNo', v_ref);
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

REVOKE ALL ON FUNCTION public.assign_pdr_ref_no(text, text, text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_pdr_ref_no(text, text, text, text, integer, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
