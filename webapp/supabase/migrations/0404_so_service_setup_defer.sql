-- ============================================================
--  Migration 0404: SO บริการ — "ยื่นโดยยังไม่ตั้งงานบริการ" (ข้ามการตั้งงานบริการตอนยื่น · ตั้งทีหลังการนับ Actual)
--                  (มติเจ้าของ 01/10 "ผูกรอบบริการให้ข้ามได้ มาใส่ทีหลัง Actual ได้" → ทาง "ฝ่ายขายกดข้ามเอง"
--                   · แผน mockups/so-service-lines/IMPL_PLAN_DEFER.md §2)
--
--  🐞 ของเดิม (0392): ใบสั่งขายสายบริการยื่นอนุมัติไม่ได้จนกว่างานบริการ (แพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค ·
--     ช่วงบริการ) จะครบ และการอนุมัติเปิดรอบขายให้ TS ในทรานแซกชันเดียวกัน — ไม่ครบ = การอนุมัติถอยทั้งก้อน
--     ⇒ ยอดที่ลูกค้ายืนยันแล้วนับ Actual ไม่ได้ เพียงเพราะฝ่ายขายยังไม่รู้ไซต์/โซน/รอบ
--  ⭐ ของใหม่: ผู้ยื่นกด "ยื่นโดยยังไม่ตั้งงานบริการ" ได้เมื่องานบริการยังไม่ครบ → ใบจำว่าใคร/เมื่อไรที่ข้าม (3 ช่องใหม่)
--     → ผู้อนุมัติเห็นว่าใบนี้ข้าม → อนุมัติ = นับ Actual ตามเดิมทุกอย่าง แต่ **ไม่เปิดรอบขาย ไม่ประทับตรา**
--     ⇒ ใบตกเข้า **เส้นตั้งย้อนหลังเดิมของ 0392 ทุกตัว** (แก้ในตาราง → ยื่นตรวจงานบริการ → ผู้จัดการฝ่ายขายอนุมัติ = เปิดรอบขาย + ตรา)
--     · งานบริการครบตอนอนุมัติ = เปิดรอบขายตามเดิม (ตราการข้ามไม่มีผล) · ไม่ครบและไม่ได้ข้าม = ถอยการอนุมัติตามเดิม
--     · ดึงกลับ/ตีกลับ/กู้คืนเป็นร่าง = ตราการข้ามถูกล้าง (ต้องเลือกข้ามใหม่ทุกครั้งที่ยื่น) · ไม่ยกไปใบ Rev.
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านก่อนรัน (ต้องมีของ 0392 · 0394 · 0396 · 0400) · จดลายนิ้วมือ (md5) ของ 17 ฟังก์ชันที่ไฟล์นี้ต้องไม่แตะ
--     ไว้ในตัวแปรของทรานแซกชัน (set_config — ไม่มีตารางชั่วคราว)
--  §1 sales_orders + "serviceSetupDeferredAt" · "serviceSetupDeferredById" · "serviceSetupDeferredByName"
--     + CHECK sales_orders_service_setup_defer_shape (ว่างครบทั้งสาม หรือ มีเวลา ∧ ใบ pipeline ∧ สถานะไม่ใช่ร่าง/ตีกลับ)
--  §2 trigger sales_orders_service_defer_clear_trg (BEFORE UPDATE OF status) — สถานะกลับเป็นร่าง/ตีกลับ = ล้างสามช่อง
--     (แพตเทิร์นเดียวกับตัวล้างตัวชี้หลักฐานลายเซ็นของ 0126 · ครอบทุกทาง: RPC ดึงกลับ · route ตีกลับ · route กู้คืน)
--  §3 submit_sales_order_deferring_service_setup(...) RETURNS jsonb { document, evidence } — ตัวห่อของการยื่น:
--       สิทธิ์ → ล็อกแถวใบ → สถานะ (pipeline · ร่าง/ตีกลับ · สาย SERVICE) → updatedAt → งานบริการต้อง "ยังไม่ครบ" จริงและมีรายการ
--       ที่ต้องตั้ง → ห้ามมีรอบขายค้างของใบนี้ → ใบ Rev. ห้ามมีรอบบริการที่ TS ยังเดินอยู่บนใบเดิม → เรียกตัวยื่นเดิม
--       (หลักฐานลายเซ็นผู้จัดทำ · สถานะ · ผู้ยื่น) → เขียนตราการข้าม
--       · ตัวยื่นเดิมล้ม (เช่นยังไม่มีลายเซ็น) = ไม่มีอะไรถูกเขียน (ทรานแซกชันเดียว) · ไม่แตะเนื้อของตัวยื่นเดิมเลย
--  §4 ปะฟังก์ชันที่รันอยู่จริงหนึ่งตัว (pg_get_functiondef แบบ 0392/0394/0400): ตัวเปิดรอบขาย (0392 §7 + แพตช์ P8 ของ 0394)
--       D1 งานบริการยังไม่ครบ ∧ ใบมีตราการข้าม ∧ ไม่ได้อยู่ในขั้นรอตรวจงานบริการ ∧ ไม่มีรอบขายของใบนี้ค้าง
--          ∧ (ไม่ใช่ใบ Rev. หรือใบเดิมไม่มีรอบบริการที่ยังเดินอยู่)
--          ⇒ คืน 0 **ไม่เปิดรอบขาย ไม่ประทับตรา** (แทนการ RAISE sales_order_service_setup_incomplete)
--       · ผู้เรียกสามทาง: ตัวอนุมัติใบ (P1 ของ 0392 — **เนื้อไม่ถูกแตะ**) = ทางเดียวที่เข้า D1 · ตัวอนุมัติงานบริการย้อนหลัง
--         (สถานะ 'submitted' เสมอ ⇒ ไม่เข้า D1 · ไม่ครบ = RAISE ตามเดิม) · ตัวอนุมัติใบย้อนหลัง (origin ≠ pipeline ⇒ ไม่เข้า D1)
--       · anchor ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · มีป้าย 0404/D1 แล้ว = ข้าม
--  §5 สิทธิ์ (แพตเทิร์น 0336)   §6 ตรวจท้าย
--
--  ⛔ ไม่แตะ: ตัวอนุมัติใบ (ฟังก์ชันเงิน — md5 เท่าเดิม · ตรวจท้าย) · ตัวยื่นเดิม · ตัวออก Rev. · ตัวดึงกลับ · ตัวยื่น/อนุมัติ/ตีกลับ
--     งานบริการย้อนหลัง · ตัวบันทึก/ตัวยก/ตัวล็อก/ตัวตรวจ/ตัวตัดสินแก้ได้ไหม · ตัวเปิดแก้หลังอนุมัติ + ตัวตรวจ · ตัวอนุมัติใบย้อนหลัง
--     · trigger Actual (0279 — ฟัง status/actualAmount/orderDate/approvedAt/dealId: สามช่องใหม่ไม่อยู่ในรายการ) · เจ้าของยอด (0294)
--     · ยอด/งวด/ฉบับตรึง/fingerprint · ใบย้อนหลัง (CHECK: ตราการข้ามมีได้เฉพาะใบ pipeline)
--  ⛔ ไม่ backfill — ใบที่มีอยู่ทุกใบสามช่องใหม่ว่าง = พฤติกรรมเดิมทุกตัวอักษร (ใบที่รออนุมัติอยู่ตอนรันด้วย)
--  🪤 ไฟล์นี้เขียนข้อความ FUNCTION ตามด้วย public. + ชื่อ ได้เฉพาะสองตัวใหม่ของ §2/§3 — ฟังก์ชันที่รันอยู่อ้างด้วยชื่อเปล่า /
--     p.proname = '…' เท่านั้น (ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของนิยามด้วยข้อความนั้น)
--
--  ── รหัสผิดพลาดใหม่ (สัญญากับ SERVICE_SETUP_SQL_MESSAGES ฝั่ง JS) ─────────────────────────────────
--   service_setup_defer_state_invalid (409)  ไม่ใช่ใบ pipeline / ไม่ใช่ร่าง-ตีกลับ / ไม่ใช่สาย SERVICE
--   service_setup_defer_nothing (409)        งานบริการครบแล้ว หรือไม่มีรายการที่ต้องตั้ง — ยื่นอนุมัติตามปกติ
--   service_setup_defer_terms_exist (409)    ใบมีรอบขายค้างจากการอนุมัติรอบก่อน (กู้คืนจากยกเลิก) — ข้ามไม่ได้
--   service_setup_defer_plans_running (409)  ใบ Rev. ของใบที่ TS ยังเดินรอบบริการอยู่ — ข้ามไม่ได้ (การอนุมัติแบบข้ามไม่ย้ายรอบมาใบนี้
--                                            ⇒ TS จะเห็นรอบเป็น "ใบ Rev. ไม่มีไซต์นี้ — ปิดรอบ/ถอนเครื่อง" ซึ่งไม่จริง)
--   (ใช้ซ้ำ: service_setup_forbidden 403 · sales_order_not_found 404 · workflow_stale 409 · และทุกรหัส signature_evidence_*
--    ของตัวยื่นเดิมไหลผ่านตามเดิม)
--
--  ── คอลัมน์ใหม่ (check:columns แดงเฉพาะชื่อเหล่านี้จนกว่าจะรัน — อย่างอื่นแดง = บั๊กจริง) ─────────────────────
--   sales_orders."serviceSetupDeferredAt" / "serviceSetupDeferredById" / "serviceSetupDeferredByName"
--
--  ── ด่านก่อนรัน (§0 — RAISE แล้วทั้งไฟล์ถอย) ──────────────────────────────────────────────
--   mig_0404_needs_0400  ยังไม่มีของ 0392/0394/0396/0400 (19 ฟังก์ชัน · ป้าย P1 ในตัวอนุมัติใบ · ป้าย 0394/P8 ในตัวเปิดรอบขาย ·
--                        ป้าย 0400/L1 ในตัวตรวจ)
--
--  ── ตรวจก่อนรัน (อ่านอย่างเดียว · รันได้ทุกเมื่อ) ─────────────────────────────────────────────
--   คาด (ก่อนรัน): fns = 19 · p1 = 1 · p8 = 1 · d1_anchor = 1 · d1 = 0 · cols = 0 · pending_service ≥ 0 (ข้อมูลประกอบ)
--   d1_anchor ≠ 1 ขณะ d1 = 0 = เนื้อของตัวเปิดรอบขายไม่ใช่เนื้อที่ไฟล์นี้รู้จัก ⇒ อย่ารัน แจ้งผู้พัฒนา (ด่าน §4 จะหยุดเองด้วย
--   mig_0404_patch_anchor อยู่แล้ว)
--
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = ANY (ARRAY['approve_sales_order_with_signature_evidence_atomic', 'submit_sales_order_with_signature_evidence_atomic',
--        'withdraw_sales_order_submission_atomic', 'revise_approved_sales_order_atomic', 'approve_historical_sales_order',
--        'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
--        'reject_sales_order_service_setup', 'save_sales_order_service_setup', 'sales_order_service_setup_editable',
--        'sales_order_service_setup_errors', 'sales_order_service_setup_guard', 'sales_order_copy_service_setup',
--        'sales_order_line_service_role', 'sales_order_business_line', 'reopen_sales_order_service_setup',
--        'sales_order_service_reopen_blockers', 'is_sales_keyer_role'])) AS fns,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'approve_sales_order_with_signature_evidence_atomic' AND strpos(p.prosrc, 'sales_order_open_service_terms(') > 0) AS p1,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_open_service_terms' AND strpos(p.prosrc, '0394/P8') > 0) AS p8,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
--      regexp_matches(p.prosrc, $re$(IF cardinality\(v_errors\) > 0 THEN)(\s*RAISE EXCEPTION 'sales_order_service_setup_incomplete')$re$, 'g') AS m
--      WHERE n.nspname = 'public' AND p.proname = 'sales_order_open_service_terms') AS d1_anchor,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_open_service_terms' AND strpos(p.prosrc, '0404/D1 ▶') > 0) AS d1,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders'
--      AND column_name LIKE 'serviceSetupDeferred%') AS cols,
--    (SELECT count(*) FROM public.sales_orders o WHERE o.origin = 'pipeline' AND o.status = 'pending_approval'
--      AND public.sales_order_business_line(o.id) = 'SERVICE') AS pending_service;
--
--  ── ลำดับ deploy ────────────────────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่องเขียว (test · TZ=UTC test · build · gates) · ฮาร์เนส PGlite harness-0404 ผ่านสองรอบผลเหมือนกัน · rebase บน main ล่าสุด
--   1) ตรวจเลข migration อีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0404 (0401 มีงานอื่นจองแล้ว ห้ามใช้)
--   2) เจ้าของรัน SELECT ตรวจก่อนรันข้างบน → รันไฟล์นี้ที่ SQL Editor **ก่อน** merge/deploy → รัน SELECT ตรวจหลังรันข้างล่าง
--      (โค้ดรุ่นที่รันอยู่ใช้ต่อได้: ไม่มีใครเขียนตราการข้าม ⇒ D1 ไม่มีทางเข้า · trigger ไม่มีอะไรให้ล้าง ⇒ ไม่ต้อง freeze)
--      ⚠️ ห้าม deploy ก่อนรัน — โค้ดรุ่นใหม่ select คอลัมน์ใหม่ที่หน้างานเข้าใหม่ของ TS = 500 · ปุ่มข้ามเรียก RPC ที่ยังไม่มี
--   3) CI rerun (check:columns เขียวแล้ว) → merge → Deploy to production → curl /api/version ตรง sha
--   4) UAT อ่านอย่างเดียวก่อน · การกดข้ามจริงบน prod ต้องได้คำยืนยันจากเจ้าของทีละใบ (dev DB = prod DB)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: cols = 3 · chk = 1 · trg = 1 · fns = 2 · d1 = 1 · p1 = 1 · anon_submit = f · svc_submit = t · deferred = 0
--        (deferred โตหลังฝ่ายขายกดข้ามใบแรก — ข้อมูลประกอบ ไม่ใช่เกณฑ์)
--
--   SELECT
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders'
--      AND column_name LIKE 'serviceSetupDeferred%') AS cols,
--    (SELECT count(*) FROM pg_constraint WHERE conname = 'sales_orders_service_setup_defer_shape') AS chk,
--    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'sales_orders_service_defer_clear_trg') AS trg,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname IN ('submit_sales_order_deferring_service_setup', 'sales_order_service_defer_clear')) AS fns,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'sales_order_open_service_terms' AND strpos(p.prosrc, '0404/D1 ▶') > 0) AS d1,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'approve_sales_order_with_signature_evidence_atomic' AND strpos(p.prosrc, 'sales_order_open_service_terms(') > 0
--      AND strpos(p.prosrc, '0404') = 0) AS p1,
--    has_function_privilege('anon', 'public.submit_sales_order_deferring_service_setup(text,text,timestamptz,text,text,text,text,text)', 'EXECUTE') AS anon_submit,
--    has_function_privilege('service_role', 'public.submit_sales_order_deferring_service_setup(text,text,timestamptz,text,text,text,text,text)', 'EXECUTE') AS svc_submit,
--    (SELECT count(*) FROM public.sales_orders WHERE "serviceSetupDeferredAt" IS NOT NULL) AS deferred;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อนเสมอ (โค้ดรุ่นใหม่ select คอลัมน์ใหม่ — ลบคอลัมน์ใต้โค้ดที่รันอยู่ = 500) แล้วค่อยทำตามลำดับ:
--   1) ถอดแพตช์ D1 ออกจากตัวเปิดรอบขาย (เนื้อกลับเท่าก่อน 0404 ตรงตัว):
--      DO $undo$
--      DECLARE v_oid oid; v_def text; v_hits integer;
--      BEGIN
--        SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public' AND p.proname = 'sales_order_open_service_terms';
--        v_def := pg_get_functiondef(v_oid);
--        SELECT count(*) INTO v_hits FROM regexp_matches(v_def, $u$\n[ \t]*-- 0404/D1 ▶.*-- 0404/D1 ◀$u$, 'g');
--        IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0404 hits=%', v_hits; END IF;
--        EXECUTE regexp_replace(v_def, $u$\n[ \t]*-- 0404/D1 ▶.*-- 0404/D1 ◀$u$, '');
--      END $undo$;
--   2) DROP FUNCTION public.submit_sales_order_deferring_service_setup(text, text, timestamptz, text, text, text, text, text);
--      DROP TRIGGER sales_orders_service_defer_clear_trg ON public.sales_orders;
--      DROP FUNCTION public.sales_order_service_defer_clear();
--      ALTER TABLE public.sales_orders DROP CONSTRAINT sales_orders_service_setup_defer_shape,
--        DROP COLUMN "serviceSetupDeferredAt", DROP COLUMN "serviceSetupDeferredById", DROP COLUMN "serviceSetupDeferredByName";
--      NOTIFY pgrst, 'reload schema';
--   ผลต่อข้อมูล: ใบที่อนุมัติแบบข้ามแล้วยังไม่ประทับ = ใบในเส้นตั้งย้อนหลังธรรมดา (เสียแค่ป้าย "ข้ามตอนยื่น") ·
--     ใบที่ **รออนุมัติอยู่** ด้วยตราการข้าม จะอนุมัติไม่ผ่าน (งานบริการไม่ครบ) จนกว่าจะตีกลับ/ดึงกลับแล้วตั้งให้ครบ — จดเลขใบจาก
--     SELECT "orderNumber" FROM public.sales_orders WHERE "serviceSetupDeferredAt" IS NOT NULL AND status = 'pending_approval' ก่อนถอย
--   ⛔ ห้ามรัน 0392 ซ้ำหลังไฟล์นี้ (0392 เขียนทับตัวเปิดรอบขายกลับเป็นของเดิม — P8 และ D1 หาย) · ถ้าจำเป็น: 0392 → 0394 → 0400 → ไฟล์นี้
--     (รัน 0394/0396/0400 ซ้ำหลังไฟล์นี้ได้ — ไม่มีตัวไหนเขียนทับตัวเปิดรอบขาย)
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE ของใหม่สองตัว ·
--     แถวปะที่มีป้ายแล้วถูกข้าม ("ปะไว้แล้ว")
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0404 (นอก repo · mockups/so-service-lines/pglite-harness) — โหลด 0389/0390 · 0392–0396 · 0400
--     จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + รอบสามบนฐานที่มีข้อมูล · ทั้งเส้นในนาม service_role · บล็อกถอยกลับข้างบนลองจริงแล้ว
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน + ลายนิ้วมือของที่ต้องไม่แตะ ────────────────────────────────────────────
DO $pre$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = ANY (ARRAY[
       'approve_sales_order_with_signature_evidence_atomic', 'submit_sales_order_with_signature_evidence_atomic',
       'withdraw_sales_order_submission_atomic', 'revise_approved_sales_order_atomic', 'approve_historical_sales_order',
       'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
       'reject_sales_order_service_setup', 'save_sales_order_service_setup', 'sales_order_service_setup_editable',
       'sales_order_service_setup_errors', 'sales_order_service_setup_guard', 'sales_order_copy_service_setup',
       'sales_order_line_service_role', 'sales_order_business_line', 'reopen_sales_order_service_setup',
       'sales_order_service_reopen_blockers', 'is_sales_keyer_role']);
  IF v_n <> 19
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'approve_sales_order_with_signature_evidence_atomic'
          AND strpos(p.prosrc, 'sales_order_open_service_terms(') > 0)
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sales_order_open_service_terms'
          AND strpos(p.prosrc, '0394/P8') > 0)
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sales_order_service_setup_errors'
          AND strpos(p.prosrc, '0400/L1') > 0) THEN
    RAISE EXCEPTION 'mig_0404_needs_0400 — รัน 0392 · 0394 · 0396 · 0400 ก่อน (เจอ % จาก 19 ฟังก์ชัน)', v_n;
  END IF;

  -- ลายนิ้วมือของ 17 ฟังก์ชันที่ไฟล์นี้ต้องไม่แตะ — เก็บในตัวแปรของทรานแซกชัน (ตายตอน COMMIT/ROLLBACK) · §6 เทียบ
  PERFORM set_config('mig_0404.untouched', (
    SELECT jsonb_object_agg(p.proname, md5(p.prosrc))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY[
         'approve_sales_order_with_signature_evidence_atomic', 'submit_sales_order_with_signature_evidence_atomic',
         'withdraw_sales_order_submission_atomic', 'revise_approved_sales_order_atomic', 'approve_historical_sales_order',
         'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
         'reject_sales_order_service_setup', 'save_sales_order_service_setup', 'sales_order_service_setup_editable',
         'sales_order_service_setup_errors', 'sales_order_service_setup_guard', 'sales_order_copy_service_setup',
         'sales_order_line_service_role', 'sales_order_business_line', 'reopen_sales_order_service_setup',
         'sales_order_service_reopen_blockers'])
  ), true);
