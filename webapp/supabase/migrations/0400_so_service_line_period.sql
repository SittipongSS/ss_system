-- ============================================================
--  Migration 0400: SO บริการ — ช่วงบริการ "ทั้งใบช่วงเดียว | แยกรายรายการ" (สวิตช์ · มติเจ้าของ 01/10)
--                  (แผน mockups/so-service-lines/IMPL_PLAN_PERIOD.md §2 · ม็อก PeriodSwitchWhole / PeriodSwitchPerLine รอบสอง)
--
--  🐞 ของเดิม (0392): ใบสั่งขายสายบริการมีช่วงบริการ **ช่วงเดียวต่อใบ** (sales_orders."servicePeriodFrom"/"servicePeriodTo")
--     ของจริง: 3 ใบที่ใช้อยู่มีช่วงตามสัญญาไม่เท่ากันรายรายการ (SO-26090206-0 Jim Thompson 5 สาขา 4 ช่วง) ⇒ ฝ่ายขายต้องใส่
--     "สาขาแรกเริ่ม → สาขาสุดท้ายจบ" แล้วเขียนวันของแต่ละสาขาไว้ในหมายเหตุ · TS ตั้งรอบจากช่วงรวมซึ่งผิดทุกสาขายกเว้นสาขาเดียว
--  ⭐ ของใหม่: ใบมีโหมด "servicePeriodMode" — 'whole' (ค่าตั้งต้น · เหมือนเดิมทุกอย่าง) | 'line' (แยกรายรายการ)
--     · โหมด 'line': รายการแพ็คเกจแต่ละบรรทัดมีช่วงของตัวเอง (sales_order_lines."servicePeriodFrom"/"servicePeriodTo")
--       และช่วงของใบ **คิดจากรายการ** (เริ่มแรกสุด → จบสุดท้าย) โดย RPC บันทึก ⇒ ทุกตัวที่อ่านช่วงของใบ (ด่านช่วงครอบของงวด ·
--       สัญญา · หัวใบ · ตัวตัดสินเงิน · ต่อสัญญา) ทำงานต่อโดยไม่ต้องรู้โหมด
--     · 🔴 ช่วงของใบในโหมด 'line' มีค่า **เมื่อรายการแพ็คเกจทุกรายการมีช่วงแล้วเท่านั้น** — ยังไม่ครบ = ว่างทั้งคู่ (ไม่เก็บ "ช่วงรวมครึ่งเดียว")
--       ⇒ ตัวอ่านช่วงของใบทุกตัว (ด่านช่วงครอบ · ปุ่มแบ่งช่วงครอบ · การ์ดสัญญา · หัวใบ) เห็น "ยังไม่มีช่วง" ซึ่งเป็นสถานะที่มีอยู่แล้ว
--       ไม่มีตัวไหนคิดเงินจากช่วงรวมที่ยังขาดรายการ
--     · ฝั่ง TS อ่านช่วงของรายการผ่าน service_zone_terms."salesOrderLineId" → sales_order_lines (ไม่เขียน startDate/endDate ของ term —
--       สองช่องนั้นเป็นหน้าต่างของ termInWindow: ใส่แล้วรายการที่ยังไม่ถึงวันเริ่มจะหายจากคิว "รอตั้งรอบ")
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านก่อนรัน · จดลายนิ้วมือ (md5) ของ 11 ฟังก์ชันที่ไฟล์นี้ต้องไม่แตะ ไว้ในตัวแปรของทรานแซกชัน (set_config — ไม่มีตารางชั่วคราว)
--  §1 sales_orders + "servicePeriodMode" text NOT NULL DEFAULT 'whole' + CHECK sales_orders_service_period_mode_shape
--       ('whole' | 'line' · 'line' ได้เฉพาะใบ pipeline — ใบย้อนหลังช่วงเดียวเสมอ)
--  §2 sales_order_lines + "servicePeriodFrom" date · "servicePeriodTo" date + CHECK sales_order_lines_service_period_shape
--       (ว่างคู่ หรือครบคู่ เริ่ม ≤ จบ ปี 2000–2100 — กติกาเดียวกับ sales_orders_service_period_shape ของ 0392)
--  §3 เขียนทับทั้งตัว (CREATE OR REPLACE · ลายเซ็นเดิม) สามฟังก์ชันที่เกิดใน 0392 และไม่เคยถูกไฟล์ไหนปะ:
--       F1 save_sales_order_service_setup  — รับ "periodMode" + ช่วงรายรายการ · รักษาช่วงรวมของใบ (ดู payload ข้างล่าง)
--       F2 sales_order_copy_service_setup  — ออก Rev. ยกโหมด + ช่วงของรายการ ไปใบ Rev. ด้วย
--       F3 sales_order_service_setup_guard — ช่วงของรายการล็อกเหมือนชนิด/แพ็คเกจ (ไม่ใช่ "แก้รอบ" ที่แก้ได้หลังอนุมัติ)
--     · รันครั้งแรก: เนื้อที่รันอยู่ของสามตัวนี้ต้องเท่าเนื้อใน 0392 (md5 หลังตัดช่องว่าง) ไม่งั้นหยุด — กันทับแพตช์ที่ไฟล์นี้ไม่รู้จัก
--     · รันซ้ำ (มีป้าย 0400/Fx แล้ว): เนื้อที่รันอยู่ต้องเท่า **เนื้อของไฟล์นี้เอง** ไม่งั้นหยุด — กันทับแพตช์ของไฟล์ที่มาทีหลัง
--  §4 trigger สองตัวสร้างใหม่ให้ฟังคอลัมน์ใหม่: sales_order_lines_service_guard_trg (+ ช่วงของรายการ) ·
--       sales_orders_service_period_guard_trg (+ "servicePeriodMode")
--  §5 ปะฟังก์ชันที่รันอยู่จริงหนึ่งตัว (pg_get_functiondef แบบ 0392/0394 — ตัวนี้มีแพตช์ P9a/P9b/P9c ของ 0394 อยู่แล้ว):
--       L1 ตัวตรวจรายการที่ยังขาด — โหมด 'line': รายการแพ็คเกจที่ไม่มีช่วง = รหัสใหม่ line_period_missing:<บรรทัด>
--       L2 ตัวตรวจรายการที่ยังขาด — โหมด 'line': period_missing เงียบระหว่างที่ยังมี line_period_missing (ข้อรายรายการบอกแล้ว) ·
--          รายการครบแต่ช่วงของใบยังว่าง (ไม่ควรเกิด) = period_missing ตามเดิม ⇒ ใบที่มีแพ็คเกจอนุมัติไม่ได้ถ้าไม่มีช่วงของใบ ทั้งสองโหมด
--     · anchor ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · มีป้ายแล้ว = ข้าม
--  §6 สิทธิ์ (ลายเซ็นเดิม — ประกาศซ้ำแบบ 0336)   §7 ตรวจท้าย
--
--  ⛔ ไม่แตะ: ตัวอนุมัติ/ออก Rev./เปิดรอบขาย/ยื่น-อนุมัติ-ตีกลับงานบริการย้อนหลัง/ตัวตัดสินแก้ได้ไหม/เปิดแก้หลังอนุมัติ + ตัวตรวจ ·
--     ตัวตัดสินชนิดบรรทัด · สายธุรกิจ (ตรวจท้ายเทียบ md5 ทั้ง 11 ตัว) · ใบย้อนหลังทุกเส้น (โหมด 'whole' เสมอ — CHECK) ·
--     service_zone_terms (ไม่มีคอลัมน์ใหม่ · ไม่เขียนวัน) · ยอด/Actual/งวด/สถานะใบ
--  ⛔ ไม่ backfill — ใบที่มีอยู่ทุกใบได้ 'whole' จากค่าตั้งต้น (พฤติกรรมเดิม) · ช่วงของรายการว่างทุกแถว
--  🪤 ไฟล์นี้เขียนข้อความ FUNCTION ตามด้วย public. + ชื่อ ได้เฉพาะสามตัวของ §3 — ฟังก์ชันอื่นอ้างด้วยชื่อเปล่า / p.proname = '…'
--     (ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของนิยามด้วยข้อความนั้น)
--
--  ── payload ของ save_sales_order_service_setup (สัญญากับ validateServiceSetupPatch ฝั่ง JS) ──────────
--   { "periodMode": "whole" | "line",                                   -- ไม่มีคีย์ = ไม่เปลี่ยน
--     "period": {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | null,         -- เฉพาะโหมด 'whole' (ผลลัพธ์) · โหมด 'line' ส่งมา = ตีกลับ
--     "lines": [ { "lineId": "SOL-…", …คีย์เดิมของ 0392…,
--                  "period": {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | null } ] }   -- ช่วงของรายการ · null = ล้าง
--   · ช่วงของรายการ (ไม่ใช่ null) รับเฉพาะโหมด 'line' และรายการแพ็คเกจ · รายการที่ไม่ใช่แพ็คเกจ/โหมด 'whole' = ช่วงของรายการว่างเสมอ
--   · สลับ 'whole' → 'line': รายการแพ็คเกจที่ก้อนนี้ไม่ได้ส่งคีย์ "period" มา รับช่วงเดิมของใบเป็นค่าเริ่ม (ไม่มีอะไรหาย)
--   · โหมด 'line': ช่วงของใบ = เริ่มแรกสุด → จบสุดท้าย เมื่อรายการแพ็คเกจ **ทุกรายการ** มีช่วง · ยังไม่ครบ (หรือไม่มีแพ็คเกจ) = ว่างทั้งคู่
--   · สลับ 'line' → 'whole': ส่ง "period" มา = ใช้ค่านั้น · ไม่ส่ง = ช่วงรวมของรายการที่มีช่วงอยู่ก่อนล้าง (ไม่มีสักรายการ = ว่าง) ·
--     ช่วงของรายการถูกล้างทั้งใบ
--   · ผลที่คืนเพิ่มคีย์ "periodMode"
--
--  ── รหัสผิดพลาดใหม่ (สัญญากับ SERVICE_SETUP_SQL_MESSAGES / SERVICE_SETUP_ISSUE_TEXT ฝั่ง JS) ──────────────────
--   service_setup_period_mode_invalid (400)  "periodMode" ไม่ใช่ 'whole' / 'line'
--   service_setup_period_derived (409)       ส่ง "period" ของใบมาขณะโหมด (ผลลัพธ์) เป็น 'line'
--   service_setup_line_period_mode (400)     ส่งช่วงของรายการมาขณะโหมด (ผลลัพธ์) เป็น 'whole'
--   service_setup_line_period_invalid (400)  ช่วงของรายการไม่ครบสองวัน / เริ่มหลังจบ / นอกปี 2000–2100
--   (ช่วงของรายการบนรายการที่ไม่ใช่แพ็คเกจ = service_setup_not_package ตัวเดิม)
--   line_period_missing:<บรรทัด>             ข้อที่ยังขาดตอนยื่น/อนุมัติ (DETAIL ของ sales_order_service_setup_incomplete)
--
--  ── คอลัมน์ใหม่ (check:columns แดงเฉพาะชื่อเหล่านี้จนกว่าจะรัน — อย่างอื่นแดง = บั๊กจริง) ─────────────────────
--   sales_orders."servicePeriodMode" · sales_order_lines."servicePeriodFrom" / "servicePeriodTo"
--
--  ── ด่านก่อนรัน (§0 — RAISE แล้วทั้งไฟล์ถอย) ──────────────────────────────────────────────
--   mig_0400_needs_0396         ยังไม่มีของ 0392/0394/0396 (ตารางโซนของบรรทัด · 14 ฟังก์ชัน · ป้าย 0394/P9b ในตัวตรวจ)
--   mig_0400_live_body_differs  เนื้อที่รันอยู่ของ F1/F2/F3 ไม่ใช่เนื้อที่ไฟล์นี้รู้จัก — ต้องรวมมือก่อนเขียนทับ
--                               · รันครั้งแรก (ยังไม่มีป้าย 0400/Fx): ไม่เท่าเนื้อใน 0392 = มีคนแก้/ปะไว้
--                               · รันซ้ำ (มีป้าย 0400/Fx แล้ว): ไม่เท่าเนื้อของไฟล์นี้เอง = มีไฟล์หลัง 0400 ปะฟังก์ชันนั้นไว้
--                                 ⇒ ห้ามรันไฟล์นี้ซ้ำ (จะเขียนทับแพตช์นั้นกลับเป็นเนื้อของ 0400 เงียบ ๆ)
--
--  ── ตรวจก่อนรัน (อ่านอย่างเดียว · รันได้ทุกเมื่อ) — เนื้อที่รันอยู่ของ F1/F2/F3 ตรงกับ 0392 ไหม ─────────────────────
--   คาด: 3 แถว ok = t ทุกแถว (หลังรันไฟล์นี้แล้ว: patched = t และ own = t แทน) · มีแถวไหน ok = f และ patched = f = อย่ารัน แจ้งผู้พัฒนา
--        · patched = t แต่ own = f = มีไฟล์หลัง 0400 ปะฟังก์ชันนั้นไว้ ⇒ อย่ารันไฟล์นี้ซ้ำ
--        (ด่าน §0 จะหยุดเองด้วย mig_0400_live_body_differs อยู่แล้ว — SELECT นี้แค่ให้รู้ก่อนวันรัน)
--
--   SELECT p.proname,
--          md5(translate(p.prosrc, E' \t\n\r', '')) = x.body_md5 AS ok,
--          strpos(p.prosrc, x.marker) > 0 AS patched,
--          md5(translate(p.prosrc, E' \t\n\r', '')) = x.own_md5 AS own
--     FROM (VALUES ('save_sales_order_service_setup', '0400/F1', '43199fada9a9c661e000b3158950d6a7', '62c0e66f5f4497ace0fc5c7d5c2d54a8'),
--                  ('sales_order_copy_service_setup', '0400/F2', '4e1552575dab9c1637b5c43b54163b45', '8932a14a753735244e9e89466250817d'),
--                  ('sales_order_service_setup_guard', '0400/F3', '44723d914c75191f174fdcab139cb440', 'bbfa47fa67eb924580fe787af7eb690b'))
--          AS x(fn, marker, body_md5, own_md5)
--     JOIN pg_proc p ON p.proname = x.fn
--     JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--    ORDER BY 1;
--
--  ── ลำดับ deploy ────────────────────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่องเขียว (test · TZ=UTC test · build · gates) · ฮาร์เนส PGlite harness-0400 ผ่านสองรอบผลเหมือนกัน · rebase บน main ล่าสุด
--   1) ตรวจเลข migration อีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0400 (0399 มีงานอื่นจองแล้ว ห้ามใช้)
--   2) เจ้าของรันไฟล์นี้ที่ SQL Editor **ก่อน** merge/deploy แล้วรัน SELECT ตรวจข้างล่าง
--      (โค้ดรุ่นที่รันอยู่ใช้ต่อได้: ไม่ส่ง "periodMode" = โหมดไม่เปลี่ยน · ทุกใบเป็น 'whole' ⇒ ไม่ต้อง freeze)
--      ⚠️ ห้าม deploy ก่อนรัน — โค้ดรุ่นใหม่ select คอลัมน์ใหม่ทุกครั้งที่เปิดใบสายบริการ/งานเข้าใหม่ของ TS = 500
--   3) CI rerun (check:columns เขียวแล้ว) → merge → Deploy to production → curl /api/version ตรง sha
--   4) UAT อ่านอย่างเดียวก่อน · การสลับโหมด/บันทึกจริงบน prod ต้องได้คำยืนยันจากเจ้าของทีละใบ (dev DB = prod DB)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: mode_col = 1 · line_cols = 2 · checks = 2 · line_mode = 0 · line_periods = 0 · f1 = 1 · f2 = 1 · f3 = 1 · l1 = 1 · l2 = 1
--        · trg_lines = t · trg_order = t · anon_save = f
--        (line_mode / line_periods โตหลังฝ่ายขายสลับใบแรกเป็น "แยกรายรายการ" — ข้อมูลประกอบ ไม่ใช่เกณฑ์)
--
--   SELECT
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders'
--      AND column_name = 'servicePeriodMode') AS mode_col,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_order_lines'
--      AND column_name IN ('servicePeriodFrom', 'servicePeriodTo')) AS line_cols,
--    (SELECT count(*) FROM pg_constraint WHERE conname IN ('sales_orders_service_period_mode_shape',
--      'sales_order_lines_service_period_shape')) AS checks,
--    (SELECT count(*) FROM public.sales_orders WHERE "servicePeriodMode" = 'line') AS line_mode,
--    (SELECT count(*) FROM public.sales_order_lines WHERE "servicePeriodFrom" IS NOT NULL) AS line_periods,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'save_sales_order_service_setup' AND strpos(p.prosrc, '0400/F1') > 0) AS f1,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_copy_service_setup' AND strpos(p.prosrc, '0400/F2') > 0) AS f2,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_service_setup_guard' AND strpos(p.prosrc, '0400/F3') > 0) AS f3,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_service_setup_errors' AND strpos(p.prosrc, '0400/L1 ▶') > 0) AS l1,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_service_setup_errors' AND strpos(p.prosrc, '0400/L2') > 0) AS l2,
--    (SELECT strpos(pg_get_triggerdef(t.oid), '"servicePeriodFrom"') > 0 FROM pg_trigger t
--      WHERE t.tgname = 'sales_order_lines_service_guard_trg' AND NOT t.tgisinternal) AS trg_lines,
--    (SELECT strpos(pg_get_triggerdef(t.oid), '"servicePeriodMode"') > 0 FROM pg_trigger t
--      WHERE t.tgname = 'sales_orders_service_period_guard_trg' AND NOT t.tgisinternal) AS trg_order,
--    has_function_privilege('anon', 'public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)', 'EXECUTE') AS anon_save;
--
--  ── ถอยกลับ (ใช้ได้เฉพาะตอน line_mode = 0 และ line_periods = 0 — ยังไม่มีใบไหนใช้โหมดแยกรายรายการ) ────────────────
--   ถอยโค้ดก่อนเสมอ (โค้ดรุ่นใหม่ select คอลัมน์ใหม่ — ลบคอลัมน์ใต้โค้ดที่รันอยู่ = 500) แล้วค่อยทำตามลำดับ:
--   1) ถอดแพตช์ L1/L2 ออกจากตัวตรวจ (ต้องทำ **ก่อน** บล็อกถอยกลับของ 0394 ถ้าจะถอย 0394 ด้วย — L2 อยู่ในช่วงป้าย P9b):
--      DO $undo$
--      DECLARE r record; v_oid oid; v_def text; v_hits integer;
--      BEGIN
--        FOR r IN SELECT * FROM (VALUES
--          ($u$\n[ \t]*-- 0400/L1 ▶.*-- 0400/L1 ◀$u$),
--          ($u$ AND \(v_order\."servicePeriodMode" IS DISTINCT FROM 'line' OR position\('line_period_missing:' in array_to_string\(v_errors, ','\)\) = 0\) /\* 0400/L2 \*/$u$)
--        ) AS t(pattern)
--        LOOP
--          SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--           WHERE n.nspname = 'public' AND p.proname = 'sales_order_service_setup_errors';
--          v_def := pg_get_functiondef(v_oid);
--          SELECT count(*) INTO v_hits FROM regexp_matches(v_def, r.pattern, 'g');
--          IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0400 hits=% (%)', v_hits, left(r.pattern, 30); END IF;
--          EXECUTE regexp_replace(v_def, r.pattern, '');
--        END LOOP;
--      END $undo$;
--   2) คืนเนื้อของ F1/F2/F3 และ trigger สองตัว: รันสามบล็อก CREATE OR REPLACE ของฟังก์ชันชื่อเดียวกัน + สองคู่
--      DROP TRIGGER / CREATE TRIGGER (sales_order_lines_service_guard_trg · sales_orders_service_period_guard_trg)
--      จากไฟล์ 0392_so_service_setup.sql §6 · §8 · §10 ตามตัวอักษร (ลายเซ็นไม่เปลี่ยน ⇒ สิทธิ์คงเดิม)
--   3) ALTER TABLE public.sales_order_lines DROP CONSTRAINT sales_order_lines_service_period_shape,
--        DROP COLUMN "servicePeriodFrom", DROP COLUMN "servicePeriodTo";
--      ALTER TABLE public.sales_orders DROP CONSTRAINT sales_orders_service_period_mode_shape, DROP COLUMN "servicePeriodMode";
--      NOTIFY pgrst, 'reload schema';
--   ถ้ามีใบโหมด 'line' แล้ว: ใบที่รายการครบมีช่วงรวมอยู่ที่หัวใบ ⇒ ถอยได้โดยเสียแค่ช่วงรายรายการ (จดจาก SELECT ก่อนลบคอลัมน์) ·
--     ใบที่ยังใส่ช่วงไม่ครบ หัวใบว่าง ⇒ ฝ่ายขายต้องใส่ช่วงของใบใหม่หลังถอย
--   ⛔ ห้ามรัน 0392 ซ้ำหลังไฟล์นี้ (0392 เขียนทับ F1/F2/F3 + ตัวตรวจกลับเป็นของเดิม — ด่านก่อนรันของไฟล์นี้จะไม่รู้) ·
--     ถ้าจำเป็นต้องรัน 0392/0394 ซ้ำ ให้รันไฟล์นี้ซ้ำปิดท้ายเสมอ (ป้าย 0400/Fx หาย ⇒ ไฟล์นี้เขียนทับใหม่ให้ครบ)
--   ⛔ ห้ามรันไฟล์นี้ซ้ำหลังมี migration ที่ใหม่กว่ามาปะ save / copy / guard (ไฟล์นี้เขียนทับสามตัวนั้นทั้งตัว — แพตช์ของไฟล์หลังจะหาย)
--     · ด่าน §0 กันให้: มีป้าย 0400/Fx แล้วแต่เนื้อไม่เท่าของไฟล์นี้ = หยุดด้วย mig_0400_live_body_differs ไม่มีอะไรถูกเขียน
--     · ไฟล์หลังที่ปะสามตัวนี้ต้องประกาศในหัวไฟล์ของตัวเองว่า "ห้ามรัน 0400 ซ้ำ" และลำดับรันซ้ำคือ 0400 → ไฟล์นั้น
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE ·
--     แถวปะที่มีป้ายแล้วถูกข้าม ("ปะไว้แล้ว") · F1/F2/F3 ที่มีป้าย 0400/Fx แล้ว: เนื้อต้องเท่าของไฟล์นี้เอง (md5) จึงเขียนทับซ้ำ
--     (ผลเท่าเดิม) — ไม่เท่า = หยุดทั้งไฟล์ (ดู ⛔ ข้างบน)
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0400 (นอก repo · mockups/so-service-lines/pglite-harness) — โหลด 0389/0390 · 0392–0396
--     จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + รอบสามบนฐานที่มีข้อมูล · ทั้งเส้นในนาม service_role · บล็อกถอยกลับข้างบนลองจริงแล้ว
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน + ลายนิ้วมือของที่ต้องไม่แตะ ────────────────────────────────────────────
DO $pre$
DECLARE
  r record;
  v_n integer;
  v_src text;
  v_h text;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = ANY (ARRAY[
       'approve_sales_order_with_signature_evidence_atomic', 'revise_approved_sales_order_atomic',
       'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
       'reject_sales_order_service_setup', 'save_sales_order_service_setup', 'sales_order_service_setup_editable',
       'sales_order_service_setup_errors', 'sales_order_service_setup_guard', 'sales_order_copy_service_setup',
       'sales_order_line_service_role', 'reopen_sales_order_service_setup', 'sales_order_service_reopen_blockers']);
  IF v_n <> 14
     OR to_regclass('public.sales_order_line_zones') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sales_order_service_setup_errors'
          AND strpos(p.prosrc, '0394/P9b') > 0) THEN
    RAISE EXCEPTION 'mig_0400_needs_0396 — รัน 0392 · 0394 · 0396 ก่อน (เจอ % จาก 14 ฟังก์ชัน)', v_n;
  END IF;

  -- F1/F2/F3 เขียนทับทั้งตัว ⇒ เนื้อที่รันอยู่ต้องเป็นเนื้อที่ไฟล์นี้รู้จัก (md5 หลังตัดช่องว่าง/ขึ้นบรรทัด):
  --   · รอบแรก (ยังไม่มีป้าย 0400/Fx) = เนื้อใน 0392 (body_md5)
  --   · รอบซ้ำ (มีป้ายแล้ว) = เนื้อของไฟล์นี้เอง (own_md5) — ไฟล์หลัง 0400 ที่ปะฟังก์ชันนี้ไว้ทำให้ไม่เท่า ⇒ หยุด ไม่ทับแพตช์นั้น
  FOR r IN
    SELECT * FROM (VALUES
      ('save_sales_order_service_setup', '0400/F1', '43199fada9a9c661e000b3158950d6a7', '62c0e66f5f4497ace0fc5c7d5c2d54a8'),
      ('sales_order_copy_service_setup', '0400/F2', '4e1552575dab9c1637b5c43b54163b45', '8932a14a753735244e9e89466250817d'),
      ('sales_order_service_setup_guard', '0400/F3', '44723d914c75191f174fdcab139cb440', 'bbfa47fa67eb924580fe787af7eb690b')
    ) AS t(fn, marker, body_md5, own_md5)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_h := md5(translate(v_src, E' \t\n\r', ''));
    IF strpos(v_src, r.marker) > 0 THEN
      IF v_h <> r.own_md5 THEN
        RAISE EXCEPTION 'mig_0400_live_body_differs % md5=% — มีป้าย % แล้วแต่เนื้อไม่เท่าของ 0400 (มีไฟล์หลัง 0400 ปะไว้) ห้ามรันซ้ำ จะทับแพตช์นั้น', r.fn, v_h, r.marker;
      END IF;
      CONTINUE;
    END IF;
    IF v_h <> r.body_md5 THEN
      RAISE EXCEPTION 'mig_0400_live_body_differs % md5=% — เนื้อที่รันอยู่ไม่เท่า 0392 ต้องรวมมือก่อนเขียนทับ', r.fn, v_h;
    END IF;
  END LOOP;

  -- ลายนิ้วมือของ 11 ฟังก์ชันที่ไฟล์นี้ต้องไม่แตะ — เก็บในตัวแปรของทรานแซกชัน (ตายตอน COMMIT/ROLLBACK) · §7 เทียบ
  PERFORM set_config('mig_0400.untouched', (
    SELECT jsonb_object_agg(p.proname, md5(p.prosrc))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY[
         'approve_sales_order_with_signature_evidence_atomic', 'revise_approved_sales_order_atomic',
         'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
         'reject_sales_order_service_setup', 'sales_order_service_setup_editable', 'sales_order_line_service_role',
         'sales_order_business_line', 'reopen_sales_order_service_setup', 'sales_order_service_reopen_blockers'])
  ), true);
