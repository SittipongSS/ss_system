-- ============================================================
--  Migration 0344: ขึ้นทะเบียนเครื่อง — รหัสเครื่องที่ระบบออกให้ + ทะเบียนรุ่น
--  ม็อก ~/ss-team/mockups/machine-add · มติผู้ใช้ 2026-09-03 (10 ข้อ) และ 2026-09-05
--
--  ⭐ ที่มา: ทางเข้าเดียวที่สร้างเครื่องได้วันนี้คือ **"รับเครื่องเข้าคลัง"** ซึ่ง
--    บังคับให้มีไซต์คลังก่อน และให้คนพิมพ์รหัสเอง · ผู้ใช้ทักว่า "ต้องเพิ่มเครื่อง
--    ไม่ใช่รับเครื่องเข้าคลัง" ⇒ การขึ้นทะเบียนคือการบอกว่า **บริษัทได้เครื่องมา**
--    (รุ่นอะไร สีอะไร รับเข้าวันไหน สถานะอะไร) ไม่ใช่การย้ายของเข้าสถานที่
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy**
--    (โค้ดใหม่อ่าน `code` ของเครื่องและตาราง `service_asset_models` — ไม่มีของสองอย่างนี้
--     หน้าทะเบียนเครื่องและโมดัลเพิ่มเครื่องพังทั้งคู่)
--  ⚠ รันซ้ำได้ทั้งใบ
-- ============================================================

BEGIN;

