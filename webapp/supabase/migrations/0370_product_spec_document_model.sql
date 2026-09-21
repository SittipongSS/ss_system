-- ============================================================
--  0370 · ใบสเปคสินค้า FM-SA-04 — ย้าย Rev กับด่านอนุมัติจาก "สเปค" ไปที่ "เอกสารที่ออกจาก SO"
--
--  ⭐ **มติเจ้าของ 21/09/2569** (ฉบับเต็ม: docs/fm-sa-04-document-model.md)
--    · สเปคในฐานข้อมูลเป็น **ข้อมูลของสินค้า** — 1 แถวต่อสินค้า ไม่มีเลขรัน ไม่มี Rev
--      ไม่มีด่านอนุมัติ · ฝ่ายขายแก้ได้เลย ทุกการแก้ลง audit log
--    · เลขที่เอกสาร Rev และด่านอนุมัติเป็นของ **เอกสาร** ที่ AC ออกจากบรรทัด SO
--      หลัง SO อนุมัติแล้ว (1 ใบต่อบรรทัด SO)
--    · เส้นอนุมัติ: AC ยื่น → AE เจ้าของดีลของ SO → AE Supervisor (admin กดแทนได้ทุกขั้น)
--    · Rev เริ่ม Rev.00 · แก้ก่อนอนุมัติขั้นสุดท้ายยังเป็น Rev เดิม · อนุมัติแล้วกด
--      "แก้ไขเอกสาร" ได้ Rev+1 **เลขที่เดิม** แล้วเดินด่านครบสามขั้นใหม่
--
--  ── ทำไมโมเดลสามชั้นของ 0364 (สเปค / ฉบับ / การออก) ถูกแทน ─────────────
--  0364 ผูก Rev และด่านอนุมัติไว้ที่ "ฉบับของสเปค" แล้วให้การออกเอกสารแต่ละครั้งอ้างฉบับ
--  ⇒ ลายเซ็นบนกระดาษรับรอง *สเปค* ไม่ใช่ *เอกสารที่ส่งลูกค้ารอบนั้น* · แก้สเปคทีไรต้องเดินด่าน
--    ทั้งที่ยังไม่มีใครจะส่งกระดาษ · และ Rev ของกระดาษเปลี่ยนตามสเปคที่คนอื่นแก้ทีหลัง
--  มติ 21/09 กลับด้าน: เอกสารถือ **ภาพนิ่งของตัวเอง** (ถ่ายตอนยื่น) ⇒ แก้สเปคในฐานข้อมูล
--  ไม่แตะเอกสารที่ยื่นหรืออนุมัติไปแล้ว และ Rev นับการแก้ **ของเอกสารใบนั้น** เท่านั้น
--
--  ── สภาพฐานจริงตอนรื้อ (ตรวจ 22/09/2569) ─────────────────────────────────
--  product_specs 2 ใบ (ร่างเปล่า Rev.01 ทั้งคู่) · product_spec_revision_items 34 แถว ·
--  product_spec_issues **0 แถว** · ตัวนับ FMSA04 ยังไม่เคยถูกใช้
--  ⇒ รื้อได้โดยไม่ต้องย้ายเอกสาร · ย้ายแค่เนื้อสเปคกับ checklist ผ่าน Rev ล่าสุดของแต่ละใบ
--  🔴 **ด่านข้อ ① กันไว้**: ถ้าวันรันมีแถวใน product_spec_issues แม้แถวเดียว = มีเลขที่เอกสาร
--     ออกไปนอกบริษัทแล้ว ⇒ RAISE ทั้งไฟล์ ห้ามรื้อจนกว่าจะมีแผนย้ายเลขที่นั้น
--
--  ⚠ **รันมือบน Supabase SQL Editor ก่อน deploy** — โค้ดชุดใหม่อ่านตารางใหม่ทั้งหมด
--    deploy ก่อนรัน = หน้าสเปค/หน้า SO/หน้าเอกสาร ตอบ 500 ทั้งเส้น
--  ⚠ รันซ้ำได้: ทุกขั้นเป็น IF [NOT] EXISTS · ขั้นย้ายข้อมูลทำเฉพาะตอนตารางเดิมยังอยู่ ·
--    seed มาตรฐานเอกสารกันด้วย WHERE NOT EXISTS · ทั้งไฟล์อยู่ในทรานแซกชันเดียว
--    ล้มกลางทาง = ไม่มีอะไรเปลี่ยน
-- ============================================================

BEGIN;

-- ── ① ด่าน: รื้อได้เฉพาะตอนยังไม่เคยออกเอกสารจริง ──────────────────────────
--
-- ⚠️ อ่านผ่าน EXECUTE เพราะรันซ้ำรอบสองตารางนี้ถูกถอดไปแล้ว — อ้างชื่อตรง ๆ ใน
--    ก้อน DO จะล้มตอนวางแผนคำสั่ง ทั้งที่ควรผ่านเงียบ ๆ
DO $$
DECLARE
  v_rows bigint := 0;
BEGIN
  IF to_regclass('public.product_spec_issues') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.product_spec_issues' INTO v_rows;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'product_spec_issues_not_empty: % แถว — มีเลขที่เอกสาร FM-SA-04 ออกไปแล้ว ห้ามรื้อโมเดลจนกว่าจะมีแผนย้ายเลขที่', v_rows;
    END IF;
  END IF;
END $$;

-- ── ② สเปคของสินค้า: เนื้อสเปคย้ายมาอยู่ที่แถวสเปคเอง ──────────────────────
--
-- ⚠️ ความยาวเท่า CHECK ของ product_spec_revisions (0364) ทุกช่อง — ข้อความที่เคยบันทึก
--    ผ่านด่านเดิมได้ต้องย้ายมาได้ ไม่งั้นขั้น ③ ล้มทั้งไฟล์
ALTER TABLE public.product_specs
  ADD COLUMN IF NOT EXISTS texture             text,
  ADD COLUMN IF NOT EXISTS "standardPackaging" text,
  ADD COLUMN IF NOT EXISTS "targetGroup"       text,
  ADD COLUMN IF NOT EXISTS "keySellingPoint"   text,
  ADD COLUMN IF NOT EXISTS "pricingTier"       text,
  ADD COLUMN IF NOT EXISTS "productBenefit"    text,
  ADD COLUMN IF NOT EXISTS longevity           text,
  ADD COLUMN IF NOT EXISTS "dosagePerUse"      text,
  ADD COLUMN IF NOT EXISTS certifications      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "updatedBy"         text,
  ADD COLUMN IF NOT EXISTS "updatedByName"     text;