END
$pre$;

-- ── §1 sales_orders: โหมดของช่วงบริการ ─────────────────────────────────────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวชั้นนอก — serviceRoundsCopyPaths.test.mjs เก็บคอลัมน์จากรูปประโยคนี้
--    แล้วบังคับให้ถูกตัดสินว่าทาง Rev./ใบร่างพาไปหรือไม่ (Rev. = ยกโดย F2 · ใบใหม่ = ค่าตั้งต้น 'whole')
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "servicePeriodMode" text NOT NULL DEFAULT 'whole';

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_period_mode_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_service_period_mode_shape CHECK (
    "servicePeriodMode" IN ('whole', 'line')
    AND ("servicePeriodMode" = 'whole' OR origin = 'pipeline')
  );

COMMENT ON COLUMN public.sales_orders."servicePeriodMode" IS
  'โหมดของช่วงบริการ: whole = ทั้งใบช่วงเดียว (servicePeriodFrom/To กรอกเอง) · line = แยกรายรายการ (ช่วงอยู่ที่ sales_order_lines · servicePeriodFrom/To ของใบ = ช่วงรวม เริ่มแรกสุด → จบสุดท้าย คิดโดย save_sales_order_service_setup เมื่อรายการแพ็คเกจทุกรายการมีช่วง · ยังไม่ครบ = ว่าง) — ใบย้อนหลังเป็น whole เสมอ (0400)';
