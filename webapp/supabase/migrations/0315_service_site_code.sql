-- ── 0315 · รหัสไซต์ ST-XXXX-AA-BBB-CCCC และรหัสโซน ZN-CCCC-FF-DDDDD ───────────
--
-- ⭐ มติผู้ใช้ 2026-08-29:
--   ไซต์  `ST-XXXX-AA-BBB-CCCC`  XXXX=รหัสลูกค้า(AR) · AA=ภาค(01–07) · BBB=ตัวย่อจังหวัด
--                                CCCC=เลขรัน 4 หลักไม่ซ้ำทั้งระบบ (เริ่ม 1001)
--   โซน   `ZN-CCCC-FF-DDDDD`     CCCC=เลขรันของไซต์ · FF=ชั้น · DDDDD=เลขรันนับยาว
--                                ทั้งระบบ (เริ่ม 10001)
--   (แทนรูปเดิม SS-YYMMNNNN / ZN-YYMMNNNN ซึ่งบอกได้แค่ "เปิดเดือนไหน")
--
-- 🔴 **ความกว้างของเลขรันคือเพดานจริง** — ฟังก์ชันออกรหัสโยน
--   `entity_monthly_sequence_exhausted` ทันทีที่เลขเกิน 10^width−1 (0297:150)
--   ⇒ ไซต์ได้ถึง 9999 · โซนได้ถึง 99999 (เลขรันโซนนับรวมทั้งระบบ ไม่รีเซ็ต)
--
-- ⚠️ **ไม่แตะฟังก์ชัน `create_entity_rows_with_code` เลย** — มันไม่รู้จักรูปแบบรหัสอยู่แล้ว
--   โดยเจตนา (0240): ต่อเลขรันท้าย `p_prefix` แล้วเขียนลงคอลัมน์ `code` · รูปใหม่ทั้งสอง
--   วางเลขรันไว้ท้ายสุดจึงออกได้ด้วยตัวเดิม เปลี่ยนแค่ prefix/ถังนับ/ความกว้างจากฝั่งแอป
--   (webapp/src/lib/service/siteCode.js · zoneCode.js เป็นที่เดียวที่รู้ว่ารหัสหน้าตาอย่างไร)
--
-- ⚠️ **ถังนับใหม่ใช้ month = '-'** (นับยาวตัวเดียวตลอดกาล) แบบเดียวกับ AR/FG ใน 0230 —
--   ไม่ใช่ถังรายเดือนของ scope เดิม · แถวรายเดือนเก่า (SS/2607, ZN/2608) ยังอยู่เฉย ๆ
--   ไม่ถูกแตะและไม่ถูกใช้อีก (แถวเคาน์เตอร์ลบไม่ได้ตาม trigger 0241)
--
-- 🔴 **ต้อง seed แถวถังนับในใบนี้** — ถ้าแถวหาย ฟังก์ชันจะ seed เองจาก
--   `max(...) WHERE code LIKE p_prefix||'%'` ซึ่งเป็น prefix *ของไซต์นั้นรายตัว*
--   ⇒ ไซต์ลูกค้าใหม่จะเริ่มนับ 1 แล้วชนเลขรันของไซต์อื่นทันที
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · รันซ้ำได้ทั้งใบ
-- ⚠️ **ครอบ BEGIN/COMMIT** เหมือน 0297/0314 — ใบนี้แก้ข้อมูลจริงหลายก้อนแล้วปิดท้าย
--   ด้วยการตรวจที่ *ตั้งใจให้ล้ม* ⇒ ล้มแล้วต้องไม่เหลือครึ่งใบ
BEGIN;

-- ── 1) จังหวัดของไซต์ — รหัสประกอบจากภาค/จังหวัด จึงต้องมีที่เก็บก่อน ──────────
--
-- ⭐ **คนละเรื่องกับ `address`** ซึ่งเป็นข้อความหน้างานที่ช่างอ่าน (บางไซต์เป็น
--   "ล็อบบี้ตึก B ตรงข้ามลิฟต์") · สองช่องนี้เป็น *ข้อมูลเชิงโครงสร้าง* ที่ใช้ประกอบรหัส
--   จัดกลุ่มตามภาค และวางเส้นทางเดินรถ
-- ⚠️ `province` เก็บ **ชื่อ** ไว้ด้วยตั้งใจ (ไม่ใช่แค่รหัส) — จอ/รายงานประกอบข้อความได้
--   โดยไม่ต้องเปิดทะเบียน 650KB ฝั่ง client (แพตเทิร์นเดียวกับที่อยู่ลูกค้าใน 0217)
ALTER TABLE public.service_sites ADD COLUMN IF NOT EXISTS "provinceCode" text;
ALTER TABLE public.service_sites ADD COLUMN IF NOT EXISTS "province" text;

