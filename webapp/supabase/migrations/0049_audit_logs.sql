-- ============================================================
--  Migration 0049: audit_logs — สมุดบันทึกการกระทำกลาง (ใครทำอะไรเมื่อไหร่)
--  Phase 5.3 ของ BOUNDARY_MAP — ตารางกลางตารางเดียวให้ทุกโมดูลเขียนผ่าน
--  helper เดียว (src/lib/audit.js). แยกขาดจากข้อมูลจริง (customers/products/
--  orders) — ลบ record จริงแล้ว log ต้องยังอยู่ จึง "ไม่มี FK" ไป entity (ตั้งใจ).
--
--  actor* = snapshot ตัวตนผู้ทำ ณ เวลานั้น (เผื่อ user เปลี่ยนทีม/ลาออก/ถูกลบ).
--  before/after = jsonb เก็บ record เต็ม(เพื่อดูย้อนหลัง + กู้คืน manual ได้).
--  actorId/entityId เป็น text (ไม่ใช่ uuid) — เป็นค่า snapshot ไม่ใช่ FK และ
--  รองรับ id ที่ไม่ใช่ uuid (เช่น 'CUS-xxxx'/'PRD-xxxx', dev-bypass 'local-dev').
--
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0048).
-- ============================================================

create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  "actorId"     text,                          -- id ผู้ทำ ณ เวลานั้น (snapshot, ไม่ใช่ FK)
  "actorName"   text,
  "actorRole"   text,
  "actorTeam"   text,
  action        text not null,                 -- 'create' | 'update' | 'delete' (login/approve เพิ่มภายหลัง)
  "entityType"  text not null,                 -- 'customer' | 'product' | 'order' | ...
  "entityId"    text,                          -- id ของ entity (text: 'CUS-xxxx' ฯลฯ)
  summary       text,                          -- คำอธิบายสั้นๆ อ่านง่าย
  "changedKeys" jsonb,                         -- รายชื่อ field ที่เปลี่ยน (เฉพาะ update)
  before        jsonb,                         -- record เต็มก่อนเปลี่ยน (update/delete)
  after         jsonb,                         -- record เต็มหลังเปลี่ยน (create/update)
  "ipAddress"   text,
  "createdAt"   timestamptz default now()
);

-- ดูประวัติของ entity หนึ่งๆ / กรองตามคนทำ / เรียงล่าสุดก่อน / กรองตามการกระทำ.
create index if not exists audit_logs_entity_idx    on public.audit_logs ("entityType", "entityId");
create index if not exists audit_logs_actor_idx     on public.audit_logs ("actorId");
create index if not exists audit_logs_created_idx   on public.audit_logs ("createdAt" desc);
create index if not exists audit_logs_action_idx    on public.audit_logs (action);

-- RLS เปิดแบบไม่มี policy เหมือนตารางอื่นในระบบ — เขียน/อ่านผ่าน service-role
-- (bypass RLS) ใน API routes เท่านั้น; client ตรงๆ เข้าไม่ได้. หน้า /audit
-- (supervisor only, cap audit:view) จะอ่านผ่าน API ในเฟสถัดไป.
alter table public.audit_logs enable row level security;
