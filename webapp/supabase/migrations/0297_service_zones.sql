-- ============================================================
--  Migration 0297: โซนบริการ + รอบขายของโซน (แผนระบบธุรกิจบริการ เฟส 2)
--
--  ⭐ มติผู้ใช้ 2026-08-27:
--    · "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception) — entity ถาวร ไม่ตายตาม SO
--    · 1 บรรทัดใบสั่งขาย (สาย SERVICE) = 1 รอบขาย (term) ที่มา "ผูก" โซน
--      ต่อสัญญา = SO ใหม่ → term ใหม่ชี้โซนเดิม ⇒ ประวัติ/consumption ต่อเนื่อง
--    · คนละเรื่องกับ "เขตวิ่งงาน" (service_sites."routeZone" — mig 0296)
--
--  ของเดิม: ทะเบียนบริการห้อยกับ customers เส้นเดียว (0187) · service_plans.salesOrderId
--  เป็นช่องหลอกไม่มี FK/UI (0188) ⇒ ฝั่งขายกับฝั่งบริการไม่มีสะพานเชื่อมเลย
--  (Excel ของทีมตรวจสองโลกชนกันได้แค่ 42/166 = 25.3%)
--
--  ⚠ รันมือบน Supabase SQL Editor · **ตารางใหม่ล้วน รันก่อน deploy ได้เลย**
-- ============================================================

BEGIN;

-- ── โซน = พื้นที่ย่อยในไซต์ ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_zones (
  id              text PRIMARY KEY,
  code            text UNIQUE,                    -- ZN-YYMMXXXX (create_entity_rows_with_code scope 'ZN')
  -- RESTRICT: ประวัติบริการ/การใช้ของโซนคือของมีค่าที่สุดของโมดูล — ลบไซต์ที่ยังมีโซนไม่ได้
  "siteId"        text NOT NULL REFERENCES public.service_sites(id) ON DELETE RESTRICT,
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),  -- 'Lobby' / 'ห้องน้ำชั้น 2'
  "isActive"      boolean NOT NULL DEFAULT true,
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- ชื่อโซนซ้ำในไซต์เดียว = สร้างซ้อนโดยไม่รู้ตัว (Lobby สองแถว ประวัติแยกร่าง)
CREATE UNIQUE INDEX IF NOT EXISTS service_zones_site_name_uk
  ON public.service_zones ("siteId", lower(btrim(name)));

-- ⚠️ จงใจ **ไม่มี customerId** — ลูกค้า derive ผ่าน service_sites."customerId" เสมอ
--   (ก๊อปมาอีกช่อง = โรคเดียวกับ 5 ตารางกระจกชื่อลูกค้าที่ต้องมีทะเบียนคุม)
-- ⚠️ จงใจ **ไม่มีคอลัมน์สถานะบริการ** — "โซนยังมีรอบขายมีผลไหม" คำนวณจาก term + SO
--   เสมอ (กติกาเดียวกับ serviceStatus ห้ามเก็บ Expired — billing-request-flow-plan §3.2)

