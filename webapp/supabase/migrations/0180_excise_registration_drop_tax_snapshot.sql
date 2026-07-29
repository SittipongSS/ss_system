-- ============================================================
--  Migration 0180: ปลดระวางสำเนาอัตราภาษีบนทะเบียนสรรพสามิต
--
--  มติผู้ใช้ 2026-07-29: **อัตราภาษีคิดจากราคาขายปลีกของ FG ซึ่งอัปเดตได้ (เหมือน
--  ราคาผลิต) จึงต้องมีแหล่งเดียว** = products.exciseTax / products.localTax
--
--  excise_registrations.exciseTax / localTax เป็น "สำเนา" ที่ก๊อปมาตอนกดขึ้นทะเบียน
--  แล้วไม่มีใครอัปเดตตามเมื่อราคาสินค้าเปลี่ยน — พอ #808 ย้ายใบยื่นทุกทางไปอ่านอัตรา
--  จากสินค้า สำเนานี้ก็เหลือหน้าที่เดียวคือ "โชว์บนจอ" ซึ่งกลายเป็นจุดที่เดินหนีจาก
--  ต้นฉบับทันทีที่ราคาขยับ:
--     หน้าทะเบียน โชว์ 8.04 (สำเนาเก่า)  ·  ใบยื่น คิด 8.93 (อัตราจริง)  → ไม่มี error เตือน
--
--  ⭐ ประวัติไม่หาย — ตามได้ครบจากที่ที่ตั้งใจเก็บอยู่แล้ว:
--     product_price_history  = อัตราของสินค้าเปลี่ยนเมื่อไหร่ จากเท่าไรเป็นเท่าไร
--                              (PRICE_FIELDS มี exciseTax/localTax/ราคาครบ)
--     order_items            = อัตราที่ใบยื่นแต่ละใบใช้จริง ตรึงไว้ตั้งแต่ mig 0041
--                              ("exciseRatePerUnit" / "localTaxRatePerUnit")
--  สำเนาบนทะเบียนไม่ได้ตอบคำถามที่สองที่นี้ตอบไม่ได้ — เป็นแค่จุดที่สามที่จะเพี้ยน
--
--  ⚠️ สิ่งที่ **ยังอยู่ที่ทะเบียน** และห้ามตัด: isExciseTaxable / taxableOverride
--     = คำตัดสินของฝ่ายกฎหมายว่า FG นี้กับลูกค้ารายนี้ได้รับยกเว้นหรือไม่ ซึ่งไม่มีใน
--     ฐานข้อมูลสินค้า · ตัวคิดกลาง exciseTaxLineForRegistration() ยังอ่านธงนี้อยู่
--
--  ⚠️ ลำดับสำคัญ: deploy โค้ดที่เลิกอ่าน/เลิกเขียนสองคอลัมน์นี้ (คอมมิตเดียวกัน) ก่อน/
--     พร้อมรันไฟล์นี้ — INSERT เก่าที่ยังส่งค่ามาจะพังทันทีที่คอลัมน์หายไป
--
--  ⭐ prod 2026-07-29: ทะเบียน 3 แถว (pending_legal ทั้งหมด) · ใบยื่น 0 ใบ
--     ค่าในสำเนายังตรงกับ products ทุกแถว ⇒ ตัดทิ้งตอนนี้ไม่มีใครเห็นตัวเลขเปลี่ยน
--
--  Idempotent — DROP COLUMN IF EXISTS · ไม่มี UPDATE/DELETE ข้อมูล
-- ============================================================

ALTER TABLE public.excise_registrations
  DROP COLUMN IF EXISTS "exciseTax",
  DROP COLUMN IF EXISTS "localTax";

-- Rollback:
--   ALTER TABLE public.excise_registrations
--     ADD COLUMN IF NOT EXISTS "exciseTax" numeric,
--     ADD COLUMN IF NOT EXISTS "localTax"  numeric;
--   -- เติมค่ากลับจากทะเบียนสินค้า (เท่ากับค่าที่ระบบใช้อยู่แล้ว ณ เวลานั้น):
--   UPDATE public.excise_registrations r SET
--     "exciseTax" = CASE WHEN r."isExciseTaxable" = false THEN 0 ELSE p."exciseTax" END,
--     "localTax"  = CASE WHEN r."isExciseTaxable" = false THEN 0 ELSE p."localTax"  END
--   FROM public.products p WHERE p.id = r."productId";

NOTIFY pgrst, 'reload schema';
