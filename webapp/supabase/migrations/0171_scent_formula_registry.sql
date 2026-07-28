-- ============================================================
--  Migration 0171: ทะเบียนกลิ่น (scents) + ทะเบียนสูตร (formulas)
--  PR-1 ของ docs/cross-department-requests-plan.md (ชั้น A)
--
--  ก่อนหน้านี้ "กลิ่น" ไม่มีตัวตนในระบบเลย — มีแค่ชื่อขั้นตอนในไทม์ไลน์
--  ("ส่งกลิ่น ครั้งที่ 1") กับข้อความในทะเบียนวัสดุ · และ "สูตร" เป็น 3 ช่อง
--  ข้อความบน products (mig 0112) → ขอราคา F/FB อ้างของพวกนี้ได้แค่พิมพ์ชื่อ
--
--  ⭐ หลักฐานจาก prod ก่อนเขียนไฟล์นี้ (2026-07-28) — 14 แถวที่มีข้อมูลสูตร:
--     · มีรหัสสูตรจริงแค่ **4 แถว = 2 สูตร**
--     · อีก **10 แถวมีแต่ "ชื่อสูตร" ไม่มีรหัส และชื่อพวกนั้นคือ *ชื่อกลิ่น***
--       (Walk on beach 01 · Forest night · Floral bouquet 01 · Loyal love …)
--     ⇒ ข้อมูลสองอย่างปนกันในช่องเดียวเพราะไม่มีที่เก็บกลิ่น — ยืนยันความจำเป็น
--       ของไฟล์นี้ตรง ๆ และเป็นเหตุผลที่ backfill ทำได้แค่ส่วนที่มีรหัสจริง
--     · อีก 41 แถวเป็น **สตริงว่าง `''`** ไม่ใช่ค่าจริง (เก็บกวาดเป็น NULL ในข้อ 6)
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)
--  ⚠ ต้องรัน **ก่อน** deploy โค้ด PR-1
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) ทะเบียนกลิ่น
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scents (
  id             text PRIMARY KEY,
  -- รหัสกลิ่น = ของจริงจาก RD ไม่ใช่เลขรันของระบบ (มติ 8 — เหมือนรหัสสูตร)
  -- ร่างที่ฝ่ายขายเปิดยังไม่มีรหัส → RD ใส่ตอนรับเข้าทะเบียน
  code           text CHECK (code IS NULL OR length(btrim(code)) BETWEEN 1 AND 100),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  -- ⚠ มติ 9: กลิ่นที่ออกแบบให้ลูกค้า A ใช้กับ B ไม่ได้ → ผูกลูกค้าเสมอ
  --   ไม่มีแนวคิด "กลิ่นกลาง" ในระบบนี้
  "customerId"   text NOT NULL,
  "customerName" text,
  -- ดีล SCENT ต้นทางที่สั่งออกแบบ (null = กลิ่นที่มีอยู่ก่อน/สร้างจากทะเบียนตรง ๆ)
  "dealId"       text,
  -- มติ 10: ฝ่ายขายเปิดร่างได้ RD เป็นคนรับเข้าทะเบียน (แพตเทิร์นเดียวกับ 0157)
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN (
                   'draft',       -- ฝ่ายขายเสนอเข้ามา รอ RD รับ (อ้างในคำร้องขอราคายังไม่ได้)
                   'developing',  -- RD รับแล้ว กำลังออกแบบ/ส่งให้ลูกค้าลอง
                   'active',      -- ลูกค้าอนุมัติแล้ว ใช้ผลิตได้
                   'archived')),  -- เลิกใช้
  -- Rev ล่าสุด — derive ตอนเขียนเสมอ (อ่านทะเบียนไม่ต้อง join ลูกทุกครั้ง)
  "currentRevisionNo" integer NOT NULL DEFAULT 0,
  "ownerId"      text, "ownerName" text,           -- RD เจ้าของกลิ่น
  "acceptedById" text, "acceptedByName" text, "acceptedAt" timestamptz,
  note           text CHECK (note IS NULL OR length(note) <= 2000),
  "createdById"  text, "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  -- รับเข้าทะเบียนแล้วต้องมีรหัสเสมอ (ร่างยังไม่มีได้)
  CONSTRAINT scents_code_required_when_accepted CHECK (status = 'draft' OR code IS NOT NULL)
);

-- ตัวตนของกลิ่น = ชื่อ (ตัดช่องว่าง/ไม่สนตัวพิมพ์) + ลูกค้า
-- แพตเทิร์นเดียวกับ material_prices_identity_uk (0157) — ห้ามชื่อซ้ำในลูกค้าเดียวกัน
-- ไม่งั้นคำร้องขอราคา F สองใบจะชี้คนละแถวโดยไม่มีใครรู้
CREATE UNIQUE INDEX IF NOT EXISTS scents_identity_uk
  ON public.scents (lower(btrim(name)), "customerId");
-- รหัสกลิ่นห้ามซ้ำทั้งบริษัท (partial — ร่างที่ยังไม่มีรหัสไม่นับ)
CREATE UNIQUE INDEX IF NOT EXISTS scents_code_uk
  ON public.scents (lower(btrim(code))) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS scents_customer_idx ON public.scents ("customerId");
