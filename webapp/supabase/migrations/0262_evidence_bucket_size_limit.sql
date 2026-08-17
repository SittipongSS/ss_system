-- 0262 — เพดานขนาดไฟล์ของ bucket หลักฐาน (sales-evidence)
--
-- เบราว์เซอร์อัปไฟล์ขึ้น bucket นี้ตรง ๆ ด้วย signed upload URL แล้ว (ไบต์ไม่วิ่งผ่าน
-- API ของเราเพราะ Vercel ตัด request body ที่ 4.5 MB) ⇒ **ด่านขนาดฝั่ง server ต้องอยู่ที่
-- ตัว bucket** ไม่ใช่ในโค้ด route อีกต่อไป ไม่งั้นเหลือแต่ค่าที่ client ประกาศมาเอง
--
-- 26214400 = 25 MB ตรงกับ MAX_UPLOAD_MB ใน src/lib/master/attachmentTypes.js
-- ⚠️ ถ้าขยับเพดานในโค้ด ต้องขยับที่นี่ด้วย ไม่งั้น Storage ปฏิเสธไฟล์ที่ UI บอกว่ารับได้
-- (0105 สร้าง bucket นี้ไว้โดยไม่ตั้ง file_size_limit = ตกไปใช้เพดานรวมของโปรเจกต์)
UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'sales-evidence';
