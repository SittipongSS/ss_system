-- ============================================================
--  Migration 0348: ใบกำกับภาษีรายงวด — 1 งวด : 1 ใบ (มติผู้ใช้ 2026-09-07)
--
--  คำสั่งตั้งต้น: *"อยากได้หน้ารวมรายการที่ SA แจ้งว่าลูกค้าชำระมาแล้ว ไว้เป็นหน้าเดียว
--  ทุกรายการ เพื่อให้ FN ตรวจและยืนยัน รวมถึงแนบใบกำกับ กับเลขที่วันที่ใบกำกับ"*
--
--  ⭐ **โปรเซสหลัก** (มติผู้ใช้ 2026-09-07): SA แจ้งจ่าย → FN ยืนยันเงินเข้า →
--  FN บันทึกเลข/วัน/ไฟล์ใบกำกับตรงหน้าทะเบียนการชำระ → SA เปิดดูและโหลดไฟล์
--  จากแผงงวดบนใบ SO ได้ทันที · **ไม่ต้องเปิดคำร้องขอเอกสาร**
--  คำร้อง (`kind='billing_doc'` · บรรทัด `docType='tax_invoice'`) เหลือเป็น *ทางพิเศษ*
--  กรณีลูกค้าขอไฟล์ก่อนจ่าย ⇒ ถ้ามีคำร้องผูกอยู่ เลขถูกเขียนลงทั้งสองที่พร้อมกัน
--
--  ⭐ **ทำไมเป็นคอลัมน์บนแถวงวด ไม่ใช่ตารางใหม่**
--  บริษัทเก็บ VAT ⇒ ทุกงวดที่ลูกค้าจ่ายต้องมีใบกำกับ **หนึ่งใบ** ไม่มีเคสหลายใบต่องวด
--  (ยืนยันกับผู้ใช้ 2026-09-07) และคำถามที่ต้องตอบทุกวันคือ *"งวดไหนเงินเข้าแล้วแต่
--  ยังไม่มีใบกำกับ"* ⇒ ต้องอยู่แถวเดียวกับ `status` ไม่งั้นเป็น join สามทอดที่ไม่มี FK
--
--  ⚠️ **ไม่มี FK ไป dept_requests** — แบบเดียวกับ `billingRequestId` (0260) เพราะคำร้อง
--  ถูกบังคับลบได้ · แถวงวดต้องยังอ่านออกแล้วให้จอบอกตรง ๆ ว่าคำร้องหายไปแล้ว
--
--  ⚠️ **ไม่มี CHECK ว่า "confirmed ⇒ ต้องมีเลข"** — แถว confirmed บน prod วันนี้เป็น
--  NULL ทุกแถว ADD CONSTRAINT จะล้มทันที และถ้าฝืนด้วย NOT VALID ก็จะบล็อกการรับรอง
--  ทุกใบต่อจากนี้ ⇒ "ยังไม่มีใบกำกับ" เป็น **คิวงาน** (partial index ด้านล่าง) ไม่ใช่ constraint
--
--  ⚠️ **เลขไม่ unique ที่ DB โดยเจตนา** — เลขมาจาก Express และใบที่ยกเลิกแล้วออกเลข
--  ซ้ำได้ (เหตุผลเดียวกับที่ 0258 ปฏิเสธ unique) ⇒ กันเลขซ้ำที่ route พร้อมข้อความไทย
--  ไม่ใช่ที่ constraint ซึ่งจะเด้งเป็น 500 ข้อความ Postgres ดิบ
--
--  additive ล้วน · ไม่แตะข้อมูลเดิม · รันซ้ำได้
--  🛑 **ต้องรันก่อน deploy โค้ด** — route ที่ระบุคอลัมน์ใหม่ใน `.select()` จะได้ 400
--     จาก PostgREST **ทั้ง route** (แผงงวดบนใบ SO และหน้า /finance ดับพร้อมกัน)
--  ⚠️ รันมือบน Supabase SQL Editor (DDL รันผ่าน PostgREST ไม่ได้)
-- ============================================================

BEGIN;

ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "taxInvoiceNo"        text,
  ADD COLUMN IF NOT EXISTS "taxInvoiceDate"      date,
  ADD COLUMN IF NOT EXISTS "taxInvoiceRequestId" text,
  ADD COLUMN IF NOT EXISTS "taxInvoiceItemId"    text,
  ADD COLUMN IF NOT EXISTS "taxInvoiceFile"      jsonb,
  ADD COLUMN IF NOT EXISTS "taxInvoiceById"      text,
  ADD COLUMN IF NOT EXISTS "taxInvoiceByName"    text,
  ADD COLUMN IF NOT EXISTS "taxInvoiceAt"        timestamptz;

