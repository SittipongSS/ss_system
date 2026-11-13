-- ============================================================
--  Migration 0436: ลูกค้าซื้อพัฒนากลิ่นเพิ่ม — ผูก SO ใบใหม่กับคำร้องเดิม (ทาง C · ม-163)
--
--  มติเจ้าของ 13/11/2026 (docs/scent-dev-topup-plan.md · ถามทีละข้อ):
--    ① ทุก SO ออกแบบ/แก้กลิ่นที่อนุมัติแล้วต้องมีคำร้องรับหนึ่งใบ
--       ไม่ต้องมีบรีฟใหม่ + ใบเดิมยังไม่ปิด = **แนบ** เข้าใบเดิม · นอกนั้น **เปิดใบใหม่ชี้กลับ**
--    ② คอนเฟิร์มเกินจำนวนที่จ่าย = ต้องมาจาก SO ที่แนบ หรือเป็น **ของแถม** พร้อมเหตุผล
--    ⑥ SO ที่ไม่ต้องมีคำร้อง (ทำนอกระบบไปแล้ว) **ปัดออกจากคิว** ได้พร้อมเหตุผล
--
--  ⭐ additive ล้วน — ตารางใหม่สองตาราง · คอลัมน์ใหม่สามที่ · trigger กันเจ้าของซ้อนสองทิศ
--     โค้ดที่อ่านตารางใหม่ (PR-1) ทนได้ถ้ายังไม่รัน (ถือว่า "ยังไม่มีลิงก์") แต่ควรรันก่อน merge
--  ⭐ ไม่แตะ `sales_orders` เลย — คอลัมน์ของ SO อยู่ในลายนิ้วมืออนุมัติและผูก trigger หลายตัว
--  ⚠️ ม-37 (`dept_requests_pdr_so_uk` · mig 0219) ไม่เปลี่ยน — SO หลักของคำร้องยังเป็น 1 : 1
--     ตารางใหม่เก็บเฉพาะ SO ที่ **แนบเพิ่ม** · SO หนึ่งใบมีเจ้าของได้คำร้องเดียว (หลักหรือแนบ) ⇒ trigger ข้อ 2
--  ⚠️ trigger ไม่เดินสาย Rev. ของ SO — โค้ดเดินให้ (`lib/requests/scentOrderLinks.js`)
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL) · บล็อกเดียว · SELECT ท้ายไฟล์ = ตรวจว่าครบ
-- ============================================================

-- ── 1. SO ที่แนบเข้าคำร้องพัฒนากลิ่น ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dept_request_sales_orders (
  id               text PRIMARY KEY,
  "requestId"      text NOT NULL REFERENCES public.dept_requests(id) ON DELETE CASCADE,
  -- ⚠️ CASCADE ตาม SO — SO ถูกลบจริงได้ (แอดมิน · ลบดีล) แล้วลิงก์ที่ชี้ไปหาใบที่ไม่มีอยู่ไม่มีความหมาย
  "salesOrderId"   text NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "createdById"    text,
  "createdByName"  text,
  CONSTRAINT dept_request_sales_orders_so_uk UNIQUE ("salesOrderId")
);
CREATE INDEX IF NOT EXISTS dept_request_sales_orders_request_idx
  ON public.dept_request_sales_orders ("requestId");
COMMENT ON TABLE public.dept_request_sales_orders IS
  'SO ที่ลูกค้าซื้อเพิ่มแล้วแนบเข้าคำร้องพัฒนากลิ่นที่ยังไม่ปิด (ม-163 · mig 0436) — SO หลักยังอยู่ที่ dept_requests."salesOrderId" · SO หนึ่งใบมีเจ้าของได้คำร้องเดียว';
ALTER TABLE public.dept_request_sales_orders ENABLE ROW LEVEL SECURITY;

-- ── 2. เจ้าของเดียวข้ามสองตาราง ─────────────────────────────────────────────
-- ด่านสุดท้าย — โค้ดตรวจก่อนแล้วตอบข้อความไทยที่บอกทางออก · ข้อความที่นี่ลงท้าย [code] แบบเดียวกับ 0410
CREATE OR REPLACE FUNCTION public.dept_request_sales_orders_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind   text;
  v_status text;
BEGIN
  SELECT kind, status INTO v_kind, v_status FROM public.dept_requests WHERE id = NEW."requestId";
  IF v_kind IS DISTINCT FROM 'scent_dev' THEN
    RAISE EXCEPTION 'แนบใบสั่งขายได้เฉพาะคำร้องพัฒนากลิ่น [scent_order_link_wrong_kind]';
  END IF;
  IF v_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'คำร้องนี้ปิดหรือยกเลิกแล้ว แนบใบสั่งขายเพิ่มไม่ได้ [scent_order_link_request_closed]';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dept_requests r
    WHERE r."salesOrderId" = NEW."salesOrderId" AND r.kind = 'scent_dev' AND r.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ใบสั่งขายนี้เป็นใบหลักของคำร้องพัฒนากลิ่นอยู่แล้ว [scent_order_already_main]';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dept_request_sales_orders_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dept_request_sales_orders_guard ON public.dept_request_sales_orders;
CREATE TRIGGER dept_request_sales_orders_guard
  BEFORE INSERT OR UPDATE ON public.dept_request_sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.dept_request_sales_orders_guard();

