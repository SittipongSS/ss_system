-- 0418 — ใบค่าสรรพสามิตแบ่งรอบ: SO ลูกค้าหนึ่งใบออกใบค่าสรรพสามิตได้หลายรอบ · ยื่นกรมแยกทีละรอบ (แผนรื้อสรรพสามิต หมวด 13 · PR7a)
--
--  มติเจ้าของ 02/11/2026 (V10–V12): แก้จำนวนรายบรรทัดได้ แบ่งออกเป็นรอบ ส่วนที่ค้างโชว์ยอดคงเหลือ ·
--  ใบค่าสรรพสามิต 1 รอบ = SO ค่าสรรพสามิต 1 ใบ = ใบยื่น 1 ใบ = ใบเสร็จกรม 1 ใบ (แทน D7 ส่วน "1 SO ลูกค้า = 1 ใบยื่น")
--
--  1. DROP `quotations_one_accepted_excise_per_source_uidx` (0414) — SO ต้นทางรับใบค่าสรรพสามิตได้หลายใบ (รายรอบ)
--  2. `orders_sales_order_unique_idx` (0160) แคบลงเป็นใบยื่นที่ **ไม่ผูก SO ค่าสรรพสามิต** (ไม่เรียกเก็บในระบบ = ทั้งใบ · V12)
--     ใบยื่นรายรอบกันซ้ำด้วย `orders_excise_sales_order_uidx` (0417 · หนึ่งใบต่อ SO ค่าสรรพสามิต) ที่มีอยู่แล้ว
--  3. `accept_excise_quotation_atomic` (0415) เขียนทับทั้งตัว — ถอดด่าน `excise_source_already_accepted` ·
--     ใส่ด่านจำนวน: ผลรวมจำนวนของใบที่รับแล้ว + ใบนี้ ต่อบรรทัด SO ต้นทาง ต้องไม่เกินหน่วยของบรรทัด SO
--     (หน่วย = COALESCE("packQty", 1) × qty — ตัวเดียวกับ lineUnitsTotal ที่ใบยื่นใช้) ⇒ `excise_quantity_exceeds_remaining`
--     · ใบที่มีบรรทัดไม่ผูกบรรทัด SO (ไม่ควรมี — ตัวสร้างบรรทัดใส่ลิงก์ตั้งแต่ PR2) = ใช้กติกาเดิม "รับได้ใบเดียว"
--     ⚠️ ฟังก์ชันนี้เกิดที่ 0415 ทั้งตัวและไม่มีไฟล์ไหนปะทับ ⇒ CREATE OR REPLACE ทั้งตัวได้ (ไม่ต้องปะข้อความแบบ RPC เก่า)
--  4. `sales_orders` — คอลัมน์ "ปิดยอดค้าง" (V11 · ว่าง = ยังเปิด) · จอ/route ใช้ใน PR7b · ด่านในแอปอ่านตั้งแต่ PR7a
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน merge PR7a** — โค้ดชุดนั้นเลือกคอลัมน์ข้อ 4 และพึ่งด่านข้อ 3
--     รันแล้วโค้ดที่ deploy อยู่ (ก่อน PR7a) ทำงานเหมือนเดิม: ด่านในแอปยังกันใบที่สองบน SO เดียว (exciseQuotationBlocker)
--  ✅ รันซ้ำได้ (IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: one_accepted = 0 · not_billed_uidx = 1 · old_uidx = 0 · accept_v2 = 1 · cols = 4 · accept_grant = 0 ──
--   SELECT
--    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'quotations_one_accepted_excise_per_source_uidx') AS one_accepted,
--    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_sales_order_not_billed_uidx') AS not_billed_uidx,
--    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_sales_order_unique_idx') AS old_uidx,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'accept_excise_quotation_atomic'
--        AND strpos(p.prosrc, 'excise_quantity_exceeds_remaining') > 0) AS accept_v2,
--    (SELECT count(*) FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'sales_orders'
--        AND column_name IN ('exciseRemainderClosedAt', 'exciseRemainderClosedById', 'exciseRemainderClosedByName', 'exciseRemainderClosedReason')) AS cols,
--    (SELECT count(*) FROM information_schema.routine_privileges
--      WHERE routine_schema = 'public' AND routine_name = 'accept_excise_quotation_atomic'
--        AND grantee IN ('anon', 'authenticated', 'PUBLIC')) AS accept_grant;
--
--  ── ถอยกลับ (ใช้ได้ตราบที่ยังไม่มี SO ลูกค้าที่มีใบค่าสรรพสามิตรับแล้วสองใบ และไม่มีใบยื่นรายรอบสองใบบน SO ลูกค้าเดียว) ──
--   BEGIN;
--   DO $$ BEGIN
--     IF EXISTS (SELECT 1 FROM public.quotations WHERE origin = 'excise' AND status = 'accepted'
--                 GROUP BY "sourceSalesOrderId" HAVING count(*) > 1)
--       OR EXISTS (SELECT 1 FROM public.orders WHERE "salesOrderId" IS NOT NULL GROUP BY "salesOrderId" HAVING count(*) > 1)
--     THEN RAISE EXCEPTION 'partial rounds exist'; END IF;
--   END $$;
--   -- แล้วรันส่วน accept_excise_quotation_atomic ของ 0415 ซ้ำ (CREATE OR REPLACE ทั้งตัว) ก่อนสร้างดัชนีคืน
--   DROP INDEX IF EXISTS public.orders_sales_order_not_billed_uidx;
--   CREATE UNIQUE INDEX IF NOT EXISTS orders_sales_order_unique_idx ON public.orders ("salesOrderId") WHERE "salesOrderId" IS NOT NULL;
--   CREATE UNIQUE INDEX IF NOT EXISTS quotations_one_accepted_excise_per_source_uidx
--     ON public.quotations ("sourceSalesOrderId") WHERE origin = 'excise' AND status = 'accepted';
--   ALTER TABLE public.sales_orders DROP COLUMN IF EXISTS "exciseRemainderClosedAt", DROP COLUMN IF EXISTS "exciseRemainderClosedById",
--     DROP COLUMN IF EXISTS "exciseRemainderClosedByName", DROP COLUMN IF EXISTS "exciseRemainderClosedReason";
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;

