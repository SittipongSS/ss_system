-- ============================================================
--  Migration 0028: shared-core attachments (เอกสารแนบหลายไฟล์)
--  ตารางกลางตารางเดียวแบบ polymorphic — แนบได้หลายไฟล์/หลายประเภท
--  ต่อ 1 ระเบียน ของหลาย entity (เฟส A: 'customer' + 'product';
--  เฟส B จะเพิ่ม 'registration'/'order' สำหรับใบเสร็จสรรพสามิต).
--  เดิมเก็บได้ไฟล์เดียวผ่าน customers.mapFileUrl / products.mapFileUrl —
--  คอลัมน์เดิมคงไว้ (ระบบสรรพสามิตยังอ่านอยู่) ตารางนี้เป็นส่วนต่อขยาย.
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0027).
-- ============================================================

create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  "entityType"  text not null,                 -- 'customer' | 'product' | (เฟส B) 'registration'
  "entityId"    text not null,                 -- id ของ entity (text: 'CUS-xxxxxx' / 'PRD-xxxxxx')
  "docType"     text not null default 'other', -- ประเภทเอกสาร (นิยามฝั่งแอป: lib/master/attachmentTypes.js)
  "fileUrl"     text not null,                 -- public URL จาก Supabase Storage (/api/upload)
  "fileName"    text,
  "mimeType"    text,
  "sizeBytes"   bigint,
  "uploadedBy"     text,
  "uploadedByName" text,
  metadata      jsonb default '{}'::jsonb,
  "createdAt"   timestamptz default now()
);

-- ค้นหาเอกสารของ entity หนึ่งๆ เร็ว (เคสหลักคือ list ตาม entityType+entityId).
create index if not exists attachments_entity_idx on public.attachments ("entityType", "entityId");

-- RLS เปิดแบบไม่มี policy เหมือนตารางอื่นในระบบ — เข้าถึงผ่าน service-role
-- (bypass RLS) ใน API routes เท่านั้น; client ตรงๆ อ่านไม่ได้.
alter table public.attachments enable row level security;