END
$pre$;

-- ── §1 sales_orders: ใคร/เมื่อไร ที่เลือกยื่นโดยยังไม่ตั้งงานบริการ ─────────────────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวชั้นนอก — serviceRoundsCopyPaths.test.mjs เก็บคอลัมน์จากรูปประโยคนี้
--    แล้วบังคับให้ทุกตัวถูกตัดสินว่าทาง Rev./ใบร่างพาไปหรือไม่ (ทั้งสองทาง = ไม่พา)
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "serviceSetupDeferredAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "serviceSetupDeferredById" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupDeferredByName" text;

-- ว่างครบทั้งสาม หรือ มีเวลา ∧ ใบ pipeline ∧ ใบถูกยื่นไปแล้ว (ร่าง/ตีกลับ ห้ามมีตรา — trigger ของ §2 ล้างให้ก่อนถึง CHECK)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_setup_defer_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_service_setup_defer_shape CHECK (
    ("serviceSetupDeferredAt" IS NULL
       AND "serviceSetupDeferredById" IS NULL
       AND "serviceSetupDeferredByName" IS NULL)
    OR ("serviceSetupDeferredAt" IS NOT NULL
       AND origin = 'pipeline'
       AND status NOT IN ('draft', 'rejected'))
  );

COMMENT ON COLUMN public.sales_orders."serviceSetupDeferredAt" IS
  'เวลาที่ผู้ยื่นเลือก "ยื่นโดยยังไม่ตั้งงานบริการ" — อนุมัติแล้วไม่เปิดรอบขาย/ไม่ประทับ ถ้างานบริการยังไม่ครบ (ใบตกเข้าเส้นตั้งย้อนหลัง) · ล้างเมื่อใบกลับเป็นร่าง/ตีกลับ · คงไว้หลังอนุมัติเป็นประวัติ · ไม่ก๊อปไปใบ Rev. (0404)';