/* ⭐ วัน/ไฟล์ห้อยกับเลขเสมอ — แถวที่มีวันที่ใบกำกับแต่ไม่มีเลข แปลว่ามีคนเขียนครึ่งเดียว
   แล้วไม่มีทางรู้ว่าอ้างใบไหน · ช่วงปีกันปีพิมพ์ผิดแบบ `formulaDate = '2202-08-06'`
   ⚠️ ห่อ DO $$ เพราะ ADD CONSTRAINT ไม่มี IF NOT EXISTS (รันซ้ำต้องไม่ล้ม) */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sales_order_installments'::regclass
      AND conname = 'sales_order_installments_tax_invoice_sane'
  ) THEN
    ALTER TABLE public.sales_order_installments
      ADD CONSTRAINT sales_order_installments_tax_invoice_sane CHECK (
        ("taxInvoiceNo" IS NULL OR length(btrim("taxInvoiceNo")) BETWEEN 1 AND 40)
        AND ("taxInvoiceDate" IS NULL OR "taxInvoiceDate" BETWEEN '2000-01-01' AND '2100-12-31')
        AND ("taxInvoiceDate" IS NULL OR "taxInvoiceNo" IS NOT NULL)
        AND ("taxInvoiceFile" IS NULL OR jsonb_typeof("taxInvoiceFile") = 'object')
        AND ("taxInvoiceFile" IS NULL OR "taxInvoiceNo" IS NOT NULL)
        AND ("taxInvoiceByName" IS NULL OR length("taxInvoiceByName") <= 200)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.sales_order_installments."taxInvoiceNo"        IS 'เลขที่ใบกำกับภาษีของงวดนี้ — 1 งวด : 1 ใบ (มติ 2026-09-07) · เขียนผ่าน recordTaxInvoice() เท่านั้น';
COMMENT ON COLUMN public.sales_order_installments."taxInvoiceDate"      IS 'วันที่บนใบกำกับ (ไม่ใช่วันที่บันทึก) — ออกก่อนเงินเข้าได้';
COMMENT ON COLUMN public.sales_order_installments."taxInvoiceRequestId" IS 'คำร้องขอเอกสารการเงินที่ออกใบนี้ ถ้ามี (dept_requests.id · ไม่มี FK โดยเจตนา แบบเดียวกับ billingRequestId ของ 0260) · ปกติเป็น NULL เพราะไม่ต้องมีคำร้อง';
COMMENT ON COLUMN public.sales_order_installments."taxInvoiceItemId"    IS 'บรรทัด docType=''tax_invoice'' ของคำร้องนั้น (dept_request_items.id) — หนึ่งคำร้องมีบรรทัดใบกำกับได้หลายบรรทัด ชี้ที่ใบอย่างเดียวไม่พอ';
COMMENT ON COLUMN public.sales_order_installments."taxInvoiceFile"      IS 'ไฟล์ใบกำกับ 1 ไฟล์ (รูปเดียวกับ evidence[i] แต่เป็น object เดี่ยว) · โฟลเดอร์ sales-orders/<id>/tax-invoices/';
COMMENT ON COLUMN public.sales_order_installments."taxInvoiceByName"    IS 'snapshot ชื่อคนที่บันทึก ณ ตอนนั้น — ห้ามซิงก์ตามบัญชีผู้ใช้ทีหลัง';

/* คิว "เงินเข้าแล้ว/แจ้งแล้ว แต่ยังไม่มีใบกำกับ" = ของค้างที่ต้องเคลียร์
   (บริษัทเก็บ VAT ⇒ ทุกงวดที่จ่ายแล้วต้องมีใบ · มติผู้ใช้ 2026-09-07) */
DROP INDEX IF EXISTS sales_order_installments_tax_invoice_missing_idx;
CREATE INDEX sales_order_installments_tax_invoice_missing_idx
  ON public.sales_order_installments ("salesOrderId", seq)
  WHERE "taxInvoiceNo" IS NULL AND status IN ('reported', 'confirmed');

-- "เลขนี้ถูกใช้กับงวดอื่นไปแล้วหรือยัง" — ไม่ unique (ดูหัวไฟล์) แต่ต้องค้นเร็วพอจะถามทุกครั้งที่บันทึก
DROP INDEX IF EXISTS sales_order_installments_tax_invoice_no_idx;
CREATE INDEX sales_order_installments_tax_invoice_no_idx
  ON public.sales_order_installments (btrim("taxInvoiceNo"))
  WHERE "taxInvoiceNo" IS NOT NULL;

-- "บรรทัดคำร้องนี้ออกใบกำกับให้งวดไหนไปแล้ว" — ใช้ตอนกันผูกซ้ำ (แพตเทิร์นของ 0260)
DROP INDEX IF EXISTS sales_order_installments_tax_invoice_item_idx;
CREATE INDEX sales_order_installments_tax_invoice_item_idx
  ON public.sales_order_installments ("taxInvoiceItemId")
  WHERE "taxInvoiceItemId" IS NOT NULL;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