COMMENT ON COLUMN public.service_sites."provinceCode" IS
  'รหัสจังหวัด 2 หลัก (ทะเบียนเดียวกับ src/data/thaiAdmin.js) — ท่อน AA/BBB ของรหัส ST มาจากนี่';
COMMENT ON COLUMN public.service_sites.code IS
  'ST-XXXX-AA-BBB-CCCC (lib/service/siteCode.js · ออกพร้อม insert ด้วย create_entity_rows_with_code scope SS ถัง ''-'')';

-- ── 2) ชั้นของโซน — ส่วนหนึ่งของรหัส จึงบังคับมีค่า ─────────────────────────────
--
-- ⚠️ คอลัมน์ `floor`/`building` มีมาตั้งแต่ 0314 แต่ **ไม่เคยมีเส้นทางเขียน** (ค่า NULL
--   ทั้งตาราง) · ใบนี้เติมค่าให้แถวเดิมแล้วบังคับ NOT NULL เพื่อให้ทุกเส้นทางที่สร้างโซน
--   ต้องตอบเรื่องชั้น — เส้นที่ลืมจะล้มดัง ๆ ตรงนั้น ดีกว่าได้โซนที่รหัสไม่ตรงกับชั้นจริง
-- 🔴 **ระบุรายใบ ไม่เดาเป็นก้อน** — ค่าที่เติมตรงนี้เดินเข้าไปเป็นท่อน FF ของรหัสโซน
--   ซึ่ง *แก้ทีหลังไม่ได้* (zoneCode.js: รหัสคือตัวตน) ⇒ เดาผิดคือรหัสผิดถาวร
--   โซนบน production ณ 29/08/2026 มีสองใบเท่านั้น และรู้ชั้นจากชื่อทั้งคู่
UPDATE public.service_zones SET floor = 'GF' WHERE floor IS NULL AND code = 'ZN-26080005';  -- "Lobby ชั้น G"
UPDATE public.service_zones SET floor = '01' WHERE floor IS NULL AND code = 'ZN-26080004';  -- "Studio 01"

-- เหลือโซนที่ยังไม่มีชั้น = มีของที่ใบนี้ไม่รู้จัก ⇒ หยุดให้คนมาตัดสิน ไม่ใช่เดาแทน
DO $$
DECLARE v_left text;
BEGIN
  SELECT string_agg(code || ' (' || name || ')', ' · ') INTO v_left
    FROM public.service_zones WHERE floor IS NULL;
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'มีโซนที่ยังไม่รู้ชั้น: % — เติม floor ให้ครบก่อน (ค่าที่เติมจะถูกตรึงในรหัสโซนถาวร)', v_left;
  END IF;
END $$;

ALTER TABLE public.service_zones
  DROP CONSTRAINT IF EXISTS service_zones_floor_format;
ALTER TABLE public.service_zones
  ADD CONSTRAINT service_zones_floor_format
  CHECK (floor ~ '^(0[1-9]|[1-9][0-9]|B[1-9]|GF|MZ|RF)$');

ALTER TABLE public.service_zones ALTER COLUMN floor SET NOT NULL;

COMMENT ON COLUMN public.service_zones.floor IS
  'ชั้น 01–99 หรือ GF/MZ/B1–B9/RF — ท่อน FF ของรหัส ZN (lib/service/zoneCode.js)';
COMMENT ON COLUMN public.service_zones.code IS
  'ZN-CCCC-FF-DDDDD · CCCC = เลขรันของไซต์ (ท่อนท้ายรหัส ST)';

-- ── 3) ชั้นของ "พื้นที่ใหม่" บนใบประเมิน — เดินทางไปเป็นชั้นของโซนตอนกดส่ง ──────
--
-- ⚠️ แถวที่อ้างโซนเดิม (`zoneId` ไม่ว่าง) ไม่ต้องมีชั้น — ชั้นอยู่ที่ทะเบียนโซนแล้ว
--   ส่วนแถวพื้นที่ใหม่ต้องมี ไม่งั้นตอนกดส่งจะออกรหัสโซนไม่ได้
ALTER TABLE public.service_survey_zones ADD COLUMN IF NOT EXISTS floor text;

-- 🔴 **backfill ก่อนใส่ CHECK** — คอลัมน์เพิ่งเกิด ทุกแถวเป็น NULL · แถว "พื้นที่ใหม่"
--   (`zoneId` ว่าง) ที่ค้างอยู่ในใบร่างจะทำให้ ALTER ทั้งใบล้มทันที
--   ⚠️ ค่าที่เติมเป็นค่าตั้งต้นของ *ร่างที่ยังแก้ได้* (ไม่ใช่รหัสถาวร) — เจ้าของใบแก้ชั้น
--      ก่อนกดส่งได้ตามปกติ · ณ 29/08/2026 ไม่มีแถวแบบนี้เหลืออยู่เลย
UPDATE public.service_survey_zones SET floor = '01'
 WHERE "zoneId" IS NULL AND floor IS NULL;

