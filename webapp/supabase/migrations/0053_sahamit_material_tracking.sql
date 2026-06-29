-- ============================================================
--  Migration 0053: sahamit_material_tracking — ติดตามวัสดุ/lead-time ต่อบรรทัด PO
--  กติกาธุรกิจ S&S สำหรับสหมิตร:
--    • PM (Package Matt) : สต็อกล่วงหน้าเมื่อมี FC  → pmInStock
--    • RM (Raw Matt)     : สั่งเมื่อมี PO เท่านั้น   → rmOrderedAt
--    • PO ตรง FC (inForecast=true)  → พร้อมผลิต ~60 วันทำการ (PM มีแล้ว สั่งแค่ RM)
--    • PO นอก FC (inForecast=false) → ~90 วัน (สั่งทั้ง PM + RM)
--  readyDate = วันพร้อมผลิต คำนวณจาก lead time แบบ "วันทำการ" โดยใช้ตาราง
--  public.holidays (migration 0018, shared-core ของ PM timeline) — ไม่ hardcode.
--
--  หนึ่งบรรทัด PO (sahamit_po_lines) มีได้ 1 แถวติดตาม (unique poLineId).
--  inForecast = null หมายถึงยังไม่ประเมิน (ได้จากผล reconciliation FC↔PO).
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0052).
-- ============================================================

create table if not exists public.sahamit_material_tracking (
  id            text primary key,                                    -- 'SMT-' + uuid
  "poLineId"    text not null references public.sahamit_po_lines("id") on delete cascade,
  "customerId"  text not null,
  "inForecast"  boolean,                                             -- PO ตรง FC? (null = ยังไม่ประเมิน)
  "leadDays"    integer,                                             -- 60 (ตรง FC) | 90 (นอก FC)
  "readyDate"   date,                                                -- วันพร้อมผลิต (จาก holidays)
  "pmInStock"   boolean not null default false,                      -- PM มีสต็อกแล้ว
  "pmArrivedAt" date,
  "rmOrderedAt" date,
  "rmArrivedAt" date,
  note          text,
  "updatedById" text,
  "updatedByName" text,
  "updatedAt"   timestamptz default now()
);

-- หนึ่งบรรทัด PO มีได้ 1 แถวติดตาม.
create unique index if not exists sahamit_material_poline_key
  on public.sahamit_material_tracking ("poLineId");

alter table public.sahamit_material_tracking enable row level security;
