-- 0295 - ภาษาเอกสารของใบสั่งขาย
--
-- ⭐ มติผู้ใช้ 2026-08-27: ใบสั่งขายต้องเลือกภาษาเอกสารได้เหมือนใบเสนอราคา และเปลี่ยนได้
-- แม้อนุมัติแล้ว (ภาษาเปลี่ยนแค่กระดาษที่พิมพ์ ไม่ใช่ข้อเสนอ) — ฝั่งใบเสนอราคาทำไปแล้ว
-- ที่ #1456 · mig 0238 คือคอลัมน์เดียวกันของ `quotations`
--
-- 🐞 ปัญหาที่แก้: `sales_orders` **ไม่มีคอลัมน์ภาษาเลย** และตัวพิมพ์ก็ไม่เคยส่งภาษาเข้า
-- เครื่องยนต์เอกสาร ⇒ ใบสั่งขายเป็นภาษาไทยล้วนมาตลอด ไม่มีทางเลือกเลยแม้แต่ตอนเป็นร่าง
-- ⇒ ลูกค้าต่างชาติได้ใบเสนอราคาภาษาอังกฤษ แล้วพอถึงใบสั่งขายกลับเป็นไทย
-- (ของจริงตอนเขียน: ใบเสนอราคาที่ตั้งเป็นอังกฤษ 15 ใบ · ใบสั่งขายที่เป็นอังกฤษได้ 0 ใบ)
--
-- ⚠️ ค่าตั้งต้น 'th' — ใบเดิมทุกใบเป็นไทยจริง ๆ อยู่แล้ว ไม่ใช่การเดา
-- ⚠️ backfill จาก **ใบเสนอราคาที่ผูก** เพราะ SO เป็นเอกสารต่อจากใบนั้น ลูกค้ารายเดียวกัน
-- ควรได้ทั้งสองใบภาษาเดียวกัน · ใบที่ไม่ได้ผูกใบเสนอราคา (ใบเก่า) คงเป็นไทยตามค่าตั้งต้น
--
-- idempotent ทุกคำสั่ง (ADD COLUMN IF NOT EXISTS · constraint เช็คก่อนเพิ่ม ·
-- UPDATE กรองเฉพาะแถวที่ยังไม่ตรง) — รันซ้ำได้ไม่มีอะไรเปลี่ยน

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "docLanguage" text NOT NULL DEFAULT 'th';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_doc_language_check'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_doc_language_check
      CHECK ("docLanguage" IN ('th', 'en'));
  END IF;
END $$;

-- สืบภาษาจากใบเสนอราคาต้นทาง (เฉพาะที่ยังไม่ตรงกัน)
UPDATE public.sales_orders so
SET "docLanguage" = q."docLanguage"
FROM public.quotations q
WHERE q.id = so."quotationId"
  AND q."docLanguage" IN ('th', 'en')
  AND so."docLanguage" IS DISTINCT FROM q."docLanguage";

COMMENT ON COLUMN public.sales_orders."docLanguage" IS
  'ภาษาที่ใบสั่งขายนี้พิมพ์ออกไป (th|en) — เปลี่ยนได้แม้อนุมัติแล้ว ระบบตรึงเอกสารฉบับใหม่ให้ (มติ 2026-08-27)';
