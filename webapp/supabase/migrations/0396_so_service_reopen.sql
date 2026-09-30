-- ============================================================
--  Migration 0396: SO บริการ — "แก้งานบริการ" หลังอนุมัติ (ถอนรอบขายจาก TS แล้วกลับเข้าเส้นตั้งย้อนหลังเดิม)
--                  (มติเจ้าของ 29/09 + คำตอบ §12 วันที่ 30/09 · แผน mockups/so-service-lines/IMPL_PLAN_REOPEN.md §3)
--
--  🐞 ของเดิม: ใบสั่งขายสายบริการที่อนุมัติแล้วและส่งงานให้ TS แล้ว (มีตรา serviceTermsOpenedAt) แก้งานบริการไม่ได้เลย
--     — ฝ่ายขายคีย์โซน/รอบละกี่แพ็ค/ช่วงบริการผิด (SO-26090247-0 "SA คีย์ผิด") ทางเดียวคือย้อนการอนุมัติแล้วออก Rev.
--     ซึ่งแตะเอกสาร/ยอด/งวดทั้งใบ ทั้งที่ผิดแค่ส่วนงานบริการ
--  ⭐ ของใหม่: ปุ่ม "แก้งานบริการ" (การ์ดงานบริการของหน้าใบสั่งขาย) → RPC ตัวเดียวในทรานแซกชันเดียว:
--     ลบรอบขาย (term 'SZT-S…') ของใบนี้ (audit ทีละแถว) · ล้างตรา + สถานะตั้งย้อนหลัง 11 ช่อง · จำว่าใคร/เมื่อไร/ทำไม
--     (4 ช่องใหม่) · ขยับ updatedAt ⇒ ใบตกเข้า **เส้นตั้งย้อนหลังเดิมของ 0392 ทุกตัว** (แก้ในตาราง → ยื่นตรวจ →
--     ผู้จัดการฝ่ายขายอนุมัติด้วย approve_sales_order_service_setup = เปิดรอบขายใหม่ + ประทับตราใหม่) ไม่มีเส้นใหม่
--     · TS เริ่มงานของใบนี้แล้ว = ปุ่มยังโชว์ กดแล้วบอกเหตุ (ตัวตรวจ sales_order_service_reopen_blockers ตัวเดียว
--       ที่ GET และ RPC ใช้ร่วมกัน) · ทางแก้ที่เหลือ = ย้อนการอนุมัติแล้วออก Rev. (เดิม)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านก่อนรัน (ต้องมีของ 0392 + service_visits."queuedAt" ของ 0302) · จดลายนิ้วมือ md5 ของ 11 ฟังก์ชันที่รันอยู่
--  §1 sales_orders + 4 ช่อง "serviceSetupReopened…" + CHECK sales_orders_service_setup_reopen_shape
--     (ว่างครบทั้งสี่ หรือ มีเวลา ∧ ใบ pipeline ∧ เหตุผล 10–500 ตัวอักษรหลัง btrim)
--     · คงไว้หลังอนุมัติใหม่ = "แก้ล่าสุด" (ประวัติเต็มอยู่ audit_logs) · ไม่ยกไปใบ Rev./ใบร่าง (JS: REVISION_RESETS/DRAFT_OWNED)
--  §2 sales_order_service_reopen_blockers(p_order_id text) RETURNS text[] — เหตุที่ห้ามเปิดแก้ ลำดับตายตัว:
--       plans_active:<n>      รอบบริการของใบนี้ที่ TS ตั้งแล้วและยังเดิน
--       visits_live:<n>       นัดจากรอบของใบนี้ (รอบใดก็ได้) ที่ไม่ใช่ cancelled/rescheduled
--       site_visits_open:<n>  นัดอื่นที่ไซต์ของรอบขายใบนี้ (นอกรอบ · รอบไม่ผูกใบ · รอบของใบอื่น) ที่สร้างหรือผ่านด่าน
--                             หลังตราแรกสุดของสาย Rev. (ใบนี้ + ใบเดิมทุกรุ่น) · ไม่ใช่ cancelled/rescheduled
--                             · ไม่ใช่ survey/remove (GATE_EXEMPT_KINDS)
--       ml_set:<n>            term SZT-S ของใบนี้ที่มีมาตรฐาน มล. (TS ตั้งเอง PR-C #1854 หรือยกมาจากใบเดิมของ Rev.)
--                             — ถอนแล้วค่าหาย: ตัวยก ml ของ 0392 มองย้อนรุ่นเดียว ใบ Rev. ถัดไปยกจาก term ที่ถูกลบไม่ได้
--       legacy_terms:<n>      term ของใบนี้ที่ไม่ได้เกิดจากการตั้งงานบริการ (id ไม่ขึ้นต้น 'SZT-S') — ไม่ควรมี (D29)
--       nothing_to_edit       ไม่มีบรรทัดที่ serviceLineNeedsBackfill (คู่กับ JS) — กันแข่งกับการซ่อนปุ่ม
--     ใบไม่มีจริง / ไม่ใช่ pipeline = '{}' (ผู้เรียกตรวจสถานะเอง) · รหัส money_fn / unread เป็นของ JS ล้วน
--  §3 reopen_sales_order_service_setup(p_order_id, p_expected_updated_at, p_reason, p_actor_id, p_actor_name, p_actor_role)
--     RETURNS jsonb { order, termsRemoved } — ลำดับในทรานแซกชันเดียว:
--       สิทธิ์ (is_sales_keyer_role) → ล็อกแถวใบ → สถานะ → updatedAt → เหตุผล (ถูกปฏิเสธไม่ต้องรอล็อกตาราง)
--       → LOCK TABLE service_plans, service_visits IN SHARE MODE + ล็อกแถว term ของใบนี้ (ทางตั้ง ml ของ TS ไม่ล็อกใบ)
--         · รอเกิน lock_timeout 5s (ค่าของฟังก์ชัน) = service_setup_reopen_busy
--       → ตัวตรวจ §2 (snapshot ใหม่หลังได้ล็อก) → audit + ลบ term 'SZT-S…' → ห้ามเหลือ term → UPDATE ใบ → audit ใบ
--  §4 สิทธิ์: REVOKE PUBLIC/anon/authenticated · GRANT EXECUTE service_role (ลายเซ็นเต็ม · แพตเทิร์น 0336)
--  §5 ตรวจท้าย: 11 ฟังก์ชันเดิมเนื้อไม่เปลี่ยน (md5) · สิทธิ์ · 4 ช่อง · CHECK · lock_timeout ของ RPC
--
--  ⛔ ไม่แตะ: ฟังก์ชันที่รันอยู่ทุกตัว (ไม่มี CREATE OR REPLACE ของของเดิม · ตรวจท้ายเทียบ md5) · บรรทัด · โซนของบรรทัด
--     · ช่วงบริการ · serviceRounds · status · approvedAt · approvalFingerprint · ยอด · Actual · งวดชำระ · ฉบับตรึง
--     ⇒ trigger ของ sales_orders ไม่มีตัวไหนยิง (Actual 0279 ดู status/actualAmount/orderDate/approvedAt/dealId ·
--       เจ้าของ 0294/ลายเซ็น 0126 ดู status · origin 0360 · ช่วงบริการ 0392 ดู period) · ไม่มี FK ชี้มาที่ service_zone_terms
--  ⛔ ไม่ backfill — นอกตัวฟังก์ชันมีแค่ ALTER/COMMENT/SELECT ของด่าน · SO-26090247-0 ถูกเปิดแก้ด้วย datafix ครั้งเดียวไปแล้ว
--     30/09 (actorId 'datafix-so247-reopen') · 4 ช่องใหม่ของใบนั้นว่าง = ถูกต้อง (จอเห็นเป็นเส้นตั้งย้อนหลังธรรมดา)
--  🪤 ไฟล์นี้ไม่มีคำว่า FUNCTION ตามด้วย public. + ชื่อฟังก์ชันที่รันอยู่ (แม้ในคอมเมนต์) — ยาม "นิยามล่าสุด" ของหลายเทสต์
--     หาเจ้าของนิยามด้วยข้อความนั้น · อ้างถึงด้วยชื่อเปล่าหรือ p.proname = '…' เท่านั้น
--
--  ── รหัสผิดพลาด (สัญญากับ SERVICE_SETUP_SQL_MESSAGES ฝั่ง JS) ─────────────────────────────────────
--   service_setup_forbidden (403) · sales_order_not_found (404) · workflow_stale (409) · workflow_reason_invalid (400)
--   service_setup_reopen_state_invalid (409)  ไม่ใช่ใบ pipeline / ไม่ approved / ถูกแทนแล้ว / ยังไม่มีตรา / ไม่ใช่สาย SERVICE
--   service_setup_reopen_blocked (409)        DETAIL = รหัสของ §2 คั่นจุลภาค (route แปลเป็นข้อความรายข้อ)
--   service_setup_reopen_busy (409)           รอล็อกตารางรอบ/นัด หรือแถว term เกิน 5 วินาที
--   (รอล็อกแถวใบเกิน 5 วินาที = 55P03 ดิบ → route ตอบ 500 ข้อความกลาง · เกิดได้เฉพาะชนกับการเขียนใบเดียวกัน)
--
--  ── คอลัมน์ใหม่ (check:columns แดงเฉพาะชื่อเหล่านี้จนกว่าจะรัน — อย่างอื่นแดง = บั๊กจริง) ─────────────────────
--   sales_orders."serviceSetupReopenedAt" / "serviceSetupReopenedById" / "serviceSetupReopenedByName" / "serviceSetupReopenedReason"
--
--  ── ลำดับ deploy (แผน §11) ──────────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่องเขียว (test · TZ=UTC test · build · gates) · ฮาร์เนส PGlite ผ่านสองรอบผลเหมือนกัน · rebase บน main ล่าสุด
--   1) ตรวจเลข migration ซ้ำอีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0396
--   2) เจ้าของรันไฟล์นี้ที่ SQL Editor (DDL เติมอย่างเดียว · ยังไม่มีใครเรียก ⇒ ไม่ต้อง freeze) แล้วรัน SELECT ตรวจข้างล่าง
--   3) CI rerun (check:columns เขียวแล้ว) → merge → Deploy to production → curl /api/version ตรง sha
--   4) UAT อ่านอย่างเดียวก่อน · การกดจริงบน prod ต้องได้คำยืนยันจากเจ้าของทีละครั้ง
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: fns = 2 · anon_reopen = f · cols = 4 · reopened = 0 · so247_blockers = {}
--        (ใบนั้นถูกเปิดแก้ด้วย datafix 30/09 — ถ้าอนุมัติงานบริการใหม่แล้วและ TS เริ่มงาน จะเห็นรหัสงาน TS แทน = ข้อมูลประกอบ ไม่ใช่เกณฑ์)
--
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname IN ('reopen_sales_order_service_setup', 'sales_order_service_reopen_blockers')) AS fns,
--    has_function_privilege('anon', 'public.reopen_sales_order_service_setup(text,timestamptz,text,text,text,text)', 'EXECUTE') AS anon_reopen,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders'
--      AND column_name LIKE 'serviceSetupReopened%') AS cols,
--    (SELECT count(*) FROM public.sales_orders WHERE "serviceSetupReopenedAt" IS NOT NULL) AS reopened,
--    public.sales_order_service_reopen_blockers(
--      (SELECT id FROM public.sales_orders WHERE "orderNumber" = 'SO-26090247-0')) AS so247_blockers;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อนเสมอ (route intake + zoneSalesRepo select ช่องใหม่ — ลบช่องใต้โค้ดที่รันอยู่ = 500) แล้วค่อยรัน:
--      DROP FUNCTION public.reopen_sales_order_service_setup(text, timestamptz, text, text, text, text);
--      DROP FUNCTION public.sales_order_service_reopen_blockers(text);
--      ALTER TABLE public.sales_orders DROP CONSTRAINT sales_orders_service_setup_reopen_shape,
--        DROP COLUMN "serviceSetupReopenedAt", DROP COLUMN "serviceSetupReopenedById",
--        DROP COLUMN "serviceSetupReopenedByName", DROP COLUMN "serviceSetupReopenedReason";
--      NOTIFY pgrst, 'reload schema';
--   ปลอดภัยทุกเวลาในแง่ข้อมูล: ใบที่ค้างเปิดแก้อยู่ = ใบในเส้นตั้งย้อนหลังธรรมดา (เสียแค่ป้าย + เหตุผล · audit ยังมีครบ)
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE ของใหม่สองตัว
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0396 (นอก repo · mockups/so-service-lines/pglite-harness) — โหลด 0389/0390 · 0392–0395
--     จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + รอบสามบนฐานที่มีข้อมูล · ทั้งเส้นในนาม service_role · บล็อกถอยกลับข้างบนลองจริงแล้ว
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน ──────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'approve_sales_order_service_setup')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'sales_order_line_service_role')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'sales_order_business_line')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'is_sales_keyer_role')
     OR to_regclass('public.sales_order_line_zones') IS NULL
     OR to_regclass('public.service_visits') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'service_visits' AND column_name = 'queuedAt') THEN
    RAISE EXCEPTION 'mig_0396_needs_0392 — รัน 0392 ก่อน (และต้องมี service_visits."queuedAt" ของ 0302)';
  END IF;