ALTER TABLE public.product_specs DROP CONSTRAINT IF EXISTS product_specs_text_check;
ALTER TABLE public.product_specs
  ADD CONSTRAINT product_specs_text_check CHECK (
    (texture             IS NULL OR length(texture)             <= 200) AND
    ("standardPackaging" IS NULL OR length("standardPackaging") <= 500) AND
    ("targetGroup"       IS NULL OR length("targetGroup")       <= 500) AND
    ("keySellingPoint"   IS NULL OR length("keySellingPoint")   <= 500) AND
    ("pricingTier"       IS NULL OR length("pricingTier")       <= 500) AND
    ("productBenefit"    IS NULL OR length("productBenefit")    <= 500) AND
    (longevity           IS NULL OR length(longevity)           <= 200) AND
    ("dosagePerUse"      IS NULL OR length("dosagePerUse")      <= 200)
  );

ALTER TABLE public.product_specs DROP CONSTRAINT IF EXISTS product_specs_json_check;
ALTER TABLE public.product_specs
  ADD CONSTRAINT product_specs_json_check CHECK (jsonb_typeof(certifications) = 'array');

-- checklist ของสเปค — คอลัมน์และ CHECK ชุดเดียวกับ product_spec_revision_items (0364)
-- แค่เปลี่ยนเจ้าของจาก "ฉบับ" เป็น "สเปค"
CREATE TABLE IF NOT EXISTS public.product_spec_items (
  id                    text PRIMARY KEY,
  "specId"              text NOT NULL REFERENCES public.product_specs(id) ON DELETE CASCADE,
  "sortOrder"           integer NOT NULL DEFAULT 0,
  -- คีย์จากทะเบียนฝั่งโค้ด (lib/sales/productSpecChecklist.js) · แถวที่ผู้ใช้เพิ่มเองเป็น NULL
  "itemKey"             text,
  "itemLabel"           text NOT NULL,
  detail                text,
  "preparedByS"         boolean NOT NULL DEFAULT false,
  "preparedByCustomer"  boolean NOT NULL DEFAULT false,
  note                  text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_spec_items_text_check CHECK (
    length("itemLabel") BETWEEN 1 AND 200 AND
    (detail IS NULL OR length(detail) <= 500) AND
    (note   IS NULL OR length(note)   <= 500)
  )
);

CREATE INDEX IF NOT EXISTS product_spec_items_spec_idx
  ON public.product_spec_items ("specId", "sortOrder");

