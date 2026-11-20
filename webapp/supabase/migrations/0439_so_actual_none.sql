-- ============================================================
--  Migration 0439: ใบสั่งขาย "ไม่นับ Actual" — ตัวเลือกที่สามตอน AE Sup อนุมัติ
--                  (มติเจ้าของ 20/11/2026 ข้อ 1–4 · docs/so-installment-actual.md หัวข้อ "ไม่นับ Actual (0439)")
--
--  ⭐ คำขอ: ตอนอนุมัติ Actual อยากให้เลือกได้ว่า ไม่นับ Actual / นับ Actual เต็ม / นับ Actual รายงวด
--    · ข้อ 1 ไม่นับ = **ถาวร** — อยากนับทีหลัง: ย้อนการอนุมัติ → Rev. → อนุมัติใหม่แบบเต็ม/รายงวด (ทางเดียวกับมติข้อ 8 ของ 0412)
--    · ข้อ 2 บังคับเหตุผล 10–500 ตัวอักษร — เก็บบนใบ ("actualNoneReason") + เธรดดีล + audit
--    · ข้อ 3 รายงานยอดขายยังโชว์แถว ยอด Actual 0 + ป้าย + เหตุผล · ยอดเก็บโชว์ตามจริง (ชั้น JS — ไฟล์นี้ไม่แตะ)
--    · ข้อ 4 คำ "Actual ทั้งใบ" → "Actual เต็ม" (ชั้น JS — ค่าในฐานยังเป็น 'order')
--  ⭐ ใบ "ไม่นับ" ยังเป็น 'approved' ทุกอย่าง (งานบริการ · ผลิต · ภาษี · บัญชี · เก็บเงิน เดินปกติ) — ตัวเลือกนี้ย้ายแค่ Actual
--    · ไม่มีกองรอนับ/รออนุมัติ (ไม่ใช่รายงวด) · ดีลยัง Won (ใบเสนอราคาถูกรับ) — wonValue ไม่รวมใบนี้
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านลำดับรัน (ต้องมี 0412) + ลายนิ้วมือ: ฟังก์ชันที่คัดมาต้องยังเป็นเนื้อของ 0412 บนฐานจริง (mig_0439_live_drift)
--  §1 sales_orders: "actualNoneReason" text + CHECK sales_orders_actual_mode_valid รับ 'none' (กติกาเดียวกับ 'installment':
--     ใบ pipeline ที่ผ่านการอนุมัติมาแล้ว) + CHECK sales_orders_actual_none_reason (none ⇔ มีเหตุผล 10–500 ตัวอักษร)
--  §2 sales_order_actual_mode_guard (ของ 0412 §5a + ล้างเหตุผล): ใบกลับเป็นร่าง/รออนุมัติ/ตีกลับ = 'order' + เหตุผล NULL
--  §3 _deal_so_actual_extras + คู่ sync_sales_order_actual / enforce_sales_order_actual_on_deal — คัดจาก 0412 ทุกตัวอักษร
--     ยกเว้นสามจุด `"actualMode" <> 'installment'` → `= 'order'` (ใบ none ไม่บวกเข้า wonValue และไม่ลง actualByMonth)
--     · wonMonth ยังเป็นเดือนที่อนุมัติใบล่าสุด (ความหมายเดิม — ดีลมีใบอนุมัติแล้ว ไม่ใช่ "Won รอยื่น SO")
--     · ใบ 'order'/'installment' ได้ค่าเดิมทุกตัวอักษร (ตรวจท้ายไฟล์ ③)
--  §4 approve_sales_order_with_actual_mode — ลายเซ็นใหม่ 12 พารามิเตอร์ (+ p_actual_reason DEFAULT NULL) · DROP ตัว 11 พารามิเตอร์
--     · 'none': ใบ pipeline เท่านั้น (ยอด 0 ได้) · เหตุผล 10–500 ไม่งั้น sales_order_actual_none_reason_required
--     · ตั้ง "actualMode" + "actualNoneReason" ใน UPDATE เดียว (CHECK ต้องเห็นคู่กัน) · ล้างช่อง Actual รายงวดของงวดที่ยกมา
--       เหมือน 'order' (Rev. ของใบรายงวด)
--
--  ⛔ ไม่ backfill — ไม่มี INSERT/UPDATE/DELETE นอกตัวฟังก์ชัน · ไม่มีใบไหนเป็น 'none' จนกว่าจะมีคนเลือก ⇒ ทุกดีลค่าเดิม
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/FUNCTION IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE)
--  ⚠️ ลำดับขึ้นระบบ: รันไฟล์นี้บน SQL Editor **ก่อน** deploy โค้ด — โค้ดเดิมเรียก RPC ด้วย 11 ชื่อพารามิเตอร์ ซึ่งตัวใหม่รับได้
--     (p_actual_reason มีค่าตั้งต้น) · deploy ก่อนรัน = เลือก "ไม่นับ Actual" แล้วฐานตอบไม่รู้จักพารามิเตอร์ (ดัง ไม่ใช่นับผิดเงียบ ๆ)
--  ⚠️ ห้ามรัน 0412 §4/§5a/§6① ซ้ำหลังไฟล์นี้ — จะทับกลับเป็นสองแบบ (ใบ none กลับมานับเต็มใบ)
--
--  ── ตรวจหลังรัน (คำสั่งอ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   ① SELECT count(*) FILTER (WHERE "actualMode" = 'none') AS none_orders,
--             count(*) FILTER (WHERE "actualNoneReason" IS NOT NULL) AS reasons
--        FROM public.sales_orders;                                  -- คาด: 0 · 0 (ก่อนมีคนเลือก)
--   ② SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
--       WHERE p.proname = 'approve_sales_order_with_actual_mode';  -- คาด: แถวเดียว ลงท้าย "p_actual_reason text"
--   ③ ทุกดีล: wonValue = ค่าที่คู่ sync ตัวใหม่คิดได้ — คาด: won_value_diff = 0
--   SELECT count(*) AS deals,
--          count(*) FILTER (WHERE d."wonValue" IS DISTINCT FROM r.won_value) AS won_value_diff
--     FROM public.sales_deals d
--     CROSS JOIN LATERAL (
--       SELECT COALESCE(sum(o."actualAmount") FILTER (WHERE o.status = 'approved' AND o."actualMode" = 'order'), 0)
--                + COALESCE((SELECT x.counted FROM public._deal_so_actual_extras(d.id) x), 0) AS won_value
--         FROM public.sales_orders o
--        WHERE o."dealId" = d.id AND o.origin = 'pipeline'
--     ) r
--    WHERE d.metadata->>'actualSource' = 'sale_order';
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อนเสมอ · ถอยได้สะอาดเฉพาะตอนที่ยังไม่มีใบ none (① = 0) — มีแล้ว ต้องย้อนอนุมัติใบนั้นก่อน
--   1) รัน 0412 §4 (คู่ sync/enforce + _deal_so_actual_extras) และ §5a (guard) ซ้ำ ·
--   2) DROP FUNCTION approve_sales_order_with_actual_mode ตัว 12 พารามิเตอร์ แล้วรัน 0412 §6① + บรรทัดสิทธิ์ของตัวนั้นซ้ำ ·
--   3) DROP CONSTRAINT sales_orders_actual_none_reason · สร้าง sales_orders_actual_mode_valid ตาม 0412 §1 · DROP COLUMN "actualNoneReason" ·
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- ── §0 ด่านลำดับรัน ────────────────────────────────────────────────────────────────────────────
DO $pre$
DECLARE
  r record;
