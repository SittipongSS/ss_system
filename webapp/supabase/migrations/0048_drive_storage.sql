-- 0048_drive_storage.sql
-- ย้ายไฟล์แนบขึ้น Google Drive (ดู webapp/DRIVE_STORAGE_PLAN.md).
-- รันมือบน Supabase prod (DDL ผ่าน service-role ไม่ได้) ก่อน deploy.
-- หลังรัน: NOTIFY pgrst, 'reload schema';  (กัน schema cache ค้าง)

-- attachments: เก็บ Drive file id (null = ไฟล์เก่าบน Supabase Storage — hybrid).
alter table public.attachments add column if not exists "driveFileId" text;

-- cache โฟลเดอร์ Drive ราย entity (สร้างครั้งแรกแล้วใช้ซ้ำ ลด API call ค้นโฟลเดอร์).
alter table public.customers add column if not exists "driveFolderId" text;
alter table public.products  add column if not exists "driveFolderId" text;

-- หมายเหตุ: fileUrl เดิมยังเก็บไว้ (= webViewLink สำหรับปุ่ม "เปิดใน Drive").
-- แยกไฟล์เก่า/ใหม่ด้วยเงื่อนไข driveFileId is not null.
