-- 0140 - ระบบขอราคาต้นทุน (Costing Request) PR2: แม่แบบต้นทุนต่อประเภทสินค้า
--
-- แม่แบบ = โครงบรรทัดต้นทุนของสินค้าแต่ละประเภท (หัวน้ำหอม / เนื้อสาร / ขวด-ฝา-กล่อง /
-- ค่าดำเนินการ) ที่ใบขอราคาจะ "กาง" ออกมาเป็นบรรทัดจริงตอนเลือกประเภทสินค้า.
-- ใบขอราคาเก็บบรรทัดเป็น snapshot ของตัวเอง (mig 0141) — แม่แบบจึงเป็นโครงตั้งต้น
-- ไม่ใช่ข้อมูลที่เอกสารเก่าอ้างอิงสด. ด้วยเหตุนี้จึงไม่ต้องมีชั้นเวอร์ชันเต็มแบบ
-- Decision 0012 ระดับ B (organization_settings / workflow_templates / …) แต่ยังคง
-- หลักการสำคัญข้อเดียวกันไว้: **ลบจริงไม่ได้ ทำได้แค่ซ่อน** (มติ 2026-07-22)
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ────────────────────────────────────────────────────────────────────────────
-- 1) แม่แบบ (1 ประเภทสินค้า = 1 แม่แบบที่ใช้งานอยู่)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_type_cost_templates (
  id              text PRIMARY KEY,
  -- "MM-TTT" (เช่น '01-006') — soft reference ไปยัง product_types.
  -- ห้ามใส่ FK: product_types ใช้ unique(mainCategoryCode, typeCode) + id serial
  -- ไม่มีคอลัมน์ categoryCode ให้อ้าง; ตรวจความมีอยู่/สถานะพักใช้ที่ชั้นแอป
  -- (activeProductTypeError) แบบเดียวกับตาราง products
  "categoryCode"  text NOT NULL CHECK ("categoryCode" ~ '^\d{2}-\d{3}$'),
  "isHidden"      boolean NOT NULL DEFAULT false,
  note            text CHECK (note IS NULL OR length(note) <= 500),
  "createdById"   text,
  "createdByName" text,
  "updatedById"   text,
  "updatedByName" text,
  "hiddenById"    text,
  "hiddenByName"  text,
  "hiddenAt"      timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  CHECK ("isHidden" = false OR "hiddenAt" IS NOT NULL)
);

-- ใช้งานอยู่ได้ประเภทละ 1 แม่แบบ — แต่ที่ซ่อนแล้วสะสมได้ไม่จำกัด จึงยัง "ซ่อนแล้ว
-- สร้างใหม่แทน" ได้ (unique เต็มคอลัมน์จะล็อกตายหลังซ่อนใบแรก)
CREATE UNIQUE INDEX IF NOT EXISTS product_type_cost_templates_active_category_idx
  ON public.product_type_cost_templates ("categoryCode") WHERE "isHidden" = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) บรรทัดในแม่แบบ
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_type_cost_lines (
  id                    text PRIMARY KEY,
  "templateId"          text NOT NULL
                        REFERENCES public.product_type_cost_templates(id) ON DELETE CASCADE,
  "sortOrder"           integer NOT NULL DEFAULT 0,
  -- แหล่งราคา: RM_F/RM_FB → ถาม RD, PM → ถาม PC, labor → คิดภายใน
  kind                  text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM', 'labor')),
  label                 text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  "unitBasis"           text NOT NULL CHECK ("unitBasis" IN ('per_kg', 'per_piece')),
  -- ใช้แปลง ฿/กก. → ฿/ชิ้น; มีความหมายเฉพาะบรรทัด per_kg
  "defaultGramsPerUnit" numeric CHECK ("defaultGramsPerUnit" IS NULL OR "defaultGramsPerUnit" > 0),
  required              boolean NOT NULL DEFAULT true,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  -- หน่วยผูกกับชนิดเสมอ: RM ซื้อเป็นกิโล, PM/ค่าดำเนินการคิดเป็นชิ้น. ถ้าปล่อยให้
  -- สลับได้ สูตรแปลงกรัม/ชิ้นในใบขอราคาจะคำนวณผิดเงียบ ๆ
  CONSTRAINT product_type_cost_lines_basis_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_FB') AND "unitBasis" = 'per_kg')
    OR (kind IN ('PM', 'labor') AND "unitBasis" = 'per_piece')
  ),
  CONSTRAINT product_type_cost_lines_grams_only_per_kg CHECK (
    "unitBasis" = 'per_kg' OR "defaultGramsPerUnit" IS NULL
  )
);

CREATE INDEX IF NOT EXISTS product_type_cost_lines_template_idx
  ON public.product_type_cost_lines ("templateId", "sortOrder");

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Guard: ซ่อนแทนลบ
-- ────────────────────────────────────────────────────────────────────────────
-- บรรทัดลบได้อิสระ (การแก้แม่แบบ = เขียนชุดบรรทัดใหม่ทับ) แต่ตัวแม่แบบลบไม่ได้
-- เพื่อให้ยังตามรอยได้ว่าใบขอราคาเก่ากางมาจากแม่แบบใบไหน
CREATE OR REPLACE FUNCTION public.guard_product_type_cost_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product_type_cost_template_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."categoryCode" IS DISTINCT FROM OLD."categoryCode"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'product_type_cost_template_identity_immutable';
  END IF;

  -- ซ่อนแล้วเป็นสถานะสุดท้าย: จะแก้เนื้อหาต่อไม่ได้ และเปิดกลับไม่ได้
  -- (ต้องการใช้อีกให้สร้างแม่แบบใหม่ของประเภทนั้น)
  IF OLD."isHidden" = true THEN
    RAISE EXCEPTION 'product_type_cost_template_hidden_immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_type_cost_templates_guard ON public.product_type_cost_templates;
