-- ============================================================
--  Migration 0430: ชุดของขวัญ (01-037) ที่มีน้ำหอม เข้าระบบสรรพสามิต — ราคารายชิ้น + ฐานภาษีของชุดคละ
--
--  ⭐ มติเจ้าของ 11/11/2026 (ถามทีละข้อ · แผนรื้อสรรพสามิต หมวด 14 · G1–G4):
--     · ชุดของขวัญเสียภาษีไหม = ดูจากสูตรที่ผูกกับชุด (แถวหมวดที่ติ๊ก isExcise) — ไม่ใช่หมวด 01-037
--     · ชุดน้ำหอมล้วน = คิดภาษีจากราคาขายปลีกทั้งชุด (ช่องเดิมของสินค้า — ไม่ต้องมีคอลัมน์ใหม่)
--     · ชุดคละประเภท = คิดแยกเฉพาะส่วนน้ำหอม: แถวสูตรหมวดเสียภาษีกรอกราคาขายปลีกต่อชิ้น + จำนวนชิ้นของตัวเอง
--       ⇒ ฐานภาษี = Σ (ราคาต่อชิ้น × จำนวนชิ้น) ของแถวเสียภาษี (แอปคิด · lib/excise/giftSetExcise.js)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--   1) product_formulas + "retailPriceIncVat" (ราคาขายปลีกต่อชิ้น รวม VAT · ว่างได้ = ยังไม่กรอก)
--                       + "pieceQty"          (จำนวนชิ้นของสูตรนี้ในชุด · ≥ 1 · ตั้งต้น 1)
--   2) products + "exciseTaxBase"         ('pieces' = ชุดคละ คิดจากราคารายชิ้น · ว่าง = คิดจาก "retailPriceIncVat" เหมือนเดิม)
--               + "exciseBasePriceIncVat" (ฐานภาษีรวม VAT ของชุดคละ · ว่าง = ราคารายชิ้นยังไม่ครบ ⇒ ภาษี 0 + ด่านเดิมเตือน)
--      ⚠️ แอปเขียนสองคอลัมน์นี้ตอนบันทึกสินค้าเท่านั้น (POST/PATCH /api/products) — เขียนมือ = อัตรา exciseTax ไม่ตาม
--   3) replace_product_formulas รับคีย์ "retailPriceIncVat" + "pieceQty" เพิ่ม (คีย์ที่ไม่ได้ประกาศใน
--      jsonb_to_recordset ถูกทิ้งเงียบ — ห้ามลืมฝั่งนี้) · ตัวฟังก์ชันยกจาก 0403 ซึ่งยังไม่เคยถูกปะบนฐาน
--
--  ── ผลต่อข้อมูลเดิม ──────────────────────────────────────────────────────
--   ไม่มี — แถวสูตรเดิม (1 ชุด · 2 แถว ณ 11/11) ได้ราคาว่าง + 1 ชิ้น · สินค้าทุกตัวได้ "exciseTaxBase" ว่าง
--   = คิดภาษีแบบเดิมทุกตัว · ชุดของขวัญจะเปลี่ยนก็ต่อเมื่อมีคนบันทึกสินค้าด้วยโค้ดรุ่นนี้
--
--  ── ลำดับรันกับ deploy ────────────────────────────────────────────────────
--   **รันไฟล์นี้ก่อน merge** — โค้ดใหม่อ่าน/เขียนคอลัมน์ใหม่ทุกครั้งที่เปิด/บันทึกสินค้าหมวด 01-037
--   · โค้ดเก่าที่บันทึกชุดของขวัญหลังรันไฟล์นี้ ส่งแถวไม่มีราคา ⇒ ราคารายชิ้นที่เคยกรอกหาย (ไม่มีชุดไหนกรอกก่อน deploy)
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ✅ รันบนฐานจริงแล้ว 11/11/2026 (อ่านคอลัมน์ใหม่ได้ · แถวสูตรเดิม 2 แถวได้ราคาว่าง + 1 ชิ้น) — รันซ้ำได้ ไม่มีผล
-- ============================================================

BEGIN;

ALTER TABLE public.product_formulas
  ADD COLUMN IF NOT EXISTS "retailPriceIncVat" numeric,
  ADD COLUMN IF NOT EXISTS "pieceQty" integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_formulas_retail_price_ck') THEN
    ALTER TABLE public.product_formulas
      ADD CONSTRAINT product_formulas_retail_price_ck CHECK ("retailPriceIncVat" IS NULL OR "retailPriceIncVat" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_formulas_piece_qty_ck') THEN
    ALTER TABLE public.product_formulas
      ADD CONSTRAINT product_formulas_piece_qty_ck CHECK ("pieceQty" >= 1);
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "exciseTaxBase" text,
  ADD COLUMN IF NOT EXISTS "exciseBasePriceIncVat" numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_excise_tax_base_ck') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_excise_tax_base_ck CHECK ("exciseTaxBase" IS NULL OR "exciseTaxBase" = 'pieces');
  END IF;
END $$;

-- ── ทับทั้งชุดในทรานแซกชันเดียว (ตัวเดียวกับ 0403 + สองคีย์ใหม่) ───────────────────
CREATE OR REPLACE FUNCTION public.replace_product_formulas(
  p_product_id text,
  p_rows       jsonb     -- [{id, formulaId, categoryCode, sortOrder, retailPriceIncVat, pieceQty}]
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

  INSERT INTO public.product_formulas (id, "productId", "formulaId", "categoryCode", "sortOrder", "retailPriceIncVat", "pieceQty")
  SELECT r.id, p_product_id, r."formulaId", r."categoryCode", COALESCE(r."sortOrder", 0),
         r."retailPriceIncVat", COALESCE(r."pieceQty", 1)
    FROM jsonb_to_recordset(p_rows) AS r(
      id                  text,
      "formulaId"         text,
      "categoryCode"      text,
      "sortOrder"         integer,
      "retailPriceIncVat" numeric,
      "pieceQty"          integer
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_formulas(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_formulas(text, jsonb)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_formulas'
--      AND column_name IN ('retailPriceIncVat', 'pieceQty')) AS formula_cols_2,
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products'
--      AND column_name IN ('exciseTaxBase', 'exciseBasePriceIncVat')) AS product_cols_2,
--   (SELECT position('pieceQty' in prosrc) > 0 FROM pg_proc WHERE proname = 'replace_product_formulas') AS rpc_has_piece_qty,
--   has_function_privilege('anon', 'public.replace_product_formulas(text, jsonb)', 'EXECUTE') AS anon_exec_false;
--
-- ── ทางกลับ ─────────────────────────────────────────────────────────────
-- (รันฟังก์ชันของ 0403 กลับก่อน แล้วค่อยลบคอลัมน์)
-- ALTER TABLE public.product_formulas DROP COLUMN IF EXISTS "retailPriceIncVat", DROP COLUMN IF EXISTS "pieceQty";
-- ALTER TABLE public.products DROP COLUMN IF EXISTS "exciseTaxBase", DROP COLUMN IF EXISTS "exciseBasePriceIncVat";
