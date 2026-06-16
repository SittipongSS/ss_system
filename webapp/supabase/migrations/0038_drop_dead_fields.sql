-- ============================================================
--  Migration 0038: ลบ dead fields ที่ไม่มีโค้ดใช้แล้ว
--   • customers.jubiliId    — ยกมาจาก ss-cj แต่ไม่เคยมีผู้ใช้ (ทุกแถว null)
--   • products.mapFileUrl   — UI ไม่เคยแสดง; แผนที่ย้ายไป attachments แล้ว
--  ตรวจก่อนรัน (ควรได้ 0 แถว):
--     select count(*) from public.customers where "jubiliId" is not null;
--     select count(*) from public.products  where "mapFileUrl" is not null;
--  ⚠ drop column ย้อนกลับไม่ได้ — ยืนยันว่าว่างก่อน. รันมือบน Supabase.
-- ============================================================

alter table public.customers drop column if exists "jubiliId";
alter table public.products  drop column if exists "mapFileUrl";
