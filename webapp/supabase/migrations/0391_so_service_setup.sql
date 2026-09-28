-- ============================================================
--  Migration 0391: SO บริการ — ฝ่ายขายตั้งงานบริการรายบรรทัดที่ใบสั่งขาย + ตั้งย้อนหลังบนใบที่อนุมัติแล้ว
--                  (PR-A · มติเจ้าของ 26/09 + คำตอบ B1–B4 วันที่ 28/09 · แผน IMPL_PLAN Rev. 2)
--
--  🐞 ของเดิม: ใบสั่งขายสายบริการอนุมัติแล้ว "ไม่มีใครรู้ว่าของไปตั้งที่ไหน" — TS ต้องเปิดใบไล่จับคู่บรรทัดกับโซน
--     เอง (ผูกโซน) ทั้งที่ฝ่ายขายเป็นคนเดียวที่รู้ว่าขายแพ็คเกจไหน ลงไซต์ไหน กี่แพ็คต่อรอบ กี่รอบ ช่วงไหน
--     · บรรทัด "พิมพ์เอง" ไม่มี fgCode ⇒ ระบบตอบไม่ได้ว่าเป็นแพ็คเกจบริการหรือค่าขนส่ง
--  ⭐ ของใหม่: ฝ่ายขายตั้งที่ตารางรายการของใบสั่งขาย → ผู้อนุมัติเห็นครบก่อนกด → อนุมัติ = เปิดรอบขาย (term)
--     ให้ TS ในทรานแซกชันเดียวกัน · TS ไม่ต้องผูกโซนอีก
--
--  ── ทำอะไร (D ตามแผน) ────────────────────────────────────────────────────
--  §1 sales_order_lines + "serviceKind" · "serviceProductId" · "serviceFgCode"
--     · ชนิดของบรรทัด (D2): ค่าที่เก็บ → FG ตามหมวด 02-001 → บรรทัดพิมพ์เองตาม metadata.categoryCode (#1844)
--       → ยังไม่เลือก · บรรทัด FG ห้ามเก็บชนิดเอง (CHECK) · บรรทัดพิมพ์เองที่เป็นแพ็คเกจเลือก FG หมวด 02-001 ได้ (D3)
--     · บรรทัดยังเป็น snapshot — ไม่แตะ fgCode/productId/qty/ราคา/คำอธิบาย/metadata ของบรรทัดเลย
--  §2 sales_orders + ช่วงบริการ 1 ช่วงต่อใบ (D6) · ตราเปิดงานบริการ "serviceTermsOpenedAt" · สถานะตั้งย้อนหลัง 11 ช่อง (D11)
--  §3 ตารางใหม่ sales_order_line_zones — 1 บรรทัด → N โซน · แพ็คต่อรอบรายโซน (D1)
--  §4–5 ตัวตัดสินกลาง: หมวดของ FG · สายธุรกิจของใบ · ชนิดบรรทัด · แก้ได้ไหม · รายการที่ยังขาด
--  §6 save_sales_order_service_setup — บันทึกทั้งชุด (ร่าง/ตีกลับ หรือใบเดิมที่ยังไม่ยื่นตรวจ) (D9)
--  §7 sales_order_open_service_terms — เปิดรอบขายตอนอนุมัติ: term = แพ็คต่อรอบของโซน หน่วย 'แพ็ค' แล้วตีตรา (D10)
--     · ไม่ครบ = RAISE ⇒ การอนุมัติถอยทั้งก้อน · ลบ term เก่าได้เฉพาะที่ไฟล์นี้สร้าง (id 'SZT-S…') (D29)
--     · ใบ Rev.: ยก ml จาก term ของใบเดิม (โซนเดียวกัน + quotationLineId เดียวกัน) · ย้ายรอบบริการของไซต์ที่ยังอยู่ (D16)
--  §8 sales_order_copy_service_setup — ออก Rev. ยกชนิด · แพ็คเกจ · ช่วงบริการ · โซน ไปใบ Rev. (ไม่ยกตรา/สถานะย้อนหลัง)
--  §9 ตั้งย้อนหลัง (D11/D12): submit → ผู้จัดการฝ่ายขาย approve / reject · **ไม่แตะ** สถานะใบ · approvedAt ·
--     ยอด · Actual · fingerprint · งวดชำระ · ฉบับตรึง — แค่เปิดรอบขาย + ตีตรา + หลักฐานผู้อนุมัติ
--  §10 trigger ล็อก 3 ตัว (ด่านชั้นที่สามต่อจาก JS และ RPC) — force delete (app.force_delete) และ cascade ผ่านได้
--  §12 ปะฟังก์ชันที่รันอยู่จริงสองตัว (pg_get_functiondef แบบ 0382/0385 — ไม่ก๊อปเนื้อทั้งตัวมาไว้ที่นี่):
--     P1 ฟังก์ชันอนุมัติใบสั่งขายด้วยหลักฐานลายเซ็น → เรียก sales_order_open_service_terms หลัง UPDATE อนุมัติ
--     P2 ฟังก์ชันออก Rev. ใบสั่งขาย → เรียก sales_order_copy_service_setup หลังก๊อปบรรทัด
--     · จุดปะต้องเจอครั้งเดียวพอดีทั้งใน prosrc และ pg_get_functiondef · ปะแล้ว = ข้าม (รันซ้ำได้)
--     · รายการคอลัมน์ INSERT ของ Rev. (0376) ไม่ถูกแตะ — ช่วงบริการไปทาง P2
--
--  ⛔ ไม่แตะ: trigger Actual (0279) · เจ้าของยอด (0294) · ฟังก์ชันย้อนการอนุมัติ · route ยกเลิก · ใบย้อนหลัง (historical)
--     · ใบ PRODUCT / ใบที่ไม่รู้สาย — ทุกตัวในไฟล์นี้ตอบ "ไม่เกี่ยว" ให้ใบเหล่านั้น
--  ⛔ ไม่ backfill — นอกตัวฟังก์ชันมีแค่ SELECT ของด่าน §0 และ §13
--  🔐 สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated ทุกตัว · GRANT service_role (route เรียกเท่านั้น)
--     · ฟังก์ชัน trigger REVOKE จาก service_role ด้วย (trigger ไม่ต้องใช้สิทธิ์ EXECUTE ตอนยิง)
--
--  ── คอลัมน์/ตารางใหม่ (check:columns แดงเฉพาะชื่อเหล่านี้จนกว่าจะรัน — อย่างอื่นแดง = บั๊กจริง) ──────────
--   sales_order_lines."serviceKind" / "serviceProductId" / "serviceFgCode"
--   sales_orders."servicePeriodFrom" / "servicePeriodTo" / "serviceTermsOpenedAt" / "serviceSetupState"
--     / "serviceSetupSubmittedAt" / "serviceSetupSubmittedById" / "serviceSetupSubmittedByName"
--     / "serviceSetupRejectedAt" / "serviceSetupRejectedById" / "serviceSetupRejectedByName" / "serviceSetupRejectedReason"
--     / "serviceSetupApprovedAt" / "serviceSetupApprovedById" / "serviceSetupApprovedByName"
--   ตาราง sales_order_line_zones
--
--  ── payload ของ save_sales_order_service_setup (สัญญากับ validateServiceSetupPatch ฝั่ง JS) ──────────
--   { "period": {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} | null,        -- ไม่มีคีย์ = ไม่เปลี่ยน · null = ล้าง
--     "lines": [ { "lineId": "SOL-…",
--                  "kind": "package" | "not_service" | null,          -- บรรทัด FG ห้ามส่งคีย์นี้
--                  "serviceProductId": "PRD-…" | null,                -- บรรทัด FG ห้ามส่งคีย์นี้ · ฐานเขียน serviceFgCode เอง
--                  "rounds": 1..999 | null,
--                  "zones": [ { "zoneId": "…", "packsPerRound": 1..9999 | null } ] } ] }   -- มีคีย์ = แทนทั้งชุดของบรรทัด
--   ทุกคีย์ของบรรทัดไม่มี = ไม่เปลี่ยน · บรรทัดที่ชนิดไม่ใช่แพ็คเกจ ⇒ ล้าง FG/รอบ/โซนของบรรทัดนั้น
--
--  ── ด่านก่อนรัน (§0 — RAISE แล้วทั้งไฟล์ถอย) ──────────────────────────────────────────────
--   mig_0391_orders_in_flight  (รันครั้งแรกเท่านั้น = ยังไม่มี P1) มีใบ pipeline สายบริการที่ "รออนุมัติ" ค้าง
--       ⇒ ใบพวกนั้นยื่นมาโดยไม่มีงานบริการ พออนุมัติหลังรันจะติด sales_order_service_setup_incomplete
--       ⇒ ให้ผู้ยื่นดึงกลับก่อน แล้วค่อยรัน
--   mig_0391_legacy_terms_exist (ทุกรอบ) มี term บนใบ pipeline ที่ไม่ได้เกิดจากไฟล์นี้ (id ไม่ขึ้นต้น 'SZT-S')
--       ⇒ รอบแรก: พิสูจน์ว่าไม่มีรอบขายเดิมให้ปกป้อง (วัด prod 28/09 = 0 term ทั้งระบบ)
--       ⇒ รอบซ้ำ: จับ term ที่ route ผูกโซนเดิมสร้างระหว่างรันถึง deploy (ช่วง freeze ควรทำให้เป็น 0)
--
--  ── ลำดับ deploy (D31 · แผน §3.5) ─────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่องเขียว (test · TZ=UTC test · build · gates) · ฮาร์เนส PGlite ผ่านสองรอบ · PR rebase บน main ล่าสุด
--   1) เก็บ baseline: node --import ./scripts/test-loader.mjs scripts/check-service-money-scope.mjs --save-baseline
--   2) เจ้าของประกาศ freeze ~30 นาที: ห้ามอนุมัติใบสายบริการ · TS ห้ามกด "ผูกโซน" · ห้ามแก้จำนวนรอบของใบรออนุมัติ/ย้อนแล้ว
--      (ช่วงนี้อนุมัติใบบริการจะ **ล้มและถอยทั้งก้อน** — JS เดิมแปลเป็น "บันทึกหลักฐานลายเซ็นไม่สำเร็จ")
--   3) รันไฟล์นี้ที่ SQL Editor แล้วรัน SELECT ตรวจข้างล่าง
--   4) ต่อกันทันที: CI rerun → merge → main CI → Deploy to production → curl /api/version ตรง sha
--   5) ยก freeze   6) check-service-money-scope.mjs --compare ต้องไม่มี FAIL · ตรวจซ้ำ · UAT
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: fg_rows = 0 · alloc_rows = 0 · stamped = 0 · p1 = 1 · p2 = 1 · anon_save = f · triggers = 3
--        · backfill_candidates ≈ 59 (ข้อมูลประกอบ ไม่ใช่เกณฑ์)
--
--   SELECT
--    (SELECT count(*) FROM public.sales_order_lines WHERE "serviceFgCode" IS NOT NULL)            AS fg_rows,
--    (SELECT count(*) FROM public.sales_order_line_zones)                                          AS alloc_rows,
--    (SELECT count(*) FROM public.sales_orders WHERE "serviceTermsOpenedAt" IS NOT NULL)          AS stamped,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
--       AND p.proname='approve_sales_order_with_signature_evidence_atomic' AND strpos(p.prosrc,'sales_order_open_service_terms(')>0) AS p1,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
--       AND p.proname='revise_approved_sales_order_atomic' AND strpos(p.prosrc,'sales_order_copy_service_setup(')>0) AS p2,
--    has_function_privilege('anon','public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)','EXECUTE') AS anon_save,
--    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
--      ('sales_order_line_zones_guard_trg','sales_order_lines_service_guard_trg','sales_orders_service_period_guard_trg')) AS triggers,
--    (SELECT count(*) FROM public.sales_orders o WHERE o.origin='pipeline' AND o.status='approved' AND o."supersededById" IS NULL
--       AND o."serviceTermsOpenedAt" IS NULL AND public.sales_order_business_line(o.id)='SERVICE') AS backfill_candidates;
--
--  ── ถอยกลับ (ใช้ได้เฉพาะตอน alloc_rows = 0 และ stamped = 0) ──────────────────────────────────
--   1) ถอด P1/P2 จากนิยามที่รันอยู่ — ปะแค่ "เติม" สามบรรทัด (P1) / สองบรรทัด (P2) ⇒ ลบบรรทัดที่เติมทิ้งก็คืนของเดิม
--      (บรรทัด SELECT … WHERE id = v_order.id; มีเฉพาะที่เติม — UPDATE เดิมจบด้วย RETURNING ไม่มี ; ต่อท้าย)
--      DO $undo$ DECLARE r record; v_oid oid; v_def text; BEGIN
--        FOR r IN SELECT * FROM (VALUES ('approve_sales_order_with_signature_evidence_atomic'),
--                                       ('revise_approved_sales_order_atomic')) AS t(fn) LOOP
--          SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--           WHERE n.nspname = 'public' AND p.proname = r.fn;
--          v_def := regexp_replace(pg_get_functiondef(v_oid),
--            '\n[^\n]*(-- 0391:|sales_order_open_service_terms\(|sales_order_copy_service_setup\(|WHERE id = v_order\.id;)[^\n]*',
--            '', 'g');
--          EXECUTE v_def;
--        END LOOP;
--      END $undo$;
--      แล้วตรวจ p1 = p2 = 0 (SELECT ตรวจข้างบน) · ฮาร์เนส PGlite ลองบล็อกนี้แล้ว (เนื้อฟังก์ชันกลับเท่าเดิม ยกเว้นบรรทัดว่าง)
--   2) DROP TRIGGER sales_order_line_zones_guard_trg ON public.sales_order_line_zones;
--      DROP TRIGGER sales_order_lines_service_guard_trg ON public.sales_order_lines;
--      DROP TRIGGER sales_orders_service_period_guard_trg ON public.sales_orders;
--   3) DROP FUNCTION ×12:
--      public.reject_sales_order_service_setup(text,timestamptz,text,text,text,text) ·
--      public.approve_sales_order_service_setup(text,timestamptz,text,text,text,text) ·
--      public.submit_sales_order_service_setup(text,timestamptz,text,text,text) ·
--      public.sales_order_copy_service_setup(text,text) · public.sales_order_open_service_terms(text,text,text) ·
--      public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text) ·
--      public.sales_order_service_setup_errors(text) · public.sales_order_service_setup_guard() ·
--      public.sales_order_service_setup_editable(text,text,timestamptz,text,text) ·
--      public.sales_order_line_service_role(text,text,text,jsonb) · public.sales_order_business_line(text) ·
--      public.fg_category_of(text)
--   4) DROP TABLE public.sales_order_line_zones   (FK · UNIQUE · index ไปด้วย)
--   5) ALTER TABLE public.sales_order_lines DROP CONSTRAINT sales_order_lines_service_product_fk,
--        DROP CONSTRAINT sales_order_lines_service_kind_check, DROP CONSTRAINT sales_order_lines_service_setup_shape,
--        DROP COLUMN "serviceKind", DROP COLUMN "serviceProductId", DROP COLUMN "serviceFgCode"
--   6) ALTER TABLE public.sales_orders DROP CONSTRAINT sales_orders_service_period_shape,
--        DROP CONSTRAINT sales_orders_service_setup_state_shape, DROP COLUMN ×14 (รายชื่อข้างบน)
--   7) DROP INDEX public.sales_order_lines_id_order_uk
--   8) คืนคอมเมนต์เดิม (คัดจาก 0326 · 0312):
--      COMMENT ON COLUMN public.sales_order_lines."serviceRounds" IS 'จำนวนรอบบริการที่ขายไว้ในบรรทัดนี้ — snapshot ที่ก๊อปมาจากบรรทัดใบเสนอราคา แก้ที่นี่ไม่ได้ (แก้ = ออก Rev. ที่ QT) · ข้อผูกพันอ้างอิง ไม่ได้บังคับจำนวนนัดที่ระบบสร้าง'
--      COMMENT ON COLUMN public.service_zone_terms."packageQty" IS 'จำนวนที่จัดสรรจากบรรทัดขายลงโซนนี้ (mig 0312) — ผลรวมทุกโซนของบรรทัดเดียวกันห้ามเกิน sales_order_lines.qty · ด่านอยู่ที่ API'
--
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE
--     · CREATE TABLE/INDEX IF NOT EXISTS · ปะแล้วถูกข้าม ("ปะไว้แล้ว") · ด่าน §0 ข้อแรกข้ามเมื่อมี P1 แล้ว
--  🧪 พิสูจน์บนฮาร์เนส PGlite (นอก repo · mockups/so-service-lines/pglite-harness) — 35 เคสของแผน §3.4 + เคสเสริม
--     (รันไฟล์นี้สองรอบก่อนทดสอบ · รอบสามบนฐานที่มีข้อมูล · บล็อกถอยกลับข้างบนลองจริงแล้ว · ทั้งเส้นในนาม service_role)
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน ──────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_n integer;
BEGIN
  -- รันครั้งแรก (ยังไม่มี P1): ห้ามมีใบสายบริการ "รออนุมัติ" ค้าง — สายธุรกิจ = โครงการก่อน แล้วดีล
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'approve_sales_order_with_signature_evidence_atomic'
       AND strpos(p.prosrc, 'sales_order_open_service_terms(') > 0
  ) THEN
    SELECT count(*) INTO v_n
      FROM public.sales_orders o
      LEFT JOIN public.projects pj ON pj.id = o."projectId"
      LEFT JOIN public.sales_deals d ON d.id = o."dealId"
     WHERE o.origin = 'pipeline'
       AND o.status = 'pending_approval'
       AND COALESCE(
             CASE WHEN pj.line IN ('PRODUCT', 'SERVICE') THEN pj.line END,
             CASE WHEN d.line IN ('PRODUCT', 'SERVICE') THEN d.line END
           ) = 'SERVICE';
    IF v_n > 0 THEN
      RAISE EXCEPTION 'mig_0391_orders_in_flight — ดึงกลับใบสายบริการที่รออนุมัติก่อนรัน (% ใบ)', v_n;
    END IF;
  END IF;

  -- ทุกรอบ: term บนใบ pipeline ต้องเกิดจากไฟล์นี้เท่านั้น ('SZT-S…')
  SELECT count(*) INTO v_n
    FROM public.service_zone_terms t
    JOIN public.sales_orders o ON o.id = t."salesOrderId"
   WHERE o.origin = 'pipeline' AND t.id NOT LIKE 'SZT-S%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'mig_0391_legacy_terms_exist — มีรอบขายที่ TS ผูกกับใบ pipeline % แถว ต้องตัดสินก่อน', v_n;
  END IF;