END
$pre$;

-- ร่องรอยว่าไม่ปะของที่รันอยู่ — เทียบท้ายไฟล์ (§5) · ตายไปกับทรานแซกชัน
CREATE TEMP TABLE _mig_0396_bodies ON COMMIT DROP AS
SELECT p.oid, p.proname, md5(p.prosrc) AS h
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = ANY (ARRAY[
     'approve_sales_order_with_signature_evidence_atomic', 'revise_approved_sales_order_atomic',
     'sales_order_open_service_terms', 'approve_sales_order_service_setup', 'submit_sales_order_service_setup',
     'reject_sales_order_service_setup', 'save_sales_order_service_setup', 'sales_order_service_setup_editable',
     'sales_order_service_setup_errors', 'sales_order_service_setup_guard', 'sales_order_copy_service_setup']);

-- ── §1 sales_orders: ใคร/เมื่อไร/ทำไม ที่เปิดแก้งานบริการหลังอนุมัติ ─────────────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวชั้นนอก — serviceRoundsCopyPaths.test.mjs เก็บคอลัมน์จากรูปประโยคนี้
--    แล้วบังคับให้ทุกตัวถูกตัดสินว่าทาง Rev./ใบร่างพาไปหรือไม่
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "serviceSetupReopenedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "serviceSetupReopenedById" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupReopenedByName" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupReopenedReason" text;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_setup_reopen_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_service_setup_reopen_shape CHECK (
    ("serviceSetupReopenedAt" IS NULL
       AND "serviceSetupReopenedById" IS NULL
       AND "serviceSetupReopenedByName" IS NULL
       AND "serviceSetupReopenedReason" IS NULL)
    OR ("serviceSetupReopenedAt" IS NOT NULL
       AND origin = 'pipeline'
       AND length(btrim(COALESCE("serviceSetupReopenedReason", ''))) BETWEEN 10 AND 500)
  );