BEGIN
  IF to_regprocedure('public.approve_sales_order_with_signature_evidence_atomic(text, text, timestamptz, text, text, text, text, text, text, text)') IS NULL
     OR to_regprocedure('public._deal_so_actual_extras(text)') IS NULL
     OR to_regprocedure('public.sales_order_actual_mode_guard()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'actualMode') THEN
    RAISE EXCEPTION 'mig_0439_requires_0412 — รัน 0412 ก่อน';
  END IF;

  -- ฟังก์ชันที่ไฟล์นี้คัดจาก 0412 ต้องยังเป็นเนื้อของ 0412 (หรือของไฟล์นี้ — รันซ้ำ) บนฐานจริง — ใครปะทับไว้ = หยุด ไม่ทับเงียบ
  -- (บทเรียน 0425: ยกเนื้อจากไฟล์เก่ามา CREATE OR REPLACE ลบแพตช์ที่ปะไว้ทีหลัง) · เทียบ md5 ของเนื้อที่ยุบช่องว่างแล้ว (กันตัวแก้ SQL จัดบรรทัด)
  FOR r IN
    SELECT p.proname, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS h
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
       '_deal_so_actual_extras', 'sync_sales_order_actual', 'enforce_sales_order_actual_on_deal',
       'sales_order_actual_mode_guard', 'approve_sales_order_with_actual_mode'])
  LOOP
    IF NOT (jsonb_build_object(
      '_deal_so_actual_extras', jsonb_build_array('04d4edb23559ed29b56a818c329e48c9', '92df83b13bff8a1c12896716ffbe1161'),
      'sync_sales_order_actual', jsonb_build_array('f08ca093c28023e59078a87350d8cd83', 'f33d1ea7aacda544267d2e062b7a5920'),
      'enforce_sales_order_actual_on_deal', jsonb_build_array('027c6c9a969dd5b1e2d7b63cce14fcee', 'a1c3b4269130674019e823c307ab82ef'),
      'sales_order_actual_mode_guard', jsonb_build_array('2348c416bf41db42f7e547d0ed081c32', '53d803083278d96e74f44dfafeabcf12'),
      'approve_sales_order_with_actual_mode', jsonb_build_array('bc07caba21dc8918d32d09d2f2e29179', '182395ba660e71f8a3e9b8c26c103b71')
    ) -> r.proname) ? r.h THEN
      RAISE EXCEPTION 'mig_0439_live_drift % — เนื้อบนฐานไม่ตรง 0412/0439 (มีการปะทับ) · หยุด แจ้งผู้พัฒนา', r.proname;
    END IF;
  END LOOP;
