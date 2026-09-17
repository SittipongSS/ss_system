-- ============================================================
--  0364 · ใบสเปคสินค้า FM-SA-04 — สามชั้น (สเปก / ฉบับ / การออก)
--
--  ⭐ **มติผู้ใช้ 2026-09-17** — PR2 ของสายเอกสาร FM-SA-04 / FM-SA-07
--    *"04 คือต่อสินค้า มันคือใบสเปคสินค้า แปลว่า 1 สินค้ามี 1 ใบ แต่ใบนั้นสามารถ
--    revise อัพเดทได้ เผื่อสเปกอัพเดท"* และ *"เอกสารจะมีเลขรันทุกครั้งที่ออกตาม SO"*
--
--  ⇒ **สองเลขบนกระดาษเป็นคนละแกน** (กระดาษเขียนไว้แล้วทั้งคู่)
--    · `Reversion No.` = เวอร์ชัน**สเปกของสินค้า** ขยับเฉพาะตอนสเปกเปลี่ยน
--    · `Document No.`  = เลขรันของ**การออกครั้งนั้น** ออกใหม่ทุกครั้งที่ออกตาม SO
--    ⇒ Rev.02 ออกซ้ำได้หลายครั้ง (ขายรอบใหม่ สเปกเดิม) โดยเลขที่เอกสารไม่ซ้ำกัน
--    (เลขที่สามบนกระดาษ `FM-SA-04: Rev. No.00` คือเวอร์ชันของ **แบบฟอร์ม** อยู่ที่
--     `document_standard_versions` ไม่เกี่ยวกับสองตัวนี้ — ห้ามสลับ)
--
--  ── ทำไมต้องสามตาราง ไม่ใช่ตารางเดียว ────────────────────────────────────
--  🔴 **ช่องของรอบขาย (SO / จำนวน / กำหนดส่ง) ต้องอยู่ชั้น `issues`**
--     ถ้าเก็บไว้ที่ชั้นฉบับ ขายรอบใหม่จะบังคับออก Rev. ใหม่ทุกครั้งทั้งที่สเปกไม่ได้
--     เปลี่ยน แล้ว Rev. จะกลายเป็น *ตัวนับจำนวนครั้งที่ขาย* ไม่ใช่ประวัติสเปก
--     ⇒ คำถาม "สเปกเคยเปลี่ยนอะไรมาบ้าง" จะตอบไม่ได้อีกเลย
--
--  ── ด่านอนุมัติอยู่ที่ "ฉบับ" ไม่ใช่ "การออก" (มติ 17/09) ─────────────────
--  AC ร่าง → AE ตรวจ → AE Sup อนุมัติ · เป็นการอนุมัติ **เนื้อสเปก**
--  ⇒ ออกเอกสารรอบใหม่ด้วยสเปกเดิม = ไม่ต้องเดินด่านซ้ำ ลายเซ็นบนกระดาษคือชุดที่
--    อนุมัติ Rev. นั้นพร้อมวันที่เดิม (ลายเซ็นรับรอง *สเปก* ไม่ใช่รอบขาย)
--  ⇒ แก้ช่องสเปก = ฉบับใหม่ = เดินด่านใหม่ทั้งสามขั้น
--
--  ⚠️ **`docNo` ออกตอนสร้างแถว `issues` ไม่ใช่ตอนกระดาษเป็นฉบับจริง** — คนอ้างเลขนี้
--     ในอีเมล/แชตตั้งแต่ยังเป็นฉบับร่าง (พิมพ์ได้พร้อมลายน้ำ "ฉบับร่าง" ตามเปลือกเอกสาร)
--     ⇒ ฉบับที่ถูกตีกลับ **เผาเลขทิ้ง** ซึ่งเป็นพฤติกรรมเดียวกับเลขอื่นทั้งระบบ
--     (ตัวนับไม่เคยใช้เลขซ้ำ — บทเรียน 0241) · ยอมแลกกับการที่เลขบนกระดาษร่าง
--     กับกระดาษจริงเป็นเลขเดียวกัน
--
--  ⚠️ **ไม่ผูก CHECK กับชุดตัวเลือกของ checklist** — 17 แถวตั้งต้นอยู่ในทะเบียน
--     ฝั่งโค้ด (`lib/sales/productSpecChecklist.js`) ตามแพตเทิร์นเดียวกับ PDR (0214)
--     ที่ผูกคือ **ความยาว** ซึ่งเป็นเรื่องข้อมูลเสีย ไม่ใช่คำศัพท์
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy** · รันซ้ำได้
-- ============================================================

