-- ============================================================
--  Migration 0059: mgmt_meetings — บันทึกการประชุม ของโมดูล "งานบริหาร"
--  followUp: none(ไม่ติดตาม) | follow(ติดตามต่อ). timeText = ช่วงเวลาแบบข้อความ
--  "9.30–11.00". ปีมาจาก meetingDate (กรอง). ลบ = soft (deletedAt).
--  ไฟล์/เอกสาร: ใช้ตาราง attachments (0028) entityType='mgmt_meeting'.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0058).
-- ============================================================

create table if not exists public.mgmt_meetings (
  id             text primary key,               -- 'MG-######'
  title          text not null,
  "meetingDate"  date not null,
  "timeText"     text,
  "deptCode"     text,
  "assigneeId"   text,
  "assigneeName" text,
  "followUp"     text default 'none',
  summary        text,                            -- "สรุปการประชุม"
  "createdBy"    text,
  "createdByName" text,
  "createdAt"    timestamptz default now(),
  "updatedAt"    timestamptz default now(),
  "deletedAt"    timestamptz
);

create index if not exists mgmt_meetings_date_idx
  on public.mgmt_meetings ("meetingDate" desc) where "deletedAt" is null;

alter table public.mgmt_meetings enable row level security;
