-- 0095 - วันที่เริ่ม/สิ้นสุดของดีล (ฟอร์มดีลโฉมใหม่ — มติผู้ใช้)
-- startDate ใช้เป็น anchor ตอน gen ไทม์ไลน์ของดีลด้วย (ไม่ระบุ = วันนี้)
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "startDate" date,
  ADD COLUMN IF NOT EXISTS "endDate" date;

NOTIFY pgrst, 'reload schema';
