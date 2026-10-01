-- ============================================================
--  Migration 0398: ทะเบียนขนาดแพ็คเกจ + ขนาดที่เคาะบนผลประเมินพื้นที่
--  สเปก ~/ss-team/mockups/survey-report-doc/PR-P.md · มติเจ้าของ 01/10
--
--  ⭐ ที่มา: เดิมหัวหน้า TS เคาะแค่ "จำนวนแพ็คเกจ" ต่อพื้นที่ และระบบเสนอด้วยสูตร
--    ceil(ลบ.ม. ÷ 2,400) · มติใหม่: พื้นที่หนึ่งมี **ขนาดเดียว + จำนวน** —
--      XS = Extra Small (ห้องน้ำ · ไม่มีช่วง ลบ.ม. · หัวหน้าเลือกเอง ระบบไม่เสนอ)
--      SM = Small (ไม่เกิน 300 ลบ.ม.) · ST = Standard (ไม่เกิน 2,400 ลบ.ม.)
--      XL = Extra Large (เกิน 2,400 ลบ.ม.)
--    ระบบเสนอขนาดจากช่วง ลบ.ม. และเสนอจำนวน 1 · หัวหน้าเปลี่ยนได้ทั้งคู่ · สูตรหารเดิมถอดออก
--
--  ⭐ **ทะเบียนเพิ่ม · แก้ · ลบ ได้** (มติ 01/10 "อยากให้ เพิ่ม ลบ ได้") — ไม่ใช่สี่ขนาดตายตัว
--    หน้าทะเบียนอยู่ที่ระบบฐานข้อมูล (/database/package-sizes) · แก้ได้เฉพาะแอดมินและหัวหน้าฝ่ายบริการ
--    ⇒ **พื้นที่เก็บรหัสขนาดเป็นภาพนิ่ง ไม่มี FK และไม่มี CHECK รายชื่อขนาด** (แผนเดิม PLAN.md §8.2 ถูกแทน)
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy**
--    (โค้ดใหม่อ่านตาราง service_package_sizes และเขียนคอลัมน์ packageSize* —
--     ไม่มีของพวกนี้ = บันทึกการเคาะไม่ผ่าน และส่งผลประเมินไม่ได้ทั้งระบบ)
--  ⚠ **รันก่อน deploy ได้อย่างปลอดภัย** — เพิ่มอย่างเดียว: โค้ดเก่าไม่เอ่ยชื่อตาราง/คอลัมน์ใหม่เลย
--  ⚠ รันซ้ำได้ทั้งใบ
--  ⚠ **หลัง deploy ให้รันคำสั่ง UPDATE ท้ายใบ (ข้อ 3) ซ้ำอีกหนึ่งครั้ง** — เก็บพื้นที่ที่ถูกเคาะด้วยโค้ดเก่า
--    ในช่วงระหว่างรันใบนี้กับ deploy (โค้ดเก่าเขียนแค่จำนวน ไม่เขียนขนาด ⇒ ด่านส่งผลจะฟ้อง
--    "ยังไม่ได้เลือกขนาดแพ็คเกจ" จนกว่าจะเก็บ)
--
--  ⭐ **ลำดับขึ้นระบบ (สี่ขั้น)**
--    ① รันใบนี้บน Supabase SQL Editor
--    ② merge + deploy
--    ③ แอดมินกด **"บังคับรีเฟรชทุกคน"** ที่หน้า /users — แท็บใบประเมินที่เปิดค้างมาก่อน deploy ไม่มีแถบเลือกขนาด
--       ⇒ หัวหน้าเคาะจากแท็บนั้นไม่ได้ (server ตอบ "เลือกขนาดแพ็คเกจด้วย (หน้านี้เป็นรุ่นเก่า — โหลดหน้าใหม่…)")
--       ไม่มีข้อมูลเสีย (server ปฏิเสธ) แต่เป็นทางตันจนกว่าจะโหลดหน้าใหม่
--    ④ รัน UPDATE ท้ายใบ (ข้อ 3) ซ้ำอีกหนึ่งครั้ง
-- ============================================================

BEGIN;

