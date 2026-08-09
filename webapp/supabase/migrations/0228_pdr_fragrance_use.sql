-- ── 0228 · PDR: หัวน้ำหอมแล้วต้องบอกว่าเอาไปทำอะไรต่อ ─────────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-09): "หมวดสินค้า ถ้าเลือก 02-020 หัวน้ำหอม ให้เพิ่ม
-- text พิมพ์ (หากผลิตเป็น Fragrance Oil ให้ระบุด้วยว่านำไปใช้กับสินค้าประเภทใด)"
--
-- ⚠️ **ทำไมต้องมีช่องนี้จริง ๆ** — โน้ตสีแดงบนกระดาษข้อ 1.11 เขียนไว้อยู่แล้ว: หัวน้ำหอม
-- เป็นวัตถุดิบ ไม่ใช่ปลายทาง · RD ตั้งความเข้มข้นกับเบสไม่ได้ถ้าไม่รู้ว่าเอาไปลงน้ำหอม
-- หรือน้ำยาปรับผ้านุ่ม (คนละโจทย์กันคนละโลก) · ก่อนหน้านี้คำเตือนเป็นแค่ *คำขยายป้าย*
-- ไม่มีที่ให้กรอกคำตอบ ⇒ ไม่มีใครตอบ
--
-- ⚠️ **คอลัมน์แยก ไม่ปนเข้า `pdrProductKinds`** — อาเรย์นั้นเก็บ "รหัสหมวดจากทะเบียน"
-- ล้วน (แพตเทิร์นเดียวกับ pdrPackagingFormsOther/pdrDocumentsOther ใน 0227) ·
-- ยัดข้อความอิสระปนเข้าไปเมื่อไร ตัวแปลงป้ายจะเจอค่าที่ไม่รู้จักแล้วพิมพ์ค่าดิบออกกระดาษ
--
-- additive ล้วน รันซ้ำได้ · รันก่อน deploy ได้ (โค้ดเก่าไม่รู้จักคอลัมน์ก็ทำงานเหมือนเดิม)

ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "pdrFragranceUse" text;

COMMENT ON COLUMN public.dept_requests."pdrFragranceUse" IS
  'หัวน้ำหอมนี้นำไปใช้กับสินค้าประเภทใด — โผล่เมื่อ pdrProductKinds มีหมวดหัวน้ำหอม (02-020)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_requests_pdr_fragrance_use_check'
  ) THEN
    ALTER TABLE public.dept_requests ADD CONSTRAINT dept_requests_pdr_fragrance_use_check CHECK (
      "pdrFragranceUse" IS NULL OR char_length("pdrFragranceUse") <= 500
    );
  END IF;
END $$;