ALTER TABLE public.service_survey_zones
  DROP CONSTRAINT IF EXISTS service_survey_zones_new_zone_needs_floor;
ALTER TABLE public.service_survey_zones
  /* 🔴 **ต้องมี `floor IS NOT NULL` ด้วย** — `NULL ~ '…'` ให้ผลเป็น NULL ไม่ใช่ FALSE
     และ `FALSE OR NULL` = NULL ซึ่ง Postgres ถือว่า **ผ่าน** CHECK ⇒ เขียนแค่ regex
     อย่างเดียวจะปล่อยแถวพื้นที่ใหม่ที่ไม่มีชั้นลอดไปได้ทั้งที่ตั้งใจกัน */
  ADD CONSTRAINT service_survey_zones_new_zone_needs_floor
  CHECK ("zoneId" IS NOT NULL
         OR (floor IS NOT NULL AND floor ~ '^(0[1-9]|[1-9][0-9]|B[1-9]|GF|MZ|RF)$'));

-- ── 4+5) ไซต์รูปเดิม → จังหวัด + รหัสใหม่ ในคำสั่งเดียว ─────────────────────
--
-- ⭐ **ทะเบียนแปลงมืออยู่ก้อนเดียวข้างล่างนี้** — เจอไซต์รูปเดิมใบใหม่เมื่อไร เติมอีก
--   หนึ่งแถวแล้วรันซ้ำ จบ · เดิมเขียนเป็น `code IN (...)` + `'-01-BKK-'` ตายตัว ซึ่ง
--   แปลว่าไซต์ต่างจังหวัดใบเดียวก็ทำให้ทั้งใบล้มโดยที่ทำตามข้อความ error ไม่ได้จริง
-- ⚠️ **ไม่ยกทะเบียน 77 จังหวัดเข้ามาใน SQL** ตามเจตนาหัวไฟล์ — ที่นี่มีเฉพาะแถวที่
--   ต้องแปลงจริง (ลอกค่า ภาค/ตัวย่อ มาจาก src/lib/master/thaiProvinces.js)
-- ⚠️ รหัส AR ต้องอยู่ในรูปที่ `customerCodeSegment()` ยอมรับ — ไม่มี CHECK ที่ระดับ DB
--   กันไว้ ⇒ ค่าเพี้ยนจะกลายเป็นท่อน XXXX ที่ผิดแล้วตรึงถาวร · ให้ตกไปเข้าด่านข้อ 7
-- 🔴 **เลขรันเดินต่อจากเคาน์เตอร์ ไม่ใช่เริ่มนับใหม่ทุกรอบ** — รอบแรกมีใบที่แปลงไม่ได้
--   แล้วมาเติมทะเบียนรันอีกรอบ ถ้า `row_number()` เริ่มที่ 1001 ใหม่จะชนรหัสที่ออกไปแล้ว
WITH map(code, province_code, province, region, abbr) AS (VALUES
  ('SS-26070001', '10', 'กรุงเทพมหานคร', '01', 'BKK'),   -- Scent and Sense Office
  ('SS-26080005', '10', 'กรุงเทพมหานคร', '01', 'BKK')    -- [UAT] สาขาสีลม ชั้น G
), ranked AS (
  SELECT s.id, m.province_code, m.province, m.region, m.abbr,
         COALESCE((SELECT c2."lastNo" FROM public.entity_number_counters c2
                    WHERE c2.scope = 'SS' AND c2.month = '-'), 1000)
           + row_number() OVER (ORDER BY s.code) AS run,
         -- ⚠️ เขียนกฎของ `customerCodeSegment()` ซ้ำในภาษาที่สอง — ยอมเฉพาะใบแปลง
         --    ครั้งเดียวนี้ · เส้นทางปกติทั้งหมดออกรหัสจากฝั่งแอปที่เดียว
         lpad(split_part(c."arCode", '-', 2), 4, '0') AS customer
    FROM public.service_sites s
    JOIN map m ON m.code = s.code
    JOIN public.customers c ON c.id = s."customerId"
   WHERE c."arCode" ~ '^AR-[0-9]{3,4}$'
)
UPDATE public.service_sites s
   SET "provinceCode" = r.province_code,
       province       = r.province,
       code = 'ST-' || r.customer || '-' || r.region || '-' || r.abbr || '-' || lpad(r.run::text, 4, '0')
  FROM ranked r
 WHERE s.id = r.id;

