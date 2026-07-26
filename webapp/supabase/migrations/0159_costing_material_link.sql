-- 0159 - ระบบขอราคาผลิต ฉบับ 5 (PR-3): ใบขอราคาผลิตผูกวัสดุด้วย id จริง
--
-- ก่อนหน้านี้บรรทัดในใบ CR จับคู่กับคลังราคาด้วย **ข้อความชื่อ** (norm(label)) ซึ่ง
-- เปราะและเป็นรากของบั๊ก "ตอบราคาแล้วบรรทัดไม่เคยได้ราคา". ตั้งแต่นี้บรรทัดผูก
-- material_prices."id" ตรง ๆ และมี FK บังคับว่าตัวชี้ต้องมีอยู่จริง
--
-- ธง confirm* ย้ายไปเป็น "เคสขอราคาวัสดุ" (0158) แล้ว และ priceSource ซ้ำซ้อนกับ
-- materialRevisionId (รู้ที่มาจากตัวชี้ rev อยู่แล้ว) — ถอนทั้งชุด
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

BEGIN;

ALTER TABLE public.costing_item_components
  -- ชั้นราคาที่เซลเลือกใช้ (null = ราคาไม่แบ่งชั้น) — ราคายังเป็น snapshot ค่าเดียว
  -- เหมือนเดิม (มติ 2): จำนวนวัสดุ ≠ จำนวนสินค้า เซลจึงเป็นคนตัดสินว่าใช้ชั้นไหน
  -- สูตร itemUnitCost ไม่ต้องรู้จักชั้นเลย คอลัมน์นี้ไว้ตรวจย้อนหลังว่าราคานี้มาจากชั้นไหน
  ADD COLUMN IF NOT EXISTS "priceTierQty" numeric
    CHECK ("priceTierQty" IS NULL OR "priceTierQty" > 0),
  DROP COLUMN IF EXISTS "confirmStatus",
  DROP COLUMN IF EXISTS "confirmRequestedAt",
  DROP COLUMN IF EXISTS "confirmRequestedById",
  DROP COLUMN IF EXISTS "priceSource";

-- ตัวชี้ที่ชี้วัสดุ/รุ่นที่ไม่มีอยู่จริง (ผลจากบั๊กจับคู่ตามชื่อ) ต้องเคลียร์ก่อนใส่ FK
UPDATE public.costing_item_components
   SET "materialId" = NULL, "materialRevisionId" = NULL
 WHERE "materialId" IS NOT NULL
   AND "materialId" NOT IN (SELECT id FROM public.material_prices);
UPDATE public.costing_item_components
   SET "materialRevisionId" = NULL
 WHERE "materialRevisionId" IS NOT NULL
   AND "materialRevisionId" NOT IN (SELECT id FROM public.material_price_revisions);

-- RESTRICT: วัสดุ/รุ่นที่ถูกอ้างเป็นราคาในใบแล้ว ลบทิ้งไม่ได้ (ใบต้องตามรอยกลับได้เสมอ)
ALTER TABLE public.costing_item_components
  DROP CONSTRAINT IF EXISTS costing_item_components_material_fk,
  DROP CONSTRAINT IF EXISTS costing_item_components_material_rev_fk;
ALTER TABLE public.costing_item_components
  ADD CONSTRAINT costing_item_components_material_fk
    FOREIGN KEY ("materialId") REFERENCES public.material_prices(id) ON DELETE RESTRICT,
  ADD CONSTRAINT costing_item_components_material_rev_fk
    FOREIGN KEY ("materialRevisionId") REFERENCES public.material_price_revisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS costing_item_components_material_idx
  ON public.costing_item_components ("materialId");

-- ── ร่างที่ยังไม่เคยส่ง ต้องลบได้ แม้สถานะจะขยับเป็น pricing/assembling ──────
-- สถานะ 'pricing' กลับมามีความหมายใน PR-3 = "มีเคสขอราคาวัสดุค้างอยู่" และแอปเป็น
-- คนสลับธงนี้เอง ไม่ใช่ผู้ใช้กด. guard เดิมผูกการลบไว้กับ status = 'draft' เป๊ะ ๆ
-- ทำให้ใบร่างที่เพียงแค่ "เปิดเคสถามราคา" กลายเป็นลบไม่ได้ตลอดกาลโดยไม่ได้ตั้งใจ
-- → เกณฑ์จริงคือ "ยังไม่เคยส่งออกจากมือฝ่ายขาย" (submittedAt IS NULL) ต่างหาก
CREATE OR REPLACE FUNCTION public.guard_costing_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."submittedAt" IS NULL
       AND OLD.status IN ('draft', 'pricing', 'assembling') THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'costing_request_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'costing_request_identity_immutable';
  END IF;

  -- เลขที่เอกสารออกครั้งเดียวตอนส่งขอราคา แล้วห้ามเปลี่ยน/ถอน
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'costing_request_doc_no_immutable';
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'costing_request_cancelled_immutable';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- 1) ถอน FK/index: ALTER TABLE ... DROP CONSTRAINT costing_item_components_material_fk
--    (+ _material_rev_fk), DROP INDEX costing_item_components_material_idx
-- 2) คืนคอลัมน์ confirm*/priceSource ด้วยบล็อก ADD COLUMN ของ 0159 ในไฟล์ 0144
--    (ค่าที่เคยอยู่ในคอลัมน์นั้นหายถาวร — เป็นธงชั่วคราวไม่ใช่หลักฐาน)
-- 3) คืน guard เดิม: รันบล็อก CREATE OR REPLACE FUNCTION guard_costing_request ของ 0141
-- 4) "priceTierQty" ถอนได้ตรง — ราคา snapshot บนบรรทัดไม่ถูกแตะ ใบเก่ายังคิดต้นทุนได้
