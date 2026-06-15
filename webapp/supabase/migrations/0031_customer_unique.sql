-- ============================================================
--  Migration 0031: unique constraints บน customers (data integrity)
--  live DB เดิมไม่มี PK/unique → id/arCode/taxId ซ้ำได้ (race + id ชนกัน
--  จากตัวเก่า 'CUS-'+ms6หลัก). เพิ่ม unique index กันซ้ำที่ระดับ DB.
--  ⚠ ต้องไม่มีค่าซ้ำอยู่ก่อน ไม่งั้น create index จะล้ม — เช็คด้วย query
--  ข้างล่างก่อนรัน (ต้องคืน 0 แถวทั้งสาม).
--  ⚠ รันมือบน Supabase (เหมือน 0005-0030).
-- ============================================================

-- pre-check (ควรได้ 0 แถว):
--   select id, count(*) from public.customers group by id having count(*)>1;
--   select "arCode", count(*) from public.customers group by "arCode" having count(*)>1;
--   select "taxId", count(*) from public.customers where "taxId" is not null group by "taxId" having count(*)>1;

create unique index if not exists customers_id_key     on public.customers ("id");
create unique index if not exists customers_arcode_key on public.customers ("arCode");
-- taxId: unique เฉพาะค่าที่ไม่ null (Postgres ปล่อยหลาย null ได้อยู่แล้ว).
-- หมายเหตุ: ถ้าอนาคตรองรับ "สาขา" (branchCode) ควรเปลี่ยนเป็น unique(taxId, branchCode).
create unique index if not exists customers_taxid_key  on public.customers ("taxId");