END
$pre$;

-- ── §1 sales_order_lines: ชนิด · แพ็คเกจของบรรทัดพิมพ์เอง ──────────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวนอก DO/EXECUTE — ยามข้อความอ่านคอลัมน์จากรูปประโยคนี้
ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS "serviceKind" text,
  ADD COLUMN IF NOT EXISTS "serviceProductId" text,
  ADD COLUMN IF NOT EXISTS "serviceFgCode" text;

-- SET NULL: ลบสินค้าแล้วบรรทัดยังอยู่ · serviceFgCode ค้างไว้ให้รู้ว่าเคยเลือกอะไร แต่ด่านนับเป็น fg_missing (D30)
ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_service_product_fk;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_service_product_fk
  FOREIGN KEY ("serviceProductId") REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_service_kind_check;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_service_kind_check
  CHECK ("serviceKind" IS NULL OR "serviceKind" IN ('package', 'not_service'));

-- บรรทัด FG ห้ามเก็บชนิดเอง (หมวดของ FG ตัดสิน) · FG แพ็คเกจอยู่ได้เฉพาะบรรทัดที่เก็บชนิด package
-- · มีสินค้าต้องมีรหัส (ตัวกลับกันไม่จริง — สินค้าถูกลบแล้วรหัสค้าง)
-- · "บรรทัด FG" = fgCode/productId ที่ไม่ว่าง — สตริงว่าง = ไม่มี (NULLIF · ไม่ trim) กติกาเดียวกับ
--   sales_order_line_service_role · sales_order_service_setup_errors · RPC บันทึก · isManualSalesLine ฝั่ง JS
--   (ถ้า CHECK ดู IS NULL ล้วน บรรทัด fgCode = '' ถูกทุกตัวอ่านว่าพิมพ์เอง แต่บันทึกชนิดแล้วชน CHECK เป็น 23514 ดิบ)
ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_service_setup_shape;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_service_setup_shape CHECK (
    ("serviceKind" IS NULL OR (NULLIF("fgCode", '') IS NULL AND NULLIF("productId", '') IS NULL))
    AND ("serviceFgCode" IS NULL OR "serviceKind" = 'package')
    AND ("serviceProductId" IS NULL OR "serviceFgCode" IS NOT NULL)
  );