END
$pre$;

-- ── §1 sales_orders: เหตุผลของ "ไม่นับ Actual" + CHECK ──────────────────────────────────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวชั้นนอก — serviceRoundsCopyPaths.test.mjs เก็บคอลัมน์จากรูปประโยคนี้แล้วบังคับให้ถูกตัดสินว่าทาง Rev./ใบร่างพาไปหรือไม่
--    ("actualNoneReason" = ไม่พา: เป็นของการอนุมัติแต่ละรอบเหมือน "actualMode" · Rev. อ่านค่าตั้งต้นจากใบก่อนหน้าผ่าน route)
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "actualNoneReason" text;

-- 'none' ได้เฉพาะใบ pipeline ที่ผ่านการอนุมัติมาแล้ว (กติกาเดียวกับ 'installment' ของ 0412) — ใบย้อนหลัง/ค่าสรรพสามิตไม่นับ Actual อยู่แล้ว
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_actual_mode_valid;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_actual_mode_valid CHECK (
    "actualMode" IN ('order', 'installment', 'none')
    AND ("actualMode" = 'order'
      OR (origin = 'pipeline' AND status NOT IN ('draft', 'pending_approval', 'rejected')))
  );

-- none ⇔ มีเหตุผล 10–500 ตัวอักษร (มติข้อ 2) · แบบอื่นไม่มีเหตุผลค้าง (guard §2 + RPC §4 ล้างให้)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_actual_none_reason;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_actual_none_reason CHECK (
    CASE WHEN "actualMode" = 'none'
      THEN char_length(btrim(COALESCE("actualNoneReason", ''))) BETWEEN 10 AND 500
      ELSE "actualNoneReason" IS NULL
    END
  );

COMMENT ON COLUMN public.sales_orders."actualMode" IS
  'แบบการนับ Actual (0412 · 0439): order = เต็มใบตอนอนุมัติใบ · installment = รายงวดตอน AE Sup อนุมัติงวด · none = ไม่นับ Actual ถาวร (เหตุผลใน "actualNoneReason") · ตั้งได้ทางเดียวคือ approve_sales_order_with_actual_mode · ใบกลับเป็นร่าง/รออนุมัติ/ตีกลับ = order';
COMMENT ON COLUMN public.sales_orders."actualNoneReason" IS
  'เหตุผลที่ผู้อนุมัติเลือก "ไม่นับ Actual" (0439 · 10–500 ตัวอักษร) — มีค่าเฉพาะใบ actualMode = none · ตั้งได้ทางเดียวคือ approve_sales_order_with_actual_mode';

