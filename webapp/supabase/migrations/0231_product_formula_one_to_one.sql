-- ============================================================
--  Migration 0231: 1 สูตร : 1 FG + กลิ่นบนสินค้า derive จากสูตร
--  docs/rm-price-registry-split.md §งานต่อ (มติผู้ใช้ 2026-08-10)
--
--  โมเดล Product Spec: FG → สูตร → กลิ่น (1 กลิ่น : N สูตร · 1 สูตร : 1 FG)
--
--  ⭐ สภาพ prod ก่อนเขียน (ตรวจ 2026-08-10): products.formulaId = NULL ทั้ง 138
--  แถว — สูตร auto จาก backfill 0171 (2 สูตร × 2 FG ที่เคยขัด 1:1) ถูก RD ลบไป
--  แล้วตอนลงสูตรจริงรหัส PF ⇒ ใส่ unique ได้โดยไม่มีข้อมูลขัด · backfill ข้อ 2
--  จึงเป็น no-op วันนี้ แต่กันเครื่องที่ mig ไล่รันช้ากว่าโค้ด
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)
--  ⚠ รันก่อน deploy โค้ดที่กรองตัวเลือกสูตรตาม 1:1
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0) ถ้ามีสูตรที่ถูกหลาย FG ถืออยู่ ให้ฟ้องเป็นรายการอ่านออก ไม่ใช่ error ดิบ
--    ของ CREATE UNIQUE INDEX (แพตเทิร์นเดียวกับด่านซ้ำใน 0157)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('%s → %s FG', "formulaId", n), E'\n')
    INTO dup
    FROM (
      SELECT "formulaId", count(*) AS n
        FROM public.products
       WHERE "formulaId" IS NOT NULL
       GROUP BY "formulaId"
      HAVING count(*) > 1
    ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION E'มีสูตรที่ผูกหลาย FG — ให้ RD แยกสูตร/ย้าย FG ก่อนรัน 0231:\n%', dup;
  END IF;
END $$;

-- 1 สูตร : 1 FG (partial — สินค้าที่ไม่มีสูตร เช่นกล่อง/บรรจุภัณฑ์ ไม่นับ)
CREATE UNIQUE INDEX IF NOT EXISTS products_formula_uk
  ON public.products ("formulaId") WHERE "formulaId" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) กลิ่นบนสินค้า = กลิ่นของสูตรเสมอ (FG → สูตร → กลิ่น)
--    เติมให้แถวที่มีสูตรแต่ scentId ยังว่าง — ไม่ทับแถวที่ RD จัดระเบียบเป็น
--    "กลิ่น" ไว้ (พวกนั้น formulaId เป็น NULL อยู่แล้ว ไม่เข้าเงื่อนไข)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.products p
   SET "scentId" = f."scentId"
  FROM public.formulas f
 WHERE p."formulaId" = f.id
   AND f."scentId" IS NOT NULL
   AND p."scentId" IS DISTINCT FROM f."scentId";

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT "formulaId", count(*) FROM products WHERE "formulaId" IS NOT NULL
--  GROUP BY 1 HAVING count(*) > 1;                                  -- ต้องว่าง
-- SELECT count(*) FROM products p JOIN formulas f ON f.id = p."formulaId"
--  WHERE f."scentId" IS NOT NULL AND p."scentId" IS DISTINCT FROM f."scentId";  -- ต้อง 0
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.products_formula_uk;
-- (ข้อ 2 ไม่ต้องย้อน — ค่า scentId ตรงกับสูตรคือสภาพที่ถูกอยู่แล้ว)
