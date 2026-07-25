-- ============================================================
--  Migration 0157: ทะเบียนวัสดุ (material registry) + ราคาชั้นจำนวน
--  แผนฉบับ 5 ข้อ 3 — docs/costing-request-plan.md (PR #726)
--
--  1) material_prices เลื่อนขั้นจาก "คลังราคา" เป็น **ข้อมูลหลัก (master)**:
--     มีสถานะ (ร่างที่เซลเสนอ → ใช้งาน → เก็บเข้ากรุ), มีตัวตนที่ไม่ซ้ำ
--     (ปิดบั๊ก "ตอบใบขอราคาทุกครั้ง = สร้างวัสดุตัวใหม่ ไม่เคยเป็น rev.2")
--  2) ราคาย้ายจาก material_price_revisions ไปอยู่ **ชั้นจำนวน** ที่เดียว
--     (ขอราคาต่อชิ้นที่ 1000/3000/5000 = คนละราคา — มติ 2026-07-26)
--  3) RPC ออก rev + ชั้นราคาใน transaction เดียว (rev เป็น immutable ลบไม่ได้
--     ถ้าเขียน rev สำเร็จแล้วชั้นราคาพัง จะได้ rev ไม่มีราคาค้างถาวรและกู้ไม่ได้)
--  4) product_type_cost_lines รู้ประเภทบรรจุภัณฑ์ของบรรทัด (ขวด/ฝา/กล่อง…)
--     เพื่อให้ตัวเลือกวัสดุบนใบขอราคาผลิตกรองได้จริง — kind='PM' ก้อนเดียวกรองไม่พอ
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)
--  ⚠ ต้องรัน **ก่อน** deploy โค้ด PR-1
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) material_prices → ทะเบียนวัสดุ
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.material_prices
  -- draft = เซลเสนอเข้ามา รอ RD/PC รับ (ยังไม่มีราคา ใช้ในใบขอราคาผลิตไม่ได้)
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  -- ตัวตนของ RM คือ "สูตร" ไม่ใช่ชื่อ — F ของสูตร A คนละตัวกับ F ของสูตร B
  -- แต่ชื่อพิมพ์เหมือนกันได้ ถ้าไม่แยกตรงนี้ราคาสองสูตรจะทับกันเงียบ ๆ
  ADD COLUMN IF NOT EXISTS "formulaCode"    text,
  ADD COLUMN IF NOT EXISTS "formulaName"    text,
  -- ประเภทบรรจุภัณฑ์ (PM เท่านั้น) — ลิสต์เป็นค่าคงที่ในโค้ด lib/master/materialTypes.js
  -- ไม่ผูก CHECK ไว้ที่นี่ เพราะลิสต์ปรับได้โดยไม่ต้อง migration (แพตเทิร์นเดียวกับ
  -- หน่วยสินค้า lib/master/units.js) — ค่าที่ไม่รู้จักจะตกเป็น "อื่น ๆ" ตอนแสดงผล
  ADD COLUMN IF NOT EXISTS "pmType"         text,
  ADD COLUMN IF NOT EXISTS "acceptedById"   text,
  ADD COLUMN IF NOT EXISTS "acceptedByName" text,
  ADD COLUMN IF NOT EXISTS "acceptedAt"     timestamptz;

-- isHidden ยุบเข้า status (ซ่อน = เก็บเข้ากรุ)
UPDATE public.material_prices SET status = 'archived' WHERE "isHidden" = true;
DROP INDEX IF EXISTS public.material_prices_kind_idx;      -- index เดิมอ้าง isHidden
ALTER TABLE public.material_prices DROP COLUMN IF EXISTS "isHidden";
CREATE INDEX IF NOT EXISTS material_prices_kind_idx ON public.material_prices (kind, status);
CREATE INDEX IF NOT EXISTS material_prices_formula_idx ON public.material_prices ("formulaCode")
  WHERE "formulaCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS material_prices_pm_type_idx ON public.material_prices ("pmType")
  WHERE "pmType" IS NOT NULL;

