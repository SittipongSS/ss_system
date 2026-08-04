-- ============================================================
--  Migration 0202: ลูกค้าหนึ่งรายมีได้หลายที่อยู่ (customers.addresses)
--
--  ของเดิม: ลูกค้า 1 แถว = ที่อยู่ออกเอกสาร 1 (address) + ที่อยู่จัดส่ง 1
--  (shippingAddress) + สาขา 1 (branchCode) — และ "หลายสาขา" ตามดีไซน์ mig 0039
--  คือ **สร้างลูกค้าคนละแถวต่อสาขา** (unique (taxId, branchCode)) ซึ่งไม่มีใคร
--  ใช้จริงสักราย: ของจริงคือบริษัทเดียว หลายที่อยู่/หลายคลัง และคนออกใบเสนอราคา
--  ต้องเลือกได้ว่าออกบิลที่ไหน ส่งที่ไหน — เดิมเลือกไม่ได้เลย ต้องแก้ข้อมูลลูกค้า
--
--  รูปเก็บ: addresses = [{ id, label, branchCode, address, useFor }]
--    useFor = 'both' | 'billing' | 'shipping'
--
--  คอลัมน์เดี่ยวเดิม **ไม่ถูกลบ** — กลายเป็น "กระจก" ของที่อยู่หลัก (แพตเทิร์น
--  เดียวกับ contacts[] → contactPerson/contactPhone/email) เพราะยังมีสายที่อ่าน
--  ช่องเดี่ยวอยู่จริง: snapshot ใบเสนอราคา/ใบสั่งขาย, ตารางลูกค้า, การค้นหา
--
--  unique (taxId, branchCode) คงไว้ตามเดิม — ลูกค้าที่ถูกสร้างแยกสาขาไว้แล้ว
--  ยังอยู่ได้เหมือนเดิม (การรวมแถวเป็นเรื่องของข้อมูล ไม่ใช่ของ migration นี้)
--
--  ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้ (backfill แตะเฉพาะแถวที่ยังว่าง)
-- ============================================================

alter table public.customers
  add column if not exists "addresses" jsonb not null default '[]'::jsonb;

-- Backfill: ช่องเดี่ยวเดิม → ลิสต์ (ตรงกับ addressesFromLegacy ใน
-- src/lib/master/addresses.js — ที่อยู่จัดส่งที่ว่างหรือซ้ำกับที่อยู่ออกบิล
-- แปลว่า "ใช้ที่อยู่ออกเอกสาร" จึงกลายเป็นแถวเดียว useFor = 'both')
update public.customers
set "addresses" =
  (case
     when nullif(btrim(coalesce("address", '')), '') is not null then
       jsonb_build_array(jsonb_build_object(
         'id', 'ADR-' || replace(gen_random_uuid()::text, '-', ''),
         'label', case when coalesce(nullif(btrim("branchCode"), ''), '00000') = '00000'
                       then 'สำนักงานใหญ่'
                       else 'สาขา ' || btrim("branchCode") end,
         'branchCode', coalesce(nullif(btrim("branchCode"), ''), '00000'),
         'address', btrim("address"),
         'useFor', case
                     when nullif(btrim(coalesce("shippingAddress", '')), '') is null
                       or btrim(coalesce("shippingAddress", '')) = btrim("address")
                     then 'both' else 'billing' end
       ))
     else '[]'::jsonb
   end)
  ||
  (case
     when nullif(btrim(coalesce("shippingAddress", '')), '') is not null
       and btrim(coalesce("shippingAddress", '')) <> btrim(coalesce("address", '')) then
       jsonb_build_array(jsonb_build_object(
         'id', 'ADR-' || replace(gen_random_uuid()::text, '-', ''),
         'label', 'ที่อยู่จัดส่ง',
         'branchCode', coalesce(nullif(btrim("branchCode"), ''), '00000'),
         'address', btrim("shippingAddress"),
         'useFor', 'shipping'
       ))
     else '[]'::jsonb
   end)
where jsonb_array_length(coalesce("addresses", '[]'::jsonb)) = 0;
