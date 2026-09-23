-- ============================================================
--  Migration 0377: ปรับแผนงวดชำระของใบสั่งขายที่อนุมัติแล้ว — ไม่ต้องย้อนการอนุมัติ
--                  (แผน so-payment-unlock-replan PR2 · มติเจ้าของ 23/09/2026 · D1 = AE Sup/admin กดเอง · D5 = ฉบับพิมพ์คงแผน QT)
--
--  ⭐ คำขอ B ของเจ้าของ: ลูกค้าขอเปลี่ยนการแบ่งจ่ายหลังใบอนุมัติ (แบ่งงวดที่เหลือ · เลื่อนวัน · รวมงวด)
--    เดิมทางเดียวคือย้อนการอนุมัติ → ออก Rev. → อนุมัติใหม่ ⇒ ยอด Actual หลุดออกระหว่างทาง และเอกสารถูกออกใหม่ทั้งใบ
--    ⇒ ไฟล์นี้ให้ RPC เขียน "แผนงวดชุดสุดท้ายทั้งใบ" ลงตารางงวดตรง ๆ โดย **ไม่แตะตัวใบเลย**
--
--  ⭐ หลักการ "เงินหนึ่งก้อน = งวดหนึ่งแถว"
--    · แถวที่มีเงินหรือมีเอกสารผูก (ล็อก) ไม่เปลี่ยนเด็ดขาด — ต้องอยู่ในชุดใหม่ครบทุกช่องเท่าเดิม
--      ล็อก = confirmed/reported · มีเลขใบกำกับ · ผูกคำร้องขอวางบิล · งวดยกมา · pending ที่มีหลักฐาน/วันจ่าย
--      (นิยามเดียวกับ installmentReplanLock ของ webapp/src/lib/sales/installmentReplan.js — เทสต์ตรึงสองฝั่ง)
--    · แถวเปิด (pending/rejected ที่ไม่ติดข้อบน) แก้ป้าย ยอด วันครบกำหนด ช่วงครอบ หมายเหตุได้ ลบได้ เพิ่มได้
--      แถว rejected คงสถานะ (SA แจ้งใหม่ได้ตามเดิม)
--    · Σ amount = sales_orders."totalAmount" (รวม VAT) ±0.005 · Σ percent = 100 ±0.01 · 1–12 งวด
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) public._so_installment_replan_locked(status, taxInvoiceNo, billingRequestId, kind, evidence, paidOn) — ตัวตัดสินแถวล็อก
--     (รับเป็นคอลัมน์ ไม่รับทั้งแถว — ฟังก์ชันที่รับแถวของตารางกลายเป็น computed column ของ PostgREST)
--  2) public._so_installments_write_plan(order, rows, now, actor…) — แกนเขียนแผน (ยามอย่างเดียว · lib คำนวณเลขงวด/ยอด/สัดส่วนมาแล้ว)
--     ① แถวล็อกต้องอยู่ครบและไม่เปลี่ยน (installment_replan_locked_changed)
--     ② ลบแถวเปิดที่ไม่อยู่ในชุดใหม่
--     ③ ขยับเลขงวดสองจังหวะ (seq+1000 ก่อน — sales_order_installments_seq_uk ของ 0245 ไม่ deferrable)
--     ④ UPDATE แถวเปิดที่คงไว้ (frozenAt = COALESCE(frozenAt, now)) · ⑤ INSERT งวดใหม่ pending ตรึงยอดทันที
--     ⑥ ตรวจท้าย: จำนวน 1–12 · Σ ยอด = ยอดใบ · Σ สัดส่วน = 100
--     ⭐ PR3 (ยกเงินจากใบที่ยกเลิก) เรียกแกนตัวนี้ต่อหลังย้ายแถวเงินเข้าใบปลายทาง
--  3) public.replan_sales_order_installments(...) RETURNS jsonb {before, after, reason} — ทางเดียวของ route
--     role ae_supervisor/admin · ใบ pipeline 'approved' ยังไม่ถูกแทน ยอด > 0 · บัญชียังไม่ปิดใบ · เหตุผล 10–500
--     · ล็อกใบและงวด FOR UPDATE · p_expected [{id, updatedAt}] ต้องตรงทุกแถว (ไม่งั้น workflow_stale)
--  4) สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated · GRANT EXECUTE ให้ service_role (ทั้งสามตัว — ไม่ใช่ SECURITY DEFINER)
--
--  ⛔ ไม่แตะ sales_orders / quotations / sales_order_lines (อ่าน+ล็อกแถวใบอย่างเดียว) ⇒ trigger sync_sales_order_actual
--     ไม่ตื่น · ยอด Actual และเดือน Actual (เดือนของเวลาอนุมัติ เวลาไทย) ไม่ขยับ · สแนปช็อตเอกสาร/ฉบับพิมพ์ยังแสดงแผน QT (D5)
--  ⛔ ไม่เพิ่ม trigger · ไม่เพิ่มคอลัมน์ · ไม่ backfill · CHECK ของงวด (0245 · 0259 · 0320 · 0348 · 0374 · 0376) ผ่านเองทุกแถว
--  ⭐ แผนที่ปรับรอดการออก Rev.: 0376 ย้ายแถวไปทั้งแถว (ยอดที่ปรับแล้วติดแถวไป) · freezeInstallments ไม่ทับแถวที่ตรึงแล้ว (PR0)
--
--  🛑 **รันก่อน deploy โค้ด JS ของ PR2** — ปุ่ม "ปรับแผนงวด" เรียก RPC นี้ ไม่มี = route ตอบ 503 "ฐานยังไม่ได้รัน 0377"
--     (PGRST202) · รันก่อน deploy ได้ทันที: ไม่มีโค้ดเดิมตัวไหนเรียก และไม่เปลี่ยนตาราง
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (CREATE OR REPLACE FUNCTION · REVOKE/GRANT ซ้ำได้)
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ROLLBACK คืนทุกอย่าง) ───────────────────────────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายไฟล์ด้วยบล็อกข้างล่าง (ตัด BEGIN; บรรทัดแรกของบล็อกทิ้ง)
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อกข้างล่างทั้งก้อน
--  แทนค่า <...> ก่อนรัน: <SO> = id ของใบจาก SELECT แรก (ใบ pipeline ที่อนุมัติ · บัญชียังไม่ปิด · มีงวดเปิด) ·
--  <adminId> = id ผู้ใช้ admin (จาก Auth) · บล็อกนี้รวมงวดเปิดทั้งหมดเป็นงวดเดียว "smoke 0377" แล้ว ROLLBACK
--
--   BEGIN;
--   SELECT o.id, o."orderNumber", o."totalAmount", count(i.*) AS rows,
--          count(*) FILTER (WHERE NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo",
--            i."billingRequestId", i.kind, i.evidence, i."paidOn")) AS open_rows
--     FROM public.sales_orders o JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
--    WHERE o.status = 'approved' AND o.origin = 'pipeline' AND o."supersededById" IS NULL
--      AND o."financeStatus" IS DISTINCT FROM 'approved'
--    GROUP BY o.id ORDER BY open_rows DESC, o."createdAt" DESC LIMIT 5;
--   CREATE TEMP TABLE smoke_0377 ON COMMIT DROP AS
--     SELECT to_jsonb(o) AS j FROM public.sales_orders o WHERE o.id = '<SO>';
--   SELECT jsonb_array_length(public.replan_sales_order_installments('<SO>',
--     (WITH cur AS (
--        SELECT i.*, public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
--                 i.kind, i.evidence, i."paidOn") AS locked
--          FROM public.sales_order_installments i WHERE i."salesOrderId" = '<SO>')
--      SELECT jsonb_agg(r) FROM (
--        SELECT jsonb_build_object('id', id, 'seq', seq, 'label', label, 'percent', percent, 'amount', amount,
--                 'dueDate', "dueDate", 'coversFrom', "coversFrom", 'coversTo', "coversTo", 'note', note) AS r
--          FROM cur WHERE locked
--        UNION ALL
--        SELECT jsonb_build_object('id', NULL, 'seq', (SELECT max(seq) + 1 FROM cur), 'label', 'smoke 0377',
--                 'percent', round(100 - (SELECT COALESCE(sum(percent), 0) FROM cur WHERE locked), 2),
--                 'amount', (SELECT "totalAmount" FROM public.sales_orders WHERE id = '<SO>')
--                           - (SELECT COALESCE(sum(amount), 0) FROM cur WHERE locked),
--                 'dueDate', NULL, 'coversFrom', NULL, 'coversTo', NULL, 'note', NULL)
--      ) s),
--     (SELECT jsonb_agg(jsonb_build_object('id', id, 'updatedAt', "updatedAt"))
--        FROM public.sales_order_installments WHERE "salesOrderId" = '<SO>'),
--     'smoke 0377 ทดสอบปรับแผน', '<adminId>', 'smoke 0377', 'admin') -> 'after');   -- = แถวล็อก + 1
--   SELECT (SELECT j FROM smoke_0377) = to_jsonb(o) FROM public.sales_orders o WHERE o.id = '<SO>';  -- true (ตัวใบไม่ขยับ)
--   SELECT sum(amount) AS total, sum(percent) AS pct, count(*) FILTER (WHERE "frozenAt" IS NULL) AS unfrozen
--     FROM public.sales_order_installments WHERE "salesOrderId" = '<SO>';        -- = totalAmount · 100 · 0
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT proname FROM pg_proc WHERE proname IN ('replan_sales_order_installments',
--     '_so_installments_write_plan', '_so_installment_replan_locked');                   -- 3 แถว
--   SELECT r.role, has_function_privilege(r.role,
--     'public.replan_sales_order_installments(text,jsonb,jsonb,text,text,text,text)', 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role);            -- false · false · true
--   SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE c.relname = 'sales_order_installments' AND NOT t.tgisinternal;                -- 0 (ไม่มี trigger บนตารางงวด)
--   SELECT count(*) FILTER (WHERE public._so_installment_replan_locked(status, "taxInvoiceNo", "billingRequestId",
--            kind, evidence, "paidOn")) AS locked, count(*) AS rows
--     FROM public.sales_order_installments;                                              -- ข้อมูลประกอบ (ไม่มีค่าถูก/ผิด)
-- ============================================================

