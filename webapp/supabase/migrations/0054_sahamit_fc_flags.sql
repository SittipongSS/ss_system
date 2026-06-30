-- ============================================================
--  Migration 0054: sahamit_fc_flags — คิวตรวจ "เลื่อนจริง vs แอบตัด" (เฟส 5b-1/5b-2)
--  กฎลูกค้า: FC ห้ามตัด เลื่อนได้อย่างเดียว ยอดรวมห้ามลด. ลูกค้าไม่บอกว่าอะไรเป็นอะไร
--  → ตอน import รอบใหม่ ระบบตั้ง "ธง" ให้ AE ไปเคลียร์ + เก็บเป็นหลักฐาน (audit).
--
--  kind: 'drop' (FC ลด/หาย) | 'shift_suspect' (เข้าคู่ shift อัตโนมัติ) | 'lockedBreak' (แก้ช่องที่ล็อก)
--  status: 'open' | 'confirmed_shift' | 'confirmed_cut' | 'ignored'
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0053).
-- ============================================================

create table if not exists public.sahamit_fc_flags (
  id                text primary key,                                  -- 'FCF-' + uuid
  "customerId"      text not null,
  "fgCode"          text not null,
  month             text not null,                                     -- เดือนที่ลด/หาย 'YYYY-MM'
  "roundNo"         integer,                                           -- รอบที่ตรวจพบ
  "prevQty"         numeric,
  "newQty"          numeric,
  "drop"            numeric,                                           -- prevQty - newQty
  kind              text not null,                                     -- drop | shift_suspect | lockedBreak
  status            text not null default 'open',                      -- open | confirmed_shift | confirmed_cut | ignored
  "shiftToMonth"    text,                                              -- ถ้า confirmed_shift
  note              text,
  "customerResponse" text,
  "createdAt"       timestamptz default now(),
  "resolvedById"    text,
  "resolvedByName"  text,
  "resolvedAt"      timestamptz
);

create index if not exists sahamit_fc_flags_open_idx
  on public.sahamit_fc_flags ("customerId", status);
-- กันตั้งธงซ้ำต่อ (สินค้า, เดือน, รอบ, ชนิด).
create unique index if not exists sahamit_fc_flags_unique
  on public.sahamit_fc_flags ("customerId", "fgCode", month, "roundNo", kind);

alter table public.sahamit_fc_flags enable row level security;
