-- ============================================================
--  Migration 0051: sahamit_forecast_lines — บรรทัด FC ในแต่ละรอบ
--  หนึ่งรอบ (sahamit_forecast_rounds) มีหลายบรรทัด = (สินค้า × เดือน × จำนวน).
--  เก็บแบบ append-only ต่อรอบ (รอบใหม่ = บรรทัดใหม่ ไม่ mutate ของเดิม) → diff
--  ระหว่างรอบทำได้ตรง ๆ โดยรวมบรรทัดของแต่ละรอบเป็น snapshot {month: qty}.
--
--  productId = ลิงก์ logical ไป products (set null ถ้าสินค้าถูกลบ — ไม่ทำลายประวัติ).
--  fgCode = snapshot รหัส FG ณ เวลานั้น (เป็น "SKU" ของระบบ — กันชื่อ/ลิงก์เปลี่ยน,
--  ใช้จับคู่ FC↔PO ด้วย fgCode). month = เดือนที่ลูกค้าต้องการรับของ 'YYYY-MM'.
--
--  additive ล้วน, รันซ้ำได้. camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0050).
-- ============================================================

create table if not exists public.sahamit_forecast_lines (
  id            text primary key,                                    -- 'FCL-' + uuid
  "roundId"     text not null references public.sahamit_forecast_rounds("id") on delete cascade,
  "customerId"  text not null,                                       -- denormalize เพื่อ scope/กรองเร็ว
  "productId"   text references public.products("id") on delete set null,
  "fgCode"      text not null,                                       -- snapshot รหัส FG (= "SKU")
  "productName" text,                                                -- snapshot ชื่อสินค้า
  month         text not null,                                       -- เดือนที่ต้องการรับของ 'YYYY-MM'
  qty           numeric not null default 0,
  "createdAt"   timestamptz default now()
);

-- ดึงบรรทัดทั้งหมดของรอบ (สร้าง snapshot).
create index if not exists sahamit_fc_lines_round_idx
  on public.sahamit_forecast_lines ("roundId");
-- เทียบ FC ของสินค้าหนึ่ง ๆ ข้ามรอบ / จับคู่กับ PO ด้วย (customerId, fgCode, month).
create index if not exists sahamit_fc_lines_sku_month_idx
  on public.sahamit_forecast_lines ("customerId", "fgCode", month);

alter table public.sahamit_forecast_lines enable row level security;