-- ── ③ ย้ายเนื้อสเปค + checklist จาก Rev ล่าสุดของแต่ละใบ ────────────────────
--
-- ⚠️ ทำเฉพาะตอนตารางเดิมยังอยู่ (รันรอบแรก) — รอบสองตารางถูกถอดไปแล้วที่ ⑤
-- ⚠️ "Rev ล่าสุด" = revNo มากสุดของใบ ไม่ใช่ใบที่อนุมัติ — ฐานจริงมีแต่ร่าง และสิ่งที่
--    คนพิมพ์ไว้ล่าสุดคือสิ่งที่เขาคาดว่าจะเห็นบนจอใหม่
-- ⚠️ ใช้ id เดิมของแถว checklist (`PSI-…`) — ON CONFLICT DO NOTHING ทำให้รันซ้ำแล้วไม่งอกซ้ำ
DO $$
BEGIN
  IF to_regclass('public.product_spec_revisions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $move$
    UPDATE public.product_specs s
       SET texture             = r.texture,
           "standardPackaging" = r."standardPackaging",
           "targetGroup"       = r."targetGroup",
           "keySellingPoint"   = r."keySellingPoint",
           "pricingTier"       = r."pricingTier",
           "productBenefit"    = r."productBenefit",
           longevity           = r.longevity,
           "dosagePerUse"      = r."dosagePerUse",
           certifications      = COALESCE(r.certifications, '[]'::jsonb),
           "updatedAt"         = now()
      FROM (
        SELECT DISTINCT ON ("specId") *
          FROM public.product_spec_revisions
         ORDER BY "specId", "revNo" DESC
      ) r
     WHERE r."specId" = s.id
  $move$;

  IF to_regclass('public.product_spec_revision_items') IS NOT NULL THEN
    EXECUTE $items$
      INSERT INTO public.product_spec_items (
        id, "specId", "sortOrder", "itemKey", "itemLabel", detail,
        "preparedByS", "preparedByCustomer", note, "createdAt"
      )
      SELECT i.id, r."specId", i."sortOrder", i."itemKey", i."itemLabel", i.detail,
             i."preparedByS", i."preparedByCustomer", i.note, i."createdAt"
        FROM public.product_spec_revision_items i
        JOIN (
          SELECT DISTINCT ON ("specId") id, "specId"
            FROM public.product_spec_revisions
           ORDER BY "specId", "revNo" DESC
        ) r ON r.id = i."revisionId"
      ON CONFLICT (id) DO NOTHING
    $items$;
  END IF;

  /* ใบที่ยังไม่มีแถวเอกสารที่ขอได้เลย ได้สี่แถวตั้งต้นของกระดาษ (สถานะยังไม่ตอบ)
     🐞 `productSpecCertSeed` มีอยู่ในโค้ดตั้งแต่ 0364 แต่ **ไม่มีทางไหนเรียก** ⇒ ใบที่สร้างไว้
        ได้ certifications = [] แล้วจอขึ้นตารางเอกสารว่างเปล่า ทั้งที่กระดาษมีสี่แถวเสมอ
     ⚠️ อยู่ในก้อน "รันรอบแรก" โดยตั้งใจ — รันซ้ำทีหลังต้องไม่ฟื้นแถวที่ผู้ใช้ลบทิ้งเอง
     ⚠️ คีย์และคำต้องตรงกับ PRODUCT_SPEC_CERTIFICATIONS ใน productSpecChecklist.js
        (productSpecMigration.test.mjs เทียบให้) · ใบที่มีแถวแล้วไม่แตะ */
  EXECUTE $certs$
    UPDATE public.product_specs
       SET certifications = jsonb_build_array(
             jsonb_build_object('key', 'fda',  'label', 'เอกสารจดแจ้ง อย.', 'status', '', 'note', ''),
             jsonb_build_object('key', 'sds',  'label', 'SDS / MSDS',       'status', '', 'note', ''),
             jsonb_build_object('key', 'coa',  'label', 'COA',              'status', '', 'note', ''),
             jsonb_build_object('key', 'ifra', 'label', 'IFRA',             'status', '', 'note', '')
           )
     WHERE certifications = '[]'::jsonb
  $certs$;
END $$;

-- Rev ย้ายไปอยู่ที่เอกสารแล้ว — สเปคไม่มีเลขฉบับอีกต่อไป
ALTER TABLE public.product_specs DROP COLUMN IF EXISTS "currentRevNo";

COMMENT ON TABLE public.product_specs IS
  'สเปคสินค้า FM-SA-04 — 1 แถวต่อสินค้า ไม่มีเลข ไม่มี Rev ไม่มีด่านอนุมัติ (0370 · มติ 21/09/2569) · เลขที่/Rev/ด่านอยู่ที่ product_spec_documents';
COMMENT ON COLUMN public.product_specs.certifications IS
  'เอกสารที่ขอได้ [{key, label, status: ""|ready|in_progress, note}] — key ว่าง = แถวที่พิมพ์ชื่อเอง (0370)';
COMMENT ON TABLE public.product_spec_items IS
  'Checklist ของสเปคสินค้า (0370 ย้ายมาจาก product_spec_revision_items) — แก้ทับทั้งชุดตอนบันทึกสเปค';

-- ── ④ กระจกบนทะเบียนสินค้า: ซิงก์ตอนบันทึกสเปค ────────────────────────────
--
-- ⚠️ 0364 ซิงก์ตอน "อนุมัติฉบับ" · ไม่มีขั้นอนุมัติของสเปคแล้ว ⇒ ซิงก์ทุกครั้งที่บันทึก
--    (โค้ด: syncProductSpecMirror ใน lib/sales/productSpecStore.js)
COMMENT ON COLUMN public.products.texture IS
  'ลักษณะเนื้อสาร — กระจกของ product_specs.texture ซิงก์ตอนบันทึกสเปค (0370) · ของจริงอยู่ที่ product_specs';
COMMENT ON COLUMN public.products."standardPackaging" IS
  'บรรจุภัณฑ์มาตรฐาน — กระจกของ product_specs."standardPackaging" ซิงก์ตอนบันทึกสเปค (0370) · คนละอันกับ docNote ที่เติมลงเอกสารขาย';

-- ── ⑤ ถอดของเดิม (ตามลำดับที่ของพึ่งกัน) ─────────────────────────────────
--
-- trigger ก่อนฟังก์ชันของมัน · ฟังก์ชันที่อ้างตารางก่อนตาราง · ตารางลูกก่อนตารางแม่
-- (issues → revision_items → revisions เพราะ issues.revisionId เป็น RESTRICT)
DO $$
BEGIN
  IF to_regclass('public.product_spec_revisions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS product_spec_revisions_guard ON public.product_spec_revisions';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.guard_product_spec_revision();
DROP FUNCTION IF EXISTS public.create_product_spec_issue(text, text, text, text, text, integer, jsonb);
DROP TABLE IF EXISTS public.product_spec_issues;
DROP TABLE IF EXISTS public.product_spec_revision_items;
DROP TABLE IF EXISTS public.product_spec_revisions;

-- ── ⑥ เอกสาร: 1 ใบต่อบรรทัด SO ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_spec_documents (
  id                   text PRIMARY KEY,
  -- 🔴 เลขที่ออกไปนอกบริษัทแล้ว — แก้ไม่ได้ ลบไม่ได้ ไม่นำกลับมาใช้ (trigger ⑧)
  "docNo"              text NOT NULL UNIQUE,
  -- ⚠️ RESTRICT ทั้งคู่: ลบสเปค/สินค้าที่มีเอกสารออกไปแล้วไม่ได้ — เอกสารคือหลักฐาน
  --    ของสิ่งที่ตกลงกับลูกค้า ไม่ใช่ข้อมูลประกอบของสินค้า
  "specId"             text NOT NULL REFERENCES public.product_specs(id) ON DELETE RESTRICT,
  "productId"          text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  -- ⚠️ SET NULL และแก้ได้: SO ออก Rev ใหม่ = เอกสารย้ายไปผูกใบใหม่ (เลขที่เดิม Rev+1)
  --    บรรทัดถูกถอด = เหลือเอกสารที่ไม่มีบรรทัด ซึ่งหน้า SO โชว์เป็นแถว "บรรทัดถูกถอด"
  "salesOrderId"       text REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  "salesOrderLineId"   text REFERENCES public.sales_order_lines(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  -- Rev ล่าสุดที่อนุมัติขั้นสุดท้ายแล้ว · NULL = ยังไม่เคยอนุมัติ
  "currentRevNo"       integer CHECK ("currentRevNo" IS NULL OR "currentRevNo" >= 0),
  "voidedAt"           timestamptz,
  "voidedBy"           text,
  "voidedByName"       text,
  "voidReason"         text,
  -- ลูกค้าเซ็นนอกระบบแล้วอัปไฟล์กลับ — เก็บที่ไว้ก่อน ยังไม่มีจอ
  "customerSignedAt"   date,
  "customerSignedName" text,
  "customerSignFiles"  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdBy"          text,
  "createdByName"      text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_spec_documents_doc_no_check CHECK ("docNo" ~ '^FM-SA-04-[0-9]{6}-[0-9]+$'),
  CONSTRAINT product_spec_documents_void_check CHECK (
    status <> 'void' OR ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL)
  ),
  CONSTRAINT product_spec_documents_text_check CHECK (
    ("voidReason"         IS NULL OR length(btrim("voidReason")) BETWEEN 1 AND 500) AND
    ("customerSignedName" IS NULL OR length("customerSignedName") <= 200) AND
    jsonb_typeof("customerSignFiles") = 'array'
  )
);

/* 🔴 บรรทัด SO หนึ่งบรรทัดมีเอกสารที่ยังไม่ void ได้ใบเดียว — กดปุ่มสองแท็บพร้อมกัน
   ต้องไม่ได้สองเลข · ใบที่ void แล้วไม่นับ (ออกใบใหม่ได้ เลขใหม่) */
CREATE UNIQUE INDEX IF NOT EXISTS product_spec_documents_line_uidx
  ON public.product_spec_documents ("salesOrderLineId")
  WHERE "salesOrderLineId" IS NOT NULL AND status <> 'void';

CREATE INDEX IF NOT EXISTS product_spec_documents_order_idx
  ON public.product_spec_documents ("salesOrderId");
CREATE INDEX IF NOT EXISTS product_spec_documents_spec_idx
  ON public.product_spec_documents ("specId");
CREATE INDEX IF NOT EXISTS product_spec_documents_product_idx
  ON public.product_spec_documents ("productId", "createdAt" DESC);

COMMENT ON TABLE public.product_spec_documents IS
  'เอกสารใบสเปคสินค้า FM-SA-04 — 1 ใบต่อบรรทัด SO ออกโดย AC หลัง SO อนุมัติ (0370 · มติ 21/09/2569) · Rev อยู่ที่ product_spec_document_revisions';
COMMENT ON COLUMN public.product_spec_documents."docNo" IS
  'FM-SA-04-DDMMYY-XXX (DDMMYY = วันที่ออก ปี พ.ศ. 2 หลัก · XXX ตัดรอบรายเดือน) — ออกโดย create_product_spec_document เท่านั้น แก้ไม่ได้';
COMMENT ON COLUMN public.product_spec_documents."currentRevNo" IS
  'Rev ล่าสุดที่ผ่านด่านครบสามขั้น · NULL = ยังไม่เคยอนุมัติ';
COMMENT ON COLUMN public.product_spec_documents."salesOrderId" IS
  'SO ปัจจุบันของเอกสาร — ย้ายตาม SO ที่ออก Rev ใหม่ (เลขที่เดิม Rev+1)';

-- ── ⑦ Rev ของเอกสาร ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_spec_document_revisions (
  id                    text PRIMARY KEY,
  "documentId"          text NOT NULL REFERENCES public.product_spec_documents(id) ON DELETE RESTRICT,
  "revNo"               integer NOT NULL CHECK ("revNo" >= 0),
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_ae', 'pending_ae_supervisor', 'approved', 'rejected', 'superseded'
  )),
  -- เหตุผลที่เปิด Rev นี้ — บังคับเมื่อ revNo > 0 (Rev.00 คือการออกครั้งแรก ไม่มีอะไรให้อธิบาย)
  reason                text,
  -- ภาพนิ่งที่ถ่ายตอนยื่น (สเปค + checklist + สินค้า + บรรทัด SO + รูป) · NULL ตอนเป็นร่าง
  snapshot              jsonb,
  -- ตัวชี้รูปในภาพนิ่ง — ไว้กันลบไฟล์ที่กระดาษ Rev นี้อ้างอยู่ (ลบ = ปลดระวางแทน)
  "illustrationIds"     text[] NOT NULL DEFAULT '{}'::text[],
  "submittedAt"         timestamptz,
  "submittedBy"         text,
  "submittedByName"     text,
  "aeApprovedAt"        timestamptz,
  "aeApprovedBy"        text,
  "aeApprovedByName"    text,
  "supApprovedAt"       timestamptz,
  "supApprovedBy"       text,
  "supApprovedByName"   text,
  "rejectedAt"          timestamptz,
  "rejectedBy"          text,
  "rejectedByName"      text,
  "rejectionReason"     text,
  "rejectedStage"       text CHECK ("rejectedStage" IS NULL OR "rejectedStage" IN ('ae', 'ae_supervisor')),
  "supersededAt"        timestamptz,
  -- กระดาษที่เรนเดอร์ตอนอนุมัติขั้นสุดท้าย — เขียนได้ครั้งเดียว (trigger ⑧)
  "frozenHtml"          text,
  "frozenAt"            timestamptz,
  "rendererVersion"     text,
  "createdBy"           text,
  "createdByName"       text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("documentId", "revNo"),
  CONSTRAINT product_spec_document_revisions_reason_check CHECK (
    "revNo" = 0 OR (reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500)
  ),
  CONSTRAINT product_spec_document_revisions_text_check CHECK (
    (reason            IS NULL OR length(reason) <= 500) AND
    ("rejectionReason" IS NULL OR length(btrim("rejectionReason")) BETWEEN 1 AND 500) AND
    ("rendererVersion" IS NULL OR length("rendererVersion") <= 40)
  ),
  CONSTRAINT product_spec_document_revisions_snapshot_check CHECK (
    snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'
  ),
  -- ⚠️ ยื่นแล้วต้องมีภาพนิ่งเสมอ — อนุมัติของที่ไม่มีภาพนิ่ง = ลายเซ็นที่ไม่รู้ว่ารับรองอะไร
  CONSTRAINT product_spec_document_revisions_submitted_check CHECK (
    status IN ('draft', 'rejected')
    OR (snapshot IS NOT NULL AND "submittedAt" IS NOT NULL)
  ),
  CONSTRAINT product_spec_document_revisions_ae_check CHECK (
    status NOT IN ('pending_ae_supervisor', 'approved', 'superseded') OR "aeApprovedAt" IS NOT NULL
  ),
  CONSTRAINT product_spec_document_revisions_sup_check CHECK (
    status NOT IN ('approved', 'superseded') OR "supApprovedAt" IS NOT NULL
  ),
  CONSTRAINT product_spec_document_revisions_rejected_check CHECK (
    status <> 'rejected' OR ("rejectionReason" IS NOT NULL AND "rejectedStage" IS NOT NULL)
  )
);

