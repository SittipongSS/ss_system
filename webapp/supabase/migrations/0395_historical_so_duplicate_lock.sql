-- ============================================================
--  Migration 0395: ใบสั่งขายย้อนหลัง — ตรวจ "ใบที่อาจซ้ำ" ใต้ล็อกรายลูกค้าในทรานแซกชันของการบันทึก
--                  (มติเจ้าของ 26/09 "ปิดขาดใบซ้ำเลย" — ต่อจาก A18 บันทึกใบซ้ำที่ผู้คีย์ยืนยัน · #1839)
--  ✅ **รันบน prod แล้ว 26/09 ภายใต้ชื่อไฟล์ 0390** — เปลี่ยนเลขเป็น 0395 ตอน merge 29/09 เพราะระหว่างนั้น main ใช้ 0390–0393
--     (0394 มีงานอื่นจองไว้) · ไม่ต้องรันซ้ำ · ป้าย `-- 0390:` ในเนื้อฟังก์ชันที่ปะ **คงไว้ตามที่รันจริง** — ตัวตรวจ
--     "ปะไว้แล้ว" เทียบข้อความใหม่ทั้งก้อนกับ prosrc ถ้าแก้ป้ายในไฟล์ รันซ้ำจะปะทับรอบสองแล้วตรวจท้ายถอยทั้งไฟล์
--
--  ⭐ ทำไมต้องมี: A18 บันทึกว่าผู้คีย์ยืนยันใบไหนว่าไม่ซ้ำ แต่การหาใบซ้ำกับด่าน 409 อยู่ที่ route (JS) **นอกทรานแซกชัน**
--    ของ RPC ⇒ เหลือช่องโหว่สองช่องที่บันทึกปิดไม่ได้ (ปิดได้แค่ด้วยคำเตือนตอนผู้อนุมัติเปิดใบ):
--    ① **แข่งกัน** — ผู้คีย์สองคนบันทึกใบของลูกค้าเดียวกันที่วันเริ่มสัญญา/เลขเอกสารเดิมตรงกันพร้อมกัน ⇒ ต่างคนต่างอ่าน
--       ก่อนอีกฝ่ายลงฐาน ⇒ ทั้งสองผ่านด่าน โดยไม่มีใครยืนยันใบของอีกฝ่าย
--    ② **ส่งซ้ำ (เน็ตหลุดหลังสร้าง)** — RPC คืนใบเดิมโดยไม่เขียนอะไร ⇒ การยืนยัน/เหตุผลของรอบที่กดใหม่หาย
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) ฟังก์ชันกลาง `public.historical_so_check_duplicates(order_id, customer_id, start, refs[], review)`
--     · ล็อกรายลูกค้า `pg_advisory_xact_lock(hashtext('historical_so_dup:' || customer))` ถึงจบทรานแซกชัน
--       ⇒ การบันทึกใบย้อนหลังของลูกค้าเดียวกันเดินทีละคำขอ · คำขอที่สองอ่านเห็นใบของคำขอแรกที่ลงฐานแล้วแน่นอน
--     · กติกาเดียวกับ `historicalDuplicateMatches` (lib/sales/historicalDuplicates.js — เทสต์เทียบ):
--       ใบย้อนหลัง · ลูกค้าเดียวกัน · ไม่ใช่ใบนี้ · ไม่ถูกยกเลิก · วันเริ่มสัญญา (`orderDate`) ตรง หรือเลขเอกสารเดิมตัวใดตัวหนึ่งตรง
--       (ตัดช่องว่างหัวท้าย · ไม่สนตัวพิมพ์)
--     · ใบที่พบต้องอยู่ในรายการที่ผู้คีย์ยืนยันแล้ว (`review.orders[].id` — บันทึกที่ route ต่อท้าย `p_header.intake`)
--       ไม่ครบ = RAISE `historical_so_duplicate_unacknowledged` (DETAIL = id ที่ขาด) ⇒ route ตอบ 409 พร้อมรายการใหม่
--  2) ปะสามจุด **จากนิยามที่รันอยู่จริง** (`pg_get_functiondef` — แบบเดียวกับ 0382 · ไม่ถอยเนื้อส่วนอื่น เช่นเงื่อนไขตำแหน่งของ 0382):
--     · create_historical_sales_order — หลังอ่านช่วงสัญญา (ก่อนลงฐาน) เรียกตัวตรวจ
--     · create_historical_sales_order — ทางส่งซ้ำ: ใบที่ยังเป็นร่าง + คำขอพกบันทึกมา ⇒ ตรวจใบซ้ำใต้ล็อกแล้วเขียนบันทึกรอบนี้ทับ
--       (ใบที่ส่งอนุมัติไปแล้ว/อนุมัติแล้วไม่แตะ — คำขอค้างจากแท็บเก่าต้องไม่ขยับใบที่ผ่านขั้นไปแล้ว)
--     · update_historical_sales_order — หลังอ่านช่วงสัญญา (ก่อนเขียนทับ) เรียกตัวตรวจ
--     🛑 จุดที่คาดไว้ต้องเจอ **ครั้งเดียวพอดี** ในแต่ละฟังก์ชัน — ไม่เจอและยังไม่เคยปะ หรือเจอเกิน = RAISE ทั้งไฟล์ถอยกลับ
--  3) ตรวจท้าย: create มีการเรียกตัวตรวจ 2 จุด · update 1 จุด
--
--  ⭐ ลำดับล็อก (ไม่มีวงวน — รีวิว 26/09 จับได้ว่ารุ่นแรกของทางส่งซ้ำกลับลำดับ): แถวใบมาก่อนล็อกรายลูกค้าเสมอ
--     สร้างใหม่ = รหัสการคีย์ → คู่ลูกค้า×AE → ใบซ้ำรายลูกค้า (ใบยังไม่มีแถว) · ส่งซ้ำ = รหัสการคีย์ → แถวใบ (FOR UPDATE) → ใบซ้ำรายลูกค้า ·
--     แก้ใบ = แถวใบ/สัญญา (FOR UPDATE) → ใบซ้ำรายลูกค้า · หลังถือล็อกรายลูกค้าไม่มีเส้นไหนไปรอแถวใบของคำขออื่น
--  ⭐ ไม่แตะตาราง/ข้อมูล · ไม่เปลี่ยน signature · ลายนิ้วมือของคำขอไม่เปลี่ยน (บันทึกไม่เข้าแฮช — route ต่อท้ายหลังคิดแฮช)
--  ⭐ **แนะนำ deploy โค้ดรอบนี้ก่อน แล้วค่อยรัน** — route รุ่นนี้แปลรหัสจาก RPC เป็น 409 พร้อมรายการที่อ่านใหม่
--     (deploy ก่อนรัน = ไม่มีใครโยนรหัสนี้ = ไม่มีอะไรเปลี่ยน) · รันก่อน deploy ก็ไม่พังข้อมูล แต่ route รุ่นเก่า (#1839) ไม่รู้จักรหัสนี้
--     ⇒ ถ้าแข่งกันจริงช่วงนั้น ผู้คีย์ได้ 500 ข้อความกลาง (ยังไม่มีอะไรลงฐาน) · กดบันทึกอีกครั้ง = ด่าน JS อ่านใบใหม่แล้วตอบ 409 พร้อมรายการ
--  ⚠️ DDL — รันมือบน Supabase SQL Editor
--  ✅ รันซ้ำได้ — ฟังก์ชันกลาง CREATE OR REPLACE · จุดที่ปะแล้ว (มีการเรียกตัวตรวจอยู่แล้ว) ถูกข้าม
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: create_calls = 2 · update_calls = 1 · helper = 1 · anon_can_execute = f
--
--   SELECT
--     (SELECT (length(p.prosrc) - length(replace(p.prosrc, 'public.historical_so_check_duplicates(', '')))
--             / length('public.historical_so_check_duplicates(')
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'create_historical_sales_order') AS create_calls,
--     (SELECT (length(p.prosrc) - length(replace(p.prosrc, 'public.historical_so_check_duplicates(', '')))
--             / length('public.historical_so_check_duplicates(')
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'update_historical_sales_order') AS update_calls,
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'historical_so_check_duplicates') AS helper,
--     has_function_privilege('anon', 'public.historical_so_check_duplicates(text, text, date, text[], jsonb)', 'EXECUTE')
--       AS anon_can_execute;

