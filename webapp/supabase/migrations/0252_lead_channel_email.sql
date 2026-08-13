-- 0252 - เพิ่มช่องทางรับลีด "อีเมล" (กลุ่ม Online)
--
-- ผู้ใช้แจ้ง IS-26080024 (2026-08-13): ขอเมนูช่องทางลีดเพิ่มอีกอันเป็น email
-- ตาราง sales_leads ล็อกค่า channel ด้วย CHECK (mig 0091 → ขยายที่ 0129)
-- จึงต้องขยายรายการที่ยอมรับอีกครั้ง — ค่า channelGroup 'online' รองรับอยู่แล้ว
-- ไม่ต้องแก้ CHECK ของคอลัมน์นั้น
--
-- 🛑 ต้องรันก่อน deploy — ฝั่งแอปเพิ่มตัวเลือกใน LEAD_CHANNELS แล้ว ถ้ายังไม่รัน
-- ตัวเลือก "อีเมล" จะโผล่ให้เลือกแต่กดบันทึกไม่ผ่าน (CHECK ตีกลับตอน insert)
--
-- Rollback: ห้ามถอย CHECK กลับตรง ๆ ถ้ามีแถว channel='email' แล้ว — ต้องย้ายค่า
-- แถวเหล่านั้นก่อน (เช่นเป็น 'website') แล้วค่อย re-add CHECK เดิม

ALTER TABLE public.sales_leads
  DROP CONSTRAINT IF EXISTS sales_leads_channel_check;

ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_channel_check
  CHECK (channel IN ('chatcone_line','chatcone_meta','chatcone_tiktok','chatcone_ig','typeform','email','phone','walkin','website'));
