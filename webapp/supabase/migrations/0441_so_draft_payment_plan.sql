-- ============================================================
--  Migration 0441: แผนงวดชำระของใบสั่งขายเอง — ปรับได้ตั้งแต่หน้าสร้าง SO และตอนใบเป็นร่าง/ถูกตีกลับ
--                  (มติเจ้าของ 27/11/2026 สี่ข้อ · docs/so-payment-tracking-plan.md หัวข้อ "ปรับแผนงวดก่อนอนุมัติ (0441)")
--
--  ⭐ ปัญหา: ช่วงตั้งแต่ QT ปิด Won ถึง SO อนุมัติ แก้ยอด/จำนวนงวดไม่ได้เลย — งวดร่างเดินตามแผนของ QT สด ๆ
--    (withLiveAmounts) และ freezeInstallments ทับงวดจากแผน QT ตอนอนุมัติ · QT ที่ออก SO แล้วแก้ไม่ได้ (accepted)
--    · ทางเดียวที่มีคือ "ปรับแผนงวด" หลังอนุมัติ (0377 · AE Sup/admin)
--  ⭐ มติ 27/11:
--    ข้อ 1 ปรับได้ที่หน้าสร้าง SO + ตอนใบเป็นร่าง/ถูกตีกลับ · ยื่นอนุมัติแล้วล็อก (หลังอนุมัติใช้ปุ่มเดิมของ 0377)
--    ข้อ 2 คนปรับ = คนที่แก้ใบร่างได้อยู่แล้ว (SA เจ้าของใบ + AE Sup/admin ในขอบเขตแก้) — ด่านอยู่ที่ route
--    ข้อ 3 กระดาษ SO พิมพ์แผนของใบ · QT ที่ลูกค้าถือไม่แตะ · หน้าใบขึ้นป้าย "แผนต่างจาก QT"
--    ข้อ 4 บังคับเหตุผล 10–500 ตัวอักษร (เก็บบนใบ + audit)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §1 sales_orders: "paymentPlan" jsonb (รูปเดียวกับ quotations."paymentPlan") + ผู้ตั้ง/เวลา/เหตุผล
--     · NULL = ใบเดินตามแผนของ QT (ทุกใบเดิม · ไม่ backfill)
--  §2 CHECK: รูปแผน · มีแผน ⇔ มีเหตุผล 10–500 + ผู้ตั้ง + เวลา · ใบย้อนหลังไม่มีแผน (งวดมาจากฟอร์มคีย์ใบ)
--  §3 trigger sales_order_payment_plan_guard (BEFORE UPDATE): ห้าคอลัมน์นี้เปลี่ยนได้เฉพาะตอน OLD.status เป็น draft/rejected
--     ไม่งั้น RAISE 'sales_order_payment_plan_locked' (ด่านซ้ำกับ route — route ตอบไทยก่อนถึงฐาน)
--  §4 trigger sales_order_payment_plan_carry (BEFORE INSERT): ใบ Rev. ("revisedFromId") ที่ไม่ได้ส่งแผนมา ได้แผนของใบเดิม
--     · RPC ออก Rev. (revise_approved_sales_order_atomic · 0376) ก๊อปคอลัมน์ด้วยรายชื่อตายตัว — ไม่ต้องคัด RPC 200 บรรทัดมาแก้
--     · ไม่ก๊อป = งวดที่ย้ายมา (ยอดตามแผนของใบ) ถูกเทียบกับแผน QT ⇒ ป้าย "ปรับแผนหลังอนุมัติ" ขึ้นผิดบนใบ Rev.
--
--  ⛔ ไม่แตะ sales_order_installments · ไม่แตะ quotations · ไม่ backfill (ไม่มี INSERT/UPDATE/DELETE นอกตัว trigger)
--  ⛔ ไม่แตะ trigger sync_sales_order_actual — คอลัมน์ใหม่ไม่เกี่ยวกับยอด Actual (ยอดใบไม่เปลี่ยน · Σ งวด = ยอดใบเหมือนเดิม)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · **รันก่อน deploy โค้ด** — โค้ดใหม่อ่าน/เขียนคอลัมน์ "paymentPlan" ของใบ
--     (deploy ก่อนรัน = หน้าสร้าง SO ตอบ error คอลัมน์ไม่มี · CI check:columns แดงจนกว่าจะรัน)
--     · รันก่อน deploy ได้ทันที: โค้ดเดิมไม่อ่านคอลัมน์ใหม่ และทุกใบเดิมเป็น NULL
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ────────────────────────────────────────────────────────────
--   ① SELECT count(*) FILTER (WHERE "paymentPlan" IS NOT NULL) AS with_plan, count(*) AS orders
--        FROM public.sales_orders;                                                    -- คาด: 0 · (จำนวนใบทั้งหมด)
--   ② SELECT conname FROM pg_constraint WHERE conname IN ('sales_orders_payment_plan_shape',
--        'sales_orders_payment_plan_meta', 'sales_orders_payment_plan_origin');       -- คาด: 3 แถว
--   ③ SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.sales_orders'::regclass
--        AND tgname IN ('sales_order_payment_plan_guard', 'sales_order_payment_plan_carry'); -- คาด: 2 แถว
--
--  ── ลองด่านก่อนใช้จริง (ROLLBACK คืนทุกอย่าง) ─────────────────────────────────────────────────
--   BEGIN;
--   -- ใบที่อนุมัติแล้ว: ตั้งแผนต้องถูกปฏิเสธ — คาด ERROR sales_order_payment_plan_locked
--   UPDATE public.sales_orders SET "paymentPlan" = '{"type":"full"}', "paymentPlanReason" = 'ทดสอบด่าน 0441 ห้ามผ่าน',
--          "paymentPlanSetAt" = now(), "paymentPlanSetById" = 'smoke', "paymentPlanSetByName" = 'smoke'
--    WHERE id = (SELECT id FROM public.sales_orders WHERE status = 'approved' AND origin = 'pipeline' LIMIT 1);
--   ROLLBACK;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อนเสมอ · ใบที่ตั้งแผนไว้แล้ว (① > 0) จะกลับไปเดินตามแผน QT — งวดที่อนุมัติแล้วตรึงยอดไว้ไม่ขยับ
--   แต่งวดร่างของใบที่ยังไม่อนุมัติจะถูกทับจากแผน QT ตอนอนุมัติ ⇒ ตรวจใบเหล่านั้นก่อน
--   DROP TRIGGER IF EXISTS sales_order_payment_plan_guard ON public.sales_orders;
--   DROP TRIGGER IF EXISTS sales_order_payment_plan_carry ON public.sales_orders;
--   DROP FUNCTION IF EXISTS public.sales_order_payment_plan_guard();
--   DROP FUNCTION IF EXISTS public.sales_order_payment_plan_carry();
--   ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_payment_plan_shape,
--     DROP CONSTRAINT IF EXISTS sales_orders_payment_plan_meta, DROP CONSTRAINT IF EXISTS sales_orders_payment_plan_origin,
--     DROP COLUMN IF EXISTS "paymentPlan", DROP COLUMN IF EXISTS "paymentPlanReason", DROP COLUMN IF EXISTS "paymentPlanSetAt",
--     DROP COLUMN IF EXISTS "paymentPlanSetById", DROP COLUMN IF EXISTS "paymentPlanSetByName";
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- ── §1 คอลัมน์ ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "paymentPlan" jsonb,
  ADD COLUMN IF NOT EXISTS "paymentPlanReason" text,
  ADD COLUMN IF NOT EXISTS "paymentPlanSetAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "paymentPlanSetById" text,
  ADD COLUMN IF NOT EXISTS "paymentPlanSetByName" text;