/* 🔴 เอกสารหนึ่งใบมี Rev ที่ยังไม่จบได้ทีละหนึ่ง — สองคนกด "แก้ไขเอกสาร" พร้อมกันแล้วได้
   Rev ค้างสองใบ = เอกสารใบเดียวแตกเป็นสองทาง · `rejected` นับเป็น "ยังไม่จบ" เพราะมันรอ
   AC แก้แล้วยื่นใหม่ใน Rev เดิม */
CREATE UNIQUE INDEX IF NOT EXISTS product_spec_document_revisions_open_uidx
  ON public.product_spec_document_revisions ("documentId")
  WHERE status IN ('draft', 'pending_ae', 'pending_ae_supervisor', 'rejected');

CREATE INDEX IF NOT EXISTS product_spec_document_revisions_doc_idx
  ON public.product_spec_document_revisions ("documentId", "revNo" DESC);

COMMENT ON TABLE public.product_spec_document_revisions IS
  'Rev ของเอกสาร FM-SA-04 (0370) — draft → pending_ae → pending_ae_supervisor → approved · rejected รอแก้ใน Rev เดิม · superseded เมื่อ Rev ใหม่อนุมัติ';
COMMENT ON COLUMN public.product_spec_document_revisions.snapshot IS
  '{spec, items, product, order, illustrations} ถ่ายตอนยื่นทุกครั้ง · NULL ตอนเป็นร่าง (ร่างแสดงสดจากสเปคและ SO ปัจจุบัน)';
