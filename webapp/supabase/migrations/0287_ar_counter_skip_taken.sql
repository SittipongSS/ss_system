-- ── 0287 · เคาน์เตอร์ AR ต้องข้ามเลขที่มีคนถืออยู่แล้ว ───────────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-24 "admin แก้เลข AR ได้ทั้งระบบใหม่และระบบเก่า"):
--   ตั้งแต่ใบนี้เป็นต้นไป **รหัสรูปแบบที่ระบบออกให้ (AR-AAAA) ถูกพิมพ์เข้าไปเองได้**
--   โดย admin ตอนแก้ทะเบียนลูกค้า (PATCH /api/customers/[id]) ⇒ เลข 4 หลักในตาราง
--   `customers` ไม่ได้มาจากเคาน์เตอร์ทางเดียวอีกต่อไป
--
-- 🔴 **ปัญหาที่ต้องปิดพร้อมกัน — ไม่ใช่การปรับปรุงเผื่ออนาคต**
--   `create_customer_with_code` (mig 0248) เช็คว่า "เลขว่างจริงไหม" เฉพาะเลขที่หยิบจาก
--   กองเลขคืน (`entity_number_reclaimed`) เท่านั้น · ขา **เคาน์เตอร์** เชื่อสนิทว่าเลขถัดไป
--   ต้องว่างเสมอ ซึ่งจริงตราบใดที่เคาน์เตอร์เป็นทางเดียวที่ออกเลข 4 หลักได้
--
--   พอ admin ตั้งรหัสเป็น AR-1500 ทั้งที่เคาน์เตอร์เพิ่งอยู่ที่ 1010:
--     · เคาน์เตอร์รันมาถึง 1500 → INSERT ชน unique (23505) → ฟังก์ชันโยน → **ทรานแซกชัน
--       ทั้งก้อน rollback รวมถึงการบวกเคาน์เตอร์** ⇒ กดใหม่ก็ได้ 1500 ซ้ำเดิมทุกครั้ง
--     ⇒ **ค้างถาวร**: เพิ่มลูกค้าใหม่ด้วยสวิตช์ "ระบบใหม่" ไม่ได้อีกเลยทั้งระบบ และข้อความ
--       ที่ผู้ใช้เห็นคือ "รหัสลูกค้านี้มีในระบบแล้ว" ทั้งที่เขาไม่ได้พิมพ์รหัสอะไรเลย
--
--   ใบนี้จึงให้ขาเคาน์เตอร์ **วนบวกจนกว่าจะได้เลขที่ว่างจริง** — กติกาเดียวกับขากองเลขคืน
--   ที่ทำแบบนี้อยู่แล้ว (คอมเมนต์ของ 0248: "เจอชนก็ทิ้งใบนั้นแล้ววนหาตัวถัดไป")
--
-- ⚠️ **ไม่ไปดันเคาน์เตอร์ตอน admin บันทึกรหัส** (ทางเลือกที่ตกไป) — admin ตั้ง AR-9500
--   ครั้งเดียว = เผาเลข 1011–9499 ทิ้งทั้งช่วง ซึ่งเอาคืนไม่ได้ (trigger mig 0241 ห้าม
--   เคาน์เตอร์ถอย) · การข้ามเฉพาะใบที่ชนจริงเสียเลขแค่ใบเดียวและถูกต้องเท่ากัน
--
-- ⚠️ **แก้เฉพาะ AR** — `create_product_with_code` ไม่ต้องแก้เพราะรหัส FG ยังพิมพ์เอง
--   ในรูปแบบที่ระบบออกให้ไม่ได้ (โหมดกรอกเองของ FG ท่อนลูกค้ากว้าง 3 หลักเสมอ) ⇒ ขา
--   เคาน์เตอร์ FG ยังเป็นทางเดียวที่ออกเลข 5 หลัก · วันไหนเปิดให้แก้ `fgCode` แบบเดียวกัน
--   ต้องยกท่อนวนนี้ไปใส่ให้ครบเหมือนกัน
--
-- ⚠ รันมือบน Supabase · รันซ้ำได้ (CREATE OR REPLACE ทั้งใบ)
--   ท่อนอื่นของฟังก์ชันคัดลอกมาจาก mig 0248 ทั้งบรรทัด — ที่ต่างมีเฉพาะ LOOP ของขาเคาน์เตอร์

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

    -- ⭐ ใบนี้: บวกแล้วเช็คว่าเลขว่างจริง ไม่ว่างก็บวกต่อ (เหตุผลอยู่หัวไฟล์)
    -- เคาน์เตอร์เดินหน้าอย่างเดียวเหมือนเดิม — เลขที่ข้ามไปคือเลขที่มีเจ้าของอยู่แล้ว
    LOOP
      INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
      VALUES ('AR', '-', v_seed + 1)
      ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = GREATEST(c."lastNo" + 1, 1001)
      RETURNING "lastNo" INTO v_no;

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.customers
        WHERE "arCode" = p_prefix || lpad(v_no::text, p_width, '0')
      );
      -- เลขชนแล้วยังไม่จบช่วง = วนบวกต่อ · เกินความกว้างเมื่อไรจบด้วย exception ข้างล่าง
      EXIT WHEN v_no > power(10, p_width)::integer - 1;
    END LOOP;
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
