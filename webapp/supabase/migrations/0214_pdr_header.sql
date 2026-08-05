-- ── 0214 · ส่วนหัวของแบบฟอร์ม PDR (FM-RD-01 Rev.02) ────────────────────
--
-- ⭐ ต่อจาก 0213 ที่ทำชั้นบรีฟรายกลิ่นไว้แล้ว — ใบนี้เก็บ **ส่วนที่กรอกครั้งเดียวทั้งใบ**
-- (ข้อมูลลูกค้า · ราคาเป้าหมาย · ข้อกำหนดผลิตภัณฑ์) ⇒ ฟอร์มถึงจะบันทึกได้ครบ
--
-- ⚠️ **แตกเป็นคอลัมน์จริง ไม่ใช่ jsonb ก้อนเดียว** (มติผู้ใช้ 2026-08-06) — Target Cost /
-- MOQ / ประเภทของคำขอ เป็นของที่จะถูกเอาไปทำรายงานแน่ ๆ · jsonb จะกลายเป็นที่ที่
-- ข้อมูลเข้าไปแล้วไม่มีใครดึงออกมาใช้
--
-- ⚠️ **prefix `pdr` ทุกตัว** — `dept_requests` มีคอลัมน์ของกลไกคำร้องอยู่แล้วเยอะ
-- ไม่ prefix แล้วคนอ่านแยกไม่ออกว่าอันไหนเป็นของแบบฟอร์ม อันไหนเป็นของระบบ
--
-- ⚠️ **ไม่ผูก CHECK กับชุดตัวเลือก** (requestType / customerKind / texture) — ชุดอยู่ใน
-- ทะเบียนฝั่งโค้ดตามแพตเทิร์นเดิม และฟอร์มกระดาษเพิ่งขึ้น Rev.02 ยังเปลี่ยนได้อีก ·
-- ที่ผูกคือ **ความยาว** ซึ่งเป็นเรื่องของข้อมูลเสีย ไม่ใช่คำศัพท์

ALTER TABLE public.dept_requests
  -- ข้อมูลคำขอ
  ADD COLUMN IF NOT EXISTS "pdrRequestType"        text,
  -- ข้อมูลลูกค้า (ที่ระบบไม่รู้ — ลูกค้า/ดีล/จำนวนกลิ่นเติมจาก SO อยู่แล้ว)
  ADD COLUMN IF NOT EXISTS "pdrCustomerBrand"      text,
  ADD COLUMN IF NOT EXISTS "pdrMoodTone"           text,
  ADD COLUMN IF NOT EXISTS "pdrBrandDirection"     text,
  ADD COLUMN IF NOT EXISTS "pdrShipTo"             text,
  ADD COLUMN IF NOT EXISTS "pdrCustomerKind"       text,
  -- ⭐ มูลค่า **ทั้งโครงการ** ไม่ใช่แค่ค่าออกแบบกลิ่นในใบนี้ (มติผู้ใช้) จึงกรอกเอง
  -- ไม่ derive จากดีล — ลูกค้าอาจจ่ายค่าออกแบบเก้าหมื่น แต่โครงการรวมทั้งปีเป็นล้าน
  ADD COLUMN IF NOT EXISTS "pdrProjectValue"       numeric,
  ADD COLUMN IF NOT EXISTS "pdrTargetDemographic"  text,
  ADD COLUMN IF NOT EXISTS "pdrTargetPsychographic" text,
  ADD COLUMN IF NOT EXISTS "pdrTargetPainpoint"    text,
  ADD COLUMN IF NOT EXISTS "pdrProductKind"        text,
  -- ⚠️ คนละอันกับ `requestedDueDate` (วันที่คาดหวังตัวอย่างกลิ่น) — สองอันนี้เป็นวันที่
  -- ของ *โครงการ* ไม่ใช่ตัวจับเวลาของ RD (มติผู้ใช้)
  ADD COLUMN IF NOT EXISTS "pdrWantedAt"           date,
  ADD COLUMN IF NOT EXISTS "pdrSellFrom"           date,
  -- ข้อกำหนดผลิตภัณฑ์
  ADD COLUMN IF NOT EXISTS "pdrTargetCost"         numeric,
  ADD COLUMN IF NOT EXISTS "pdrTargetPrice"        numeric,
  ADD COLUMN IF NOT EXISTS "pdrMoq"                text,
  ADD COLUMN IF NOT EXISTS "pdrTexture"            text,
  ADD COLUMN IF NOT EXISTS "pdrColor"              text,
  ADD COLUMN IF NOT EXISTS "pdrPackSize"           text,
  ADD COLUMN IF NOT EXISTS "pdrBrandSample"        text,
  ADD COLUMN IF NOT EXISTS "pdrSpecialRequirements" text;

-- ความยาว + ราคาห้ามติดลบ · ตั้งชื่อ constraint ให้ตรงกับตารางจริง (บทเรียน 0212:
-- CHECK แบบ inline ได้ชื่อที่ Postgres ตั้งเอง แล้วรุ่นถัดไปต้องมานั่งค้นด้วยนิยาม)
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_pdr_text_check;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_pdr_text_check CHECK (
    ("pdrCustomerBrand"       IS NULL OR length("pdrCustomerBrand")       <= 200) AND
    ("pdrMoodTone"            IS NULL OR length("pdrMoodTone")            <= 500) AND
    ("pdrBrandDirection"      IS NULL OR length("pdrBrandDirection")      <= 500) AND
    ("pdrShipTo"              IS NULL OR length("pdrShipTo")              <= 500) AND
    ("pdrTargetDemographic"   IS NULL OR length("pdrTargetDemographic")   <= 500) AND
    ("pdrTargetPsychographic" IS NULL OR length("pdrTargetPsychographic") <= 500) AND
    ("pdrTargetPainpoint"     IS NULL OR length("pdrTargetPainpoint")     <= 500) AND
    ("pdrProductKind"         IS NULL OR length("pdrProductKind")         <= 200) AND
    ("pdrMoq"                 IS NULL OR length("pdrMoq")                 <= 100) AND
    ("pdrColor"               IS NULL OR length("pdrColor")               <= 200) AND
    ("pdrPackSize"            IS NULL OR length("pdrPackSize")            <= 500) AND
    ("pdrBrandSample"         IS NULL OR length("pdrBrandSample")         <= 500) AND
    ("pdrSpecialRequirements" IS NULL OR length("pdrSpecialRequirements") <= 2000)
  );

ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_pdr_amount_check;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_pdr_amount_check CHECK (
    ("pdrProjectValue" IS NULL OR "pdrProjectValue" >= 0) AND
    ("pdrTargetCost"   IS NULL OR "pdrTargetCost"   >= 0) AND
    ("pdrTargetPrice"  IS NULL OR "pdrTargetPrice"  >= 0)
  );

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- ⚠ ย้อนได้ก็ต่อเมื่อยังไม่มีใบไหนกรอก PDR จริง
-- ALTER TABLE public.dept_requests
--   DROP CONSTRAINT IF EXISTS dept_requests_pdr_text_check,
--   DROP CONSTRAINT IF EXISTS dept_requests_pdr_amount_check,
--   DROP COLUMN IF EXISTS "pdrRequestType", DROP COLUMN IF EXISTS "pdrCustomerBrand";
--   -- (ที่เหลือทำนองเดียวกัน)