CREATE INDEX IF NOT EXISTS scents_deal_idx     ON public.scents ("dealId") WHERE "dealId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS scents_status_idx   ON public.scents (status);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Rev ของกลิ่น = การส่งกลิ่นให้ลูกค้า 1 ครั้ง + ผลตอบรับ
--
-- ⚠ ต่างจาก material_price_revisions ตรงที่ **แก้ได้** — feedback ของลูกค้ามา
--   ทีหลังวันส่งเสมอ ห้ามลอก guard immutable ของราคามาใส่ที่นี่
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scent_revisions (
  id               text PRIMARY KEY,
  "scentId"        text NOT NULL REFERENCES public.scents(id) ON DELETE CASCADE,
  "revisionNo"     integer NOT NULL CHECK ("revisionNo" >= 1),
  "sampleCode"     text CHECK ("sampleCode" IS NULL OR length("sampleCode") <= 100),
  "sentAt"         date,                           -- "วันที่ Rev" = วันที่ส่งกลิ่นให้ลูกค้า
  "sentById"       text, "sentByName" text,
  -- ผลตอบรับจากลูกค้า
  "feedbackStatus" text NOT NULL DEFAULT 'pending' CHECK ("feedbackStatus" IN (
                     'pending',   -- ส่งแล้ว รอลูกค้าตอบ
                     'revise',    -- ให้แก้ → เกิด Rev ถัดไป
                     'approved',  -- ผ่าน
                     'rejected')),-- ไม่เอากลิ่นนี้
  "feedbackAt"     date,
  "feedbackById"   text, "feedbackByName" text,
  feedback         text CHECK (feedback IS NULL OR length(feedback) <= 4000),
  note             text CHECK (note IS NULL OR length(note) <= 2000),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  -- มีผลตอบรับแล้วต้องมีวันที่เสมอ (ไม่งั้นวัด lead time ของ RD ย้อนหลังไม่ได้)
  CONSTRAINT scent_revisions_feedback_needs_date
    CHECK ("feedbackStatus" = 'pending' OR "feedbackAt" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS scent_revisions_no_uk
  ON public.scent_revisions ("scentId", "revisionNo");

-- ────────────────────────────────────────────────────────────────────────────
-- 3) ทะเบียนสูตร
--
-- รหัสสูตรเป็นของจริงจาก RD (ไม่ใช่เลขรันของระบบ) → ผู้ใช้กรอกเอง แต่ห้ามซ้ำ
-- ⚠ code เป็น NULL ได้เฉพาะสถานะ 'draft' — เพราะของจริงบน prod มี 10 แถวที่มีแต่
--   ชื่อไม่มีรหัส (ดูหัวไฟล์) ถ้าบังคับ NOT NULL จะเอาเข้าทะเบียนไม่ได้เลย
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.formulas (
  id             text PRIMARY KEY,
  code           text CHECK (code IS NULL OR length(btrim(code)) BETWEEN 1 AND 100),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  "formulaDate"  date,                             -- เดิม products."formulaDate"
  -- สูตรใช้กลิ่นตัวไหน (มติผู้ใช้: สูตรเกี่ยวข้องกับกลิ่น)
  "scentId"      text REFERENCES public.scents(id) ON DELETE SET NULL,
  "customerId"   text, "customerName" text,        -- null = สูตรกลาง (ต่างจากกลิ่น)
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'archived')),
  note           text CHECK (note IS NULL OR length(note) <= 2000),
  "acceptedById" text, "acceptedByName" text, "acceptedAt" timestamptz,
  "createdById"  text, "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT formulas_code_required_when_accepted CHECK (status = 'draft' OR code IS NOT NULL)
);
-- partial: ร่างที่ยังไม่มีรหัสไม่นับ (เหมือน scents_code_uk)
CREATE UNIQUE INDEX IF NOT EXISTS formulas_code_uk
  ON public.formulas (lower(btrim(code))) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS formulas_scent_idx    ON public.formulas ("scentId") WHERE "scentId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS formulas_customer_idx ON public.formulas ("customerId");
CREATE INDEX IF NOT EXISTS formulas_status_idx   ON public.formulas (status);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ต่อทะเบียนเข้าของเดิม
--
-- products: 3 ช่องข้อความเดิม **ไม่ลบในรอบนี้** — ยังมีที่อ่านอยู่หลายจุด รวมทั้ง
-- snapshot บนใบขอราคาผลิต/เคสขอราคา · เพิ่ม pointer ก่อน เก็บกวาดใน PR-5
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_formula_idx ON public.products ("formulaId") WHERE "formulaId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_scent_idx   ON public.products ("scentId")   WHERE "scentId"   IS NOT NULL;

