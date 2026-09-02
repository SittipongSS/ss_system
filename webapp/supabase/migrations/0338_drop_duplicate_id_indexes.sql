-- ถอนดัชนีซ้ำบน customers/products — ตามเก็บของที่ 0336 ทำไม่สำเร็จ
-- ============================================================================
--
-- 🐞 **0336 เขียนผิดชนิดของอ็อบเจกต์** — ใช้
--       ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_id_key;
--    แต่ `customers_id_key` / `products_id_key` **ไม่ใช่ constraint** มันเป็น
--    unique index เปล่า ๆ (`pg_constraint.conindid` ไม่มีแถวชี้มาที่ index นี้เลย)
--    ⇒ `DROP CONSTRAINT IF EXISTS` ไม่เจอชื่อนั้นในตาราง constraint จึง **ผ่านไปเงียบ ๆ
--    โดยไม่ทำอะไรและไม่มี error** · migration รายงานว่าสำเร็จทั้งไฟล์ แต่ดัชนียังอยู่ครบ
--
-- 🪤 บทเรียน: `IF EXISTS` กับ "ผิดชนิด" ให้ผลเหมือนกันหมด — ทั้งคู่คือเงียบ
--    ตรวจผลจริงหลังรันเสมอ อย่าเชื่อว่า migration เขียวแปลว่าของหายไปแล้ว
--    (ตรวจ: `select count(*) from pg_class where relname in
--     ('customers_id_key','products_id_key');` ต้องได้ 0)
--
-- ทั้งสองตัวเป็น UNIQUE บน `(id)` ซ้ำกับ primary key ของตารางเดียวกันเป๊ะ ⇒ เปลืองพื้นที่
-- และทำให้ทุก INSERT/UPDATE ต้องอัปเดตดัชนีสองชุดโดยไม่ได้อะไรกลับมา
-- ตรวจแล้วว่าไม่มี foreign key ตัวไหนผูกกับดัชนีคู่นี้ จึงถอนได้โดยไม่ต้อง CASCADE

BEGIN;

DROP INDEX IF EXISTS public.customers_id_key;
DROP INDEX IF EXISTS public.products_id_key;

COMMIT;
