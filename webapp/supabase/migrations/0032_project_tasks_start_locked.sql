-- ============================================================
--  Migration 0032: เพิ่ม "startLocked" ให้ project_tasks
--  ปักหมุดวันเริ่มของขั้นตอน (manual pin).
--    true  = ผู้ใช้ตั้ง startDate เอง → การคำนวณ timeline (recalculateGraph) จะคง
--            วันเริ่มนั้นไว้ แต่ยัง clamp ไม่ให้เร็วกว่าที่ predecessor อนุญาต
--    false = วันเริ่มไหลตาม dependency + วันเริ่มโปรเจกต์อัตโนมัติ (ค่าเริ่มต้น)
--  ทำให้แก้/เลื่อนขั้นหนึ่ง กระทบเฉพาะสายที่ผูกกันจริง ไม่ลากขั้นอิสระตามไปด้วย.
--  Additive + idempotent.
-- ============================================================

alter table public.project_tasks add column if not exists "startLocked" boolean default false;