-- ปลายทางของ FK คู่ (บรรทัด, ใบ) ของตารางโซน — กันโซนชี้บรรทัดของใบอื่น
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_lines_id_order_uk
  ON public.sales_order_lines (id, "salesOrderId");

COMMENT ON COLUMN public.sales_order_lines."serviceRounds" IS
  'รอบบริการต่อโซนของรายการนี้ (ทุกโซนของรายการเท่ากัน) ตลอดช่วงบริการ · บังคับตอนยื่นสำหรับรายการแพ็คเกจ · อ้างอิงเท่านั้น planGen ไม่อ่าน (0326 · 0391)';
COMMENT ON COLUMN public.sales_order_lines."serviceKind" IS
  'ชนิดที่ฝ่ายขายเลือกให้บรรทัดพิมพ์เอง: package = แพ็คเกจบริการรายรอบ · not_service = ไม่ใช่งานบริการรายรอบ · NULL = ตามหมวด (FG / metadata.categoryCode) หรือยังไม่เลือก — บรรทัด FG ห้ามมีค่า (0391)';
COMMENT ON COLUMN public.sales_order_lines."serviceProductId" IS
  'แพ็คเกจ (FG หมวด 02-001) ที่ฝ่ายขายเลือกให้บรรทัดพิมพ์เองที่เป็นแพ็คเกจ — SET NULL เมื่อสินค้าถูกลบ (ด่านนับเป็นยังไม่เลือก) (0391)';
COMMENT ON COLUMN public.sales_order_lines."serviceFgCode" IS
  'รหัส FG ของ serviceProductId ณ ตอนเลือก — ฐานเขียนเองจาก products.fgCode · ตัวตัดสินด่านเงินอ่านค่านี้เฉพาะใบที่มี serviceTermsOpenedAt (0391)';

-- ── §2 sales_orders: ช่วงบริการ · ตราเปิดงาน · สถานะตั้งย้อนหลัง ─────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวชั้นนอก — serviceRoundsCopyPaths.test.mjs เก็บคอลัมน์จากรูปประโยคนี้
--    แล้วบังคับให้ทุกตัวถูกตัดสินว่าทาง Rev./ใบร่างพาไปหรือไม่
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "servicePeriodFrom" date,
  ADD COLUMN IF NOT EXISTS "servicePeriodTo" date,
  ADD COLUMN IF NOT EXISTS "serviceTermsOpenedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "serviceSetupState" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupSubmittedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "serviceSetupSubmittedById" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupSubmittedByName" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupRejectedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "serviceSetupRejectedById" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupRejectedByName" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupRejectedReason" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupApprovedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "serviceSetupApprovedById" text,
  ADD COLUMN IF NOT EXISTS "serviceSetupApprovedByName" text;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_period_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_service_period_shape CHECK (
    (("servicePeriodFrom" IS NULL) = ("servicePeriodTo" IS NULL))
    AND (
      "servicePeriodFrom" IS NULL
      OR ("servicePeriodFrom" <= "servicePeriodTo"
          AND "servicePeriodFrom" >= DATE '2000-01-01'
          AND "servicePeriodTo" <= DATE '2100-12-31')
    )
  );