COMMENT ON COLUMN public.sales_orders."serviceSetupDeferredById" IS
  'ผู้ที่เลือกยื่นโดยยังไม่ตั้งงานบริการ (id บัญชี) — คู่กับ serviceSetupDeferredAt (0404)';
COMMENT ON COLUMN public.sales_orders."serviceSetupDeferredByName" IS
  'ชื่อผู้ที่เลือกยื่นโดยยังไม่ตั้งงานบริการ (snapshot ตอนกด) — คู่กับ serviceSetupDeferredAt (0404)';

-- ── §2 ใบกลับเป็นร่าง/ตีกลับ = ล้างตราการข้าม (ต้องเลือกข้ามใหม่ทุกครั้งที่ยื่น) ─────────────────────────────
-- แพตเทิร์นเดียวกับตัวล้างตัวชี้หลักฐานลายเซ็น (0126): BEFORE UPDATE OF status · แก้เฉพาะสามช่องของตัวเอง
CREATE OR REPLACE FUNCTION public.sales_order_service_defer_clear()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('draft', 'rejected') THEN
    NEW."serviceSetupDeferredAt" := NULL;
    NEW."serviceSetupDeferredById" := NULL;
    NEW."serviceSetupDeferredByName" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_service_defer_clear_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_service_defer_clear_trg
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW
WHEN (NEW.status IN ('draft', 'rejected'))
EXECUTE FUNCTION public.sales_order_service_defer_clear();