-- ตัวตนของวัสดุ 1 ตัว = ชนิด + ชื่อ (ตัดช่องว่าง/ไม่สนตัวพิมพ์) + สูตร + ลูกค้า
-- ⚠ ถ้ามีข้อมูลทดลองซ้ำอยู่ (ผลจากบั๊กเดิม) index จะสร้างไม่ผ่าน — บอกให้ชัดว่าซ้ำที่ไหน
--   แทนที่จะปล่อย error ดิบของ Postgres แล้วต้องมานั่งไล่เอง
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('%s / %s / %s (%s แถว)', kind, l, COALESCE(NULLIF(c, ''), 'ราคากลาง'), n), E'\n')
    INTO dup
    FROM (
      SELECT kind,
             lower(btrim(label)) AS l,
             COALESCE("formulaCode", '') AS f,
             COALESCE("customerId", '')  AS c,
             count(*) AS n
        FROM public.material_prices
       GROUP BY 1, 2, 3, 4
      HAVING count(*) > 1
    ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION E'มีวัสดุซ้ำในทะเบียน ต้องรวม/ลบให้เหลือตัวเดียวก่อนรัน 0157:\n%', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS material_prices_identity_uk ON public.material_prices
  (kind, lower(btrim(label)), COALESCE("formulaCode", ''), COALESCE("customerId", ''));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) ราคาเป็นชั้นจำนวน — ย้ายราคาไปอยู่ที่ tier ที่เดียว (one source of truth)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_revision_tiers (
  id             text PRIMARY KEY,
  "revisionId"   text NOT NULL REFERENCES public.material_price_revisions(id) ON DELETE CASCADE,
  -- null = ราคาเดียวไม่แบ่งชั้น (เคส RM ต่อ กก.) · มีค่า = ราคาที่ปริมาณสั่งนี้ขึ้นไป
  qty            numeric CHECK (qty IS NULL OR qty > 0),
  "pricePerKg"   numeric CHECK ("pricePerKg"   IS NULL OR "pricePerKg"   >= 0),
  "pricePerUnit" numeric CHECK ("pricePerUnit" IS NULL OR "pricePerUnit" >= 0),
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  -- ต้องมีราคาจริงเสมอ และลงช่องเดียว (หน่วยจริงยึด revisions."unitBasis")
  CONSTRAINT material_price_revision_tiers_one_price CHECK (
    ("pricePerKg" IS NOT NULL AND "pricePerUnit" IS NULL)
    OR ("pricePerKg" IS NULL AND "pricePerUnit" IS NOT NULL)
  )
);
-- 0 เป็น sentinel ปลอดภัยเพราะ CHECK ห้าม qty = 0
CREATE UNIQUE INDEX IF NOT EXISTS material_price_revision_tiers_uk
  ON public.material_price_revision_tiers ("revisionId", COALESCE(qty, 0));

-- ย้ายราคาที่มีอยู่ไปเป็นชั้น "ไม่แบ่งชั้น" แล้วถอดคอลัมน์เดิมทิ้ง
INSERT INTO public.material_price_revision_tiers (id, "revisionId", qty, "pricePerKg", "pricePerUnit")
SELECT 'MRT-' || id, id, NULL, "pricePerKg", "pricePerUnit"
  FROM public.material_price_revisions
 WHERE COALESCE("pricePerKg", "pricePerUnit") IS NOT NULL
 ON CONFLICT DO NOTHING;

ALTER TABLE public.material_price_revisions
  DROP CONSTRAINT IF EXISTS material_price_revisions_price_matches_basis,
  DROP COLUMN IF EXISTS "pricePerKg",
  DROP COLUMN IF EXISTS "pricePerUnit",
  -- ที่มาของ rev: รายการในเคสขอราคา (0158) — ตั้งใจเป็น logical link **ไม่ใส่ FK**
  -- เพราะ rev เป็น immutable (guard ห้าม UPDATE ทุกกรณี) ถ้าใส่ FK ON DELETE SET NULL
  -- การลบเคสจะสั่ง UPDATE rev แล้วชน guard ทันที = ลบเคสไม่ได้เลย
  ADD COLUMN IF NOT EXISTS "sourceAskItemId" text;

-- ชั้นราคาต้อง immutable เหมือน rev (แพตเทิร์น 0143)
CREATE OR REPLACE FUNCTION public.guard_material_price_revision_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'material_price_revision_tier_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'material_price_revision_tier_immutable';
END;
$$;
DROP TRIGGER IF EXISTS material_price_revision_tiers_guard ON public.material_price_revision_tiers;
CREATE TRIGGER material_price_revision_tiers_guard
BEFORE UPDATE OR DELETE ON public.material_price_revision_tiers
FOR EACH ROW EXECUTE FUNCTION public.guard_material_price_revision_tier();

