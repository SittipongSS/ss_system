-- ============================================================
--  Migration 0077: mgmt_tasks — รายการงาน (ติดตามงานโครงการ) ของโมดูล "งานบริหาร"
--  status: todo(รอเริ่ม) | in_progress(กำลังดำเนิน) | done(เสร็จสมบูรณ์) | cancelled(ยกเลิก)
--  priority: normal(ปกติ) | urgent(ด่วน). ปีมาจาก dueDate (กรอง — ไม่ partition).
--  ผู้รับผิดชอบ: assigneeId (ผูก user, nullable) + snapshot ชื่อ. ลบ = soft (deletedAt).
--  ไฟล์/เอกสาร: ใช้ตาราง attachments (0028) entityType='mgmt_task'.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0075).
-- ============================================================

create table if not exists public.mgmt_tasks (
  id             text primary key,               -- 'MT-######'
  title          text not null,                  -- "รายการ"
  "deptCode"     text,                            -- → mgmt_departments.code (logical)
  "assigneeId"   text,
  "assigneeName" text,                            -- snapshot ชื่อ (fallback ชื่ออิสระ)
  "startDate"    date,
  "dueDate"      date,
  status         text not null default 'todo',
  priority       text not null default 'normal',
  notes          text,                            -- "หมายเหตุ"
  "createdBy"    text,
  "createdByName" text,
  "createdAt"    timestamptz default now(),
  "updatedAt"    timestamptz default now(),
  "deletedAt"    timestamptz                       -- soft-delete → ถังขยะ
);

create index if not exists mgmt_tasks_due_idx
  on public.mgmt_tasks ("dueDate") where "deletedAt" is null;
create index if not exists mgmt_tasks_status_idx
  on public.mgmt_tasks (status) where "deletedAt" is null;

alter table public.mgmt_tasks enable row level security;
