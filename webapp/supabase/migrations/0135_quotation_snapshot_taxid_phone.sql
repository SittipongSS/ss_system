-- 0135: snapshot ข้อมูลเพิ่มบนใบเสนอราคา สำหรับเอกสาร Quotation Master V4
--
-- เอกสาร V4 (Phase 7C) ต้องแสดง "เลขประจำตัวผู้เสียภาษีของลูกค้า" และ
-- "เบอร์โทรผู้เสนอราคา" แต่ตอนสร้างใบเดิมไม่ได้ snapshot สองค่านี้ไว้
-- (customers.taxId มีอยู่ / เบอร์ผู้ใช้อยู่ใน auth user_metadata.phone).
-- เก็บเป็น snapshot ณ วันออกใบ เหมือนฟิลด์ลูกค้าอื่น (read-only ในใบ) — ใบเก่าเป็น
-- null (ไม่ backfill ตามหลัก immutable ของเอกสารที่ออกแล้ว).
--
-- เลข 0135 (ข้าม 0134 ที่สงวนให้งาน settings lifecycle) — check-migrations
-- อนุญาตให้เลขไม่ต่อเนื่องได้ ห้ามเฉพาะเลขซ้ำ.
alter table public.quotations add column if not exists "customerTaxId"  text;  -- snapshot จาก customers.taxId
alter table public.quotations add column if not exists "createdByPhone" text;  -- snapshot เบอร์ผู้เสนอราคา (ผู้สร้างใบ)
