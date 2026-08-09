-- ── 0227 · PDR: หมวดสินค้าหลายรายการ + ช่อง "อื่น ๆ" ที่พิมพ์ต่อได้ ──────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-09) สามข้อ:
--   1 "ประเภทสินค้า ก็ใช้เป็น selector หมวดสินค้า เลือกได้หลายรายการ"
--   2 "รูปแบบบรรจุภัณฑ์ … เพิ่มปุ่มอื่น ๆ ถ้ากด ให้มีช่องให้พิมพ์"
--   3 เช่นเดียวกับ "เอกสารที่ลูกค้าต้องการ"
--
-- ⚠️ **ไม่แก้ `pdrProductKind` เดิม แต่เพิ่มคอลัมน์ใหม่** — คอลัมน์เดิมเป็น text ที่
-- ใบเก่ากรอกเป็นข้อความอิสระไว้แล้ว (เช่น "ครีมบำรุงผิว") การยัดรหัสหมวดคั่นจุลภาค
-- ลงช่องเดิมจะทำให้ค่าเก่ากับค่าใหม่อ่านด้วยกฎเดียวกันไม่ได้ ⇒ เก็บของเก่าไว้อ่าน
-- (จอสรุป/เอกสารยังพิมพ์ได้) แล้วให้ฟอร์มใหม่เขียนลงคอลัมน์ array แทน
--
-- ⚠️ **`text[]` ไม่ใช่ csv** — แพตเทิร์นเดียวกับ `pdrPackagingForms`/`pdrDocuments`
-- (0218) และ `dept_request_scents.scentotypes` (0213)
--
-- ⚠️ **ช่อง "อื่น ๆ" เป็นคอลัมน์ note แยก ไม่ใช่สมาชิกในอาร์เรย์** — ตามแพตเทิร์นของ
-- `pdrExportDocNote` (0218) · ยัดข้อความอิสระปนเข้าไปในอาร์เรย์ของ "รหัสตัวเลือก"
-- เมื่อไร ตัวนับ/ตัวแปลงป้ายจะเจอค่าที่ไม่รู้จักแล้วพิมพ์ค่าดิบออกกระดาษ
--
-- additive ล้วน รันซ้ำได้ · รันก่อน deploy ได้ (โค้ดเก่าไม่รู้จักคอลัมน์ก็ทำงานเหมือนเดิม)

ALTER TABLE public.dept_requests
  -- ⭐ หมวดสินค้าที่จะพัฒนา — เลือกจากทะเบียนหมวดสินค้าได้หลายรายการ
  -- ⚠️ เก็บ `typeCode` (รูปแบบ NN-NNN) ไม่ใช่ id — ชุดเดียวกับที่บรรทัดคำร้องเก็บ
  -- (`dept_request_items.categoryCode`, 0204) เพื่อให้สองที่เทียบกันได้ตรง ๆ
  ADD COLUMN IF NOT EXISTS "pdrProductKinds"       text[] NOT NULL DEFAULT '{}',
  -- "รูปแบบบรรจุภัณฑ์ · อื่น ๆ ______"
  ADD COLUMN IF NOT EXISTS "pdrPackagingFormsOther" text,
  -- "เอกสารที่ลูกค้าต้องการ · อื่น ๆ ______"
  ADD COLUMN IF NOT EXISTS "pdrDocumentsOther"      text;

COMMENT ON COLUMN public.dept_requests."pdrProductKinds" IS
  'หมวดสินค้าที่จะพัฒนา (typeCode หลายรายการ) — แทนช่องข้อความ pdrProductKind ที่เก็บได้ค่าเดียว';
COMMENT ON COLUMN public.dept_requests."pdrPackagingFormsOther" IS
  'ข้อความต่อท้ายตัวเลือก "อื่น ๆ" ของรูปแบบบรรจุภัณฑ์ — ว่างเมื่อไม่ได้ติ๊กอื่น ๆ';
COMMENT ON COLUMN public.dept_requests."pdrDocumentsOther" IS
  'ข้อความต่อท้ายตัวเลือก "อื่น ๆ" ของเอกสารที่ลูกค้าต้องการ — ว่างเมื่อไม่ได้ติ๊กอื่น ๆ';

-- ⚠️ CHECK แยกชื่อจาก 0218 — ต่อท้าย constraint เดิมไม่ได้ (ต้อง DROP/ADD ซึ่งจะ
-- ล็อกตารางนานกว่าและพังถ้ามีแถวที่ค้างกฎเก่าอยู่)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_requests_pdr_multi_len_check'
  ) THEN
    ALTER TABLE public.dept_requests ADD CONSTRAINT dept_requests_pdr_multi_len_check CHECK (
      ("pdrPackagingFormsOther" IS NULL OR char_length("pdrPackagingFormsOther") <= 500)
      AND ("pdrDocumentsOther"  IS NULL OR char_length("pdrDocumentsOther")      <= 500)
      -- จำนวนหมวดต่อใบ — เผื่อไว้กว้างกว่าที่ใช้จริง แต่กันยิงตรงส่งมาเป็นพัน
      AND (array_length("pdrProductKinds", 1) IS NULL OR array_length("pdrProductKinds", 1) <= 20)
    );
  END IF;
END $$;
