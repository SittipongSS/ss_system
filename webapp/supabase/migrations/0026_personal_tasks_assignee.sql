-- 0026_personal_tasks_assignee.sql
-- "งานเพิ่มเติม" (งานนอกเทมเพลตที่ผูกโปรเจกต์) มอบหมายให้คนในทีมของโปรเจกต์ได้
-- assigneeId = user id จริง (เหมือน project_tasks.assigneeId ใน 0019). งานที่ไม่ผูก
-- โปรเจกต์ (งานส่วนตัว) จะไม่ตั้ง assigneeId — เห็น/แก้ได้เฉพาะเจ้าของเหมือนเดิม.
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0019).

alter table personal_tasks add column if not exists "assigneeId" text;

create index if not exists personal_tasks_assignee_idx on personal_tasks ("assigneeId");
create index if not exists personal_tasks_project_idx on personal_tasks ("projectId");
