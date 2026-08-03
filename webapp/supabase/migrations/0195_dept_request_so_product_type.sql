-- 0195 — คำร้องข้ามฝ่าย: ผูกใบสั่งขาย (SO) และประเภทสินค้า
--
-- ที่มา (มติผู้ใช้ 2026-08-03 รอบสอง):
--
-- 1. **บรีฟกลิ่นต้องมี SO** เพราะการออกแบบกลิ่นมีค่าบริการ · ยืนยันกับแม่แบบแล้ว:
--    `SCENT_TEMPLATE` ขั้น 6 "ออกแบบกลิ่น" (= stepKey `scent-06` ที่บรีฟกลิ่นปักหมุด)
--    มี `dependsOnSteps: [4, 5]` โดยขั้น 4 = "ใบสั่งขายออกแบบกลิ่น"
--    → แม่แบบบอกเองว่าออกแบบกลิ่นเริ่มได้เมื่อมี SO
--
-- 2. **ขอ Mock-up ต้องบอกประเภทสินค้าที่จะขึ้นตัวอย่าง** — อ้าง `product_types`
--    (หมวดสินค้า 105 ประเภท) ไม่ใช่ `productId` เพราะตอนขอ mockup สินค้ายังไม่มี
--    ในระบบ · mockup มาก่อนสินค้า
--
-- ⚠️ **nullable ทั้งคู่โดยเจตนา** — คำร้อง 8 หัวข้อใช้ตารางเดียว แต่ละหัวข้อต้องอ้าง
-- ของไม่เหมือนกัน (ดู `needs` ใน lib/master/requestTypes.js) การบังคับที่ระดับ
-- คอลัมน์จะบล็อกหัวข้ออื่นที่ไม่เกี่ยวไปด้วย · ด่าน "หัวข้อนี้ต้องมี SO" อยู่ที่
-- `requestShapeError` ซึ่งรู้จักหัวข้อ ส่วน CHECK ระดับตารางไม่รู้
--
-- ⚠️ ไม่มี backfill — คำร้องเก่า 2 ใบบน prod เป็นหัวข้อขอราคา (ไม่ต้องมี SO อยู่แล้ว)

BEGIN;

-- ── ใบสั่งขายที่ครอบค่าบริการของคำร้องนี้ ────────────────────────────────
-- ON DELETE SET NULL: ลบ SO แล้วคำร้องยังอยู่ (เป็นประวัติการขอ) แค่ไม่รู้ว่า
-- ค่าบริการมาจากใบไหน — ตรงกับที่ `material_deliveries.salesOrderId` (0177) ทำ
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "salesOrderId" text
    REFERENCES public.sales_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dept_requests."salesOrderId" IS
  'ใบสั่งขายที่ครอบค่าบริการของคำร้องนี้ — บังคับสำหรับหัวข้อ scent_brief (ค่าบริการออกแบบกลิ่น, SCENT_TEMPLATE ขั้น 4 → 6)';

-- ── ประเภทสินค้าที่จะขึ้นตัวอย่าง (Mock-up) ──────────────────────────────
-- product_types.id เป็น integer (ไม่ใช่ text เหมือน entity อื่นในระบบ)
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "productTypeId" integer
    REFERENCES public.product_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dept_requests."productTypeId" IS
  'หมวดสินค้าที่จะขึ้นตัวอย่าง — บังคับสำหรับหัวข้อ mockup (ใช้หมวดไม่ใช่ productId เพราะตอนขอ mockup สินค้ายังไม่มีในระบบ)';

-- คิวของ RD กรองด้วยหัวข้อ + SO บ่อย (บรีฟกลิ่นทั้งหมดของ SO ใบหนึ่ง)
-- ⚠️ DROP ก่อน CREATE เสมอ: `CREATE INDEX IF NOT EXISTS` เทียบแค่ *ชื่อ* ไม่เทียบ
-- นิยาม → ชื่อซ้ำจะถูกข้ามเงียบ 100% (บทเรียน mig 0181/0182)
DROP INDEX IF EXISTS dept_requests_sales_order_idx;
CREATE INDEX dept_requests_sales_order_idx
  ON public.dept_requests ("salesOrderId")
  WHERE "salesOrderId" IS NOT NULL;

COMMIT;
