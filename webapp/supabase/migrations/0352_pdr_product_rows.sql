-- ============================================================
--  Migration 0352: แบบฟอร์ม PDR รอบใหม่ — ข้อ 2.x รายสินค้า · สวิตช์ที่อยู่จัดส่ง ·
--                  Archetype ของแบรนด์ (มติผู้ใช้ 2026-09-10/11 · ม็อก 4 รอบ)
--
--  ⭐ **ข้อ 2.1–2.7 ย้ายจาก "ระดับใบ" มาเป็น "รายสินค้า"** — ผู้ใช้: *"MOQ ที่คาดหวัง /
--  ลักษณะเนื้อ / สีเนื้อ / หมายเหตุ ควรไปอยู่รายสินค้าที่ขอพัฒนา"* · และเดิมขนาดกับ
--  จำนวน (ข้อ 2.7) เป็นช่องพิมพ์อิสระช่องเดียวทั้งใบ ⇒ ขอสองหมวดในใบเดียว ระบบไม่รู้
--  ว่าขนาดไหนเป็นของหมวดไหน นับหรือเทียบก็ไม่ได้
--  ⇒ ขยายตาราง `dept_request_pdr_targets` (0229 · "1 แถว = สินค้า 1 ตัว" อยู่แล้ว)
--    ไม่สร้างตารางใหม่ — แถวเดียวถือทั้งต้นทุน ราคา และสเปกของสินค้าตัวนั้น
--
--  ⭐ **กลิ่นจากทะเบียนรายแถว (`scentId`)** — ใบพัฒนาสูตร NPD เลือกกลิ่นที่มีอยู่แล้ว
--  (มติ ม-40: พัฒนาสูตรทำจากกลิ่นที่มีในทะเบียน · กลิ่นใหม่เกิดที่พัฒนากลิ่นเท่านั้น)
--  ⚠️ **ว่างได้ที่ DB** — ร่างบันทึกได้ทั้งที่ยังไม่เลือก ส่วน "บังคับก่อนกดส่ง" เป็นด่าน
--     ของแอป (`submitRequestError`) · ใบพัฒนากลิ่นไม่มีช่องนี้ (กลิ่นมาจากบรีฟ)
--  ⚠️ **ON DELETE RESTRICT** เหมือนทุก pointer เข้าทะเบียน (0232 · R-5) — ลบกลิ่นที่
--     ใบคำร้องอ้างอยู่ต้องถูกบอกเป็นภาษาไทยก่อน ไม่ใช่ล้างค่าเงียบ ๆ
--
--  ⚠️ **ไม่ย้ายค่าของใบเก่า** — `pdrMoq`/`pdrTexture`/`pdrColor`/`pdrPackSize` บนหัวใบ
--  (22 ใบบน prod ตอนนับ 2026-09-10) เป็นข้อความรวมทั้งใบ แตกลงแถวอัตโนมัติไม่ได้โดยไม่เดา
--  ⇒ คอลัมน์เดิมคงอยู่ · ทะเบียนช่องประกาศเป็น `legacy` (อ่าน/พิมพ์ได้ ฟอร์มไม่เขียนแล้ว)
--  แพตเทิร์นเดียวกับ `pdrTargetCost`/`pdrTargetPrice` ตอน 0229
--
--  ⭐ **1.7.1 ที่อยู่จัดส่ง = สวิตช์ของตัวเอง** — `true` เท่านั้นที่แปลว่า "ส่งไปที่อยู่
--  ลูกค้า" · `false`/NULL = ใช้ข้อความ `pdrShipTo` ⇒ ใบเก่าพิมพ์เหมือนเดิมทุกใบ
--  ไม่ต้อง backfill · ⚠️ ไม่ derive จาก "pdrShipTo ว่าง" เพราะจะแยก "ยังไม่ตอบ" กับ
--  "ส่งที่เดียวกัน" ไม่ออก และใบเก่าที่เว้นช่องไว้จะเปลี่ยนไปพิมพ์ที่อยู่ลูกค้าเอง
--
--  ⭐ **1.15 Archetype ของแบรนด์ = ระดับใบ** — ไฟล์ PDR ของ AE วางไว้ที่ 2.1.6 ในกล่อง
--  บรีฟ แต่มันเป็นข้อมูลของแบรนด์ (ไม่ใช่รายกลิ่น) และใบพัฒนาสูตรไม่มีบรีฟแล้ว
--  ⇒ อยู่หมวด 1 ต่อท้าย 1.14 · เก็บ key ไม่ใช่ป้าย (แพตเทิร์น scentotypes · 0213/0222)
--
--  additive ล้วน · ไม่แตะข้อมูลเดิม · รันซ้ำได้
--  🛑 **ต้องรันก่อน deploy โค้ด** — PATCH แบบฟอร์ม PDR ลบแล้ว insert แถวสินค้าใหม่
--     ด้วยคีย์ใหม่ และ PostgREST ปฏิเสธ **ทั้งก้อน** เมื่อ body มีคอลัมน์ที่ยังไม่มี
--  ⚠️ รันมือบน Supabase SQL Editor (DDL รันผ่าน PostgREST ไม่ได้)
-- ============================================================

