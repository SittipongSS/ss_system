-- ============================================================
--  Migration 0072: sales_deal_forecast_lines + sales_deals.parentDealId
--  เชื่อม Sahamit Forecast Line ↔ Sales Plan แบบ many-to-many (Phase 1 ของ
--  Forecast↔Sales Mapping). ผู้ใช้เลือกหลาย forecast line → สร้าง "1 ดีล" แล้ว
--  ผูกทุก line เข้าดีลนั้นผ่านตารางนี้. qtyAllocated รองรับการ "split" ดีลตาม
--  จำนวนเมื่อ PO เข้ามาบางส่วน (ดีลลูกชี้ดีลแม่ด้วย parentDealId).
--
--  ทำไม junction แยก: 1 forecast line ผูกได้หลายดีล (ถ้า split), 1 ดีลผูกได้
--  หลาย line — เก็บเป็นแถวจริงเพื่อ derive Won จาก mapping (แทน heuristic
--  fgCode overlap เดิมใน create-project) และเทียบ FC accuracy ภายหลัง.
--
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (เหมือน 0005-0071).
-- ============================================================

create table if not exists public.sales_deal_forecast_lines (
  id               text primary key,                                 -- 'SDF-' + uuid
  "dealId"         text not null references public.sales_deals("id") on delete cascade,
  "forecastLineId" text not null references public.sahamit_forecast_lines("id") on delete cascade,
  "customerId"     text,                                             -- denormalize เพื่อ scope/กรองเร็ว
  "fgCode"         text,                                             -- snapshot รหัส FG ณ เวลา map
  "demandMonth"    text,                                             -- 'YYYY-MM' เดือนที่ลูกค้าต้องการรับของ (จาก line)
  "qtyAllocated"   numeric not null default 0,                       -- จำนวนที่ผูกเข้าดีลนี้ (รองรับ split ตามจำนวน)
  "createdById"    text,
  "createdByName"  text,
  "createdAt"      timestamptz not null default now()
);

-- ดึง line ทั้งหมดของดีล / เช็คว่า line ถูก map ไปดีลไหนแล้ว.
create index if not exists sales_deal_forecast_lines_deal_idx
  on public.sales_deal_forecast_lines ("dealId");
create index if not exists sales_deal_forecast_lines_line_idx
  on public.sales_deal_forecast_lines ("forecastLineId");
create index if not exists sales_deal_forecast_lines_sku_idx
  on public.sales_deal_forecast_lines ("customerId", "fgCode");

-- ดีลที่ split ออกมา (ส่วนที่ได้ PO) ชี้กลับดีลแม่. null = ดีลปกติ.
alter table public.sales_deals add column if not exists "parentDealId" text;
create index if not exists sales_deals_parent_idx
  on public.sales_deals ("parentDealId") where "parentDealId" is not null;

alter table public.sales_deal_forecast_lines enable row level security;

NOTIFY pgrst, 'reload schema';