BEGIN;

-- ── 1) ใบที่รับแล้วหลายใบต่อ SO ต้นทาง (รายรอบ) ─────────────────────────────────────────────
DROP INDEX IF EXISTS public.quotations_one_accepted_excise_per_source_uidx;

-- ── 2) ใบยื่น: ไม่เรียกเก็บในระบบยังหนึ่งใบต่อ SO ลูกค้า · รายรอบกันด้วย orders_excise_sales_order_uidx (0417) ──────
CREATE UNIQUE INDEX IF NOT EXISTS orders_sales_order_not_billed_uidx
  ON public.orders ("salesOrderId")
  WHERE "salesOrderId" IS NOT NULL AND "exciseSalesOrderId" IS NULL;
DROP INDEX IF EXISTS public.orders_sales_order_unique_idx;

-- ── 3) รับใบค่าสรรพสามิต — ด่านจำนวนรายบรรทัด SO แทน "รับได้ใบเดียว" ───────────────────────────────
--  ด่าน (ลำดับเดียวกับ 0415): origin excise · สถานะรับได้ · มีบรรทัด · อนุมัติแล้ว · fingerprint ตรง ·
--  SO ลูกค้าต้นทางยังอนุมัติ · ไม่ถูกแทน · เป็นใบ pipeline · ไม่ตัดสิน "ไม่เรียกเก็บในระบบ" · ⭐ จำนวนไม่เกินคงเหลือ
--  ⚠️ ล็อก SO ต้นทาง FOR UPDATE ก่อนนับ — สองคนรับสองรอบของ SO เดียวพร้อมกัน = ตัวที่สองรอตัวแรก commit แล้วนับใบนั้นด้วย
CREATE OR REPLACE FUNCTION public.accept_excise_quotation_atomic(
  p_quote_id text,
  p_current_fingerprint text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_source public.sales_orders%ROWTYPE;
  v_accepted public.quotations%ROWTYPE;
  v_now timestamptz := now();
  v_unlinked boolean;
  v_over text;
BEGIN
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.origin IS DISTINCT FROM 'excise' THEN RAISE EXCEPTION 'excise_quotation_origin_invalid'; END IF;
  IF v_quote.status IN ('accepted', 'cancelled', 'rejected', 'revised', 'closed') THEN
    RAISE EXCEPTION 'quotation_not_acceptable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;
  IF v_quote."approvalStatus" IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'quotation_approval_required';
  END IF;
  IF v_quote."approvalFingerprint" IS NULL OR v_quote."approvalFingerprint" <> p_current_fingerprint THEN
    RAISE EXCEPTION 'quotation_approval_stale';
  END IF;

  SELECT * INTO v_source FROM public.sales_orders WHERE id = v_quote."sourceSalesOrderId" FOR UPDATE;
  IF NOT FOUND OR v_source.origin IS DISTINCT FROM 'pipeline' OR v_source.status IS DISTINCT FROM 'approved'
     OR v_source."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'excise_source_order_invalid';
  END IF;
  IF v_source."exciseNotBilledKind" IS NOT NULL THEN
    RAISE EXCEPTION 'excise_source_not_billed';
  END IF;

  -- บรรทัดที่ไม่ผูกบรรทัด SO (ใบนี้หรือใบที่รับแล้วของ SO เดียวกัน) = นับรายบรรทัดไม่ได้ ⇒ กติกาเดิม "รับได้ใบเดียว"
  SELECT EXISTS (
    SELECT 1
      FROM public.quotation_lines ql
      JOIN public.quotations q ON q.id = ql."quotationId"
     WHERE (q.id = v_quote.id
            OR (q."sourceSalesOrderId" = v_source.id AND q.origin = 'excise' AND q.status = 'accepted'))
       AND COALESCE(ql.metadata->>'sourceSalesOrderLineId', '') = ''
  ) INTO v_unlinked;
  IF v_unlinked THEN
    IF EXISTS (
      SELECT 1 FROM public.quotations
       WHERE "sourceSalesOrderId" = v_source.id AND origin = 'excise' AND status = 'accepted' AND id <> v_quote.id
    ) THEN
      RAISE EXCEPTION 'excise_source_already_accepted';
    END IF;
  ELSE
    WITH this_round AS (
      SELECT ql.metadata->>'sourceSalesOrderLineId' AS line_id, sum(ql.qty) AS qty, min(ql."fgCode") AS fg_code,
             min(ql.metadata->>'sourceFgCode') AS source_fg
        FROM public.quotation_lines ql
       WHERE ql."quotationId" = v_quote.id
       GROUP BY 1
    ), accepted AS (
      SELECT ql.metadata->>'sourceSalesOrderLineId' AS line_id, sum(ql.qty) AS qty
        FROM public.quotation_lines ql
        JOIN public.quotations q ON q.id = ql."quotationId"
       WHERE q."sourceSalesOrderId" = v_source.id AND q.origin = 'excise' AND q.status = 'accepted' AND q.id <> v_quote.id
       GROUP BY 1
    )
    SELECT string_agg(COALESCE(t.source_fg, t.fg_code, t.line_id), ', ' ORDER BY t.line_id) INTO v_over
      FROM this_round t
      LEFT JOIN accepted a ON a.line_id = t.line_id
      LEFT JOIN public.sales_order_lines sol ON sol.id = t.line_id AND sol."salesOrderId" = v_source.id
     WHERE sol.id IS NULL
        OR t.qty + COALESCE(a.qty, 0) > COALESCE(sol."packQty", 1) * sol.qty + 0.000001;
    IF v_over IS NOT NULL THEN
      RAISE EXCEPTION 'excise_quantity_exceeds_remaining: %', v_over;
    END IF;
  END IF;

  UPDATE public.quotations SET
    status = 'accepted',
    "acceptedAt" = v_now,
    "acceptedBy" = COALESCE(p_actor_name, p_actor_id),
    "updatedAt" = v_now
  WHERE id = v_quote.id
  RETURNING * INTO v_accepted;

  RETURN jsonb_build_object('quotation', to_jsonb(v_accepted));
END;
$$;

REVOKE ALL ON FUNCTION public.accept_excise_quotation_atomic(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_excise_quotation_atomic(text, text, text, text) TO service_role;

-- ── 4) ปิดยอดค้าง (V11) — SA ปิดส่วนที่จะไม่ส่งแล้ว · ว่าง = ยังเปิด ─────────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "exciseRemainderClosedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "exciseRemainderClosedById" text,
  ADD COLUMN IF NOT EXISTS "exciseRemainderClosedByName" text,
  ADD COLUMN IF NOT EXISTS "exciseRemainderClosedReason" text;

COMMIT;

NOTIFY pgrst, 'reload schema';