BEGIN;

-- ── ① ชั้นสเปก: หนึ่งแถวต่อสินค้า ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_specs (
  id                text PRIMARY KEY,
  -- 🔴 UNIQUE คือหัวใจของมติ "1 สินค้า 1 ใบ" — ไม่มี unique เมื่อไร ใบที่สองงอกได้
  --    แล้วไม่มีใครรู้ว่าใบไหนของจริง (โรคเดียวกับที่ทะเบียนลูกค้าเคยเจอ)
  "productId"       text NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  -- Rev. ที่อนุมัติแล้วล่าสุด · 0 = ยังไม่เคยมีฉบับไหนผ่านด่าน
  "currentRevNo"    integer NOT NULL DEFAULT 0 CHECK ("currentRevNo" >= 0),
  "createdBy"       text,
  "createdByName"   text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_specs IS
  'ใบสเปคสินค้า FM-SA-04 — หนึ่งแถวต่อสินค้าหนึ่งตัวตลอดอายุสินค้า (0364) · เนื้อสเปกอยู่ที่ product_spec_revisions';

-- ── ② ชั้นฉบับ: เนื้อสเปก + ด่านอนุมัติ ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_spec_revisions (
  id                     text PRIMARY KEY,
  "specId"               text NOT NULL REFERENCES public.product_specs(id) ON DELETE CASCADE,
  "revNo"                integer NOT NULL CHECK ("revNo" >= 1),
  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_ae', 'pending_ae_supervisor', 'approved', 'rejected', 'superseded')),
  -- สเปกของตัวสินค้า (สองช่องนี้ซิงก์ลง products ตอนอนุมัติ — ดู ⑤)
  texture                text,
  "standardPackaging"    text,
  -- Market Positioning
  "targetGroup"          text,
  "keySellingPoint"      text,
  "pricingTier"          text,
  -- Functional Information
  "productBenefit"       text,
  longevity              text,
  "dosagePerUse"         text,
  -- เอกสารที่ขอได้ · ภาพประกอบ — รูปเป็นลิสต์ จึงเก็บเป็น jsonb ไม่ใช่คอลัมน์ต่อแถว
  certifications         jsonb NOT NULL DEFAULT '[]'::jsonb,
  illustrations          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- เส้นอนุมัติ AC ร่าง → AE ตรวจ → AE Sup อนุมัติ
  "submittedAt"          timestamptz,
  "submittedBy"          text,
  "submittedByName"      text,
  "reviewedAt"           timestamptz,
  "reviewedBy"           text,
  "reviewedByName"       text,
  "approvedAt"           timestamptz,
  "approvedBy"           text,
  "approvedByName"       text,
  "rejectedAt"           timestamptz,
  "rejectedBy"           text,
  "rejectedByName"       text,
  "rejectionReason"      text,
  "supersededAt"         timestamptz,
  "createdBy"            text,
  "createdByName"        text,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedAt"            timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("specId", "revNo"),
  CONSTRAINT product_spec_revisions_text_check CHECK (
    (texture             IS NULL OR length(texture)             <= 200) AND
    ("standardPackaging" IS NULL OR length("standardPackaging") <= 500) AND
    ("targetGroup"       IS NULL OR length("targetGroup")       <= 500) AND
    ("keySellingPoint"   IS NULL OR length("keySellingPoint")   <= 500) AND
    ("pricingTier"       IS NULL OR length("pricingTier")       <= 500) AND
    ("productBenefit"    IS NULL OR length("productBenefit")    <= 500) AND
    (longevity           IS NULL OR length(longevity)           <= 200) AND
    ("dosagePerUse"      IS NULL OR length("dosagePerUse")      <= 200) AND
    ("rejectionReason"   IS NULL OR length("rejectionReason")   <= 500)
  ),
  CONSTRAINT product_spec_revisions_json_check CHECK (
    jsonb_typeof(certifications) = 'array' AND jsonb_typeof(illustrations) = 'array'
  )
);

-- ฉบับที่ยังไม่จบมีได้ทีละหนึ่งต่อสินค้า — สองคนร่างคนละฉบับพร้อมกันแล้วอนุมัติทั้งคู่
-- แปลว่าสเปกของสินค้าตัวเดียวแตกเป็นสองทางในเวลาเดียวกัน
CREATE UNIQUE INDEX IF NOT EXISTS product_spec_revisions_open_uidx
  ON public.product_spec_revisions ("specId")
  WHERE status IN ('draft', 'pending_ae', 'pending_ae_supervisor');

CREATE INDEX IF NOT EXISTS product_spec_revisions_spec_idx
  ON public.product_spec_revisions ("specId", "revNo" DESC);

-- ── ③ checklist ของฉบับ (17 แถวตั้งต้นงอกตอนสร้างฉบับ) ─────────────────────
CREATE TABLE IF NOT EXISTS public.product_spec_revision_items (
  id                    text PRIMARY KEY,
  "revisionId"          text NOT NULL REFERENCES public.product_spec_revisions(id) ON DELETE CASCADE,
  "sortOrder"           integer NOT NULL DEFAULT 0,
  -- คีย์จากทะเบียนฝั่งโค้ด · แถวที่ผู้ใช้เพิ่มเองเป็น NULL (ไม่มีคีย์ให้อ้าง)
  "itemKey"             text,
  "itemLabel"           text NOT NULL,
  detail                text,
  "preparedByS"         boolean NOT NULL DEFAULT false,
  "preparedByCustomer"  boolean NOT NULL DEFAULT false,
  note                  text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_spec_revision_items_text_check CHECK (
    length("itemLabel") BETWEEN 1 AND 200 AND
    (detail IS NULL OR length(detail) <= 500) AND
    (note   IS NULL OR length(note)   <= 500)
  )
);

CREATE INDEX IF NOT EXISTS product_spec_revision_items_rev_idx
  ON public.product_spec_revision_items ("revisionId", "sortOrder");

-- ── ④ ชั้นการออกเอกสาร: หนึ่งแถวต่อการออกหนึ่งครั้ง ────────────────────────
CREATE TABLE IF NOT EXISTS public.product_spec_issues (
  id                   text PRIMARY KEY,
  "specId"             text NOT NULL REFERENCES public.product_specs(id) ON DELETE CASCADE,
  -- ⚠️ RESTRICT ไม่ใช่ CASCADE — ลบฉบับที่มีกระดาษออกไปแล้วไม่ได้
  "revisionId"         text NOT NULL REFERENCES public.product_spec_revisions(id) ON DELETE RESTRICT,
  "revNo"              integer NOT NULL,
  "docNo"              text NOT NULL UNIQUE,
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'issued', 'void')),
  -- ต้นเรื่องของการออกรอบนี้ · SET NULL เพื่อไม่ให้ประวัติกระดาษหายตาม SO ที่ถูกลบ
  "salesOrderId"       text REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  "salesOrderLineId"   text REFERENCES public.sales_order_lines(id) ON DELETE SET NULL,
  /* snapshot รอบขาย — ก๊อปตอนออก ไม่ผูกสด
     ⚠️ กระดาษที่ลูกค้าเซ็นต้องอ่านเหมือนวันที่ส่งไปตลอดกาล · ผูกสดเมื่อไร ใบเก่าจะ
        เปลี่ยนตัวเลขตาม SO ที่ถูกแก้/ออก Rev. ทีหลัง */
  "orderNumber"        text,
  "quotationNumber"    text,
  qty                  numeric,
  unit                 text,
  "deliveryDueDate"    date,
  "customerName"       text,
  "brandName"          text,
  "productName"        text,
  "fgCode"             text,
  "issuedAt"           timestamptz,
  "issuedBy"           text,
  "issuedByName"       text,
  -- กระดาษฉบับจริงถูกตรึงที่ issued_documents เหมือน QT/SO
  "issuedDocumentId"   text REFERENCES public.issued_documents(id) ON DELETE SET NULL,
  -- ลูกค้าเซ็นนอกระบบแล้วอัปไฟล์กลับ (แถว Customer บนกระดาษ)
  "customerSignedAt"   date,
  "customerSignedName" text,
  "customerSignFiles"  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "voidedAt"           timestamptz,
  "voidedBy"           text,
  "voidReason"         text,
  "createdBy"          text,
  "createdByName"      text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_spec_issues_text_check CHECK (
    ("customerSignedName" IS NULL OR length("customerSignedName") <= 200) AND
    ("voidReason"         IS NULL OR length("voidReason")         <= 500) AND
    jsonb_typeof("customerSignFiles") = 'array'
  )
);

