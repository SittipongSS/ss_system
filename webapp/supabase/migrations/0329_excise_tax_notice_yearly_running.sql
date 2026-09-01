-- ============================================================
--  Migration 0329: เลขใบแจ้งชำระค่าภาษีสรรพสามิต (ET) รันยาวทั้งปี ตัดรอบทุกปี
--  (มติผู้ใช้ 2026-09-01: "ET เอาแบบ QT")
--
--  ⭐ ทำตาม 0328 ทุกประการ — เปลี่ยน **รอบตัดของเลขรัน** อย่างเดียว รูปแบบเลขคงเดิม
--     `ET-{YY}{MM}{RUNNING:4}-{REVISION}` ⇒ `YYMM` ยังบอกเดือนที่ออกใบเหมือนเดิม
--     แต่เลขรันเดินต่อข้ามเดือนภายในปี แล้วเริ่มใหม่ตอนขึ้นปีใหม่
--
--  🔴 **`YYMM` ในเลข ≠ ตัวตัดรอบของเลขรัน** — ตัวตัดรอบคือคีย์ `month` ของ
--     `excise_tax_notice_number_counters` ซึ่งใบนี้เปลี่ยนจาก `'YYMM'` → `'YY'`
--     (แถวยุคเดือนยังอยู่ในตารางเดียวกันถาวร ห้ามลบ — เป็นหลักฐานว่าเลขไหนออกไปแล้ว)
--
--  🔍 **สภาพจริงตอนทำใบนี้ (2026-09-01)** — ตาราง `orders` (ที่ถือ `taxNoticeNumber`)
--     **ไม่มีแถวเหลืออยู่เลย** แต่ตัวนับรายเดือนยังจำได้ว่าเคยออกเลขไปแล้ว
--     (`2607` = 1 · `2608` = 3) ⇒ **ห้าม seed จากแถวอย่างเดียว** ไม่งั้นปีนี้เริ่มนับ 1
--     ใหม่แล้วออก `ET-26090001` ซ้ำกับเลขที่เคยออกไปในเดือน ก.ย.… (ถ้ามี) หรือซ้ำกับ
--     เอกสารกระดาษที่พิมพ์ไปแล้ว · seed จึงเป็น GREATEST(แถวจริง, `lastNo` ของแถวเดือน)
--
--  ⚠️ ต่างจาก 0328 ตรงที่ **ไม่มีด่าน CHECK ให้ปลด** — `excise_tax_notice_number_counters.month`
--     เป็น `text PRIMARY KEY` เฉย ๆ (CHECK มีแค่ `"lastNo" >= 0`) ⇒ คีย์ปี 2 หลักใส่ได้เลย
--     (ตรวจแล้วที่ 0162:47 · ตัวที่มี CHECK 4 หลักคือ `sales_order_number_counters` เท่านั้น)
--
--  ⚠️ ใบนี้ **ไม่แตะไทม์ไลน์โครงการ (PT)** — มติผู้ใช้ให้ยกไปทำพร้อมรหัสดีล (DL) และ
--     โครงการ (PJ) เพราะสามอย่างนั้นเกิดคู่กันและควรได้กติกาเดียวกันในรอบเดียว
--
--  ⚠ รันมือบน Supabase SQL Editor · ไม่ลบ/ไม่แก้แถวเอกสารเดิมแม้แต่แถวเดียว · รันซ้ำได้
--
--  🔍 ตรวจหลังรัน (ต้องมีแถวปี และค่า ≥ เลขที่ออกไปแล้ว):
--     SELECT * FROM excise_tax_notice_number_counters ORDER BY month;
-- ============================================================

BEGIN;

-- ── ① seed แถว "ปี" ก่อนสลับ trigger ────────────────────────────────────────
--
-- เลขบนใบเป็น `ET-YYMMXXXX-R` ⇒ เลขรันคือ 4 หลักที่ตามหลัง `ET-` + `YYMM`
-- (รูปแบบที่เผยแพร่อยู่ใช้ `{RUNNING:4}` · ถ้าวันหนึ่งเปลี่ยนความกว้าง ใบ seed ใบใหม่
--  ต้องอ่านความกว้างจากรูปแบบจริง ไม่ใช่คัดบรรทัดนี้ไปใช้ต่อ)
DO $seed$
DECLARE
  v_year text := to_char(timezone('Asia/Bangkok', now()), 'YY');
  v_no   integer;
