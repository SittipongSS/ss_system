-- ============================================================
--  Migration 0035: unique constraints บน products (data integrity)
--  คู่ขนานกับ customers (0031). live DB ไม่มี PK/unique → id/fgCode ซ้ำได้
--  (id เก่า 'PRD-'+ms6หลัก ชนกันได้). เพิ่ม unique index กันซ้ำที่ระดับ DB.
--  ⚠ ต้องไม่มีค่าซ้ำอยู่ก่อน (pre-check ด้านล่างต้องคืน 0 แถว).
--  ⚠ รันมือบน Supabase (เหมือน 0005-0034).
-- ============================================================

-- pre-check (ควรได้ 0 แถว):
--   select id, count(*) from public.products group by id having count(*)>1;
--   select "fgCode", count(*) from public.products where "fgCode" is not null group by "fgCode" having count(*)>1;

create unique index if not exists products_id_key     on public.products ("id");
create unique index if not exists products_fgcode_key on public.products ("fgCode");