/* ออกเอกสารซ้ำสำหรับ SO บรรทัดเดียวไม่ได้ — กดปุ่มสองครั้ง/สองแท็บต้องไม่ได้สองเลข
   ⚠️ นับเฉพาะใบที่ยังมีชีวิต: ใบที่ถูก void แล้วต้องออกใหม่ได้ */
CREATE UNIQUE INDEX IF NOT EXISTS product_spec_issues_line_uidx
  ON public.product_spec_issues ("salesOrderLineId")
  WHERE "salesOrderLineId" IS NOT NULL AND status <> 'void';

CREATE INDEX IF NOT EXISTS product_spec_issues_spec_idx
  ON public.product_spec_issues ("specId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS product_spec_issues_order_idx
  ON public.product_spec_issues ("salesOrderId");

-- ── ⑤ สองช่องสเปกถาวรลงทะเบียนสินค้า ──────────────────────────────────────
--
-- ⭐ มติ 17/09: ทะเบียนสินค้าต้องตอบได้ว่า "สเปกวันนี้เป็นยังไง" โดยไม่ต้องเปิดใบ
-- ⇒ สองช่องนี้เป็นกระจกของฉบับที่อนุมัติล่าสุด · ช่องการตลาด/คุณสมบัติ/checklist
--   **ไม่เข้าทะเบียนโดยตั้งใจ** เพราะเปลี่ยนตามล็อต เก็บที่ทะเบียนแล้วจะไม่มีใครกล้าเชื่อ
-- ⚠️ เขียนกลับตอน **อนุมัติ** เท่านั้น ไม่ใช่ตอนพิมพ์ในฟอร์ม — ไม่งั้นทะเบียนเดินตาม
--   ฉบับร่างที่ยังไม่มีใครรับรอง
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS texture             text,
  ADD COLUMN IF NOT EXISTS "standardPackaging" text;

COMMENT ON COLUMN public.products.texture IS
  'ลักษณะเนื้อสาร (0364) — กระจกของใบสเปคฉบับที่อนุมัติล่าสุด · ของจริงอยู่ที่ product_spec_revisions';
COMMENT ON COLUMN public.products."standardPackaging" IS
  'บรรจุภัณฑ์มาตรฐาน (0364) — กระจกของใบสเปคฉบับที่อนุมัติล่าสุด · คนละอันกับ docNote ที่เติมลงเอกสารขาย';

-- ── ⑥ ยามกันแก้ฉบับที่ปิดแล้ว ──────────────────────────────────────────────
--
-- ⚠️ ด่านฝั่ง API มีอยู่แล้ว แต่ยามที่นับได้คือยามที่ฐานถือ — สคริปต์ซ่อมข้อมูล
--   และ backfill รอบหน้าจะไม่รู้กติกานี้ (บทเรียนเดียวกับ issued_documents_guard 0130)
-- ⚠️ ปล่อยให้ขยับได้เฉพาะ `supersededAt` · `updatedAt` — ตอนฉบับใหม่มาแทน
CREATE OR REPLACE FUNCTION public.guard_product_spec_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  /* 🪤 **`rejected` ไม่อยู่ในลิสต์นี้โดยตั้งใจ** — ฉบับที่ถูกตีกลับต้องแก้แล้วส่งใหม่ได้
     ถ้าตรึงไว้ด้วย ใบที่หัวหน้าตีกลับจะกลายเป็นทางตัน (โรคเดียวกับที่ดีล Won เคยเจอ) */
  IF OLD.status IN ('approved', 'superseded') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'approved' AND NEW.status = 'superseded') THEN
      RAISE EXCEPTION 'product_spec_revision_closed: % (%)', OLD.id, OLD.status;
    END IF;
    IF (NEW.texture, NEW."standardPackaging", NEW."targetGroup", NEW."keySellingPoint",
        NEW."pricingTier", NEW."productBenefit", NEW.longevity, NEW."dosagePerUse",
        NEW.certifications, NEW.illustrations)
       IS DISTINCT FROM
       (OLD.texture, OLD."standardPackaging", OLD."targetGroup", OLD."keySellingPoint",
        OLD."pricingTier", OLD."productBenefit", OLD.longevity, OLD."dosagePerUse",
        OLD.certifications, OLD.illustrations) THEN
      RAISE EXCEPTION 'product_spec_revision_content_frozen: %', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_spec_revisions_guard ON public.product_spec_revisions;
