-- ══════════════════════════════════════════════════════════════════════
--  0204: แถวคำร้อง = หน่วยของงาน (P1)
--
--  ⚠️ เดิมไฟล์นี้ชื่อ 0202 — ชนกับ 0202_customer_addresses.sql ที่ merge ห่างกัน
--  51 วินาที (สอง PR ต่างคนต่างจองเลขเดียวกัน ตอนรัน CI ของแต่ละ PR อีกฝั่งยังไม่
--  merge จึงมองไม่เห็นกัน) ⇒ main แดงจนกว่าจะเลื่อนเลข · เนื้อ SQL ไม่เปลี่ยน
--  ถ้ารัน 0202 ตัวนี้ไปแล้วบน Supabase **ไม่ต้องรันซ้ำ** (และรันซ้ำก็ไม่เสียหาย
--  ทุกคำสั่งเป็น IF NOT EXISTS / IF EXISTS)
--
--  ที่มา: บรรทัดคำร้องวันนี้เป็น "วัสดุ" ได้อย่างเดียว (kind ∈ MATERIAL_KINDS,
--  materialId NOT NULL) ⇒ พัฒนากลิ่น/พัฒนาผลิตภัณฑ์/ขอเอกสาร ใช้บรรทัดไม่ได้เลย
--  และ 4 ก้าวของการส่ง–รับ–ตอบ ไม่มีที่เก็บ
--
--  มติผู้ใช้ 2026-08-04: **แก้แล้วได้รายการใหม่ ไม่ใช่ Rev.** ⇒ 1 แถวถูกส่งครั้งเดียว
--  ตลอดชีวิต ⇒ ไม่ต้องมีตารางรอบ · 4 ก้าวลงคอลัมน์บนแถวได้ตรง ๆ
--
--  สภาพ prod ที่ยืนยันแล้ว (2026-08-04): dept_requests 3 · items 3 · tiers 0
--  · items ทั้ง 3 เป็น RM_F/RM_FB สถานะ quoted และมี answeredRevisionId ครบ
--  · productTypeId ไม่มีใครใช้ (0 แถว) ⇒ DROP ได้โดยไม่ต้อง backfill
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ⚠ **ต้องรันพร้อม deploy โค้ด P1a ในหน้าต่างเดียวกัน** — โค้ดเก่าอ่าน priceStatus
--    ซึ่งหายไปหลังไฟล์นี้ · ลำดับ: merge PR ให้พร้อม deploy → รัน SQL → deploy
--  ⚠ ย้อนกลับได้ก็ต่อเมื่อทุกแถวยังเป็น lineKind = 'material' เท่านั้น
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0) ด่านกันพลาด — ขึ้นข้อความอ่านรู้เรื่อง แทน error ดิบจาก constraint ──
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM public.dept_request_items
   WHERE ("priceStatus" = 'quoted'   AND "answeredRevisionId" IS NULL)
      OR ("priceStatus" = 'no_quote' AND "noQuoteReason"      IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'มี % บรรทัดที่ตอบแล้วแต่ไม่มีหลักฐาน (revision/เหตุผล) — '
      'เติมข้อมูลให้ครบก่อน ห้ามผ่อน constraint ทิ้ง', bad;
  END IF;
END $$;

-- ── 1) ชนิดของบรรทัด ────────────────────────────────────────────────────
-- ⚠ ต่างจาก dept_requests.kind ที่ตั้งใจไม่มี CHECK: "ชนิดบรรทัด" **ผูกกับคอลัมน์**
--   (แต่ละชนิดบังคับคนละช่อง) constraint ข้อ 4 จึงต้องอ่านมันได้
ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "lineKind" text NOT NULL DEFAULT 'material';
ALTER TABLE public.dept_request_items ALTER COLUMN "lineKind" DROP DEFAULT;

-- ── 2) ปลดล็อกช่องที่เป็นของ "บรรทัดวัสดุ" เท่านั้น ──────────────────────
-- label **ยังคง NOT NULL** โดยเจตนา: ทุกชนิดเขียน snapshot ป้ายชื่อของตัวเอง
-- → ข้อความ error ใน answer/route.js · requestSummaryText · ชื่อโฟลเดอร์ Drive
--   ใช้โค้ดเดิมได้ครบทุกรูปร่าง (ชัยชนะ compatibility ที่ถูกที่สุดของทั้งแผน)
ALTER TABLE public.dept_request_items ALTER COLUMN "materialId" DROP NOT NULL;
ALTER TABLE public.dept_request_items ALTER COLUMN kind         DROP NOT NULL;

