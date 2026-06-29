-- ============================================================
--  Migration 0052: sahamit_pos + sahamit_po_lines — PO ที่ลูกค้าส่งมา
--  ติดตาม PO ของสหมิตร. หนึ่ง PO (header) มีหลายบรรทัด (สินค้า × จำนวน × วันส่ง).
--
--  วันที่ (ตามที่ผู้ใช้ระบุ):
--    docDate              = วันที่บนเอกสาร PO
--    receivedDate         = วันที่ "เรา" ได้รับ PO (อาจช้ากว่า docDate)
--    dueDate (ต่อบรรทัด)  = วันกำหนดส่งจากลูกค้า
--    expectedDate         = วันคาดการณ์ส่งปัจจุบัน (อาจตรง/เลื่อนจาก dueDate)
--    expectedHistory      = ประวัติการเลื่อน expectedDate (เลื่อนได้ >1 ครั้ง)
--                           [{expectedDate, changedAt, reason}]
--    actualDeliveredDate  = วันส่งจริง
--    deliveryMonth        = 'YYYY-MM' ที่ใช้จับคู่กับ FC (มาจาก expectedDate || dueDate)
--
--  splitFromPoLineId = ถ้าบรรทัดนี้เป็น "ยอดแยก" ของอีกบรรทัด (ส่งบางส่วน) ชี้บรรทัดแม่.
--  poNumber unique ต่อลูกค้า (กันเลข PO ซ้ำ).
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0051).
-- ============================================================

create table if not exists public.sahamit_pos (
  id            text primary key,                                    -- 'SPO-' + uuid
  "poNumber"    text not null,
  "customerId"  text not null references public.customers("id") on delete restrict,
  "docDate"     date,                                                -- วันที่บนเอกสาร PO
  "receivedDate" date,                                               -- วันที่เราได้รับ (อาจช้ากว่า docDate)
  "quoteRef"    text,
  note          text,
  "createdById" text,
  "createdByName" text,
  "createdAt"   timestamptz default now(),
  "updatedAt"   timestamptz default now()
);

-- กันเลข PO ซ้ำต่อลูกค้า.
create unique index if not exists sahamit_pos_customer_no_key
  on public.sahamit_pos ("customerId", "poNumber");
create index if not exists sahamit_pos_received_idx
  on public.sahamit_pos ("customerId", "receivedDate" desc);

create table if not exists public.sahamit_po_lines (
  id                  text primary key,                              -- 'SPL-' + uuid
  "poId"              text not null references public.sahamit_pos("id") on delete cascade,
  "customerId"        text not null,                                 -- denormalize เพื่อ scope/กรองเร็ว
  "productId"         text references public.products("id") on delete set null,
  "fgCode"            text not null,                                 -- snapshot รหัส FG (= "SKU")
  "productName"       text,
  qty                 numeric not null default 0,
  "dueDate"           date,                                          -- วันกำหนดส่ง (จากลูกค้า)
  "expectedDate"      date,                                          -- วันคาดการณ์ส่งปัจจุบัน
  "expectedHistory"   jsonb not null default '[]'::jsonb,            -- ประวัติเลื่อน [{expectedDate,changedAt,reason}]
  "actualDeliveredDate" date,                                        -- วันส่งจริง
  "deliveryMonth"     text,                                          -- 'YYYY-MM' จับคู่ FC
  "splitFromPoLineId" text,                                          -- ยอดแยก: ชี้บรรทัดแม่
  status              text not null default 'open',                  -- open|partial|delivered|cancelled
  "createdAt"         timestamptz default now()
);

create index if not exists sahamit_po_lines_po_idx
  on public.sahamit_po_lines ("poId");
-- จับคู่ PO ของสินค้าหนึ่ง ๆ ต่อเดือนส่ง (reconciliation FC↔PO).
create index if not exists sahamit_po_lines_sku_month_idx
  on public.sahamit_po_lines ("customerId", "fgCode", "deliveryMonth");

alter table public.sahamit_pos enable row level security;
alter table public.sahamit_po_lines enable row level security;