-- ── §3 ยื่นอนุมัติโดยยังไม่ตั้งงานบริการ (ตัวห่อของตัวยื่นเดิม — ลำดับพารามิเตอร์เท่ากับตัวยื่นเดิม) ──────────────────
-- route ตรวจสิทธิ์/ขอบเขตทีม + เจ้าของดีล + เอกสารยืนยันคำสั่งซื้อ + ข้อที่ข้ามไม่ได้ (งวด · วันวางบิล · กำหนดชำระ) ก่อนแล้ว
-- ที่นี่คือด่านสุดท้ายของสถานะ และเป็นที่เดียวที่เขียนตราการข้าม (ทรานแซกชันเดียวกับการยื่น)
CREATE OR REPLACE FUNCTION public.submit_sales_order_deferring_service_setup(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_errors text[];
  v_result jsonb;
BEGIN
  IF NOT public.is_sales_keyer_role(p_actor_role) THEN
    RAISE EXCEPTION 'service_setup_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF NOT (
    v_order.origin = 'pipeline'
    AND v_order.status IN ('draft', 'rejected')
    AND public.sales_order_business_line(v_order.id) IS NOT DISTINCT FROM 'SERVICE'
  ) THEN
    RAISE EXCEPTION 'service_setup_defer_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  -- ข้ามได้เฉพาะตอนที่งานบริการ "ยังไม่ครบ" จริง และใบมีรายการที่ต้องตั้ง (คู่กับ serviceSetupSkipState ฝั่ง JS ·
  -- เงื่อนไขรายการ = ตัวเดียวกับ nothing_to_edit ของ 0396 / serviceLineNeedsBackfill) ⇒ หลังอนุมัติใบเข้าเส้นตั้งย้อนหลังแน่นอน
  v_errors := public.sales_order_service_setup_errors(v_order.id);
  IF cardinality(v_errors) = 0
     OR NOT EXISTS (
       SELECT 1 FROM public.sales_order_lines l
        WHERE l."salesOrderId" = v_order.id
          AND (public.sales_order_line_service_role(NULL, l."fgCode", l."productId", l.metadata) IS DISTINCT FROM 'not_service'
               OR l."serviceKind" = 'package')
     ) THEN
    RAISE EXCEPTION 'service_setup_defer_nothing';
  END IF;

  -- ใบที่เคยเปิดงานให้ TS แล้วถูกยกเลิก → กู้คืนเป็นร่าง ยังมีรอบขาย (term) ของรอบก่อนค้างอยู่ — อนุมัติแบบข้ามแล้ว
  -- รอบขายเก่าจะกลับมามีผลกับ TS ทั้งที่ใบบอกว่ายังไม่ตั้ง ⇒ ใบแบบนี้ต้องตั้งให้ครบแล้วยื่นตามปกติ (ตัวเปิดรอบขายเก็บกวาดให้)
  IF EXISTS (SELECT 1 FROM public.service_zone_terms t WHERE t."salesOrderId" = v_order.id) THEN
    RAISE EXCEPTION 'service_setup_defer_terms_exist';
  END IF;

  -- ใบ Rev. ของใบที่ TS ยังเดินรอบบริการอยู่: ตัวเปิดรอบขายคือคนย้ายรอบของใบเดิมมาใบ Rev. — อนุมัติแบบข้ามไม่เรียกขั้นนั้น
  -- ⇒ รอบค้างบนใบที่ถูกแทนแล้ว และหน้างานเข้าใหม่ของ TS จะบอกว่า "ใบ Rev. ไม่มีไซต์นี้ — ปิดรอบ หรือนัดถอนเครื่อง" (ไม่จริง)
  -- ⇒ ใบแบบนี้ต้องตั้งให้ครบแล้วยื่นตามปกติ (เงื่อนไขเดียวกับตัวย้ายรอบของตัวเปิดรอบขาย: รอบของใบเดิมที่ยัง isActive)
  IF v_order."revisedFromId" IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.service_plans sp
                  WHERE sp."salesOrderId" = v_order."revisedFromId" AND sp."isActive") THEN
    RAISE EXCEPTION 'service_setup_defer_plans_running';
  END IF;

  -- ยื่นด้วยตัวยื่นเดิมทั้งตัว (ความครบของเอกสาร · หลักฐานลายเซ็นผู้จัดทำ · สถานะ · ผู้ยื่น · updatedAt) — ล้ม = ไม่มีอะไรถูกเขียน
  v_result := public.submit_sales_order_with_signature_evidence_atomic(
    p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team);

  -- ตราการข้าม — หลังยื่น (CHECK ห้ามตราบนร่าง/ตีกลับ) · "updatedAt" ไม่ขยับ (ค่าที่ตัวยื่นเดิมเพิ่งตั้ง = เวอร์ชันของการยื่น)
  UPDATE public.sales_orders SET
    "serviceSetupDeferredAt" = now(),
    "serviceSetupDeferredById" = p_actor_id,
    "serviceSetupDeferredByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), '')
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_set(v_result, '{document}', to_jsonb(v_order));
END;
$$;

