-- ============================================================
--  Migration 0179: รวมชื่อ unique index ของทะเบียนสรรพสามิตให้เหลือชื่อเดียว
--
--  0178 ประกาศ index ชื่อ `excise_reg_product_customer_uidx` แต่ของจริงบน prod ถูก
--  สร้างด้วยชื่อ `excise_reg_prod_cust_uniq` (ยืนยัน 2026-07-29 จาก error ตอนทดสอบ
--  insert ซ้ำ: `duplicate key value violates unique constraint "excise_reg_prod_cust_uniq"`)
--  — กติกาทำงานถูกแล้ว แต่ชื่อในไฟล์กับใน DB คนละตัว
--
--  ทำไมต้องเก็บ: ชื่อไม่ตรง = `CREATE UNIQUE INDEX IF NOT EXISTS` ของ 0178 มองไม่เห็น
--  ตัวที่มีอยู่ ถ้ามีใครรัน 0178 ซ้ำ (หรือ bootstrap ฐานใหม่จากไฟล์ทั้งชุด) จะได้ unique
--  index **ตัวที่สองบนคู่คอลัมน์เดียวกัน** — ไม่พังทันที แต่กินพื้นที่/เวลาเขียนสองเท่า
--  และเวลาเจอ error จะไม่รู้ว่า constraint ตัวไหนพูด
--
--  ⚠️ อ่านรายชื่อ index จาก prod ตรง ๆ ไม่ได้ (PostgREST ไม่ expose pg_indexes และ
--  ไม่มี RPC รัน SQL) ไฟล์นี้จึงเขียนให้ถูกต้องครบทุกสถานะโดยไม่ต้องรู้ล่วงหน้า:
--     มีแต่ชื่อเก่า        → rename เป็นชื่อกลาง
--     มีทั้งสองชื่อ        → ทิ้งตัวเก่า (ซ้ำซ้อน คุมคู่คอลัมน์เดียวกัน)
--     มีแต่ชื่อกลางแล้ว    → ไม่ทำอะไร
--     ไม่มีสักตัว          → สร้างใหม่ (บรรทัดท้ายไฟล์)
--
--  Idempotent — รันซ้ำได้ · ไม่มี UPDATE/DELETE ข้อมูล · กติกา unique ไม่เคยขาดช่วง
--  (rename ไม่ปลด constraint · ส่วนกรณี "มีทั้งคู่" ตัวที่เหลือคุมต่อทันที)
-- ============================================================

DO $$
DECLARE
  v_canonical boolean;
  v_legacy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'i'
      AND c.relname = 'excise_reg_product_customer_uidx'
  ) INTO v_canonical;

  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'i'
      AND c.relname = 'excise_reg_prod_cust_uniq'
  ) INTO v_legacy;

  IF v_legacy AND NOT v_canonical THEN
    ALTER INDEX public.excise_reg_prod_cust_uniq
      RENAME TO excise_reg_product_customer_uidx;
    RAISE NOTICE '0179: renamed excise_reg_prod_cust_uniq → excise_reg_product_customer_uidx';
  ELSIF v_legacy AND v_canonical THEN
    DROP INDEX public.excise_reg_prod_cust_uniq;
    RAISE NOTICE '0179: dropped duplicate excise_reg_prod_cust_uniq (canonical index already exists)';
  END IF;
END $$;

-- ตาข่ายชั้นสุดท้าย: ฐานที่ยังไม่เคยมี index เลย (เช่น bootstrap ใหม่) ต้องได้ตัวกลาง
CREATE UNIQUE INDEX IF NOT EXISTS excise_reg_product_customer_uidx
  ON public.excise_registrations ("productId", "customerId");

-- Rollback:
--   ALTER INDEX public.excise_reg_product_customer_uidx
--     RENAME TO excise_reg_prod_cust_uniq;
--   (แค่ชื่อ — กติกา unique เหมือนเดิมทุกประการ ไม่มีข้อมูลถูกแตะ)

NOTIFY pgrst, 'reload schema';