ALTER TABLE public.material_price_revision_tiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_price_revision_tiers FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_price_revision_tiers TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) ออก rev + ชั้นราคา = transaction เดียว
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.append_material_price_revision(
  p_material_id text,
  p_unit_basis  text,
  p_tiers       jsonb,                    -- [{ "qty": number|null, "price": number }, ...]
  p_valid_until date DEFAULT NULL,
  p_quoted_by   text DEFAULT NULL,
  p_quoted_name text DEFAULT NULL,
  p_note        text DEFAULT NULL,
  p_ask_item_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rev_no  integer;
  v_rev_id  text := 'MREV-' || gen_random_uuid();
  v_tier    jsonb;
  v_price   numeric;
BEGIN
  IF p_unit_basis NOT IN ('per_kg', 'per_piece') THEN
    RAISE EXCEPTION 'material_revision_bad_unit_basis';
  END IF;
  IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'array' OR jsonb_array_length(p_tiers) = 0 THEN
    RAISE EXCEPTION 'material_revision_needs_price';
  END IF;

  SELECT COALESCE(MAX("revisionNo"), 0) + 1 INTO v_rev_no
    FROM material_price_revisions WHERE "materialId" = p_material_id;

  INSERT INTO material_price_revisions
    (id, "materialId", "revisionNo", "unitBasis", "validUntil",
     "quotedById", "quotedByName", note, "sourceAskItemId")
  VALUES
    (v_rev_id, p_material_id, v_rev_no, p_unit_basis, p_valid_until,
     p_quoted_by, p_quoted_name, p_note, p_ask_item_id);

  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) LOOP
    v_price := (v_tier->>'price')::numeric;
    IF v_price IS NULL THEN RAISE EXCEPTION 'material_revision_needs_price'; END IF;
    INSERT INTO material_price_revision_tiers
      (id, "revisionId", qty, "pricePerKg", "pricePerUnit")
    VALUES
      ('MRT-' || gen_random_uuid(), v_rev_id,
       NULLIF(v_tier->>'qty', '')::numeric,
       CASE WHEN p_unit_basis = 'per_kg'    THEN v_price END,
       CASE WHEN p_unit_basis = 'per_piece' THEN v_price END);
  END LOOP;

  UPDATE material_prices SET "updatedAt" = now() WHERE id = p_material_id;
  RETURN jsonb_build_object('revisionId', v_rev_id, 'revisionNo', v_rev_no);
END;
$$;

REVOKE ALL ON FUNCTION public.append_material_price_revision(text, text, jsonb, date, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_material_price_revision(text, text, jsonb, date, text, text, text, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) บรรทัดแม่แบบรู้ประเภทบรรจุภัณฑ์ (ค่าตั้งต้นของบรรทัดในใบขอราคาผลิต)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.product_type_cost_lines
  ADD COLUMN IF NOT EXISTS "pmType" text;

-- seed 01-006 REED DIFFUSER (mig 0140) — เติมประเภทให้บรรทัด PM ที่มีอยู่
UPDATE public.product_type_cost_lines SET "pmType" = 'bottle' WHERE id = 'PTCL-seed-01-006-3';
UPDATE public.product_type_cost_lines SET "pmType" = 'cap'    WHERE id = 'PTCL-seed-01-006-4';
UPDATE public.product_type_cost_lines SET "pmType" = 'stick'  WHERE id = 'PTCL-seed-01-006-5';
UPDATE public.product_type_cost_lines SET "pmType" = 'box'    WHERE id = 'PTCL-seed-01-006-6';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- 1) ราคา: ย้ายกลับเข้า revisions ก่อนถอดตาราง tier
--      ALTER TABLE material_price_revisions
--        ADD COLUMN "pricePerKg" numeric, ADD COLUMN "pricePerUnit" numeric;
--      UPDATE material_price_revisions r SET "pricePerKg" = t."pricePerKg",
--             "pricePerUnit" = t."pricePerUnit"
--        FROM material_price_revision_tiers t
--       WHERE t."revisionId" = r.id AND t.qty IS NULL;
--      (rev ที่มีหลายชั้นจะเลือกได้แค่ชั้นเดียว — ข้อมูลหาย ตั้งใจ)
-- 2) DROP TABLE material_price_revision_tiers (ต้อง DROP TRIGGER ก่อน guard บล็อก)
-- 3) DROP FUNCTION append_material_price_revision(...)
-- 4) material_prices: ADD COLUMN "isHidden" boolean NOT NULL DEFAULT false;
--      UPDATE … SET "isHidden" = true WHERE status = 'archived';
--      DROP INDEX material_prices_identity_uk; แล้วค่อย DROP COLUMN status/formula*/pmType/accepted*
