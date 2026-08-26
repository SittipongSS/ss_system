-- 0293 - แช่ "เจ้าของยอด"
--
-- 📌 เดิมชื่อ 0292 และ **รันบน production ไปแล้ว** ก่อนที่ 0292_backfill_due_committed_at
-- ของอีกสายจะ merge เข้ามาชนเลข · เปลี่ยนเป็น 0293 ได้เพราะทุกคำสั่งในไฟล์นี้ idempotent
-- (ADD COLUMN IF NOT EXISTS · CREATE OR REPLACE · DROP TRIGGER IF EXISTS · UPDATE ที่
-- กรอง ownerId IS NULL) — รันซ้ำแล้วไม่มีอะไรเปลี่ยน ลงใบสั่งขายตอนหัวหน้าฝ่ายขายอนุมัติ
--
-- ⭐ มติผู้ใช้ 2026-08-26 (รายงานยอดขาย): ยอดของใบหนึ่งต้องเป็นของคนที่ถือดีล
-- **ณ วินาทีที่ใบกลายเป็นยอดขาย** ไม่ใช่ของเจ้าของดีลปัจจุบัน
--
-- 🐞 ปัญหาที่แก้: `sales_orders` ไม่เคยมีคอลัมน์เจ้าของ — การรู้ว่าใบไหนของใครต้อง
-- วิ่งผ่าน `dealId` → `sales_deals."ownerId"` ซึ่งเป็นเจ้าของ *วันนี้* ⇒ ย้ายดีลให้ AE
-- คนใหม่เมื่อไร **ยอดของเดือนที่จ่ายคอมมิชชั่นไปแล้วย้ายตามไปด้วย** รายงานเดือนก่อน
-- ที่ปริ้นท์ไปแล้วกับที่เปิดวันนี้จึงให้ตัวเลขคนละชุด
--
-- ⚠️ แช่ตอน **หัวหน้าฝ่ายขายอนุมัติ** (status → 'approved') ไม่ใช่ตอนบัญชีตรวจใบ:
-- นั่นคือวินาทีเดียวกับที่ใบเริ่มนับเป็นยอดขายและเป็นตัวกำหนดเดือนของยอด (mig 0279)
-- ⇒ เดือนกับเจ้าของแช่พร้อมกัน กติกาเดียว ไม่มีช่วงที่ "เงินถูกนับแล้วแต่เจ้าของยังลอย"
-- ของจริงตอนเขียน: ใบที่นับเป็นยอด 68 ใบ แต่ผ่านบัญชีแล้วแค่ 25 ใบ — ถ้าไปแช่ที่ด่าน
-- บัญชี จะมี 43 ใบ (4.5 ล้าน = 44% ของยอดที่รายงานนับ) ที่ไม่มีเจ้าของแช่ไว้เลย
--
-- 🪤 ต้องเป็น trigger ไม่ใช่โค้ดในเราต์ — การอนุมัติเดินผ่าน RPC ที่ผูกลายเซ็นกับสถานะ
-- ในทรานแซกชันเดียว (approveSalesOrderWithSignatureEvidence) เขียนที่เราต์จะพลาดเส้นนั้น

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "ownerId"   text,
  ADD COLUMN IF NOT EXISTS "ownerName" text;

COMMENT ON COLUMN public.sales_orders."ownerId" IS
  'เจ้าของยอด — สำเนาจาก sales_deals ณ ตอนที่ใบถูกอนุมัติ (แช่ไว้ ไม่เดินตามดีล)';

-- เข้าอนุมัติเมื่อไร แช่เมื่อนั้น · อนุมัติใหม่หลังถูกยกเลิกอนุมัติ = แช่ใหม่ตามรอบที่นับจริง
CREATE OR REPLACE FUNCTION public.snapshot_sales_order_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT d."ownerId", d."ownerName"
      INTO NEW."ownerId", NEW."ownerName"
    FROM public.sales_deals d
    WHERE d.id = NEW."dealId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_snapshot_owner_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_snapshot_owner_trg
BEFORE INSERT OR UPDATE OF status
ON public.sales_orders FOR EACH ROW
EXECUTE FUNCTION public.snapshot_sales_order_owner();

-- ใบที่อนุมัติไปแล้วก่อนหน้านี้ — เติมด้วยเจ้าของดีลปัจจุบัน ซึ่งเป็นข้อมูลที่ดีที่สุด
-- ที่ยังมีอยู่ (ระบบไม่เคยเก็บว่าใครถือดีลตอนอนุมัติ) · ตรวจแล้วดีลทั้ง 68 ใบมี ownerId ครบ
UPDATE public.sales_orders so
SET "ownerId" = d."ownerId", "ownerName" = d."ownerName"
FROM public.sales_deals d
WHERE d.id = so."dealId"
  AND so.status = 'approved'
  AND so."ownerId" IS NULL;

CREATE INDEX IF NOT EXISTS sales_orders_owner_approved_idx
  ON public.sales_orders ("ownerId", "approvedAt");

NOTIFY pgrst, 'reload schema';