COMMENT ON COLUMN public.sales_orders."servicePeriodFrom" IS
  'วันเริ่มช่วงบริการของใบ — โหมด whole: ฝ่ายขายกรอก · โหมด line: วันเริ่มแรกสุดของรายการแพ็คเกจ (คิดโดย RPC บันทึก · ว่างจนกว่ารายการแพ็คเกจทุกรายการจะมีช่วง) · บังคับตอนยื่นเมื่อมีรายการแพ็คเกจ · ก๊อปไปใบ Rev. โดย sales_order_copy_service_setup (0392 · 0400)';
COMMENT ON COLUMN public.sales_orders."servicePeriodTo" IS
  'วันสิ้นสุดช่วงบริการของใบ (รวมวันนี้) — คู่กับ servicePeriodFrom เสมอ · โหมด line: วันจบสุดท้ายของรายการแพ็คเกจ (0392 · 0400)';

-- ── §2 sales_order_lines: ช่วงบริการของรายการ (โหมด 'line' เท่านั้น) ─────────────────────────────
ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS "servicePeriodFrom" date,
  ADD COLUMN IF NOT EXISTS "servicePeriodTo" date;

ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_service_period_shape;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_service_period_shape CHECK (
    (("servicePeriodFrom" IS NULL) = ("servicePeriodTo" IS NULL))
    AND (
      "servicePeriodFrom" IS NULL
      OR ("servicePeriodFrom" <= "servicePeriodTo"
          AND "servicePeriodFrom" >= DATE '2000-01-01'
          AND "servicePeriodTo" <= DATE '2100-12-31')
    )
  );

