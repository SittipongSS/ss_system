-- ============================================================
--  Migration 0318: unique (เลขผู้เสียภาษี, สาขา) แบบเทียบค่าที่ normalize แล้ว
--
--  กติกา "ซ้ำ = เลข + สาขา" ไม่เปลี่ยน (มติ 2026-08-12 · ยืนยัน 2026-08-30) — บริษัท
--  เดียวมีสำนักงานใหญ่กับสาขาเป็นคนละสถานประกอบการโดยชอบ · ที่เปลี่ยนคือ **วิธีเทียบ**
--
--  unique เดิม (taxId, branchCode) จาก mig 0039 เทียบ **สตริงดิบของทั้งสองคอลัมน์**
--  ส่วนสองคอลัมน์นั้นเก็บตามที่กรอก/นำเข้ามา ⇒ ในฐานจริงมี '0105565024543',
--  '0-1055-65024-54-3' และ '105565024543' (ศูนย์นำหน้าหายตอนผ่าน Excel) ปนกัน
--  ส่วนช่องสาขามีทั้ง '00000' และ 'สำนักงานใหญ่' ⇒ ทั้งคู่หลุด unique ได้สบาย
--  วัด 2026-08-30: 20/496 แถวไม่ใช่ตัวเลข 13 หลักล้วน และมีคู่ที่หลุดมาแล้ว 2 คู่
--  (อาเตโพเล่ AR-903/AR-002 · แอนตี้ฮีโร่ AR-863/AR-906 — สาขา 00000 ทั้งคู่)
--
--  `public.tax_id_key` / `public.branch_key` = กติกาเดียวกับ `taxIdKey` / `branchKeyOf`
--  ใน src/lib/master/customerTaxId.js
--  🪤 แก้กติกาฝั่งไหน ต้องแก้อีกฝั่งด้วย ไม่งั้น DB กับแอปมองคำว่า "ซ้ำ" คนละแบบ
--
--  ⚠️ รันมือบน Supabase (เหมือน 0005 เป็นต้นมา)
--  ⭐ **index เป็น partial เฉพาะใบที่ยังใช้งาน** (มติผู้ใช้ 2026-08-30 "ทาง ก")
--     ใบซ้ำในทะเบียนลบทิ้งไม่ได้ เพราะแต่ละใบถือเนื้อในของตัวเอง (ที่อยู่/ผู้ติดต่อ/
--     แบรนด์) แม้ใบส่วนเกินจะไม่มีเอกสารอ้างถึงเลยก็ตาม ⇒ วิธียุบคือ **ย้ายเนื้อใน
--     เข้าใบหลัก แล้วพักใบส่วนเกิน (isActive=false)** ซึ่งกู้กลับได้และยังอ่านของเก่าได้
--     ⇒ unique ต้องไม่นับใบที่พักใช้ ไม่งั้นยุบเสร็จก็ยังสร้าง index ไม่ได้อยู่ดี
--     🪤 ฝั่งแอปต้องมองตรงกัน: `splitTaxIdMatches` ไม่นับใบที่พักใช้ว่าซ้ำ (แค่เตือน)
--        และ PATCH เช็คซ้ำตอน **เปิดใช้ใบเก่ากลับ** ด้วย ไม่งั้นใบที่พักไว้เด้งกลับมา
--        ชนใบหลักได้ด้วยการกดสวิตช์เดียว
--  ⚠️ ก่อนรัน ต้องได้ 0 แถวจาก query ข้างล่าง (นับเฉพาะใบที่ยังใช้งาน)
--     scripts/merge-duplicate-customers.mjs เป็นตัวยุบคู่ที่ค้างอยู่
--
--     select public.tax_id_key("taxId") as tax_key,
--            public.branch_key("branchCode") as branch_key,
--            count(*), array_agg("arCode")
--       from public.customers
--      where public.tax_id_key("taxId") is not null
--        and "isActive" is distinct from false
--      group by 1, 2 having count(*) > 1;
-- ============================================================

-- ครึ่งแรกของคีย์: ถอดตัวคั่นทิ้ง · 12 หลักล้วน = ศูนย์นำหน้าหาย ⇒ เติมคืน · ค่าที่มี
-- ตัวอักษร (เลขต่างชาติ/พาสปอร์ต) เทียบทั้งก้อนแบบตัวพิมพ์ใหญ่
-- strict = ค่า null คืน null ⇒ แถวที่ยังไม่กรอกเลขไม่ถูกนับว่าซ้ำกัน
create or replace function public.tax_id_key(value text)
returns text
language sql
immutable
strict
as $$
  select case
    when t.key = '' then null
    when t.key ~ '^[0-9]{12}$' then '0' || t.key
    else t.key
  end
  from (select upper(regexp_replace(value, '[^0-9A-Za-z]', '', 'g')) as key) t
$$;

-- ครึ่งหลังของคีย์: ตัดคำว่า "สาขา/สาขาที่" ออก · เลขล้วนเติมศูนย์ให้ครบ 5 หลัก ·
-- ค่าว่างและคำที่แปลว่าสำนักงานใหญ่ยุบเป็น '00000' · **ชื่อสาขาที่เป็นข้อความ
-- ('แจ้งวัฒนะ') คงไว้ตามเดิม** ห้ามตกเป็น '00000' ไม่งั้นระบบเปลี่ยนสาขาเป็นสำนักงาน
-- ใหญ่เงียบ ๆ บนใบกำกับภาษี (เหตุผลเต็มอยู่ที่ lib/master/thaiAddress.js)
-- ⚠️ ไม่ strict — null/ว่าง ต้องได้ '00000' เท่ากับฝั่งแอป ไม่ใช่ null
-- ⚠️ btrim ตัวเปล่าตัดแค่ช่องว่าง ⇒ ระบุ tab/ขึ้นบรรทัดเองด้วย
create or replace function public.branch_key(value text)
returns text
language sql
immutable
as $$
  select case
    when n.code = '' then '00000'
    when n.code ~ '^[0-9]+$' then lpad(left(n.code, 5), 5, '0')
    when n.code ~* '^(สำนักงานใหญ่|สนง\.?ใหญ่|สนญ\.?|head\s*office|hq)$' then '00000'
    else left(n.code, 50)
  end
  from (
    select btrim(regexp_replace(btrim(coalesce(value, ''), E' \t\n\r'), '^สาขา(ที่)?\s*', ''), E' \t\n\r') as code
  ) n
$$;

-- สร้างตัวใหม่ก่อน แล้วค่อยทิ้งตัวเก่า — ถ้าคำสั่งนี้ล้มเพราะยังมีคู่ซ้ำ ทะเบียนจะยัง
-- เหลือด่านเดิมคุ้มอยู่ ไม่ใช่ไม่เหลืออะไรเลย
create unique index if not exists customers_taxid_branch_norm_key
  on public.customers (public.tax_id_key("taxId"), public.branch_key("branchCode"))
  where "isActive" is distinct from false;

drop index if exists customers_taxid_branch_key;
