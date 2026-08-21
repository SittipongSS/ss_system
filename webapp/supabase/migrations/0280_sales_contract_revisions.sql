-- ============================================================
--  Migration 0280: ฉบับแก้ไขของสัญญา (Rev.) — เลขฐาน + เลขฉบับ
--
--  ⭐ มติผู้ใช้ 2026-08-21: *"สัญญาถ้าร่างให้ลบได้ จนกว่าจะกดออกสัญญา · พอออกแล้ว
--     ต้อง REV เหมือน QT"*
--
--  ⇒ ใช้กติกาเดียวกับใบเสนอราคา (FM-SA-01): ใบที่ออกเลขแล้วแก้เนื้อไม่ได้ ต้อง **ออก
--    ฉบับแก้ไข** ซึ่งเป็น **แถวใหม่** ที่ถือเลขฐานเดิมแต่เลขฉบับถัดไป (CT-YYMMXXXX-1)
--    ส่วนฉบับเดิมกลายเป็น `revised` = อ่านอย่างเดียว ประวัติยังอยู่ครบ
--
--  ⚠️ **ไม่ใช่การแก้เลขบนใบเดิม** — เลขที่ที่ออกไปหาลูกค้าแล้วห้ามเปลี่ยนความหมาย
--     ย้อนหลัง · ใบเดิมยังพิมพ์ซ้ำได้เหมือนวันที่ส่งไป (issuedHtml ตรึงไว้แล้ว)
--
--  ⚠️ **สัญญาที่ลงนามแล้วออก Rev. ไม่ได้** (ด่านอยู่ในโค้ด lib/sales/contracts.js)
--     ตัวสัญญาเองข้อ 3.2 เขียนไว้ว่าการแก้ไขเพิ่มเติมต้องทำเป็นลายลักษณ์อักษรและลงนาม
--     ทั้งสองฝ่าย ⇒ ของแบบนั้นคือ "บันทึกเพิ่มเติมสัญญา" ไม่ใช่ Rev. ของใบเดิม
--
--  🛑 ต้องรันก่อน deploy โค้ด — โค้ดใหม่อ่าน/เขียนคอลัมน์เหล่านี้ทุกครั้งที่ออกสัญญา
--  ⚠ รันมือบน Supabase SQL Editor · additive + backfill เท่านั้น · รันซ้ำได้
-- ============================================================

BEGIN;

ALTER TABLE public.sales_contracts
  ADD COLUMN IF NOT EXISTS "baseNumber"    text,
  ADD COLUMN IF NOT EXISTS "revisionNo"    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revisedFromId" text REFERENCES public.sales_contracts(id) ON DELETE SET NULL;

-- ฉบับเดิมที่ถูกแทนที่ = สถานะ 'revised' (อ่านอย่างเดียว ไม่ใช่ยกเลิก — ยกเลิกมีความหมาย
-- ทางธุรกิจคนละอย่างและมีเหตุผลกำกับ)
ALTER TABLE public.sales_contracts DROP CONSTRAINT IF EXISTS sales_contracts_status_check;
ALTER TABLE public.sales_contracts
  ADD CONSTRAINT sales_contracts_status_check
  CHECK (status IN ('draft', 'awaiting_signature', 'signed', 'revised', 'cancelled'));

-- ใบที่ออกเลขไปแล้วก่อน migration นี้ = ฉบับที่ 0 ของเลขฐานตัวเอง
-- (เลขบนกระดาษที่ส่งออกไปแล้วไม่ถูกแตะ — เติมแค่คอลัมน์ที่ใช้ผูกสายฉบับ)
UPDATE public.sales_contracts
SET "baseNumber" = "contractNo"
WHERE "contractNo" IS NOT NULL AND "baseNumber" IS NULL;

CREATE INDEX IF NOT EXISTS sales_contracts_base_idx
  ON public.sales_contracts ("baseNumber", "revisionNo" DESC);

-- ── ออกเลข: ฉบับแรกกินเลขรันใหม่ · ฉบับแก้ไขใช้เลขฐานเดิม ────────────────
--
-- ⚠️ ฉบับแก้ไข **ห้ามกินเลขรันใหม่** — ไม่งั้นสายฉบับขาดและเลขในทะเบียนกระโดด
--    (บทเรียนเดียวกับ QT: เลขฐานคือสิ่งที่ผูกฉบับ 0/1/2 เข้าด้วยกัน)
-- ⚠️ ยังออกเลขพร้อมอัปเดตแถวในทรานแซกชันเดียวเหมือนเดิม (mig 0242)
CREATE OR REPLACE FUNCTION public.issue_sales_contract(
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
  v_no      integer;
  v_seed    integer := 0;
  v_base    text;
  v_rev     integer;
  v_number  text;
  v_status  text;
  v_sets    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'contract_id_required'; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'contract_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'contract_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'contract_width_invalid'; END IF;

  -- ล็อกแถวก่อนอ่าน — สองคนกดออกสัญญาพร้อมกันต้องไม่ได้คนละเลขบนใบเดียวกัน
  SELECT "contractNo", status, "baseNumber", "revisionNo"
  INTO v_number, v_status, v_base, v_rev
  FROM public.sales_contracts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found: %', p_id; END IF;
  IF v_number IS NOT NULL AND v_number <> '' THEN RAISE EXCEPTION 'contract_already_issued: %', v_number; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'contract_not_draft: %', v_status; END IF;

  IF v_base IS NULL OR v_base = '' THEN
    -- ฉบับแรกของสาย: กินเลขรันของเดือนนี้
    IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'CT' AND month = p_month) THEN
      SELECT COALESCE(max(substring("baseNumber" from length(p_prefix) + 1 for p_width)::integer), 0)
      INTO v_seed
      FROM public.sales_contracts
      WHERE "baseNumber" LIKE p_prefix || '%'
        AND substring("baseNumber" from length(p_prefix) + 1 for p_width) ~ '^[0-9]+$';
    END IF;

    INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
    VALUES ('CT', p_month, v_seed + 1)
    ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
    RETURNING "lastNo" INTO v_no;

    IF v_no > power(10, p_width)::integer - 1 THEN
      RAISE EXCEPTION 'contract_monthly_sequence_exhausted: %', p_month;
    END IF;

    v_base := p_prefix || lpad(v_no::text, p_width, '0');
    v_rev  := 0;
  END IF;

  v_number := v_base || '-' || COALESCE(v_rev, 0)::text;
  v_payload := COALESCE(p_patch, '{}'::jsonb) || jsonb_build_object(
    'contractNo', v_number,
    'baseNumber', v_base,
    'revisionNo', COALESCE(v_rev, 0),
    'status', 'awaiting_signature',
    'issuedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_sets := public.master_row_assignments('sales_contracts', v_payload, 'src');
  IF v_sets IS NULL THEN RAISE EXCEPTION 'contract_patch_empty'; END IF;

  EXECUTE format(
    'UPDATE public.sales_contracts t SET %s FROM jsonb_populate_record(NULL::public.sales_contracts, $1) src'
    || ' WHERE t.id = $2 RETURNING to_jsonb(t)',
    v_sets
  ) USING v_payload, p_id INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_sales_contract(text, text, text, integer, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_sales_contract(text, text, text, integer, jsonb) TO service_role;

COMMIT;
