-- 0129 - เพิ่มช่องทางรับลีด "Typeform" (กลุ่ม Online)
--
-- ฟอร์มกรอก/แก้ลีดเพิ่มตัวเลือก Typeform (มติผู้ใช้ 2026-07-20) — ตาราง
-- sales_leads ล็อกค่า channel ด้วย CHECK (mig 0091) จึงต้องขยายรายการ
-- ที่ยอมรับ ค่า channelGroup 'online' รองรับอยู่แล้ว ไม่ต้องแก้
--
-- Rollback: ห้ามถอย CHECK กลับตรง ๆ ถ้ามีแถว channel='typeform' แล้ว —
-- ต้องย้ายค่าแถวเหล่านั้นก่อน (เช่นเป็น 'website') แล้วค่อย re-add CHECK เดิม

ALTER TABLE public.sales_leads
  DROP CONSTRAINT IF EXISTS sales_leads_channel_check;

ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_channel_check
  CHECK (channel IN ('chatcone_line','chatcone_meta','chatcone_tiktok','chatcone_ig','typeform','phone','walkin','website'));