-- ── 1) ทะเบียนรุ่นเครื่อง — ของใหม่ ────────────────────────────────────────
--
-- ⭐ **รุ่นกับสีต้องเป็นตัวเลือก ไม่ใช่ช่องพิมพ์อิสระ** (มติผู้ใช้) — วันนี้ `model`
--   และ `colour` เป็น text อิสระ ไม่มีทะเบียนอะไรคุม ⇒ ชีตเก่ามีทั้ง `OV08` และ
--   `OV-08` ปนกัน 48 แถวทั้งที่เป็นรุ่นเดียวกัน
--
-- ⭐ **สีผูกกับรุ่น** (มติผู้ใช้) — เลือกรุ่นแล้วเห็นเฉพาะสีที่รุ่นนั้นมีจริง
--   เครื่องกดสบู่มีขาวอย่างเดียว จึงเลือกดำไม่ได้ ⇒ กันของที่ไม่มีอยู่จริงตั้งแต่กรอก
--
-- 🔴 **`modelCode` คือส่วนหนึ่งของรหัสเครื่องที่ออกไปแล้ว** — `MC-OV08-260900013`
--   ถือ `OV08` ไว้ในตัว ⇒ แก้ `modelCode` หลังมีเครื่องแล้ว = รหัสที่พิมพ์ไปแล้ว
--   ไม่ตรงกับทะเบียน · ด่านนี้อยู่ในโค้ด (ทะเบียนอ่านจำนวนเครื่องที่ใช้รุ่นนั้น)
--   ไม่ใช่ใน DB เพราะต้องนับข้ามตาราง
CREATE TABLE IF NOT EXISTS public.service_asset_models (
  id            text PRIMARY KEY,
  kind          text NOT NULL,
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  -- 4 ตัวอักษรพอดี ตัวใหญ่/ตัวเลขเท่านั้น — เพราะมันไปนั่งในรหัสเครื่องท่อนที่สอง
  -- ⚠️ รุ่นที่ชื่อไม่พอดี 4 ตัว (`7KG` · `ลำโพง`) ก็แค่ตั้งรหัสให้มันตอนขึ้นทะเบียน
  --    (`7KG0` · `SPKR`) — คนละช่องกับชื่อที่คนอ่าน
  "modelCode"   text NOT NULL CHECK ("modelCode" ~ '^[A-Z0-9]{4}$'),
  -- สีที่รุ่นนี้มีจริง — ว่างได้ (รุ่นที่ไม่แยกสี) ⇒ ฟอร์มซ่อนช่องสีไปเลย
  colours       text[] NOT NULL DEFAULT '{}',
  "isActive"    boolean NOT NULL DEFAULT true,
  note          text CHECK (note IS NULL OR length(note) <= 500),
  "createdById" text,
  "createdByName" text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

-- ⚠️ **ห้ามซ้ำแบบไม่สนตัวพิมพ์** — `ov08` กับ `OV08` เป็นรหัสเดียวกันในสายตาคน
--   แต่เป็นคนละสตริงในสายตา DB · เทียบด้วย upper() เหมือนที่ serial ใช้ lower()
CREATE UNIQUE INDEX IF NOT EXISTS service_asset_models_code_uk
  ON public.service_asset_models (upper(btrim("modelCode")));
-- ชื่อรุ่นซ้ำในชนิดเดียวกันไม่ได้ — คนละชนิดชื่อซ้ำได้ (เครื่องกดสบู่ vs กดแอลกอฮอล์)
CREATE UNIQUE INDEX IF NOT EXISTS service_asset_models_name_uk
  ON public.service_asset_models (kind, lower(btrim(name)));

COMMENT ON TABLE public.service_asset_models IS
  'ทะเบียนรุ่นเครื่อง + สีของแต่ละรุ่น (mig 0344) — ต้นทางของตัวเลือก "ชนิด/รุ่น/สี" '
  'ในโมดัลเพิ่มเครื่อง · modelCode คือท่อน AAAA ของรหัสเครื่อง MC-AAAA-YYMMBBBBB';
COMMENT ON COLUMN public.service_asset_models."modelCode" IS
  '4 ตัวอักษรที่ไปอยู่ในรหัสเครื่อง — แก้หลังมีเครื่องแล้วไม่ได้ (รหัสที่ออกไปแล้วจะไม่ตรงทะเบียน)';

ALTER TABLE public.service_asset_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_asset_models FROM anon, authenticated;
GRANT ALL ON public.service_asset_models TO service_role;

-- ── 2) รหัสเครื่องที่ระบบออกให้ — คอลัมน์ `code` ───────────────────────────
--
-- 🔴 **ทำไมเป็นคอลัมน์ใหม่ ไม่ใช่ทับ `serial`** (มติผู้ใช้ 2026-09-05)
--   · `serial` คือ **เบอร์จากโรงงานที่คนพิมพ์เอง** — 0187 ตั้งใจให้แก้ได้ และ
--     `assetReceive.js` เดาเลขถัดไปจาก **ของจริงในตาราง** ไม่ใช่จากตัวนับ
--     ⇒ เอารหัสระบบไปทับ = ตัวนับกับข้อมูลจริงเดินคู่ขนานแล้วเพี้ยนจากกัน
--   · ตัวออกเลขกลาง (`create_entity_rows_with_code`) เขียนลงคอลัมน์ชื่อ `code`
--     **ตายตัว** และ `master_row_columns` ทิ้งคีย์ที่ไม่มีคอลัมน์รองรับ **เงียบ ๆ**
--     ⇒ ไม่มีคอลัมน์นี้ = insert สำเร็จโดยไม่มีรหัส แต่ตัวนับเดินไปแล้ว = เลขหายถาวร
--   · เครื่องจึงเข้าตระกูลเดียวกับไซต์ (`ST-…`) และโซน (`ZN-…`) ที่ใช้ `code` เหมือนกัน
ALTER TABLE public.service_assets
  ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS service_assets_code_uk
  ON public.service_assets (code) WHERE code IS NOT NULL;

COMMENT ON COLUMN public.service_assets.code IS
  'รหัสเครื่อง MC-AAAA-YYMMBBBBB ที่ระบบออกให้ (mig 0344) — แก้ไม่ได้ · '
  'คนละช่องกับ serial ที่เป็นเบอร์จากโรงงานซึ่งคนพิมพ์เอง';

