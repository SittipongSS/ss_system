-- ============================================================
--  Migration 0353: ยอด "รออนุมัติ" ของใบสั่งขาย — เก็บคู่กับ Actual บนดีล
--
--  ── ปัญหาที่เจอจริง (ผู้ใช้แจ้ง 2026-09-11) ─────────────────────────────────
--  "SO ที่รออนุมัติ มันกลายเป็น 0" — ดีลปิด Won ตั้งแต่กดรับใบเสนอราคา (0284) แต่
--  Actual นับเฉพาะ SO ที่ **อนุมัติแล้ว** (0110/0279) ⇒ ช่วงที่ SO ยื่นแล้วรอหัวหน้า
--  อนุมัติ ดีลมี wonValue = 0 และยอดของมันไม่โผล่ที่ไหนเลย: หลุดจาก FC คงเหลือ
--  (เพราะ Won แล้ว) และยังไม่เข้า Actual (เพราะยังไม่อนุมัติ)
--  ⭐ prod 2026-09-11: SO รออนุมัติ 8 ใบ รวม 993,000 (ก่อน VAT) · ทุกใบอยู่บนดีล Won
--     ที่ wonValue = 0 และไม่มี SO อนุมัติแล้วสักใบ
--
--  ── กติกาใหม่ (มติผู้ใช้ 2026-09-11) ───────────────────────────────────────
--  โชว์ยอดของ SO ที่รออนุมัติด้วย แต่ **แยกจาก Actual ให้เห็นชัด** ทั้งระบบ
--  - Actual (wonValue / wonValueExVat / wonMonth) คงนิยามเดิมทุกตัวอักษร — นับเฉพาะ
--    status = 'approved' · ยอดรออนุมัติ **ห้าม** บวกเข้า wonValue เด็ดขาด
--    (เป้า/%/ขาดเกิน/ยอดที่หน้า "เติมยอดจากระบบ" คัดลอกไปเก็บถาวร อ่าน wonValue ทั้งหมด)
--  - ยอดรออนุมัติ = Σ "actualAmount" (ก่อน VAT ตัวเดียวกับ Actual) ของ SO ที่
--    status = 'pending_approval' **เท่านั้น** — ร่าง/ตีกลับ/ย้อนอนุมัติ/ยกเลิก ไม่นับ
--    (ห้ามใช้ submittedAt IS NOT NULL: ตีกลับไม่ล้าง submittedAt)
--  - เดือนของยอดรออนุมัติ = **เดือนปัจจุบัน (เวลาไทย) เสมอ** — อนุมัติย้อนหลังไม่ได้
--    ถ้าอนุมัติวันนี้ยอดก็ลงเดือนนี้ ⇒ เดือนเปลี่ยนตามนาฬิกา จึง **ไม่เก็บเดือนใน DB**
--    (cache ที่อิง now() เน่าเอง) ฝั่ง JS คิดตอนอ่านด้วย datePeriods.currentMonth()
--
--  ── ที่เก็บ: metadata สองคีย์บน sales_deals ─────────────────────────────────
--    soPendingAmount  numeric  Σ actualAmount ของ SO รออนุมัติ
--    soPendingCount   integer  จำนวนใบ
--  มีคีย์ = มียอดรออนุมัติ · ไม่มี SO รออนุมัติ = **ถอดคีย์ทิ้ง** (ไม่เขียน 0 ค้างทุกดีล)
--  ⚠️ ชื่อเลี่ยงคำว่า pending เปล่า ๆ — มีความหมายอื่นอยู่แล้ว (financeStatus 'pending'
--     = รอบัญชีตรวจ · สถานะงวด 'pending' · performanceMath statusOf 'pending' = รอปิดยอด)
--
--  ── สิ่งที่ไฟล์นี้แก้ ──────────────────────────────────────────────────────
--  1) sync_sales_order_actual            (นิยามล่าสุดอยู่ที่ 0279 — คัดมาทั้งก้อน)
--  2) enforce_sales_order_actual_on_deal (นิยามล่าสุดอยู่ที่ 0279 — คัดมาทั้งก้อน)
--     ⚠️ ต้องแก้ **คู่กัน** และให้ enforce เป็นเจ้าของคีย์ (ถอดแล้วใส่ใหม่ทุกครั้ง):
--     enforce เป็น BEFORE UPDATE OF stage/wonValue/metadata ไม่มีเงื่อนไข (0110) = คนเขียน
--     คนสุดท้ายของทุกแถว · PATCH ดีลเอา metadata ทั้งก้อนของหน้าจอไป merge ทับ
--     (deals/[id]/route.js) ถ้า enforce ไม่คิดใหม่ ค่าเก่าจากหน้าจอจะค้างทับค่าจริง
--  3) trigger บน sales_orders **ไม่ต้องแก้** — ทุกทางเปลี่ยนสถานะ (ยื่น/ดึงกลับ/อนุมัติ/
--     ตีกลับ/ยกเลิก/ย้อนอนุมัติ/ออก Rev./คืนสถานะ/ลบ) แตะ status อยู่แล้ว และเดือนของยอด
--     รออนุมัติไม่ได้มาจากคอลัมน์ใดของใบ
--  4) backfill เฉพาะดีลที่มี SO รออนุมัติ
--
--  ⚠️ backfill ห้ามวนทุกดีลแบบ 0110 — ทุก UPDATE metadata ปลุก enforce ซึ่งประทับ
--  actualSource = 'sale_order' แล้วคิด wonValue ใหม่จาก SO อนุมัติ (ดีลย้ายระบบที่กรอก
--  มูลค่าปิดตรง ๆ จะถูกล้างเป็น 0) · ดีลที่มี SO อยู่แล้วถูกประทับ 'sale_order' ไปตั้งแต่
--  ตอน INSERT SO แล้ว การวนเฉพาะกลุ่มนี้จึงไม่เปลี่ยนอะไรนอกจากเติมสองคีย์
--
--  CREATE OR REPLACE ลายเซ็นเดิม ⇒ สิทธิ์ EXECUTE เดิมอยู่ครบ (sync = service_role, 0108)
--  Idempotent — รันซ้ำได้ (backfill คำนวณจากของจริงทุกครั้ง)
--  ⚠ รันมือบน Supabase SQL Editor
-- ============================================================

