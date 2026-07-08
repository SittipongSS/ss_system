-- ============================================================
--  Migration 0080: mgmt_updates — ประวัติการแก้ไข / feed (polymorphic) ของ "งานบริหาร"
--  entityType: 'task' | 'meeting' | 'rock'. kind: edit|status|comment|file|link.
--  ต่อ entity หนึ่งๆ (task/meeting/rock) เก็บสายอัพเดท + ใช้ทำ activity feed หน้า
--  Overview. เขียนโดย API หลัง write สำเร็จ (คู่กับ recordAudit).
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0075).
-- ============================================================

create table if not exists public.mgmt_updates (
  id           uuid primary key default gen_random_uuid(),
  "entityType" text not null,               -- 'task' | 'meeting' | 'rock'
  "entityId"   text not null,
  kind         text not null default 'edit', -- edit|status|comment|file|link
  body         text,
  meta         jsonb default '{}'::jsonb,     -- {field,from,to}
  "authorId"   text,
  "authorName" text,
  "createdAt"  timestamptz default now()
);

create index if not exists mgmt_updates_entity_idx
  on public.mgmt_updates ("entityType", "entityId", "createdAt" desc);
create index if not exists mgmt_updates_recent_idx
  on public.mgmt_updates ("createdAt" desc);

alter table public.mgmt_updates enable row level security;
