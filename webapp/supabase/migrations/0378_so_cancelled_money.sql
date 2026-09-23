-- ============================================================
--  Migration 0378: ยกเลิกใบสั่งขายที่มีเงินรับแล้ว — เงินค้างจากใบที่ยกเลิก: ยกเข้าใบใหม่ของดีลเดียวกัน หรือบัญชีบันทึกคืนเงิน
--                  (แผน so-payment-unlock-replan PR3 · มติเจ้าของ 23/09/2026 · D4 รับค่าที่เสนอ)
--
--  ⭐ หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว"
--    · ยกเลิกใบแล้ว งวดที่มีเงิน (confirmed/reported) **อยู่กับใบเดิม** = "เงินค้างจากใบที่ยกเลิก" (ไม่หาย · ไม่ต้องถอนคำรับรอง)
--      งวดที่ยังไม่มีเงิน (pending/rejected) = โมฆะ (ทะเบียนตัดทิ้งตั้งแต่ PR0)
--    · ทางออกของเงินค้างมีสองทาง (D4):
--      ① **ยกเข้าใบใหม่ของดีลเดียวกัน** ที่อนุมัติแล้ว — แถวเดิม id เดิม ย้ายไปทั้งแถว (สลิป · คำรับรอง · ใบกำกับ ·
--         คำร้องวางบิล · ช่วงครอบคงเดิม) บัญชีไม่ต้องรับรองซ้ำ · แผนที่เหลือของใบใหม่หักงวดแรก ๆ ก่อน (lib applyCarryIn)
--      ② **บัญชีบันทึกคืนเงินเต็มจำนวน** (ไม่มีคืนบางส่วน) — มีใบกำกับภาษีต้องมีเลขใบลดหนี้ · แถวที่คืนแล้วถอนคำรับรองไม่ได้
--    ⛔ ยกข้ามดีลไม่ได้ (แม้นิติบุคคลเดียวกัน) — เคสออกใบใหม่ที่เจอบน prod ทุกเคสอยู่ดีลเดียวกัน (มติ D4)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  0) ด่านลำดับรัน: ต้องรัน 0376 (คอลัมน์ "movedFrom") และ 0377 (แกนเขียนแผน) ก่อน — ไม่งั้นหยุดทั้งไฟล์
--  1) คอลัมน์คืนเงินของงวด: "refundedAt" · "refundedOn" date · "refundedById" · "refundedByName" · "refundReason" ·
--     "refundCreditNoteNo" + CHECK sales_order_installments_refund_shape
--     · ยังไม่คืน = ว่างทุกช่อง (ถอนการบันทึกต้องล้างครบ ไม่เหลือเศษ)
--     · คืนแล้ว = status 'confirmed' · มีวันคืน (ปี 2000–2100) · เหตุผล ≥ 10 ตัวอักษร · มีใบกำกับต้องมีเลขใบลดหนี้
--       ⇒ ถอนคำรับรองแถวที่คืนแล้วชน CHECK ที่ฐานด้วย (ด่านชั้นแรกอยู่ที่ installmentActionError)
--  2) ดัชนี GIN ของ "movedFrom" (jsonb_path_ops) — ด่านกู้คืน/ลบถาวรและลิงก์ "ยกไป …" ถามด้วย `@>`
--  3) public.carry_sales_order_installments(...) RETURNS jsonb {before, after, carried, reason} — ทางเดียวของ route
--     · role ae_supervisor/admin/finance (route แคบบัญชีด้วยฝ่ายอีกชั้น — canConfirmPayment)
--     · ล็อกสองใบตามลำดับ id · ต้นทาง: pipeline + cancelled · ปลายทาง: pipeline + approved + ยังไม่ถูกแทน + ยอด > 0 +
--       บัญชียังไม่ปิดใบ · dealId เดียวกัน · เหตุผล 10–500
--     · แถวที่ยก: ของใบต้นทาง · confirmed/reported · ยังไม่คืนเงิน · p_expected ครบทุกแถว (ปลายทาง + แถวที่ยก)
--     · ยกเกิน (แถวล็อกของปลายทาง + แถวที่ยก > ยอดใบ) = installment_carry_overpaid
--     · ① แถวเปิดของปลายทางหลบเลขไป +1000 → ② UPDATE แถวเงินเข้าใบปลายทาง (เลขงวด/ป้าย/สัดส่วนจาก p_target_rows ·
--       ต่อท้าย movedFrom reason 'carry') → ③ แกน _so_installments_write_plan ของ 0377 เขียนแผนทั้งใบ
--       (แถวล็อก — รวมแถวที่ยกมา — ต้องครบและไม่เปลี่ยน · ลบ/แก้แถวเปิด · Σ = ยอดใบ · Σ% = 100 · 1–12 งวด)
--  4) สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated · GRANT EXECUTE ให้ service_role (ไม่ใช่ SECURITY DEFINER)
--
--  ⛔ ไม่แตะ sales_orders / quotations / sales_order_lines (อ่าน+ล็อกแถวใบอย่างเดียว) ⇒ Actual/เดือน Actual ไม่ขยับ
--     (ใบที่ยกเลิกหลุดจาก Actual ตั้งแต่ตอนยกเลิกอยู่แล้ว · ใบใหม่นับ Actual ตอน AE Sup อนุมัติตามปกติ)
--  ⛔ RPC ยกเลิกใบ (0170) และ UPDATE ยกเลิกธรรมดาไม่เปลี่ยน — การปลดล็อกยกเลิกอยู่ที่ route (paymentLockReason เหลือ
--     เป็นด่านของใบย้อนหลังเท่านั้น · ใบย้อนหลังคงกติกาเดิมทุกข้อ)
--  ⛔ ไม่เพิ่ม trigger · ไม่ backfill (ณ 23/09 ใบยกเลิกที่มีเงินรับแล้ว = 0 ใบ — วัดจาก prod อ่านอย่างเดียว)
--
--  🛑 **ลำดับรัน: 0376 → 0377 → 0378 แล้วจึง deploy โค้ด JS ของ PR3**
--     · โค้ด PR3 ปลดล็อกการยกเลิกใบที่มีเงินรับแล้ว — ก่อนรันไฟล์นี้ เงินที่ค้างยังเห็นในทะเบียน (คิดจากสถานะล้วน)
--       แต่ปุ่ม "บันทึกคืนเงิน" ตอบ 503 "ฐานยังไม่ได้รัน 0378" และ "ยกเงินจากใบที่ยกเลิก" ตอบ 503 (PGRST202)
--     · รันแล้วโค้ดที่ deploy อยู่ยังทำงานได้: คอลัมน์ใหม่ว่างทั้งหมด · RPC ใหม่ไม่มีใครเรียก
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS · CREATE INDEX IF NOT EXISTS · CREATE OR REPLACE)
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ROLLBACK คืนทุกอย่าง) ───────────────────────────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายไฟล์ด้วยบล็อกข้างล่าง (ตัด BEGIN; บรรทัดแรกของบล็อกทิ้ง)
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อกข้างล่างทั้งก้อน
--  แทนค่า <...> ก่อนรัน: <SRC> = ใบ pipeline ที่ยกเลิกแล้วมีงวด confirmed/reported · <TGT> = ใบ pipeline ที่อนุมัติแล้ว
--  ของดีลเดียวกัน (บัญชียังไม่ปิด · มีงวดเปิดพอรับยอด) — ถ้าไม่มีคู่แบบนี้บน prod ข้ามบล็อกนี้ได้ (PGlite พิสูจน์แล้ว) ·
--  <adminId> = id ผู้ใช้ admin (จาก Auth) · บล็อกนี้ยกงวดแรกที่มีเงินของ <SRC> เข้า <TGT> โดยหักงวดเปิดงวดแรก แล้ว ROLLBACK
--
--   BEGIN;
--   SELECT s.id AS src, s."orderNumber" AS src_no, t.id AS tgt, t."orderNumber" AS tgt_no
--     FROM public.sales_orders s JOIN public.sales_orders t ON t."dealId" = s."dealId" AND t.id <> s.id
--    WHERE s.status = 'cancelled' AND s.origin = 'pipeline' AND t.status = 'approved' AND t.origin = 'pipeline'
--      AND t."supersededById" IS NULL AND t."financeStatus" IS DISTINCT FROM 'approved'
--      AND EXISTS (SELECT 1 FROM public.sales_order_installments i WHERE i."salesOrderId" = s.id
--                   AND i.status IN ('confirmed', 'reported') AND i."refundedAt" IS NULL) LIMIT 5;
--   CREATE TEMP TABLE smoke_0378 ON COMMIT DROP AS
--     SELECT i.* FROM public.sales_order_installments i
--      WHERE i."salesOrderId" = '<SRC>' AND i.status IN ('confirmed', 'reported') AND i."refundedAt" IS NULL
--      ORDER BY i.seq LIMIT 1;
--   SELECT public.carry_sales_order_installments('<SRC>', '<TGT>', ARRAY[(SELECT id FROM smoke_0378)],
--     (WITH cur AS (
--        SELECT i.*, public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
--                 i.kind, i.evidence, i."paidOn") AS locked
--          FROM public.sales_order_installments i WHERE i."salesOrderId" = '<TGT>'),
--      firstopen AS (SELECT * FROM cur WHERE NOT locked ORDER BY seq LIMIT 1)
--      SELECT jsonb_agg(r) FROM (
--        SELECT jsonb_build_object('id', id, 'seq', seq, 'label', label, 'percent', percent, 'amount', amount,
--                 'dueDate', "dueDate", 'coversFrom', "coversFrom", 'coversTo', "coversTo", 'note', note) AS r
--          FROM cur WHERE locked OR id <> (SELECT id FROM firstopen)
--        UNION ALL
--        SELECT jsonb_build_object('id', f.id, 'seq', f.seq, 'label', f.label, 'percent', f.percent - round(
--                 (SELECT amount FROM smoke_0378) * 100 / (SELECT "totalAmount" FROM public.sales_orders WHERE id = '<TGT>'), 2),
--                 'amount', f.amount - (SELECT amount FROM smoke_0378), 'dueDate', f."dueDate",
--                 'coversFrom', f."coversFrom", 'coversTo', f."coversTo", 'note', f.note) FROM firstopen f
--        UNION ALL
--        SELECT jsonb_build_object('id', s.id, 'seq', (SELECT max(seq) + 1 FROM cur), 'label', 'smoke 0378',
--                 'percent', round(s.amount * 100 / (SELECT "totalAmount" FROM public.sales_orders WHERE id = '<TGT>'), 2),
--                 'amount', s.amount, 'dueDate', s."dueDate", 'coversFrom', s."coversFrom", 'coversTo', s."coversTo",
--                 'note', s.note) FROM smoke_0378 s
--      ) x),
--     (SELECT jsonb_agg(jsonb_build_object('id', id, 'updatedAt', "updatedAt")) FROM public.sales_order_installments
--       WHERE "salesOrderId" = '<TGT>' OR id = (SELECT id FROM smoke_0378)),
--     'smoke 0378 ทดสอบยกเงิน', '<adminId>', 'smoke 0378', 'admin') -> 'carried';     -- count 1 (ถ้า Σ% เพี้ยนจากการปัด = sum_mismatch → ข้าม)
--   SELECT i."salesOrderId" = '<TGT>' AS on_target, i.status = s.status AS same_status, i.amount = s.amount AS same_amount,
--          i.evidence = s.evidence AS same_evidence, i."taxInvoiceNo" IS NOT DISTINCT FROM s."taxInvoiceNo" AS same_invoice,
--          i."movedFrom" -> -1 ->> 'reason' AS moved_reason
--     FROM public.sales_order_installments i JOIN smoke_0378 s USING (id);                -- true ×5 · carry
--   SELECT sum(amount) = (SELECT "totalAmount" FROM public.sales_orders WHERE id = '<TGT>') AS sum_ok
--     FROM public.sales_order_installments WHERE "salesOrderId" = '<TGT>';                -- true
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_order_installments'
--      AND column_name LIKE 'refund%' ORDER BY 1;                                          -- 6 แถว
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conname = 'sales_order_installments_refund_shape';                              -- 1 แถว · true
--   SELECT indexname FROM pg_indexes WHERE indexname = 'sales_order_installments_moved_from_gin';  -- 1 แถว
--   SELECT r.role, has_function_privilege(r.role,
--     'public.carry_sales_order_installments(text,text,text[],jsonb,jsonb,text,text,text,text)', 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role);            -- false · false · true
--   SELECT count(*) FROM public.sales_order_installments i JOIN public.sales_orders o ON o.id = i."salesOrderId"
--    WHERE o.status = 'cancelled' AND i.status IN ('confirmed', 'reported');            -- ข้อมูลประกอบ: เงินค้างวันนี้
-- ============================================================