-- รุ่นที่อ้างทะเบียน — `model` (text) ยังอยู่เป็น **สำเนาชื่อรุ่นบนแถว** เพื่อให้
-- ทุกจอ/ตัวค้นที่อ่าน `asset.model` อยู่แล้วทำงานต่อได้โดยไม่ต้อง join
-- ⚠️ ลบรุ่นออกจากทะเบียน ⇒ `modelId` เป็น NULL แต่ `model` ยังอ่านได้ว่าเคยเป็นรุ่นอะไร
ALTER TABLE public.service_assets
  ADD COLUMN IF NOT EXISTS "modelId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.service_assets'::regclass
       AND conname = 'service_assets_modelId_fkey'
  ) THEN
    ALTER TABLE public.service_assets
      ADD CONSTRAINT "service_assets_modelId_fkey"
      FOREIGN KEY ("modelId") REFERENCES public.service_asset_models(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "service_assets_modelId_idx"
  ON public.service_assets ("modelId") WHERE "modelId" IS NOT NULL;

-- ── 3) เครื่องที่ยังไม่ได้ติดตั้ง ไม่ต้องมีที่อยู่ ─────────────────────────
--
-- 🔄 **ใบนี้กลับมติของ 0332 ข้อ 2 โดยตั้งใจ** — 0332 เลือก "คลังเป็นไซต์จริง" แทน
--   "siteId เป็น NULL ได้" ด้วยเหตุผลสองข้อ ซึ่ง**ทั้งคู่หมดอายุไปแล้ว**:
--     ① *"เครื่องที่ไม่มีไซต์ไม่มี URL อยู่จริง เพราะ API ของเครื่องอยู่ใต้
--        /api/service/sites/[id]/assets/"* — เฟส B ออก `/api/service/assets`
--        (ทะเบียนรวม) กับ `/api/service/assets/[id]/detail` ไปแล้ว ⇒ เครื่องมี URL
--        ของตัวเองที่ไม่ผ่านไซต์แล้ว
--     ② *"ตั้งใจเก็บเข้าคลัง กับ บั๊กลืมเซ็ต siteId หน้าตาเหมือนกันเป๊ะระดับแถว"* —
--        ข้อ 4 ข้างล่างทำให้แยกออก: `in_stock` **ต้อง** ไม่มีไซต์ · `active` **ต้อง** มี
--        ⇒ แถวที่ลืมเซ็ตจะถูก CHECK ตีกลับ ไม่ใช่ผ่านไปเงียบ ๆ
--   ⇒ "ว่าง" แปลว่ายังไม่มีที่อยู่จริง ๆ ไม่ต้องปั้นคลังขึ้นมาเป็นที่จอด
--
-- ⚠️ **FK ยังเป็น RESTRICT ตามเดิม** (มติผู้ใช้ 2026-09-05) — ม็อกเสนอ SET NULL
--   เพื่อให้ "ลบไซต์แล้วเครื่องกลับไปเป็นว่าง" แต่ SET NULL คู่กับ CHECK ข้อ 4
--   จะทำให้เครื่องที่ **ติดตั้งอยู่** (active) กลายเป็น active+ไม่มีไซต์ ⇒ CHECK ล้ม
--   ⇒ ลบไซต์ก็ไม่ผ่านอยู่ดี แต่ได้ error ของ CHECK ที่อ่านไม่รู้เรื่องแทน
--   RESTRICT ล้มดัง ๆ ตั้งแต่แรกและบอกให้ไปย้ายเครื่องออกก่อน ซึ่งตรงกว่า
ALTER TABLE public.service_assets ALTER COLUMN "siteId" DROP NOT NULL;