-- สถานะตั้งย้อนหลังมีความหมายเฉพาะใบ pipeline · ยื่นแล้วต้องมีเวลา · ตีกลับต้องมีเวลา + เหตุผล 10–500 (หลัง btrim)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_service_setup_state_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_service_setup_state_shape CHECK (
    "serviceSetupState" IS NULL
    OR (
      "serviceSetupState" IN ('submitted', 'rejected')
      AND origin = 'pipeline'
      AND ("serviceSetupState" <> 'submitted' OR "serviceSetupSubmittedAt" IS NOT NULL)
      AND ("serviceSetupState" <> 'rejected' OR (
        "serviceSetupRejectedAt" IS NOT NULL
        AND length(btrim(COALESCE("serviceSetupRejectedReason", ''))) BETWEEN 10 AND 500
      ))
    )
  );

COMMENT ON COLUMN public.sales_orders."servicePeriodFrom" IS
  'วันเริ่มช่วงบริการของใบ (ช่วงเดียวต่อใบ · มติ B2) — บังคับตอนยื่นเมื่อมีรายการแพ็คเกจ · ก๊อปไปใบ Rev. โดย sales_order_copy_service_setup (0391)';
COMMENT ON COLUMN public.sales_orders."servicePeriodTo" IS
  'วันสิ้นสุดช่วงบริการของใบ (รวมวันนี้) — คู่กับ servicePeriodFrom เสมอ (0391)';
COMMENT ON COLUMN public.sales_orders."serviceTermsOpenedAt" IS
  'เวลาที่เปิดรอบขาย (service_zone_terms) ให้ TS — ตั้งโดย sales_order_open_service_terms เท่านั้น · ไม่ก๊อปตอนออก Rev. · ตัวตัดสินด่านเงินอ่าน serviceFgCode เฉพาะใบที่มีตรานี้ (0391)';
COMMENT ON COLUMN public.sales_orders."serviceSetupState" IS
  'สถานะตั้งงานบริการย้อนหลังของใบที่อนุมัติแล้ว: submitted = รอผู้จัดการฝ่ายขายตรวจ · rejected = ตีกลับ · NULL = ยังไม่ยื่น/อนุมัติแล้ว — มีความหมายเฉพาะใบ approved ที่ยังไม่ถูกแทนและยังไม่มีตรา (D28) (0391)';
COMMENT ON COLUMN public.sales_orders."serviceSetupApprovedAt" IS
  'เวลาที่ผู้จัดการฝ่ายขายอนุมัติงานบริการย้อนหลัง — หลักฐานคู่กับ serviceTermsOpenedAt · ไม่แตะ approvedAt/Actual ของใบ (0391)';

-- ── §3 sales_order_line_zones: บรรทัด → โซน · แพ็คต่อรอบรายโซน ───────────────────────
CREATE TABLE IF NOT EXISTS public.sales_order_line_zones (
  id                 text PRIMARY KEY,
  "salesOrderId"     text NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  "salesOrderLineId" text NOT NULL,
  "zoneId"           text NOT NULL,
  "packsPerRound"    integer CHECK ("packsPerRound" IS NULL OR "packsPerRound" BETWEEN 1 AND 9999),
  "sortOrder"        integer NOT NULL DEFAULT 0,
  "createdById"      text,
  "createdByName"    text,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  -- ชื่อตายตัว — route ลบโซนจับชื่อนี้เพื่อตอบเป็นไทยว่า "โซนนี้อยู่ในงานบริการของใบสั่งขาย"
  CONSTRAINT sales_order_line_zones_zone_fk
    FOREIGN KEY ("zoneId") REFERENCES public.service_zones(id) ON DELETE RESTRICT,
  -- บรรทัดต้องเป็นของใบเดียวกันเสมอ (FK คู่) · บรรทัดถูกลบ = โซนของบรรทัดไปด้วย
  CONSTRAINT sales_order_line_zones_line_fk
    FOREIGN KEY ("salesOrderLineId", "salesOrderId")
    REFERENCES public.sales_order_lines(id, "salesOrderId") ON DELETE CASCADE,
  CONSTRAINT sales_order_line_zones_line_zone_uk UNIQUE ("salesOrderLineId", "zoneId")
);

CREATE INDEX IF NOT EXISTS sales_order_line_zones_order_idx
  ON public.sales_order_line_zones ("salesOrderId");
CREATE INDEX IF NOT EXISTS sales_order_line_zones_zone_idx
  ON public.sales_order_line_zones ("zoneId");

ALTER TABLE public.sales_order_line_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_order_line_zones FROM anon, authenticated;
GRANT ALL ON TABLE public.sales_order_line_zones TO service_role;

COMMENT ON TABLE public.sales_order_line_zones IS
  'โซนของแต่ละบรรทัดใบสั่งขายสายบริการ — ฝ่ายขายตั้งก่อนยื่น · id = SLZ- || md5(lineId:zoneId) · อนุมัติแล้วกลายเป็น service_zone_terms (0391)';
COMMENT ON COLUMN public.sales_order_line_zones."packsPerRound" IS
  'แพ็คต่อรอบของโซนนี้ (จำนวนเต็ม 1–9999) — กลายเป็น service_zone_terms.packageQty ตอนอนุมัติ (0391)';
COMMENT ON COLUMN public.service_zone_terms."packageQty" IS
  'แพ็คต่อรอบของโซนนี้ — term ของใบที่มี serviceTermsOpenedAt (0391) · term เก่าของ TS (ถ้ามี) = จำนวนที่จัดสรร';