COMMENT ON COLUMN public.sales_orders."serviceSetupReopenedAt" IS
  'เวลาที่ฝ่ายขายเปิดแก้งานบริการหลังอนุมัติ (ถอนรอบขายจาก TS แล้วกลับเข้าเส้นตั้งย้อนหลัง) — คงไว้หลังอนุมัติใหม่เป็น "แก้ล่าสุด" · มีความหมายเฉพาะตอนใบยังไม่ประทับ · ไม่ก๊อปไปใบ Rev. (0396)';
COMMENT ON COLUMN public.sales_orders."serviceSetupReopenedById" IS
  'ผู้เปิดแก้งานบริการหลังอนุมัติครั้งล่าสุด (id บัญชี) — คู่กับ serviceSetupReopenedAt (0396)';
COMMENT ON COLUMN public.sales_orders."serviceSetupReopenedByName" IS
  'ชื่อผู้เปิดแก้งานบริการหลังอนุมัติครั้งล่าสุด (snapshot ตอนกด) — คู่กับ serviceSetupReopenedAt (0396)';
COMMENT ON COLUMN public.sales_orders."serviceSetupReopenedReason" IS
  'เหตุที่เปิดแก้งานบริการหลังอนุมัติ 10–500 ตัวอักษร — ผู้จัดการฝ่ายขายเห็นตอนตรวจ · ประวัติเต็มอยู่ audit_logs (0396)';