BEGIN;

-- ── 0) ลำดับรัน: 0376 (movedFrom) + 0377 (แกนเขียนแผน) ต้องมาก่อน ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sales_order_installments' AND column_name = 'movedFrom'
  ) OR to_regprocedure('public._so_installments_write_plan(text, jsonb, timestamptz, text, text)') IS NULL THEN
    RAISE EXCEPTION 'mig_0378_requires_0376_0377';
  END IF;
END;
$$;

-- ── 1) คอลัมน์คืนเงิน + CHECK ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "refundedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "refundedOn" date,
  ADD COLUMN IF NOT EXISTS "refundedById" text,
  ADD COLUMN IF NOT EXISTS "refundedByName" text,
  ADD COLUMN IF NOT EXISTS "refundReason" text,
  ADD COLUMN IF NOT EXISTS "refundCreditNoteNo" text;

COMMENT ON COLUMN public.sales_order_installments."refundedAt" IS
  'บัญชีบันทึกคืนเงินงวดนี้ให้ลูกค้าเต็มจำนวน (0378 · มติ D4) — เฉพาะงวด confirmed ของใบที่ยกเลิก · ถอนคำรับรองไม่ได้จนกว่าจะถอนการบันทึก';
COMMENT ON COLUMN public.sales_order_installments."refundCreditNoteNo" IS
  'เลขที่ใบลดหนี้ — บังคับเมื่องวดนี้มีใบกำกับภาษี (0378)';