-- ── รอบขายของโซน — สะพานจากบรรทัดใบสั่งขาย ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_zone_terms (
  id                   text PRIMARY KEY,
  -- RESTRICT: term คือประวัติการขายของโซน — ลบโซนที่มีประวัติไม่ได้
  "zoneId"             text NOT NULL REFERENCES public.service_zones(id) ON DELETE RESTRICT,
  -- CASCADE ตามแพตเทิร์นงวดชำระ (0245): บังคับลบ SO แล้ว term ตายตาม
  -- แต่โซน + ประวัติ visit อยู่ต่อ · ⚠ dryRun ของ route ลบ SO ต้องนับแถวนี้ด้วย
  "salesOrderId"       text NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  -- 1 บรรทัด = 1 term เท่านั้น (UNIQUE) — จำนวนโซนที่ขายนับจากจำนวนบรรทัด
  "salesOrderLineId"   text NOT NULL UNIQUE REFERENCES public.sales_order_lines(id) ON DELETE CASCADE,

  -- snapshot จากบรรทัดขาย ณ ตอนผูก — term เกิดหลัง SO อนุมัติเท่านั้น (ยอด/ของนิ่งแล้ว)
  "productId"          text,
  "fgCode"             text,
  description          text,
  "packageQty"         numeric CHECK ("packageQty" IS NULL OR "packageQty" > 0),  -- แพ็ค = หน่วยคิดเงิน (มติสี่หน่วย)
  unit                 text,
  -- Standard usage เป็นข้อผูกพันของ "รอบขาย" ไม่ใช่คุณสมบัติกายภาพของพื้นที่
  -- ⇒ อยู่ที่ term: ต่อสัญญาแล้วเปลี่ยนแพ็ค standard เปลี่ยนตาม · หน่วย ml เสมอ
  "standardMlPerMonth" numeric CHECK ("standardMlPerMonth" IS NULL OR "standardMlPerMonth" > 0),

  -- ช่วงบริการของรอบนี้ (กรอกมือไปก่อน · เฟสสัญญา (parked) จะ sync จากสัญญาบริการ)
  "startDate"          date,
  "endDate"            date,
  -- สัญญาบริการของรอบนี้ — ใช้จริงเมื่อเฟสสัญญา unpark (รอต้นฉบับสัญญาจ้างบริการ)
  -- SET NULL: สัญญาถูกลบ/ยกเลิก term และประวัติต้องอยู่ต่อ
  "serviceContractId"  text REFERENCES public.sales_contracts(id) ON DELETE SET NULL,

  "createdById"        text, "createdByName" text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_zone_terms_dates_sane CHECK (
    ("startDate" IS NULL OR "startDate" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("endDate" IS NULL OR "endDate" BETWEEN '2000-01-01' AND '2100-12-31')
  ),
  CONSTRAINT service_zone_terms_range CHECK (
    "startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate"
  )
);

-- ⚠️ จงใจ **ไม่มีคอลัมน์ status** — "term มีผลไหม" คำนวณจาก SO แม่เสมอ
--   (status='approved' AND "supersededById" IS NULL — ตัวตัดสินเดียวอยู่ lib/service/terms.js)
--   SO ถูก Rev. ⇒ ใบเก่าได้ supersededById แล้ว term เก่าตายเองโดยไม่ต้องแตะแถว

CREATE INDEX IF NOT EXISTS service_zone_terms_zone_idx
  ON public.service_zone_terms ("zoneId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS service_zone_terms_so_idx
  ON public.service_zone_terms ("salesOrderId");

-- ── scope 'ZN' ใน RPC ออกรหัส (0240) — เพิ่มหนึ่ง WHEN เท่านั้น ─────────────
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
    WHEN 'ZN' THEN 'service_zones'
    WHEN 'IS' THEN 'system_issues'
    ELSE NULL
  END;
  IF v_table IS NULL THEN RAISE EXCEPTION 'entity_scope_unknown: %', p_scope; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'entity_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'entity_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'entity_width_invalid'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'entity_rows_must_be_array'; END IF;
  IF jsonb_array_length(p_rows) = 0 THEN RETURN v_out; END IF;

  -- ห้ามใช้เลขที่เคยออกไปแล้วซ้ำ แม้แถวนั้นถูกลบทิ้ง (ดูเหตุผลเต็มที่ 0240)
  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = p_scope AND month = p_month) THEN
    v_pos := length(p_prefix) + 1;
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

REVOKE ALL ON FUNCTION public.create_entity_rows_with_code(text, text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_entity_rows_with_code(text, text, text, integer, jsonb) TO service_role;

ALTER TABLE public.service_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_zone_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_zones, public.service_zone_terms FROM anon, authenticated;
GRANT  ALL ON TABLE public.service_zones, public.service_zone_terms TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
