-- ============================================================
--  Migration 0025: เบอร์โทรผู้ติดต่อ (contactPhone)
--  แยกจาก "phone" (เบอร์บริษัท) — ผู้ติดต่อต้องมีเบอร์ของตัวเอง
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
-- ============================================================

alter table public.customers add column if not exists "contactPhone" text;
