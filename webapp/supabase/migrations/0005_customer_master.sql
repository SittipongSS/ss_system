-- ============================================================
--  Migration 0005: ยกระดับ customers เป็น master data
--  เพิ่มฟิลด์ติดต่อ/เครดิต + metadata (ขยายอนาคตได้โดยไม่ต้อง migrate)
--  ทุกอย่างเป็น additive — ปลอดภัยกับข้อมูลเดิม, รันซ้ำได้ (if not exists).
--  คอนเวนชัน: ชื่อคอลัมน์ camelCase ในเครื่องหมายคำพูด (ตรงกับ schema เดิม)
-- ============================================================

alter table public.customers add column if not exists "contactPerson" text;
alter table public.customers add column if not exists "email"         text;
alter table public.customers add column if not exists "creditTerms"   text;
alter table public.customers add column if not exists "jubiliId"      text;        -- อ้างอิงแนวคิดจาก ss-cj (jubili_id)
alter table public.customers add column if not exists "metadata"      jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists "updatedAt"     timestamptz not null default now();
