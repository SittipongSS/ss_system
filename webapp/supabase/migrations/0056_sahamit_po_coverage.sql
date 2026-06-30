-- ============================================================
--  Migration 0056: sahamit_po_coverage — ชดเชย PO ข้ามเดือน (เฟส 5b-3)
--  เมื่อ PO ของเดือนหนึ่ง (sourceMonth) จริง ๆ มาเติม FC ที่ขาดของอีกเดือน
--  (targetMonth) ของสินค้าเดียวกัน — AE ผูก allocation ไว้ → หน้ากระทบยอด
--  จะย้ายยอด PO เพื่อจับคู่: targetMonth ถือว่า "ชดเชยแล้ว", sourceMonth หัก
--  ส่วนที่จัดสรรออก.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0055).
-- ============================================================

create table if not exists public.sahamit_po_coverage (
  id              text primary key,                                  -- 'COV-' + uuid
  "customerId"    text not null,
  "fgCode"        text not null,
  "sourceMonth"   text not null,                                     -- เดือนที่ PO เกิน (ดึงออก) 'YYYY-MM'
  "targetMonth"   text not null,                                     -- เดือนที่ FC ขาด (เติมเข้า) 'YYYY-MM'
  qty             numeric not null,
  note            text,
  "confirmedById" text,
  "confirmedByName" text,
  "createdAt"     timestamptz default now()
);

create index if not exists sahamit_po_coverage_idx
  on public.sahamit_po_coverage ("customerId", "fgCode");

alter table public.sahamit_po_coverage enable row level security;