-- ── §2 ใบกลับไปก่อนอนุมัติ = 'order' + ล้างเหตุผล (0412 §5a + บรรทัดเหตุผล) ─────────────────────────────────────
-- · ย้อนอนุมัติ (approval_revoked) คงแบบ + เหตุผลไว้ (ค่าตั้งต้นของตัวเลือกในโมดัลอนุมัติใบ Rev. อ่านจากใบเดิม)
CREATE OR REPLACE FUNCTION public.sales_order_actual_mode_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counted numeric;
  v_submitted numeric;
BEGIN
  IF NEW.status IN ('draft', 'pending_approval', 'rejected') THEN
    IF NEW."actualMode" IS DISTINCT FROM 'order' THEN
      NEW."actualMode" := 'order';
    END IF;
    NEW."actualNoneReason" := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT c.counted, c.submitted INTO v_counted, v_submitted
      FROM public._so_installment_actual_cache(NEW.id, NEW."actualAmount", NEW."totalAmount") c;
    NEW."actualCountedAmount" := v_counted;
    NEW."actualSubmittedAmount" := v_submitted;
  END IF;
  RETURN NEW;
END;
$$;

-- ── §3 คีย์ Actual ของดีล + คู่ sync/enforce — คัดจาก 0412 §3/§4 ทุกตัวอักษร ยกเว้น `<> 'installment'` → `= 'order'` สามจุด ─────────
-- (สองตัวต้องอยู่ไฟล์เดียวกันเสมอ — กติกา 0353) · ใบ none: ไม่บวก wonValue · ไม่ลง actualByMonth · ไม่มีกองรอนับ (ไม่ใช่รายงวด)
CREATE OR REPLACE FUNCTION public._deal_so_actual_extras(p_deal_id text, OUT counted numeric, OUT keys jsonb)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_by_month jsonb;
  v_pending numeric;
  v_pending_count integer;
  v_remaining jsonb;