-- ── 4) สถานะกับที่อยู่ต้องเล่าเรื่องเดียวกัน ──────────────────────────────
--
--   ว่าง (in_stock)   → **ต้องไม่มีไซต์** — รับเข้ามาแล้วยังไม่ได้เอาไปไหน
--   ใช้งานอยู่ (active) → **ต้องมีไซต์**  — ติดตั้งแล้วต้องรู้ว่าอยู่ไซต์ไหน
--   ซ่อม (repair)      → มีหรือไม่มีก็ได้ — ส่งซ่อมจากหน้างาน หรือจากของที่ว่างอยู่
--   ปลดระวาง (removed) → มีหรือไม่มีก็ได้ — เลิกใช้ถาวร ที่อยู่สุดท้ายเก็บไว้อ่านได้
--
-- ⚠️ สวิตช์ "เครื่องเสีย" (`condition`) **ไม่เกี่ยวกับที่อยู่เลย** — ติ๊กได้ทั้งของที่
--   ว่างและของที่ติดตั้งอยู่ (นั่นคือเหตุผลที่ 0332 แยกเป็นสองแกนตั้งแต่แรก)
ALTER TABLE public.service_assets DROP CONSTRAINT IF EXISTS service_assets_place_by_status;
ALTER TABLE public.service_assets
  ADD CONSTRAINT service_assets_place_by_status CHECK (
    (status <> 'active'   OR "siteId" IS NOT NULL) AND
    (status <> 'in_stock' OR "siteId" IS NULL)
  );

-- ── 5) trigger เดิมของ 0332 — ถอดกฎที่กลายเป็นกิ่งตายแล้ว ─────────────────
--
-- 🔴 กฎ *"in_stock ต้องอยู่ไซต์ประเภทคลัง"* ของ 0332 **เป็นไปไม่ได้แล้ว** หลังข้อ 4
--   (in_stock ต้องไม่มีไซต์เลย) ⇒ ปล่อยไว้ = กฎที่ไม่มีวันทำงาน ซึ่งอ่านแล้วหลอกคนแก้
-- ⚠️ อีกสองกฎยังจำเป็นและ**แรงกว่าที่เห็น**: `v_kind IS NULL THEN RETURN NEW` ทำให้
--   เครื่องที่ไม่มีไซต์ข้ามด่านนี้ทั้งชุด ⇒ ด่านจริงของ "ว่าง" คือ CHECK ข้อ 4
--   ไม่ใช่ trigger ตัวนี้
CREATE OR REPLACE FUNCTION public.service_assets_stock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_kind text;
BEGIN
  IF NEW."siteId" IS NULL THEN
    -- เครื่องที่ยังไม่มีที่อยู่ (mig 0344) — กฎที่เหลือทั้งหมดพูดถึงไซต์ทั้งนั้น
    -- ⚠️ โซนต้องว่างตามไปด้วย ไม่งั้นเครื่องชี้โซนของไซต์ที่ตัวเองไม่ได้อยู่
    IF NEW."zoneId" IS NOT NULL THEN
      RAISE EXCEPTION 'เครื่องที่ไม่มีไซต์จะมีโซนไม่ได้ — ล้างโซนก่อน หรือระบุไซต์ให้เครื่อง';
    END IF;
    RETURN NEW;
  END IF;

  SELECT kind INTO v_kind FROM public.service_sites WHERE id = NEW."siteId";
  IF v_kind IS NULL THEN
    RETURN NEW;  -- ไม่มีไซต์ให้ตรวจ (FK จะเป็นคนตีกลับเอง)
  END IF;

  IF NEW.status = 'active' AND v_kind = 'warehouse' THEN
    RAISE EXCEPTION 'เครื่องที่อยู่ในคลังใช้สถานะ "ใช้งาน" ไม่ได้ — ต้องติดตั้งเข้าไซต์ลูกค้าก่อน';
  END IF;

  -- โซนอยู่ใต้ไซต์เสมอ — ย้ายข้ามไซต์แล้วลืมล้างโซน = เครื่องชี้โซนของไซต์อื่น
  IF NEW."zoneId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_zones z
     WHERE z.id = NEW."zoneId" AND z."siteId" = NEW."siteId"
  ) THEN
    RAISE EXCEPTION 'โซน % ไม่ได้อยู่ในไซต์ % — ย้ายเครื่องข้ามไซต์ต้องล้างหรือเลือกโซนใหม่', NEW."zoneId", NEW."siteId";
  END IF;

  RETURN NEW;