-- ทิศกลับ: เปิด/ย้ายคำร้องพัฒนากลิ่นบน SO ที่แนบอยู่กับคำร้องใบอื่นไม่ได้
CREATE OR REPLACE FUNCTION public.dept_requests_scent_so_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'scent_dev' AND NEW.status <> 'cancelled' AND NEW."salesOrderId" IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.dept_request_sales_orders l
       WHERE l."salesOrderId" = NEW."salesOrderId" AND l."requestId" <> NEW.id
     ) THEN
    RAISE EXCEPTION 'ใบสั่งขายนี้แนบอยู่กับคำร้องพัฒนากลิ่นใบอื่นแล้ว [scent_order_already_attached]';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.dept_requests_scent_so_owner_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dept_requests_scent_so_owner_guard ON public.dept_requests;
CREATE TRIGGER dept_requests_scent_so_owner_guard
  BEFORE INSERT OR UPDATE OF "salesOrderId", status, kind ON public.dept_requests
  FOR EACH ROW EXECUTE FUNCTION public.dept_requests_scent_so_owner_guard();

-- ── 3. ต่อจากคำร้อง ─────────────────────────────────────────────────────────
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "continuesRequestId" text;
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_continues_fk;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_continues_fk
  FOREIGN KEY ("continuesRequestId") REFERENCES public.dept_requests(id) ON DELETE SET NULL;
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_continues_not_self;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_continues_not_self CHECK ("continuesRequestId" IS NULL OR "continuesRequestId" <> id);
CREATE INDEX IF NOT EXISTS dept_requests_continues_idx
  ON public.dept_requests ("continuesRequestId") WHERE "continuesRequestId" IS NOT NULL;
COMMENT ON COLUMN public.dept_requests."continuesRequestId" IS
  'คำร้องพัฒนากลิ่นใบใหม่ที่ทำต่อจากใบเดิม (ม-163 · mig 0436) — ใบเดิมปิดแล้ว หรือมีบรีฟใหม่ · ใบที่ปิดแล้วไม่เปิดกลับ';

-- ── 4. บรีฟ "แก้จากกลิ่น" ────────────────────────────────────────────────────
ALTER TABLE public.dept_request_scents
  ADD COLUMN IF NOT EXISTS "sourceScentId" text;
ALTER TABLE public.dept_request_scents
  DROP CONSTRAINT IF EXISTS dept_request_scents_source_scent_fk;
-- ⚠️ SET NULL — ลบกลิ่นในทะเบียนแล้วบรีฟต้องไม่หายตาม (เหตุผลเดียวกับ 0213)
ALTER TABLE public.dept_request_scents
  ADD CONSTRAINT dept_request_scents_source_scent_fk
  FOREIGN KEY ("sourceScentId") REFERENCES public.scents(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.dept_request_scents."sourceScentId" IS
  'กลิ่นตั้งต้นที่บรีฟนี้ขอให้แก้ (ม-163 · mig 0436) — ฟอร์มส่งกลิ่นเติม derivedFromScentId จากช่องนี้ให้ RD';

-- ── 5. ของแถมบนแถวที่คอนเฟิร์ม ───────────────────────────────────────────────
ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "freebieReason" text,
  ADD COLUMN IF NOT EXISTS "freebieAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "freebieById" text,
  ADD COLUMN IF NOT EXISTS "freebieByName" text;
ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_freebie_reason_len;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_freebie_reason_len
  CHECK ("freebieReason" IS NULL OR length(btrim("freebieReason")) BETWEEN 1 AND 500);
ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_freebie_needs_confirm;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_freebie_needs_confirm
  CHECK ("freebieReason" IS NULL OR outcome = 'confirmed');
COMMENT ON COLUMN public.dept_request_items."freebieReason" IS
  'เหตุผลที่แถวนี้เป็นของแถม — ลูกค้าคอนเฟิร์มเกินจำนวนกลิ่นที่จ่าย (ม-163 · mig 0436) · มีค่าได้เฉพาะแถวที่คอนเฟิร์ม';

-- ── 6. SO ที่ปัดออกจากคิว "รอเปิดคำร้อง" ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scent_order_dismissals (
  "salesOrderId"    text PRIMARY KEY REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  reason            text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  "dismissedAt"     timestamptz NOT NULL DEFAULT now(),
  "dismissedById"   text,
  "dismissedByName" text
);
COMMENT ON TABLE public.scent_order_dismissals IS
  'SO ออกแบบ/แก้กลิ่นที่ไม่ต้องมีคำร้อง — ปัดออกจากคิวพร้อมเหตุผล (ม-163 · mig 0436) · คืนเข้าคิว = ลบแถว · แนบ/เปิดคำร้องล้างแถวนี้ให้เอง';
ALTER TABLE public.scent_order_dismissals ENABLE ROW LEVEL SECURITY;
-- ไม่มี policy: อ่าน/เขียนผ่าน service-role ในโค้ดเท่านั้น (แบบเดียวกับตารางคำร้องอื่น)

-- ── ตรวจท้าย ────────────────────────────────────────────────────────────────
SELECT
  to_regclass('public.dept_request_sales_orders') AS links_table,
  to_regclass('public.scent_order_dismissals')    AS dismissals_table,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'dept_requests' AND column_name = 'continuesRequestId')
        OR (table_name = 'dept_request_scents' AND column_name = 'sourceScentId')
        OR (table_name = 'dept_request_items' AND column_name = 'freebieReason'))) AS new_columns_3,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('dept_request_sales_orders_guard', 'dept_requests_scent_so_owner_guard')) AS triggers_2;
