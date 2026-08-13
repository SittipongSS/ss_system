-- ── 0248 · ลบ "ร่างที่ยังไม่เคยอนุมัติ" แล้วเลขรันกลับมาใช้ได้ ────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-13): "ถ้าเลขเป็นเลขที่ร่างแล้วลบไป ยังใช้ได้อยู่
--   แต่ถ้าอนุมัติแล้วลบไปจะใช้ไม่ได้" — ใช้กับรหัสลูกค้า (AR) และรหัสสินค้า (FG)
--
--   ใบนี้**กลับมติ 2026-08-12 บางส่วน** (mig 0241 "ห้าม reuse ทุกกรณี") โดยจำกัดการ
--   คืนเลขไว้ที่แถวที่ **ไม่เคยอนุมัติเลย** เท่านั้น · เหตุผลที่ 0241 ให้ไว้ยังจริงทุกคำ
--   สำหรับของที่อนุมัติแล้ว: รหัสไปอยู่บนใบเสนอราคา/ใบสั่งขาย/ทะเบียนสรรพสามิต ⇒ ออกซ้ำ
--   เมื่อไร เอกสารสองใบคนละเรื่องจะอ้างรหัสเดียวกันโดยไม่มีอะไรบอกว่าอันไหนจริง
--   ส่วนร่างที่ยังไม่ผ่านอนุมัติไม่เคยออกไปไหน — GET /api/customers และ /api/products
--   คืนเฉพาะ approved ⇒ คนที่ไม่ใช่ผู้อนุมัติเลือกแถวนั้นไปวางบนเอกสารไม่ได้ตั้งแต่แรก
--
-- ⚠️ **`approvalStatus = 'pending'` ไม่ได้แปลว่า "ยังไม่เคยอนุมัติ"** — ของที่อนุมัติแล้ว
--   ถูกแก้ไขจะถูกดีดกลับเป็น pending แล้ว `approvedAt`/`approvedBy` ถูกล้างทิ้ง
--   (`resetApprovalOnEdit` ใน lib/master/approval.js) ⇒ ตัดสินจากสถานะปัจจุบันเมื่อไร
--   เลขของลูกค้าที่เคยอนุมัติและอยู่บนเอกสารไปแล้วจะถูกปล่อยคืน ซึ่งคือหายนะที่ 0241 กันไว้
--   ⇒ ใบนี้เพิ่มคอลัมน์ `firstApprovedAt` ที่ **ตั้งครั้งเดียวตลอดชีพของแถว ล้างไม่ได้**
--   แล้วใช้ค่านั้นเป็นตัวตัดสิน ไม่ใช่ `approvalStatus`
--
-- ⚠️ **แถวที่มีอยู่แล้ววันนี้ถูกถือว่า "เคยอนุมัติ" ทั้งหมด** (backfill = COALESCE
--   ("approvedAt", "createdAt")) เพราะพิสูจน์ไม่ได้ว่าแถว pending ตรงหน้าเคยอนุมัติมาก่อน
--   หรือไม่ — ค่าที่จะบอกได้ถูกล้างไปตั้งแต่ตอนแก้ · ต้นทุนของการเดาถูก = ได้เลขคืน 1 เลข
--   ต้นทุนของการเดาผิด = รหัสบนเอกสารจริงถูกออกซ้ำ ⇒ เลือกฝั่งที่ไม่คืน
--   ⇒ กติกาใหม่มีผลกับแถวที่สร้าง**หลังใบนี้**เท่านั้น (ของเดิม = พฤติกรรมเดิมทุกประการ)
--
-- ⚠️ **ไม่แตะเคาน์เตอร์เลย** — เลขที่คืนมาอยู่ในตาราง `entity_number_reclaimed` ต่างหาก
--   `entity_number_counters` ยังบวกอย่างเดียวและ trigger กันถอย/กันลบ/กันtruncate ของ
--   mig 0241 ยังทำงานครบทุกตัว **ห้ามแก้กลับไปเป็น "ลบร่างแล้วถอยเคาน์เตอร์"**: เคาน์เตอร์
--   ถอยหนึ่งครั้ง = ทุกเลขที่ออกหลังจากนั้นถูกออกซ้ำหมด ไม่ใช่แค่เลขที่ตั้งใจคืน
--
-- ⚠️ **คืนเลขที่ trigger ไม่ใช่ที่ route** — การลบมีหลายทาง (API · สคริปต์ · SQL มือ) และ
--   trigger อยู่ในทรานแซกชันเดียวกับ DELETE ⇒ ลบไม่สำเร็จก็ไม่มีเลขคืน ไม่มีทางหลุดคู่กัน
--
-- ⚠️ **แยกฟังก์ชัน trigger ต่อตาราง** ไม่ใช้ตัวเดียวสองตาราง — บทเรียนเดียวกับ mig 0126
--   (`OLD."arCode"` บนแถว products = error ตอนรัน ไม่ใช่ตอนสร้างฟังก์ชัน)
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · รันซ้ำได้ (DDL เป็น IF NOT EXISTS /
--   CREATE OR REPLACE ทั้งใบ · ท่อน backfill เขียนเฉพาะแถวที่ยังเป็น NULL)

