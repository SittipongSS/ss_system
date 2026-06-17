-- ============================================================
--  Migration 0040: document revision control (PM project Gantt/ISO)
--  "ออก Revise" = freeze เอกสารทั้งชุดเป็นเวอร์ชัน (snapshot ทุก task) + เลข Rev.
--  การแก้ task ปกติ = บันทึกทับ live ไม่เก็บประวัติ (ตามดีไซน์ที่ตกลง).
--  Rev เริ่มที่ 0 (ออกครั้งแรก = Rev 0). projects."currentRev" = null แปลว่า
--  ยังไม่เคยออกเวอร์ชัน (ฉบับร่าง).
--  additive + idempotent (if not exists). camelCase ในเครื่องหมายคำพูด.
--  RLS เปิดแบบไม่มี policy เหมือนตารางอื่นในระบบ — เข้าถึงผ่าน service-role
--  (bypass RLS) ใน API routes เท่านั้น; client ตรง ๆ อ่านไม่ได้.
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0039).
-- ============================================================

alter table public.projects add column if not exists "currentRev" int;

create table if not exists public.project_doc_revisions (
  id              uuid primary key default gen_random_uuid(),
  "projectId"     text  not null,
  "revNo"         int   not null,
  snapshot        jsonb not null,          -- { project, tasks[], projectProducts[] } ตอนออก rev
  note            text,                    -- หมายเหตุการออกเวอร์ชัน (optional)
  "createdBy"     text,
  "createdByName" text,
  "createdAt"     timestamptz not null default now()
);

create index if not exists doc_rev_project_idx
  on public.project_doc_revisions ("projectId", "revNo" desc);

alter table public.project_doc_revisions enable row level security;

-- เผื่อ schema cache ค้าง (PostgREST) — สั่ง reload ทันที
NOTIFY pgrst, 'reload schema';