-- ── §2 เหตุที่ห้ามเปิดแก้ — ตัวเดียวของ GET (แสดงเหตุ) และ RPC (ตัดสินจริง) ─────────────────────────
-- รหัส '<ชนิด>:<จำนวน>' หรือ 'nothing_to_edit' ลำดับตายตัว · ใบไม่มีจริง/ไม่ใช่ pipeline = '{}' (ผู้เรียกตรวจสถานะก่อน)
CREATE OR REPLACE FUNCTION public.sales_order_service_reopen_blockers(p_order_id text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_codes text[] := '{}';
  v_n integer;
  v_since timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  IF NOT (v_order.origin = 'pipeline') THEN RETURN '{}'; END IF;

  -- (a) รอบบริการที่ TS ตั้งแล้วและยังเดิน
  SELECT count(*) INTO v_n FROM public.service_plans sp
   WHERE sp."salesOrderId" = v_order.id AND sp."isActive";
  IF v_n > 0 THEN v_codes := v_codes || ('plans_active:' || v_n); END IF;

  -- (b) นัดจากรอบของใบนี้ (รอบใดก็ได้ — รอบที่ปิดแล้วแต่มีประวัตินัดก็นับ) · rescheduled = แถวประวัติ ไม่นับ
  SELECT count(*) INTO v_n FROM public.service_visits v
    JOIN public.service_plans sp ON sp.id = v."planId"
   WHERE sp."salesOrderId" = v_order.id AND v.status NOT IN ('cancelled', 'rescheduled');
  IF v_n > 0 THEN v_codes := v_codes || ('visits_live:' || v_n); END IF;

  -- (c) นัดอื่นที่ไซต์ของรอบขายใบนี้ (นอกรอบ · รอบที่ไม่ผูกใบ · รอบของใบอื่น) ที่สร้างหรือผ่านด่านหลังส่ง TS
  --     ด่านนัดประเมินราย (นัด × โซน) ทุกโซนของไซต์ และคำนวณสด (visitGate) ⇒ ถอน term = โซนของใบนี้กลายเป็น "ไม่มีรอบขาย" บนนัดพวกนี้
  --     rescheduled = แถวประวัติของนัดที่ถูกเลื่อน (ตัวใหม่พกสถานะจริง) · survey/remove ข้ามด่านสัญญา (GATE_EXEMPT_KINDS)
  --     นัดบนรอบของใบนี้นับที่ (b) แล้ว — ไม่นับซ้ำ
  --     "หลังส่ง TS" = ตราแรกสุดของ **สาย Rev.** (ใบนี้ + ใบเดิมทุกรุ่นตาม revisedFromId) ไม่ใช่ตราของใบนี้ใบเดียว —
  --     ด่านนัดไม่ดูใบที่ถูกแทนแล้ว ⇒ นัดที่ TS สร้างสมัยใบเดิมที่ไซต์เดียวกันพึ่ง term ของใบ Rev. นี้อยู่ (ตรวจทาน sql-2)
  IF v_order."serviceTermsOpenedAt" IS NOT NULL THEN
    WITH RECURSIVE rev_chain AS (
      SELECT o.id, o."revisedFromId", o."serviceTermsOpenedAt" FROM public.sales_orders o WHERE o.id = v_order.id
      UNION
      SELECT p.id, p."revisedFromId", p."serviceTermsOpenedAt"
        FROM public.sales_orders p JOIN rev_chain c ON p.id = c."revisedFromId"
    )
    SELECT min(c."serviceTermsOpenedAt") INTO v_since FROM rev_chain c;
    SELECT count(*) INTO v_n FROM public.service_visits v
     WHERE v.status NOT IN ('cancelled', 'rescheduled')
       AND v.kind NOT IN ('survey', 'remove')
       AND (v."createdAt" >= v_since OR v."queuedAt" >= v_since)
       AND v."siteId" IN (SELECT z."siteId" FROM public.service_zone_terms t
                            JOIN public.service_zones z ON z.id = t."zoneId"
                           WHERE t."salesOrderId" = v_order.id)
       AND NOT EXISTS (SELECT 1 FROM public.service_plans sp
                        WHERE sp.id = v."planId" AND sp."salesOrderId" = v_order.id);
    IF v_n > 0 THEN v_codes := v_codes || ('site_visits_open:' || v_n); END IF;
  END IF;

  -- (d) มาตรฐาน มล. บนรอบขาย (SZT-S) ของใบนี้ — TS ตั้งเอง (PR-C) หรือยกมาจากใบเดิมตอนอนุมัติ Rev. ก็นับ:
  --     ถอน term = ค่านี้เหลือแค่ใน audit · ตัวยก ml ของการเปิดรอบขาย (0392 §7) มองย้อนแค่ใบเดิมรุ่นเดียว ⇒ ถ้าเปิดแก้แล้ว
  --     ผู้ใช้เลือกทาง Rev. ต่อ (ย้อนการอนุมัติ → Rev. ถัดไป) ใบถัดไปยกจาก term ของใบนี้ที่ถูกลบแล้ว = ค่าหายเงียบ
  --     ⇒ ไม่ยกเว้นค่าที่ "อนุมัติใหม่จะยกกลับมาเอง" (ตรวจทาน sql-1) · ทางออกคือ Rev. ซึ่งพา ml ไปด้วย
  SELECT count(*) INTO v_n FROM public.service_zone_terms t
   WHERE t."salesOrderId" = v_order.id
     AND t.id LIKE 'SZT-S%'
     AND t."standardMlPerMonth" IS NOT NULL;
  IF v_n > 0 THEN v_codes := v_codes || ('ml_set:' || v_n); END IF;

  -- (e) term ที่ไม่ได้เกิดจากการตั้งงานบริการ (D29) — ห้ามลบของที่ไฟล์ 0392 ไม่ได้สร้าง
  SELECT count(*) INTO v_n FROM public.service_zone_terms t
   WHERE t."salesOrderId" = v_order.id AND t.id NOT LIKE 'SZT-S%';
  IF v_n > 0 THEN v_codes := v_codes || ('legacy_terms:' || v_n); END IF;

  -- (f) ไม่มีอะไรให้แก้ — คู่กับ serviceLineNeedsBackfill ฝั่ง JS
  --     (ชนิดที่ตัดสินได้เองไม่ใช่ not_service หรือเก็บ package ไว้)
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_order_lines l
     WHERE l."salesOrderId" = v_order.id
       AND (public.sales_order_line_service_role(NULL, l."fgCode", l."productId", l.metadata) IS DISTINCT FROM 'not_service'
            OR l."serviceKind" = 'package')
  ) THEN
    v_codes := v_codes || 'nothing_to_edit'::text;
  END IF;

  RETURN v_codes;