-- ── §4 ตัวตัดสินกลาง ────────────────────────────────────────────────────────
-- หมวดของรหัส FG — ตัวเดียวกับ categoryOf (src/lib/master/categoryOf.js): 'FG-AAAA-02-001-DDDDD' → '02-001'
CREATE OR REPLACE FUNCTION public.fg_category_of(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT substring(p_code from '\d{2}-\d{3}');
$$;

-- สายธุรกิจของใบ — โครงการก่อน (เจ้าของค่าจริง) แล้วดีล · ตอบไม่ได้ = NULL ไม่ใช่ 'PRODUCT' (orderBusinessLine)
CREATE OR REPLACE FUNCTION public.sales_order_business_line(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN pj.line IN ('PRODUCT', 'SERVICE') THEN pj.line
           WHEN d.line IN ('PRODUCT', 'SERVICE') THEN d.line
         END
    FROM public.sales_orders o
    LEFT JOIN public.projects pj ON pj.id = o."projectId"
    LEFT JOIN public.sales_deals d ON d.id = o."dealId"
   WHERE o.id = p_order_id;
$$;

-- ชนิดของบรรทัด (D2) — คู่กับ serviceLineRole ฝั่ง JS (ยามเทียบ serviceSetupSqlParity.test.mjs)
--   1) ค่าที่เก็บ  2) บรรทัด FG: หมวดของ fgCode  3) บรรทัดพิมพ์เอง: หมวดของ metadata.categoryCode (#1844)  4) NULL = ยังไม่เลือก
--   สตริงว่าง = ไม่มี · ไม่ trim — ตรงกับ CHECK sales_order_lines_service_setup_shape (NULLIF) · errors() · RPC บันทึก
--   และ isManualSalesLine ฝั่ง JS (ทุกจุดอ่าน '' ว่าไม่มี)
CREATE OR REPLACE FUNCTION public.sales_order_line_service_role(
  p_kind text,
  p_fg_code text,
  p_product_id text,
  p_metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_kind IS NOT NULL THEN p_kind
    WHEN NULLIF(p_fg_code, '') IS NOT NULL OR NULLIF(p_product_id, '') IS NOT NULL THEN
      CASE WHEN public.fg_category_of(p_fg_code) = '02-001' THEN 'package' ELSE 'not_service' END
    WHEN NULLIF(p_metadata ->> 'categoryCode', '') IS NOT NULL THEN
      CASE WHEN public.fg_category_of(p_metadata ->> 'categoryCode') = '02-001' THEN 'package' ELSE 'not_service' END
    ELSE NULL
  END;
$$;

-- แก้งานบริการได้ไหม (D9) — ร่าง/ตีกลับ หรือใบเดิม pipeline ที่อนุมัติแล้ว ยังไม่มีตรา ยังไม่ถูกแทน และยังไม่ยื่นตรวจ
-- (ตัวเดียวกับ serviceSetupEditError ฝั่ง JS · save RPC และ trigger เรียกตัวนี้)
CREATE OR REPLACE FUNCTION public.sales_order_service_setup_editable(
  p_status text,
  p_origin text,
  p_terms_opened_at timestamptz,
  p_superseded_by text,
  p_setup_state text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_status IN ('draft', 'rejected')
    OR (
      p_origin = 'pipeline'
      AND p_status = 'approved'
      AND p_terms_opened_at IS NULL
      AND p_superseded_by IS NULL
      AND COALESCE(p_setup_state, '') <> 'submitted'
    ),
    false
  );
$$;

-- ── §5 รายการที่ยังขาด — รหัส '<ชนิด>:<บรรทัด>[:<โซน>]' เรียงตามบรรทัด แล้วตามด้วย period_missing ──────────
-- คู่กับ serviceSetupIssues ฝั่ง JS (ข้อความไทยอยู่ SERVICE_SETUP_ISSUE_TEXT) · ใบที่ไม่ใช่ pipeline/SERVICE = ว่างเสมอ
-- ⚠️ ความเป็นเจ้าของ FG ข้ามนิติบุคคล (fg_foreign) ตรวจที่ JS เท่านั้น — RPC เรียกได้แต่ route (service_role)
CREATE OR REPLACE FUNCTION public.sales_order_service_setup_errors(p_order_id text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_line record;
  v_alloc record;
  v_role text;
  v_manual boolean;
  v_has_package boolean := false;
  v_errors text[] := '{}';
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  IF NOT (v_order.origin = 'pipeline')
     OR public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE' THEN
    RETURN '{}';
  END IF;

  FOR v_line IN
    SELECT l.id, l."fgCode", l."productId", l.metadata, l."serviceKind", l."serviceProductId",
           l."serviceFgCode", l."serviceRounds"
      FROM public.sales_order_lines l
     WHERE l."salesOrderId" = v_order.id
     ORDER BY l."sortOrder", l.id
  LOOP
    v_role := public.sales_order_line_service_role(v_line."serviceKind", v_line."fgCode", v_line."productId", v_line.metadata);

    IF v_role IS NULL THEN
      v_errors := v_errors || ('kind_missing:' || v_line.id);
      CONTINUE;
    END IF;

    IF v_role <> 'package' THEN
      IF EXISTS (SELECT 1 FROM public.sales_order_line_zones a WHERE a."salesOrderLineId" = v_line.id) THEN
        v_errors := v_errors || ('zones_on_not_service:' || v_line.id);
      END IF;
      CONTINUE;
    END IF;

    v_has_package := true;
    v_manual := NULLIF(v_line."fgCode", '') IS NULL AND NULLIF(v_line."productId", '') IS NULL;

    IF v_manual THEN
      -- serviceProductId ว่าง = ยังไม่เลือก แม้ serviceFgCode ค้างอยู่ (สินค้าถูกลบแล้ว FK SET NULL · D30)
      IF v_line."serviceProductId" IS NULL THEN
        v_errors := v_errors || ('fg_missing:' || v_line.id);
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.products p
         WHERE p.id = v_line."serviceProductId"
           AND p."isActive" IS DISTINCT FROM false
           AND (p."approvalStatus" IS NULL OR p."approvalStatus" = 'approved')
           AND public.fg_category_of(p."fgCode") = '02-001'
      ) THEN
        v_errors := v_errors || ('fg_invalid:' || v_line.id);
      END IF;
    END IF;

    IF v_line."serviceRounds" IS NULL THEN
      v_errors := v_errors || ('rounds_missing:' || v_line.id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.sales_order_line_zones a WHERE a."salesOrderLineId" = v_line.id) THEN
      v_errors := v_errors || ('zones_missing:' || v_line.id);
    END IF;

    FOR v_alloc IN
      SELECT a."zoneId", a."packsPerRound",
             EXISTS (
               SELECT 1
                 FROM public.service_zones z
                 JOIN public.service_sites s ON s.id = z."siteId"
                WHERE z.id = a."zoneId"
                  AND z."isActive" IS DISTINCT FROM false
                  AND s."isActive" IS DISTINCT FROM false
                  AND s.kind = 'customer'
                  AND s."customerId" = v_order."customerId"
             ) AS target_ok
        FROM public.sales_order_line_zones a
       WHERE a."salesOrderLineId" = v_line.id
       ORDER BY a."sortOrder", a."zoneId"
    LOOP
      IF v_alloc."packsPerRound" IS NULL THEN
        v_errors := v_errors || ('packs_missing:' || v_line.id || ':' || v_alloc."zoneId");
      END IF;
      IF NOT v_alloc.target_ok THEN
        v_errors := v_errors || ('zone_invalid:' || v_line.id || ':' || v_alloc."zoneId");
      END IF;
    END LOOP;
  END LOOP;

  IF v_has_package AND (v_order."servicePeriodFrom" IS NULL OR v_order."servicePeriodTo" IS NULL) THEN
    v_errors := v_errors || 'period_missing'::text;
  END IF;

  RETURN v_errors;
END;
$$;

-- ── §6 บันทึกงานบริการทั้งชุด ─────────────────────────────────────────────────────
-- route ตรวจสิทธิ์/ขอบเขตทีม + validateServiceSetupPatch ก่อนแล้ว · ที่นี่คือด่านสุดท้ายของรูปทรงและสถานะ
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

  -- ช่วงบริการ: ไม่มีคีย์ = ไม่เปลี่ยน · null = ล้างทั้งคู่ · วัตถุ = ต้องครบสองวัน from ≤ to ในปี 2000–2100
  IF p_payload ? 'period' THEN
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

    IF v_item ? 'zones' AND jsonb_typeof(v_item -> 'zones') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'service_setup_payload_invalid';
    END IF;

    IF v_role IS DISTINCT FROM 'package' THEN
      -- ไม่ใช่แพ็คเกจ (หรือยังไม่เลือก): ใส่ FG/รอบ/โซนไม่ได้ · สลับมาที่นี่ = ล้างของเดิมทั้งหมดของบรรทัด
      IF (v_item ? 'serviceProductId' AND jsonb_typeof(v_item -> 'serviceProductId') <> 'null')
         OR (v_item ? 'rounds' AND jsonb_typeof(v_item -> 'rounds') <> 'null')
         OR (v_item ? 'zones' AND jsonb_array_length(v_item -> 'zones') > 0) THEN
        RAISE EXCEPTION 'service_setup_not_package';
      END IF;
      v_product_id := NULL;
      v_fg := NULL;
      v_rounds := NULL;
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

    UPDATE public.sales_order_lines SET
      "serviceKind" = v_kind,
      "serviceProductId" = v_product_id,
      "serviceFgCode" = v_fg,
      "serviceRounds" = v_rounds
    WHERE id = v_line.id
      AND ("serviceKind" IS DISTINCT FROM v_kind
        OR "serviceProductId" IS DISTINCT FROM v_product_id
        OR "serviceFgCode" IS DISTINCT FROM v_fg
        OR "serviceRounds" IS DISTINCT FROM v_rounds);

    v_lines := v_lines + 1;
  END LOOP;

  UPDATE public.sales_orders SET
    "servicePeriodFrom" = CASE WHEN v_set_period THEN v_from ELSE "servicePeriodFrom" END,
    "servicePeriodTo" = CASE WHEN v_set_period THEN v_to ELSE "servicePeriodTo" END,
    "updatedAt" = v_now
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'updatedAt', v_now,
    'lines', v_lines,
    'zones', (SELECT count(*) FROM public.sales_order_line_zones WHERE "salesOrderId" = v_order.id)
  );
END;
$$;

-- ── §7 เปิดรอบขายให้ TS (เรียกจากการอนุมัติ — P1 และ approve_sales_order_service_setup) ──────────
CREATE OR REPLACE FUNCTION public.sales_order_open_service_terms(
  p_order_id text,
  p_actor_id text,
  p_actor_name text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_errors text[];
  v_actor_name text := NULLIF(btrim(COALESCE(p_actor_name, '')), '');
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF v_order.status <> 'approved' THEN
    RAISE EXCEPTION 'service_setup_state_invalid';
  END IF;
  -- ใบย้อนหลังมีเส้นเปิดรอบของตัวเอง (0374) · ใบที่ไม่ใช่สายบริการ = ไม่มีอะไรให้ TS · ไม่ตีตรา
  IF NOT (v_order.origin = 'pipeline') THEN RETURN 0; END IF;
  IF public.sales_order_business_line(v_order.id) IS DISTINCT FROM 'SERVICE' THEN RETURN 0; END IF;

  v_errors := public.sales_order_service_setup_errors(v_order.id);
  IF cardinality(v_errors) > 0 THEN
    RAISE EXCEPTION 'sales_order_service_setup_incomplete' USING DETAIL = array_to_string(v_errors, ',');
  END IF;

  -- D29: term ที่ไฟล์นี้ไม่ได้สร้าง (route ผูกโซนเดิม) ห้ามถูกเขียนทับหรือลบ
  IF EXISTS (
    SELECT 1 FROM public.service_zone_terms t
     WHERE t."salesOrderId" = v_order.id AND t.id NOT LIKE 'SZT-S%'
  ) THEN
    RAISE EXCEPTION 'service_setup_legacy_terms_exist';
  END IF;

  -- term เก่าของใบนี้ที่ (บรรทัด, โซน) ไม่อยู่ในงานบริการแล้ว (เช่น คืนร่างแล้วถอดโซน) — บันทึกก่อนลบ
  INSERT INTO public.audit_logs ("actorId", "actorName", action, "entityType", "entityId", summary, before, "createdAt")
  SELECT p_actor_id, v_actor_name, 'delete', 'service_zone_term', t.id,
         'ลบรอบขายของโซนที่ไม่อยู่ในงานบริการของ ' || v_order."orderNumber" || ' แล้ว (0391)',
         to_jsonb(t), now()
    FROM public.service_zone_terms t
   WHERE t."salesOrderId" = v_order.id
     AND t.id LIKE 'SZT-S%'
     AND NOT EXISTS (
       SELECT 1
         FROM public.sales_order_line_zones a
         JOIN public.sales_order_lines l ON l.id = a."salesOrderLineId"
        WHERE a."salesOrderId" = v_order.id
          AND a."salesOrderLineId" = t."salesOrderLineId"
          AND a."zoneId" = t."zoneId"
          AND public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) = 'package'
     );

  DELETE FROM public.service_zone_terms t
   WHERE t."salesOrderId" = v_order.id
     AND t.id LIKE 'SZT-S%'
     AND NOT EXISTS (
       SELECT 1
         FROM public.sales_order_line_zones a
         JOIN public.sales_order_lines l ON l.id = a."salesOrderLineId"
        WHERE a."salesOrderId" = v_order.id
          AND a."salesOrderLineId" = t."salesOrderLineId"
          AND a."zoneId" = t."zoneId"
          AND public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) = 'package'
     );

  -- term = แพ็คต่อรอบของโซน · หน่วย 'แพ็ค' · ml ยกจาก term ของใบเดิม (Rev.) ที่โซนเดียวกัน + บรรทัด QT เดียวกัน
  -- ⛔ ไม่เขียน startDate / endDate / serviceContractId (ของสัญญา — PR-C)
  INSERT INTO public.service_zone_terms (
    id, "zoneId", "salesOrderId", "salesOrderLineId", "productId", "fgCode", description,
    "packageQty", unit, "standardMlPerMonth", "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT 'SZT-S' || substr(md5(l.id || ':' || a."zoneId"), 1, 20),
         a."zoneId", v_order.id, l.id,
         COALESCE(l."productId", l."serviceProductId"),
         COALESCE(l."fgCode", l."serviceFgCode"),
         l.description,
         a."packsPerRound",
         'แพ็ค',
         (SELECT pt."standardMlPerMonth"
            FROM public.service_zone_terms pt
            JOIN public.sales_order_lines pl ON pl.id = pt."salesOrderLineId"
           WHERE v_order."revisedFromId" IS NOT NULL
             AND pt."salesOrderId" = v_order."revisedFromId"
             AND pt."zoneId" = a."zoneId"
             AND pl."quotationLineId" IS NOT DISTINCT FROM l."quotationLineId"
             AND pt."standardMlPerMonth" IS NOT NULL
           ORDER BY pt."updatedAt" DESC, pt.id DESC
           LIMIT 1),
         p_actor_id, v_actor_name, now(), now()
    FROM public.sales_order_line_zones a
    JOIN public.sales_order_lines l ON l.id = a."salesOrderLineId"
   WHERE a."salesOrderId" = v_order.id
     AND public.sales_order_line_service_role(l."serviceKind", l."fgCode", l."productId", l.metadata) = 'package'
  ON CONFLICT ("salesOrderLineId", "zoneId") DO UPDATE SET
    "packageQty" = EXCLUDED."packageQty",
    "productId" = EXCLUDED."productId",
    "fgCode" = EXCLUDED."fgCode",
    description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    "standardMlPerMonth" = COALESCE(service_zone_terms."standardMlPerMonth", EXCLUDED."standardMlPerMonth"),
    "updatedAt" = now();

  -- ใบ Rev.: รอบบริการที่เดินอยู่ของใบเดิม ที่ไซต์ที่ใบนี้ยังครอบ ย้ายมาใบนี้ (หนึ่งแถว audit ต่อรอบ)
  -- ไซต์ที่ใบนี้ไม่มีแล้ว — รอบค้างบนใบเดิมให้ TS ตัดสิน
  IF v_order."revisedFromId" IS NOT NULL THEN
    INSERT INTO public.audit_logs ("actorId", "actorName", action, "entityType", "entityId", summary, before, after, "createdAt")
    SELECT p_actor_id, v_actor_name, 'update', 'service_plan', sp.id,
           'ย้ายรอบบริการไปใบ Rev. ' || v_order."orderNumber" || ' (0391)',
           to_jsonb(sp),
           to_jsonb(sp) || jsonb_build_object('salesOrderId', v_order.id, 'updatedAt', now()),
           now()
      FROM public.service_plans sp
     WHERE sp."salesOrderId" = v_order."revisedFromId"
       AND sp."isActive"
       AND sp."siteId" IN (
         SELECT z."siteId"
           FROM public.service_zone_terms t
           JOIN public.service_zones z ON z.id = t."zoneId"
          WHERE t."salesOrderId" = v_order.id
       );

    UPDATE public.service_plans sp SET
      "salesOrderId" = v_order.id,
      "updatedAt" = now()
    WHERE sp."salesOrderId" = v_order."revisedFromId"
      AND sp."isActive"
      AND sp."siteId" IN (
        SELECT z."siteId"
          FROM public.service_zone_terms t
          JOIN public.service_zones z ON z.id = t."zoneId"
         WHERE t."salesOrderId" = v_order.id
      );
  END IF;

  -- ตรา — "updatedAt" ไม่ขยับ (หน้าต่างที่ถือ updatedAt ของการอนุมัติยังใช้ต่อได้)
  UPDATE public.sales_orders SET "serviceTermsOpenedAt" = now() WHERE id = v_order.id;

  RETURN (SELECT count(*) FROM public.service_zone_terms WHERE "salesOrderId" = v_order.id)::integer;
END;
$$;

-- ── §8 ออก Rev.: ยกงานบริการไปใบ Rev. (เรียกจาก P2 หลังก๊อปบรรทัด) ────────────────────────
-- ⚠️ P2 ยิงกับการออก Rev. ทุกใบ ⇒ ใบที่ไม่มีอะไรให้ยก (ใบ PRODUCT · ใบบริการที่ยังไม่เคยตั้ง) ต้องออกก่อนด่านใด ๆ
-- ⛔ ไม่ยกตรา serviceTermsOpenedAt และสถานะตั้งย้อนหลัง 11 ช่อง — ใบ Rev. เปิดงานบริการใหม่ตอนอนุมัติของตัวเอง
CREATE OR REPLACE FUNCTION public.sales_order_copy_service_setup(p_from text, p_to text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source public.sales_orders%ROWTYPE;
  v_target public.sales_orders%ROWTYPE;
  v_n integer;
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.sales_order_lines l
        WHERE l."salesOrderId" = p_from
          AND (l."serviceKind" IS NOT NULL OR l."serviceProductId" IS NOT NULL OR l."serviceFgCode" IS NOT NULL)
     )
     AND NOT EXISTS (SELECT 1 FROM public.sales_order_line_zones a WHERE a."salesOrderId" = p_from)
     AND NOT EXISTS (
       SELECT 1 FROM public.sales_orders o
        WHERE o.id = p_from AND (o."servicePeriodFrom" IS NOT NULL OR o."servicePeriodTo" IS NOT NULL)
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
    "serviceFgCode" = s."serviceFgCode"
  FROM public.sales_order_lines s
  WHERE s."salesOrderId" = p_from
    AND t.id = 'SOL-' || md5(p_to || ':' || s.id)
    AND t."salesOrderId" = p_to
    AND (t."serviceKind" IS DISTINCT FROM s."serviceKind"
      OR t."serviceProductId" IS DISTINCT FROM s."serviceProductId"
      OR t."serviceFgCode" IS DISTINCT FROM s."serviceFgCode");

  -- ช่วงบริการ — "updatedAt" ของใบ Rev. ไม่ขยับ (route ใช้ค่าที่ฟังก์ชันออก Rev. คืนมา)
  UPDATE public.sales_orders SET
    "servicePeriodFrom" = v_source."servicePeriodFrom",
    "servicePeriodTo" = v_source."servicePeriodTo"
  WHERE id = p_to
    AND ("servicePeriodFrom" IS DISTINCT FROM v_source."servicePeriodFrom"
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

-- ── §9 ตั้งงานบริการย้อนหลังบนใบที่อนุมัติแล้ว (ใบเดิม) ─────────────────────────────────────
-- ⛔ ทั้งสามตัว **ไม่แตะ** status · approvedAt · approvalFingerprint · ยอด · Actual · งวดชำระ ⇒ trigger Actual (0279) ไม่ยิง
CREATE OR REPLACE FUNCTION public.submit_sales_order_service_setup(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_errors text[];
BEGIN
  IF NOT public.is_sales_keyer_role(p_actor_role) THEN
    RAISE EXCEPTION 'service_setup_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF NOT (
    v_order.origin = 'pipeline'
    AND v_order.status = 'approved'
    AND v_order."supersededById" IS NULL
    AND v_order."serviceTermsOpenedAt" IS NULL
    AND public.sales_order_business_line(v_order.id) IS NOT DISTINCT FROM 'SERVICE'
    AND COALESCE(v_order."serviceSetupState", '') <> 'submitted'
  ) THEN
    RAISE EXCEPTION 'service_setup_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  v_errors := public.sales_order_service_setup_errors(v_order.id);
  IF cardinality(v_errors) > 0 THEN
    RAISE EXCEPTION 'sales_order_service_setup_incomplete' USING DETAIL = array_to_string(v_errors, ',');
  END IF;

  UPDATE public.sales_orders SET
    "serviceSetupState" = 'submitted',
    "serviceSetupSubmittedAt" = now(),
    "serviceSetupSubmittedById" = p_actor_id,
    "serviceSetupSubmittedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    "updatedAt" = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

-- ผู้จัดการฝ่ายขายอนุมัติ = เปิดรอบขาย + ตีตรา + หลักฐานผู้อนุมัติ · สถานะกลับเป็น NULL (ตรา + ApprovedAt คือหลักฐาน)
-- ยื่นเองอนุมัติเอง: ไม่ใช่ admin = ห้าม · admin = ต้องมีเหตุผล 10–500 (route เก็บลง audit · ไม่มีคอลัมน์)
CREATE OR REPLACE FUNCTION public.approve_sales_order_service_setup(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_n integer;
BEGIN
  IF NOT public.is_sales_manager_role(p_actor_role) THEN
    RAISE EXCEPTION 'service_setup_review_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  -- D28: "รอตรวจ" มีความหมายเฉพาะใบ approved ที่ยังไม่ถูกแทนและยังไม่มีตรา — ใบที่ถูกย้อน/ออก Rev./ยกเลิก = เฉย
  -- ⭐ และต้องยังเป็นสาย SERVICE (ยื่นตรวจถามแล้ว แต่สายของโครงการแก้ได้ระหว่างรอตรวจ) — สายเปลี่ยนแล้ว
  --   sales_order_open_service_terms คืน 0 โดยไม่ประทับ ⇒ ห้าม "อนุมัติ" ที่ไม่ได้เปิดอะไร (ตีกลับยังทำได้ = ทางล้างคำขอ)
  IF NOT (
    v_order."serviceSetupState" = 'submitted'
    AND v_order.status = 'approved'
    AND v_order.origin = 'pipeline'
    AND v_order."supersededById" IS NULL
    AND v_order."serviceTermsOpenedAt" IS NULL
    AND public.sales_order_business_line(v_order.id) IS NOT DISTINCT FROM 'SERVICE'
  ) THEN
    RAISE EXCEPTION 'service_setup_review_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  IF v_order."serviceSetupSubmittedById" IS NOT NULL AND v_order."serviceSetupSubmittedById" = p_actor_id THEN
    IF p_actor_role <> 'admin' THEN
      RAISE EXCEPTION 'service_setup_separation_required';
    END IF;
    IF length(btrim(COALESCE(p_override_reason, ''))) NOT BETWEEN 10 AND 500 THEN
      RAISE EXCEPTION 'service_setup_override_reason_required';
    END IF;
  END IF;

  v_n := public.sales_order_open_service_terms(v_order.id, p_actor_id, p_actor_name);
  -- ตาข่ายชั้นสอง: หลักฐานผู้อนุมัติ (ApprovedAt/By) ต้องเกิดคู่กับตราเสมอ — เปิดรอบขายแล้วไม่มีตรา = ไม่เขียน (ถอยทั้งทรานแซกชัน)
  IF NOT EXISTS (SELECT 1 FROM public.sales_orders WHERE id = v_order.id AND "serviceTermsOpenedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'service_setup_review_state_invalid';
  END IF;

  UPDATE public.sales_orders SET
    "serviceSetupState" = NULL,
    "serviceSetupApprovedAt" = now(),
    "serviceSetupApprovedById" = p_actor_id,
    "serviceSetupApprovedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    "updatedAt" = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'termsOpened', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_sales_order_service_setup(
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
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.is_sales_manager_role(p_actor_role) THEN
    RAISE EXCEPTION 'service_setup_review_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF NOT (
    v_order."serviceSetupState" = 'submitted'
    AND v_order.status = 'approved'
    AND v_order.origin = 'pipeline'
    AND v_order."supersededById" IS NULL
    AND v_order."serviceTermsOpenedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'service_setup_review_state_invalid';
  END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  -- ตัดช่องว่างก่อนนับ — CHECK ของตารางนับหลัง btrim · ไม่ตัดก่อน = เหตุผลที่เว้นวรรคหลุดเป็น 23514 ดิบ
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  UPDATE public.sales_orders SET
    "serviceSetupState" = 'rejected',
    "serviceSetupRejectedAt" = now(),
    "serviceSetupRejectedById" = p_actor_id,
    "serviceSetupRejectedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    "serviceSetupRejectedReason" = v_reason,
    "updatedAt" = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

-- ── §10 ด่านชั้นฐาน: ล็อกงานบริการตามสถานะใบ ──────────────────────────────────────────
-- ⭐ ผ่านเสมอ: force delete (app.force_delete = '1' · 0152) · ลบตามแม่ที่ถูกลบไปแล้ว (cascade) · FK SET NULL ของสินค้า
-- ⭐ จำนวนรอบแก้ได้หลังอนุมัติ (มติเดิม 0326) — ยกเว้นระหว่างรออนุมัติ/ย้อนแล้ว/รอตรวจย้อนหลัง
--    และใบที่เปิดงานแล้วห้ามลบรอบของแพ็คเกจทิ้ง (rounds_required)
CREATE OR REPLACE FUNCTION public.sales_order_service_setup_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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
       AND OLD."serviceProductId" IS NOT NULL AND NEW."serviceProductId" IS NULL THEN
      RETURN NEW;
    END IF;

    -- (b) แก้แค่จำนวนรอบ
    IF OLD."serviceKind" IS NOT DISTINCT FROM NEW."serviceKind"
       AND OLD."serviceProductId" IS NOT DISTINCT FROM NEW."serviceProductId"
       AND OLD."serviceFgCode" IS NOT DISTINCT FROM NEW."serviceFgCode" THEN
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

    -- (c) ชนิด / แพ็คเกจ — ต้องอยู่ในสถานะที่แก้งานบริการได้
    IF NOT public.sales_order_service_setup_editable(
      v_parent.status, v_parent.origin, v_parent."serviceTermsOpenedAt", v_parent."supersededById", v_parent."serviceSetupState"
    ) THEN
      RAISE EXCEPTION 'sales_order_service_setup_locked' USING DETAIL = 'kind';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'sales_orders' THEN
    -- ตัดสินจากสถานะ "ก่อนแก้" — คำสั่งที่เปลี่ยนสถานะพร้อมช่วงบริการต้องไม่หลุดด่าน
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

DROP TRIGGER IF EXISTS sales_order_line_zones_guard_trg ON public.sales_order_line_zones;
CREATE TRIGGER sales_order_line_zones_guard_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_line_zones
FOR EACH ROW EXECUTE FUNCTION public.sales_order_service_setup_guard();

DROP TRIGGER IF EXISTS sales_order_lines_service_guard_trg ON public.sales_order_lines;
CREATE TRIGGER sales_order_lines_service_guard_trg
BEFORE UPDATE OF "serviceKind", "serviceProductId", "serviceFgCode", "serviceRounds" ON public.sales_order_lines
FOR EACH ROW
WHEN (OLD."serviceKind" IS DISTINCT FROM NEW."serviceKind"
   OR OLD."serviceProductId" IS DISTINCT FROM NEW."serviceProductId"
   OR OLD."serviceFgCode" IS DISTINCT FROM NEW."serviceFgCode"
   OR OLD."serviceRounds" IS DISTINCT FROM NEW."serviceRounds")
EXECUTE FUNCTION public.sales_order_service_setup_guard();

DROP TRIGGER IF EXISTS sales_orders_service_period_guard_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_service_period_guard_trg
BEFORE UPDATE OF "servicePeriodFrom", "servicePeriodTo" ON public.sales_orders
FOR EACH ROW
WHEN (OLD."servicePeriodFrom" IS DISTINCT FROM NEW."servicePeriodFrom"
   OR OLD."servicePeriodTo" IS DISTINCT FROM NEW."servicePeriodTo")
EXECUTE FUNCTION public.sales_order_service_setup_guard();

-- ── §11 สิทธิ์ (แพตเทิร์น 0336 — ลายเซ็นเต็มทุกบรรทัด) ─────────────────────────────────
REVOKE ALL ON FUNCTION public.fg_category_of(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fg_category_of(text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_business_line(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_business_line(text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_line_service_role(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_line_service_role(text, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_service_setup_editable(text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_service_setup_editable(text, text, timestamptz, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_service_setup_errors(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_service_setup_errors(text) TO service_role;
REVOKE ALL ON FUNCTION public.save_sales_order_service_setup(text, timestamptz, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_order_service_setup(text, timestamptz, jsonb, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_open_service_terms(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_open_service_terms(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_copy_service_setup(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_copy_service_setup(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.submit_sales_order_service_setup(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sales_order_service_setup(text, timestamptz, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.approve_sales_order_service_setup(text, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_order_service_setup(text, timestamptz, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.reject_sales_order_service_setup(text, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_sales_order_service_setup(text, timestamptz, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_service_setup_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ── §12 ปะฟังก์ชันที่รันอยู่จริง (P1 อนุมัติ · P2 ออก Rev.) ─────────────────────────────────
-- ⚠️ ชื่อฟังก์ชันเดิมเขียนเป็นสตริงใน VALUES เท่านั้น — ยามข้อความหลายตัวหา "นิยามล่าสุด" ด้วยข้อความ
--    FUNCTION + public. + ชื่อ ⇒ เขียนรูปนั้นในไฟล์นี้ (แม้ในคอมเมนต์) = ยามอ่านไฟล์นี้เป็นเจ้าของนิยามผิดตัว
-- ⚠️ anchor เป็น regex (ARE) ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · ปะแล้ว (มี marker) = ข้าม
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
      ('approve_sales_order_with_signature_evidence_atomic',
        $re$(RETURNING \* INTO v_order;)(\s*RETURN jsonb_build_object\()$re$,
        $rp$\1

  -- 0391: เปิดงานบริการในทรานแซกชันเดียวกับการอนุมัติ (ไม่ครบ = ถอยทั้งการอนุมัติ)
  PERFORM public.sales_order_open_service_terms(v_order.id, p_actor_id, p_actor_name);
  SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order.id;\2$rp$,
        'sales_order_open_service_terms('),
      ('revise_approved_sales_order_atomic',
        $re$(RAISE EXCEPTION 'sales_order_revision_lines_required';\s*END IF;)$re$,
        $rp$\1

  -- 0391: ยกงานบริการ (ชนิด · แพ็คเกจ · ช่วงบริการ · โซน) ไปใบ Rev.
  PERFORM public.sales_order_copy_service_setup(v_source.id, v_revision.id);$rp$,
        'sales_order_copy_service_setup(')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0391_patch_overload % count=%', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0391: % — ปะไว้แล้ว', r.fn;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0391_patch_anchor % hits=%/%', r.fn, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0391: % — ปะแล้ว', r.fn;
  END LOOP;
END
$patch$;

-- ── §13 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────
DO $verify$
DECLARE
  v_n integer;
  v_fn text;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'approve_sales_order_with_signature_evidence_atomic'
     AND strpos(p.prosrc, 'sales_order_open_service_terms(') > 0
     AND (length(p.prosrc) - length(replace(p.prosrc, 'sales_order_open_service_terms(', '')))
         / length('sales_order_open_service_terms(') = 1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0391_verify p1=%', v_n; END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'revise_approved_sales_order_atomic'
     AND strpos(p.prosrc, 'sales_order_copy_service_setup(') > 0
     AND (length(p.prosrc) - length(replace(p.prosrc, 'sales_order_copy_service_setup(', '')))
         / length('sales_order_copy_service_setup(') = 1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0391_verify p2=%', v_n; END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.fg_category_of(text)',
    'public.sales_order_business_line(text)',
    'public.sales_order_line_service_role(text,text,text,jsonb)',
    'public.sales_order_service_setup_editable(text,text,timestamptz,text,text)',
    'public.sales_order_service_setup_errors(text)',
    'public.save_sales_order_service_setup(text,timestamptz,jsonb,text,text,text)',
    'public.sales_order_open_service_terms(text,text,text)',
    'public.sales_order_copy_service_setup(text,text)',
    'public.submit_sales_order_service_setup(text,timestamptz,text,text,text)',
    'public.approve_sales_order_service_setup(text,timestamptz,text,text,text,text)',
    'public.reject_sales_order_service_setup(text,timestamptz,text,text,text,text)',
    'public.sales_order_service_setup_guard()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'mig_0391_verify grant %', v_fn;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('sales_order_line_zones_guard_trg', 'sales_order_lines_service_guard_trg',
                    'sales_orders_service_period_guard_trg');
  IF v_n <> 3 THEN RAISE EXCEPTION 'mig_0391_verify triggers=%', v_n; END IF;

  IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'sales_order_line_zones') THEN
    RAISE EXCEPTION 'mig_0391_verify rls';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
