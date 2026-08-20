-- ============================================================
--  Migration 0274: รื้อลิสต์หน่วยขาย/หน่วยบรรจุ (มติผู้ใช้ 2026-08-20)
--
--  หน่วยขาย  10 ตัว → 6 ตัว: ชิ้น · กิโลกรัม · เดือน · แพ็คเกจ · งาน · ชุด
--      ตัดทิ้ง  : 'ขวด' 'หลอด' 'กล่อง' — ไม่มีสินค้าใช้เลยสักใบจาก 225 ใบ
--      เปลี่ยนคำ: 'Kg' → 'กิโลกรัม' (27 ใบ) · 'ครั้ง' → 'งาน' (5 ใบ)
--
--  หน่วยบรรจุ 6 ตัว → 5 ตัว: ml · g · kg · package · pcs
--      ตัดทิ้ง  : 'L' — มีใบเดียว (FG-112-02-011-0360) แปลงเป็น ml ตรงกว่า
--      'pcs' อยู่ต่อ: กิฟต์เซ็ตใช้บอกว่า "1 ชุดมีของ 2 ชิ้น" ไม่มีหน่วยอื่นพูดแทนได้
--
--  ⭐ **ทำไมต้องมี migration ไม่ใช่แก้แค่ลิสต์ในโค้ด**: หน่วยถูก *เก็บเป็นข้อความ* ในทุก
--  ตารางปลายทาง ไม่ใช่ FK ⇒ แก้ลิสต์อย่างเดียวแถวเก่าจะค้างคำเดิม แล้วโผล่ในดรอปดาวน์
--  เป็น "Kg (ค่าเดิม)" ตลอดไป (ตัวพ่วงของ unitOptions) และใบใหม่ที่ลอกจากใบเก่าจะพาคำเก่า
--  ไปด้วย
--
--  🔒 **ไม่แตะ `issued_documents`** — ใบที่ตรึงแล้วเก็บ HTML ของวันที่ออกไว้ reprint ต้อง
--  ได้คำเดิมเป๊ะ · เปลี่ยนคำบนใบที่ลูกค้าถืออยู่แล้วคือแก้เอกสารย้อนหลัง
--
--  🛑 ต้องรันก่อน deploy โค้ด · idempotent (map เฉพาะค่าเก่า) · รันซ้ำได้
--  ⚠️ รันมือบน Supabase SQL Editor
-- ============================================================

BEGIN;

-- 1) หน่วยขาย — ทุกตารางที่เก็บคำนี้ไว้เป็นข้อความ
UPDATE public.products                SET "saleUnit" = 'กิโลกรัม' WHERE "saleUnit" = 'Kg';
UPDATE public.products                SET "saleUnit" = 'งาน'      WHERE "saleUnit" = 'ครั้ง';

UPDATE public.quotation_lines         SET "unit" = 'กิโลกรัม' WHERE "unit" = 'Kg';
UPDATE public.quotation_lines         SET "unit" = 'งาน'      WHERE "unit" = 'ครั้ง';

UPDATE public.sales_order_lines       SET "unit" = 'กิโลกรัม' WHERE "unit" = 'Kg';
UPDATE public.sales_order_lines       SET "unit" = 'งาน'      WHERE "unit" = 'ครั้ง';

UPDATE public.sales_deal_value_items  SET "unit" = 'กิโลกรัม' WHERE "unit" = 'Kg';
UPDATE public.sales_deal_value_items  SET "unit" = 'งาน'      WHERE "unit" = 'ครั้ง';

-- 2) หน่วยบรรจุ 'L' → 'ml' — ขนาดต้องคูณ 1000 ด้วย ไม่ใช่เปลี่ยนแต่ป้าย
--    (1 L = 1000 ml · เปลี่ยนแต่หน่วยจะกลายเป็น "1 ml" = ผิดไป 1000 เท่า)
UPDATE public.products
   SET volume = volume * 1000, "volumeUnit" = 'ml'
 WHERE "volumeUnit" = 'L';

UPDATE public.sales_deal_value_items
   SET volume = volume * 1000, "volumeUnit" = 'ml'
 WHERE "volumeUnit" = 'L';

COMMIT;

NOTIFY pgrst, 'reload schema';