-- material_prices: F ผูกกลิ่น · FB ผูกสูตร (PM ไม่ผูกอะไร)
-- ⚠ ไม่แตะ material_prices_identity_uk ในรอบนี้ — ตัวตนยังยึด formulaCode (text)
--   เปลี่ยน unique index = ต้องล้างข้อมูลก่อน ยกไป PR-5 ตอนที่ pointer เต็มแล้ว
ALTER TABLE public.material_prices
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) backfill สูตร — **เฉพาะแถวที่มีรหัสสูตรจริง** (prod = 4 แถว → 2 สูตร)
--
-- ⚠ อีก 10 แถวที่มีชื่อแต่ไม่มีรหัส **ตั้งใจไม่ backfill** — ชื่อพวกนั้นคือชื่อกลิ่น
--   ระบบเดาแทน RD ไม่ได้ว่าอันไหนเป็นกลิ่น อันไหนเป็นสูตร → ขึ้นเป็นการ์ด
--   "รอจัดระเบียบ" ในหน้าทะเบียนให้ RD ตัดสินทีละแถว (สร้าง master data ผิด
--   แย่กว่าไม่สร้าง เพราะของผิดจะถูกอ้างต่อไปเรื่อย ๆ โดยไม่มีใครกลับมาตรวจ)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.formulas (id, code, name, "formulaDate", "customerId", "customerName", status)
SELECT
  'FML-' || md5(lower(btrim(p."formulaCode"))),
  min(btrim(p."formulaCode")),
  min(COALESCE(NULLIF(btrim(p."formulaName"), ''), btrim(p."formulaCode"))),
  max(p."formulaDate"),
  -- ผูกลูกค้าให้เฉพาะสูตรที่ใช้กับลูกค้ารายเดียวล้วน ๆ (ปนกัน = สูตรกลาง)
  CASE WHEN count(DISTINCT p."customerId") = 1 THEN min(p."customerId") END,
  CASE WHEN count(DISTINCT p."customerId") = 1 THEN min(p."customerName") END,
  'active'                      -- มีรหัสจริง = รับเข้าทะเบียนได้เลย ไม่ต้องเป็นร่าง
  FROM public.products p
 WHERE NULLIF(btrim(p."formulaCode"), '') IS NOT NULL
 GROUP BY lower(btrim(p."formulaCode"))
 ON CONFLICT DO NOTHING;

UPDATE public.products p
   SET "formulaId" = 'FML-' || md5(lower(btrim(p."formulaCode")))
 WHERE NULLIF(btrim(p."formulaCode"), '') IS NOT NULL
   AND p."formulaId" IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) เก็บกวาดสตริงว่าง → NULL (prod = 41 แถว)
--    ไม่งั้นทุกการนับต่อจากนี้ต้องระวัง `'' vs NULL` เอง และหน้าจอจะโชว์ช่องว่าง
--    เหมือนมีค่า (บทเรียน: ตัวเลข "45 สูตร" ในแผนฉบับแรกมาจากการนับผิดแบบนี้)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.products
   SET "formulaCode" = NULLIF(btrim("formulaCode"), ''),
       "formulaName" = NULLIF(btrim("formulaName"), '')
 WHERE btrim(COALESCE("formulaCode", '')) = ''
    OR btrim(COALESCE("formulaName", '')) = '';

-- ────────────────────────────────────────────────────────────────────────────
-- 7) RLS (แพตเทิร์นเดิมทั้งระบบ: ปิดหมด เปิดเฉพาะ service_role)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulas        ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scents, public.scent_revisions, public.formulas
  FROM anon, authenticated;
GRANT  ALL ON TABLE public.scents, public.scent_revisions, public.formulas
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT count(*) FROM formulas;                                   -- ควรได้ 2
-- SELECT count(*) FROM products WHERE "formulaId" IS NOT NULL;     -- ควรได้ 4
-- SELECT count(*) FROM products
--  WHERE NULLIF(btrim("formulaCode"), '') IS NOT NULL AND "formulaId" IS NULL;  -- ต้อง 0
-- SELECT count(*) FROM products WHERE "formulaCode" = '' OR "formulaName" = '';  -- ต้อง 0
--
-- ── รายการที่ RD ต้องจัดระเบียบเอง (การ์ด "รอจัดระเบียบ" ในหน้าทะเบียน) ──
-- SELECT "fgCode", "productDescription", "formulaName", "formulaDate"
--   FROM products
--  WHERE "formulaId" IS NULL AND NULLIF(btrim("formulaName"), '') IS NOT NULL;
--  → RD ตัดสินทีละแถวว่าเป็น "กลิ่น" (เข้า scents) หรือ "สูตร" (เข้า formulas + ใส่รหัส)
--  ⚠ มีบั๊กข้อมูลรออยู่ 1 แถว: formulaDate = '2202-08-06' (ปี 2202 — ผู้ใช้แก้เอง)
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE public.products        DROP COLUMN IF EXISTS "formulaId", DROP COLUMN IF EXISTS "scentId";
-- ALTER TABLE public.material_prices DROP COLUMN IF EXISTS "scentId",   DROP COLUMN IF EXISTS "formulaId";
-- DROP TABLE IF EXISTS public.formulas;
-- DROP TABLE IF EXISTS public.scent_revisions;
-- DROP TABLE IF EXISTS public.scents;
-- (ข้อ 6 ย้อนไม่ได้และไม่ต้องย้อน — '' กับ NULL มีความหมายเดียวกันในทุกที่ที่อ่าน)