-- โซน: อ้างเลขรันของไซต์แม่ที่เพิ่งแปลง + ชั้นที่เติมไว้ในข้อ 2
WITH ranked AS (
  SELECT z.id,
         right(s.code, 4) AS site_run,
         z.floor,
         COALESCE((SELECT c2."lastNo" FROM public.entity_number_counters c2
                    WHERE c2.scope = 'ZN' AND c2.month = '-'), 10000)
           + row_number() OVER (ORDER BY z.code) AS run
    FROM public.service_zones z
    JOIN public.service_sites s ON s.id = z."siteId"
   WHERE z.code LIKE 'ZN-________'          -- รูปเดิม ZN-YYMMNNNN (8 ตัวหลังขีด)
     AND s.code LIKE 'ST-%'
)
UPDATE public.service_zones z
   SET code = 'ZN-' || r.site_run || '-' || r.floor || '-' || lpad(r.run::text, 5, '0')
  FROM ranked r
 WHERE z.id = r.id;

-- ⚠️ **รหัสเดิมไม่ได้ถูกเก็บไว้ที่ไหน** — `service_sites`/`service_zones` ไม่มีคอลัมน์
--   `metadata` แบบที่ 0096 ใช้เก็บ `legacyCode` ของโครงการ · คู่ที่แปลงในรอบนี้จึง
--   บันทึกไว้ตรงนี้แทน (ทั้งหมดที่มีบน production ณ 29/08/2026):
--     SS-26070001 (Scent and Sense Office · AR-000) → ST-0000-01-BKK-1001
--     SS-26080005 ([UAT] สาขาสีลม ชั้น G · AR-121)  → ST-0121-01-BKK-1002
--     ZN-26080004 (Studio 01)    → ZN-1001-01-10001
--     ZN-26080005 (Lobby ชั้น G) → ZN-1002-GF-10002

-- ── 6) ถังนับของรหัสรูปใหม่ (month = '-') ────────────────────────────────────
--
-- ⚠️ ค่าที่ลงคือ **เลขล่าสุด** ไม่ใช่เลขถัดไป — RPC คืนค่าหลัง +1 เสมอ
-- ⚠️ GREATEST กับของจริงที่มีอยู่แล้ว เผื่อรันซ้ำหลังออกรหัสใหม่ไปแล้ว (0230 ใช้ท่านี้)
INSERT INTO public.entity_number_counters (scope, month, "lastNo")
SELECT 'SS', '-', GREATEST(1000, COALESCE(max(right(code, 4)::int), 0))
  FROM public.service_sites
 WHERE code ~ '^ST-\d{4}-\d{2}-[A-Z]{3}-\d{4}$'
ON CONFLICT (scope, month) DO UPDATE
  SET "lastNo" = GREATEST(public.entity_number_counters."lastNo", EXCLUDED."lastNo");

INSERT INTO public.entity_number_counters (scope, month, "lastNo")
SELECT 'ZN', '-', GREATEST(10000, COALESCE(max(split_part(code, '-', 4)::int), 0))
  FROM public.service_zones
 WHERE code ~ '^ZN-\d{4}-(0[1-9]|[1-9][0-9]|B[1-9]|GF|MZ|RF)-\d{5}$'
ON CONFLICT (scope, month) DO UPDATE
  SET "lastNo" = GREATEST(public.entity_number_counters."lastNo", EXCLUDED."lastNo");

-- ── 7) ตรวจว่าไม่มีของค้างรูปเดิม — เหลือแม้ใบเดียวคือรหัสสองรูปในระบบเดียว ────
DO $$
DECLARE
  v_sites text;
  v_zones int;
BEGIN
  SELECT string_agg(code, ' · ' ORDER BY code) INTO v_sites
    FROM public.service_sites WHERE code LIKE 'SS-%';
  SELECT count(*) INTO v_zones
    FROM public.service_zones WHERE code LIKE 'ZN-________';
  IF v_sites IS NOT NULL OR v_zones > 0 THEN
    /* ⚠️ ข้อความต้องบอก **สิ่งที่ทำตามได้จริง** — ของเดิมเขียนว่า "เติมค่าแล้วรันซ้ำ"
       ทั้งที่ตัวแปลงกรองด้วยรหัสตายตัว ⇒ เติมค่ายังไงก็ไม่ผ่าน */
    RAISE EXCEPTION 'ยังมีรหัสรูปเดิมค้างอยู่ — ไซต์: % · โซน % ใบ · เติมแถวของไซต์เหล่านั้นในทะเบียน VALUES ข้อ 4+5 ของไฟล์นี้ (หรือลูกค้ายังไม่มีรหัส AR ที่ถูกรูป) แล้วรันซ้ำ',
      COALESCE(v_sites, '—'), v_zones;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
