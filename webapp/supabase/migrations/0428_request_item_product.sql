-- ============================================================
--  Migration 0428: บรรทัดคำร้องขอเอกสารผูก FG (ศูนย์กลางเอกสารของสินค้า งวด P2b · มติเจ้าของ 09/11/2026)
--
--  ⭐ มติเจ้าของ 09/11 (ถามทีละข้อ · docs/product-doc-hub.md):
--     · MSDS และ Specification Sheet = ระดับ FG · RD ออก · **เก็บที่สินค้า** (งวด P2a ขึ้น prod แล้ว #2006)
--     · คำร้องขอเอกสาร (DC) **บังคับเลือกเป้ารายบรรทัด** — บรรทัด MSDS / Spec Sheet เลือก FG
--       (ใบเก่าที่ไม่มีค่าไม่ถูกบังคับย้อนหลัง)
--  🐞 ที่มา: RD ตอบคำร้องแล้วไฟล์ค้างที่บรรทัดคำร้อง (`attachments.entityType = 'dept_request_item'`) — หน้าสินค้าไม่เห็น ·
--     prod 09/11: คำร้อง DC 26 ใบ อ้าง FG แค่ 5 ใบ (ที่หัวใบ) · ไฟล์ 24 ไฟล์ (MSDS · IFRA · Product Spec) อยู่ที่บรรทัด
--
--  ── ทำอะไร ───────────────────────────────────────────────────────────────────────────────
--   คอลัมน์ใหม่ dept_request_items."productId" text → products(id) ON DELETE SET NULL — ว่างได้
--   · บรรทัด MSDS / Spec Sheet ที่ผูก FG: RD กด "ส่งงาน" แล้วไฟล์ลงที่ **สินค้า** (docType msds / spec_sheet) ไม่ใช่ที่บรรทัด ·
--     ด่านส่งงานนับไฟล์ปัจจุบันของสินค้าชนิดนั้น (สินค้ามีไฟล์ล่าสุดอยู่แล้ว = ส่งได้โดยไม่ต้องแนบซ้ำ)
--   · ด่าน "บังคับเลือก FG" อยู่ที่ตัวตรวจบรรทัด (lib/requests/lines.js) ไม่ใช่ที่ฐาน — แถวเก่าต้องว่างได้
--   · ON DELETE SET NULL: ลบสินค้าแล้วบรรทัดกลับเป็นแบบเดิม (ไฟล์ของสินค้าถูกเก็บกวาดไปกับสินค้า) — ไม่ลบบรรทัดตาม
--
--  ── ผลต่อข้อมูลเดิม ───────────────────────────────────────────────────────────────────────────
--   ไม่มี — แถวเดิมเป็น NULL ทั้งหมด (ไม่ backfill · การย้ายไฟล์เก่า 24 ไฟล์คืองวด P5)
--   · ลำดับรันกับ deploy: **รันไฟล์นี้ก่อน deploy** — โค้ดใหม่เขียน/อ่านคอลัมน์นี้ (ก่อนรัน = เปิดคำร้องขอเอกสารไม่ผ่าน)
--     โค้ดเก่าบนฐานใหม่ไม่กระทบ (ไม่อ่านคอลัมน์นี้ · CHECK dept_request_items_shape ไม่เกี่ยว)
--
--  ── ทางกลับ ────────────────────────────────────────────────────────────────────────────────
--   ALTER TABLE public.dept_request_items DROP COLUMN IF EXISTS "productId";
--   ⚠️ บรรทัดที่ผูก FG ไปแล้วเสียตัวชี้ (ไฟล์ยังอยู่ที่สินค้าครบ)
--  รันซ้ำได้
-- ============================================================

ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "productId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_items_product_fkey'
  ) THEN
    ALTER TABLE public.dept_request_items
      ADD CONSTRAINT dept_request_items_product_fkey
      FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dept_request_items_product_idx
  ON public.dept_request_items ("productId") WHERE "productId" IS NOT NULL;

COMMENT ON COLUMN public.dept_request_items."productId" IS
  'FG ที่บรรทัดขอเอกสาร (MSDS / Spec Sheet) ขอ — RD ส่งงานแล้วไฟล์ลงที่สินค้านี้ (mig 0428 · ศูนย์กลางเอกสารของสินค้า P2b)';

NOTIFY pgrst, 'reload schema';
