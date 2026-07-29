-- ============================================================
--  Migration 0178: กันทะเบียนสรรพสามิตซ้ำที่ชั้นฐานข้อมูล
--
--  กติกา "1 สินค้า (FG) ต่อ 1 ลูกค้า = 1 ทะเบียน" มีมาตั้งแต่ต้น และโค้ดก็บังคับไว้ทั้ง
--  สองทางที่สร้างทะเบียนได้ — แต่ **บังคับที่ชั้นแอปอย่างเดียว**:
--    * POST /api/excise-registrations      → SELECT ก่อนแล้วเช็ค
--    * POST .../from-project               → SELECT ชุด productIds แล้วกรอง
--  0016 สร้างแต่ index ธรรมดา (product / customer / status) ไม่มี unique เลย
--
--  ช่องโหว่ที่เกิดจริงได้ 2 ทาง:
--    1) กดสร้างพร้อมกันสองครั้ง (หรือสองคนพร้อมกัน) → SELECT ผ่านทั้งคู่ → ได้ 2 แถว
--    2) SELECT สะดุด แล้วโค้ดทิ้ง error ไป → ถือว่า "ไม่ซ้ำ" (แก้ที่คอมมิตเดียวกันแล้ว)
--
--  ทำไมถึงสำคัญกับปลายน้ำ: lib/excise/soFiling.js ทำ Map ที่ key = productId
--  (`approvedRegistrationByProduct`) — ทะเบียนซ้ำจะ **ทับกันเงียบ ๆ** แล้วใบยื่นจะอ้าง
--  registrationId ของอันสุดท้ายโดยพลการ ไม่มี error ให้เห็น
--
--  ⚠️ from-project ดัก error 23505 ไว้อยู่แล้ว (คาดว่าจะมี constraint) แต่ constraint
--     ไม่เคยมีจริง — โค้ดกันไว้ ด่านไม่มีอยู่ · ไฟล์นี้ทำให้ตรงกัน
--
--  ⭐ prod ยืนยัน 2026-07-29: excise_registrations 3 แถว (pending_legal ทั้งหมด)
--     ไม่มีคู่ (productId, customerId) ซ้ำ และไม่มีแถวที่สองคอลัมน์นี้ว่าง
--     → สร้าง unique index ได้ทันที ไม่ต้องล้างข้อมูลก่อน
--
--  Idempotent — IF NOT EXISTS · ไม่มี UPDATE/DELETE ข้อมูล
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS excise_reg_product_customer_uidx
  ON public.excise_registrations ("productId", "customerId");

-- Rollback:
--   DROP INDEX IF EXISTS public.excise_reg_product_customer_uidx;
--   (ไม่มีข้อมูลถูกแก้ — ถอน index แล้วกลับสภาพเดิมครบ)

NOTIFY pgrst, 'reload schema';