ALTER TABLE public.sales_order_installments
  DROP CONSTRAINT IF EXISTS sales_order_installments_refund_shape;
ALTER TABLE public.sales_order_installments
  ADD CONSTRAINT sales_order_installments_refund_shape CHECK (
    ("refundedAt" IS NULL AND "refundedOn" IS NULL AND "refundedById" IS NULL AND "refundedByName" IS NULL
      AND "refundReason" IS NULL AND "refundCreditNoteNo" IS NULL)
    OR ("refundedAt" IS NOT NULL AND status = 'confirmed' AND "refundedOn" IS NOT NULL
      AND "refundedOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
      AND length(btrim(COALESCE("refundReason", ''))) >= 10
      AND (btrim(COALESCE("taxInvoiceNo", '')) = '' OR btrim(COALESCE("refundCreditNoteNo", '')) <> ''))
  );

-- ── 2) ดัชนีของ movedFrom (@>) ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sales_order_installments_moved_from_gin
  ON public.sales_order_installments USING gin ("movedFrom" jsonb_path_ops);

-- ── 3) RPC ยกเงินจากใบที่ยกเลิกเข้าใบใหม่ของดีลเดียวกัน (AE Sup/admin/บัญชี · มติ D4) ──────────────────────
CREATE OR REPLACE FUNCTION public.carry_sales_order_installments(
  p_source_order_id text,
  p_target_order_id text,
  p_installment_ids text[],
  p_target_rows jsonb,
  p_expected jsonb,
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
  v_source public.sales_orders%ROWTYPE;
  v_target public.sales_orders%ROWTYPE;
  v_reason text;
  v_now timestamptz := now();
  v_ids text[];
  v_stale boolean;
  v_bad boolean;
  v_locked numeric;
  v_carried numeric;
  v_moved integer;
  v_before jsonb;
  v_after jsonb;
  v_summary jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin', 'finance') THEN
    RAISE EXCEPTION 'installment_carry_forbidden';
  END IF;
  IF NULLIF(btrim(COALESCE(p_source_order_id, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(p_target_order_id, '')), '') IS NULL
     OR p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'installment_carry_source_invalid';
  END IF;

  /* ล็อกสองใบตามลำดับ id — กัน deadlock กับคำขอที่แตะคู่เดียวกันสวนทาง · อ่านอย่างเดียว (ไม่มีคำสั่งเขียนใบในไฟล์นี้) */
  PERFORM 1 FROM public.sales_orders o
   WHERE o.id IN (p_source_order_id, p_target_order_id)
   ORDER BY o.id
   FOR UPDATE;
  SELECT * INTO v_target FROM public.sales_orders WHERE id = p_target_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  SELECT * INTO v_source FROM public.sales_orders WHERE id = p_source_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  /* ปลายทาง: ใบ pipeline ที่อนุมัติแล้ว ยังไม่ถูกแทน (0376 ย้ายงวดไปใบ Rev.) ยอด > 0 — ใบย้อนหลังคงกติกาเดิม (ไม่มีทางนี้) */
  IF NOT COALESCE(v_target.origin = 'pipeline', false)
     OR v_target.status IS DISTINCT FROM 'approved'
     OR v_target."supersededById" IS NOT NULL
     OR COALESCE(v_target."totalAmount", 0) <= 0 THEN
    RAISE EXCEPTION 'installment_carry_target_invalid';
  END IF;
  -- บัญชีปิดใบแล้ว = แผนจบแล้ว (ทุกงวดรับเงิน · 0321) — กติกาเดียวกับปรับแผน (0377)
  IF v_target."financeStatus" IS NOT DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'installment_carry_finance_closed';
  END IF;
  -- ต้นทาง: ใบ pipeline ที่ยกเลิกแล้ว (ใบย้อนหลังยกเลิกได้เฉพาะตอนไม่มีเงินรับแล้ว — paymentLockReason ที่ route)
  IF NOT COALESCE(v_source.origin = 'pipeline', false)
     OR v_source.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'installment_carry_source_invalid';
  END IF;
  -- มติ D4: ดีลเดียวกันเท่านั้น
  IF v_source."dealId" IS NULL OR v_source."dealId" IS DISTINCT FROM v_target."dealId" THEN
    RAISE EXCEPTION 'installment_carry_cross_deal';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT array_agg(DISTINCT btrim(x)) INTO v_ids
    FROM unnest(COALESCE(p_installment_ids, ARRAY[]::text[])) AS u(x)
   WHERE NULLIF(btrim(COALESCE(x, '')), '') IS NOT NULL;
  IF v_ids IS NULL OR cardinality(v_ids) <> cardinality(p_installment_ids) THEN
    RAISE EXCEPTION 'installment_carry_row_invalid';
  END IF;

  PERFORM 1 FROM public.sales_order_installments i
   WHERE i."salesOrderId" IN (v_source.id, v_target.id)
   ORDER BY i."salesOrderId", i.seq
   FOR UPDATE;

  -- แถวที่ยก = เงินค้างของใบต้นทาง (confirmed/reported ที่ยังไม่คืนเงิน) ครบทุก id
  IF (SELECT count(*) FROM public.sales_order_installments i
       WHERE i.id = ANY (v_ids) AND i."salesOrderId" = v_source.id
         AND i.status IN ('confirmed', 'reported') AND i."refundedAt" IS NULL) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'installment_carry_row_invalid';
  END IF;
  -- ใบปลายทางต้องมีแผนงวดแล้ว (ไม่มี = กด "เริ่มติดตามการชำระ" ก่อน — แกนเขียนแผนต้องมีแถวเปิดให้หัก)
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_installments i WHERE i."salesOrderId" = v_target.id) THEN
    RAISE EXCEPTION 'installment_carry_target_empty';
  END IF;

  /* แผนที่ตาเห็นต้องเป็นรุ่นล่าสุดทุกแถว — งวดของใบปลายทางทั้งหมด + แถวที่ยก (ตัวอื่นของใบต้นทางไม่เกี่ยว)
     ⚠️ เทียบเป็นเวลา ไม่ใช่สตริง · แปลงเวลาไม่ได้ = ไม่ใช่รุ่นที่ตาเห็น (กติกาเดียวกับ 0377) */
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'array' THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  BEGIN
    v_stale := (SELECT count(*) FROM public.sales_order_installments i
                 WHERE (i."salesOrderId" = v_target.id OR i.id = ANY (v_ids)))
        <> jsonb_array_length(p_expected)
      OR EXISTS (
        SELECT 1 FROM public.sales_order_installments i
        WHERE (i."salesOrderId" = v_target.id OR i.id = ANY (v_ids))
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_expected) x(e)
            WHERE x.e->>'id' = i.id
              AND (x.e->>'updatedAt')::timestamptz = i."updatedAt"
          )
      );
  EXCEPTION WHEN OTHERS THEN
    v_stale := true;
  END;
  IF v_stale THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  -- ยกเกินยอดใบ — แถวล็อกของปลายทาง (มีเงิน/เอกสารผูก) + แถวที่ยก ต้องไม่เกินยอดใบ (รวม VAT)
  SELECT COALESCE(sum(i.amount), 0) INTO v_locked
    FROM public.sales_order_installments i
   WHERE i."salesOrderId" = v_target.id
     AND public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
       i.kind, i.evidence, i."paidOn");
  SELECT COALESCE(sum(i.amount), 0) INTO v_carried
    FROM public.sales_order_installments i WHERE i.id = ANY (v_ids);
  IF v_locked + v_carried - v_target."totalAmount" >= 0.005 THEN
    RAISE EXCEPTION 'installment_carry_overpaid';
  END IF;

  /* รูปของ p_target_rows ส่วนที่เป็นแถวที่ยก — แกนของ 0377 ตรวจทั้งชุดอีกรอบหลังย้าย แต่ถึงตอนนั้น UPDATE ของเราชน
     sales_order_installments_seq_uk (ไม่ deferrable) เป็น 23505 ดิบไปก่อนแล้ว ⇒ ตรวจเลขงวด/สัดส่วน/ป้ายของแถวที่ยกที่นี่ */
  IF p_target_rows IS NULL OR jsonb_typeof(p_target_rows) <> 'array' THEN
    RAISE EXCEPTION 'installment_replan_row_invalid';
  END IF;
  BEGIN
    v_bad := EXISTS (
        SELECT 1 FROM unnest(v_ids) AS c(id)
        WHERE (SELECT count(*) FROM jsonb_array_elements(p_target_rows) e(r) WHERE e.r->>'id' = c.id) <> 1
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_target_rows) e(r)
        WHERE e.r->>'id' = ANY (v_ids)
          AND ((e.r->>'seq')::integer NOT BETWEEN 1 AND 999
            OR (e.r->>'percent')::numeric NOT BETWEEN 0 AND 100
            OR length(btrim(COALESCE(e.r->>'label', ''))) NOT BETWEEN 1 AND 120)
      )
      OR (SELECT count(DISTINCT (e.r->>'seq')::integer) FROM jsonb_array_elements(p_target_rows) e(r))
         <> jsonb_array_length(p_target_rows)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_target_rows) e(r)
        JOIN public.sales_order_installments t
          ON t."salesOrderId" = v_target.id AND t.seq = (e.r->>'seq')::integer
         AND public._so_installment_replan_locked(t.status, t."taxInvoiceNo", t."billingRequestId",
               t.kind, t.evidence, t."paidOn")
        WHERE e.r->>'id' = ANY (v_ids)
      );
  EXCEPTION WHEN OTHERS THEN
    v_bad := true;
  END;
  IF v_bad THEN
    RAISE EXCEPTION 'installment_replan_row_invalid';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i."salesOrderId" = v_source.id, i.seq), '[]'::jsonb) INTO v_before
    FROM public.sales_order_installments i
   WHERE i."salesOrderId" = v_target.id OR i.id = ANY (v_ids);

  -- ① แถวเปิดของปลายทางหลบเลขไป +1000 (แกนของ 0377 ขยับอีกรอบแล้วตั้งเลขจริงเอง · ลบแถวที่หักจนหมด)
  UPDATE public.sales_order_installments i
     SET seq = i.seq + 1000,
         "frozenAt" = COALESCE(i."frozenAt", v_now),
         "updatedAt" = v_now
   WHERE i."salesOrderId" = v_target.id
     AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
       i.kind, i.evidence, i."paidOn");

  /* ② ย้ายแถวเงินเข้าใบปลายทาง — id เดิม · สถานะ/ยอด/หลักฐาน/วันจ่าย/คำรับรอง/ใบกำกับ/คำร้องวางบิล/ช่วงครอบคงเดิม
     เปลี่ยนเฉพาะ ใบ · เลขงวด · ป้าย · สัดส่วน (ของใบใหม่) + ต่อท้าย movedFrom (ด่านอ่านไฟล์หลักฐานยอมโฟลเดอร์ของใบเดิม) */
  UPDATE public.sales_order_installments i
     SET "salesOrderId" = v_target.id,
         seq = (e.r->>'seq')::integer,
         label = btrim(e.r->>'label'),
         percent = (e.r->>'percent')::numeric,
         "movedFrom" = i."movedFrom" || jsonb_build_array(jsonb_build_object(
           'salesOrderId', v_source.id,
           'orderNumber', v_source."orderNumber",
           'quotationId', v_source."quotationId",
           'reason', 'carry',
           'movedAt', v_now,
           'byId', p_actor_id,
           'byName', p_actor_name,
           'toSalesOrderId', v_target.id,
           'toOrderNumber', v_target."orderNumber")),
         "frozenAt" = COALESCE(i."frozenAt", v_now),
         "updatedAt" = v_now
    FROM jsonb_array_elements(p_target_rows) e(r)
   WHERE i.id = ANY (v_ids) AND i."salesOrderId" = v_source.id AND e.r->>'id' = i.id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  IF v_moved <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'installment_carry_row_invalid';
  END IF;

  -- ③ แผนทั้งใบของปลายทางผ่านแกนตัวเดียวกับปรับแผน (0377): แถวล็อก (รวมแถวที่ยกมา) ครบและไม่เปลี่ยน · Σ = ยอดใบ
  PERFORM public._so_installments_write_plan(v_target.id, p_target_rows, v_now, p_actor_id, p_actor_name);

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_after
    FROM public.sales_order_installments i
   WHERE i."salesOrderId" = v_target.id;

  SELECT jsonb_build_object(
      'count', count(*),
      'amount', COALESCE(sum(i.amount), 0),
      'confirmedCount', count(*) FILTER (WHERE i.status = 'confirmed'),
      'confirmedAmount', COALESCE(sum(i.amount) FILTER (WHERE i.status = 'confirmed'), 0),
      'reportedCount', count(*) FILTER (WHERE i.status = 'reported'),
      'reportedAmount', COALESCE(sum(i.amount) FILTER (WHERE i.status = 'reported'), 0))
    INTO v_summary
    FROM public.sales_order_installments i
   WHERE i.id = ANY (v_ids);

  -- route ลง audit before/after ทั้งสองใบ (ทางกู้ทางเดียวของระบบนี้คือ audit_logs.before)
  RETURN jsonb_build_object('before', v_before, 'after', v_after, 'carried', v_summary, 'reason', v_reason);
END;
$$;

COMMENT ON FUNCTION public.carry_sales_order_installments(text, text, text[], jsonb, jsonb, text, text, text, text) IS
  'ยกเงินค้างจากใบสั่งขายที่ยกเลิกเข้าใบใหม่ของดีลเดียวกัน (0378 · มติ D4) — ย้ายแถวเดิม (ช่องเงินคงเดิม) + movedFrom reason carry · แผนที่เหลือเขียนผ่านแกน 0377 · ไม่แตะตัวใบ';

REVOKE ALL ON FUNCTION public.carry_sales_order_installments(text, text, text[], jsonb, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carry_sales_order_installments(text, text, text[], jsonb, jsonb, text, text, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
