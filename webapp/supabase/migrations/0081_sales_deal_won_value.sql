-- 0081 — Sales deal actual won value.
-- โมเดลใหม่ (แผน merge เฟส 3): แยก "มูลค่าคาดการณ์" ออกจาก "มูลค่าปิดจริง"
--   projectValue = มูลค่าคาดการณ์ (forecast) — freeze หลังปิด Won
--   wonValue     = มูลค่าปิดจริง (actual) — บังคับกรอกตอนปิด Won
-- FC คงเหลือนับเฉพาะดีล open; ดีลที่ Won ออกจาก FC และใช้ wonValue เป็นยอดจริง.
-- ส่วนต่าง (projectValue − wonValue) = variance โชว์เป็นรายงาน ไม่ค้างเป็น FC.

ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "wonValue" numeric;

-- Backfill: ดีลที่ปิด Won อยู่แล้วก่อนมีคอลัมน์นี้ → ใช้ projectValue เดิมเป็นยอดจริง
-- (ก่อนหน้านี้ระบบเอา projectValue ไปนับเป็นยอด Won อยู่แล้ว ค่าจึงตรงกัน).
UPDATE public.sales_deals
  SET "wonValue" = "projectValue"
  WHERE stage IN ('won', 'in_project') AND "wonValue" IS NULL;

NOTIFY pgrst, 'reload schema';