COMMENT ON COLUMN public.sales_order_lines."servicePeriodFrom" IS
  'วันเริ่มช่วงบริการของรายการนี้ — มีค่าเฉพาะใบโหมด line และรายการแพ็คเกจ (RPC บันทึกล้างให้กรณีอื่น) · บังคับตอนยื่น · TS อ่านผ่าน service_zone_terms.salesOrderLineId (0400)';
COMMENT ON COLUMN public.sales_order_lines."servicePeriodTo" IS
  'วันสิ้นสุดช่วงบริการของรายการนี้ (รวมวันนี้) — คู่กับ servicePeriodFrom เสมอ (0400)';

-- ── §3 F1: บันทึกงานบริการทั้งชุด (เขียนทับตัวของ 0392 §6 — ลายเซ็นเดิม) ─────────────────────────────
-- เพิ่มจาก 0392: "periodMode" · ช่วงของรายการ · ช่วงรวมของใบ (โหมด 'line') · ล้างช่วงของรายการ (โหมด 'whole' / ไม่ใช่แพ็คเกจ)
CREATE OR REPLACE FUNCTION public.save_sales_order_service_setup(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_payload jsonb,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
-- 0400/F1 · เนื้อของ 0392 §6 + โหมดช่วงบริการ (whole | line) + ช่วงของรายการ + ช่วงรวมของใบ (มีค่าเมื่อรายการแพ็คเกจครบทุกรายการ)
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_line public.sales_order_lines%ROWTYPE;
  v_now timestamptz := now();
  v_item jsonb;
  v_zone jsonb;
  v_zone_ord bigint;
  v_period jsonb;
  v_set_period boolean := false;
  v_from date;
  v_to date;
  v_mode text;
  v_line_period jsonb;
  v_line_from date;
  v_line_to date;
  v_seen text[] := '{}';
  v_line_id text;
  v_is_fg boolean;
  v_kind text;
  v_role text;
  v_product_id text;
  v_fg text;
  v_rounds integer;
  v_num numeric;
  v_zone_id text;
  v_zone_ids text[];
  v_packs integer[];
  v_packs_one integer;
  v_lines integer := 0;
BEGIN
  IF NOT public.is_sales_keyer_role(p_actor_role) THEN
    RAISE EXCEPTION 'service_setup_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF NOT (v_order.origin = 'pipeline')
     OR public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE'
     OR NOT public.sales_order_service_setup_editable(
       v_order.status, v_order.origin, v_order."serviceTermsOpenedAt", v_order."supersededById", v_order."serviceSetupState"
     ) THEN
    RAISE EXCEPTION 'service_setup_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR (p_payload ? 'lines' AND jsonb_typeof(p_payload -> 'lines') IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'service_setup_payload_invalid';
  END IF;

  -- โหมดของช่วงบริการ: ไม่มีคีย์ = ไม่เปลี่ยน · มีคีย์ = ต้องเป็น 'whole' หรือ 'line'
  v_mode := v_order."servicePeriodMode";
  IF p_payload ? 'periodMode' THEN
    IF jsonb_typeof(p_payload -> 'periodMode') = 'string' AND (p_payload ->> 'periodMode') IN ('whole', 'line') THEN
      v_mode := p_payload ->> 'periodMode';
    ELSE
      RAISE EXCEPTION 'service_setup_period_mode_invalid';
    END IF;
  END IF;

  -- ช่วงบริการของใบ: ไม่มีคีย์ = ไม่เปลี่ยน · null = ล้างทั้งคู่ · วัตถุ = ต้องครบสองวัน from ≤ to ในปี 2000–2100
  -- โหมด 'line': ช่วงของใบคิดจากรายการ (ท้ายฟังก์ชัน) — ส่งคีย์นี้มา = ตีกลับ (จอรุ่นเก่าที่ยังเห็นช่องวันของใบ)
  IF p_payload ? 'period' THEN
    IF v_mode = 'line' THEN
      RAISE EXCEPTION 'service_setup_period_derived';
    END IF;
    v_set_period := true;
    v_period := p_payload -> 'period';
    IF jsonb_typeof(v_period) = 'null' THEN
      v_from := NULL;
      v_to := NULL;
    ELSIF jsonb_typeof(v_period) = 'object'
          AND jsonb_typeof(v_period -> 'from') = 'string'
          AND jsonb_typeof(v_period -> 'to') = 'string'
          AND (v_period ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$'
          AND (v_period ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$' THEN
      BEGIN
        v_from := (v_period ->> 'from')::date;
        v_to := (v_period ->> 'to')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'service_setup_period_invalid';
      END;
      IF v_from > v_to OR v_from < DATE '2000-01-01' OR v_to > DATE '2100-12-31' THEN
        RAISE EXCEPTION 'service_setup_period_invalid';
      END IF;
    ELSE
      RAISE EXCEPTION 'service_setup_period_invalid';
    END IF;
  END IF;

  -- สลับ 'line' → 'whole' โดยไม่ส่ง "period": ช่วงของใบ = ช่วงรวมของรายการที่มีช่วงอยู่ตอนนี้ (อ่านก่อนวงข้างล่างล้าง — ไม่มีอะไรหาย)
  -- ช่วงของใบที่เก็บอยู่อาจว่าง (รายการยังไม่ครบ) จึงคิดจากรายการเสมอ · ไม่มีสักรายการ = ว่างทั้งคู่
  IF v_mode = 'whole' AND v_order."servicePeriodMode" = 'line' AND NOT v_set_period THEN
    SELECT min(l."servicePeriodFrom"), max(l."servicePeriodTo") INTO v_from, v_to
      FROM public.sales_order_lines l
     WHERE l."salesOrderId" = v_order.id AND l."servicePeriodFrom" IS NOT NULL;
    v_set_period := true;
  END IF;

  FOR v_item IN SELECT e.value FROM jsonb_array_elements(COALESCE(p_payload -> 'lines', '[]'::jsonb)) AS e(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item -> 'lineId') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'service_setup_payload_invalid';
    END IF;
    v_line_id := v_item ->> 'lineId';
    IF v_line_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'service_setup_payload_invalid';
    END IF;
    v_seen := v_seen || v_line_id;

    SELECT * INTO v_line FROM public.sales_order_lines
     WHERE id = v_line_id AND "salesOrderId" = v_order.id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'service_setup_line_unknown'; END IF;

    v_is_fg := NULLIF(v_line."fgCode", '') IS NOT NULL OR NULLIF(v_line."productId", '') IS NOT NULL;
    IF v_is_fg AND (v_item ? 'kind' OR v_item ? 'serviceProductId') THEN
      RAISE EXCEPTION 'service_setup_kind_on_fg_line';
    END IF;

    v_kind := v_line."serviceKind";
    IF v_item ? 'kind' THEN
      IF jsonb_typeof(v_item -> 'kind') = 'null' THEN
        v_kind := NULL;
      ELSIF jsonb_typeof(v_item -> 'kind') = 'string' AND (v_item ->> 'kind') IN ('package', 'not_service') THEN
        v_kind := v_item ->> 'kind';
      ELSE
        RAISE EXCEPTION 'service_setup_kind_invalid';
      END IF;
    END IF;

    v_role := public.sales_order_line_service_role(v_kind, v_line."fgCode", v_line."productId", v_line.metadata);
    v_product_id := v_line."serviceProductId";
    v_fg := v_line."serviceFgCode";
    v_rounds := v_line."serviceRounds";
    v_line_from := v_line."servicePeriodFrom";
    v_line_to := v_line."servicePeriodTo";

    IF v_item ? 'zones' AND jsonb_typeof(v_item -> 'zones') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'service_setup_payload_invalid';
    END IF;

    IF v_role IS DISTINCT FROM 'package' THEN
      -- ไม่ใช่แพ็คเกจ (หรือยังไม่เลือก): ใส่ FG/รอบ/โซน/ช่วงไม่ได้ · สลับมาที่นี่ = ล้างของเดิมทั้งหมดของบรรทัด
      IF (v_item ? 'serviceProductId' AND jsonb_typeof(v_item -> 'serviceProductId') <> 'null')
         OR (v_item ? 'rounds' AND jsonb_typeof(v_item -> 'rounds') <> 'null')
         OR (v_item ? 'zones' AND jsonb_array_length(v_item -> 'zones') > 0)
         OR (v_item ? 'period' AND jsonb_typeof(v_item -> 'period') <> 'null') THEN
        RAISE EXCEPTION 'service_setup_not_package';
      END IF;
      v_product_id := NULL;
      v_fg := NULL;
      v_rounds := NULL;
      v_line_from := NULL;
      v_line_to := NULL;
      DELETE FROM public.sales_order_line_zones WHERE "salesOrderLineId" = v_line.id;
    ELSE
      IF v_item ? 'serviceProductId' THEN
        IF jsonb_typeof(v_item -> 'serviceProductId') = 'null' THEN
          v_product_id := NULL;
          v_fg := NULL;
        ELSIF jsonb_typeof(v_item -> 'serviceProductId') = 'string' THEN
          SELECT p.id, p."fgCode" INTO v_product_id, v_fg
            FROM public.products p
           WHERE p.id = v_item ->> 'serviceProductId'
             AND p."isActive" IS DISTINCT FROM false
             AND (p."approvalStatus" IS NULL OR p."approvalStatus" = 'approved')
             AND public.fg_category_of(p."fgCode") = '02-001';
          IF NOT FOUND THEN RAISE EXCEPTION 'service_setup_product_invalid'; END IF;
        ELSE
          RAISE EXCEPTION 'service_setup_product_invalid';
        END IF;
      END IF;

      IF v_item ? 'rounds' THEN
        IF jsonb_typeof(v_item -> 'rounds') = 'null' THEN
          v_rounds := NULL;
        ELSIF jsonb_typeof(v_item -> 'rounds') = 'number' THEN
          v_num := (v_item ->> 'rounds')::numeric;
          IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 999 THEN
            RAISE EXCEPTION 'service_setup_rounds_invalid';
          END IF;
          v_rounds := v_num::integer;
        ELSE
          RAISE EXCEPTION 'service_setup_rounds_invalid';
        END IF;
      END IF;

      -- ช่วงของรายการ: ไม่มีคีย์ = ไม่เปลี่ยน · null = ล้าง · วัตถุ = เฉพาะโหมด 'line' · ครบสองวัน from ≤ to ในปี 2000–2100
      IF v_item ? 'period' THEN
        v_line_period := v_item -> 'period';
        IF jsonb_typeof(v_line_period) = 'null' THEN
          v_line_from := NULL;
          v_line_to := NULL;
        ELSIF v_mode <> 'line' THEN
          RAISE EXCEPTION 'service_setup_line_period_mode';
        ELSIF jsonb_typeof(v_line_period) = 'object'
              AND jsonb_typeof(v_line_period -> 'from') = 'string'
              AND jsonb_typeof(v_line_period -> 'to') = 'string'
              AND (v_line_period ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$'
              AND (v_line_period ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$' THEN
          BEGIN
            v_line_from := (v_line_period ->> 'from')::date;
            v_line_to := (v_line_period ->> 'to')::date;
          EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'service_setup_line_period_invalid';
          END;
          IF v_line_from > v_line_to OR v_line_from < DATE '2000-01-01' OR v_line_to > DATE '2100-12-31' THEN
            RAISE EXCEPTION 'service_setup_line_period_invalid';
          END IF;
        ELSE
          RAISE EXCEPTION 'service_setup_line_period_invalid';
        END IF;
      END IF;

      IF v_item ? 'zones' THEN
        IF jsonb_array_length(v_item -> 'zones') > 500 THEN
          RAISE EXCEPTION 'service_setup_zones_too_many';
        END IF;
        v_zone_ids := '{}';
        v_packs := '{}';
        FOR v_zone, v_zone_ord IN
          SELECT z.value, z.ord FROM jsonb_array_elements(v_item -> 'zones') WITH ORDINALITY AS z(value, ord)
        LOOP
          IF jsonb_typeof(v_zone) IS DISTINCT FROM 'object'
             OR jsonb_typeof(v_zone -> 'zoneId') IS DISTINCT FROM 'string'
             OR NULLIF(v_zone ->> 'zoneId', '') IS NULL THEN
            RAISE EXCEPTION 'service_setup_payload_invalid';
          END IF;
          v_zone_id := v_zone ->> 'zoneId';
          IF v_zone_id = ANY (v_zone_ids) THEN
            RAISE EXCEPTION 'service_setup_zone_duplicate';
          END IF;
          -- โซนต้องเปิดใช้ · ไซต์เปิดใช้ · เป็นไซต์ลูกค้า · เป็นของลูกค้าในใบ (ตัวเดียวกับ bindTargetError)
          IF NOT EXISTS (
            SELECT 1
              FROM public.service_zones z
              JOIN public.service_sites s ON s.id = z."siteId"
             WHERE z.id = v_zone_id
               AND z."isActive" IS DISTINCT FROM false
               AND s."isActive" IS DISTINCT FROM false
               AND s.kind = 'customer'
               AND s."customerId" = v_order."customerId"
          ) THEN
            RAISE EXCEPTION 'service_setup_zone_invalid';
          END IF;
          IF NOT (v_zone ? 'packsPerRound') OR jsonb_typeof(v_zone -> 'packsPerRound') = 'null' THEN
            v_packs_one := NULL;
          ELSIF jsonb_typeof(v_zone -> 'packsPerRound') = 'number' THEN
            v_num := (v_zone ->> 'packsPerRound')::numeric;
            IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 9999 THEN
              RAISE EXCEPTION 'service_setup_packs_invalid';
            END IF;
            v_packs_one := v_num::integer;
          ELSE
            RAISE EXCEPTION 'service_setup_packs_invalid';
          END IF;
          v_zone_ids := v_zone_ids || v_zone_id;
          v_packs := v_packs || v_packs_one;
        END LOOP;

        DELETE FROM public.sales_order_line_zones
         WHERE "salesOrderLineId" = v_line.id
           AND NOT ("zoneId" = ANY (v_zone_ids));

        INSERT INTO public.sales_order_line_zones (
          id, "salesOrderId", "salesOrderLineId", "zoneId", "packsPerRound", "sortOrder",
          "createdById", "createdByName", "createdAt", "updatedAt"
        )
        SELECT 'SLZ-' || md5(v_line.id || ':' || z.zone_id), v_order.id, v_line.id, z.zone_id, z.packs,
               (z.ord - 1)::integer, p_actor_id, NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_now, v_now
          FROM unnest(v_zone_ids, v_packs) WITH ORDINALITY AS z(zone_id, packs, ord)
        ON CONFLICT ("salesOrderLineId", "zoneId") DO UPDATE SET
          "packsPerRound" = EXCLUDED."packsPerRound",
          "sortOrder" = EXCLUDED."sortOrder",
          "updatedAt" = now();
      END IF;

      -- D3: บรรทัดพิมพ์เองที่เป็นแพ็คเกจตามหมวด แล้วได้ FG ⇒ เก็บชนิด package ลงแถว (CHECK ต้องมีชนิดที่เก็บ)
      IF v_kind IS NULL AND NOT v_is_fg AND v_fg IS NOT NULL THEN
        v_kind := 'package';
      END IF;
    END IF;

    -- โหมด 'whole' = ไม่มีช่วงของรายการ (ท้ายฟังก์ชันล้างบรรทัดที่ก้อนนี้ไม่ได้แตะ)
    IF v_mode <> 'line' THEN
      v_line_from := NULL;
      v_line_to := NULL;
    END IF;

    UPDATE public.sales_order_lines SET
      "serviceKind" = v_kind,
      "serviceProductId" = v_product_id,
      "serviceFgCode" = v_fg,
      "serviceRounds" = v_rounds,
      "servicePeriodFrom" = v_line_from,
      "servicePeriodTo" = v_line_to
    WHERE id = v_line.id
      AND ("serviceKind" IS DISTINCT FROM v_kind
        OR "serviceProductId" IS DISTINCT FROM v_product_id
        OR "serviceFgCode" IS DISTINCT FROM v_fg
        OR "serviceRounds" IS DISTINCT FROM v_rounds
        OR "servicePeriodFrom" IS DISTINCT FROM v_line_from
        OR "servicePeriodTo" IS DISTINCT FROM v_line_to);

    v_lines := v_lines + 1;
  END LOOP;

  IF v_mode = 'line' THEN
    -- สลับ 'whole' → 'line': รายการแพ็คเกจที่ก้อนนี้ไม่ได้ส่งคีย์ "period" มา รับช่วงเดิมของใบเป็นค่าเริ่ม (ไม่มีอะไรหาย)
    IF v_order."servicePeriodMode" <> 'line'
       AND v_order."servicePeriodFrom" IS NOT NULL AND v_order."servicePeriodTo" IS NOT NULL THEN
      UPDATE public.sales_order_lines l SET
        "servicePeriodFrom" = v_order."servicePeriodFrom",
        "servicePeriodTo" = v_order."servicePeriodTo"
      WHERE l."salesOrderId" = v_order.id
        AND l."servicePeriodFrom" IS NULL
        AND public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) = 'package'
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload -> 'lines', '[]'::jsonb)) AS e(value)
           WHERE e.value ->> 'lineId' = l.id AND e.value ? 'period'
        );
    END IF;
    -- ช่วงของรายการที่ไม่ใช่แพ็คเกจต้องว่าง (บรรทัดที่ก้อนนี้ไม่ได้แตะ — ปกติไม่มี)
    UPDATE public.sales_order_lines l SET "servicePeriodFrom" = NULL, "servicePeriodTo" = NULL
     WHERE l."salesOrderId" = v_order.id
       AND l."servicePeriodFrom" IS NOT NULL
       AND public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) IS DISTINCT FROM 'package';
    -- ช่วงรวมของใบ = เริ่มแรกสุด → จบสุดท้าย · 🔴 มีค่าเมื่อรายการแพ็คเกจ **ทุกรายการ** มีช่วงแล้วเท่านั้น
    --   ยังขาดสักรายการ (หรือไม่มีแพ็คเกจเลย) = ว่างทั้งคู่ — ตัวอ่านช่วงของใบ (ด่านช่วงครอบ · แบ่งช่วงครอบ · สัญญา) ต้องไม่เห็นช่วงรวมครึ่งเดียว
    SELECT min(l."servicePeriodFrom"), max(l."servicePeriodTo") INTO v_from, v_to
      FROM public.sales_order_lines l
     WHERE l."salesOrderId" = v_order.id AND l."servicePeriodFrom" IS NOT NULL;
    IF EXISTS (
      SELECT 1 FROM public.sales_order_lines l
       WHERE l."salesOrderId" = v_order.id
         AND l."servicePeriodFrom" IS NULL
         AND public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) = 'package'
    ) THEN
      v_from := NULL;
      v_to := NULL;
    END IF;
    v_set_period := true;
  ELSE
    -- โหมด 'whole' (รวมการสลับ 'line' → 'whole'): ช่วงของรายการไม่มีความหมาย ล้างทั้งใบ
    --   ช่วงของใบ: ส่ง "period" มา = ค่านั้น · สลับจาก 'line' ไม่ส่ง = ช่วงรวมที่คิดไว้ก่อนวง · โหมด 'whole' อยู่แล้วไม่ส่ง = คงเดิม
    UPDATE public.sales_order_lines l SET "servicePeriodFrom" = NULL, "servicePeriodTo" = NULL
     WHERE l."salesOrderId" = v_order.id
       AND (l."servicePeriodFrom" IS NOT NULL OR l."servicePeriodTo" IS NOT NULL);
  END IF;

  UPDATE public.sales_orders SET
    "servicePeriodMode" = v_mode,
    "servicePeriodFrom" = CASE WHEN v_set_period THEN v_from ELSE "servicePeriodFrom" END,
    "servicePeriodTo" = CASE WHEN v_set_period THEN v_to ELSE "servicePeriodTo" END,
    "updatedAt" = v_now
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'updatedAt', v_now,
    'lines', v_lines,
    'zones', (SELECT count(*) FROM public.sales_order_line_zones WHERE "salesOrderId" = v_order.id),
    'periodMode', v_mode
  );