COMMENT ON COLUMN public.product_spec_document_revisions."frozenHtml" IS
  'กระดาษที่เรนเดอร์จากภาพนิ่ง + ผู้ลงนามทั้งสามขั้น ตอน AE Supervisor อนุมัติ — เขียนครั้งเดียว พิมพ์ Rev ที่อนุมัติแล้วใช้ค่านี้เสมอ';
COMMENT ON COLUMN public.product_spec_document_revisions."illustrationIds" IS
  'attachments.id ของรูปในภาพนิ่ง — รูปที่ Rev ที่ไม่ใช่ร่างอ้างอยู่ห้ามลบไฟล์ (ปลดระวางด้วย metadata.retiredAt แทน)';

-- ── ⑧ ยามที่ฐานถือ ──────────────────────────────────────────────────────
--
-- ⚠️ ด่านฝั่ง API มีอยู่แล้ว แต่ยามที่นับได้คือยามที่ฐานถือ — สคริปต์ซ่อมข้อมูลและ
--    backfill รอบหน้าไม่รู้กติกาในโค้ด (บทเรียนเดียวกับ issued_documents_guard 0130)
CREATE OR REPLACE FUNCTION public.guard_product_spec_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product_spec_document_delete_forbidden: % (%) — ใช้ void แทนการลบ', OLD.id, OLD."docNo";
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."docNo" IS DISTINCT FROM OLD."docNo"
     OR NEW."specId" IS DISTINCT FROM OLD."specId"
     OR NEW."productId" IS DISTINCT FROM OLD."productId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'product_spec_document_immutable: %', OLD.id;
  END IF;
  -- void คือปลายทาง — เลขที่ที่ยกเลิกแล้วไม่ฟื้น
  IF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'product_spec_document_void_final: %', OLD.id;
  END IF;
  IF OLD."currentRevNo" IS NOT NULL
     AND (NEW."currentRevNo" IS NULL OR NEW."currentRevNo" < OLD."currentRevNo") THEN
    RAISE EXCEPTION 'product_spec_document_rev_backwards: % (% → %)', OLD.id, OLD."currentRevNo", NEW."currentRevNo";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_spec_documents_guard ON public.product_spec_documents;
CREATE TRIGGER product_spec_documents_guard
BEFORE UPDATE OR DELETE ON public.product_spec_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_product_spec_document();

CREATE OR REPLACE FUNCTION public.guard_product_spec_document_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_doc_status   text;
  v_order_id     text;
  v_order_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product_spec_document_revision_delete_forbidden: %', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."documentId" IS DISTINCT FROM OLD."documentId"
     OR NEW."revNo" IS DISTINCT FROM OLD."revNo"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'product_spec_document_revision_immutable: %', OLD.id;
  END IF;

  /* 🔴 เดินหน้า (ยื่น · AE อนุมัติ · AE Sup อนุมัติ) ได้เฉพาะเอกสารที่ยัง active และ SO ที่ยังอนุมัติอยู่
     ด่านฝั่งแอปตรวจตอนโหลด แต่ UPDATE ของ Rev กรองได้แค่สถานะของ Rev เอง ⇒ เอกสารถูก void
     (ปุ่มยกเลิก · SO ถูกยกเลิก) หรือ SO ถูกย้อนการอนุมัติ **ระหว่างที่คำขออนุมัติกำลังวิ่ง**
     = ได้ Rev ที่อนุมัติแล้ว ตรึงกระดาษแล้ว แจ้งเตือนแล้ว บนเลขที่ที่ยกเลิกไปแล้ว
     ⇒ ล็อกแถวเอกสารกับ SO แบบ FOR SHARE แล้วตรวจที่นี่ ในทรานแซกชันเดียวกับการเปลี่ยนสถานะ
       (void/ย้อนอนุมัติที่กำลังเขียนอยู่ต้องรอกัน แล้วฝั่งที่มาทีหลังเห็นค่าล่าสุดเสมอ)
     ⚠️ เฉพาะทางเดินหน้า — ถอยเป็นร่าง (ดึงกลับ · SO ออก Rev) กับตีกลับต้องทำได้เสมอ
        ตีกลับคือส่งคืน ไม่ใช่รับรอง (SO ที่ถูกย้อนการอนุมัติยิ่งต้องตีกลับได้) */
  IF NEW.status IN ('pending_ae', 'pending_ae_supervisor', 'approved')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT d.status, d."salesOrderId" INTO v_doc_status, v_order_id
      FROM public.product_spec_documents d
     WHERE d.id = NEW."documentId"
       FOR SHARE;
    IF v_doc_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'product_spec_document_not_active: % (%)', NEW."documentId", v_doc_status;
    END IF;
    SELECT o.status INTO v_order_status
      FROM public.sales_orders o
     WHERE o.id = v_order_id
       FOR SHARE;
    IF v_order_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'sales_order_not_approved: % (%)', v_order_id, v_order_status;
    END IF;
  END IF;

  -- กระดาษที่ตรึงแล้วเขียนทับไม่ได้ (NULL → ค่า ได้ครั้งเดียว)
  IF OLD."frozenHtml" IS NOT NULL
     AND (NEW."frozenHtml", NEW."frozenAt", NEW."rendererVersion")
         IS DISTINCT FROM (OLD."frozenHtml", OLD."frozenAt", OLD."rendererVersion") THEN
    RAISE EXCEPTION 'product_spec_document_revision_frozen_html_write_once: %', OLD.id;
  END IF;

  -- เข้า superseded ได้ทางเดียวคือจาก approved
  IF NEW.status = 'superseded' AND OLD.status NOT IN ('approved', 'superseded') THEN
    RAISE EXCEPTION 'product_spec_document_revision_supersede_invalid: % (%)', OLD.id, OLD.status;
  END IF;

  /* 🪤 **`rejected` ไม่อยู่ในลิสต์นี้โดยตั้งใจ** — Rev ที่ถูกตีกลับต้องแก้แล้วยื่นใหม่ได้
     ถ้าตรึงไว้ด้วย เอกสารที่หัวหน้าตีกลับจะกลายเป็นทางตัน */
  IF OLD.status IN ('approved', 'superseded') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'approved' AND NEW.status = 'superseded') THEN
      RAISE EXCEPTION 'product_spec_document_revision_closed: % (% → %)', OLD.id, OLD.status, NEW.status;
    END IF;
    IF (NEW.snapshot, NEW."illustrationIds", NEW.reason,
        NEW."submittedAt", NEW."submittedBy", NEW."submittedByName",
        NEW."aeApprovedAt", NEW."aeApprovedBy", NEW."aeApprovedByName",
        NEW."supApprovedAt", NEW."supApprovedBy", NEW."supApprovedByName",
        NEW."rejectedAt", NEW."rejectedBy", NEW."rejectedByName",
        NEW."rejectionReason", NEW."rejectedStage")
       IS DISTINCT FROM
       (OLD.snapshot, OLD."illustrationIds", OLD.reason,
        OLD."submittedAt", OLD."submittedBy", OLD."submittedByName",
        OLD."aeApprovedAt", OLD."aeApprovedBy", OLD."aeApprovedByName",
        OLD."supApprovedAt", OLD."supApprovedBy", OLD."supApprovedByName",
        OLD."rejectedAt", OLD."rejectedBy", OLD."rejectedByName",
        OLD."rejectionReason", OLD."rejectedStage") THEN
      RAISE EXCEPTION 'product_spec_document_revision_content_frozen: %', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_spec_document_revisions_guard ON public.product_spec_document_revisions;
