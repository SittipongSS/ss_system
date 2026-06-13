-- ============================================================
--  Migration 0024: เพิ่ม "dueDate" ให้ project_tasks
--  วันครบกำหนด/เป้าหมายของแต่ละขั้นตอน. เป็นแค่ "เป้าหมาย" ที่ผู้ใช้ตั้งเอง
--  ไม่ขับการคำนวณ timeline (forward-only ยังอิง startDate + durationDays → finishDate)
--  โชว์เป็นหมุด/ป้ายเทียบกับ finishDate. Additive + idempotent.
-- ============================================================

alter table public.project_tasks add column if not exists "dueDate" date;