BEGIN
  keys := '{}'::jsonb;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders o
     WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
  ) THEN
    RETURN;
  END IF;

  SELECT sum(i."actualAmount") INTO counted
    FROM public.sales_orders o
    JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
   WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
     AND o."actualMode" = 'installment' AND i."actualStatus" = 'approved';

  SELECT COALESCE(jsonb_object_agg(m.month, m.amount), '{}'::jsonb) INTO v_by_month
    FROM (
      SELECT e.month, sum(e.amount) AS amount
        FROM (
          SELECT to_char(COALESCE(o."approvedAt" AT TIME ZONE 'Asia/Bangkok', o."orderDate"::timestamp), 'YYYY-MM') AS month,
                 o."actualAmount" AS amount
            FROM public.sales_orders o
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'order'  -- 0439: ไม่นับ Actual (none) ไม่ลงเดือนไหน
          UNION ALL
          SELECT to_char(GREATEST(i."actualApprovedAt", o."approvedAt") AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM'),
                 i."actualAmount"
            FROM public.sales_orders o
            JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'installment' AND i."actualStatus" = 'approved'
        ) e
       WHERE e.month IS NOT NULL
       GROUP BY e.month
    ) m;
  keys := jsonb_build_object('actualByMonth', v_by_month);

  /* จำนวน = **ใบ** ที่มีงวดยื่นรออยู่ (review รอบสาม 26/10) ไม่ใช่จำนวนงวด — ทุกจอวาด soPendingCount + ตัวนี้เป็น "· n ใบ"
     (ใบหนึ่งอยู่กองเดียว: ใบรออนุมัติไม่มีงวดที่นับ/ยื่นได้ ⇒ ไม่นับซ้ำ) · ยอด = Σ ยอดประมาณของทุกงวดที่ยื่น */
  SELECT count(DISTINCT o.id), sum(x.estimate) INTO v_pending_count, v_pending
    FROM public.sales_orders o
    CROSS JOIN LATERAL public._so_installment_actual_estimates(o.id, o."actualAmount", o."totalAmount") x
   WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
     AND o."actualMode" = 'installment' AND x.actual_status = 'submitted';
  IF v_pending_count > 0 THEN
    keys := keys || jsonb_build_object('soInstPendingAmount', v_pending, 'soInstPendingCount', v_pending_count);
  END IF;

  /* กอง "รอนับรายงวด" — งวดที่ยังไม่ยื่น/ถูกตีกลับตามเดือนครบกำหนด
     + ใบรายงวดที่อนุมัติแล้วแต่ **ยังไม่มีงวดสักแถว** (ตัวหยุดยอดล้มหลังอนุมัติ · review 26/10): ยอดทั้งใบยังไม่นับ ⇒ ลง 'none'
       ไม่งั้นยอดทั้งใบหายจากทุกกอง (Actual 0 · รออนุมัติ 0 · ไม่ใช่ Won รอยื่น SO เพราะมี wonMonth) ขณะที่ตาราง SO นับเป็นรอนับรายงวด
       (salesOrderRemainingActual = actualAmount − นับแล้ว − ยื่นแล้ว) · มีงวดเมื่อไร trigger ของงวด sync ดีลใหม่ = ย้ายไปตามเดือนของงวดเอง */
  SELECT jsonb_object_agg(q.due_month, q.amount) INTO v_remaining
    FROM (
      SELECT r.due_month, sum(r.amount) AS amount
        FROM (
          SELECT COALESCE(to_char(x.due_date, 'YYYY-MM'), 'none') AS due_month, x.estimate AS amount
            FROM public.sales_orders o
            CROSS JOIN LATERAL public._so_installment_actual_estimates(o.id, o."actualAmount", o."totalAmount") x
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'installment' AND (x.actual_status IS NULL OR x.actual_status = 'rejected')
          UNION ALL
          SELECT 'none', o."actualAmount"
            FROM public.sales_orders o
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'installment' AND COALESCE(o."actualAmount", 0) > 0
             AND NOT EXISTS (SELECT 1 FROM public.sales_order_installments i WHERE i."salesOrderId" = o.id)
        ) r
       GROUP BY r.due_month
    ) q;
  IF v_remaining IS NOT NULL THEN
    keys := keys || jsonb_build_object('soInstRemainingByDue', v_remaining);
  END IF;
END;
$$;

COMMENT ON FUNCTION public._deal_so_actual_extras(text) IS
  'คีย์ Actual รายงวดของดีล (0412) — actualByMonth · soInstPendingAmount/Count · soInstRemainingByDue + ยอดงวดที่นับแล้ว · ผู้เรียก: sync_sales_order_actual / enforce_sales_order_actual_on_deal';

-- ── §4 cache Actual / ยอดรออนุมัติของดีล — คัดจาก 0360 ทุกตัวอักษร + ใบรายงวด (สองตัวต้องอยู่ไฟล์เดียวกันเสมอ) ──────────
--  · SELECT แรกบวกเฉพาะใบทั้งใบ (FILTER) แต่เดือนยังมาจากทุกใบที่อนุมัติ = เดือนที่อนุมัติใบล่าสุด (ความหมายเดิม)
--  · ใบทั้งใบล้วน (ทุกดีลวันนี้): counted = NULL ⇒ wonValue/wonValueExVat = Σ เดิม (ค่าและจำนวนทศนิยมเท่าเดิม) · keys มีแค่ actualByMonth
CREATE OR REPLACE FUNCTION public.sync_sales_order_actual(p_deal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
  v_pending numeric;
  v_pending_count integer;
  v_counted numeric;
  v_keys jsonb;
BEGIN
  SELECT COALESCE(sum("actualAmount") FILTER (WHERE "actualMode" = 'order'), 0),
         to_char(max(COALESCE("approvedAt" AT TIME ZONE 'Asia/Bangkok', "orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'approved' AND origin = 'pipeline';

  SELECT COALESCE(sum("actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'pending_approval' AND origin = 'pipeline';

  SELECT x.counted, x.keys INTO v_counted, v_keys FROM public._deal_so_actual_extras(p_deal_id) x;
  IF v_counted IS NOT NULL THEN
    v_actual := v_actual + v_counted;
  END IF;

  UPDATE public.sales_deals d SET
    "wonValue" = v_actual,
    metadata = (COALESCE(d.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount'
        - 'actualByMonth' - 'soInstPendingAmount' - 'soInstPendingCount' - 'soInstRemainingByDue')
      || jsonb_build_object(
        'actualSource', 'sale_order',
        'wonMonth', v_won_month,
        'wonValueExVat', v_actual
      )
      || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
        'soPendingAmount', v_pending,
        'soPendingCount', v_pending_count
      ) ELSE '{}'::jsonb END
      || COALESCE(v_keys, '{}'::jsonb),
    "updatedAt" = now()
  WHERE d.id = p_deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sales_order_actual_on_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
  v_pending numeric;
  v_pending_count integer;
  v_counted numeric;
  v_keys jsonb;
BEGIN
  SELECT COALESCE(sum(so."actualAmount") FILTER (WHERE so."actualMode" = 'order'), 0),
         to_char(max(COALESCE(so."approvedAt" AT TIME ZONE 'Asia/Bangkok', so."orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'approved' AND so.origin = 'pipeline';

  SELECT COALESCE(sum(so."actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'pending_approval' AND so.origin = 'pipeline';

  SELECT x.counted, x.keys INTO v_counted, v_keys FROM public._deal_so_actual_extras(NEW.id) x;
  IF v_counted IS NOT NULL THEN
    v_actual := v_actual + v_counted;
  END IF;

  NEW."wonValue" := v_actual;
  NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount'
      - 'actualByMonth' - 'soInstPendingAmount' - 'soInstPendingCount' - 'soInstRemainingByDue')
    || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonMonth', v_won_month,
      'wonValueExVat', v_actual
    )
    || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
      'soPendingAmount', v_pending,
      'soPendingCount', v_pending_count
    ) ELSE '{}'::jsonb END
    || COALESCE(v_keys, '{}'::jsonb);
  RETURN NEW;
END;
$$;

-- ── §4 ตัวห่อของการอนุมัติใบ: เลือกแบบการนับ Actual (+ เหตุผลของ "ไม่นับ") ในคลิกเดียวกัน ─────────────────────────────
-- พารามิเตอร์ 10 ตัวแรก = ตัวอนุมัติใบเดิมทุกตัว ลำดับเดียวกัน · ตัวที่ 11 p_actual_mode (ของ 0412) · ตัวที่ 12 p_actual_reason (ใหม่)
-- ⚠️ ลายเซ็นเปลี่ยน ⇒ DROP ตัว 11 พารามิเตอร์ก่อน ไม่งั้นได้สองตัวซ้อน (overload — PostgREST เลือกไม่ได้)
DROP FUNCTION IF EXISTS public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.approve_sales_order_with_actual_mode(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_approval_note text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_separation_override_reason text DEFAULT NULL,
  p_actual_mode text DEFAULT NULL,
  p_actual_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mode text := btrim(COALESCE(p_actual_mode, ''));
  v_reason text := NULLIF(btrim(COALESCE(p_actual_reason, '')), '');
  v_order public.sales_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_mode NOT IN ('order', 'installment', 'none') THEN
    RAISE EXCEPTION 'sales_order_actual_mode_invalid';
  END IF;
  -- มติข้อ 2 (0439): ไม่นับ Actual ต้องมีเหตุผล 10–500 ตัวอักษร · ตรวจก่อนแตะอะไร
  IF v_mode = 'none' AND char_length(COALESCE(v_reason, '')) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'sales_order_actual_none_reason_required';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF FOUND AND v_mode = 'installment'
     AND (NOT COALESCE(v_order.origin = 'pipeline', false) OR COALESCE(v_order."totalAmount", 0) <= 0) THEN
    RAISE EXCEPTION 'sales_order_actual_mode_ineligible';
  END IF;
  -- ใบย้อนหลัง/ค่าสรรพสามิตไม่นับ Actual อยู่แล้ว (CHECK ก็กัน) — บอกเหตุตรง ๆ แทน CHECK ดิบ · ยอด 0 เลือกได้
  IF FOUND AND v_mode = 'none' AND NOT COALESCE(v_order.origin = 'pipeline', false) THEN
    RAISE EXCEPTION 'sales_order_actual_none_ineligible';
  END IF;

  -- ตัวอนุมัติใบเดิมทั้งตัว (สิทธิ์ · สถานะ · CAS · ความครบ · หลักฐานลายเซ็น · งานบริการ) — ล้ม = ไม่มีอะไรถูกเขียน
  v_result := public.approve_sales_order_with_signature_evidence_atomic(
    p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint, p_approval_note,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team, p_separation_override_reason);

  -- ตั้งแบบ + เหตุผลใน UPDATE เดียว (CHECK sales_orders_actual_none_reason ต้องเห็นคู่กัน) · "updatedAt" ไม่ขยับ (= เวอร์ชันของการอนุมัติ)
  -- · sync ของดีลวิ่งอีกรอบจาก trigger 0279 ("actualMode" อยู่ในรายการคอลัมน์) ⇒ ใบ none หลุดจาก wonValue ในทรานแซกชันเดียวกัน
  UPDATE public.sales_orders
     SET "actualMode" = v_mode,
         "actualNoneReason" = CASE WHEN v_mode = 'none' THEN v_reason ELSE NULL END
   WHERE id = p_order_id
     AND ("actualMode" IS DISTINCT FROM v_mode
       OR "actualNoneReason" IS DISTINCT FROM CASE WHEN v_mode = 'none' THEN v_reason ELSE NULL END);

  -- เต็ม/ไม่นับ: ช่อง Actual รายงวดที่ติดมากับงวด (Rev. ของใบรายงวด — 0376 ย้ายทั้งแถว) ไม่มีความหมายแล้ว ⇒ ล้าง
  -- ไม่ล้าง = งวดที่ "ยื่นแล้ว" ค้างล็อกการปรับแผนตลอดไป (ดึงกลับ/อนุมัติ/ตีกลับทำได้เฉพาะใบรายงวด) · ประวัติอยู่ที่ audit ของ route
  IF v_mode IN ('order', 'none') THEN
    UPDATE public.sales_order_installments
       SET "actualStatus" = NULL, "actualAmount" = NULL, "actualApprovedVia" = NULL, "actualNote" = NULL,
           "actualSubmittedAt" = NULL, "actualSubmittedById" = NULL, "actualSubmittedByName" = NULL,
           "actualApprovedAt" = NULL, "actualApprovedById" = NULL, "actualApprovedByName" = NULL,
           "actualRejectedAt" = NULL, "actualRejectedById" = NULL, "actualRejectedByName" = NULL, "actualRejectedReason" = NULL,
           "updatedAt" = now()
     WHERE "salesOrderId" = p_order_id
       AND ("actualStatus" IS NOT NULL OR "actualSubmittedAt" IS NOT NULL OR "actualRejectedAt" IS NOT NULL);
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  RETURN jsonb_set(v_result, '{document}', to_jsonb(v_order)) || jsonb_build_object('actualMode', v_order."actualMode");
END;
$$;

COMMENT ON FUNCTION public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text, text) IS
  'อนุมัติใบสั่งขาย + เลือกแบบการนับ Actual (0412 · 0439) — เรียกตัวอนุมัติใบเดิมทั้งตัวแล้วตั้ง "actualMode" (+ "actualNoneReason") ในทรานแซกชันเดียวกัน · installment ต้องเป็นใบ pipeline ยอด > 0 · none ต้องเป็นใบ pipeline + เหตุผล 10–500';

-- ── สิทธิ์ (แพตเทิร์น 0336 — ลายเซ็นเต็มทุกบรรทัด) ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public._deal_so_actual_extras(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._deal_so_actual_extras(text) TO service_role;
REVOKE ALL ON FUNCTION public.sync_sales_order_actual(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sales_order_actual(text) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_actual_mode_guard() FROM PUBLIC, anon, authenticated, service_role;

-- ── §5 ตรวจท้าย ─────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_left integer;
  v_overloads integer;
BEGIN
  -- ไม่เหลือ `<> 'installment'` ในสามตัวคิดยอดดีล (ใบ none ต้องไม่ถูกนับเป็นเต็มใบ)
  SELECT count(*) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         regexp_matches(p.prosrc, $re$"actualMode" <> 'installment'$re$, 'g')
   WHERE n.nspname = 'public'
     AND p.proname IN ('_deal_so_actual_extras', 'sync_sales_order_actual', 'enforce_sales_order_actual_on_deal');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'mig_0439_order_filter_left %', v_left;
  END IF;

  SELECT count(*) INTO v_overloads FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_sales_order_with_actual_mode';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'mig_0439_rpc_overloads %', v_overloads;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