-- ── §4 ปะตัวเปิดรอบขาย (ฟังก์ชันที่รันอยู่จริง = 0392 §7 + แพตช์ P8 ของ 0394) ────────────────────────────
-- ⚠️ ชื่อฟังก์ชันเขียนเป็นสตริงใน VALUES เท่านั้น (ดูหัวไฟล์) · anchor เป็น regex (ARE) ครั้งเดียวพอดีทั้งสองที่
-- D1: ข้อ "ไม่มีรอบขายของใบนี้ค้าง" = ตาข่ายของใบที่กู้คืนจากยกเลิก (ตัวห่อของ §3 ปฏิเสธไปแล้ว — ถึงนี่ได้ = ข้อมูลเปลี่ยนหลังยื่น)
--     ข้อ "ใบเดิมของใบ Rev. ไม่มีรอบบริการที่ยังเดิน" = ตาข่ายคู่กับ service_setup_defer_plans_running ของ §3 (เหตุเดียวกัน)
--     ⇒ ไม่เข้า D1 แล้วตกไป RAISE ตามเดิม (การอนุมัติถอย) ไม่ปล่อยให้รอบขายเก่ามีผลบนใบที่บอกว่ายังไม่ตั้ง
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
        $re$(IF cardinality\(v_errors\) > 0 THEN)(\s*RAISE EXCEPTION 'sales_order_service_setup_incomplete')$re$,
        $rp$\1
    -- 0404/D1 ▶ ผู้ยื่นเลือก "ยื่นโดยยังไม่ตั้งงานบริการ" (ตรา serviceSetupDeferredAt): การอนุมัติใบไม่เปิดรอบขาย ไม่ประทับตรา
    --   ใบตกเข้าเส้นตั้งย้อนหลัง (ยื่นตรวจงานบริการ → ผู้จัดการฝ่ายขายอนุมัติ) · ขั้นรอตรวจงานบริการ ('submitted') ไม่เข้าทางนี้
    IF v_order.origin = 'pipeline'
       AND v_order."serviceSetupDeferredAt" IS NOT NULL
       AND v_order."serviceSetupState" IS DISTINCT FROM 'submitted'
       AND NOT EXISTS (SELECT 1 FROM public.service_zone_terms dt WHERE dt."salesOrderId" = v_order.id)
       AND NOT (v_order."revisedFromId" IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.service_plans dp
                             WHERE dp."salesOrderId" = v_order."revisedFromId" AND dp."isActive")) THEN
      RETURN 0;
    END IF;
    -- 0404/D1 ◀\2$rp$,
        '0404/D1')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0404_patch_overload % count=%', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0404: % % — ปะไว้แล้ว', r.marker, r.fn;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0404_patch_anchor % % hits=%/%', r.marker, r.fn, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0404: % % — ปะแล้ว', r.marker, r.fn;
  END LOOP;