END;
$$;

-- ── §3 F2: ออก Rev. — ยกงานบริการไปใบ Rev. (เขียนทับตัวของ 0392 §8 — ลายเซ็นเดิม) ────────────────────────
-- เพิ่มจาก 0392: ยกโหมดของช่วงบริการ + ช่วงของรายการ · ⛔ ยังไม่ยกตรา/สถานะตั้งย้อนหลัง/ประวัติเปิดแก้
CREATE OR REPLACE FUNCTION public.sales_order_copy_service_setup(p_from text, p_to text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
-- 0400/F2 · เนื้อของ 0392 §8 + โหมดช่วงบริการ + ช่วงของรายการ
DECLARE
  v_source public.sales_orders%ROWTYPE;
  v_target public.sales_orders%ROWTYPE;
  v_n integer;
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.sales_order_lines l
        WHERE l."salesOrderId" = p_from
          AND (l."serviceKind" IS NOT NULL OR l."serviceProductId" IS NOT NULL OR l."serviceFgCode" IS NOT NULL
               OR l."servicePeriodFrom" IS NOT NULL)
     )
     AND NOT EXISTS (SELECT 1 FROM public.sales_order_line_zones a WHERE a."salesOrderId" = p_from)
     AND NOT EXISTS (
       SELECT 1 FROM public.sales_orders o
        WHERE o.id = p_from
          AND (o."servicePeriodFrom" IS NOT NULL OR o."servicePeriodTo" IS NOT NULL OR o."servicePeriodMode" = 'line')
     ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_source FROM public.sales_orders WHERE id = p_from;
  SELECT * INTO v_target FROM public.sales_orders WHERE id = p_to;
  IF v_source.id IS NULL OR v_target.id IS NULL
     OR v_target.status <> 'draft'
     OR v_target."revisedFromId" IS DISTINCT FROM p_from THEN
    RAISE EXCEPTION 'service_setup_copy_line_mismatch';
  END IF;

  -- บรรทัดใบ Rev. ต้องตรงกับใบเดิมทุกบรรทัด (สูตร id เดียวกับ 0376 + บรรทัด QT เดียวกัน)
  IF EXISTS (
    SELECT 1 FROM public.sales_order_lines s
     WHERE s."salesOrderId" = p_from
       AND NOT EXISTS (
         SELECT 1 FROM public.sales_order_lines t
          WHERE t.id = 'SOL-' || md5(p_to || ':' || s.id)
            AND t."salesOrderId" = p_to
            AND t."quotationLineId" IS NOT DISTINCT FROM s."quotationLineId"
       )
  ) THEN
    RAISE EXCEPTION 'service_setup_copy_line_mismatch';
  END IF;

  UPDATE public.sales_order_lines t SET
    "serviceKind" = s."serviceKind",
    "serviceProductId" = s."serviceProductId",
    "serviceFgCode" = s."serviceFgCode",
    "servicePeriodFrom" = s."servicePeriodFrom",
    "servicePeriodTo" = s."servicePeriodTo"
  FROM public.sales_order_lines s
  WHERE s."salesOrderId" = p_from
    AND t.id = 'SOL-' || md5(p_to || ':' || s.id)
    AND t."salesOrderId" = p_to
    AND (t."serviceKind" IS DISTINCT FROM s."serviceKind"
      OR t."serviceProductId" IS DISTINCT FROM s."serviceProductId"
      OR t."serviceFgCode" IS DISTINCT FROM s."serviceFgCode"
      OR t."servicePeriodFrom" IS DISTINCT FROM s."servicePeriodFrom"
      OR t."servicePeriodTo" IS DISTINCT FROM s."servicePeriodTo");

  -- โหมด + ช่วงบริการของใบ — "updatedAt" ของใบ Rev. ไม่ขยับ (route ใช้ค่าที่ฟังก์ชันออก Rev. คืนมา)
  UPDATE public.sales_orders SET
    "servicePeriodMode" = v_source."servicePeriodMode",
    "servicePeriodFrom" = v_source."servicePeriodFrom",
    "servicePeriodTo" = v_source."servicePeriodTo"
  WHERE id = p_to
    AND ("servicePeriodMode" IS DISTINCT FROM v_source."servicePeriodMode"
      OR "servicePeriodFrom" IS DISTINCT FROM v_source."servicePeriodFrom"
      OR "servicePeriodTo" IS DISTINCT FROM v_source."servicePeriodTo");

  INSERT INTO public.sales_order_line_zones (
    id, "salesOrderId", "salesOrderLineId", "zoneId", "packsPerRound", "sortOrder",
    "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT 'SLZ-' || md5(('SOL-' || md5(p_to || ':' || a."salesOrderLineId")) || ':' || a."zoneId"),
         p_to, 'SOL-' || md5(p_to || ':' || a."salesOrderLineId"), a."zoneId", a."packsPerRound", a."sortOrder",
         v_target."createdBy", v_target."createdByName", now(), now()
    FROM public.sales_order_line_zones a
   WHERE a."salesOrderId" = p_from
  ON CONFLICT ("salesOrderLineId", "zoneId") DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n;
END;
$$;

-- ── §3 F3: ด่านชั้นฐาน — ล็อกงานบริการตามสถานะใบ (เขียนทับตัวของ 0392 §10) ─────────────────────────────
-- เพิ่มจาก 0392: ช่วงของรายการไม่ใช่ "แก้แค่จำนวนรอบ" — เปลี่ยนช่วงต้องอยู่ในสถานะที่แก้งานบริการได้ (DETAIL = line_period)
CREATE OR REPLACE FUNCTION public.sales_order_service_setup_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
-- 0400/F3 · เนื้อของ 0392 §10 + ช่วงของรายการล็อกเหมือนชนิด/แพ็คเกจ
DECLARE
  v_parent public.sales_orders%ROWTYPE;
  v_order_id text;
BEGIN
  IF current_setting('app.force_delete', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales_order_line_zones' THEN
    IF TG_OP = 'UPDATE' AND OLD."salesOrderId" IS DISTINCT FROM NEW."salesOrderId" THEN
      SELECT * INTO v_parent FROM public.sales_orders WHERE id = OLD."salesOrderId";
      IF FOUND AND NOT public.sales_order_service_setup_editable(
        v_parent.status, v_parent.origin, v_parent."serviceTermsOpenedAt", v_parent."supersededById", v_parent."serviceSetupState"
      ) THEN
        RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'zones';
      END IF;
    END IF;
    v_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."salesOrderId" ELSE NEW."salesOrderId" END;
    SELECT * INTO v_parent FROM public.sales_orders WHERE id = v_order_id;
    IF NOT FOUND THEN
      -- แม่ถูกลบไปแล้วในคำสั่งเดียวกัน (cascade) · INSERT ที่ไม่มีแม่ตายที่ FK อยู่แล้ว
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    IF NOT public.sales_order_service_setup_editable(
      v_parent.status, v_parent.origin, v_parent."serviceTermsOpenedAt", v_parent."supersededById", v_parent."serviceSetupState"
    ) THEN
      RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'zones';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales_order_lines' THEN
    SELECT * INTO v_parent FROM public.sales_orders WHERE id = NEW."salesOrderId";
    IF NOT FOUND THEN RETURN NEW; END IF;

    -- (a) สินค้าแพ็คเกจถูกลบ → FK SET NULL เปลี่ยนแค่ serviceProductId เป็น NULL
    IF OLD."serviceKind" IS NOT DISTINCT FROM NEW."serviceKind"
       AND OLD."serviceFgCode" IS NOT DISTINCT FROM NEW."serviceFgCode"
       AND OLD."serviceRounds" IS NOT DISTINCT FROM NEW."serviceRounds"
       AND OLD."servicePeriodFrom" IS NOT DISTINCT FROM NEW."servicePeriodFrom"
       AND OLD."servicePeriodTo" IS NOT DISTINCT FROM NEW."servicePeriodTo"
       AND OLD."serviceProductId" IS NOT NULL AND NEW."serviceProductId" IS NULL THEN
      RETURN NEW;
    END IF;

    -- (b) แก้แค่จำนวนรอบ
    IF OLD."serviceKind" IS NOT DISTINCT FROM NEW."serviceKind"
       AND OLD."serviceProductId" IS NOT DISTINCT FROM NEW."serviceProductId"
       AND OLD."serviceFgCode" IS NOT DISTINCT FROM NEW."serviceFgCode"
       AND OLD."servicePeriodFrom" IS NOT DISTINCT FROM NEW."servicePeriodFrom"
       AND OLD."servicePeriodTo" IS NOT DISTINCT FROM NEW."servicePeriodTo" THEN
      IF v_parent.status IN ('pending_approval', 'approval_revoked')
         OR (v_parent.origin = 'pipeline'
             AND v_parent.status = 'approved'
             AND v_parent."serviceSetupState" = 'submitted'
             AND v_parent."supersededById" IS NULL
             AND v_parent."serviceTermsOpenedAt" IS NULL) THEN
        RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'rounds';
      END IF;
      IF v_parent.status = 'approved'
         AND v_parent."serviceTermsOpenedAt" IS NOT NULL
         AND NEW."serviceRounds" IS NULL
         AND public.sales_order_line_service_role(NEW."serviceKind", NEW."fgCode", NEW."productId", NEW.metadata) = 'package' THEN
        RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'rounds_required';
      END IF;
      RETURN NEW;
    END IF;

    -- (c) ชนิด / แพ็คเกจ / ช่วงของรายการ — ต้องอยู่ในสถานะที่แก้งานบริการได้
    IF NOT public.sales_order_service_setup_editable(
      v_parent.status, v_parent.origin, v_parent."serviceTermsOpenedAt", v_parent."supersededById", v_parent."serviceSetupState"
    ) THEN
      RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = CASE
        WHEN OLD."serviceKind" IS NOT DISTINCT FROM NEW."serviceKind"
         AND OLD."serviceProductId" IS NOT DISTINCT FROM NEW."serviceProductId"
         AND OLD."serviceFgCode" IS NOT DISTINCT FROM NEW."serviceFgCode" THEN 'line_period'
        ELSE 'kind' END;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales_orders' THEN
    -- ตัดสินจากสถานะ "ก่อนแก้" — คำสั่งที่เปลี่ยนสถานะพร้อมช่วงบริการ/โหมดต้องไม่หลุดด่าน
    IF NOT public.sales_order_service_setup_editable(
      OLD.status, OLD.origin, OLD."serviceTermsOpenedAt", OLD."supersededById", OLD."serviceSetupState"
    ) THEN
      RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'period';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ── §4 trigger สองตัวฟังคอลัมน์ใหม่ (ตัวของตารางโซนไม่เปลี่ยน) ──────────────────────────────────
DROP TRIGGER IF EXISTS sales_order_lines_service_guard_trg ON public.sales_order_lines;
CREATE TRIGGER sales_order_lines_service_guard_trg
BEFORE UPDATE OF "serviceKind", "serviceProductId", "serviceFgCode", "serviceRounds", "servicePeriodFrom", "servicePeriodTo"
ON public.sales_order_lines
FOR EACH ROW
WHEN (OLD."serviceKind" IS DISTINCT FROM NEW."serviceKind"
   OR OLD."serviceProductId" IS DISTINCT FROM NEW."serviceProductId"
   OR OLD."serviceFgCode" IS DISTINCT FROM NEW."serviceFgCode"
   OR OLD."serviceRounds" IS DISTINCT FROM NEW."serviceRounds"
   OR OLD."servicePeriodFrom" IS DISTINCT FROM NEW."servicePeriodFrom"
   OR OLD."servicePeriodTo" IS DISTINCT FROM NEW."servicePeriodTo")
EXECUTE FUNCTION public.sales_order_service_setup_guard();

DROP TRIGGER IF EXISTS sales_orders_service_period_guard_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_service_period_guard_trg
BEFORE UPDATE OF "servicePeriodFrom", "servicePeriodTo", "servicePeriodMode" ON public.sales_orders
FOR EACH ROW
WHEN (OLD."servicePeriodFrom" IS DISTINCT FROM NEW."servicePeriodFrom"
   OR OLD."servicePeriodTo" IS DISTINCT FROM NEW."servicePeriodTo"
   OR OLD."servicePeriodMode" IS DISTINCT FROM NEW."servicePeriodMode")
EXECUTE FUNCTION public.sales_order_service_setup_guard();

-- ── §5 ปะตัวตรวจรายการที่ยังขาด (ฟังก์ชันที่รันอยู่จริง = 0392 + แพตช์ P9a/P9b/P9c ของ 0394) ───────────────────
-- ⚠️ ชื่อฟังก์ชันเขียนเป็นสตริงใน VALUES เท่านั้น (ดูหัวไฟล์) · anchor เป็น regex (ARE) ครั้งเดียวพอดีทั้งสองที่
-- ⚠️ สองแถวปะฟังก์ชันเดียวกัน — อ่านนิยามใหม่ทุกแถว · ป้ายของแถวหนึ่งห้ามโผล่ในข้อความของอีกแถว
-- L2: โหมด 'line' — period_missing เงียบเฉพาะตอนที่ยังมีข้อ line_period_missing (ข้อรายรายการบอกแล้ว ไม่พูดซ้ำ) ·
--     รายการครบแต่ช่วงของใบว่าง (ข้อมูลเพี้ยน) = period_missing ⇒ ใบที่มีแพ็คเกจไม่มีวันอนุมัติได้โดยไม่มีช่วงของใบ
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
      ('sales_order_service_setup_errors',
        $re$(v_has_package := true;)$re$,
        $rp$\1
    -- 0400/L1 ▶ โหมด "แยกรายรายการ": รายการแพ็คเกจต้องมีช่วงบริการของตัวเอง (ใบย้อนหลังเป็น 'whole' เสมอ — CHECK ของ 0400)
    IF v_order."servicePeriodMode" = 'line'
       AND EXISTS (SELECT 1 FROM public.sales_order_lines pl
                    WHERE pl.id = v_line.id
                      AND (pl."servicePeriodFrom" IS NULL OR pl."servicePeriodTo" IS NULL)) THEN
      v_errors := v_errors || ('line_period_missing:' || v_line.id);
    END IF;
    -- 0400/L1 ◀$rp$,
        '0400/L1'),
      ('sales_order_service_setup_errors',
        $re$IF v_order\.origin = 'pipeline' AND v_has_package AND \($re$,
        $rp$IF v_order.origin = 'pipeline' AND (v_order."servicePeriodMode" IS DISTINCT FROM 'line' OR position('line_period_missing:' in array_to_string(v_errors, ',')) = 0) /* 0400/L2 */ AND v_has_package AND ($rp$,
        '0400/L2')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0400_patch_overload % count=%', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0400: % % — ปะไว้แล้ว', r.marker, r.fn;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0400_patch_anchor % % hits=%/%', r.marker, r.fn, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0400: % % — ปะแล้ว', r.marker, r.fn;
  END LOOP;
END
$patch$;

-- ── §6 สิทธิ์ (แพตเทิร์น 0336 — ลายเซ็นเต็มทุกบรรทัด · ลายเซ็นไม่เปลี่ยน ประกาศซ้ำให้ชัด) ──────────────────────
REVOKE ALL ON FUNCTION public.save_sales_order_service_setup(text, timestamptz, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_order_service_setup(text, timestamptz, jsonb, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_copy_service_setup(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_copy_service_setup(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_service_setup_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ── §7 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  r record;
  v_n integer;
  v_src text;
  v_fn text;
  v_before jsonb := current_setting('mig_0400.untouched', true)::jsonb;
BEGIN
  -- 11 ฟังก์ชันที่ต้องไม่แตะ: ครบ และเนื้อเท่าต้นไฟล์
  IF v_before IS NULL OR (SELECT count(*) FROM jsonb_object_keys(v_before)) <> 11 THEN
    RAISE EXCEPTION 'mig_0400_verify bodies';
  END IF;
  SELECT count(*) INTO v_n
    FROM jsonb_each_text(v_before) AS b(fn, h)
    LEFT JOIN (SELECT p.proname, md5(p.prosrc) AS h
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public') now_fn ON now_fn.proname = b.fn
   WHERE now_fn.h IS DISTINCT FROM b.h;
  IF v_n > 0 THEN RAISE EXCEPTION 'mig_0400_verify touched=%', v_n; END IF;

  -- ป้ายของสามตัวที่เขียนทับ + สองแพตช์ — ครั้งเดียวพอดี · ป้ายของ 0394 ในตัวตรวจยังอยู่ครบ
  FOR r IN
    SELECT * FROM (VALUES
      ('save_sales_order_service_setup', '0400/F1'),
      ('sales_order_copy_service_setup', '0400/F2'),
      ('sales_order_service_setup_guard', '0400/F3'),
      ('sales_order_service_setup_errors', '0400/L1 ▶'), ('sales_order_service_setup_errors', '0400/L1 ◀'),
      ('sales_order_service_setup_errors', '0400/L2'),
      ('sales_order_service_setup_errors', '0394/P9a ▶'), ('sales_order_service_setup_errors', '0394/P9b ▶'),
      ('sales_order_service_setup_errors', '0394/P9b ◀'), ('sales_order_service_setup_errors', '0394/P9c ▶')
    ) AS t(fn, needle)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    IF v_n IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'mig_0400_verify marker % in % = %', r.needle, r.fn, v_n;
    END IF;
  END LOOP;

  -- สิทธิ์: anon/authenticated ไม่มีทุกตัว · service_role เรียกตัวบันทึก/ตัวยก/ตัวตรวจได้ · ฟังก์ชัน trigger ไม่มีใครเรียกตรง
  FOR r IN
    SELECT * FROM (VALUES
      ('public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)', true),
      ('public.sales_order_copy_service_setup(text,text)', true),
      ('public.sales_order_service_setup_errors(text)', true),
      ('public.sales_order_service_setup_guard()', false)
    ) AS t(sig, service_role)
  LOOP
    v_fn := r.sig;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') IS DISTINCT FROM r.service_role THEN
      RAISE EXCEPTION 'mig_0400_verify grant %', v_fn;
    END IF;
  END LOOP;

  -- คอลัมน์ · CHECK · trigger
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND ((table_name = 'sales_orders' AND column_name = 'servicePeriodMode')
       OR (table_name = 'sales_order_lines' AND column_name IN ('servicePeriodFrom', 'servicePeriodTo')));
  IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0400_verify columns=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conname IN ('sales_orders_service_period_mode_shape', 'sales_order_lines_service_period_shape');
  IF v_n <> 2 THEN RAISE EXCEPTION 'mig_0400_verify checks=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND ((t.tgname = 'sales_order_lines_service_guard_trg' AND strpos(pg_get_triggerdef(t.oid), '"servicePeriodFrom"') > 0)
       OR (t.tgname = 'sales_orders_service_period_guard_trg' AND strpos(pg_get_triggerdef(t.oid), '"servicePeriodMode"') > 0)
       OR t.tgname = 'sales_order_line_zones_guard_trg');
  IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0400_verify triggers=%', v_n; END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
