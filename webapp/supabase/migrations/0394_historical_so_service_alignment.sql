-- ============================================================
--  Migration 0394: ใบสั่งขายย้อนหลัง — แพ็คต่อรอบรายโซน + รอบบริการบังคับ + วันวางบิลรายงวด
--                  + เปิดรอบขายผ่านตัวกลางของ 0392 (PR-D · มติเจ้าของ 26/09 A3/O9 · แผน IMPL_PLAN_D Rev. 2)
--
--  🐞 ของเดิม (0374 + 0379):
--     · ขั้น ② ของฟอร์มคีย์ไม่มี "แพ็คต่อรอบ" — ขั้นอนุมัติเขียนรอบขายของโซน (term) เองด้วย packageQty = จำนวนของ
--       บรรทัด ⇒ "1 ชุด × 12 เดือน" กลายเป็น 12 แพ็คต่อรอบให้ TS (กับดักที่ 0379 เขียนไว้แต่ไม่แก้)
--     · รอบบริการเว้นว่างได้ (COALESCE(v_rounds, 1)) — TS ไม่รู้ว่าขายไว้กี่ครั้ง
--     · ใบย้อนหลังไม่เก็บวันวางบิล (docs/billing-cycle.md หัวข้อ "ยังไม่ทำ" — RPC ของใบย้อนหลังไม่มีคอลัมน์นี้)
--     · ใบ pipeline เปิดรอบขายผ่านตัวกลาง sales_order_open_service_terms (0392) แต่ใบย้อนหลังมีเส้นของตัวเอง
--       ⇒ ใบย้อนหลังที่อนุมัติไม่มีตรา serviceTermsOpenedAt · term ไม่ใช่หน่วย 'แพ็ค'
--  ⭐ ของใหม่: 1 บรรทัด = 1 โซน (เหมือนเดิม) + แพ็คต่อรอบของโซนเก็บที่ sales_order_line_zones (ตารางของ 0392)
--     + รอบบริการบังคับ + วันวางบิลรายงวด (ไม่บังคับ · งวดยกมาไม่มีเสมอ) → อนุมัติ = เปิดรอบขายผ่านตัวกลางตัวเดียวกับ
--     ใบ pipeline: term = แพ็คต่อรอบ · หน่วย 'แพ็ค' · id 'SZT-S…' · ใบได้ตรา · ไม่ครบ = ถอยทั้งการอนุมัติ
--
--  ── ปะอะไร (11 แถว · pg_get_functiondef แบบ 0382/0392 — ไม่ก๊อปเนื้อทั้งตัวมาไว้ที่นี่) ─────────────────────
--   ตัวกลางของ 0392
--   P8   sales_order_open_service_terms — ใบย้อนหลังผ่านด่าน "ไม่เกี่ยว" (ไม่ถามสายธุรกิจ) · ใบ pipeline เหมือนเดิม
--   P9a  sales_order_service_setup_errors — ใบย้อนหลังถูกตรวจด้วย (ไม่ถามสายธุรกิจ — ทุกบรรทัดเป็นแพ็คเกจ 02-001 ผูกโซน)
--   P9b  sales_order_service_setup_errors — period_missing เฉพาะใบ pipeline (ช่วงบริการของใบย้อนหลังอยู่ที่เอกสารแทนสัญญา)
--   P9c  sales_order_service_setup_errors — ใบย้อนหลัง: แถวโซนของบรรทัดต้องมีแถวเดียว = serviceZoneId ของบรรทัด
--        ไม่ตรง = รหัสใหม่ historical_zone_mismatch:<บรรทัด>
--   ตัวตรวจ/ตัวเขียนของใบย้อนหลัง (0379)
--   P4   historical_so_check_lines — serviceRounds ว่าง = historical_so_line_rounds_required ·
--        packsPerRound **มีคีย์** = ต้องเป็นตัวเลขจำนวนเต็ม 1–9999 ไม่งั้น historical_so_line_packs_invalid ·
--        ไม่มีคีย์ = ผ่าน (ขั้นส่ง/อนุมัติประกอบแถวที่เก็บแล้วเป็น jsonb ใหม่ซึ่งไม่มีคีย์นี้ — ตัวกลางตรวจแถวโซนแทน)
--   P5   historical_so_write_children — **ทุกบรรทัด** ต้องพก packsPerRound เป็นตัวเลขจำนวนเต็ม 1–9999 (ฟอร์มรุ่นก่อน
--        ไม่พก = historical_so_line_packs_invalid) · ตรวจก่อนลบของเดิม
--   P6   historical_so_write_children — หลังเขียนบรรทัด: แถวโซน 1 แถวต่อบรรทัด (โซน = serviceZoneId · แพ็คจาก payload ·
--        id = 'SLZ-' || md5(บรรทัด:โซน) · sortOrder 0) · นับครบทุกบรรทัด · แถวเก่าหายไปกับบรรทัดเก่า (FK คู่ CASCADE)
--   P7c  historical_so_write_children — วันวางบิล: งวดยกมาห้ามมี · งวดปกติต้องเป็น YYYY-MM-DD ปี 2000–2100 (เท่า CHECK
--        ของ 0389) · วันที่ไม่มีจริง (2026-02-30) = historical_so_installment_invalid ไม่ใช่ 22008 ดิบ · ตรวจก่อนลบของเดิม
--   P7a  historical_so_write_children — รายการคอลัมน์ INSERT งวด + "billingDate" ต่อจาก "paidOn"
--   P7b  historical_so_write_children — รายการค่า + วันวางบิล (งวดยกมา = NULL เสมอ) ตำแหน่งเดียวกัน
--   ตัวอนุมัติของใบย้อนหลัง (0374 + แถว 0382)
--   P3   approve_historical_sales_order — ขั้น ④ เลิกเขียน term เอง → PERFORM sales_order_open_service_terms(...)
--        แล้วอ่านใบใหม่ (ได้ตรา serviceTermsOpenedAt ในผลที่คืน) · ขั้น ①②③ ไม่แตะ
--   · ทุกบล็อกขึ้นต้นด้วยป้าย "-- 0394/Px ▶" และจบด้วย "-- 0394/Px ◀" (P7a/P7b ปะในบรรทัด ป้ายเดียว)
--   · anchor ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · overload ต้องมีตัวเดียว · มีป้ายแล้ว = ข้าม
--   · ⚠️ ไฟล์นี้ไม่มีคำว่า FUNCTION ตามด้วย public. + ชื่อ (แม้ในคอมเมนต์) — ยาม "นิยามล่าสุด" ของหลายเทสต์หาด้วยข้อความนั้น
--     ถ้าเจอที่นี่จะอ่านไฟล์นี้เป็นเจ้าของนิยามผิดตัว · CREATE OR REPLACE คงสิทธิ์/เจ้าของเดิม ⇒ ไม่มี REVOKE/GRANT
--
--  ── payload (สัญญากับ historicalServiceRpcArgs ฝั่ง JS) ─────────────────────────────────────────
--   p_lines[i]        + "packsPerRound": 1..9999 (ตัวเลข · บังคับทุกบรรทัดตอนบันทึก) · "serviceRounds": จำนวนเต็ม > 0 (บังคับ)
--   p_installments[i] + "billingDate": "YYYY-MM-DD" | null  (งวดปกติเท่านั้น · ไม่มี "รอเหตุการณ์" — งวดปกติของใบย้อนหลัง
--                        ต้องมีวันครบกำหนด (0374) และกติกา v4 ห้ามรอเหตุการณ์คู่กับวันครบกำหนด)
--
--  ── ด่านก่อนรัน ($pre$ — RAISE แล้วทั้งไฟล์ถอย) ───────────────────────────────────────────────
--   mig_0394_needs_0392          (ทุกรอบ) ยังไม่มีตาราง sales_order_line_zones / ตัวกลางของ 0392
--   mig_0394_historical_in_flight (รันครั้งแรกเท่านั้น = ยังไม่มีป้าย P3) มีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับ
--       ⇒ แถวของใบพวกนั้นไม่มีแพ็คต่อรอบ อนุมัติหลังรันจะติด sales_order_service_setup_incomplete · ให้อนุมัติ/ยกเลิกให้จบก่อน
--       (อ่าน prod 29/09: ใบย้อนหลัง 4 ใบ ยกเลิกทั้งหมด · term SZT-H = 0)
--
--  ── ผลต่อฝั่ง TS (DD7 — ไม่ต้องถามเจ้าของ) ─────────────────────────────────────────────────────
--   ใบย้อนหลังที่อนุมัติหลังไฟล์นี้: มีตรา serviceTermsOpenedAt · term หน่วย 'แพ็ค' · packageQty = แพ็คต่อรอบ
--   ⇒ "รอบที่ขาย" ของใบพวกนี้เดินกติกาเดียวกับใบ pipeline ที่มีตรา · prod ยังไม่มีใบย้อนหลังที่อนุมัติ ⇒ ของที่มีอยู่ไม่เปลี่ยน
--
--  ── ลำดับ deploy (DD16) ─────────────────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่อง/CI เขียวก่อนรัน (ไม่มีคอลัมน์ใหม่ ⇒ CI รันได้ครบ) · ฮาร์เนส PGlite ผ่านสองรอบ · เลข migration ยังว่าง
--   1) เจ้าของประกาศ freeze สั้น ๆ: ห้ามคีย์/แก้/ส่ง/อนุมัติใบสั่งขายย้อนหลัง
--   2) รันไฟล์นี้ที่ SQL Editor แล้วรัน SELECT ตรวจข้างล่าง
--   3) ต่อกันทันที: merge → deploy production    4) ยก freeze    5) เปิดจอตรวจ (อ่านอย่างเดียว)
--   ช่วงรันถึง deploy: JS รุ่นเดิมบันทึกใบย้อนหลังไม่ได้ (ไม่ส่ง packsPerRound ⇒ historical_so_line_packs_invalid) — ดัง
--   ไม่เงียบ ไม่มีข้อมูลเปลี่ยน · คีย์ intake เดิมที่ยิงซ้ำข้าม deploy ได้ intake_key_conflict (แฮชรวมคีย์ใหม่) = ตั้งใจ
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: hist_in_flight = 0 · p3 = 1 · p4 = 1 · p5_p7 = 1 · p8 = 1 · p9 = 1 · approve_definer = t · anon_approve = f · hist_terms_s = 0
--        (hist_terms_s โตหลังอนุมัติใบย้อนหลังใบแรก — ข้อมูลประกอบ ไม่ใช่เกณฑ์)
--
--   SELECT
--    (SELECT count(*) FROM public.sales_orders WHERE origin = 'historical'
--       AND status IN ('draft', 'pending_approval', 'rejected')) AS hist_in_flight,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--       AND p.proname = 'approve_historical_sales_order' AND strpos(p.prosrc, '0394/P3') > 0
--       AND strpos(p.prosrc, 'SZT-H') = 0) AS p3,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--       AND p.proname = 'historical_so_check_lines' AND strpos(p.prosrc, '0394/P4') > 0) AS p4,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--       AND p.proname = 'historical_so_write_children' AND strpos(p.prosrc, '0394/P5') > 0
--       AND strpos(p.prosrc, '0394/P6') > 0 AND strpos(p.prosrc, '0394/P7a') > 0
--       AND strpos(p.prosrc, '0394/P7b') > 0 AND strpos(p.prosrc, '0394/P7c') > 0) AS p5_p7,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--       AND p.proname = 'sales_order_open_service_terms' AND strpos(p.prosrc, '0394/P8') > 0) AS p8,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--       AND p.proname = 'sales_order_service_setup_errors' AND strpos(p.prosrc, '0394/P9a') > 0
--       AND strpos(p.prosrc, '0394/P9b') > 0 AND strpos(p.prosrc, '0394/P9c') > 0) AS p9,
--    (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--       AND p.proname = 'approve_historical_sales_order') AS approve_definer,
--    has_function_privilege('anon',
--      'public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)', 'EXECUTE') AS anon_approve,
--    (SELECT count(*) FROM public.service_zone_terms t JOIN public.sales_orders o ON o.id = t."salesOrderId"
--       WHERE o.origin = 'historical' AND t.id LIKE 'SZT-S%') AS hist_terms_s;
--
--  ── ถอยกลับ (ใช้ได้เฉพาะตอน hist_terms_s = 0 — ยังไม่มีใบย้อนหลังที่อนุมัติผ่านตัวกลาง) ────────────────────
--   บล็อกข้างล่างคืนเนื้อทั้งห้าตัวเป็นของก่อน 0394 ตรงตัว (ยกเว้นบรรทัดว่าง): บล็อกที่เติมถูกตัดทิ้ง · บล็อกที่แทนได้
--   ข้อความเดิมคืน · แต่ละรูปต้องเจอครั้งเดียวพอดีไม่งั้นหยุด · แถวโซนที่ตัวเขียนรุ่นนี้เขียนไว้ไม่ต้องลบ (ตัวเขียนรุ่นเดิม
--   ลบบรรทัดทิ้งทุกครั้งที่บันทึก ⇒ แถวโซนหายตาม) · ถอยโค้ด JS รอบนี้พร้อมกัน · ฮาร์เนส PGlite ลองบล็อกนี้แล้ว
--      DO $undo$
--      DECLARE r record; v_oid oid; v_def text; v_hits integer;
--      BEGIN
--        FOR r IN SELECT * FROM (VALUES
--          ('approve_historical_sales_order', $u$-- 0394/P3 ▶.*-- 0394/P3 ◀$u$, $o$INSERT INTO public.service_zone_terms (
--          id, "zoneId", "salesOrderId", "salesOrderLineId", "productId", "fgCode", description,
--          "packageQty", unit, "createdById", "createdByName", "createdAt", "updatedAt"
--        )
--        SELECT
--          'SZT-H' || substr(md5(l.id || ':' || l."serviceZoneId"), 1, 20), l."serviceZoneId", l."salesOrderId", l.id,
--          l."productId", l."fgCode", l.description,
--          l.qty, l.unit, p_actor_id, p_actor_name, now(), now()
--        FROM public.sales_order_lines l
--        WHERE l."salesOrderId" = v_order.id
--        ORDER BY l."sortOrder";$o$),
--          ('historical_so_write_children', $u$\n[^\n]*-- 0394/P7b[^\n]*$u$, ''),
--          ('historical_so_write_children', $u$"billingDate" /\* 0394/P7a \*/, $u$, ''),
--          ('historical_so_write_children', $u$\n[ \t]*-- 0394/P7c ▶.*-- 0394/P7c ◀$u$, ''),
--          ('historical_so_write_children', $u$\n[ \t]*-- 0394/P6 ▶.*-- 0394/P6 ◀$u$, ''),
--          ('historical_so_write_children', $u$\n[ \t]*-- 0394/P5 ▶.*-- 0394/P5 ◀$u$, ''),
--          ('historical_so_check_lines', $u$\n[ \t]*-- 0394/P4 ▶.*-- 0394/P4 ◀$u$, ''),
--          ('sales_order_service_setup_errors', $u$\n[ \t]*-- 0394/P9c ▶.*-- 0394/P9c ◀$u$, ''),
--          ('sales_order_service_setup_errors', $u$-- 0394/P9b ▶.*-- 0394/P9b ◀$u$, $o$IF v_has_package AND (v_order."servicePeriodFrom" IS NULL OR v_order."servicePeriodTo" IS NULL) THEN$o$),
--          ('sales_order_service_setup_errors', $u$-- 0394/P9a ▶.*-- 0394/P9a ◀$u$, $o$IF NOT (v_order.origin = 'pipeline')
--           OR public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE' THEN
--          RETURN '{}';
--        END IF;$o$),
--          ('sales_order_open_service_terms', $u$-- 0394/P8 ▶.*-- 0394/P8 ◀$u$, $o$-- ใบย้อนหลังมีเส้นเปิดรอบของตัวเอง (0374) · ใบที่ไม่ใช่สายบริการ = ไม่มีอะไรให้ TS · ไม่ตีตรา
--        IF NOT (v_order.origin = 'pipeline') THEN RETURN 0; END IF;
--        IF public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE' THEN RETURN 0; END IF;$o$)
--        ) AS t(fn, pattern, original)
--        LOOP
--          SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--           WHERE n.nspname = 'public' AND p.proname = r.fn;
--          v_def := pg_get_functiondef(v_oid);
--          SELECT count(*) INTO v_hits FROM regexp_matches(v_def, r.pattern, 'g');
--          IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0394 % hits=% (%)', r.fn, v_hits, left(r.pattern, 30); END IF;
--          EXECUTE regexp_replace(v_def, r.pattern, r.original);
--        END LOOP;
--      END $undo$;
--   (คัดทั้งบล็อกแล้วลอก "--" + ช่องว่าง 6 ตัวต้นบรรทัดออก · หลังถอย: SELECT ตรวจข้างบนได้ p3 = p4 = p5_p7 = p8 = p9 = 0)
--
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — แถวที่มีป้ายแล้วถูกข้าม ("ปะไว้แล้ว") · ด่านใบย้อนหลังค้างเช็คเฉพาะรันแรก · ตรวจท้ายรันทุกรอบ
--  ไม่มีคอลัมน์ใหม่ — check:columns ไม่แดง (ไม่มีตารางใหม่ · ใช้ sales_order_line_zones / "billingDate" ที่ 0392/0389 มีแล้ว)
--  ⛔ ไม่แตะ: RPC สร้าง/แก้/ส่งใบย้อนหลัง (เรียกตัวตรวจ/ตัวเขียนที่ปะแล้วเอง) · ตัวตรวจงวด · trigger ทุกตัว · CHECK ·
--     ตัวคำนวณ Actual (ตราเขียนแค่ serviceTermsOpenedAt — ไม่อยู่ในรายการเหตุการณ์ของ trigger Actual) · ไม่ backfill
--  🧪 พิสูจน์บนฮาร์เนส PGlite นอก repo (H1–H21 ของแผน §5.6) สองรอบ ผลเท่ากัน — รันไฟล์นี้สองรอบหลัง 0392 · รอบสามบนฐาน
--     ที่มีข้อมูล · บล็อกถอยกลับข้างบนลองจริง · ทั้งเส้นในนาม service_role · ใบ pipeline (เคส 5–9 · 22–23 ของ 0392) ผลเดิม
-- ============================================================

BEGIN;

-- ── ด่านก่อนรัน ─────────────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_n integer;
BEGIN
  -- 0392 ต้องรันแล้ว (ตารางโซนของบรรทัด + ตัวกลางเปิดรอบขาย + ตัวตรวจรายการที่ยังขาด)
  IF to_regclass('public.sales_order_line_zones') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'sales_order_open_service_terms')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'sales_order_service_setup_errors') THEN
    RAISE EXCEPTION 'mig_0394_needs_0392 — รัน 0392 ก่อน';
  END IF;

  -- รันครั้งแรก (ยังไม่มีป้าย P3): ห้ามมีใบย้อนหลังที่ยังไม่อนุมัติ — แถวของมันไม่มีแพ็คต่อรอบ อนุมัติหลังรันจะล้ม
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'approve_historical_sales_order'
       AND strpos(p.prosrc, '0394/P3') > 0
  ) THEN
    SELECT count(*) INTO v_n
      FROM public.sales_orders o
     WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected');
    IF v_n > 0 THEN
      RAISE EXCEPTION 'mig_0394_historical_in_flight — ใบย้อนหลังที่ยังไม่อนุมัติ % ใบ · อนุมัติ/ยกเลิกให้จบก่อนรัน', v_n;
    END IF;
  END IF;