BEGIN;

-- ── 1) ตัวตรวจกลาง ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.historical_so_check_duplicates(
  p_order_id    text,
  p_customer_id text,
  p_start       date,
  p_refs        text[],
  p_review      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refs    text[];
  v_acked   text[];
  v_missing text;
BEGIN
  IF p_customer_id IS NULL THEN RETURN; END IF;

  -- ล็อกรายลูกค้าถึงจบทรานแซกชัน — คำขอที่สองรอจนคำขอแรกลงฐาน แล้วคำสั่งข้างล่างอ่านเห็นใบนั้น (READ COMMITTED)
  PERFORM pg_advisory_xact_lock(hashtext('historical_so_dup:' || p_customer_id));

  SELECT COALESCE(array_agg(DISTINCT lower(btrim(r))), '{}'::text[]) INTO v_refs
    FROM unnest(COALESCE(p_refs, '{}'::text[])) AS r
   WHERE NULLIF(btrim(r), '') IS NOT NULL;

  -- ใบที่ผู้คีย์ยืนยันแล้ว = รายการในบันทึกที่ route ประกอบจากใบที่ผู้คีย์เห็นและยืนยันครบ (ไม่มีบันทึก = ยังไม่ยืนยันใบไหน)
  SELECT COALESCE(array_agg(e->>'id'), '{}'::text[]) INTO v_acked
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_review->'orders') = 'array' THEN p_review->'orders' ELSE '[]'::jsonb END
         ) AS e
   WHERE jsonb_typeof(e) = 'object' AND NULLIF(btrim(COALESCE(e->>'id', '')), '') IS NOT NULL;

  SELECT string_agg(o.id, ',' ORDER BY o.id) INTO v_missing
    FROM public.sales_orders o
   WHERE o.origin = 'historical'
     AND o."customerId" = p_customer_id
     AND o.id IS DISTINCT FROM p_order_id
     AND o.status IS DISTINCT FROM 'cancelled'
     AND (
       (p_start IS NOT NULL AND o."orderDate" = p_start)
       OR lower(btrim(COALESCE(o."historicalQuoteRef", ''))) = ANY (v_refs)
       OR lower(btrim(COALESCE(o."historicalExpressRef", ''))) = ANY (v_refs)
       OR lower(btrim(COALESCE(o."historicalInvoiceRef", ''))) = ANY (v_refs)
     )
     AND NOT (o.id = ANY (v_acked));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'historical_so_duplicate_unacknowledged' USING DETAIL = v_missing;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.historical_so_check_duplicates(text, text, date, text[], jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 2) ปะสามจุดจากนิยามที่รันอยู่จริง ─────────────────────────────────────────────
