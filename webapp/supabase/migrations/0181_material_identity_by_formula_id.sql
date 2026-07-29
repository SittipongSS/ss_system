-- ============================================================
--  Migration 0181: ตัวตนของวัสดุ RM ยึด formulaId แทน formulaCode (text)
--  แผน docs/cross-department-requests-plan.md — PR-5
--
--  ⭐ ที่มา: mig 0157 ตั้งตัวตนวัสดุเป็น (kind, label, formulaCode, customerId)
--  ตอนนั้นยังไม่มีทะเบียนสูตร รหัสสูตรจึงเป็น **ข้อความที่คนพิมพ์เอง** → เข้าข่าย
--  บั๊กตระกูล "จับคู่ด้วยข้อความ" ที่ระบบนี้เจอซ้ำ ๆ (พิมพ์ต่างช่องว่าง/ตัวพิมพ์
--  = กลายเป็นวัสดุคนละตัวเงียบ ๆ) · mig 0171 สร้างทะเบียนสูตรแล้ว และ 0171 เขียน
--  ไว้เองว่า "ไม่แตะ material_prices_identity_uk ในรอบนี้" — ใบนี้คือรอบนั้น
--
--  ⚠ ปลอดภัยเพราะ prod มี material_prices 1 แถว และ formulaCode/formulaId เป็น
--    NULL ทั้งคู่ (ตรวจ 2026-07-29) → ไม่มีแถวไหนเปลี่ยนตัวตน ไม่มีทางชน unique
--
--  ⚠ คอลัมน์ formulaCode/formulaName **ยังไม่ลบ** — ใบขอราคาผลิตที่ออกไปแล้ว
--    snapshot ค่าพวกนี้ไว้ การลบตอนนี้จะทำให้เอกสารเก่าอ่านไม่ได้ (กฎ: snapshot
--    บนเอกสารที่ออกแล้วห้ามแตะ) · เลิกใช้ = เลิก "เขียน" ก่อน ค่อยลบทีหลัง
--
--  ⚠ รันมือบน Supabase SQL Editor · **รันหลัง deploy** เพราะโค้ดเก่าที่ยังใช้
--    formulaCode เป็นตัวตนจะ insert ชนกับ index ใหม่ไม่ได้ (แต่ prod ไม่มีแถว
--    RM สักตัว ความเสี่ยงจริงเกือบศูนย์)
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.material_prices_identity_uk;

-- ตัวตนใหม่: ชนิด + ชื่อ + **สูตรในทะเบียน** + ลูกค้า
-- ต้องตรงกับ materialIdentityKey() ใน src/lib/materialPrices.js เป๊ะ ๆ ไม่งั้น
-- ฝั่งแอปจะคิดว่าเป็นคนละตัวแล้วยิง insert ไปชน constraint (ผู้ใช้เห็น error ดิบ)
CREATE UNIQUE INDEX IF NOT EXISTS material_prices_identity_uk ON public.material_prices
  (kind, lower(btrim(label)), COALESCE("formulaId", ''), COALESCE("customerId", ''));

-- ค้นวัสดุของสูตรหนึ่ง ๆ (หน้าทะเบียนสูตรจะโชว์ราคาที่ผูกอยู่ได้)
CREATE INDEX IF NOT EXISTS material_prices_formula_idx
  ON public.material_prices ("formulaId") WHERE "formulaId" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