END;
$$;

-- ── §3 เปิดแก้งานบริการหลังอนุมัติ ──────────────────────────────────────────────────────────
-- ลำดับพารามิเตอร์เท่ากับตัวตีกลับงานบริการของ 0392 · ไม่เขียน audit ซ้ำที่ route (ฐานเขียนในทรานแซกชันเดียวกับการแก้)
CREATE OR REPLACE FUNCTION public.reopen_sales_order_service_setup(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
SET lock_timeout = '5s'
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_before public.sales_orders%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_actor_name text := NULLIF(btrim(COALESCE(p_actor_name, '')), '');
  v_blockers text[];
  v_terms integer;
  v_now timestamptz := now();
  -- ช่องที่ UPDATE เขียน = สิ่งที่ audit ของใบต้องจำค่าเดิม (แถวเสียหลักฐานผู้อนุมัติ/ผู้ยื่นไป — audit คือสำเนาเดียว)
  v_keys text[] := ARRAY[
    'serviceTermsOpenedAt', 'serviceSetupState',
    'serviceSetupSubmittedAt', 'serviceSetupSubmittedById', 'serviceSetupSubmittedByName',
    'serviceSetupRejectedAt', 'serviceSetupRejectedById', 'serviceSetupRejectedByName', 'serviceSetupRejectedReason',
    'serviceSetupApprovedAt', 'serviceSetupApprovedById', 'serviceSetupApprovedByName',
    'serviceSetupReopenedAt', 'serviceSetupReopenedById', 'serviceSetupReopenedByName', 'serviceSetupReopenedReason',
    'updatedAt'];
  v_before_json jsonb;
  v_after_json jsonb;
BEGIN
  IF NOT public.is_sales_keyer_role(p_actor_role) THEN
    RAISE EXCEPTION 'service_setup_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  -- ใบ pipeline ที่อนุมัติแล้ว เปิดงานให้ TS แล้ว ยังไม่ถูกแทน และยังเป็นสาย SERVICE เท่านั้น
  -- (ใบย้อนหลังได้ตราผ่านตัวกลางตั้งแต่ 0394 แต่แก้ด้วยเส้นนี้ไม่ได้ — ไม่มีเส้นตั้งย้อนหลังให้กลับไป)
  IF NOT (
    v_order.origin = 'pipeline'
    AND v_order.status = 'approved'
    AND v_order."supersededById" IS NULL
    AND v_order."serviceTermsOpenedAt" IS NOT NULL
    AND public.sales_order_business_line(v_order.id) IS NOT DISTINCT FROM 'SERVICE'
  ) THEN
    RAISE EXCEPTION 'service_setup_reopen_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  -- ตัดช่องว่างก่อนนับ — CHECK ของตารางนับหลัง btrim · ไม่ตัดก่อน = เหตุผลที่เว้นวรรคหลุดเป็น 23514 ดิบ
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  -- กันแข่งกับ TS: ตั้งรอบ/สร้างนัดใหม่ระหว่างตรวจกับลบไม่ได้ (route ตั้งรอบไม่ได้ล็อกใบ) — ถือแค่ไม่กี่มิลลิวินาที
  -- รอเกิน lock_timeout (ฟังก์ชันตั้งไว้ 5s) = ตอบว่าระบบยุ่ง ไม่ให้คิวเขียนนัด/รอบทั้งระบบต่อแถวหลังคำขอนี้
  -- บล็อกย่อยสำเร็จ = ล็อกโอนให้ทรานแซกชันแม่ ถือถึง COMMIT
  BEGIN
    LOCK TABLE public.service_plans, public.service_visits IN SHARE MODE;
    -- แถว term ของใบนี้ — ทางตั้ง ml ของ TS (PR-C) ไม่ล็อกใบ ⇒ ล็อกแถวก่อนตรวจข้อ (d) แล้วค่อยลบ
    PERFORM 1 FROM public.service_zone_terms WHERE "salesOrderId" = v_order.id FOR UPDATE;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'service_setup_reopen_busy';
  END;

  -- snapshot ใหม่ของคำสั่งนี้ (หลังได้ล็อก) ⇒ เห็นทุกรอบ/นัดที่ commit ก่อนล็อก
  v_blockers := public.sales_order_service_reopen_blockers(v_order.id);
  IF cardinality(v_blockers) > 0 THEN
    RAISE EXCEPTION 'service_setup_reopen_blocked' USING DETAIL = array_to_string(v_blockers, ',');
  END IF;

  INSERT INTO public.audit_logs ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, before, "createdAt")
  SELECT p_actor_id, v_actor_name, p_actor_role, 'delete', 'service_zone_term', t.id,
         'ถอนรอบขายของ ' || v_order."orderNumber" || ' — เปิดแก้งานบริการหลังอนุมัติ (0396)',
         to_jsonb(t), v_now
    FROM public.service_zone_terms t
   WHERE t."salesOrderId" = v_order.id AND t.id LIKE 'SZT-S%';

  DELETE FROM public.service_zone_terms t
   WHERE t."salesOrderId" = v_order.id AND t.id LIKE 'SZT-S%';
  GET DIAGNOSTICS v_terms = ROW_COUNT;

  -- ตาข่ายชั้นสอง: ห้ามเหลือ term ใดของใบนี้ (ข้อ legacy_terms ตีกลับไปแล้ว — ถึงนี่ได้ = บั๊ก)
  IF EXISTS (SELECT 1 FROM public.service_zone_terms WHERE "salesOrderId" = v_order.id) THEN
    RAISE EXCEPTION 'service_setup_reopen_blocked' USING DETAIL = 'legacy_terms:1';
  END IF;

  v_before := v_order;
  -- ล้างตรา + สถานะตั้งย้อนหลัง 11 ช่อง (ApprovedAt/By เกิดคู่กับตราเสมอ · SubmittedById ต้องว่าง ⇒ ด่านแยกหน้าที่
  -- ตัดสินจากการยื่นรอบใหม่) · ไม่แตะ status / approvedAt / ยอด / งวด / บรรทัด / โซน / ช่วงบริการ
  UPDATE public.sales_orders SET
    "serviceTermsOpenedAt" = NULL,
    "serviceSetupState" = NULL,
    "serviceSetupSubmittedAt" = NULL, "serviceSetupSubmittedById" = NULL, "serviceSetupSubmittedByName" = NULL,
    "serviceSetupRejectedAt" = NULL, "serviceSetupRejectedById" = NULL, "serviceSetupRejectedByName" = NULL,
    "serviceSetupRejectedReason" = NULL,
    "serviceSetupApprovedAt" = NULL, "serviceSetupApprovedById" = NULL, "serviceSetupApprovedByName" = NULL,
    "serviceSetupReopenedAt" = v_now,
    "serviceSetupReopenedById" = p_actor_id,
    "serviceSetupReopenedByName" = v_actor_name,
    "serviceSetupReopenedReason" = v_reason,
    "updatedAt" = v_now
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  SELECT jsonb_object_agg(k, to_jsonb(v_before) -> k), jsonb_object_agg(k, to_jsonb(v_order) -> k)
    INTO v_before_json, v_after_json
    FROM unnest(v_keys) AS k;

  -- changedKeys = ช่องที่ค่าเปลี่ยนจริง (กติกาเดียวกับ recordAudit: ไม่นับ updatedAt/createdAt)
  INSERT INTO public.audit_logs ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary,
                                 "changedKeys", before, after, "createdAt")
  VALUES (
    p_actor_id, v_actor_name, p_actor_role, 'update', 'sales_order', v_order.id,
    'เปิดแก้งานบริการหลังอนุมัติ ' || v_order."orderNumber" || ' — ถอนรอบขาย ' || v_terms || ' แถวจาก TS: ' || v_reason || ' (0396)',
    (SELECT COALESCE(jsonb_agg(b.key ORDER BY b.key COLLATE "C"), '[]'::jsonb)
       FROM jsonb_each(v_before_json) AS b
      WHERE b.key NOT IN ('updatedAt', 'createdAt')
        AND b.value IS DISTINCT FROM v_after_json -> b.key),
    v_before_json,
    v_after_json || jsonb_build_object('termsRemoved', v_terms),
    v_now);

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'termsRemoved', v_terms);
END;
$$;

