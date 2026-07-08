-- ============================================================
--  Migration 0076: mgmt_departments — taxonomy แผนกของโมดูล "งานบริหาร" (mgmt)
--  แผนก business ของโมดูลนี้ (HR/MAR/AC/MN/Factory/Plan/QC ...) — จัดการเอง
--  ("เพิ่มแผนก"). ⚠ คนละชุดกับ DEPARTMENTS ฝั่งสิทธิ์ (AD/SEC/SA/LG/...) ใน
--  lib/permissions.js — อย่าปน. ใช้เป็น deptCode ของ mgmt_tasks/meetings/rock_improve.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0075).
-- ============================================================

create table if not exists public.mgmt_departments (
  code        text primary key,          -- 'HR','MAR','AC','MN','Factory','Plan','QC',...
  label       text not null,
  color       text,                       -- badge color (จับคู่สีให้ใกล้ต้นแบบ)
  "sortOrder" int default 0,
  active      boolean default true,
  "createdAt" timestamptz default now()
);

alter table public.mgmt_departments enable row level security;

-- seed แผนกเริ่มต้นจากของจริงในต้นแบบ (idempotent — ไม่ทับของที่แก้แล้ว)
insert into public.mgmt_departments (code, label, color, "sortOrder") values
  ('HR',      'HR',      '#378ADD', 10),
  ('MAR',     'MAR',     '#1D9E75', 20),
  ('AC',      'AC',      '#7F77DD', 30),
  ('MN',      'MN',      '#D85A30', 40),
  ('Factory', 'Factory', '#BA7517', 50),
  ('Plan',    'Plan',    '#D4537E', 60),
  ('QC',      'QC',      '#639922', 70)
on conflict (code) do nothing;
