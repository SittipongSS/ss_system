-- ============================================================
-- 0307 — ล้างช่องว่าง/แท็บที่ติดท้ายรหัสสินค้า (FG Code)
--
-- 🐞 อาการ: 53 จาก 342 แถวใน products เก็บรหัสเป็น `"FG-108-01-002-2009\t\t"`
--    ตาเปล่ามองไม่เห็นเพราะ HTML ยุบช่องว่างให้ · มาจากตอนนำเข้าจาก Excel
--    (ก๊อปมาทั้งช่องพร้อมแท็บ) และสำเนาถูกส่งต่อไปที่ excise_registrations.fgCode
--    ตอนขึ้นทะเบียน ⇒ 15 จาก 17 ทะเบียนบนฐานก็สกปรกตาม
--
-- ผลจริงที่พัง (ไม่ใช่เรื่องความสวย):
--   1. ด่านกันรหัสซ้ำใน POST/PATCH /api/products ใช้ `.eq('fgCode', …)` เทียบตรงตัว
--      ⇒ พิมพ์รหัสสะอาดเข้าไปไม่ชนของเดิม แล้ว **เปิดสินค้ารหัสซ้ำได้**
--   2. เมทริกซ์สหมิตรเทียบ `row.fgCode === fgCode` ในหน่วยความจำ ⇒ แถวไม่แมตช์
--      (lib/sahamit/predict.js · reconcileClient.js · components/sahamit/*)
--   3. ZIP รายงานภาษีตั้งชื่อโฟลเดอร์จากรหัส และ sanitize แปลงแท็บเป็น `_`
--      ⇒ ได้โฟลเดอร์ `FG-108-01-002-2009__ ชื่อสินค้า - ลูกค้า`
--
-- ⚠️ ตัดเฉพาะ **หัวท้าย** (btrim) ไม่แตะช่องว่างกลางรหัส — รหัสที่กรอกเองรุ่นเก่า
--    บางตัวมีเว้นวรรคกลางโดยตั้งใจ การยุบทั้งหมดคือการเปลี่ยนรหัสจริง ไม่ใช่การล้าง
--
-- ⚠️ **ล้างสองตาราง** — `excise_registrations.fgCode` เป็นสำเนาที่ตรึงไว้ตอนขึ้น
--    ทะเบียน ไม่ได้อ่านจาก products ตอนแสดงผล ⇒ ล้างแค่ต้นทางไม่พอ
--
-- 🪤 ล้าง products ก่อนแล้วอาจชนกับ unique index — เช็คก่อนว่ามีรหัสที่ trim แล้ว
--    ชนกันเองไหม (มี = ข้อมูลซ้ำจริง ต้องรวมด้วยมือ ไม่ใช่งานของ migration นี้)
--
-- ✅ ตรวจ trigger บนตารางที่แตะแล้ว (2026-08-28) — `products` มี
--    `products_first_approved_stamp` (mig 0248) ซึ่ง **ไม่ RAISE** แค่ประทับ
--    `firstApprovedAt` · แถวสกปรกทั้ง 53 มี `firstApprovedAt` อยู่แล้วทุกแถว
--    ⇒ trigger เข้ากิ่ง `OLD."firstApprovedAt"` คืนค่าเดิม ไม่มีแถวไหนโดนประทับใหม่
--    (ประทับผิด = รหัสที่ควรคืนได้ตอนลบจะตายถาวร — ดูเหตุผลใน 0248)
--    `excise_registrations` ไม่มี trigger เลย
--
-- Additive + idempotent (รันซ้ำได้ ไม่มีผลข้างเคียง)
-- ============================================================

do $$
declare
  clash_count integer;
begin
  -- 1) กันเคสที่ trim แล้วรหัสชนกันเอง — หยุดพร้อมข้อความ ไม่ใช่ล้มด้วย 23505 ดิบ ๆ
  select count(*) into clash_count
  from (
    select btrim("fgCode") as code
    from public.products
    where "fgCode" is not null and btrim("fgCode") <> ''
    group by btrim("fgCode")
    having count(*) > 1
  ) dups;

  if clash_count > 0 then
    raise exception
      'ล้าง fgCode ไม่ได้: มี % รหัสที่ตัดช่องว่างแล้วซ้ำกันเอง — ต้องรวมสินค้าซ้ำด้วยมือก่อน',
      clash_count;
  end if;

  -- 2) ต้นฉบับ
  update public.products
  set "fgCode" = btrim("fgCode")
  where "fgCode" is not null and "fgCode" <> btrim("fgCode");

  -- 3) สำเนาบนทะเบียนสรรพสามิต (ตรึงไว้ตอนขึ้นทะเบียน — ไม่ได้อ่านจาก products)
  update public.excise_registrations
  set "fgCode" = btrim("fgCode"),
      "updatedAt" = "updatedAt"   -- ไม่ขยับเวลาแก้ไข: นี่คือการล้างข้อมูล ไม่ใช่การแก้ใบ
  where "fgCode" is not null and "fgCode" <> btrim("fgCode");
end $$;

-- 4) ป้องกันของใหม่ที่ชั้น DB — ด่านฝั่งแอปกันได้เฉพาะทางที่ผ่าน API
--    (สคริปต์นำเข้า/แก้มือใน SQL editor ไม่ผ่านด่านนั้น ซึ่งคือทางที่ของสกปรกเข้ามาจริง)
alter table public.products
  drop constraint if exists products_fg_code_trimmed;
alter table public.products
  add constraint products_fg_code_trimmed
  check ("fgCode" is null or "fgCode" = btrim("fgCode"))
  not valid;
-- not valid = ไม่ไล่ตรวจแถวเก่าตอน add (เพิ่งล้างไปข้างบนแล้ว) แต่บังคับกับทุกแถว
-- ที่เขียนใหม่ตั้งแต่นี้ · validate แยกเพื่อไม่ล็อกตารางนานตอน migrate
alter table public.products validate constraint products_fg_code_trimmed;
