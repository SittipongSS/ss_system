-- ============================================================
--  Migration 0029: ย้ายแผนที่ลูกค้าเดิม (customers.mapFileUrl) → attachments
--  รวมแหล่งเอกสารให้เหลือที่เดียว (ตาราง attachments docType='address_map')
--  หลังเลิกใช้ฟิลด์ mapFileUrl บน UI/API. คอลัมน์ mapFileUrl คงไว้เฉยๆ
--  (ไม่ลบ — กันพังถ้ามีอะไรอ้างอิง; แค่ไม่เขียน/ไม่แสดงอีก).
--  idempotent: insert เฉพาะลูกค้าที่มี mapFileUrl และยังไม่มี address_map.
--  ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0028).
-- ============================================================

insert into public.attachments
  ("entityType", "entityId", "docType", "fileUrl", "fileName", "metadata", "createdAt")
select
  'customer',
  c.id,
  'address_map',
  c."mapFileUrl",
  regexp_replace(c."mapFileUrl", '^.*/', ''),   -- ชื่อไฟล์จากส่วนท้าย URL
  '{}'::jsonb,
  now()
from public.customers c
where c."mapFileUrl" is not null
  and c."mapFileUrl" <> ''
  and not exists (
    select 1 from public.attachments a
    where a."entityType" = 'customer'
      and a."entityId" = c.id
      and a."docType" = 'address_map'
  );