BEGIN;

-- ── 1) ตัวตัดสินแถวล็อก — นิยามเดียวกับ installmentReplanLock ของ lib (ห้าข้อ) ─────────────────────────
CREATE OR REPLACE FUNCTION public._so_installment_replan_locked(
  p_status text,
  p_tax_invoice_no text,
  p_billing_request_id text,
  p_kind text,
  p_evidence jsonb,
  p_paid_on date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_status IN ('confirmed', 'reported')
    OR btrim(COALESCE(p_tax_invoice_no, '')) <> ''
    OR btrim(COALESCE(p_billing_request_id, '')) <> ''
    OR p_kind = 'opening'
    OR (p_status = 'pending' AND (jsonb_array_length(COALESCE(p_evidence, '[]'::jsonb)) > 0 OR p_paid_on IS NOT NULL)),
    false
  )
$$;

COMMENT ON FUNCTION public._so_installment_replan_locked(text, text, text, text, jsonb, date) IS
  'แถวงวดที่ปรับแผนไม่ได้ (0377) — confirmed/reported · มีเลขใบกำกับ · ผูกคำร้องวางบิล · งวดยกมา · pending ที่มีหลักฐาน/วันจ่าย · นิยามเดียวกับ installmentReplanLock (lib)';

-- ── 2) แกนเขียนแผนทั้งใบ (ยามอย่างเดียว — lib คำนวณเลขงวด/ยอด/สัดส่วนมาแล้ว) ───────────────────────────
CREATE OR REPLACE FUNCTION public._so_installments_write_plan(
  p_order_id text,
  p_rows jsonb,
  p_now timestamptz,
  p_actor_id text,
  p_actor_name text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_item jsonb;
  v_id text;
  v_seq integer;
  v_amount numeric;
  v_percent numeric;
  v_label text;
  v_note text;
  v_due date;
  v_from date;
  v_to date;
  v_count integer;
  v_sum numeric;
  v_pct numeric;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'installment_replan_row_invalid';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'installment_replan_count_invalid';
  END IF;

  -- ยอดใบ — อ่านอย่างเดียว (ผู้เรียกล็อกแถวใบไว้แล้ว)
  SELECT o."totalAmount" INTO v_total FROM public.sales_orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  v_total := COALESCE(v_total, 0);

  /* รูปของทุกรายการ — แปลงค่าไม่ได้ = ข้อมูลผิด (ไม่ปล่อยเป็น error ดิบของ Postgres)
     แถวที่จะถูกเขียน (id ว่าง = ใหม่ · id ของแถวเปิด) ต้องถูกรูปครบ · แถวล็อกถูกเทียบกับฐานข้างล่างแทน */
  FOR v_item IN SELECT e.r FROM jsonb_array_elements(p_rows) e(r) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'installment_replan_row_invalid';
    END IF;
    BEGIN
      v_id := NULLIF(btrim(COALESCE(v_item->>'id', '')), '');
      v_seq := (v_item->>'seq')::integer;
      v_amount := (v_item->>'amount')::numeric;
      v_percent := (v_item->>'percent')::numeric;
      v_label := btrim(COALESCE(v_item->>'label', ''));
      v_note := NULLIF(btrim(COALESCE(v_item->>'note', '')), '');
      v_due := NULLIF(v_item->>'dueDate', '')::date;
      v_from := NULLIF(v_item->>'coversFrom', '')::date;
      v_to := NULLIF(v_item->>'coversTo', '')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'installment_replan_row_invalid';
    END;

    IF v_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.sales_order_installments i WHERE i.id = v_id AND i."salesOrderId" = p_order_id
    ) THEN
      RAISE EXCEPTION 'installment_replan_row_unknown';
    END IF;

    IF v_seq IS NULL OR v_seq < 1 OR v_seq >= 1000 OR v_amount IS NULL OR v_percent IS NULL THEN
      RAISE EXCEPTION 'installment_replan_row_invalid';
    END IF;

    IF v_id IS NULL OR EXISTS (
      SELECT 1 FROM public.sales_order_installments i
      WHERE i.id = v_id
        AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
          i.kind, i.evidence, i."paidOn")
    ) THEN
      IF v_amount <= 0 OR v_amount <> round(v_amount, 2)
         OR v_percent < 0 OR v_percent > 100
         OR length(v_label) NOT BETWEEN 1 AND 120
         OR (v_note IS NOT NULL AND length(v_note) > 1000)
         OR (v_due IS NOT NULL AND v_due NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
         OR (v_from IS NOT NULL AND v_from NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
         OR (v_to IS NOT NULL AND v_to NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
         OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_from > v_to) THEN
        RAISE EXCEPTION 'installment_replan_row_invalid';
      END IF;
    END IF;
  END LOOP;

  -- เลขงวดและ id ในชุดใหม่ต้องไม่ซ้ำ
  IF (SELECT count(DISTINCT (e.r->>'seq')::integer) FROM jsonb_array_elements(p_rows) e(r)) <> v_count
     OR (SELECT count(*) FROM jsonb_array_elements(p_rows) e(r) WHERE NULLIF(btrim(COALESCE(e.r->>'id', '')), '') IS NOT NULL)
        <> (SELECT count(DISTINCT e.r->>'id') FROM jsonb_array_elements(p_rows) e(r)
             WHERE NULLIF(btrim(COALESCE(e.r->>'id', '')), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'installment_replan_row_invalid';
  END IF;

  /* ① แถวล็อก (มีเงิน/เอกสารผูก) ต้องอยู่ในชุดใหม่ครบ และเท่าในฐานทุกช่อง — ยอด · สัดส่วน · เลขงวด · ป้าย · วัน · หมายเหตุ
     ⇒ "เงินหนึ่งก้อน = งวดหนึ่งแถว" · สถานะ/หลักฐาน/ใบกำกับไม่อยู่ในชุดเลย จึงไม่มีทางถูกเขียน */
  IF EXISTS (
    SELECT 1 FROM public.sales_order_installments i
    WHERE i."salesOrderId" = p_order_id
      AND public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
        i.kind, i.evidence, i."paidOn")
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_rows) e(r)
        WHERE e.r->>'id' = i.id
          AND (e.r->>'seq')::integer = i.seq
          AND e.r->>'label' IS NOT DISTINCT FROM i.label
          AND (e.r->>'percent')::numeric = i.percent
          AND (e.r->>'amount')::numeric = i.amount
          AND NULLIF(e.r->>'dueDate', '')::date IS NOT DISTINCT FROM i."dueDate"
          AND NULLIF(e.r->>'coversFrom', '')::date IS NOT DISTINCT FROM i."coversFrom"
          AND NULLIF(e.r->>'coversTo', '')::date IS NOT DISTINCT FROM i."coversTo"
          AND NULLIF(btrim(COALESCE(e.r->>'note', '')), '') IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(i.note, '')), '')
      )
  ) THEN
    RAISE EXCEPTION 'installment_replan_locked_changed';
  END IF;

  -- ② แถวเปิดที่ไม่อยู่ในชุดใหม่ = ลบ (ยังไม่มีเงินและไม่มีเอกสารผูก · audit ของ route เก็บแถวก่อนลบครบ)
  DELETE FROM public.sales_order_installments i
  WHERE i."salesOrderId" = p_order_id
    AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
      i.kind, i.evidence, i."paidOn")
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(r) WHERE e.r->>'id' = i.id);

  /* ③ ขยับเลขงวดสองจังหวะ — sales_order_installments_seq_uk (0245) ไม่ deferrable ⇒ สลับเลข 2↔3 ตรง ๆ ชนกลางทาง
     แถวเปิดที่คงไว้หลบไป +1000 ก่อน (เลขของแถวล็อกไม่ถูกแตะ · ชุดใหม่ห้ามใช้เลข ≥ 1000 — ตรวจข้างบน) */
  UPDATE public.sales_order_installments i
  SET seq = i.seq + 1000,
      "frozenAt" = COALESCE(i."frozenAt", p_now),
      "updatedAt" = p_now
  WHERE i."salesOrderId" = p_order_id
    AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
      i.kind, i.evidence, i."paidOn")
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e(r) WHERE e.r->>'id' = i.id);

  -- ④ แถวเปิดที่คงไว้ — ค่าชุดใหม่ + ตรึงยอด (แผนที่ปรับแล้ว = แผนจริง · freezeInstallments ไม่ทับจาก QT อีก)
  UPDATE public.sales_order_installments i
  SET seq = (e.r->>'seq')::integer,
      label = btrim(e.r->>'label'),
      percent = (e.r->>'percent')::numeric,
      amount = (e.r->>'amount')::numeric,
      "dueDate" = NULLIF(e.r->>'dueDate', '')::date,
      "coversFrom" = NULLIF(e.r->>'coversFrom', '')::date,
      "coversTo" = NULLIF(e.r->>'coversTo', '')::date,
      note = NULLIF(btrim(COALESCE(e.r->>'note', '')), ''),
      "frozenAt" = COALESCE(i."frozenAt", p_now),
      "updatedAt" = p_now
  FROM jsonb_array_elements(p_rows) e(r)
  WHERE i."salesOrderId" = p_order_id
    AND e.r->>'id' = i.id
    AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
      i.kind, i.evidence, i."paidOn");

  -- ⑤ งวดใหม่ — pending · ตรึงยอดทันที (ใบอนุมัติแล้ว ⇒ แจ้งชำระเข้าคิวบัญชีได้เลย)
  INSERT INTO public.sales_order_installments (
    id, "salesOrderId", seq, label, percent, amount, "dueDate", "coversFrom", "coversTo", note,
    status, "frozenAt", "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    'SOI-' || md5(p_order_id || ':' || p_now::text || ':' || x.ord::text),
    p_order_id,
    (x.r->>'seq')::integer,
    btrim(x.r->>'label'),
    (x.r->>'percent')::numeric,
    (x.r->>'amount')::numeric,
    NULLIF(x.r->>'dueDate', '')::date,
    NULLIF(x.r->>'coversFrom', '')::date,
    NULLIF(x.r->>'coversTo', '')::date,
    NULLIF(btrim(COALESCE(x.r->>'note', '')), ''),
    'pending', p_now,
    NULLIF(btrim(COALESCE(p_actor_id, '')), ''),
    NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    p_now, p_now
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(r, ord)
  WHERE NULLIF(btrim(COALESCE(x.r->>'id', '')), '') IS NULL;

  -- ⑥ ตรวจท้ายจากตารางจริง — ชุดที่เขียนแล้วต้องครบ · Σ ยอด = ยอดใบ · Σ สัดส่วน = 100 · 1–12 งวด
  SELECT count(*), COALESCE(sum(i.amount), 0), COALESCE(sum(i.percent), 0)
    INTO v_count, v_sum, v_pct
  FROM public.sales_order_installments i
  WHERE i."salesOrderId" = p_order_id;
  IF v_count <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'installment_replan_row_invalid';
  END IF;
  IF v_count NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'installment_replan_count_invalid';
  END IF;
  IF abs(v_sum - v_total) >= 0.005 OR abs(v_pct - 100) > 0.01 THEN
    RAISE EXCEPTION 'installment_replan_sum_mismatch';
  END IF;
END;
$$;

COMMENT ON FUNCTION public._so_installments_write_plan(text, jsonb, timestamptz, text, text) IS
  'แกนเขียนแผนงวดทั้งใบ (0377) — แถวล็อกต้องครบและไม่เปลี่ยน · ลบ/แก้/เพิ่มเฉพาะแถวเปิด · ทุกแถวที่เขียนตรึงยอด · Σ = ยอดใบ · ไม่แตะตัวใบ · ผู้เรียก: replan_sales_order_installments (PR3: ยกเงินจากใบที่ยกเลิก)';

-- ── 3) RPC ของ route: ปรับแผนงวดของใบที่อนุมัติแล้ว (AE Sup/admin · มติ D1) ───────────────────────────
CREATE OR REPLACE FUNCTION public.replan_sales_order_installments(
  p_order_id text,
  p_rows jsonb,
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
  v_order public.sales_orders%ROWTYPE;
  v_reason text;
  v_now timestamptz := now();
  v_stale boolean;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'installment_replan_forbidden';
  END IF;

  /* ล็อกแถวใบ — อ่านอย่างเดียว (ไม่มีคำสั่งเขียนใบในไฟล์นี้) · กันแข่งกับย้อนการอนุมัติ/ยกเลิก/บัญชีปิดใบ */
  SELECT * INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  /* ใบย้อนหลังแก้งวดที่ฟอร์มคีย์ใบ (0374 · กติกาเดิมทุกข้อ) · ใบที่ยังไม่ approved ยังไม่ตรึงยอด/แก้ทาง Rev. ·
     ใบที่ถูกแทนแล้วงวดย้ายไปใบ Rev. (0376) · ใบยอด 0 ไม่มีงวด */
  IF NOT COALESCE(v_order.origin = 'pipeline', false)
     OR v_order.status IS DISTINCT FROM 'approved'
     OR v_order."supersededById" IS NOT NULL
     OR COALESCE(v_order."totalAmount", 0) <= 0 THEN
    RAISE EXCEPTION 'installment_replan_state_invalid';
  END IF;
  -- บัญชีปิดใบแล้ว = แผนจบแล้ว (ทุกงวดรับเงิน · 0321) — แก้ต่อทางย้อนการอนุมัติ/ออก Rev. (มติ D2)
  IF v_order."financeStatus" IS NOT DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'installment_replan_finance_closed';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  PERFORM 1 FROM public.sales_order_installments inst
   WHERE inst."salesOrderId" = v_order.id
   ORDER BY inst.seq
   FOR UPDATE;

  /* แผนที่ตาเห็นต้องเป็นรุ่นล่าสุดทุกแถว — มีแถวเพิ่ม/หาย/ถูกแก้จากอีกหน้าต่าง (แจ้งชำระ · บัญชีรับรอง · ตั้งวัน) = เก่า
     ⚠️ เทียบเป็นเวลา ไม่ใช่สตริง (รูปของ PostgREST ≠ รูปของ ::text) · แปลงเวลาไม่ได้ = ไม่ใช่รุ่นที่ตาเห็น */
  IF p_expected IS NULL OR jsonb_typeof(p_expected) <> 'array' THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  BEGIN
    v_stale := (SELECT count(*) FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id)
        <> jsonb_array_length(p_expected)
      OR EXISTS (
        SELECT 1 FROM public.sales_order_installments i
        WHERE i."salesOrderId" = v_order.id
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

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_before
  FROM public.sales_order_installments i
  WHERE i."salesOrderId" = v_order.id;

  PERFORM public._so_installments_write_plan(v_order.id, p_rows, v_now, p_actor_id, p_actor_name);

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_after
  FROM public.sales_order_installments i
  WHERE i."salesOrderId" = v_order.id;

  -- route ลง audit before/after ทุกแถว (ทางกู้ทางเดียวของระบบนี้คือ audit_logs.before)
  RETURN jsonb_build_object('before', v_before, 'after', v_after, 'reason', v_reason);
END;
$$;

COMMENT ON FUNCTION public.replan_sales_order_installments(text, jsonb, jsonb, text, text, text, text) IS
  'ปรับแผนงวดของใบสั่งขายที่อนุมัติแล้ว (0377 · มติ D1) — AE Sup/admin · ใบ pipeline approved ที่บัญชียังไม่ปิด · p_expected ต้องตรงทุกแถว · ไม่แตะตัวใบ (Actual ไม่เปลี่ยน)';

REVOKE ALL ON FUNCTION public._so_installment_replan_locked(text, text, text, text, jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installment_replan_locked(text, text, text, text, jsonb, date) TO service_role;
REVOKE ALL ON FUNCTION public._so_installments_write_plan(text, jsonb, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installments_write_plan(text, jsonb, timestamptz, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.replan_sales_order_installments(text, jsonb, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replan_sales_order_installments(text, jsonb, jsonb, text, text, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