CREATE TRIGGER product_spec_revisions_guard
BEFORE UPDATE ON public.product_spec_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_product_spec_revision();

-- ── ⑦ ออกเลขที่เอกสาร FM-SA-04-DDMMYY-XXX ──────────────────────────────────
--
-- ⚠️ **ออกเลขพร้อม INSERT ในคำสั่งเดียว** — จองเลขก่อนแล้วค่อยเขียนแถวคือท่าที่เคย
--   ทำให้ตัวนับ RQ วิ่งเกินเลขที่ออกจริง 8 เลขบน production (บทเรียน 0243/0271)
-- ⚠️ ตัวนับใช้ `entity_number_counters` ร่วมกับเลขอื่น (scope 'FMSA04' · month = YYMM ค.ศ.) ตัดรอบเดือน
--   ⇒ seed ด้วย LIKE ที่ปิดตาช่องวัน เหมือน `assign_pdr_ref_no` (0271) เพราะ prefix
--     เปลี่ยนทุกวัน (DDMMYY) การ seed ด้วย prefix เต็มจะไม่เจออะไรแล้วเริ่มนับ 1 ใหม่
CREATE OR REPLACE FUNCTION public.create_product_spec_issue(
  p_issue_id text,
  p_spec_id  text,
  p_month    text,     -- 'YYMM' ค.ศ. ของเดือนที่ออก (คีย์ตัวนับ · businessMonthKey)
  p_prefix   text,     -- 'FM-SA-04-DDMMYY-'
  p_like     text,     -- 'FM-SA-04-__MMYY-%' ปิดตาช่องวัน · MMYY บน prefix เป็น พ.ศ.
  p_width    integer,
  p_payload  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spec     public.product_specs%ROWTYPE;
  v_rev      public.product_spec_revisions%ROWTYPE;
  v_seed     integer := 0;
  v_no       integer;
  v_doc_no   text;
  v_issue    public.product_spec_issues%ROWTYPE;
BEGIN
  IF p_issue_id IS NULL OR p_issue_id = '' THEN RAISE EXCEPTION 'issue_id_required'; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'issue_month_required'; END IF;
  IF p_prefix !~ '^FM-SA-04-[0-9]{6}-$' THEN RAISE EXCEPTION 'issue_prefix_invalid: %', p_prefix; END IF;
  IF p_like IS NULL OR p_like = '' THEN RAISE EXCEPTION 'issue_like_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'issue_width_invalid'; END IF;

  -- ล็อกใบก่อน — สองคนกด "ออกเอกสาร" พร้อมกันต้องไม่ได้สองเลขบนบรรทัดเดียวกัน
  SELECT * INTO v_spec FROM public.product_specs WHERE id = p_spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_spec_not_found: %', p_spec_id; END IF;

  -- ฉบับที่กระดาษจะอ้าง = ฉบับล่าสุดของใบ (อนุมัติแล้วหรือกำลังเดินด่านก็ได้ —
  -- ฉบับร่างพิมพ์ออกมาเป็น "ฉบับร่าง" พร้อมลายน้ำ ตามเปลือกเอกสาร)
  SELECT * INTO v_rev
  FROM public.product_spec_revisions
  WHERE "specId" = p_spec_id
  ORDER BY "revNo" DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_spec_revision_missing: %', p_spec_id; END IF;
  IF v_rev.status = 'rejected' THEN RAISE EXCEPTION 'product_spec_revision_rejected: %', v_rev.id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.entity_number_counters WHERE scope = 'FMSA04' AND month = p_month
  ) THEN
    SELECT COALESCE(max(substring("docNo" from '([0-9]+)$')::integer), 0)
    INTO v_seed
    FROM public.product_spec_issues
    WHERE "docNo" LIKE p_like
      AND substring("docNo" from '([0-9]+)$') ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('FMSA04', p_month, v_seed + 1)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'product_spec_issue_monthly_sequence_exhausted: %', p_month;
  END IF;

  v_doc_no := p_prefix || lpad(v_no::text, p_width, '0');

  INSERT INTO public.product_spec_issues (
    id, "specId", "revisionId", "revNo", "docNo", status,
    "salesOrderId", "salesOrderLineId", "orderNumber", "quotationNumber",
    qty, unit, "deliveryDueDate", "customerName", "brandName", "productName", "fgCode",
    "createdBy", "createdByName"
  )
  SELECT
    p_issue_id, p_spec_id, v_rev.id, v_rev."revNo", v_doc_no,
    CASE WHEN v_rev.status = 'approved' THEN 'issued' ELSE 'pending' END,
    NULLIF(p_payload->>'salesOrderId', ''), NULLIF(p_payload->>'salesOrderLineId', ''),
    NULLIF(p_payload->>'orderNumber', ''), NULLIF(p_payload->>'quotationNumber', ''),
    NULLIF(p_payload->>'qty', '')::numeric, NULLIF(p_payload->>'unit', ''),
    NULLIF(p_payload->>'deliveryDueDate', '')::date,
    NULLIF(p_payload->>'customerName', ''), NULLIF(p_payload->>'brandName', ''),
    NULLIF(p_payload->>'productName', ''), NULLIF(p_payload->>'fgCode', ''),
    NULLIF(p_payload->>'createdBy', ''), NULLIF(p_payload->>'createdByName', '')
  RETURNING * INTO v_issue;

  -- ฉบับที่อนุมัติแล้ว = กระดาษเป็นฉบับจริงทันที (ลายเซ็นรับรองสเปก ไม่ใช่รอบขาย)
  IF v_rev.status = 'approved' THEN
    UPDATE public.product_spec_issues
    SET "issuedAt" = now(),
        "issuedBy" = NULLIF(p_payload->>'createdBy', ''),
        "issuedByName" = NULLIF(p_payload->>'createdByName', ''),
        "updatedAt" = now()
    WHERE id = p_issue_id
    RETURNING * INTO v_issue;
  END IF;

  RETURN to_jsonb(v_issue);
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_spec_issue(text, text, text, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_spec_issue(text, text, text, text, text, integer, jsonb) TO service_role;

-- ── ⑧ RLS + สิทธิ์: เข้าผ่าน service_role เท่านั้น เหมือนตารางอื่นในระบบ ────
ALTER TABLE public.product_specs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_spec_revisions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_spec_revision_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_spec_issues           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_specs               FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_spec_revisions      FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_spec_revision_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_spec_issues         FROM anon, authenticated;

GRANT ALL ON TABLE public.product_specs               TO service_role;
GRANT ALL ON TABLE public.product_spec_revisions      TO service_role;
GRANT ALL ON TABLE public.product_spec_revision_items TO service_role;
GRANT ALL ON TABLE public.product_spec_issues         TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ (ถ้าต้อง) ─────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS product_spec_revisions_guard ON public.product_spec_revisions;
-- DROP FUNCTION IF EXISTS public.guard_product_spec_revision();
-- DROP FUNCTION IF EXISTS public.create_product_spec_issue(text, text, text, text, text, integer, jsonb);
-- DROP TABLE IF EXISTS public.product_spec_issues;
-- DROP TABLE IF EXISTS public.product_spec_revision_items;
-- DROP TABLE IF EXISTS public.product_spec_revisions;
-- DROP TABLE IF EXISTS public.product_specs;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS texture, DROP COLUMN IF EXISTS "standardPackaging";