-- ── 1) cache Actual + ยอดรออนุมัติของดีล (ปลุกจาก trigger บน sales_orders) ──────
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
BEGIN
  SELECT COALESCE(sum("actualAmount"), 0),
         to_char(max(COALESCE("approvedAt" AT TIME ZONE 'Asia/Bangkok', "orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'approved';

  SELECT COALESCE(sum("actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'pending_approval';

  UPDATE public.sales_deals d SET
    "wonValue" = v_actual,
    metadata = (COALESCE(d.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount')
      || jsonb_build_object(
        'actualSource', 'sale_order',
        'wonMonth', v_won_month,
        'wonValueExVat', v_actual
      )
      || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
        'soPendingAmount', v_pending,
        'soPendingCount', v_pending_count
      ) ELSE '{}'::jsonb END,
    "updatedAt" = now()
  WHERE d.id = p_deal_id;
END;
$$;

-- ── 2) ด่านบนทุกการเขียนดีล — เป็นเจ้าของทั้ง Actual และยอดรออนุมัติ ───────────
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
BEGIN
  SELECT COALESCE(sum(so."actualAmount"), 0),
         to_char(max(COALESCE(so."approvedAt" AT TIME ZONE 'Asia/Bangkok', so."orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'approved';

  SELECT COALESCE(sum(so."actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'pending_approval';

  NEW."wonValue" := v_actual;
  NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount')
    || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonMonth', v_won_month,
      'wonValueExVat', v_actual
    )
    || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
      'soPendingAmount', v_pending,
      'soPendingCount', v_pending_count
    ) ELSE '{}'::jsonb END;
  RETURN NEW;
END;
$$;

-- ── 3) backfill — เฉพาะดีลที่มี SO รออนุมัติ ──────────────────────────────────
DO $$
DECLARE v_deal_id text;
BEGIN
  FOR v_deal_id IN
    SELECT DISTINCT "dealId"
    FROM public.sales_orders
    WHERE status = 'pending_approval' AND "dealId" IS NOT NULL
  LOOP
    PERFORM public.sync_sales_order_actual(v_deal_id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
