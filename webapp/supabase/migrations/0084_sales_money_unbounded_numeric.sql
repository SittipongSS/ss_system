-- 0084 - ปลดเพดานคอลัมน์เงินของ Sales Planning ให้เป็น numeric ไม่จำกัดหลัก.
-- อาการ: กรอกมูลค่าคาดการณ์ 1,000,000 แล้วถูกตัดเหลือ ~999,999.99 — เกิดจาก schema
-- บน prod ถูกสร้าง/แก้เป็น numeric(8,2) (เพดาน 999,999.99) ทั้งที่ migration ต้นทาง
-- (0063/0081) นิยามเป็น numeric ไม่จำกัด. ALTER นี้ idempotent: ถ้าเป็น numeric
-- ไม่จำกัดอยู่แล้วก็ไม่มีผล, ถ้าเป็น numeric(p,s) จะปลดเพดานทิ้ง.
ALTER TABLE public.sales_deals        ALTER COLUMN "projectValue"   TYPE numeric;
ALTER TABLE public.sales_deals        ALTER COLUMN "wonValue"       TYPE numeric;
ALTER TABLE public.sales_targets      ALTER COLUMN "targetAmount"   TYPE numeric;
ALTER TABLE public.sales_deal_forecasts ALTER COLUMN "forecastAmount" TYPE numeric;