-- ── ① "เคยอนุมัติหรือยัง" — ตั้งครั้งเดียว ล้างไม่ได้ ──────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS "firstApprovedAt" timestamptz;
ALTER TABLE public.products  ADD COLUMN IF NOT EXISTS "firstApprovedAt" timestamptz;

-- แถวที่มีอยู่ก่อนใบนี้ = ถือว่าเคยอนุมัติทั้งหมด (เหตุผลอยู่หัวไฟล์)
UPDATE public.customers SET "firstApprovedAt" = COALESCE("approvedAt", "createdAt")
WHERE "firstApprovedAt" IS NULL;
UPDATE public.products  SET "firstApprovedAt" = COALESCE("approvedAt", "createdAt")
WHERE "firstApprovedAt" IS NULL;

-- ⚠️ **"ยังไม่อนุมัติ" มีแค่สองค่า: 'pending' กับ 'rejected'** — อย่างอื่นนับว่าอนุมัติแล้ว
-- ทั้งหมด รวม NULL และค่าที่ยังไม่มีในวันนี้ · ที่ต้องเป็นแบบนี้เพราะคอลัมน์นี้ DEFAULT
-- 'approved' (mig 0027) และลิสต์ทุกหน้าคืนแถว `approvalStatus is null` มาด้วย
-- (`GET /api/customers`) ⇒ แถวที่ไม่มีสถานะ = แถวที่คนอื่นหยิบไปใส่เอกสารได้แล้ว
-- ถ้าเขียนเป็น `= 'approved'` ตรง ๆ แถวพวกนั้นจะกลายเป็น "ร่าง" แล้วคืนเลขทั้งที่ไม่ใช่
CREATE OR REPLACE FUNCTION public.customer_first_approved_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- ประทับแล้วห้ามเปลี่ยน/ห้ามล้าง — ไม่งั้นการแก้ไขที่ดีดสถานะกลับเป็น pending
  -- (resetApprovalOnEdit) จะพาแถวที่เคยอนุมัติกลับไปอยู่ในกลุ่มที่คืนเลขได้
  IF TG_OP = 'UPDATE' AND OLD."firstApprovedAt" IS NOT NULL THEN
    NEW."firstApprovedAt" := OLD."firstApprovedAt";
  ELSIF NEW."approvalStatus" IS DISTINCT FROM 'pending'
    AND NEW."approvalStatus" IS DISTINCT FROM 'rejected' THEN
    NEW."firstApprovedAt" := COALESCE(NEW."firstApprovedAt", NEW."approvedAt", now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.product_first_approved_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."firstApprovedAt" IS NOT NULL THEN
    NEW."firstApprovedAt" := OLD."firstApprovedAt";
  ELSIF NEW."approvalStatus" IS DISTINCT FROM 'pending'
    AND NEW."approvalStatus" IS DISTINCT FROM 'rejected' THEN
    NEW."firstApprovedAt" := COALESCE(NEW."firstApprovedAt", NEW."approvedAt", now());
  END IF;
  RETURN NEW;
END;
$$;

-- INSERT ด้วยเพราะผู้มีสิทธิ์อนุมัติที่กดเพิ่มเอง แถวเกิดมาเป็น approved ตั้งแต่แรก
-- (autoApprove ใน POST /api/customers · /api/products) ⇒ เลขต้องตายตั้งแต่วินาทีนั้น
DROP TRIGGER IF EXISTS customers_first_approved_stamp ON public.customers;
CREATE TRIGGER customers_first_approved_stamp
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customer_first_approved_stamp();

DROP TRIGGER IF EXISTS products_first_approved_stamp ON public.products;
CREATE TRIGGER products_first_approved_stamp
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.product_first_approved_stamp();

-- ── ② กองเลขที่คืนมา ──────────────────────────────────────────────────────
-- คีย์ (scope, no) = เลขเดียวคืนซ้ำสองครั้งไม่ได้ · "releasedFrom" เก็บรหัสเต็มของแถว
-- ที่คืนเลขนี้มา ไว้ไล่ย้อนตอนสงสัยว่าเลขนี้เคยเป็นของใคร (ตัวแถวถูกลบไปแล้ว)
CREATE TABLE IF NOT EXISTS public.entity_number_reclaimed (
  scope         text NOT NULL,
  no            integer NOT NULL,
  "releasedFrom" text,
  "releasedAt"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, no)
);
ALTER TABLE public.entity_number_reclaimed ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy = ถึงได้เฉพาะ service_role (แพตเทิร์นเดียวกับ entity_number_counters)

