-- ============================================================
--  Migration 0403: ชุดของขวัญ (01-037) ผูกได้หลายสูตร — สูตรละหนึ่งหมวด
--  มติผู้ใช้ 2026-10-05
--
--  เดิม FG หนึ่งตัวผูกได้สูตรเดียวผ่าน `products."formulaId"` (0171) — ชุดของขวัญ
--  มีของหลายชิ้นในกล่องเดียว (น้ำหอม + ก้านหอม + โลชั่น …) แต่ละชิ้นเป็นสูตรของตัวเอง
--  ⇒ เฉพาะหมวด 01-037 เก็บสูตรเป็นรายการในตารางนี้ แถวละ (หมวด, สูตร)
--
--  ⭐ กติกาที่แอปบังคับ (lib/master/giftSetFormulas.js — จอกับ API ใช้ตัวเดียวกัน)
--    · มีรายการได้เฉพาะ FG หมวด 01-037 · FG หมวดอื่นยังใช้ `products."formulaId"` เดิม
--      (FG ชุดของขวัญมี `formulaId` = NULL เสมอ — ไม่มี "สูตรหลัก")
--    · หมวดของแถว = หมวดในกลุ่ม 01 ยกเว้น 01-037 เอง
--    · สูตรที่มีหมวดในทะเบียนต้องตรงกับหมวดของแถว · สูตรที่ยังไม่ระบุหมวดใช้ได้ทุกหมวด
--    · สูตรเดียวกันซ้ำในชุดเดียวไม่ได้ (unique ข้างล่างเป็นตาข่ายท้ายสุด)
--
--  FK สองขา:
--    · productId → CASCADE — รายการเป็นส่วนหนึ่งของตัวสินค้า ลบสินค้า = ลบรายการ
--      (entityReferences ประกาศไว้ใน `ignored` ไม่ใช่ตัวบล็อกการลบ)
--    · formulaId → CASCADE — เทียบเท่า `products."formulaId"` ที่เป็น SET NULL (0232:
--      สินค้ามีตัวตนของตัวเอง สูตรหายแล้วสินค้ายังอยู่) · ด่านก่อนลบสูตรนับแถวนี้ด้วย
--      (countProductsUsingFormula · formulaForcePreview)
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ⚠ รันก่อน deploy โค้ด — จอ/API อ่านตารางนี้ทุกครั้งที่เปิดสินค้าหมวด 01-037
--  ⭐ สภาพ prod ตอนเขียน (2026-10-05): FG หมวด 01-037 มี 9 ตัว ไม่มีตัวไหนผูกสูตรเลย
--     ⇒ ไม่มีอะไรต้องย้าย
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_formulas (
  id             text PRIMARY KEY,
  "productId"    text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  "formulaId"    text NOT NULL REFERENCES public.formulas(id) ON DELETE CASCADE,
  -- หมวดของชิ้นนี้ในชุด (BB-CCC) — ข้อความแบบเดียวกับ products."categoryCode"
  "categoryCode" text NOT NULL,
  "sortOrder"    integer NOT NULL DEFAULT 0,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_formulas_formula_uk UNIQUE ("productId", "formulaId")
);

-- ทะเบียนสูตรถามกลับ "FG ไหนใช้สูตรนี้" (attachFormulaUsage · ด่านก่อนลบ)
CREATE INDEX IF NOT EXISTS product_formulas_formula_idx
  ON public.product_formulas ("formulaId");

-- ── ทับทั้งชุดในทรานแซกชันเดียว ─────────────────────────────────────────────
-- 🐞 ทำไมไม่ลบ/เขียนจากแอปสองคำขอ (เหตุผลเดียวกับ replace_product_spec_items 0370):
--    ขั้นเขียนล้มหลังขั้นลบ = ชุดของขวัญเสียสูตรทั้งชุดเงียบ ๆ · สองคนกดบันทึกพร้อมกัน
--    = แถวซ้อนสองชุด
-- ⚠️ คีย์ของแต่ละแถวต้องตรงกับคอลัมน์ใน jsonb_to_recordset — คีย์ที่ไม่ได้ประกาศถูกทิ้งเงียบ
CREATE OR REPLACE FUNCTION public.replace_product_formulas(
  p_product_id text,
  p_rows       jsonb     -- [{id, formulaId, categoryCode, sortOrder}]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'product_formulas_rows_invalid';
  END IF;

  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found: %', p_product_id; END IF;

  DELETE FROM public.product_formulas WHERE "productId" = p_product_id;

  INSERT INTO public.product_formulas (id, "productId", "formulaId", "categoryCode", "sortOrder")
  SELECT r.id, p_product_id, r."formulaId", r."categoryCode", COALESCE(r."sortOrder", 0)
    FROM jsonb_to_recordset(p_rows) AS r(
      id             text,
      "formulaId"    text,
      "categoryCode" text,
      "sortOrder"    integer
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_formulas(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_formulas(text, jsonb)
  TO service_role;

ALTER TABLE public.product_formulas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_formulas FROM anon, authenticated;
GRANT ALL ON TABLE public.product_formulas TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.product_formulas;                      -- 0
-- SELECT has_function_privilege('anon', 'public.replace_product_formulas(text, jsonb)', 'EXECUTE');  -- false
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.replace_product_formulas(text, jsonb);
-- DROP TABLE IF EXISTS public.product_formulas;