DO $patch$
DECLARE
  r record;
  v_proc record;
  v_def text;
  v_hits int;
  v_patched int;
  v_already int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('create_historical_sales_order', 'check',
        $o$  v_end   := (v_c->>'endDate')::date;
$o$,
        $n$  v_end   := (v_c->>'endDate')::date;
  -- 0390: ใบที่อาจซ้ำตรวจใต้ล็อกรายลูกค้าในทรานแซกชันนี้ (ปิดช่องแข่งกันบันทึก — มติ 26/09)
  PERFORM public.historical_so_check_duplicates(v_order_id, v_customer_id, v_start,
    ARRAY[p_header->>'historicalQuoteRef', p_header->>'historicalExpressRef', p_header->>'historicalInvoiceRef'],
    p_header->'intake'->'duplicateReview');
$n$),
      ('create_historical_sales_order', 'replay',
        $o$    RETURN jsonb_build_object(
      'replayed', true,$o$,
        $n$    -- 0390: ส่งซ้ำของใบที่ยังเป็นร่าง = ตรวจใบซ้ำใต้ล็อกแล้วเขียนบันทึกการยืนยันของรอบนี้ทับ (รอบที่กดใหม่ไม่หาย)
    --   · ล็อกแถวใบก่อน แล้วค่อยล็อกรายลูกค้า (ในตัวตรวจ) — ลำดับเดียวกับการแก้ใบ ⇒ ไม่มีวงวนล็อก (deadlock)
    --   · ใบที่ส่งอนุมัติ/อนุมัติแล้ว/ถูกลบไปแล้วไม่แตะ — คำขอค้างจากแท็บเก่าต้องไม่ขยับใบที่ผ่านขั้นไปแล้ว
    --   · ใบถูกแก้จากที่อื่นหลังสร้าง (updatedAt ≠ createdAt หรือวันเริ่ม/เลขเดิมไม่เท่าคำขอนี้แล้ว) = ไม่เขียนทับ
    --     — บันทึกของคำขอเก่าอ้างค่าที่ไม่ใช่ของใบแล้ว หรือทับบันทึกที่ใหม่กว่าของการแก้ใบ · วันที่เทียบด้วย to_char (ไม่ขึ้นกับ DateStyle)
    IF jsonb_typeof(p_header->'intake'->'duplicateReview') = 'object' THEN
      PERFORM 1 FROM public.sales_orders WHERE id = v_order_id AND status = 'draft' FOR UPDATE;
      IF FOUND THEN
        SELECT * INTO v_existing FROM public.sales_orders WHERE id = v_order_id;
        IF v_existing."updatedAt" = v_existing."createdAt"
           AND to_char(v_existing."orderDate", 'YYYY-MM-DD') IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_contract->>'startDate', '')), '')
           AND v_existing."historicalQuoteRef" IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_header->>'historicalQuoteRef', '')), '')
           AND v_existing."historicalExpressRef" IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_header->>'historicalExpressRef', '')), '')
           AND v_existing."historicalInvoiceRef" IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_header->>'historicalInvoiceRef', '')), '') THEN
          PERFORM public.historical_so_check_duplicates(v_order_id, v_customer_id, v_existing."orderDate",
            ARRAY[v_existing."historicalQuoteRef", v_existing."historicalExpressRef", v_existing."historicalInvoiceRef"],
            p_header->'intake'->'duplicateReview');
          UPDATE public.sales_orders SET
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('historicalIntake',
              COALESCE(metadata->'historicalIntake', '{}'::jsonb)
                || jsonb_build_object('duplicateReview', p_header->'intake'->'duplicateReview'))
          WHERE id = v_order_id AND status = 'draft'
          RETURNING * INTO v_existing;
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,$n$),
      ('update_historical_sales_order', 'check',
        $o$  v_end   := (v_c->>'endDate')::date;
$o$,
        $n$  v_end   := (v_c->>'endDate')::date;
  -- 0390: ใบที่อาจซ้ำตรวจใต้ล็อกรายลูกค้าในทรานแซกชันนี้ (ปิดช่องแข่งกันบันทึก — มติ 26/09)
  PERFORM public.historical_so_check_duplicates(v_order.id, v_order."customerId", v_start,
    ARRAY[p_header->>'historicalQuoteRef', p_header->>'historicalExpressRef', p_header->>'historicalInvoiceRef'],
    p_header->'intake'->'duplicateReview');
$n$)
    ) AS t(fn, part, old_expr, new_expr)
  LOOP
    v_patched := 0;
    v_already := 0;
    FOR v_proc IN
      SELECT p.oid, p.prosrc
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = r.fn
    LOOP
      -- รันซ้ำ: ส่วนนี้ปะไปแล้วรอบก่อน (ข้อความใหม่ทั้งก้อนอยู่แล้ว)
      IF strpos(v_proc.prosrc, btrim(r.new_expr)) > 0 THEN v_already := v_already + 1; CONTINUE; END IF;
      v_hits := (length(v_proc.prosrc) - length(replace(v_proc.prosrc, r.old_expr, ''))) / length(r.old_expr);
      IF v_hits <> 1 THEN
        RAISE EXCEPTION '0395: % (%) เจอจุดที่คาดไว้ % จุด (คาด 1) — ไม่ปะ ตรวจนิยามก่อน', r.fn, r.part, v_hits;
      END IF;
      v_def := pg_get_functiondef(v_proc.oid);
      EXECUTE replace(v_def, r.old_expr, r.new_expr);
      v_patched := v_patched + 1;
    END LOOP;
    IF v_patched = 0 AND v_already = 0 THEN
      RAISE EXCEPTION '0395: หาฟังก์ชัน % ไม่เจอ — ไม่ปะ', r.fn;
    END IF;
    RAISE NOTICE '0395: % (%) — ปะ % · ปะไว้แล้ว %', r.fn, r.part, v_patched, v_already;
  END LOOP;
END
$patch$;

-- ── 3) ตรวจท้าย ─────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_create int;
  v_update int;
  v_marker text := 'public.historical_so_check_duplicates(';
BEGIN
  SELECT (length(p.prosrc) - length(replace(p.prosrc, v_marker, ''))) / length(v_marker) INTO v_create
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_historical_sales_order';
  SELECT (length(p.prosrc) - length(replace(p.prosrc, v_marker, ''))) / length(v_marker) INTO v_update
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'update_historical_sales_order';
  IF v_create IS DISTINCT FROM 2 OR v_update IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '0395: ตัวตรวจใบซ้ำไม่ครบ (create % จุด คาด 2 · update % จุด คาด 1)', v_create, v_update;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
