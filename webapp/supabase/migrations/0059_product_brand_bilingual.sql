-- ============================================================
--  Migration 0059: ฟิลด์สองภาษา (TH/EN) — ชื่อสินค้า + แบรนด์
--  - products: เพิ่ม "productDescriptionEn" (คู่กับ productDescription = TH)
--              และ "brandNameEn" (คู่กับ brandName = TH, snapshot ตอนเลือกแบรนด์).
--  - customers."brands": เดิมเป็น array ของ "ข้อความ" (ชื่อแบรนด์ TH ล้วน).
--    แปลงสมาชิกแต่ละตัวเป็น object {th, en} — en เริ่มเป็น '' ให้ไปเติมทีหลัง.
--    สมาชิกที่เป็น object อยู่แล้วปล่อยผ่าน (รันซ้ำได้ / idempotent).
--  ฟิลด์ EN ใช้แสดง/แก้เฉพาะหน้าฐานข้อมูล (ไม่กระทบเอกสาร/รายงาน).
--  additive ล้วน. ⚠ รันมือบน Supabase (DDL ผ่าน service-role ไม่ได้ — เหมือน 0005-0058).
--  หลังรัน: NOTIFY pgrst, 'reload schema';  (กัน schema cache ค้าง)
-- ============================================================

alter table public.products add column if not exists "productDescriptionEn" text;
alter table public.products add column if not exists "brandNameEn"          text;

-- แปลง customers.brands: "ABC" -> {"th":"ABC","en":""} (คงของที่เป็น object ไว้).
update public.customers c
set "brands" = (
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(elem) = 'string'
          then jsonb_build_object('th', elem #>> '{}', 'en', '')
        else elem
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(c."brands") elem
)
where jsonb_typeof(c."brands") = 'array'
  and exists (
    select 1 from jsonb_array_elements(c."brands") e where jsonb_typeof(e) = 'string'
  );