END
$patch$;

-- ── §5 สิทธิ์ (แพตเทิร์น 0336 — ลายเซ็นเต็มทุกบรรทัด) ─────────────────────────────────────
REVOKE ALL ON FUNCTION public.submit_sales_order_deferring_service_setup(text, text, timestamptz, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sales_order_deferring_service_setup(text, text, timestamptz, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_service_defer_clear() FROM PUBLIC, anon, authenticated, service_role;

-- ── §6 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  r record;
  v_n integer;
  v_src text;
  v_fn text;
  v_before jsonb := current_setting('mig_0404.untouched', true)::jsonb;
BEGIN
  -- 17 ฟังก์ชันที่ต้องไม่แตะ: ครบ และเนื้อเท่าต้นไฟล์ (ตัวอนุมัติใบ = ฟังก์ชันเงิน อยู่ในนี้)
  IF v_before IS NULL OR (SELECT count(*) FROM jsonb_object_keys(v_before)) <> 17 THEN
    RAISE EXCEPTION 'mig_0404_verify bodies';
  END IF;
  SELECT count(*) INTO v_n
    FROM jsonb_each_text(v_before) AS b(fn, h)
    LEFT JOIN (SELECT p.proname, md5(p.prosrc) AS h
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public') now_fn ON now_fn.proname = b.fn
   WHERE now_fn.h IS DISTINCT FROM b.h;
  IF v_n > 0 THEN RAISE EXCEPTION 'mig_0404_verify touched=%', v_n; END IF;

  -- ป้าย D1 ครั้งเดียวพอดี · ป้าย P8 ของ 0394 ยังอยู่ · ตัวเปิดรอบขายยัง RAISE ไม่ครบ + ประทับตราอยู่ที่เดิม
  FOR r IN
    SELECT * FROM (VALUES
      ('sales_order_open_service_terms', '0404/D1 ▶'), ('sales_order_open_service_terms', '0404/D1 ◀'),
      ('sales_order_open_service_terms', '0394/P8 ▶'), ('sales_order_open_service_terms', '0394/P8 ◀'),
      ('sales_order_open_service_terms', 'RAISE EXCEPTION ''sales_order_service_setup_incomplete'''),
      ('sales_order_open_service_terms', 'SET "serviceTermsOpenedAt" = now()')
    ) AS t(fn, needle)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    IF v_n IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'mig_0404_verify marker % in % = %', r.needle, r.fn, v_n;
    END IF;
  END LOOP;

  -- สิทธิ์: anon/authenticated ไม่มีทุกตัว · service_role เรียกตัวห่อ + ตัวเปิดรอบขายได้ · ฟังก์ชัน trigger ไม่มีใครเรียกตรง
  FOR r IN
    SELECT * FROM (VALUES
      ('public.submit_sales_order_deferring_service_setup(text,text,timestamptz,text,text,text,text,text)', true),
      ('public.sales_order_open_service_terms(text,text,text)', true),
      ('public.sales_order_service_defer_clear()', false)
    ) AS t(sig, service_role)
  LOOP
    v_fn := r.sig;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') IS DISTINCT FROM r.service_role THEN
      RAISE EXCEPTION 'mig_0404_verify grant %', v_fn;
    END IF;
  END LOOP;

  -- คอลัมน์ · CHECK · trigger
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name LIKE 'serviceSetupDeferred%';
  IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0404_verify columns=%', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_service_setup_defer_shape') THEN
    RAISE EXCEPTION 'mig_0404_verify check';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgname = 'sales_orders_service_defer_clear_trg'
     AND strpos(pg_get_triggerdef(t.oid), 'BEFORE UPDATE OF status') > 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0404_verify trigger=%', v_n; END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
