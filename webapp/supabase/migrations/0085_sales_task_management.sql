-- 0085_sales_task_management.sql
-- ระบบมอบหมาย/ติดตามงาน (Sales Task Management) — แทนเมนู "งานของฉัน".
-- ขยาย personal_tasks เดิม (mig 0019/0026) แทนสร้างตารางใหม่ เพื่อให้ my-work API
-- เดิมใช้ต่อได้ทันที. ปรับจากเทมเพลต kinn Assignment Tracker.
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0018).

alter table personal_tasks add column if not exists "assignedBy"  text;          -- ใครมอบหมาย (user id) — ต่างจาก ownerId เมื่อหัวหน้าสั่งงานลูกทีม
alter table personal_tasks add column if not exists "startDate"   text;          -- 'YYYY-MM-DD' วันเริ่ม
alter table personal_tasks add column if not exists category      text;          -- หมวดหมู่งาน (ค่าคงที่ฝั่งโค้ด)
alter table personal_tasks add column if not exists important     boolean default false;  -- สำคัญ? (Eisenhower)
alter table personal_tasks add column if not exists urgent        boolean default false;  -- ด่วน?  (Eisenhower)
alter table personal_tasks add column if not exists difficulty    smallint default 2;     -- 1 ง่าย / 2 กลาง / 3 ยาก (ตัวถ่วง KPI)
alter table personal_tasks add column if not exists "completedAt" text;          -- 'YYYY-MM-DD' วันเสร็จจริง (เซ็ตตอน status→Completed)
alter table personal_tasks add column if not exists "dealId"      text;          -- เชื่อมดีล (nullable, คู่กับ projectId เดิม)

create index if not exists personal_tasks_assignedby_idx on personal_tasks ("assignedBy");
create index if not exists personal_tasks_deal_idx        on personal_tasks ("dealId");
create index if not exists personal_tasks_assignee_idx    on personal_tasks ("assigneeId");
