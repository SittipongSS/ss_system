-- 0417_excise_filing_links — ใบยื่นกรมของ RA ผูก SO ค่าสรรพสามิต (แผนรื้อสรรพสามิต PR5 · docs/excise-qt-so-rework-plan.md หมวด 3.6 · 6)
--
-- รันมือใน Supabase SQL Editor **ก่อน merge PR5** (ทั้งไฟล์ทีเดียว · ทรานแซกชันเดียว · รันซ้ำได้)
--
-- 1. orders — ลิงก์ไป SO ค่าสรรพสามิต ("exciseSalesOrderId" · FK RESTRICT · ใบละหนึ่ง) + เหตุผลข้ามด่านเริ่มยื่น
--    (เงินยังไม่ปิดใบ · ทะเบียนยังไม่ครบ) + ผู้เริ่มยื่น + "updatedAt" (ตารางนี้ไม่เคยมี)
--    ⭐ มติ D7 (เจ้าของ 29/10): **ยื่นกรมทีละ SO** — 1 SO ลูกค้า = 1 ใบยื่น = 1 ใบเสร็จกรม ⇒ ลิงก์แบบหนึ่งต่อหนึ่ง
--    ⚠️ ใบยื่นยังผูก **SO ลูกค้า** ด้วย "salesOrderId" เหมือนเดิม (unique · FK RESTRICT) — SO ลูกค้าล็อกย้อนอนุมัติ/Rev./ยกเลิก/ลบ
--       ผ่านกลไกเดิมของคอลัมน์นั้นอยู่แล้ว ไม่ต้องแตะ RPC ไหน
-- 2. order_items.quantity → numeric (จำนวนจากบรรทัดใบค่าสรรพสามิตเป็น numeric · ตารางว่าง)
-- 3. ยามสองตัว (trigger — ไม่ปะเนื้อ RPC เพราะเนื้อบน prod ต่างจากสายไฟล์ · บทเรียน 0416):
--    · orders_excise_link_check_trg — ใบยื่นที่ชี้ SO ค่าสรรพสามิต ต้องชี้ SO ลูกค้าต้นทางของใบนั้นด้วย (กันลิงก์ไขว้ลูกค้า)
--    · sales_orders_excise_filed_no_cancel_trg — SO ค่าสรรพสามิตที่ RA สร้างใบยื่นแล้ว ยกเลิกไม่ได้
--      (ย้อนอนุมัติปิดไว้แล้วที่ 0416 · Rev. เกิดไม่ได้เพราะ CHECK revisionNo = 0 · ลบกันด้วย FK RESTRICT)
--
-- 🧪 พิสูจน์บนฮาร์เนส PGlite (นอก repo) — ฐาน = schema.sql + 0001–0416 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + กรณีทดสอบ
--
-- ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: cols = 7 · uidx = 1 · qty_numeric = true · link_guard = 1 · cancel_guard = 1 ──
--   SELECT
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'orders'
--         AND column_name IN ('exciseSalesOrderId', 'filingSkipMoneyReason', 'filingSkipRegistrationReason',
--                             'filingStartedAt', 'filingStartedById', 'filingStartedByName', 'updatedAt')) AS cols,
--     (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_excise_sales_order_uidx') AS uidx,
--     (SELECT data_type = 'numeric' FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'quantity') AS qty_numeric,
--     (SELECT count(*) FROM pg_trigger WHERE tgname = 'orders_excise_link_check_trg' AND NOT tgisinternal) AS link_guard,
--     (SELECT count(*) FROM pg_trigger WHERE tgname = 'sales_orders_excise_filed_no_cancel_trg' AND NOT tgisinternal) AS cancel_guard;
--
-- ถอยกลับ (เฉพาะเมื่อยังไม่มีใบยื่นที่ใช้คอลัมน์ใหม่ · โค้ด PR5 ต้องถอยก่อน):
--   BEGIN;
--   DROP TRIGGER IF EXISTS sales_orders_excise_filed_no_cancel_trg ON public.sales_orders;
--   DROP FUNCTION IF EXISTS public.guard_excise_sales_order_filed();
--   DROP TRIGGER IF EXISTS orders_excise_link_check_trg ON public.orders;
--   DROP FUNCTION IF EXISTS public.guard_orders_excise_link();
--   DROP INDEX IF EXISTS public.orders_excise_sales_order_uidx;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS "exciseSalesOrderId", DROP COLUMN IF EXISTS "filingSkipMoneyReason",
--     DROP COLUMN IF EXISTS "filingSkipRegistrationReason", DROP COLUMN IF EXISTS "filingStartedAt",
--     DROP COLUMN IF EXISTS "filingStartedById", DROP COLUMN IF EXISTS "filingStartedByName", DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.order_items ALTER COLUMN quantity TYPE integer USING round(quantity)::integer;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;

BEGIN;

-- ทางสร้างใบยื่นของฝ่ายขายปิดตั้งแต่ PR3 ⇒ ตารางต้องว่าง · มีแถวโผล่ = มีทางรั่ว หยุดดูก่อน
-- (รันซ้ำหลัง RA เริ่มใช้แล้วผ่านได้เมื่อคอลัมน์มีครบ — ข้อนี้เฝ้าเฉพาะรอบแรก)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'exciseSalesOrderId'
  ) AND EXISTS (SELECT 1 FROM public.orders) THEN
    RAISE EXCEPTION 'mig_0417_orders_not_empty';
  END IF;
END
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "exciseSalesOrderId" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "filingSkipMoneyReason" text,
  ADD COLUMN IF NOT EXISTS "filingSkipRegistrationReason" text,
  ADD COLUMN IF NOT EXISTS "filingStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "filingStartedById" text,
  ADD COLUMN IF NOT EXISTS "filingStartedByName" text,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_excise_sales_order_uidx
  ON public.orders ("exciseSalesOrderId") WHERE "exciseSalesOrderId" IS NOT NULL;

ALTER TABLE public.order_items ALTER COLUMN quantity TYPE numeric;

CREATE OR REPLACE FUNCTION public.guard_orders_excise_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."exciseSalesOrderId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders so
     WHERE so.id = NEW."exciseSalesOrderId"
       AND so.origin = 'excise'
       AND so."sourceSalesOrderId" IS NOT DISTINCT FROM NEW."salesOrderId"
  ) THEN
    RAISE EXCEPTION 'orders_excise_link_invalid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_excise_link_check_trg ON public.orders;
CREATE TRIGGER orders_excise_link_check_trg
BEFORE INSERT OR UPDATE OF "exciseSalesOrderId", "salesOrderId" ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_orders_excise_link();

CREATE OR REPLACE FUNCTION public.guard_excise_sales_order_filed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o."exciseSalesOrderId" = NEW.id) THEN
    RAISE EXCEPTION 'sales_order_cancel_excise_filed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_excise_filed_no_cancel_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_excise_filed_no_cancel_trg
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW
WHEN (NEW.origin = 'excise' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.guard_excise_sales_order_filed();

COMMIT;

NOTIFY pgrst, 'reload schema';
