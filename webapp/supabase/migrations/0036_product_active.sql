-- ============================================================
--  Migration 0036: products.isActive (lifecycle flag) — parity กับ customers (0030)
--  สินค้าที่เลิกผลิต/เลิกใช้ แต่ลบไม่ได้ (ยังถูกอ้างใน ออเดอร์/ทะเบียน/โปรเจกต์)
--  ให้ "พักใช้" แทน → หายจาก picker ปลายทาง โดยไม่กระทบประวัติ.
--  additive + idempotent. ⚠ รันมือบน Supabase (เหมือน 0005-0035).
-- ============================================================

alter table public.products add column if not exists "isActive" boolean not null default true;

update public.products set "isActive" = true where "isActive" is null;

create index if not exists products_active_idx on public.products ("isActive");
