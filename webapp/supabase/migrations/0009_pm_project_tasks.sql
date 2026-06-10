-- ============================================================
--  Migration 0009: PM — ตาราง project_tasks
--  ขั้นตอนงานในโปรเจกต์ (พอร์ตจาก ss-cj). role = ป้ายแผนกเฉยๆ
--  (SA ผูก auth user เป็น assignee; แผนกอื่นไม่ระบุชื่อคน).
--  รวม predecessors (task dependency), phase, cellsOverride (กริดสัปดาห์ ISO)
--  ไว้ในนิยามตารางเดียวตั้งแต่แรก. RLS เปิด ไม่มี policy. Additive + idempotent.
-- ============================================================

create table if not exists public.project_tasks (
  "id"               text primary key,                  -- 'PT-xxxxxx'
  "projectId"        text not null references public.projects("id") on delete cascade,
  "stepOrder"        int not null default 0,
  "name"             text not null default '',
  "role"             text not null default 'SA'
                       check ("role" in ('SA','RD','PC','PD','QC','LG','WH','ALL')),  -- ป้ายแผนก
  "assignee"         text,                              -- ชื่อ auth user (เฉพาะ SA) หรือ null
  "phase"            text,
  "isMilestone"      boolean not null default false,    -- จุดสำคัญ (แสดง ◆ ใน timeline/ISO)
  "durationDays"     int not null default 1,
  "startDate"        date,
  "finishDate"       date,
  "actualFinishDate" date,
  "status"           text not null default 'Pending'
                       check ("status" in ('Pending','In Progress','Completed')),
  "predecessors"     jsonb default '[]'::jsonb,          -- task id ที่ต้องเสร็จก่อน
  "cellsOverride"    jsonb,                              -- override กริดสัปดาห์ ISO (null = auto)
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);

create index if not exists project_tasks_projectid_idx on public.project_tasks ("projectId");
create index if not exists project_tasks_status_idx     on public.project_tasks ("status");
create index if not exists project_tasks_assignee_idx   on public.project_tasks ("assignee");

alter table public.project_tasks enable row level security;
