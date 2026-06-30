-- ============================================================
--  Migration 0055: sahamit_fc_locks — ล็อกช่อง FC ที่ตกลงกับลูกค้าแล้ว (เฟส 5b-2)
--  เมื่อ (สินค้า, เดือน) มี FC = PO และตกลงกันแล้ว → ล็อกยอดไว้. ถ้ารอบ FC ใหม่
--  มาเปลี่ยนช่องที่ล็อก ระบบจะตั้งธง kind='lockedBreak' (ดู 0054) ให้รู้ว่าของที่
--  ตกลงแล้วถูกแก้.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0054).
-- ============================================================

create table if not exists public.sahamit_fc_locks (
  id              text primary key,                                    -- 'FCK-' + uuid
  "customerId"    text not null,
  "fgCode"        text not null,
  month           text not null,                                       -- 'YYYY-MM'
  "lockedQty"     numeric not null,                                    -- ยอดที่ตกลง ณ ตอนล็อก
  note            text,
  "lockedById"    text,
  "lockedByName"  text,
  "lockedAt"      timestamptz default now()
);

-- หนึ่งช่อง (สินค้า, เดือน) ล็อกได้ครั้งเดียว.
create unique index if not exists sahamit_fc_locks_unique
  on public.sahamit_fc_locks ("customerId", "fgCode", month);

alter table public.sahamit_fc_locks enable row level security;
