-- 0263 — bucket พักไฟล์ระหว่างทางขึ้น Drive (upload-staging)
--
-- ทำไมต้องมี: **Drive ไม่ยอมให้เบราว์เซอร์ PUT ขึ้น session URL ตรง ๆ** (ไม่มี CORS —
-- ทดสอบบน prod 2026-08-17: `TypeError: Failed to fetch` ทุกครั้ง ทั้งที่ session
-- สร้างสำเร็จ) ส่วน Supabase Storage รับ PUT ตรงจากเบราว์เซอร์ได้ (6 MB ผ่าน 200)
-- ⇒ ไบต์เดินสองขา: เบราว์เซอร์ขึ้น bucket นี้ก่อน แล้ว /api/upload/commit ย้ายเข้า Drive
--    (ขาที่สองเป็น fetch ออกจาก function ไม่ใช่ request body ⇒ ไม่ติดเพดาน 4.5 MB)
--
-- ไฟล์ในนี้เป็นของชั่วคราวทั้งหมด — commit ลบทิ้งหลังย้ายสำเร็จ · ที่ค้างคือรอบที่ล้ม
-- กลางทาง ลบได้เสมอโดยไม่กระทบข้อมูล (ไม่มีแถวไหนอ้างถึง path ใน bucket นี้)
--
-- 26214400 = 25 MB ตรงกับ MAX_UPLOAD_MB · ขยับเพดานในโค้ดต้องขยับที่นี่และ 0262 ด้วย
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('upload-staging', 'upload-staging', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;
