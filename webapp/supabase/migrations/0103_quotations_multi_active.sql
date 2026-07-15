-- 0103 - มติผู้ใช้ 2026-07-15: 1 ดีลเพิ่มใบเสนอราคาได้หลายใบจนกว่าจะ Won
-- (Won แล้ว RPC accept_quotation_atomic ปิดใบอื่นเป็น 'closed' + ล็อกทั้งดีล)
-- ดรอป unique index จาก 0099 ที่บังคับ 1 ใบ active ต่อดีล — ไม่ต้องมี guard สร้างซ้อนแล้ว
DROP INDEX IF EXISTS public.quotations_one_active_initial_per_deal_uidx;

NOTIFY pgrst, 'reload schema';