-- ── 3) ช่องของรูปร่างใหม่ + 4 ก้าว + ผลลัพธ์ ────────────────────────────
ALTER TABLE public.dept_request_items
  -- หมวดสินค้า: สตริง 'MM-TTT' ตรงกับ products."categoryCode" และ productCategoryCode()
  -- ⚠ **ไม่ใส่ FK** ไป product_types.id — id เป็น serial ที่ไม่มีใครอ้างเป็น FK ทั้งระบบ
  ADD COLUMN IF NOT EXISTS "categoryCode" text
    CHECK ("categoryCode" IS NULL OR "categoryCode" ~ '^[0-9]{2}-[0-9]{3}$'),
  ADD COLUMN IF NOT EXISTS "scentId"  text REFERENCES public.scents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qty        numeric CHECK (qty IS NULL OR qty > 0),
  ADD COLUMN IF NOT EXISTS unit       text CHECK (unit IS NULL OR length(unit) <= 20),
  ADD COLUMN IF NOT EXISTS "docType"  text CHECK ("docType" IS NULL OR length("docType") <= 60),

  -- 4 ก้าว + รับเรื่อง — อยู่บน "แถว" ไม่ใช่ตารางรอบ
  -- ⚠ ackAt อยู่บนแถวเพราะแถวที่เกิดจากการแก้ เริ่มที่ "รอ RD รับเรื่อง" อีกครั้ง
  --   การรับเรื่องระดับใบ (dept_requests.acknowledgedAt) fan-out ลงแถวที่ยังว่าง
  ADD COLUMN IF NOT EXISTS "ackAt" date, ADD COLUMN IF NOT EXISTS "ackById" text,
  ADD COLUMN IF NOT EXISTS "ackByName" text, ADD COLUMN IF NOT EXISTS "dueAt" date,
  ADD COLUMN IF NOT EXISTS "readyAt" date, ADD COLUMN IF NOT EXISTS "readyById" text,
  ADD COLUMN IF NOT EXISTS "readyByName" text,
  ADD COLUMN IF NOT EXISTS "pickedUpAt" date, ADD COLUMN IF NOT EXISTS "pickedUpById" text,
  ADD COLUMN IF NOT EXISTS "pickedUpByName" text,
  ADD COLUMN IF NOT EXISTS "sentAt" date, ADD COLUMN IF NOT EXISTS "sentById" text,
  ADD COLUMN IF NOT EXISTS "sentByName" text,

  -- ลูกค้าตอบ + จำนวนที่คอนเฟิร์ม (ใช้กระทบยอดกับ sales_order_lines.qty)
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IS NULL OR outcome IN ('confirmed', 'revise', 'rejected')),
  ADD COLUMN IF NOT EXISTS "outcomeAt" date,
  ADD COLUMN IF NOT EXISTS "outcomeById" text, ADD COLUMN IF NOT EXISTS "outcomeByName" text,
  ADD COLUMN IF NOT EXISTS "outcomeNote" text
    CHECK ("outcomeNote" IS NULL OR length("outcomeNote") <= 4000),
  ADD COLUMN IF NOT EXISTS "confirmedQty" numeric
    CHECK ("confirmedQty" IS NULL OR "confirmedQty" >= 0),

  -- ผลลัพธ์ + สายพันธุ์ (แทน Rev.) — "เลขที่อ้างอิง" บนหน้าจอ
  ADD COLUMN IF NOT EXISTS "producedScentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "producedFormulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "derivedFromItemId" text
    REFERENCES public.dept_request_items(id) ON DELETE SET NULL;

-- ── 4) รูปร่างบังคับต่อชนิด ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'dept_request_items_line_kind_check') THEN
    ALTER TABLE public.dept_request_items
      ADD CONSTRAINT dept_request_items_line_kind_check
        CHECK ("lineKind" IN ('material', 'scent_dev', 'product_dev', 'document')),
      ADD CONSTRAINT dept_request_items_shape CHECK (
        ("lineKind" <> 'material'    OR ("materialId" IS NOT NULL AND kind IS NOT NULL)) AND
        ("lineKind" <> 'product_dev' OR ("categoryCode" IS NOT NULL AND "scentId" IS NOT NULL)) AND
        ("lineKind" <> 'document'    OR "docType" IS NOT NULL)),
      -- ลำดับ "การมีค่า" ของ 4 ก้าว — ข้ามขั้นไม่ได้
      -- ⚠ **ไม่มี CHECK เรียงวันที่โดยเจตนา** — ผู้ใช้แก้วันย้อนหลังเป็นเรื่องปกติ
      --   กฎที่ตั้งใจกันข้อมูลเสียจะกลายเป็นตัวบล็อกการแก้ข้อมูลเสียเอง
      --   (บทเรียน sanitizeInheritedFormulaDate) · ฝั่งอ่าน clamp max(0,…) แทน
      ADD CONSTRAINT dept_request_items_hop_chain CHECK (
        ("pickedUpAt" IS NULL OR "readyAt"    IS NOT NULL) AND
        ("sentAt"     IS NULL OR "pickedUpAt" IS NOT NULL) AND
        (outcome      IS NULL OR "sentAt"     IS NOT NULL)),
      -- คอนเฟิร์มแล้วต้องบอกจำนวน ไม่งั้นกระทบยอดกับ SO ไม่ได้
      ADD CONSTRAINT dept_request_items_confirmed_needs_qty CHECK (
        outcome IS DISTINCT FROM 'confirmed' OR "confirmedQty" IS NOT NULL),
      -- ตอบแล้วต้องมีวันที่ (เส้นวัด lead time)
      ADD CONSTRAINT dept_request_items_outcome_needs_date CHECK (
        outcome IS NULL OR "outcomeAt" IS NOT NULL);
  END IF;
