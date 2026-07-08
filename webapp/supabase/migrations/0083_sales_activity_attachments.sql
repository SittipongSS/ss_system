-- 0083 - Sales activity image attachments.
-- เก็บไฟล์แนบ (รูป/เอกสาร) ของ "ความเคลื่อนไหว" (sales_deal_activities) เป็น jsonb
-- array บนแถว activity เอง — ไฟล์จริงอยู่บน Google Drive/Supabase (ผ่าน /api/upload),
-- คอลัมน์นี้เก็บแค่ ref: [{ fileUrl, driveFileId, fileName, mimeType, sizeBytes }].
-- สิทธิ์คุมด้วย scope ของดีล (เหมือน activity เอง) ไม่ผ่านตาราง attachments กลาง.
ALTER TABLE public.sales_deal_activities
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