-- ── §4 สิทธิ์ (แพตเทิร์น 0336 — ลายเซ็นเต็มทุกบรรทัด) ─────────────────────────────────────
REVOKE ALL ON FUNCTION public.sales_order_service_reopen_blockers(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_service_reopen_blockers(text) TO service_role;
REVOKE ALL ON FUNCTION public.reopen_sales_order_service_setup(text, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_sales_order_service_setup(text, timestamptz, text, text, text, text) TO service_role;

-- ── §5 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  v_n integer;
  v_fn text;
BEGIN
  -- ของที่รันอยู่ต้องครบ 11 ตัวและเนื้อไม่เปลี่ยนตั้งแต่ต้นไฟล์
  SELECT count(*) INTO v_n FROM _mig_0396_bodies;
  IF v_n < 11 THEN RAISE EXCEPTION 'mig_0396_verify bodies=%', v_n; END IF;
  SELECT count(*) INTO v_n FROM _mig_0396_bodies b
    LEFT JOIN pg_proc p ON p.oid = b.oid
   WHERE p.oid IS NULL OR md5(p.prosrc) <> b.h;
  IF v_n > 0 THEN RAISE EXCEPTION 'mig_0396_verify touched=%', v_n; END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.sales_order_service_reopen_blockers(text)',
    'public.reopen_sales_order_service_setup(text,timestamptz,text,text,text,text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'mig_0396_verify grant %', v_fn;
    END IF;
  END LOOP;

  -- เพดานรอล็อกของ RPC (รอเกิน = service_setup_reopen_busy ไม่ใช่คิวเขียนนัดทั้งระบบ)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'reopen_sales_order_service_setup'
       AND 'lock_timeout=5s' = ANY (p.proconfig)
  ) THEN
    RAISE EXCEPTION 'mig_0396_verify lock_timeout';
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name LIKE 'serviceSetupReopened%';
  IF v_n <> 4 THEN RAISE EXCEPTION 'mig_0396_verify columns=%', v_n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_service_setup_reopen_shape') THEN
    RAISE EXCEPTION 'mig_0396_verify check';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
