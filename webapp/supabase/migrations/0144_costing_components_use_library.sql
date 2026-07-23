-- 0144 - ระบบขอราคาผลิต ฉบับ 3 (PR-B): ใบขอราคาผลิตดึงราคาจากคลังวัสดุ
--
-- เปลี่ยนที่มาของราคาวัสดุในใบขอราคาผลิต: เดิม RD/PC ตอบราคาในใบ (/quote)
-- ตอนนี้เซลดึงราคาจากคลัง (mig 0143) เอง — ราคาวัสดุเป็น "ขั้นก่อน" ที่รวบรวมไว้
-- ในคลังแล้ว (มติ 2026-07-23 "มันคนละส่วนกัน")
--
-- ช่อง pricePerKg/pricePerUnit เดิมยังเป็น snapshot ของราคาที่ใช้จริงในใบนี้
-- (ราคาในคลังเปลี่ยนทีหลังไม่กระทบใบที่ดึงไปแล้ว) — เพิ่มแค่ตัวชี้ว่ามาจากรุ่นไหน
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

ALTER TABLE public.costing_item_components
  -- อ้างคลัง (soft ref — ข้ามโมดูล ไม่บังคับ FK): ราคาบรรทัดนี้มาจากรุ่นไหน
  ADD COLUMN IF NOT EXISTS "materialId"         text,
  ADD COLUMN IF NOT EXISTS "materialRevisionId" text,
  -- ที่มาของราคา: library = ดึงจากคลังตรง, confirmed = ขอ RD/PC ยืนยันแล้ว (rev ใหม่),
  -- manual = เซลกรอกเอง (คลังไม่มี — บันทึกไว้แต่ไม่ผูกคลัง)
  ADD COLUMN IF NOT EXISTS "priceSource"    text
    CHECK ("priceSource" IS NULL OR "priceSource" IN ('library', 'confirmed', 'manual')),
  -- ปุ่ม "ขอยืนยันราคา" รายบรรทัด (เมื่อราคาคลังเกินอายุ):
  --   null = ไม่ได้ขอ, pending = รอ RD/PC ยืนยัน, confirmed = ยืนยันแล้ว
  ADD COLUMN IF NOT EXISTS "confirmStatus"  text
    CHECK ("confirmStatus" IS NULL OR "confirmStatus" IN ('pending', 'confirmed')),
  ADD COLUMN IF NOT EXISTS "confirmRequestedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "confirmRequestedById" text;

-- Rollback guidance:
-- 1) ถอนได้ด้วย ALTER TABLE ... DROP COLUMN ทั้ง 6 — ราคา snapshot บนบรรทัด
--    (pricePerKg/pricePerUnit) ไม่ถูกแตะ ใบเก่ายังคำนวณต้นทุนได้เหมือนเดิม
-- 2) ตัวชี้คลัง (materialRevisionId) หายก็แค่ตามรอยกลับคลังไม่ได้ ราคายังอยู่ครบ

NOTIFY pgrst, 'reload schema';