-- ── ③ ลบแถวที่ยังไม่เคยอนุมัติ = คืนเลขเข้ากอง ───────────────────────────
-- เงื่อนไขครบสองข้อเท่านั้นถึงคืน: (ก) ไม่เคยอนุมัติ (ข) รหัสเป็นรูปแบบที่ระบบออกให้
-- รหัสกรอกเอง (AR-AAA / FG-AAA-BB-CCC-DDDD) ไม่เคยกินเลขรัน จึงไม่มีอะไรให้คืน
CREATE OR REPLACE FUNCTION public.customer_code_reclaim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD."firstApprovedAt" IS NOT NULL THEN RETURN OLD; END IF;
  IF OLD."arCode" ~ '^AR-\d{4}$' THEN
    INSERT INTO public.entity_number_reclaimed (scope, no, "releasedFrom")
    VALUES ('AR', substring(OLD."arCode" from 4)::integer, OLD."arCode")
    ON CONFLICT (scope, no) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.product_code_reclaim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD."firstApprovedAt" IS NOT NULL THEN RETURN OLD; END IF;
  IF OLD."fgCode" ~ '^FG-\d{4}-\d{2}-\d{3}-\d{5}$' THEN
    INSERT INTO public.entity_number_reclaimed (scope, no, "releasedFrom")
    VALUES ('FG', split_part(OLD."fgCode", '-', 5)::integer, OLD."fgCode")
    ON CONFLICT (scope, no) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS customers_code_reclaim ON public.customers;
CREATE TRIGGER customers_code_reclaim
  AFTER DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customer_code_reclaim();

DROP TRIGGER IF EXISTS products_code_reclaim ON public.products;
CREATE TRIGGER products_code_reclaim
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.product_code_reclaim();

-- ── ④ ออกรหัส: หยิบจากกองคืนก่อน ไม่มีค่อยรันเลขใหม่ ─────────────────────
-- (แทนที่นิยามของ mig 0241 — ท่อนเคาน์เตอร์/ท่อน insert เหมือนเดิมทุกบรรทัด
--  ที่เพิ่มคือลูปหยิบเลขคืนข้างหน้า)
--
-- ⚠️ `FOR UPDATE SKIP LOCKED` จำเป็น: สองคนกดบันทึกพร้อมกันต้องหยิบคนละเลข ไม่ใช่
--   คนหลังรอคนแรกแล้วได้เลขเดียวกันหลัง commit
-- ⚠️ **เช็คก่อนใช้เสมอว่าเลขนั้นว่างจริง** — กองคืนกับตารางจริงเป็นคนละที่ ถ้ามีใครใส่
--   รหัสนั้นกลับเข้าไปทางอื่น (นำเข้า/แก้มือ) เลขในกองจะกลายเป็นเลขชน ⇒ ทั้ง insert
--   ล้มด้วย 23505 ซึ่งผู้ใช้อ่านเป็น "ระบบพัง" · เจอชนก็ทิ้งใบนั้นแล้ววนหาตัวถัดไป
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

  -- ── เลขที่ร่างคืนมา (mig 0248) — เอาตัวน้อยสุดก่อนเพื่ออุดรูให้เต็มตามลำดับ ──
  LOOP
    DELETE FROM public.entity_number_reclaimed
    WHERE scope = 'AR'
      AND no = (
        SELECT r.no FROM public.entity_number_reclaimed r
        WHERE r.scope = 'AR' ORDER BY r.no LIMIT 1 FOR UPDATE SKIP LOCKED
      )
    RETURNING no INTO v_no;

    EXIT WHEN v_no IS NULL;   -- กองว่าง → ไปรันเลขใหม่ข้างล่าง
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.customers
      WHERE "arCode" = p_prefix || lpad(v_no::text, p_width, '0')
    );
    -- เลขนี้มีคนใช้ไปแล้ว: หลุดจากกองไปแล้วตั้งแต่ DELETE ข้างบน วนหาตัวถัดไป
  END LOOP;

  IF v_no IS NULL THEN
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
  END IF;

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

  -- ⚠️ เลขรัน FG นับรวมทั้งระบบ (mig 0230) — ท่อนหน้าของใบที่คืนเลขมากับใบที่กำลังจะ
  -- ออกเป็นคนละลูกค้า/คนละหมวดได้ตามปกติ · "ว่างจริงไหม" จึงต้องเช็คที่**ท่อนท้ายของ
  -- รหัส FG รูปแบบใหม่ทุกใบ** ไม่ใช่เฉพาะ prefix ของใบนี้
  LOOP
    DELETE FROM public.entity_number_reclaimed
    WHERE scope = 'FG'
      AND no = (
        SELECT r.no FROM public.entity_number_reclaimed r
        WHERE r.scope = 'FG' ORDER BY r.no LIMIT 1 FOR UPDATE SKIP LOCKED
      )
    RETURNING no INTO v_no;

    EXIT WHEN v_no IS NULL;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE "fgCode" ~ '^FG-\d{4}-\d{2}-\d{3}-\d{5}$'
        AND split_part("fgCode", '-', 5) = lpad(v_no::text, p_width, '0')
    );
  END LOOP;

  IF v_no IS NULL THEN
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
  END IF;

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
