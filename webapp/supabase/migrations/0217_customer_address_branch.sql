-- ============================================================
--  Migration 0217: เลขสาขากลับไปอยู่กับ "ที่อยู่" + เปิดทางที่อยู่แบบมีโครงสร้าง
--
--  🐞 บั๊กที่ปิด: มติ 2026-08-05 ย้ายเลขสาขาออกจากที่อยู่ไปเป็นของลูกค้าทั้งราย
--  (customers.branchCode) แต่ **ไม่มีช่องกรอกเหลืออยู่ในระบบเลย** — CustomerForm
--  ไม่มี input, POST /api/customers รับ body.branchCode ที่ไม่มีใครส่ง ⇒ ลูกค้าทุกราย
--  ค้างที่ '00000' และใบกำกับภาษีพิมพ์ "สำนักงานใหญ่" ทุกใบแม้ออกบิลให้สาขา
--  (quotationMasterTemplate.js: `สาขาที่ ${branchCode}` / 'สำนักงานใหญ่')
--
--  ของจริง: สาขาเป็นคุณสมบัติของ **สถานประกอบการ** (= ที่อยู่) ไม่ใช่ของนิติบุคคล
--  บริษัทเดียวมี 00000 กับ 00012 พร้อมกันได้ ซึ่งเป็นเหตุผลเดียวกับที่ใบเสนอราคา
--  ต้องเลือกที่อยู่ออกบิลได้ตั้งแต่ mig 0202
--
--  ── ไม่มี DDL ในไฟล์นี้ ────────────────────────────────────────────────
--  addresses เป็น jsonb อยู่แล้ว ฟิลด์ใหม่ทั้งชุดจึงไม่ต้อง ALTER TABLE:
--    branchCode · line1 · subdistrict(Code) · district(Code) · province(Code)
--    · postcode · mapUrl · contactName · contactPhone · addressOverride
--  customers.branchCode คงไว้เป็น **กระจกของที่อยู่ออกบิลหลัก** (แพตเทิร์นเดียวกับ
--  address/shippingAddress) เพราะ unique (taxId, branchCode) จาก mig 0039 และสายที่
--  อ่านช่องเดี่ยว (lib/sales/customerSnapshotFallback.js) ยังใช้อยู่จริง
--
--  ── สิ่งที่ไฟล์นี้ทำ: ย้ายเลขสาขาระดับลูกค้า → ที่อยู่ออกบิลรายการแรก ─────
--  ที่อยู่ที่ไม่ได้ใช้ออกบิล (useFor='shipping' = คลัง/จุดส่งของ) ไม่ได้เลขสาขา —
--  ไม่ใช่สถานประกอบการที่ออกใบกำกับภาษี
--
--  ⚠️ รันมือบน Supabase SQL Editor · รันซ้ำได้ (แตะเฉพาะแถวที่ยังไม่มี branchCode)
--
--  📌 จังหวัด/อำเภอ/ตำบล **ไม่ backfill ด้วย SQL** — ต้องเทียบกับทะเบียนกรมการปกครอง
--  7,452 ตำบล ซึ่งอยู่ในโค้ด ไม่ใช่ในฐานข้อมูล · ใช้สคริปต์แทน (ดูรายงานท้ายไฟล์):
--      node scripts/backfill-address-structure.mjs --dry-run
--      node scripts/backfill-address-structure.mjs --commit
-- ============================================================

-- pre-check — ดูว่ามีลูกค้ากี่รายที่ตั้งเลขสาขาไว้จริง (ไม่ใช่ '00000'):
--   select id, name, "branchCode" from public.customers
--   where coalesce("branchCode", '00000') <> '00000';

update public.customers c
set "addresses" = (
  select jsonb_agg(
    case
      -- ที่อยู่ออกบิล **รายการแรก** เท่านั้น (ord = ลำดับในลิสต์ ซึ่งคือกติกา
      -- "ที่อยู่หลัก" ของ mig 0202) และต้องยังไม่มี branchCode ของตัวเอง
      when a.ord = first_billing.ord and coalesce(a.value->>'branchCode', '') = ''
        then a.value || jsonb_build_object('branchCode', coalesce(nullif(btrim(c."branchCode"), ''), '00000'))
      else a.value
    end
    order by a.ord
  )
  from jsonb_array_elements(c."addresses") with ordinality as a(value, ord)
  cross join lateral (
    select min(b.ord) as ord
    from jsonb_array_elements(c."addresses") with ordinality as b(value, ord)
    where coalesce(b.value->>'useFor', 'both') in ('both', 'billing')
  ) as first_billing
)
where jsonb_array_length(coalesce(c."addresses", '[]'::jsonb)) > 0
  -- ยังไม่เคยมีที่อยู่ไหนถือเลขสาขาเลย = แถวที่ยังไม่ backfill
  and not exists (
    select 1 from jsonb_array_elements(c."addresses") as x(value)
    where coalesce(x.value->>'branchCode', '') <> ''
  );

-- ── ล้างช่องว่างหัว/ท้ายของคอลัมน์กระจก ────────────────────────────────
-- ⭐ ไม่ใช่เรื่องความสวยงาม: addresses[].address ถูก trim ตั้งแต่ mig 0202 แต่
-- คอลัมน์เดี่ยว address/shippingAddress ยังมีช่องว่างค้าง ⇒ ครั้งแรกที่ใครเปิดฟอร์ม
-- ลูกค้ารายนั้นแล้วกดบันทึกเฉย ๆ กระจกจะถูกเขียนเป็นค่า trim แล้ว ซึ่ง
-- changedFieldsAgainst นับเป็น "แก้ที่อยู่ออกเอกสาร" (ไม่อยู่ในรายการยกเว้น)
-- → ลูกค้าตกไป 'pending' แล้ว **หายจาก picker ทุกหน้าทันที** ทั้งที่ไม่มีใครแก้อะไร
update public.customers
set "address" = btrim("address")
where "address" is not null and "address" <> btrim("address");

update public.customers
set "shippingAddress" = btrim("shippingAddress")
where "shippingAddress" is not null and "shippingAddress" <> btrim("shippingAddress");

-- post-check — ที่อยู่ออกบิลหลักควรถือเลขสาขาเดียวกับคอลัมน์ของลูกค้า:
--   select c.id, c.name, c."branchCode",
--          (select x.value->>'branchCode'
--             from jsonb_array_elements(c."addresses") as x(value)
--            where coalesce(x.value->>'branchCode','') <> '' limit 1) as address_branch
--   from public.customers c
--   where coalesce(c."branchCode", '00000') <> '00000';
