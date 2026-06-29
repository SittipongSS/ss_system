-- ============================================================
--  Migration 0050: sahamit_forecast_rounds — "รอบ" การส่ง FC จากลูกค้า
--  โมดูล SAHAMIT (Planning & Sales) เฉพาะลูกค้า บจก.สหมิตรโปรดักส์ (AR-109).
--  ลูกค้าส่ง FC มาเป็นรอบ ๆ (ครั้งที่ 1/2/3...) แต่ละรอบครอบคลุมหลายเดือน
--  (เดือน = เดือนที่ต้องการรับของ). เราทำ "รอบ" เป็น entity จริง (ไม่อนุมานจาก
--  วันที่อัปโหลดแบบ ss-cj) → diff รอบต่อรอบแม่นยำ + ตอบได้ว่ารายการไหนหาย/ลด.
--
--  customerId = FK จริงไป customers (restrict — ห้ามลบลูกค้าที่มี FC). roundNo
--  unique ต่อ customer. coverMonths = เดือนที่รอบนี้ครอบคลุม (['2026-01',...]).
--
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0049).
-- ============================================================

create table if not exists public.sahamit_forecast_rounds (
  id              text primary key,                                  -- 'FCR-' + uuid
  "customerId"    text not null references public.customers("id") on delete restrict,
  "roundNo"       integer not null,                                  -- FC ครั้งที่ N (ต่อ customer)
  "receivedDate"  date not null,                                     -- วันที่รับ FC จากลูกค้า
  "coverMonths"   text[] not null default '{}',                      -- เดือนที่ครอบคลุม ['YYYY-MM',...]
  note            text,
  "createdById"   text,                                              -- snapshot ผู้สร้าง
  "createdByName" text,
  "createdAt"     timestamptz default now(),
  "updatedAt"     timestamptz default now()
);

-- กันเลขรอบซ้ำต่อลูกค้า (FC ครั้งที่ N มีได้ครั้งเดียว).
create unique index if not exists sahamit_fc_rounds_customer_no_key
  on public.sahamit_forecast_rounds ("customerId", "roundNo");
-- ดูรอบล่าสุดของลูกค้า / เรียงตามวันรับ.
create index if not exists sahamit_fc_rounds_received_idx
  on public.sahamit_forecast_rounds ("customerId", "receivedDate" desc);

-- RLS เปิดแบบไม่มี policy เหมือนตารางอื่นในระบบ — เขียน/อ่านผ่าน service-role
-- (bypass RLS) ใน API routes เท่านั้น; client ตรง ๆ เข้าไม่ได้. การจำกัด
-- "ทีม KA + AR-109" บังคับใน route handler (ดู src/lib/permissions.canAccessSahamit).
alter table public.sahamit_forecast_rounds enable row level security;