END
$pre$;

-- ── ปะฟังก์ชันที่รันอยู่จริง (ตัวกลางก่อน → ตัวตรวจ → ตัวเขียน → ตัวอนุมัติ) ────────────────────────────
-- ⚠️ ชื่อฟังก์ชันเขียนเป็นสตริงใน VALUES เท่านั้น (ดูหัวไฟล์) · anchor เป็น regex (ARE) ครั้งเดียวพอดีทั้งสองที่
-- ⚠️ แถวของฟังก์ชันเดียวกันอ่านนิยามใหม่ทุกแถว (แถวก่อนหน้า EXECUTE ไปแล้วในทรานแซกชันเดียวกัน)
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
      ('sales_order_open_service_terms',
        $re$-- ใบย้อนหลังมีเส้นเปิดรอบของตัวเอง \(0374\)[^\n]*\n\s*IF NOT \(v_order\.origin = 'pipeline'\) THEN RETURN 0; END IF;\s*IF public\.sales_order_business_line\(v_order\.id\) IS DISTINCT FROM 'SERVICE' THEN RETURN 0; END IF;$re$,
        $rp$-- 0394/P8 ▶ ใบย้อนหลังเปิดรอบขายผ่านตัวนี้ด้วย (1 บรรทัด = 1 โซน · แพ็คต่อรอบจาก sales_order_line_zones) — ไม่ถามสายธุรกิจ
  IF NOT (v_order.origin = 'pipeline' OR v_order.origin = 'historical') THEN RETURN 0; END IF;
  IF v_order.origin = 'pipeline'
     AND public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE' THEN RETURN 0; END IF;
  -- 0394/P8 ◀$rp$,
        '0394/P8'),
      ('sales_order_service_setup_errors',
        $re$IF NOT \(v_order\.origin = 'pipeline'\)\s*OR public\.sales_order_business_line\(v_order\.id\) IS DISTINCT FROM 'SERVICE' THEN\s*RETURN '\{\}';\s*END IF;$re$,
        $rp$-- 0394/P9a ▶ ใบย้อนหลังถูกตรวจด้วย — ไม่ถามสายธุรกิจ (ทุกบรรทัดเป็นแพ็คเกจ 02-001 ผูกโซน)
  IF NOT (v_order.origin = 'pipeline' OR v_order.origin = 'historical')
     OR (v_order.origin = 'pipeline'
         AND public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE') THEN
    RETURN '{}';
  END IF;
  -- 0394/P9a ◀$rp$,
        '0394/P9a'),
      ('sales_order_service_setup_errors',
        $re$IF v_has_package AND \(v_order\."servicePeriodFrom" IS NULL OR v_order\."servicePeriodTo" IS NULL\) THEN$re$,
        $rp$-- 0394/P9b ▶ ช่วงบริการของใบย้อนหลังอยู่ที่เอกสารแทนสัญญา ไม่ใช่หัวใบ ⇒ ถามเฉพาะใบ pipeline
  IF v_order.origin = 'pipeline' AND v_has_package AND (v_order."servicePeriodFrom" IS NULL OR v_order."servicePeriodTo" IS NULL) THEN  -- 0394/P9b ◀$rp$,
        '0394/P9b'),
      ('sales_order_service_setup_errors',
        $re$(v_errors := v_errors \|\| \('zones_missing:' \|\| v_line\.id\);\s*END IF;)$re$,
        $rp$\1
    -- 0394/P9c ▶ ใบย้อนหลัง 1 บรรทัด = 1 โซน: แถวโซนของบรรทัดต้องมีแถวเดียว และเป็นโซนเดียวกับ serviceZoneId ของบรรทัด
    IF v_order.origin = 'historical'
       AND EXISTS (SELECT 1 FROM public.sales_order_line_zones a WHERE a."salesOrderLineId" = v_line.id)
       AND ((SELECT count(*) FROM public.sales_order_line_zones a WHERE a."salesOrderLineId" = v_line.id) <> 1
            OR NOT EXISTS (
              SELECT 1
                FROM public.sales_order_line_zones a
                JOIN public.sales_order_lines sol ON sol.id = a."salesOrderLineId"
               WHERE a."salesOrderLineId" = v_line.id
                 AND a."zoneId" IS NOT DISTINCT FROM sol."serviceZoneId")) THEN
      v_errors := v_errors || ('historical_zone_mismatch:' || v_line.id);
    END IF;
    -- 0394/P9c ◀$rp$,
        '0394/P9c'),
      ('historical_so_check_lines',
        $re$(-- ส่วนลดรายการ — [^\n]*\n\s*IF \(v_dtype IS NOT NULL AND v_dtype NOT IN \('percent', 'amount'\)\))$re$,
        $rp$-- 0394/P4 ▶ รอบบริการบังคับ · แพ็คต่อรอบ: มีคีย์ = ตัวเลขจำนวนเต็ม 1–9999 · ไม่มีคีย์ = ผ่าน
    --   (ขั้นส่ง/อนุมัติประกอบแถวที่เก็บแล้วซึ่งไม่พกคีย์นี้ — ตัวกลางตรวจแถวโซนแทนตอนอนุมัติ)
    IF v_rounds IS NULL THEN RAISE EXCEPTION 'historical_so_line_rounds_required'; END IF;
    IF v_item ? 'packsPerRound' AND (
         CASE WHEN jsonb_typeof(v_item->'packsPerRound') = 'number'
              THEN (v_item->>'packsPerRound')::numeric NOT BETWEEN 1 AND 9999
                   OR (v_item->>'packsPerRound')::numeric <> trunc((v_item->>'packsPerRound')::numeric)
              ELSE true END) THEN
      RAISE EXCEPTION 'historical_so_line_packs_invalid';
    END IF;
    -- 0394/P4 ◀
    \1$rp$,
        '0394/P4'),
      ('historical_so_write_children',
        $re$(DELETE FROM public\.sales_order_installments WHERE "salesOrderId" = p_order_id;)$re$,
        $rp$-- 0394/P5 ▶ ทุกบรรทัดต้องพกแพ็คต่อรอบเป็นตัวเลขจำนวนเต็ม 1–9999 — ฟอร์มรุ่นก่อนไม่พก = ตีกลับก่อนลบของเดิม
  IF EXISTS (
    SELECT 1
      FROM (SELECT CASE WHEN jsonb_typeof(e.l->'packsPerRound') = 'number'
                        THEN (e.l->>'packsPerRound')::numeric END AS v
              FROM jsonb_array_elements(p_lines) AS e(l)) x
     WHERE x.v IS NULL OR x.v <> trunc(x.v) OR x.v < 1 OR x.v > 9999
  ) THEN
    RAISE EXCEPTION 'historical_so_line_packs_invalid';
  END IF;
  -- 0394/P5 ◀
  \1$rp$,
        '0394/P5'),
      ('historical_so_write_children',
        $re$(IF v_inserted <> jsonb_array_length\(p_lines\) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;)$re$,
        $rp$\1
  -- 0394/P6 ▶ แถวโซนของงานบริการ 1 แถวต่อบรรทัด (โซน = serviceZoneId ของบรรทัด · แพ็คต่อรอบจาก payload)
  --   แถวเก่าหายไปกับบรรทัดเก่าแล้ว (FK คู่ CASCADE) · ตัวล็อกของ 0392 ยอมเพราะใบยังเป็นร่าง/ตีกลับ
  INSERT INTO public.sales_order_line_zones (
    id, "salesOrderId", "salesOrderLineId", "zoneId", "packsPerRound", "sortOrder",
    "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT 'SLZ-' || md5(sol.id || ':' || sol."serviceZoneId"), p_order_id, sol.id, sol."serviceZoneId",
         (e.l->>'packsPerRound')::numeric::integer, 0,
         p_actor_id, NULLIF(btrim(COALESCE(p_actor_name, '')), ''), now(), now()
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS e(l, ord)
    JOIN public.sales_order_lines sol
      ON sol.id = 'SOL-' || md5(p_order_id || ':' || e.ord) AND sol."salesOrderId" = p_order_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;
  -- 0394/P6 ◀$rp$,
        '0394/P6'),
      ('historical_so_write_children',
        $re$(DELETE FROM public\.sales_order_installments WHERE "salesOrderId" = p_order_id;)$re$,
        $rp$-- 0394/P7c ▶ วันวางบิลของงวด: งวดยกมาห้ามมี (CHECK ของ 0389) · งวดปกติเป็นวันที่ YYYY-MM-DD ปี 2000–2100
  --   วันที่ไม่มีจริง (เช่น 30 ก.พ.) แปลเป็นรหัสเดียวกัน ไม่ใช่ error ดิบ · ตีกลับก่อนลบของเดิม
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_installments, '[]'::jsonb)) AS e(i)
     WHERE NULLIF(btrim(COALESCE(e.i->>'billingDate', '')), '') IS NOT NULL
       AND (COALESCE(NULLIF(e.i->>'kind', ''), 'regular') = 'opening'
            OR (e.i->>'billingDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  ) THEN
    RAISE EXCEPTION 'historical_so_installment_invalid';
  END IF;
  BEGIN
    PERFORM 1
       FROM jsonb_array_elements(COALESCE(p_installments, '[]'::jsonb)) AS e(i)
      WHERE NULLIF(e.i->>'billingDate', '')::date NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31';
    IF FOUND THEN RAISE EXCEPTION 'historical_so_installment_invalid'; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'historical_so_installment_invalid';
  END;
  -- 0394/P7c ◀
  \1$rp$,
        '0394/P7c'),
      ('historical_so_write_children',
        $re$"paidOn", note, status, evidence, "frozenAt"$re$,
        $rp$"paidOn", "billingDate" /* 0394/P7a */, note, status, evidence, "frozenAt"$rp$,
        '0394/P7a'),
      ('historical_so_write_children',
        $re$(CASE WHEN x\.kind = 'opening' THEN NULLIF\(x\.i->>'paidOn', ''\)::date END,)$re$,
        $rp$\1
    CASE WHEN x.kind = 'opening' THEN NULL ELSE NULLIF(x.i->>'billingDate', '')::date END,  -- 0394/P7b วันวางบิล (งวดยกมาไม่มีเสมอ)$rp$,
        '0394/P7b'),
      ('approve_historical_sales_order',
        $re$INSERT INTO public\.service_zone_terms \([^;]*ORDER BY l\."sortOrder";$re$,
        $rp$-- 0394/P3 ▶ รอบขายของโซนเปิดผ่านตัวกลางตัวเดียวกับใบ pipeline: term = แพ็คต่อรอบของโซน (ไม่ใช่จำนวนบรรทัด)
  --   หน่วย 'แพ็ค' · ใบได้ตรา serviceTermsOpenedAt · ไม่ครบ (ไม่มีแถวโซน · ไม่มีแพ็คต่อรอบ · โซนไม่ตรงบรรทัด)
  --   = RAISE sales_order_service_setup_incomplete ⇒ การอนุมัติทั้งก้อนถอย (สัญญา · สถานะ · งวด)
  PERFORM public.sales_order_open_service_terms(v_order.id, p_actor_id, p_actor_name);
  SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order.id;
  -- 0394/P3 ◀$rp$,
        '0394/P3')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0394_patch_overload % count=%', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0394: % % — ปะไว้แล้ว', r.marker, r.fn;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0394_patch_anchor % % hits=%/%', r.marker, r.fn, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0394: % % — ปะแล้ว', r.marker, r.fn;
  END LOOP;
END
$patch$;

-- ── ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────────────
DO $verify$
DECLARE
  r record;
  v_src text;
  v_n integer;
  v_fn text;
BEGIN
  -- ป้ายละครั้งพอดี (บล็อก = ▶ หนึ่ง ◀ หนึ่ง · P7a/P7b ป้ายเดียว — นับทั้งตัวอักษรท้าย ไม่นับ 0394/P7 เฉย ๆ)
  FOR r IN
    SELECT * FROM (VALUES
      ('sales_order_open_service_terms', '0394/P8 ▶'), ('sales_order_open_service_terms', '0394/P8 ◀'),
      ('sales_order_service_setup_errors', '0394/P9a ▶'), ('sales_order_service_setup_errors', '0394/P9a ◀'),
      ('sales_order_service_setup_errors', '0394/P9b ▶'), ('sales_order_service_setup_errors', '0394/P9b ◀'),
      ('sales_order_service_setup_errors', '0394/P9c ▶'), ('sales_order_service_setup_errors', '0394/P9c ◀'),
      ('historical_so_check_lines', '0394/P4 ▶'), ('historical_so_check_lines', '0394/P4 ◀'),
      ('historical_so_write_children', '0394/P5 ▶'), ('historical_so_write_children', '0394/P5 ◀'),
      ('historical_so_write_children', '0394/P6 ▶'), ('historical_so_write_children', '0394/P6 ◀'),
      ('historical_so_write_children', '0394/P7c ▶'), ('historical_so_write_children', '0394/P7c ◀'),
      ('historical_so_write_children', '0394/P7a'), ('historical_so_write_children', '0394/P7b'),
      ('approve_historical_sales_order', '0394/P3 ▶'), ('approve_historical_sales_order', '0394/P3 ◀')
    ) AS t(fn, needle)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    IF v_n IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'mig_0394_verify marker % in % = %', r.needle, r.fn, v_n;
    END IF;
  END LOOP;

  -- ตัวอนุมัติ: ไม่มี term แบบเดิม · ยัง SECURITY DEFINER · เรียกตัวกลางครั้งเดียว
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'approve_historical_sales_order'
     AND strpos(p.prosrc, 'SZT-H') = 0
     AND p.prosecdef
     AND (length(p.prosrc) - length(replace(p.prosrc, 'sales_order_open_service_terms(', '')))
         / length('sales_order_open_service_terms(') = 1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0394_verify approve=%', v_n; END IF;

  -- สิทธิ์คงเดิม: anon/authenticated ไม่มีทุกตัว · service_role เรียก RPC อนุมัติ + ตัวกลางสองตัวของ 0392 ได้
  -- แต่ตัวช่วยใบย้อนหลังสองตัวไม่ได้ (0374/0379 ถอนไว้ — ผู้เรียกคือ RPC แบบ SECURITY DEFINER)
  FOR r IN
    SELECT * FROM (VALUES
      ('public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)', true),
      ('public.historical_so_check_lines(jsonb,text)', false),
      ('public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)', false),
      ('public.sales_order_open_service_terms(text,text,text)', true),
      ('public.sales_order_service_setup_errors(text)', true)
    ) AS t(sig, service_role)
  LOOP
    v_fn := r.sig;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') IS DISTINCT FROM r.service_role THEN
      RAISE EXCEPTION 'mig_0394_verify grant %', v_fn;
    END IF;
  END LOOP;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