CREATE TRIGGER product_spec_document_revisions_guard
BEFORE UPDATE OR DELETE ON public.product_spec_document_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_product_spec_document_revision();

-- ── ⑨ ออกเอกสาร: เลขที่ + เอกสาร + Rev.00 ในคำสั่งเดียว ────────────────────
--
-- ⚠️ **ออกเลขพร้อม INSERT ในทรานแซกชันเดียว** — จองเลขก่อนแล้วค่อยเขียนแถวคือท่าที่เคย
--   ทำให้ตัวนับ RQ วิ่งเกินเลขที่ออกจริง 8 เลขบน production (บทเรียน 0243/0271)
--   ด่านข้างล่างล้มเมื่อไร ตัวนับถอยกลับพร้อมกัน ไม่มีเลขหาย
-- ⚠️ ตัวนับ `entity_number_counters` scope 'FMSA04' · month = YYMM ค.ศ. ตัดรอบเดือน
--   ⇒ seed ด้วย LIKE ที่ปิดตาช่องวัน (ตรรกะเดียวกับ 0364 ข้อ ⑦ / 0271) เพราะ prefix
--     เปลี่ยนทุกวัน การ seed ด้วย prefix เต็มจะไม่เจออะไรแล้วเริ่มนับ 1 ใหม่ทับเลขเดิม
-- ⚠️ ด่านของ SO/บรรทัดซ้ำกับฝั่งแอปโดยตั้งใจ — สองแท็บกดพร้อมกัน หรือ SO ถูกย้อน
--   การอนุมัติระหว่างที่โมดัลยืนยันเปิดค้าง ต้องไม่ได้เลขที่ออกไป
CREATE OR REPLACE FUNCTION public.create_product_spec_document(
  p_document_id text,
  p_revision_id text,
  p_spec_id     text,
  p_product_id  text,
  p_month       text,     -- 'YYMM' ค.ศ. ของเดือนที่ออก (คีย์ตัวนับ · businessMonthKey)
  p_prefix      text,     -- 'FM-SA-04-DDMMYY-' (YY = พ.ศ.)
  p_like        text,     -- 'FM-SA-04-__MMYY-%' ปิดตาช่องวัน
  p_width       integer,
  p_payload     jsonb     -- {salesOrderId, salesOrderLineId, createdBy, createdByName}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id  text := NULLIF(p_payload->>'salesOrderId', '');
  v_line_id   text := NULLIF(p_payload->>'salesOrderLineId', '');
  v_by        text := NULLIF(p_payload->>'createdBy', '');
  v_by_name   text := NULLIF(p_payload->>'createdByName', '');
  v_spec      public.product_specs%ROWTYPE;
  v_order     public.sales_orders%ROWTYPE;
  v_line      public.sales_order_lines%ROWTYPE;
  v_existing  text;
  v_seed      integer := 0;
  v_no        integer;
  v_doc_no    text;
  v_doc       public.product_spec_documents%ROWTYPE;
  v_rev       public.product_spec_document_revisions%ROWTYPE;
BEGIN
  IF p_document_id IS NULL OR p_document_id = '' THEN RAISE EXCEPTION 'document_id_required'; END IF;
  IF p_revision_id IS NULL OR p_revision_id = '' THEN RAISE EXCEPTION 'revision_id_required'; END IF;
  IF p_month IS NULL OR p_month !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'document_month_invalid: %', p_month; END IF;
  IF p_prefix IS NULL OR p_prefix !~ '^FM-SA-04-[0-9]{6}-$' THEN RAISE EXCEPTION 'document_prefix_invalid: %', p_prefix; END IF;
  IF p_like IS NULL OR p_like = '' THEN RAISE EXCEPTION 'document_like_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'document_width_invalid'; END IF;
  IF v_order_id IS NULL OR v_line_id IS NULL THEN RAISE EXCEPTION 'sales_order_line_required'; END IF;

  -- ล็อกสเปคก่อน — ลบสเปคระหว่างออกเอกสารต้องรอกัน
  SELECT * INTO v_spec FROM public.product_specs WHERE id = p_spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_spec_not_found: %', p_spec_id; END IF;
  IF v_spec."productId" IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'product_spec_product_mismatch: % ≠ %', v_spec."productId", p_product_id;
  END IF;

  -- SO ต้องอนุมัติแล้ว ณ วินาทีที่ออกเลข (FOR SHARE กันการย้อนอนุมัติแทรกกลาง)
  SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found: %', v_order_id; END IF;
  IF v_order.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'sales_order_not_approved: % (%)', v_order."orderNumber", v_order.status;
  END IF;
  /* 🛑 ใบย้อนหลังเกิดเป็น approved ตั้งแต่วันคีย์ แต่เป็นของที่ส่งไปแล้วในอดีต ไม่มีรอบขาย
     ให้ตกลงสเปค (มติข้อ 21 ของสาย SO ย้อนหลัง) · ด่านฝั่งแอปกันแล้ว ที่นี่กันเลขที่รั่ว */
  IF NOT (v_order.origin = 'pipeline') THEN
    RAISE EXCEPTION 'sales_order_historical: %', v_order."orderNumber";
  END IF;

  SELECT * INTO v_line FROM public.sales_order_lines
   WHERE id = v_line_id AND "salesOrderId" = v_order_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_line_not_found: %', v_line_id; END IF;
  IF v_line."productId" IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'sales_order_line_product_mismatch: %', v_line_id;
  END IF;

  SELECT "docNo" INTO v_existing
    FROM public.product_spec_documents
   WHERE "salesOrderLineId" = v_line_id AND status <> 'void'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'product_spec_document_exists: %', v_existing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.entity_number_counters WHERE scope = 'FMSA04' AND month = p_month
  ) THEN
    SELECT COALESCE(max(substring("docNo" from '([0-9]+)$')::integer), 0)
      INTO v_seed
      FROM public.product_spec_documents
     WHERE "docNo" LIKE p_like
       AND substring("docNo" from '([0-9]+)$') ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('FMSA04', p_month, v_seed + 1)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'product_spec_document_monthly_sequence_exhausted: %', p_month;
  END IF;

  v_doc_no := p_prefix || lpad(v_no::text, p_width, '0');

  INSERT INTO public.product_spec_documents (
    id, "docNo", "specId", "productId", "salesOrderId", "salesOrderLineId",
    status, "createdBy", "createdByName"
  ) VALUES (
    p_document_id, v_doc_no, p_spec_id, p_product_id, v_order_id, v_line_id,
    'active', v_by, v_by_name
  )
  RETURNING * INTO v_doc;

  INSERT INTO public.product_spec_document_revisions (
    id, "documentId", "revNo", status, "createdBy", "createdByName"
  ) VALUES (
    p_revision_id, p_document_id, 0, 'draft', v_by, v_by_name
  )
  RETURNING * INTO v_rev;

  RETURN jsonb_build_object('document', to_jsonb(v_doc), 'revision', to_jsonb(v_rev));
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_spec_document(text, text, text, text, text, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_spec_document(text, text, text, text, text, text, text, integer, jsonb)
  TO service_role;

-- ── ⑨ข checklist ของสเปค: ทับทั้งชุดในทรานแซกชันเดียว ──────────────────────
--
-- 🐞 ทำไมไม่ลบ/เขียนจากแอปสองคำขอ: ระหว่างสองคำขอนั้น AC กดยื่นเอกสารได้ ⇒ ภาพนิ่งได้ checklist
--    สองชุดซ้อนกันแล้วถูกตรึงลงกระดาษที่อนุมัติ · และถ้าขั้นลบล้ม แถวซ้อนค้างจนทุกการบันทึก
--    ถัดไปชนด่าน "แถวซ้ำ" ⇒ ลบ + เขียนในคำสั่งเดียว คนอ่านเห็นชุดเก่าหรือชุดใหม่ชุดใดชุดหนึ่ง
-- ⚠️ ล็อกแถวสเปคก่อน (FOR UPDATE) — สองแท็บบันทึกพร้อมกันต้องต่อคิว ไม่ใช่ลบของกันจนเหลือสองชุด
-- ⚠️ คีย์ของแต่ละแถวต้องตรงกับคอลัมน์ใน jsonb_to_recordset ข้างล่าง — คีย์ที่ไม่ได้ประกาศ
--    ถูกทิ้งเงียบ (productSpecMigration.test.mjs เทียบกับที่ store ส่งให้)
CREATE OR REPLACE FUNCTION public.replace_product_spec_items(
  p_spec_id text,
  p_rows    jsonb     -- [{id, sortOrder, itemKey, itemLabel, detail, preparedByS, preparedByCustomer, note}]
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
    RAISE EXCEPTION 'product_spec_items_rows_invalid';
  END IF;

  PERFORM 1 FROM public.product_specs WHERE id = p_spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_spec_not_found: %', p_spec_id; END IF;

  DELETE FROM public.product_spec_items WHERE "specId" = p_spec_id;

  INSERT INTO public.product_spec_items (
    id, "specId", "sortOrder", "itemKey", "itemLabel", detail,
    "preparedByS", "preparedByCustomer", note
  )
  SELECT r.id, p_spec_id, COALESCE(r."sortOrder", 0), r."itemKey", r."itemLabel", r.detail,
         COALESCE(r."preparedByS", false), COALESCE(r."preparedByCustomer", false), r.note
    FROM jsonb_to_recordset(p_rows) AS r(
      id                   text,
      "sortOrder"          integer,
      "itemKey"            text,
      "itemLabel"          text,
      detail               text,
      "preparedByS"        boolean,
      "preparedByCustomer" boolean,
      note                 text
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_spec_items(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_spec_items(text, jsonb)
  TO service_role;

-- ── ⑩ มาตรฐานเอกสาร productSpec (แบบเดียวกับ 0226) ──────────────────────────
--
-- 🐞 ปัญหาที่แก้: DOCUMENT_STANDARD_KEYS มีคีย์ 'productSpec' ตั้งแต่ #1751 แต่ไม่มีแถว
--    ตั้งต้นใน document_standards ⇒ หน้า ตั้งค่า → มาตรฐานเอกสาร โยน root_missing
--    ตอบ 500 ทั้งหน้า
-- ค่าตรงกับกระดาษจริงและค่าสำรองใน documentBrand.js: FM-SA-04 · Rev.00 · มีผล 08/05/2568
-- ⚠️ **รูปแบบเลขที่ไม่ได้ถูกใช้ออกเลข** — เลขจริงออกจาก create_product_spec_document (⑨)
--    ที่นี่มีไว้ให้ทะเบียนมาตรฐานครบ และต้องผ่าน validateNumberingPattern (lib/documentStandards.js)
--    ซึ่งบังคับ {REVISION} ปิดท้าย + {MM} สำหรับเอกสารตัดรอบรายเดือน · ไม่ผ่าน = คนแก้ร่าง
--    มาตรฐานใบนี้จะบันทึกไม่ได้เลยจนกว่าจะเปลี่ยนรูปแบบเอง
-- ⚠️ ด่านจริงคือ WHERE NOT EXISTS ไม่ใช่การชน id — ฐานที่เคยสร้างร่างผ่าน UI ได้ id เป็น
--    uuid (บทเรียน 0226: แถว published สองแถวทำให้ .maybeSingle() ล้มเงียบ)
INSERT INTO public.document_standards ("documentKey")
VALUES ('productSpec')
ON CONFLICT ("documentKey") DO NOTHING;

INSERT INTO public.document_standard_versions (
  id, "documentKey", "versionNumber", status,
  "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
SELECT
  'document-standard-productSpec-v1', 'productSpec', 1, 'published',
  'เอกสารระบุรายละเอียดผลิตภัณฑ์', 'PRODUCT SPECIFICATION SHEET',
  'FM-SA-04', '00', DATE '2025-05-08', 'teal',
  'FM-SA-04-{DD}{MM}{YY}-{RUNNING:3}-{REVISION}',
  'นำ FM-SA-04 Rev.00 เข้าระบบเอกสารควบคุม (เดิมเป็นค่าสำรองใน documentBrand.js)',
  'migration-0370', 'Migration 0370', 'system',
  'migration-0370', 'Migration 0370', 'system',
  'migration-0370', 'Migration 0370', 'system', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_standard_versions WHERE "documentKey" = 'productSpec'
);

-- ⚠️ อ่าน id ของแถวที่เผยแพร่จริง ไม่ hardcode — ฐานที่ seed ผ่าน UI มาก่อนได้ id อื่น
UPDATE public.document_standards
   SET "publishedVersionId" = (
         SELECT id FROM public.document_standard_versions
          WHERE "documentKey" = 'productSpec' AND status = 'published'
          ORDER BY "versionNumber" DESC LIMIT 1
       ),
       "updatedAt" = now()
 WHERE "documentKey" = 'productSpec'
   AND "publishedVersionId" IS NULL;

-- ── ⑪ RLS + สิทธิ์: เข้าผ่าน service_role เท่านั้น เหมือนตารางอื่นในระบบ ────
ALTER TABLE public.product_spec_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_spec_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_spec_document_revisions  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_spec_items              FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_spec_documents          FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_spec_document_revisions FROM anon, authenticated;

GRANT ALL ON TABLE public.product_spec_items              TO service_role;
GRANT ALL ON TABLE public.product_spec_documents          TO service_role;
GRANT ALL ON TABLE public.product_spec_document_revisions TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ (ถ้าต้อง) ─────────────────────────────────────────────────────
-- ⚠️ ย้อนได้เฉพาะตอนยังไม่มีเอกสาร (product_spec_documents 0 แถว) — มีเลขที่ออกไปแล้ว
--    ห้ามลบ ต้องเขียน migration ย้ายกลับเป็นเรื่องเป็นราว
-- ⚠️ ของเดิม (product_spec_revisions/_revision_items/_issues + ฟังก์ชัน) ต้องสร้างใหม่ด้วย
--    ไฟล์ 0364 + 0369 · เนื้อสเปคย้ายกลับจากคอลัมน์ของ product_specs ด้วยมือ
-- ⚠️ **ห้ามลบแถวมาตรฐานเอกสาร productSpec ที่ ⑩ seed ไว้** — ยาม guard_document_standard_version
--    (0123/0136) RAISE `document_standard_version_delete_forbidden` กับ DELETE แถวที่ไม่ใช่ร่าง
--    (แถวที่ seed เป็น published) ⇒ คำสั่ง DELETE ล้มกลางบล็อก · และไม่ต้องลบด้วย: 0364/0369
--    ใช้คีย์ productSpec ชุดเดียวกัน แถวที่เผยแพร่คือค่าของกระดาษจริง (FM-SA-04 · Rev.00)
-- ⚠️ **ตัวนับ FMSA04 ปล่อยไว้** — ตัวนับว่างไม่มีผลอะไร · ยาม entity_number_counter_guard (0241)
--    ห้ามลบถ้าไม่ปลดล็อกก่อน และถ้ามีเลขที่ออกไปแล้ว การลบตัวนับ = วันหน้าออกเลขซ้ำ
--    (ถ้าจำเป็นจริงและ product_spec_documents มี 0 แถวเท่านั้น: รันในทรานแซกชันเดียวกัน
--     `SET LOCAL app.entity_counter_unlock = 'on';` ก่อน `DELETE FROM public.entity_number_counters
--      WHERE scope = 'FMSA04';` — memory: entity-counter-rewind)
-- DROP TRIGGER IF EXISTS product_spec_document_revisions_guard ON public.product_spec_document_revisions;
-- DROP TRIGGER IF EXISTS product_spec_documents_guard ON public.product_spec_documents;
-- DROP FUNCTION IF EXISTS public.guard_product_spec_document_revision();
-- DROP FUNCTION IF EXISTS public.guard_product_spec_document();
-- DROP FUNCTION IF EXISTS public.create_product_spec_document(text, text, text, text, text, text, text, integer, jsonb);
-- DROP FUNCTION IF EXISTS public.replace_product_spec_items(text, jsonb);
-- DROP TABLE IF EXISTS public.product_spec_document_revisions;
-- DROP TABLE IF EXISTS public.product_spec_documents;
-- DROP TABLE IF EXISTS public.product_spec_items;
-- ALTER TABLE public.product_specs ADD COLUMN IF NOT EXISTS "currentRevNo" integer NOT NULL DEFAULT 0;
