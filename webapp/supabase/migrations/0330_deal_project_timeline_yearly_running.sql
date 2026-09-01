-- ============================================================
--  Migration 0330: รหัสดีล (DL) · โครงการ (PJ) · เลขไทม์ไลน์โครงการ (PT)
--                  รันยาวทั้งปี ตัดรอบทุกปี — และ DL/PJ ขยายเลขรันเป็น 5 หลัก
--  (มติผู้ใช้ 2026-09-01: "PT ขอทำพร้อม DL PJ" + เลือกความกว้าง 5 หลัก)
--
--  ⭐ สามอย่างนี้ต้องเปลี่ยนพร้อมกัน เพราะ **เกิดคู่กัน**: ปิดดีล Won → โครงการ →
--     ไทม์ไลน์ของโครงการ · ถ้าเปลี่ยนแยกกัน โครงการหนึ่งใบจะถือเลขสองรอบตัดคาบเกี่ยว
--
--  🔴 **`YYMM` ในรหัส ≠ ตัวตัดรอบของเลขรัน** (กับดักเดิม — ดู 0328 · docNo.js · contracts.js)
--     · `YYMM` มาจาก **prefix** = เดือนที่สร้างแถว · ยังอยู่ในรหัสเหมือนเดิมทุกใบ
--     · ตัวตัดรอบคือ **คีย์ `month` ของถังนับ** ซึ่งใบนี้เปลี่ยนเป็นปี (`'26'`)
--
--  ⭐ **DL/PJ ขยายเลขรัน 4 → 5 หลัก** เพราะเพดานเปลี่ยนหน่วยจาก "ต่อเดือน" เป็น "ต่อปี":
--     ดีลออก ~415 ใบ/เดือน ≈ 5,000 ใบ/ปี ⇒ 4 หลัก (9,999/ปี) เหลือหัวไม่ถึงเท่าตัว
--     ชนเมื่อไร = **สร้างดีลไม่ได้ทั้งระบบ** ไม่ใช่แค่เลขเพี้ยน
--     ⚠️ ชุด 5 หลักไม่ชนกับชุด 4 หลักเดิมโดยโครงสร้าง (คนละความยาว = คนละสตริง)
--        ⇒ **ไม่ backfill** รหัสเก่าแม้แต่ใบเดียว
--
--  ⚠️ **PT ยังเป็น 4 หลัก** — ความกว้างของมันมาจาก "รูปแบบเลขที่" ในหน้าตั้งค่า
--     (`{RUNNING:4}` ของมาตรฐานเอกสาร projectTimeline) ไม่ใช่ค่าคงที่ในโค้ด ⇒ อยากได้
--     5 หลักให้ **เผยแพร่มาตรฐานเวอร์ชันใหม่จากหน้าตั้งค่า** ไม่ใช่แก้ที่นี่
--     ปริมาณจริง ~181 ใบ/เดือน ≈ 2,200/ปี ยังห่างเพดาน 9,999 มาก
--
--  ⚠️ **ไม่แตะ PB (ใบผลิต) · SV (นัดบริการ) · IS (แจ้งปัญหา)** — ไม่อยู่ในมติรอบนี้
--     และยังใช้ถังนับรายเดือนของเดิม (ฟังก์ชัน `create_entity_rows_with_code` รับคีย์
--     ถังนับเป็นพารามิเตอร์อยู่แล้ว ⇒ ฝั่ง SQL ของ DL/PJ **ไม่ต้องแก้เลย** มีแค่ seed)
--
--  ⚠ รันมือบน Supabase SQL Editor · ไม่ลบ/ไม่แก้แถวข้อมูลเดิมแม้แต่แถวเดียว · รันซ้ำได้
--
--  🔍 ตรวจหลังรัน:
--     SELECT * FROM entity_number_counters WHERE scope IN ('DL','PJ') ORDER BY scope, month;
--     SELECT * FROM project_timeline_number_counters ORDER BY month;
-- ============================================================

BEGIN;

-- ── ① seed แถว "ปี" ของทั้งสามถัง ก่อนสลับตัวออกเลข ────────────────────────
--
-- กติกา seed เดียวกับ 0328/0329: **นับจาก "เลขที่ออกไปแล้ว" ไม่ใช่ "แถวที่ยังเหลือ"**
-- ⇒ อ่าน `lastNo` สูงสุดของแถวยุคเดือนในปีเดียวกัน (ใบที่ถูกลบไม่เหลือรหัสให้นับ
--    แต่เลขของมันถูกออกไปแล้ว · ตัวนับเป็นหลักฐานเดียวที่ยังจำได้)
-- ⚠️ ใช้ **max ไม่ใช่ sum** — จุดประสงค์คือ "อย่าออกเลขซ้ำของเดิมภายใน prefix เดียวกัน"
--    ไม่ใช่ "นับให้ได้จำนวนใบทั้งปี" · sum จะดันเลขสูงเกินจริงโดยไม่ได้กันอะไรเพิ่ม
DO $seed$
DECLARE
  v_year text := to_char(timezone('Asia/Bangkok', now()), 'YY');
  v_dl   integer;
  v_pj   integer;
  v_pt   integer;
