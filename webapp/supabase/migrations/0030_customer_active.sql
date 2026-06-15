-- ============================================================
--  Migration 0030: customers.isActive (lifecycle flag)
--  แยกจาก approvalStatus (อนุมัติ) — isActive = ลูกค้ายัง "ใช้งานอยู่" ไหม.
--  ลูกค้าเก่าที่เลิกซื้อแต่ลบไม่ได้ (ยังถูกอ้างใน ออเดอร์/โปรเจกต์) ให้ "พักใช้"
--  แทน → หายจาก dropdown/picker ปลายทาง โดยไม่กระทบประวัติ.
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
--  ⚠ ต้องรันมือบน Supabase ก่อนใช้ปุ่ม "พักใช้/เปิดใช้" (เหมือน 0005-0029).
-- ============================================================

alter table public.customers add column if not exists "isActive" boolean not null default true;

-- ของเดิมทั้งหมดถือว่าใช้งานอยู่.
update public.customers set "isActive" = true where "isActive" is null;

create index if not exists customers_active_idx on public.customers ("isActive");
