-- ============================================================
--  Migration 0020: เพิ่มคอลัมน์ "volumeUnit" ให้ products
--  โค้ด (form / API products POST+PUT) อ้าง volumeUnit อยู่แล้ว
--  แต่ schema ไม่เคยมีคอลัมน์นี้ → insert ล้มด้วย
--  "Could not find the 'volumeUnit' column ... in the schema cache".
--  default 'ml' ให้ตรงกับ fallback ฝั่งโค้ด (body.volumeUnit || 'ml').
--  Additive + idempotent.
-- ============================================================

alter table public.products add column if not exists "volumeUnit" text default 'ml';
