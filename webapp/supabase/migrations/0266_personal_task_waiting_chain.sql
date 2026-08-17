-- 0266_personal_task_waiting_chain.sql
-- งานติดตาม (personal_tasks): สถานะ "รอคนอื่น" + งานต่อเนื่อง (ก่อนหน้า → ถัดไป)
--
-- ที่มา (มติผู้ใช้ 2026-08-17): สถานะ 3 ค่าเดิมไม่ครอบคลุมงานจริง — งานที่ส่งไปแล้ว
-- รอลูกค้า/ฝ่ายอื่นตอบ ถูกบังคับให้เลือกระหว่าง "กำลังทำ" (ทั้งที่ไม่มีอะไรอยู่ในมือเรา)
-- กับ "รอดำเนินการ" (แล้วหายจากสายตา) · และงานที่ต่อกันเป็นสาย (จบใบนี้ค่อยเริ่มใบหน้า)
-- ไม่มีที่เก็บความสัมพันธ์เลย ทั้งที่ขั้นตอนไทม์ไลน์ (project_tasks.predecessors) มีมานานแล้ว
--
-- คอลัมน์ status เป็น text ไม่มี CHECK — ค่าใหม่ 'Blocked' จึงไม่ต้องแก้ schema
-- (ชุดค่าที่ถูกต้องคุมด้วย PERSONAL_TASK_STATUSES ใน src/lib/pm/tasks.js + ด่านฝั่ง API)
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0018).

-- รออะไร/รอใคร — บังคับกรอกตอนเข้าสถานะ 'Blocked' (ล้างเมื่อออกจากสถานะนี้)
alter table personal_tasks add column if not exists "blockedReason" text;
-- วันที่เริ่มรอ ('YYYY-MM-DD') — ใช้บอกว่า "รออยู่ N วัน" บนหน้ารายการ
alter table personal_tasks add column if not exists "blockedSince"  text;

-- งานก่อนหน้าในสาย (personal_tasks.id) — logical link ไม่มี FK เหมือนลิงก์อื่นในระบบนี้
--   • ผูกย้อนหลัง: งานใบนี้ต่อจากใบไหน
--   • ผูกไปข้างหน้า: อ่านกลับด้าน (งานที่ predecessorId ชี้มาที่ใบนี้ = งานต่อเนื่องของมัน)
-- ปิดงานก่อนหน้า → ปลดล็อกงานถัดไปจาก 'Blocked' เป็น 'Pending' ให้อัตโนมัติ
alter table personal_tasks add column if not exists "predecessorId" text;

create index if not exists personal_tasks_predecessor_idx on personal_tasks ("predecessorId");
