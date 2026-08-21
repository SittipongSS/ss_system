-- ============================================================
--  Migration 0279: เดือนที่นับ Actual = เดือนที่ **อนุมัติใบสั่งขาย** (approvedAt)
--  ไม่ใช่เดือนของวันที่บนหัวใบ (orderDate)
--
--  ── ปัญหาที่เจอจริง ───────────────────────────────────────────────────────
--  Actual เกิดขึ้นได้ก็ต่อเมื่อ SO ถูก **อนุมัติ** (sync_sales_order_actual นับเฉพาะ
--  status='approved') แต่เดือนที่เอายอดไปลงกลับอ่านจาก "orderDate" = วันที่บนหัวใบ
--  ซึ่งเป็นวันที่คนขายพิมพ์ไว้ตอนร่าง — คนละวันกับวันที่บัญชี/ผู้อนุมัติกดอนุมัติ
--
--  ⭐ prod 2026-08-21: SO อนุมัติแล้ว 45 ใบ · approvedAt ว่าง 0 ใบ · **1 ใบที่เดือน
--     ไม่ตรงกัน** — SO-26080054-0 (DEAL-mt1efgz821eal) orderDate 2026-07-07 แต่
--     อนุมัติ 2026-08-20 ⇒ ยอด 231,525 ไปลงเดือน 7 ทั้งที่เพิ่งอนุมัติเดือน 8
--     (ดีลใบนี้ forecastMonth = 2026-08 อยู่แล้ว — หลังแก้ FC กับ Actual จะกลับมา
--     อยู่เดือนเดียวกันตามกติกา 2026-08-05 ที่ FC ของดีล Won ย้ายตามเดือนที่ปิด)
--
--  ── กติกาใหม่ (มติผู้ใช้ 2026-08-21) ───────────────────────────────────────
--  wonMonth = เดือนของ max("approvedAt") ในเวลาไทย · ถอยไป orderDate เฉพาะแถวเก่า
--  ที่ไม่มี approvedAt (คอลัมน์เพิ่มที่ 0108 — ตอนนี้ prod ไม่มีแถวแบบนั้นแล้ว)
--
--  ⚠️ เวลาไทยสำคัญ: approvedAt เป็น timestamptz และ session ของ Supabase เป็น UTC —
--  ถ้า to_char ตรง ๆ ใบที่อนุมัติ 1 ส.ค. เวลา 02:00 น. (ไทย) จะกลายเป็นเดือน ก.ค.
--  จึงต้อง AT TIME ZONE 'Asia/Bangkok' ก่อนเสมอ
--
--  ── สิ่งที่ไฟล์นี้แก้ ──────────────────────────────────────────────────────
--  1) sync_sales_order_actual  (นิยามล่าสุดอยู่ที่ 0108)
--  2) enforce_sales_order_actual_on_deal (นิยามล่าสุดอยู่ที่ 0110)
--  3) trigger บน sales_orders — เพิ่ม "approvedAt" ในรายการคอลัมน์ที่ปลุก trigger
--     (เดิมปลุกเมื่อ status/actualAmount/orderDate/dealId เปลี่ยน — พอเดือนมาจาก
--     approvedAt แล้ว การแก้ค่านั้นต้องปลุกด้วย ไม่งั้น cache ค้างเดือนเก่า)
--  4) backfill ดีลที่มี SO อนุมัติแล้ว
--
--  ⚠️ backfill วนเฉพาะดีลที่ **มี SO อนุมัติแล้ว** (ต่างจาก 0110 ที่วนทุกดีล) —
--  วนทุกดีลจะทับ metadata.actualSource ของดีล legacy (มติ 2026-08-08 · ดีลย้าย
--  ระบบที่กรอกมูลค่าปิดตรง ๆ) ให้กลายเป็น 'sale_order' แล้ว wonValue ถูกล้างเป็น 0
--
--  Idempotent — รันซ้ำได้ (CREATE OR REPLACE + backfill คำนวณจากของจริงทุกครั้ง)
--  ⚠ รันมือบน Supabase SQL Editor
-- ============================================================

-- ── 1) ยอด/เดือน Actual ของดีล — เดือนมาจากวันที่อนุมัติ ────────────────────
CREATE OR REPLACE FUNCTION public.sync_sales_order_actual(p_deal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
BEGIN
  SELECT COALESCE(sum("actualAmount"), 0),
         to_char(max(COALESCE("approvedAt" AT TIME ZONE 'Asia/Bangkok', "orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'approved';

  UPDATE public.sales_deals d SET
    "wonValue" = v_actual,
    metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonMonth', v_won_month,
      'wonValueExVat', v_actual
    ),
    "updatedAt" = now()
  WHERE d.id = p_deal_id;
END;
$$;

-- ── 2) ด่านกันไม่ให้ RPC ฝั่งใบเสนอราคาเขียน Actual เอง (0110) ───────────────
CREATE OR REPLACE FUNCTION public.enforce_sales_order_actual_on_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
BEGIN
  SELECT COALESCE(sum(so."actualAmount"), 0),
         to_char(max(COALESCE(so."approvedAt" AT TIME ZONE 'Asia/Bangkok', so."orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'approved';

  NEW."wonValue" := v_actual;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'actualSource', 'sale_order',
    'wonMonth', v_won_month,
    'wonValueExVat', v_actual
  );
  RETURN NEW;
END;
$$;

-- ── 3) แก้ approvedAt แล้วต้องคำนวณเดือนใหม่ด้วย ────────────────────────────
DROP TRIGGER IF EXISTS sales_orders_sync_actual_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_sync_actual_trg
AFTER INSERT OR UPDATE OF status, "actualAmount", "orderDate", "approvedAt", "dealId" OR DELETE
ON public.sales_orders FOR EACH ROW
EXECUTE FUNCTION public.sales_order_actual_trigger();

-- ── 4) backfill ดีลเก่า — เฉพาะดีลที่มี SO อนุมัติแล้ว ──────────────────────
DO $$
DECLARE v_deal_id text;
BEGIN
  FOR v_deal_id IN
    SELECT DISTINCT "dealId"
    FROM public.sales_orders
    WHERE status = 'approved' AND "dealId" IS NOT NULL
  LOOP
    PERFORM public.sync_sales_order_actual(v_deal_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
