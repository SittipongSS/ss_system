-- ============================================================
--  Migration 0182: แก้ index `material_prices_formula_idx` ให้ชี้ formulaId จริง
--
--  🐞 บั๊กของ mig 0181 เอง: ใบนั้นเขียน
--        CREATE INDEX IF NOT EXISTS material_prices_formula_idx ON ... ("formulaId")
--     แต่ mig 0157 สร้าง index **ชื่อเดียวกัน** บน "formulaCode" ไว้ก่อนแล้ว
--
--  ⚠️⚠️ **`IF NOT EXISTS` ของ Postgres เทียบที่ "ชื่อ" ไม่ใช่ "นิยาม"** →
--     คำสั่งใน 0181 จึงถูกข้ามไปเงียบ ๆ ไม่มี error ไม่มี warning และ index ยังชี้
--     คอลัมน์เก่าอยู่ · ตรวจเจอตอนผู้ใช้รัน `SELECT indexdef FROM pg_indexes` ยืนยันผล
--
--  ผลกระทบจำกัด: ตัวคุม "ตัวตนวัสดุ" คือ material_prices_identity_uk ซึ่ง 0181
--  DROP ก่อนสร้างใหม่ จึงถูกต้องแล้ว · ใบนี้แก้เฉพาะ index ตัวช่วยค้นที่ชี้ผิด
--  คอลัมน์ (query ที่กรองด้วย formulaId ไม่มี index + ชื่อ index สื่อผิด)
--
--  📌 บทเรียนที่ใช้ได้ทุกใบต่อจากนี้: **จะเปลี่ยนนิยาม index ต้อง DROP ก่อนเสมอ**
--     `CREATE ... IF NOT EXISTS` ใช้ได้เฉพาะตอนสร้างของใหม่ที่ชื่อยังไม่เคยมี
--
--  ⚠ รันมือบน Supabase SQL Editor · รันได้ทันที (เป็น index ตัวช่วย ไม่ใช่ unique
--    ไม่มีโค้ดไหนพึ่งพามันเชิงความถูกต้อง)
-- ============================================================

BEGIN;

-- DROP ก่อนเสมอ — ไม่พึ่ง IF NOT EXISTS อีกแล้ว (ดูเหตุผลข้างบน)
DROP INDEX IF EXISTS public.material_prices_formula_idx;

-- ค้นวัสดุของสูตรหนึ่ง ๆ (หน้าทะเบียนสูตรจะโชว์ราคาที่ผูกอยู่ได้)
CREATE INDEX material_prices_formula_idx
  ON public.material_prices ("formulaId") WHERE "formulaId" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
