-- ============================================================
--  Migration 0177: ผูกรายการของเข้ากับใบสั่งขาย (SO)
--
--  ⭐ มติผู้ใช้ 2026-07-29: "PR RM เข้า มันจะเชื่อมกับ SO เพราะว่ามันติดตาม
--     เพื่อสู่การผลิต" — ของเข้าไม่ได้ติดตามเพื่อรู้ว่าของมาถึงเฉย ๆ แต่ติดตาม
--     เพื่อตอบว่า **ใบสั่งขายใบนี้เริ่มผลิตได้เมื่อไหร่**
--
--  ลำดับในแม่แบบไทม์ไลน์ยืนยันว่าผูกได้จริง — SO ออกก่อน PR เสมอ:
--    NPD      : 28 ใบสั่งขายผลิต → 37 ทำเอกสาร PR → 38 สั่งซื้อสารและบรรจุภัณฑ์
--    RE-ORDER :  3 ใบสั่งขายผลิต → 10 ทำเอกสาร PR → 11 สั่งซื้อสารและบรรจุภัณฑ์
--
--  ⚠ nullable โดยเจตนา — ไม่บังคับ:
--    · prod ยังไม่มี SO สักใบ (0 แถว) บังคับตอนนี้ = ใช้ฟีเจอร์ไม่ได้เลย
--    · ของ long-lead บางตัวสั่งก่อนออก SO ได้จริง (เช่นขั้น "หาบรรจุภัณฑ์"
--      เริ่มขนานตั้งแต่ต้นโครงการ — dependsOnSteps: [] ใน NPD step 25)
--
--  ⚠ รันมือบน Supabase SQL Editor · ALTER ADD COLUMN เฉย ๆ ไม่ล็อกตาราง
--    (0176 รันไปแล้ว ใบนี้ต่อจากนั้น)
-- ============================================================

BEGIN;

ALTER TABLE public.material_deliveries
  -- SET NULL: ยกเลิก/ลบ SO แล้วของที่สั่งไปแล้วยังต้องตามต่อ (เหมือน costingRequestId)
  ADD COLUMN IF NOT EXISTS "salesOrderId" text
    REFERENCES public.sales_orders(id) ON DELETE SET NULL;

-- คำถามที่หน้า SO ถามบ่อยที่สุด: "ของของใบนี้ครบหรือยัง"
CREATE INDEX IF NOT EXISTS material_deliveries_so_idx
  ON public.material_deliveries ("salesOrderId")
  WHERE "salesOrderId" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
