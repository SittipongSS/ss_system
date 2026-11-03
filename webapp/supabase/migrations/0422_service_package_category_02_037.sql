-- ============================================================
--  Migration 0422: หมวดแพ็คเกจบริการเป็นชุด {02-001, 02-037} — 02-037 (ก้านหอมแบบบริการ) ทำงานเหมือน 02-001 ทุกจุด
--
--  ⭐ มติเจ้าของ 03/11/2026: "ขึ้นหมวดสินค้าใหม่จะง่ายกว่า 02-037" + ยืนยัน "เหมือน 02-001 ทุกจุด"
--     · ใบเสนอราคา: รายการหมวด 02-037 ต้องกรอก "แพ็ค/เดือน" (ฝั่ง JS · lib/sales/linePacks.js PACK_LINE_CATEGORIES)
--     · ใบสั่งขาย: รายการ 02-037 เป็นแพ็คเกจบริการ (ไซต์/โซน/รอบละกี่แพ็ค/จำนวนรอบบริการ) · เลือกเป็นแพ็คเกจของบรรทัดพิมพ์เองได้
--       · ใบสั่งขายย้อนหลังคีย์ได้ · ด่านเงิน "ใบบริการต้องมีช่วงครอบ" นับด้วย (ฝั่ง JS · lib/sales/serviceOrders.js SERVICE_ROUND_CATEGORIES)
--     · 02-011 (ก้านหอมที่ขายน้ำหอมเติมเป็นกิโล/ชิ้น บนดีลสายสินค้า) **ไม่อยู่ในชุด** — สินค้าแบบบริการไปเปิดในหมวด 02-037
--     · แถวหมวด 02-037 ในทะเบียน (product_types) เจ้าของเปิดเองที่หน้าหมวดสินค้า — ไฟล์นี้ไม่สร้างแถว
--
--  🐞 ของเดิม: ห้าฟังก์ชันที่รันอยู่เทียบหมวดด้วยค่าตรง = '02-001' (ผลไล่จุด 03/11 — ไม่มี CHECK / index / WHEN ของ trigger ตัวไหนถือหมวด)
--   ฟังก์ชัน (นิยามที่รันอยู่ มาจาก)                       ตัดสินอะไร
--   sales_order_line_service_role   (0392)                 ชนิดของบรรทัดใบสั่งขาย package / not_service — ตัวตัดสินกลางที่หกฟังก์ชันเรียก
--   sales_order_service_setup_errors (0392 + 0394 + 0400)  แพ็คเกจที่บรรทัดพิมพ์เองเลือกไว้ยังใช้ได้ไหม (fg_invalid)
--   save_sales_order_service_setup  (0400)                 แพ็คเกจที่ส่งมาตอนบันทึกงานบริการ (service_setup_product_invalid)
--   historical_so_check_lines       (0379 + 0394 + 0409)   สินค้าของโซนใบย้อนหลังต้องเป็นแพ็คเกจ (historical_so_line_not_package)
--   quotation_line_pack_keep        (0410 · ยาม T2)        บรรทัดหมวดแพ็คห้ามเสียเลขแพ็คในการบันทึก/Rev. ครั้งเดียว
--   ⇒ เปิดหมวด 02-037 โดยไม่มีไฟล์นี้: จอยอมแต่ฐานตีกลับ (งานบริการ · ใบย้อนหลัง) และยามในฐานไม่คุมเลขแพ็คของ 02-037 (หายเงียบได้)
--
--  ⭐ ของใหม่: ตัวตัดสินหมวดในฐานตัวเดียว public.service_package_categories() คืน ARRAY['02-001','02-037']
--     (คู่กับ SERVICE_ROUND_CATEGORIES / PACK_LINE_CATEGORIES ฝั่ง JS — เทสต์ serviceCategoryMigration.test.mjs ยึดให้เท่ากัน)
--     · ทุกจุดข้างบนเปลี่ยน `= '02-001'` เป็น `= ANY (public.service_package_categories())` · ข้อความของยาม T2 พูดสองหมวด
--     · เพิ่มหมวดถัดไป = แก้ฟังก์ชันตัวนี้ตัวเดียว + ค่าคงที่ฝั่ง JS (ไม่ต้องปะห้าฟังก์ชันอีก)
--
--  ── ปะอะไร (9 แถว · pg_get_functiondef แบบ 0394/0400/0404/0409 — ไม่คัดเนื้อจากไฟล์เก่า · เก็บแพตช์เดิมทุกตัว) ──
--   R1 R2  sales_order_line_service_role — หมวดของ fgCode · หมวดของ metadata.categoryCode (บรรทัดพิมพ์เอง #1844)
--   E1     sales_order_service_setup_errors — หมวดของ serviceProductId
--   S1     save_sales_order_service_setup — หมวดของ serviceProductId
--   H1     historical_so_check_lines — หมวดของสินค้าโซน
--   K1 K2  quotation_line_pack_keep — หมวดของ fgCode · หมวดของ metadata.categoryCode
--   K3 K4  quotation_line_pack_keep — ข้อความ "(หมวด 02-001)" ของกิ่ง rewrite / revision → "(หมวด 02-001 หรือ 02-037)"
--   K5     quotation_line_pack_keep — HINT "บรรทัดหมวด 02-001 ห้ามเสียเลขแพ็ค" → "บรรทัดหมวด 02-001 / 02-037 ห้ามเสียเลขแพ็ค"
--   · แถวที่เป็นนิพจน์มีป้าย "/* 0422/xx */" · แถวข้อความใช้ข้อความใหม่ทั้งวลีเป็นป้าย (ป้ายของแถวหนึ่งไม่โผล่ในแถวอื่น)
--   · anchor ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · overload ต้องมีตัวเดียว · มีป้ายแล้ว = ข้าม ("ปะไว้แล้ว")
--   · CREATE OR REPLACE จากข้อความของ pg_get_functiondef เก็บเจ้าของ · สิทธิ์ EXECUTE · SECURITY · search_path
--   🪤 ไฟล์นี้ **ไม่เขียนคำว่า FUNCTION ตามด้วย public. + ชื่อฟังก์ชันที่ถูกปะ** (แม้ในคอมเมนต์) — ยาม "นิยามล่าสุด" ของหลายเทสต์
--      หาเจ้าของนิยามด้วยข้อความนั้น (historicalServiceAlignment · historicalPackQty · servicePeriodMode) · ตัวใหม่ (service_package_categories) เขียนได้
--
--  ── ไม่แตะ ──────────────────────────────────────────────────────────────────────────────────
--   · fg_category_of (ถอดรหัสหมวดเฉย ๆ) · trigger ทั้งสามของ 0410 (WHEN ดูแค่ packQty) · CHECK กฎเงิน/ช่วงแพ็คของ 0407 (ไม่ดูหมวด)
--   · save_quotation_content · create_sales_order_draft · Rev. — ก๊อป packQty ทุกหมวดอยู่แล้ว
--   · ฟังก์ชันที่ถูกแทนแล้ว (0374 · 0392 ตัวบันทึกรุ่นแรก) · ด่านก่อนรันของ 0410 · data fix 0325 — ไม่ใช่นิยามที่รันอยู่
--
--  ── ผลต่อข้อมูลเดิม ───────────────────────────────────────────────────────────────────────────
--   ไม่มีสินค้า / บรรทัดหมวด 02-037 ในฐาน ณ วันเขียน (หมวด 02 ในทะเบียนสูงสุด 02-036) ⇒ ทุกฟังก์ชันตอบเหมือนเดิมทุกแถวที่มีอยู่
--   · ใบสั่งขายที่ด่านเงินเปิดอยู่ไม่เปลี่ยนสักใบ (กับดัก #1683 "ขยายเกณฑ์ = หยุดรับเงิน" ไม่เกิด — ไม่มีบรรทัด 02-037)
--   · ลำดับรันกับ deploy สลับได้: ฐานก่อนโค้ด = จอรุ่นเดิมยังไม่เสนอ 02-037 (ไม่มีสินค้าให้เลือกอยู่ดี) ·
--     โค้ดก่อนฐาน = เลือก 02-037 เป็นแพ็คเกจแล้วฐานตีกลับดัง ๆ จนกว่าจะรันไฟล์นี้ · ลำดับแนะนำ: รันไฟล์นี้ → merge/deploy → เปิดหมวด 02-037
--
--  ── ทางกลับ (ถอยไฟล์นี้) — รันใน SQL Editor ภายใน BEGIN … COMMIT ──────────────────────────────────
--   ⚠️ ถอยเมื่อยังไม่มีสินค้าหมวด 02-037 เท่านั้น — มีแล้วถอย = ยามในฐานเลิกคุมเลขแพ็คของบรรทัด 02-037 · งานบริการ/ใบย้อนหลังตีกลับ
--   ถอยทีละฟังก์ชันด้วยสูตรเดียวกับแพตช์ (pg_get_functiondef → regexp_replace แบบกลับทาง → EXECUTE):
--     นิพจน์   `= ANY (public.service_package_categories()) /* 0422/xx */` → `= '02-001'`
--     ข้อความ  `(หมวด 02-001 หรือ 02-037)` → `(หมวด 02-001)` · `บรรทัดหมวด 02-001 / 02-037 ห้ามเสียเลขแพ็ค` → `บรรทัดหมวด 02-001 ห้ามเสียเลขแพ็ค`
--   แล้ว DROP ตัวตัดสินหมวด (ห้าม DROP ก่อนถอยครบ — ฟังก์ชันที่ถูกปะเรียกมันอยู่ · 2BP01)
--
--  ── ด่าน (RAISE แล้วทั้งไฟล์ถอย ไม่มีครึ่ง ๆ กลาง ๆ) ───────────────────────────────────────────────
--   mig_0422_patch_overload / mig_0422_patch_anchor   เนื้อของฟังก์ชันที่รันอยู่ไม่ใช่เนื้อที่ไฟล์นี้รู้จัก (ไม่พบ · overload · anchor ไม่เจอ/เจอเกินหนึ่ง)
--   mig_0422_verify                                     ตรวจท้ายไม่ครบ (ป้าย · ยังเหลือ '02-001' ตรง ๆ · สิทธิ์ · ค่าของชุด)
--  รันซ้ำได้: แถวที่ปะแล้วข้าม · ตัวตัดสินหมวดเป็น CREATE OR REPLACE
--  Supabase SQL Editor อาจเตือนหลอก ("destructive" / "creates tables without RLS" จาก SELECT … INTO ใน DO) ⇒ กด "Run without RLS"
-- ============================================================

-- ── §1 ตัวตัดสินหมวดแพ็คเกจบริการ (ชุดเดียวของฐาน) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.service_package_categories()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['02-001', '02-037']::text[];
$$;

COMMENT ON FUNCTION public.service_package_categories() IS
  'หมวดแพ็คเกจบริการรายรอบ (0422 · มติเจ้าของ 03/11: 02-037 เหมือน 02-001 ทุกจุด) — คู่กับ SERVICE_ROUND_CATEGORIES / PACK_LINE_CATEGORIES ฝั่ง JS · ผู้ใช้: ชนิดบรรทัดใบสั่งขาย · ตรวจ/บันทึกงานบริการ · ตรวจบรรทัดใบย้อนหลัง · ยามเลขแพ็ค T2';

-- ผู้เรียกทุกตัวรันในนาม service_role (route) หรือเจ้าของฐาน (SQL Editor) — trigger T2 ยิงจาก INSERT ของ service_role
REVOKE ALL ON FUNCTION public.service_package_categories() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_package_categories() TO service_role;

-- ── §2 ปะห้าฟังก์ชันที่รันอยู่ ─────────────────────────────────────────────────────────────────
-- ⚠️ ป้ายของแถวหนึ่งห้ามโผล่ในข้อความของแถวอื่น — ไม่งั้นวงเห็น "ปะไว้แล้ว" แล้วข้ามเงียบ ๆ
DO $patch$
DECLARE
  r record;
  v_n integer;
  v_oid oid;
  v_src text;
  v_def text;
  v_hits_src integer;
  v_hits_def integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('sales_order_line_service_role',
        $re$(public\.fg_category_of\(p_fg_code\)) = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/R1 */$rp$,
        '0422/R1'),
      ('sales_order_line_service_role',
        $re$(public\.fg_category_of\(p_metadata ->> 'categoryCode'\)) = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/R2 */$rp$,
        '0422/R2'),
      ('sales_order_service_setup_errors',
        $re$(public\.fg_category_of\(p\."fgCode"\)) = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/E1 */$rp$,
        '0422/E1'),
      ('save_sales_order_service_setup',
        $re$(public\.fg_category_of\(p\."fgCode"\)) = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/S1 */$rp$,
        '0422/S1'),
      ('historical_so_check_lines',
        $re$(substring\(p\."fgCode" from '\(\\d\{2\}-\\d\{3\}\)'\)) = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/H1 */$rp$,
        '0422/H1'),
      ('quotation_line_pack_keep',
        $re$(substring\(NEW\."fgCode" from '\[0-9\]\{2\}-\[0-9\]\{3\}'\)) = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/K1 */$rp$,
        '0422/K1'),
      ('quotation_line_pack_keep',
        $re$(NEW\.metadata ->> 'categoryCode') = '02-001'$re$,
        $rp$\1 = ANY (public.service_package_categories()) /* 0422/K2 */$rp$,
        '0422/K2'),
      ('quotation_line_pack_keep',
        $re$(ใบเสนอราคา %s รายการที่ %s )\(หมวด 02-001\)$re$,
        $rp$\1(หมวด 02-001 หรือ 02-037)$rp$,
        'ใบเสนอราคา %s รายการที่ %s (หมวด 02-001 หรือ 02-037)'),
      ('quotation_line_pack_keep',
        $re$(ฉบับ Rev\. %s รายการที่ %s )\(หมวด 02-001\)$re$,
        $rp$\1(หมวด 02-001 หรือ 02-037)$rp$,
        'ฉบับ Rev. %s รายการที่ %s (หมวด 02-001 หรือ 02-037)'),
      ('quotation_line_pack_keep',
        $re$(บรรทัดหมวด 02-001)( ห้ามเสียเลขแพ็ค)$re$,
        $rp$\1 / 02-037\2$rp$,
        'บรรทัดหมวด 02-001 / 02-037 ห้ามเสียเลขแพ็ค')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0422_patch_overload % count=% — ไม่ปะ แจ้งผู้พัฒนา', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0422: % — % ปะไว้แล้ว', r.fn, r.marker;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0422_patch_anchor % [%] hits=%/% — เนื้อฟังก์ชันบนฐานไม่ใช่เนื้อที่ไฟล์นี้รู้จัก · ไม่ปะ แจ้งผู้พัฒนา', r.fn, r.marker, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0422: % — % ปะแล้ว', r.fn, r.marker;
  END LOOP;
END
$patch$;

-- ── §3 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  r record;
  v_src text;
  v_fns constant text[] := ARRAY['sales_order_line_service_role', 'sales_order_service_setup_errors',
    'save_sales_order_service_setup', 'historical_so_check_lines', 'quotation_line_pack_keep'];
  v_fn text;
BEGIN
  IF public.service_package_categories() IS DISTINCT FROM ARRAY['02-001', '02-037']::text[] THEN
    RAISE EXCEPTION 'mig_0422_verify ชุดหมวดไม่ตรง: %', public.service_package_categories();
  END IF;
  IF has_function_privilege('anon', 'public.service_package_categories()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.service_package_categories()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.service_package_categories()', 'EXECUTE') THEN
    RAISE EXCEPTION 'mig_0422_verify สิทธิ์ของตัวตัดสินหมวดไม่ตรง (anon/authenticated ต้องไม่มี · service_role ต้องมี)';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('sales_order_line_service_role', '0422/R1'), ('sales_order_line_service_role', '0422/R2'),
      ('sales_order_service_setup_errors', '0422/E1'), ('save_sales_order_service_setup', '0422/S1'),
      ('historical_so_check_lines', '0422/H1'),
      ('quotation_line_pack_keep', '0422/K1'), ('quotation_line_pack_keep', '0422/K2'),
      ('quotation_line_pack_keep', 'ใบเสนอราคา %s รายการที่ %s (หมวด 02-001 หรือ 02-037)'),
      ('quotation_line_pack_keep', 'ฉบับ Rev. %s รายการที่ %s (หมวด 02-001 หรือ 02-037)'),
      ('quotation_line_pack_keep', 'บรรทัดหมวด 02-001 / 02-037 ห้ามเสียเลขแพ็ค')
    ) AS t(fn, marker)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_src IS NULL OR strpos(v_src, r.marker) = 0 THEN
      RAISE EXCEPTION 'mig_0422_verify % ไม่มีป้าย %', r.fn, r.marker;
    END IF;
  END LOOP;

  -- ไม่เหลือการเทียบหมวดแบบค่าตรง '02-001' ในห้าตัวนี้ (ข้อความ "(หมวด 02-001 หรือ 02-037)" ไม่ใช่การเทียบ)
  FOREACH v_fn IN ARRAY v_fns LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    IF v_src ~ $re$= '02-001'$re$ THEN
      RAISE EXCEPTION 'mig_0422_verify % ยังเทียบหมวดด้วย = ''02-001''', v_fn;
    END IF;
  END LOOP;
END
$verify$;

-- ── SELECT เช็กท้าย (อ่านอย่างเดียว · รันแยกหลังไฟล์นี้ได้) ────────────────────────────────────
-- SELECT public.service_package_categories() AS categories,
--        (SELECT string_agg(p.proname || ':' || (p.prosrc ~ '0422/'), ', ' ORDER BY p.proname)
--           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--          WHERE n.nspname = 'public' AND p.proname IN ('sales_order_line_service_role', 'sales_order_service_setup_errors',
--                'save_sales_order_service_setup', 'historical_so_check_lines', 'quotation_line_pack_keep')) AS patched;
-- คาด: {02-001,02-037} · ทั้งห้าตัวเป็น true