END $$;

-- ── 5) priceStatus → answerStatus (ทั่วไปพอสำหรับ 4 รูปร่าง) ─────────────
-- ⚠⚠ คำสั่งอันตรายที่สุดในไฟล์: DROP CHECK ด้วย **การค้นนิยาม ไม่ใช่เดาชื่อ**
--    0158 สร้าง inline (Postgres ตั้งชื่อเอง มี camelCase ปน) และ 0173 จงใจไม่ rename
--    RAISE NOTICE ไว้ให้เห็นกับตาว่าลบอะไรไปบ้าง — อ่าน log ตอนรันเสมอ
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
            WHERE conrelid = 'public.dept_request_items'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%priceStatus%'
  LOOP
    RAISE NOTICE 'DROP CONSTRAINT % → %', c.conname, c.def;
    EXECUTE format('ALTER TABLE public.dept_request_items DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.dept_request_items RENAME COLUMN "priceStatus"   TO "answerStatus";
ALTER TABLE public.dept_request_items RENAME COLUMN "noQuoteReason" TO "declineReason";

UPDATE public.dept_request_items SET "answerStatus" = CASE "answerStatus"
  WHEN 'quoted' THEN 'done' WHEN 'no_quote' THEN 'declined' ELSE 'pending' END;

ALTER TABLE public.dept_request_items ALTER COLUMN "answerStatus" SET DEFAULT 'pending';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'dept_request_items_answer_status_check') THEN
    ALTER TABLE public.dept_request_items
      ADD CONSTRAINT dept_request_items_answer_status_check
        CHECK ("answerStatus" IN ('pending', 'done', 'declined')),
      ADD CONSTRAINT dept_request_items_answer_evidence CHECK (
        ("answerStatus" <> 'done'     OR "lineKind" <> 'material'
                                      OR "answeredRevisionId" IS NOT NULL) AND
        ("answerStatus" <> 'declined' OR "declineReason" IS NOT NULL));
  END IF;
END $$;

-- ── 6) หมวดสินค้าอ้างแบบเดียวทั้งระบบ — เลิกใช้ productTypeId ────────────
-- mig 0195 เพิ่ม productTypeId (integer FK) ไว้ที่ **หัวใบ** สำหรับ mockup
-- ตอนนี้หมวดอยู่ที่ **แถว** และทั้งระบบอ้างหมวดด้วยสตริง 'MM-TTT' (products.categoryCode,
-- categoryOf(), ProductCategorySelect) ⇒ ยุบมาทางเดียว ไม่ให้มีสองวิธีอ้างของเดียวกัน
-- ยืนยันแล้วว่า prod ไม่มีแถวไหนใช้ (0 แถว) จึงไม่ต้อง backfill
ALTER TABLE public.dept_requests DROP COLUMN IF EXISTS "productTypeId";

-- ── 7) index ────────────────────────────────────────────────────────────
-- ⚠ DROP ก่อน CREATE เสมอ: `CREATE INDEX IF NOT EXISTS` เทียบแค่ **ชื่อ** ไม่เทียบ
--   นิยาม → ชื่อซ้ำจะถูกข้ามเงียบ 100% (บทเรียน mig 0181/0182)
DROP INDEX IF EXISTS dept_request_items_line_kind_idx;
CREATE INDEX dept_request_items_line_kind_idx
  ON public.dept_request_items ("lineKind");
DROP INDEX IF EXISTS dept_request_items_open_idx;
CREATE INDEX dept_request_items_open_idx
  ON public.dept_request_items ("requestId") WHERE "answerStatus" = 'pending';
DROP INDEX IF EXISTS dept_request_items_derived_idx;
CREATE INDEX dept_request_items_derived_idx
  ON public.dept_request_items ("derivedFromItemId") WHERE "derivedFromItemId" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน (ค่าที่กำกับอิงข้อมูล prod จริง 3 แถว) ────────────────────
-- SELECT "lineKind", "answerStatus", count(*) FROM dept_request_items GROUP BY 1,2;  -- material/done = 3
-- SELECT count(*) FROM dept_request_items WHERE "materialId" IS NULL;                 -- 0
-- SELECT count(*) FROM dept_request_item_tiers;                                       -- 0
-- SELECT count(*) FROM information_schema.columns WHERE table_name='dept_request_items'
--   AND column_name IN ('priceStatus','noQuoteReason');                               -- 0
-- SELECT count(*) FROM information_schema.columns WHERE table_name='dept_requests'
--   AND column_name='productTypeId';                                                  -- 0
--
-- Rollback: กลับ rename ทั้งสอง · map done→quoted / declined→no_quote · สร้าง CHECK
--   ของ 0158 ขึ้นใหม่ด้วยมือ (ชื่อเดิมหายไปแล้ว) · DROP คอลัมน์+constraint ที่เพิ่ม ·
--   SET NOT NULL คืนให้ materialId กับ kind · เพิ่ม productTypeId กลับ
--   ⚠ ย้อนได้เฉพาะตอนที่ทุกแถวยังเป็น lineKind = 'material'