BEGIN
  SELECT COALESCE(max("lastNo"), 0) INTO v_dl FROM public.entity_number_counters
   WHERE scope = 'DL' AND month LIKE v_year || '%' AND length(month) = 4;
  SELECT COALESCE(max("lastNo"), 0) INTO v_pj FROM public.entity_number_counters
   WHERE scope = 'PJ' AND month LIKE v_year || '%' AND length(month) = 4;
  SELECT COALESCE(max("lastNo"), 0) INTO v_pt FROM public.project_timeline_number_counters
   WHERE month LIKE v_year || '%' AND length(month) = 4;

  -- GREATEST เสมอ — trigger `entity_number_counter_guard` (0241) ห้ามค่าถอย
  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('DL', v_year, v_dl), ('PJ', v_year, v_pj)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo", EXCLUDED."lastNo");

  INSERT INTO public.project_timeline_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_pt)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo", EXCLUDED."lastNo");

  RAISE NOTICE 'ตัวนับปี % — ดีลเริ่มต่อจาก % · โครงการ % · ไทม์ไลน์ %', v_year, v_dl, v_pj, v_pt;
END
$seed$;

COMMENT ON COLUMN public.project_timeline_number_counters.month IS
  'คีย์ถังนับ — ''YY'' (ปี · ตั้งแต่ 0330) สำหรับเลขที่ออกใหม่ · ''YYMM'' คือแถวยุคเดือนที่เก็บไว้เป็นหลักฐาน';

-- ── ② PT: คัดนิยามล่าสุด (0198) มาทั้งก้อน เปลี่ยนเฉพาะคีย์ถังนับ ───────────
--
-- (DL/PJ ไม่มีท่อนนี้ — ตัวออกรหัสของมันรับคีย์ถังนับมาจากแอปอยู่แล้ว)
-- ⚠️ ท่อประกอบเลข (`{YY}{MM}` จาก v_pattern) **ห้ามแตะ** — เลขที่คนเห็นยังต้องมีเดือน
-- ⚠️ ตรรกะ "เลขฐาน = ส่วนหน้า {REVISION}" (timelineDocBase) ต้องอยู่ครบ ไม่งั้นสาย
--    ฉบับแก้ไขของไทม์ไลน์ผูกเลขไม่ได้
CREATE OR REPLACE FUNCTION public.assign_project_timeline_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_standard public.document_standard_versions%ROWTYPE;
  v_local_time timestamptz;
  v_year text;
  v_seed integer := 0;
  v_pattern text;
  v_head text;
  v_width integer;
  v_running integer;
BEGIN
  IF NEW."timelineDocNumber" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.* INTO v_standard
  FROM public.document_standards AS s
  JOIN public.document_standard_versions AS v
    ON v.id = s."publishedVersionId"
  WHERE s."documentKey" = 'projectTimeline'
    AND v.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_timeline_standard_missing';
  END IF;

  v_local_time := timezone('Asia/Bangkok', COALESCE(NEW."createdAt", now()));
  -- ⭐ คีย์ถังนับ = **ปี** (0330) · เดือนยังอยู่ในตัวเลขผ่าน v_pattern ข้างล่าง
  v_year := to_char(v_local_time, 'YY');
  v_pattern := COALESCE(
    NULLIF(btrim(v_standard."numberingPattern"), ''),
    'PT-{YY}{MM}{RUNNING:4}-{REVISION}'
  );
  v_width := COALESCE((substring(v_pattern FROM '\{RUNNING:(\d)\}'))::integer, 4);

  -- แถวของปีนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ 0328/0329)
  IF NOT EXISTS (SELECT 1 FROM public.project_timeline_number_counters WHERE month = v_year) THEN
    SELECT COALESCE(max("lastNo"), 0) INTO v_seed
    FROM public.project_timeline_number_counters
    WHERE month LIKE v_year || '%' AND length(month) = 4;
  END IF;

  INSERT INTO public.project_timeline_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running;

  IF v_running > power(10, v_width)::integer - 1 THEN
    RAISE EXCEPTION 'project_timeline_yearly_sequence_exhausted';
  END IF;

  -- ส่วนหน้า {REVISION} = เลขฐาน (พร้อมตัวคั่น) — ตรรกะเดียวกับ documentNumberParts
  -- ฝั่ง JS · รูปแบบที่ไม่มี {REVISION} (เผยแพร่ไว้ก่อนกฎใหม่ แก้ย้อนหลังไม่ได้) ให้ทั้ง
  -- ก้อนเป็นเลขฐานแล้วต่อ '-0' ตามรูปแบบเดิมของระบบ
  IF position('{REVISION}' IN v_pattern) > 0 THEN
    v_head := split_part(v_pattern, '{REVISION}', 1);
  ELSE
    v_head := v_pattern || '-';
  END IF;

  v_head := replace(v_head, '{YYYY}', to_char(v_local_time, 'YYYY'));
  v_head := replace(v_head, '{YY}', to_char(v_local_time, 'YY'));
  v_head := replace(v_head, '{MM}', to_char(v_local_time, 'MM'));
  v_head := replace(v_head, '{DD}', to_char(v_local_time, 'DD'));
  v_head := replace(v_head, '{RUNNING:3}', lpad(v_running::text, 3, '0'));
  v_head := replace(v_head, '{RUNNING:4}', lpad(v_running::text, 4, '0'));
  v_head := replace(v_head, '{RUNNING:5}', lpad(v_running::text, 5, '0'));

  NEW."timelineDocBase" := regexp_replace(v_head, '[-._/]+$', '');
  NEW."timelineDocNumber" := v_head || '0';
  NEW."timelineStandardVersionId" := v_standard.id;
  NEW."timelineStandardSnapshot" := to_jsonb(v_standard);
  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