BEGIN;

-- ── หัวใบ: สวิตช์ที่อยู่จัดส่ง + Archetype ────────────────────────────────
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "pdrShipToSameAsCustomer" boolean,
  ADD COLUMN IF NOT EXISTS "pdrArchetypes"           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "pdrArchetypeNotes"       jsonb  NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dept_requests."pdrShipToSameAsCustomer" IS
  'PDR 1.7.1 — true = ส่งตัวอย่างไปที่อยู่ลูกค้า (1.7) · false/NULL = ใช้ข้อความ pdrShipTo';
COMMENT ON COLUMN public.dept_requests."pdrArchetypes" IS
  'PDR 1.15 Archetype ของแบรนด์ — key จากทะเบียนฝั่งโค้ด (ไม่มี CHECK โดยเจตนา)';
COMMENT ON COLUMN public.dept_requests."pdrArchetypeNotes" IS
  'PDR 1.15 ข้อความเขียนต่อของ Archetype ที่ติ๊ก — { key: ข้อความ }';

-- ── แถวสินค้า: ข้อ 2.1 กลิ่น · 2.4 MOQ · 2.5 เนื้อ · 2.6 สี · 2.7 ขนาด/จำนวน/หมายเหตุ ──
ALTER TABLE public.dept_request_pdr_targets
  ADD COLUMN IF NOT EXISTS "scentId"   text,
  ADD COLUMN IF NOT EXISTS "moqValue"  numeric,
  ADD COLUMN IF NOT EXISTS "moqUnit"   text,
  ADD COLUMN IF NOT EXISTS "texture"   text,
  ADD COLUMN IF NOT EXISTS "color"     text,
  ADD COLUMN IF NOT EXISTS "sizeValue" numeric,
  ADD COLUMN IF NOT EXISTS "sizeUnit"  text,
  ADD COLUMN IF NOT EXISTS "qtyValue"  numeric,
  ADD COLUMN IF NOT EXISTS "qtyUnit"   text,
  ADD COLUMN IF NOT EXISTS "note"      text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_pdr_targets_scent_fkey'
  ) THEN
    ALTER TABLE public.dept_request_pdr_targets
      ADD CONSTRAINT dept_request_pdr_targets_scent_fkey
      FOREIGN KEY ("scentId") REFERENCES public.scents(id) ON DELETE RESTRICT;
  END IF;

  -- ⚠️ ความยาวต้อง **ไม่หลวมกว่า** ด่านของแอป (`lib/requests/pdrTargets.js`) — ด่านแอป
  --    เป็นตัวบอกเหตุเป็นภาษาไทย ส่วนตรงนี้คือตาข่ายชั้นสุดท้าย
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_pdr_targets_spec_check'
  ) THEN
    ALTER TABLE public.dept_request_pdr_targets
      ADD CONSTRAINT dept_request_pdr_targets_spec_check CHECK (
        ("moqValue"  IS NULL OR "moqValue"  >= 0)
        AND ("sizeValue" IS NULL OR "sizeValue" >= 0)
        AND ("qtyValue"  IS NULL OR "qtyValue"  >= 0)
        AND ("moqUnit"  IS NULL OR char_length("moqUnit")  <= 50)
        AND ("sizeUnit" IS NULL OR char_length("sizeUnit") <= 50)
        AND ("qtyUnit"  IS NULL OR char_length("qtyUnit")  <= 50)
        AND ("texture"  IS NULL OR char_length("texture")  <= 40)
        AND ("color"    IS NULL OR char_length("color")    <= 200)
        AND ("note"     IS NULL OR char_length("note")     <= 500)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dept_request_pdr_targets_scent_idx
  ON public.dept_request_pdr_targets ("scentId") WHERE "scentId" IS NOT NULL;

COMMIT;
