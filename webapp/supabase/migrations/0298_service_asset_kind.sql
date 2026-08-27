-- ============================================================
--  Migration 0298: service_assets — ชนิดอุปกรณ์ + โซน + ค่าตั้งเครื่อง (F-2)
--
--  มติ docs/service-field-operations.md (2026-08-02) ข้อ 12–14:
--    · ไม่ใช่ทุกตัวเป็นเครื่องกระจายกลิ่น — kind = diffuser | reed | soap | alcohol
--      **ประกาศชนิดในโค้ด (lib/service/assetKinds.js) ไม่ใช่ CHECK ใน DB** —
--      เพิ่มชนิดใหม่ = แก้ไฟล์เดียว ไม่ต้องออก migration (แพตเทิร์น requestTypes.js)
--    · หน่วยของแถวแล้วแต่ชนิด — diffuser = แถวต่อเครื่อง (มี serial) ·
--      reed/soap/alcohol = แถวเดียว + qty จำนวนจุด (AWC เครื่องกดสบู่ 242 จุด
--      ไม่ใช่ 242 แถวขยะ)
--    · ค่าตั้งเฉพาะชนิดอยู่ใน settings jsonb ตรวจที่ API ตาม kind
--      (diffuser: workSec/pauseSec/schedule/grade · reed: ก้าน/รอบเปลี่ยน · ฯลฯ)
--  + zoneId (เฟส 2 แผนระบบธุรกิจบริการ 2026-08-27): เครื่องสังกัดโซน เพื่อ
--    consumption ราย โซน ผ่านเส้นทางเดียว visit_items → asset → zone
--
--  ⚠ ต้องรันหลัง 0297 (FK ชี้ service_zones) · additive + DEFAULT ล้วน รันก่อน deploy ได้
-- ============================================================

BEGIN;

ALTER TABLE public.service_assets
  -- SET NULL: ลบโซน (ที่ยังไม่มีประวัติ) แล้วเครื่องต้องอยู่ต่อ กลับไปกอง "ยังไม่ระบุโซน"
  ADD COLUMN IF NOT EXISTS "zoneId"  text REFERENCES public.service_zones(id) ON DELETE SET NULL,
  -- DEFAULT 'diffuser' = ความจริงของแถวเดิมทุกแถว (โมดูลนี้เกิดมาเก็บเครื่องกระจายกลิ่นอย่างเดียว)
  ADD COLUMN IF NOT EXISTS kind      text NOT NULL DEFAULT 'diffuser',
  -- จำนวนจุดของชนิดที่ไม่มี serial รายตัว (reed/soap/alcohol) · diffuser ปล่อยว่าง
  ADD COLUMN IF NOT EXISTS qty       numeric CHECK (qty IS NULL OR qty > 0),
  -- รุ่นเดียวกันมีสองสี ต้องแยกจาก model (ใบส่งงานจริง: O800 ขาว 2 · O800 ดำ 5)
  ADD COLUMN IF NOT EXISTS colour    text CHECK (colour IS NULL OR length(colour) <= 50),
  -- ตำแหน่งในไซต์ — 'ชั้น 2' · 'ประตูทางเข้าขวามือ' (เดิมถูกยัดใน label จนค้นไม่ได้)
  ADD COLUMN IF NOT EXISTS floor     text CHECK (floor IS NULL OR length(floor) <= 50),
  ADD COLUMN IF NOT EXISTS spot      text CHECK (spot IS NULL OR length(spot) <= 150),
  -- ค่าตั้งเฉพาะชนิด — โครงสร้างขึ้นกับ kind จึงตรวจที่ API ไม่ใช่ CHECK
  ADD COLUMN IF NOT EXISTS settings  jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_assets_settings_object') THEN
    ALTER TABLE public.service_assets
      ADD CONSTRAINT service_assets_settings_object CHECK (jsonb_typeof(settings) = 'object');
  END IF;
END $$;

-- เครื่องของโซนหนึ่ง — หน้าโซน + consumption rollup อ่านทางนี้
CREATE INDEX IF NOT EXISTS service_assets_zone_idx
  ON public.service_assets ("zoneId") WHERE "zoneId" IS NOT NULL;

COMMENT ON COLUMN public.service_assets.kind IS
  'ชนิดอุปกรณ์ (diffuser|reed|soap|alcohol|…) — ทะเบียนจริงอยู่ lib/service/assetKinds.js ไม่ใช่ CHECK (มติ 2026-08-02 ข้อ 12)';
COMMENT ON COLUMN public.service_assets.qty IS
  'จำนวนจุดของชนิดที่ไม่มี serial รายตัว (reed/soap/alcohol = แถวเดียวต่อชุด) · diffuser = NULL (แถวละเครื่อง)';

COMMIT;

NOTIFY pgrst, 'reload schema';
