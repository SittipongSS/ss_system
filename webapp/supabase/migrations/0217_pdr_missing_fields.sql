-- ── 0217 · ช่องที่ขาดจากฟอร์มกระดาษ PDR (FM-RD-01 Rev.02) ───────────────
--
-- ⭐ ที่มา: ผู้ใช้ให้ไล่เทียบทะเบียนกับ PDF ของฟอร์มจริงอีกรอบ · 0214 ทำส่วนหัวไป 21
-- ช่อง แต่ยังขาดอีก 5 กลุ่มที่มีอยู่บนกระดาษและไม่มีที่เก็บเลย ⇒ AE ที่กรอกกระดาษ
-- เป็นจะกรอกในระบบไม่ครบ แล้วต้องไปเขียนมือทับบนเอกสารที่ออกมา
--
-- ⚠️ **prefix `pdr` ทุกตัว** ตามเดิม — `dept_requests` มีคอลัมน์ของกลไกคำร้องเยอะแล้ว
-- ⚠️ **ไม่ผูก CHECK กับชุดตัวเลือก** — ชุดอยู่ในทะเบียนฝั่งโค้ด (lib/requests/pdrFields.js)
-- และฟอร์มกระดาษยังขึ้น Rev. ใหม่ได้อีก · ที่ผูกคือ **ความยาว** ซึ่งเป็นเรื่องข้อมูลเสีย
--
-- additive ล้วน รันซ้ำได้ · รันก่อน deploy ได้ (โค้ดเก่าไม่รู้จักคอลัมน์ก็ทำงานเหมือนเดิม)

ALTER TABLE public.dept_requests
  -- ⭐ ประเภทของคำขอสองแบบมีช่องกรอกต่อบนกระดาษ ซึ่ง 0214 ไม่ได้เก็บ:
  --   Product Modification → (รหัสสินค้าก่อนหน้า)
  --   Cost Reduction       → (รหัสลูกค้า / รหัสสินค้าก่อนหน้า)
  -- ⚠️ **ช่องเดียวรับทั้งสองแบบ** — เป็นช่องเดียวกันในเชิงความหมาย ("อ้างถึงของเดิม
  -- ตัวไหน") และแยกสองคอลัมน์จะได้คอลัมน์ที่ว่างเสมอหนึ่งตัวตลอดกาล
  ADD COLUMN IF NOT EXISTS "pdrPrevProductCode"  text,

  -- ⭐ 2.8 รูปแบบบรรจุภัณฑ์ — ขวด · ฝา · กล่อง (เลือกได้หลายอย่าง)
  -- ⚠️ `text[]` ตามแพตเทิร์นของ dept_request_scents.scentotypes (0213) ไม่ใช่ csv
  ADD COLUMN IF NOT EXISTS "pdrPackagingForms"   text[] NOT NULL DEFAULT '{}',
  -- "มีภาพประกอบ / ไม่มีภาพประกอบ" — มติผู้ใช้: **ถ้าบอกว่ามี ต้องแนบภาพจริง**
  -- (ด่านบังคับแนบอยู่ฝั่งโค้ด เพราะไฟล์แนบต้องมี id ของคำร้องก่อน)
  ADD COLUMN IF NOT EXISTS "pdrPackagingArtwork" text,

  -- ⭐ 2.9 Value Proposition — Attribute / Benefit / Value
  -- มติผู้ใช้: **ของทั้งใบ ไม่ใช่รายกลิ่น** ⇒ อยู่บนหัวคำร้อง ไม่ใช่ dept_request_scents
  ADD COLUMN IF NOT EXISTS "pdrVpAttribute"      text,
  ADD COLUMN IF NOT EXISTS "pdrVpBenefit"        text,
  ADD COLUMN IF NOT EXISTS "pdrVpValue"          text,

  -- ⭐ Regulatory & Compliance — เอกสารที่ลูกค้าต้องการ
  -- มติผู้ใช้: **ติ๊กได้ทั้ง 6 ตัว แต่ไม่ติ๊กไว้ล่วงหน้า** · กระดาษเขียนว่า COA/MSDS/
  -- IFRA/อย. "มีให้เป็นพื้นฐาน" แต่ยังมีช่องติ๊ก ⇒ ให้ AE ยืนยันเองว่าใบนี้ต้องการอะไร
  -- ค่าที่ใช้: coa · msds · ifra · fda · halal · export
  ADD COLUMN IF NOT EXISTS "pdrDocuments"        text[] NOT NULL DEFAULT '{}',
  -- "เอกสารส่งออก ______" — ระบุประเทศ/ชนิดเอกสารต่อท้ายช่องติ๊ก
  ADD COLUMN IF NOT EXISTS "pdrExportDocNote"    text;

COMMENT ON COLUMN public.dept_requests."pdrPrevProductCode" IS
  'รหัสสินค้า/ลูกค้าก่อนหน้า — ใช้กับ Product Modification และ Cost Reduction';
COMMENT ON COLUMN public.dept_requests."pdrPackagingForms" IS
  'รูปแบบบรรจุภัณฑ์ (ข้อ 2.8): bottle · cap · box — ชุดค่าอยู่ที่ lib/requests/pdrFields.js';
COMMENT ON COLUMN public.dept_requests."pdrPackagingArtwork" IS
  'มีภาพประกอบบรรจุภัณฑ์หรือไม่: has · none — "has" บังคับให้แนบไฟล์จริง';
COMMENT ON COLUMN public.dept_requests."pdrDocuments" IS
  'เอกสารที่ลูกค้าต้องการ (ข้อ Regulatory): coa · msds · ifra · fda · halal · export';

-- ── ความยาว — กันข้อมูลเสีย ไม่ใช่กันคำศัพท์ ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_requests_pdr_extra_len_check'
  ) THEN
    ALTER TABLE public.dept_requests ADD CONSTRAINT dept_requests_pdr_extra_len_check CHECK (
      ("pdrPrevProductCode"  IS NULL OR char_length("pdrPrevProductCode")  <= 200)
      AND ("pdrPackagingArtwork" IS NULL OR char_length("pdrPackagingArtwork") <= 40)
      AND ("pdrVpAttribute"   IS NULL OR char_length("pdrVpAttribute")   <= 2000)
      AND ("pdrVpBenefit"     IS NULL OR char_length("pdrVpBenefit")     <= 2000)
      AND ("pdrVpValue"       IS NULL OR char_length("pdrVpValue")       <= 2000)
      AND ("pdrExportDocNote" IS NULL OR char_length("pdrExportDocNote") <= 500)
      -- ⚠️ จำกัดจำนวนสมาชิกของ array ด้วย — ยิงตรงส่งมาหมื่นตัวได้ถ้าไม่กัน
      AND (array_length("pdrPackagingForms", 1) IS NULL OR array_length("pdrPackagingForms", 1) <= 10)
      AND (array_length("pdrDocuments", 1)      IS NULL OR array_length("pdrDocuments", 1)      <= 20)
    );
  END IF;
END $$;
