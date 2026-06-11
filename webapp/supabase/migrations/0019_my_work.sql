-- 0019_my_work.sql
-- "งานของฉัน": (1) assign งานโปรเจกต์ให้ผู้ใช้ระบบจริงได้ (assigneeId),
--             (2) งานส่วนตัวนอกเทมเพลต (personal_tasks) ผูกโปรเจกต์ได้ไม่บังคับ.
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0018).

-- (1) ผู้รับผิดชอบงานโปรเจกต์ = user id จริง (SA/LG ที่ login ได้); คง assignee (ข้อความ)
--     ไว้สำหรับจดชื่อคนแผนกอื่นที่ไม่ใช่ผู้ใช้ระบบ (RD/PC/QC/PD/WH).
alter table project_tasks add column if not exists "assigneeId" text;

-- (2) งานส่วนตัว — เจ้าของคือ ownerId (user id). projectId ผูกโปรเจกต์ก็ได้ (nullable).
create table if not exists personal_tasks (
  id          text primary key,
  "ownerId"   text not null,
  title       text not null,
  note        text,
  "dueDate"   text,                       -- 'YYYY-MM-DD'
  status      text default 'Pending',     -- Pending | In Progress | Completed
  "projectId" text,                       -- optional link to a project
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

-- RLS เปิดไม่มี policy (เข้าผ่าน service-role เท่านั้น เหมือนตารางอื่น)
alter table personal_tasks enable row level security;

-- index ช่วย query "ของฉัน"
create index if not exists personal_tasks_owner_idx on personal_tasks ("ownerId");
create index if not exists project_tasks_assignee_idx on project_tasks ("assigneeId");