END $$;

-- ⚠️ trigger เดิมยิงเฉพาะ UPDATE OF status/siteId/zoneId — คงไว้เท่าเดิม
--   (แก้ condition/receivedAt ไม่ต้องผ่านด่านนี้)

-- ── 6) ตัวออกเลขกลางต้องรู้จัก scope 'MC' ─────────────────────────────────
--
-- ⚠️ **คัดนิยามล่าสุดมาทั้งก้อน** (ตัวที่รันจริงอยู่คือของ mig 0297) — เปลี่ยนแค่
--   บรรทัด CASE เพิ่ม `WHEN 'MC'` · ที่เหลือเหมือนเดิมทุกตัวอักษร
-- 🔴 ต้องอยู่ **ใบเดียวกับข้อ 2** — มี WHEN แต่ไม่มีคอลัมน์ `code` = รหัสหายเงียบ
--   แต่ตัวนับเดินไปแล้ว (เลขหายถาวรทีละตัว)
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
    WHEN 'MC' THEN 'service_assets'
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

-- ── 7) ถังนับของ MC — ต้อง seed ไว้ ห้ามพึ่ง fallback ─────────────────────
--
-- 🔴 **fallback ของ RPC ตั้งต้นจาก `max(code) WHERE code LIKE prefix||'%'`** ซึ่งเป็น
--   เลขสูงสุด *ภายใน prefix นั้น* ไม่ใช่ทั้งถัง · แต่ MC มี prefix ต่างกันรายเครื่อง
--   (`MC-OV08-2609` vs `MC-OV05-2610`) ⇒ ถ้าแถวถังหายไป เครื่องรุ่นใหม่/เดือนใหม่
--   จะเริ่มนับ 1 แล้ว**ชนเลขที่ออกไปแล้ว** ⇒ seed ไว้เลย แล้ว fallback ไม่มีวันทำงาน
--
-- ⚠️ ถังคือ `'-'` = **นับยาวตัวเดียวทั้งบริษัท ไม่ตัดรอบ** (มติผู้ใช้: "เลขรันนับรวม
--   ทั้งบริษัท ไม่ตัด") ⇒ `YYMM` ที่โผล่ในรหัสมาจาก **prefix** (เดือนที่รับเครื่องเข้า)
--   **ไม่ใช่ตัวตัดรอบ** — กับดักเดิมของทั้งระบบ (ดู entityCode.js · mig 0328 · 0330)
-- ⚠️ ห้ามเปลี่ยนคีย์ถังนี้ทีหลัง: เลขจะเริ่มนับใหม่แล้วชนของเดิม และแถวถังเก่า
--   **ลบไม่ได้** เพราะ trigger ของ mig 0241
-- ⚠️ GREATEST เสมอ — trigger 0241 ห้าม `lastNo` ถอยหลัง ⇒ รันใบนี้ซ้ำต้องไม่ทำให้ตัวนับลด
INSERT INTO public.entity_number_counters (scope, month, "lastNo")
VALUES ('MC', '-', 0)
ON CONFLICT (scope, month) DO UPDATE
  SET "lastNo" = GREATEST(public.entity_number_counters."lastNo", EXCLUDED."lastNo");

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  ⚠️ หลังรันใบนี้ **ทะเบียนรุ่นยังว่าง** — เพิ่มรุ่นที่หน้าตั้งค่าของโมดูลบริการ
--     (/service/settings) ก่อน ไม่งั้นโมดัลเพิ่มเครื่องไม่มีตัวเลือกให้เลือก
--     ตั้งใจไม่ seed ในใบนี้: migration สคีมาไม่ควรผูกกับแถวข้อมูลของธุรกิจ
--     (เหตุผลเดียวกับที่ 0332 ไม่ seed ไซต์คลัง)
-- ============================================================