-- ── 1) ทะเบียนขนาดแพ็คเกจ — ของใหม่ ────────────────────────────────────────
--
-- 🔴 **`code` คือสิ่งที่พื้นที่เก็บไว้** (ภาพนิ่ง) ⇒ แก้รหัสไม่ได้หลังสร้าง — ด่านอยู่ในโค้ด
--   (`packageSizeError` · lib/service/packageSizes.js) · อยากได้รหัสใหม่ = เพิ่มขนาดใหม่แล้วลบตัวเก่า
--
-- ⭐ `autoSuggest` = ระบบเสนอขนาดนี้จากปริมาตรได้ไหม
--     true  + `maxCbm` มีค่า = เสนอเมื่อปริมาตรไม่เกินค่านี้ (ช่วงเล็กสุดที่ยังครอบชนะ)
--     true  + `maxCbm` ว่าง  = ขนาดไม่มีเพดาน — เสนอเมื่อเกินทุกช่วง (มีได้ตัวเดียว)
--     false                  = หัวหน้าเลือกเอง (XS ห้องน้ำ) — ระบบไม่เสนอเด็ดขาด และต้องไม่มีช่วง
--
-- ⭐ **ไม่มีคอลัมน์ลำดับ** — ลำดับในแถบเลือก/ตารางมาจากข้อมูล (`sortPackageSizes`):
--   เลือกเองตามรหัส → ช่วงน้อยไปมาก → ไม่มีเพดานท้ายสุด ⇒ ขนาดใหม่ลงถูกที่เองโดยไม่ต้องมีใครจัด
CREATE TABLE IF NOT EXISTS public.service_package_sizes (
  code            text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{2,4}$'),
  "nameEn"        text NOT NULL CHECK (length(btrim("nameEn")) BETWEEN 1 AND 60),
  "maxCbm"        numeric CHECK ("maxCbm" IS NULL OR "maxCbm" > 0),
  "autoSuggest"   boolean NOT NULL DEFAULT true,
  note            text CHECK (note IS NULL OR length(note) <= 500),
  "updatedById"   text,
  "updatedByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_package_sizes_manual_no_band CHECK ("autoSuggest" OR "maxCbm" IS NULL)
);

-- 🔴 **ระบบต้องเสนอได้คำตอบเดียว** — สองขนาดช่วงเดียวกัน หรือสองขนาดไม่มีเพดาน = เลือกไม่ได้ว่าจะเสนอตัวไหน
--   (ข้อความที่คนอ่านรู้เรื่องอยู่ในโค้ด · สองตัวนี้คือตาข่ายเมื่อสองคนกดบันทึกพร้อมกัน → โค้ดตอบ 409)
CREATE UNIQUE INDEX IF NOT EXISTS service_package_sizes_band_uk
  ON public.service_package_sizes ("maxCbm") WHERE "autoSuggest" AND "maxCbm" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_package_sizes_open_uk
  ON public.service_package_sizes ("autoSuggest") WHERE "autoSuggest" AND "maxCbm" IS NULL;

COMMENT ON TABLE public.service_package_sizes IS
  'ทะเบียนขนาดแพ็คเกจ (mig 0398) — ต้นทางของแถบ "ขนาด" บนผลประเมินพื้นที่ · เพิ่ม/แก้/ลบได้ที่ '
  '/database/package-sizes · พื้นที่ (service_survey_zones) เก็บ code เป็นภาพนิ่ง ไม่มี FK';
COMMENT ON COLUMN public.service_package_sizes."maxCbm" IS
  'ปริมาตรสูงสุด (ลบ.ม.) ที่ระบบเสนอขนาดนี้ — ว่าง = ไม่มีเพดาน (autoSuggest) หรือไม่มีช่วง (หัวหน้าเลือกเอง)';
COMMENT ON COLUMN public.service_package_sizes."autoSuggest" IS
  'true = ระบบเสนอจากปริมาตร · false = หัวหน้าเลือกเองเท่านั้น (เช่น XS ห้องน้ำ) ระบบไม่เสนอ';

-- ทะเบียนนี้อ่าน/เขียนผ่าน API เท่านั้น (service_role) — แบบเดียวกับทะเบียนรุ่นเครื่อง (0344)
ALTER TABLE public.service_package_sizes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_package_sizes FROM anon, authenticated;
GRANT ALL ON public.service_package_sizes TO service_role;

-- ⚠️ **seed เฉพาะทะเบียนว่าง** — รันใบนี้ซ้ำต้องไม่ปลุกขนาดที่เจ้าของลบไปแล้วกลับมา
--   (เขียนแบบ "แทรกถ้ายังไม่มีรหัสนี้" จะทำอย่างนั้นพอดี ⇒ เช็กทั้งทะเบียน ไม่ใช่รายรหัส)
INSERT INTO public.service_package_sizes (code, "nameEn", "maxCbm", "autoSuggest", note)
SELECT v.code, v."nameEn", v."maxCbm", v."autoSuggest", v.note FROM (VALUES
  ('XS', 'Extra Small', NULL::numeric, false, 'ห้องน้ำ'),
  ('SM', 'Small',       300,           true,  NULL),
  ('ST', 'Standard',    2400,          true,  NULL),
  ('XL', 'Extra Large', NULL,          true,  NULL)
) AS v(code, "nameEn", "maxCbm", "autoSuggest", note)
WHERE NOT EXISTS (SELECT 1 FROM public.service_package_sizes);