BEGIN
  SELECT GREATEST(
    COALESCE((SELECT max((substring(o."taxNoticeNumber" from '^ET-[0-9]{4}([0-9]{4})'))::integer)
                FROM public.orders o
               WHERE o."taxNoticeNumber" ~ ('^ET-' || v_year || '[0-9]{6}')), 0),
    COALESCE((SELECT max(c."lastNo")
                FROM public.excise_tax_notice_number_counters c
               WHERE c.month LIKE v_year || '%' AND length(c.month) = 4), 0)
  ) INTO v_no;

  -- GREATEST เสมอ — เคาน์เตอร์เดินหน้าอย่างเดียว (กติกาเดียวกับ 0241/0242)
  INSERT INTO public.excise_tax_notice_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_no)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo", EXCLUDED."lastNo");

  RAISE NOTICE 'ตัวนับใบแจ้งภาษีปี % — เริ่มต่อจาก %', v_year, v_no;
END
$seed$;

COMMENT ON COLUMN public.excise_tax_notice_number_counters.month IS
  'คีย์ถังนับ — ''YY'' (ปี · ตั้งแต่ 0329) สำหรับเลขที่ออกใหม่ · ''YYMM'' คือแถวยุคเดือนที่เก็บไว้เป็นหลักฐาน';

-- ── ② คัดนิยามล่าสุด (0162) มาทั้งก้อน เปลี่ยนเฉพาะคีย์ถังนับ ───────────────
--
-- ⚠️ ท่อประกอบเลข (`{YY}{MM}` จาก v_pattern) **ห้ามแตะ** — เลขที่คนเห็นยังต้องมีเดือน
-- ⚠️ trigger ตัวนี้ทำงาน BEFORE INSERT บน `orders` และข้ามให้เองถ้าใบมีเลขแล้ว
--    (`NEW."taxNoticeNumber" IS NOT NULL`) — กติกานั้นคงไว้ทุกบรรทัด
CREATE OR REPLACE FUNCTION public.assign_excise_tax_notice_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_standard public.document_standard_versions%ROWTYPE;
  v_local_time timestamp;
  v_year text;
  v_seed integer := 0;
  v_pattern text;
  v_width integer;
  v_running integer;
BEGIN
  IF NEW."taxNoticeNumber" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.* INTO v_standard
  FROM public.document_standards AS s
  JOIN public.document_standard_versions AS v
    ON v.id = s."publishedVersionId"
  WHERE s."documentKey" = 'exciseTaxNotice'
    AND v.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'excise_tax_notice_standard_missing';
  END IF;

  v_local_time := timezone('Asia/Bangkok', COALESCE(NEW."createdAt", now()));
  -- ⭐ คีย์ถังนับ = **ปี** (0329) · เดือนยังอยู่ในตัวเลขผ่าน v_pattern ข้างล่าง
  v_year := to_char(v_local_time, 'YY');
  v_pattern := COALESCE(
    NULLIF(btrim(v_standard."numberingPattern"), ''),
    'ET-{YY}{MM}{RUNNING:4}-{REVISION}'
  );
  v_width := COALESCE((substring(v_pattern FROM '\{RUNNING:(\d)\}'))::integer, 4);

  -- แถวของปีนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ 0328)
  -- ปีใหม่ปกติจะไม่มีแถวยุคเดือนของปีนั้น ⇒ ได้ 0 แล้วเริ่ม 0001 ตามที่ควรเป็น
  IF NOT EXISTS (SELECT 1 FROM public.excise_tax_notice_number_counters WHERE month = v_year) THEN
    SELECT COALESCE(max("lastNo"), 0) INTO v_seed
    FROM public.excise_tax_notice_number_counters
    WHERE month LIKE v_year || '%' AND length(month) = 4;
  END IF;

  INSERT INTO public.excise_tax_notice_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running;

  IF v_running > power(10, v_width)::integer - 1 THEN
    RAISE EXCEPTION 'excise_tax_notice_yearly_sequence_exhausted';
  END IF;

  NEW."taxNoticeNumber" := v_pattern;
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{YYYY}', to_char(v_local_time, 'YYYY'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{YY}', to_char(v_local_time, 'YY'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{MM}', to_char(v_local_time, 'MM'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{DD}', to_char(v_local_time, 'DD'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{RUNNING:3}', lpad(v_running::text, 3, '0'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{RUNNING:4}', lpad(v_running::text, 4, '0'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{RUNNING:5}', lpad(v_running::text, 5, '0'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{REVISION}', '0');
  NEW."taxNoticeStandardVersionId" := v_standard.id;
  NEW."taxNoticeStandardSnapshot" := to_jsonb(v_standard);
  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
