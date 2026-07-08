-- ============================================================
--  Migration 0079: mgmt_rock_improve — Rock & Improve (บอร์ดรายแผนก) ของ "งานบริหาร"
--  1 แถว/แผนก/ปี: improved="สิ่งที่ดีขึ้น" (สะท้อนผล), goals=รายการเป้าหมายต่อไป.
--  v1 goals = ["เป้าหมาย 1","เป้าหมาย 2",...] (ข้อความ ตามต้นแบบ); later ยกเป็น
--  [{text,status,done}] เมื่อทำ "ติดตามผล" เชิงลึก. year = ค.ศ. (int).
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0075).
-- ============================================================

create table if not exists public.mgmt_rock_improve (
  id          text primary key,             -- 'RI-######'
  year        int not null,
  "deptCode"  text not null,
  improved    text,
  goals       jsonb default '[]'::jsonb,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now(),
  "deletedAt" timestamptz,
  unique (year, "deptCode")
);

create index if not exists mgmt_rock_improve_year_idx
  on public.mgmt_rock_improve (year) where "deletedAt" is null;

alter table public.mgmt_rock_improve enable row level security;