CREATE TRIGGER product_type_cost_templates_guard
BEFORE UPDATE OR DELETE ON public.product_type_cost_templates
FOR EACH ROW EXECUTE FUNCTION public.guard_product_type_cost_template();

-- บรรทัดของแม่แบบที่ซ่อนแล้วต้องแตะไม่ได้เช่นกัน (ไม่งั้นแก้อ้อมผ่านลูกได้)
CREATE OR REPLACE FUNCTION public.guard_product_type_cost_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_template_id text := COALESCE(NEW."templateId", OLD."templateId");
  v_hidden boolean;
BEGIN
  SELECT "isHidden" INTO v_hidden
  FROM public.product_type_cost_templates WHERE id = v_template_id;

  -- แม่แบบถูกลบไม่ได้อยู่แล้ว; ถ้าไม่เจอแถวแปลว่าเป็น CASCADE ที่ไม่ควรเกิด
  IF v_hidden IS TRUE THEN
    RAISE EXCEPTION 'product_type_cost_template_hidden_immutable';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS product_type_cost_lines_guard ON public.product_type_cost_lines;
CREATE TRIGGER product_type_cost_lines_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.product_type_cost_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_product_type_cost_line();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RLS + grants (เข้าผ่าน API service_role เหมือนตารางอื่นทั้งระบบ)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.product_type_cost_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_type_cost_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_type_cost_templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_type_cost_lines FROM anon, authenticated;
GRANT ALL ON TABLE public.product_type_cost_templates TO service_role;
GRANT ALL ON TABLE public.product_type_cost_lines TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Seed: แม่แบบตัวอย่าง 1 ประเภท — ก้านหอมปรับอากาศ (01-006 REED DIFFUSER)
-- ────────────────────────────────────────────────────────────────────────────
-- PR3 ต้องมีแม่แบบอย่างน้อย 1 ใบถึงจะทดสอบการกางบรรทัดได้จริง. ตัวเลขกรัม/ชิ้น
-- อิงขวด 100 ml (หัวน้ำหอม 20% + เนื้อสาร 80%) — เจ้าของระบบแก้ได้ทั้งหมดในหน้า
-- ตั้งค่า ถือเป็นจุดตั้งต้นให้เห็นรูปแบบ ไม่ใช่มาตรฐานที่ตายตัว
INSERT INTO public.product_type_cost_templates (
  id, "categoryCode", note, "createdById", "createdByName", "updatedById", "updatedByName"
) VALUES (
  'PTCT-seed-01-006', '01-006',
  'แม่แบบตั้งต้นจาก migration 0140 — ปรับบรรทัด/กรัมต่อชิ้นได้ที่หน้าตั้งค่า',
  'migration-0140', 'Migration 0140', 'migration-0140', 'Migration 0140'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_type_cost_lines (
  id, "templateId", "sortOrder", kind, label, "unitBasis", "defaultGramsPerUnit", required
) VALUES
  ('PTCL-seed-01-006-1', 'PTCT-seed-01-006', 1, 'RM_F',  'หัวน้ำหอม (Fragrance)',   'per_kg',   20, true),
  ('PTCL-seed-01-006-2', 'PTCT-seed-01-006', 2, 'RM_FB', 'เนื้อสาร (Base)',          'per_kg',   80, true),
  ('PTCL-seed-01-006-3', 'PTCT-seed-01-006', 3, 'PM',    'ขวดแก้ว',                  'per_piece', NULL, true),
  ('PTCL-seed-01-006-4', 'PTCT-seed-01-006', 4, 'PM',    'ฝา/จุก',                   'per_piece', NULL, true),
  ('PTCL-seed-01-006-5', 'PTCT-seed-01-006', 5, 'PM',    'ก้านไม้หอม',               'per_piece', NULL, true),
  ('PTCL-seed-01-006-6', 'PTCT-seed-01-006', 6, 'PM',    'กล่องบรรจุ',               'per_piece', NULL, true),
  ('PTCL-seed-01-006-7', 'PTCT-seed-01-006', 7, 'labor', 'ค่าบรรจุ + QC',            'per_piece', NULL, true),
  ('PTCL-seed-01-006-8', 'PTCT-seed-01-006', 8, 'labor', 'Shrink Film',              'per_piece', NULL, false)
ON CONFLICT (id) DO NOTHING;

-- Rollback guidance:
-- 1) ยังไม่มีใบขอราคา (mig 0141) มาอ้างแม่แบบในเฟสนี้ — ถอนได้ด้วยการ DROP ตาราง
--    ทั้งสอง (ต้อง DROP TRIGGER/FUNCTION ก่อน เพราะ guard บล็อก DELETE)
-- 2) หลังจาก PR3 ขึ้นแล้วห้าม DROP — ใบขอราคาอ้าง templateId ไว้ตามรอยที่มาของบรรทัด
-- 3) ปิดฟีเจอร์ชั่วคราวให้ซ่อนแม่แบบทุกใบแทน (isHidden = true) ไม่ต้องแตะ schema

NOTIFY pgrst, 'reload schema';