-- ── 2) ขนาดที่หัวหน้าเคาะ — ภาพนิ่งบนแถวผลวัด ──────────────────────────────
--
-- 🔴 **ไม่มี FK ไปทะเบียนโดยตั้งใจ** — ทะเบียนลบได้ · FK แปลว่าลบขนาดที่เคยใช้ไม่ได้เลย หรือ (ถ้า cascade/set null)
--   ผลประเมินที่ส่งให้ฝ่ายขายไปแล้วเปลี่ยนเงียบ ๆ · ใบที่ **ยังไม่ส่งผล** ซึ่งถือขนาดที่ถูกลบ ถูกด่านในโค้ด
--   (`surveyPackageSizeGates`) บังคับให้เลือกใหม่ก่อนส่ง
--
--   "packageSize"          รหัสขนาดที่หัวหน้าเลือก (คู่กับ packageQty เดิม)
--   "packageSizeSuggested" รหัสที่ระบบเสนอ ณ ตอนเคาะ — ด่าน "ต่างจากที่ระบบเสนอต้องบอกเหตุผล" (0345) อ่านตัวนี้
--                          ⇒ แก้ช่วงในทะเบียนทีหลังไม่ทำให้แถวที่เคาะไปแล้วต้องมีเหตุผลขึ้นมาเอง
--   "packageSizeManual"    ขนาดที่เลือกเป็นแบบ "หัวหน้าเลือกเอง" ไหม ณ ตอนเคาะ — XS ห้องน้ำไม่ต้องบอกเหตุผล
ALTER TABLE public.service_survey_zones
  ADD COLUMN IF NOT EXISTS "packageSize" text,
  ADD COLUMN IF NOT EXISTS "packageSizeSuggested" text,
  ADD COLUMN IF NOT EXISTS "packageSizeManual" boolean NOT NULL DEFAULT false;

-- รูปแบบรหัสเท่านั้น (ไม่ใช่รายชื่อขนาด) — กันค่าขยะ แต่ไม่ผูกกับแถวทะเบียน
ALTER TABLE public.service_survey_zones DROP CONSTRAINT IF EXISTS service_survey_zones_package_size_fmt;
ALTER TABLE public.service_survey_zones ADD CONSTRAINT service_survey_zones_package_size_fmt CHECK (
  ("packageSize" IS NULL OR "packageSize" ~ '^[A-Z0-9]{2,4}$') AND
  ("packageSizeSuggested" IS NULL OR "packageSizeSuggested" ~ '^[A-Z0-9]{2,4}$'));

COMMENT ON COLUMN public.service_survey_zones."packageSize" IS
  'รหัสขนาดแพ็คเกจที่หัวหน้าเคาะ (mig 0398) — ภาพนิ่งจาก service_package_sizes.code ไม่มี FK (ทะเบียนลบได้)';
COMMENT ON COLUMN public.service_survey_zones."packageSizeSuggested" IS
  'รหัสขนาดที่ระบบเสนอ ณ ตอนเคาะ (mig 0398) — ว่าง = แถวก่อนมีขนาด หรือระบบเสนอไม่ได้';
COMMENT ON COLUMN public.service_survey_zones."packageSizeManual" IS
  'ขนาดที่เคาะเป็นแบบหัวหน้าเลือกเองไหม ณ ตอนเคาะ (mig 0398) — true = ไม่ต้องบอกเหตุผลที่ต่างจากที่ระบบเสนอ';

-- ── 3) พื้นที่ที่เคาะไว้ก่อนมีขนาด = ST คงจำนวนเดิม (มติเจ้าของ) ────────────────
--
-- ⚠️ ไม่ประทับ "packageSizeSuggested" — แถวเก่าไม่เคยมีข้อเสนอแบบใหม่ ⇒ ไม่ถูกย้อนบังคับเหตุผล
-- ⚠️ ไม่แตะ "updatedAt" — ช่างที่เปิดใบค้างไว้ต้องไม่โดนด่าน "พื้นที่นี้ถูกแก้จากที่อื่น"
-- ⚠️ แตะเฉพาะแถวที่ยังไม่มีขนาด ⇒ **รันซ้ำได้ และต้องรันซ้ำหนึ่งครั้งหลัง deploy** (ดูหัวใบ)
UPDATE public.service_survey_zones SET "packageSize" = 'ST'
 WHERE "packageQty" IS NOT NULL AND "packageSize" IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  ตรวจหลังรัน:
--    SELECT code, "nameEn", "maxCbm", "autoSuggest" FROM public.service_package_sizes ORDER BY code;
--      → 4 แถว (XS · SM · ST · XL) เมื่อรันครั้งแรก
--    SELECT count(*) FROM public.service_survey_zones WHERE "packageQty" IS NOT NULL AND "packageSize" IS NULL;
--      → 0
-- ============================================================