COMMENT ON COLUMN public.sales_orders."paymentPlan" IS
  'แผนงวดชำระของใบเอง (0441 · มติ 27/11/2026) — NULL = เดินตามแผนของใบเสนอราคา · ตั้งได้ตอนร่าง/ถูกตีกลับเท่านั้น';

-- ── §2 CHECK ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_payment_plan_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_payment_plan_shape CHECK (
    "paymentPlan" IS NULL
    OR (
      jsonb_typeof("paymentPlan") = 'object'
      AND "paymentPlan"->>'type' IN ('full', 'installment')
      AND (
        "paymentPlan"->>'type' = 'full'
        OR (
          jsonb_typeof("paymentPlan"->'installments') = 'array'
          AND jsonb_array_length("paymentPlan"->'installments') BETWEEN 1 AND 12
        )
      )
    )
  );

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_payment_plan_meta;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_payment_plan_meta CHECK (
    ("paymentPlan" IS NULL AND "paymentPlanReason" IS NULL AND "paymentPlanSetAt" IS NULL
      AND "paymentPlanSetById" IS NULL AND "paymentPlanSetByName" IS NULL)
    OR ("paymentPlan" IS NOT NULL
      AND char_length(btrim(COALESCE("paymentPlanReason", ''))) BETWEEN 10 AND 500
      AND "paymentPlanSetAt" IS NOT NULL)
  );

-- ใบย้อนหลัง (0374) ไม่มีใบเสนอราคา — งวดมาจากฟอร์มคีย์ใบ ⇒ ไม่มีแผนของใบให้ตั้ง
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_payment_plan_origin;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_payment_plan_origin CHECK (
    "paymentPlan" IS NULL OR origin IS DISTINCT FROM 'historical'
  );

-- ── §3 ด่าน: แก้แผนได้เฉพาะใบร่าง/ถูกตีกลับ ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_order_payment_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW."paymentPlan" IS DISTINCT FROM OLD."paymentPlan"
      OR NEW."paymentPlanReason" IS DISTINCT FROM OLD."paymentPlanReason"
      OR NEW."paymentPlanSetAt" IS DISTINCT FROM OLD."paymentPlanSetAt"
      OR NEW."paymentPlanSetById" IS DISTINCT FROM OLD."paymentPlanSetById"
      OR NEW."paymentPlanSetByName" IS DISTINCT FROM OLD."paymentPlanSetByName")
     AND OLD.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'sales_order_payment_plan_locked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_payment_plan_guard ON public.sales_orders;
CREATE TRIGGER sales_order_payment_plan_guard
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.sales_order_payment_plan_guard();

-- ── §4 ใบ Rev. ได้แผนของใบเดิม ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_order_payment_plan_carry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_source record;
BEGIN
  IF NEW."revisedFromId" IS NOT NULL AND NEW."paymentPlan" IS NULL THEN
    SELECT "paymentPlan", "paymentPlanReason", "paymentPlanSetAt", "paymentPlanSetById", "paymentPlanSetByName"
      INTO v_source
      FROM public.sales_orders
     WHERE id = NEW."revisedFromId";
    IF FOUND AND v_source."paymentPlan" IS NOT NULL THEN
      NEW."paymentPlan" := v_source."paymentPlan";
      NEW."paymentPlanReason" := v_source."paymentPlanReason";
      NEW."paymentPlanSetAt" := v_source."paymentPlanSetAt";
      NEW."paymentPlanSetById" := v_source."paymentPlanSetById";
      NEW."paymentPlanSetByName" := v_source."paymentPlanSetByName";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_payment_plan_carry ON public.sales_orders;
CREATE TRIGGER sales_order_payment_plan_carry
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.sales_order_payment_plan_carry();

NOTIFY pgrst, 'reload schema';

COMMIT;
