-- ============================================================
--  Migration 0278: ทะเบียนสัญญาของฝ่ายขาย (มติผู้ใช้ 2026-08-20)
--
--  📌 **ไฟล์นี้เคยชื่อ 0277 และถูกรันบน production ไปแล้วเมื่อ 2026-08-20** — ตอน rebase
--     เจอว่าเลข 0277 ถูก #1348/#1350 (packaging_by_main_category) ใช้ไปก่อนบน main
--     จึงย้ายมาเป็น 0278 · เลขในชื่อไฟล์เป็นเรื่องลำดับใน git เท่านั้น ไม่มีตารางทะเบียน
--     migration ในฐาน ⇒ **ไม่ต้องรันซ้ำ** (รันซ้ำก็ไม่พัง — CREATE ... IF NOT EXISTS ล้วน)
--
--  คำสั่งตั้งต้น: *"จะทำระบบสั่ง เพิ่มใน บริหารงานขาย โดยจะมี สัญญาออกแบบกลิ่น
--  สัญญาจ้างผลิต และ สัญญาบริการ · สัญญาออกได้หลังจากใบเสนอราคาอนุมัติ ·
--  อยากให้ง่าย และ ติดตามได้"*
--
--  ⭐ **ด่านออกสัญญา = ใบเสนอราคาผ่านการอนุมัติภายใน** (`quotations.approvalStatus`
--     = 'approved') ไม่ใช่ลูกค้าตอบรับ — ด่านจริงอยู่ในโค้ด (lib/sales/contracts.js)
--     ไม่ใช่ CHECK ของฐาน เพราะต้องอ่านใบเสนอราคาข้ามตารางและต้องบอกเหตุผลเป็นภาษาคน
--
--  ⭐ **สถานะมีสี่ค่า จบ** — ร่าง → รอลงนาม → ลงนามแล้ว · แยกสาย ยกเลิก
--     ขั้นย่อย ("ส่งไปรษณีย์แล้ว") เก็บเป็นวันที่/หมายเหตุ ไม่ใช่สถานะเพิ่ม
--
--  ⚠️ **การลงนามอยู่นอกระบบ** (มติผู้ใช้) — พิมพ์ไปเซ็นแล้วอัปโหลดไฟล์กลับ
--     ⇒ ไม่มีคอลัมน์ลายเซ็นดิจิทัลของลูกค้า มีแต่ไฟล์แนบ + วันที่ลงนาม
--
--  ⚠️ **เนื้อสัญญาที่ออกไปแล้วตรึงเป็น HTML บนแถว** (`issuedHtml`) — เอกสารที่ลูกค้า
--     เซ็นต้องพิมพ์ซ้ำได้เหมือนเดิมทุกตัวอักษร แม้แม่แบบหรือทะเบียนลูกค้าจะเปลี่ยน
--     ภายหลัง · แก้เนื้อหลังออกเลขไม่ได้ ต้องยกเลิกแล้วออกใบใหม่ (กติกาเดียวกับที่
--     ใบเสนอราคาใช้ issued_documents แต่ไม่ต้องมีสายฉบับแก้ไข สัญญาไม่มี Rev.)
--
--  🛑 **ต้องรันก่อน deploy โค้ด** — ตาราง + RPC ใหม่ล้วน โค้ดเดิมไม่รู้จัก รันล่วงหน้าได้
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_contracts (
  id             text PRIMARY KEY,
  -- เลขที่สัญญา CT-YYMMXXXX — ว่างได้ตอนเป็นร่าง เลขออกตอนกด "ออกสัญญา" เท่านั้น
  -- (แบบเดียวกับใบขอราคาผลิต mig 0242: ใบมีตัวตนก่อนมีเลข)
  "contractNo"   text UNIQUE,
  kind           text NOT NULL
    CHECK (kind IN ('scent_design', 'manufacturing', 'service')),
  status         text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_signature', 'signed', 'cancelled')),

  -- RESTRICT ไม่ใช่ CASCADE: สัญญาที่ลูกค้าเซ็นแล้วเป็นเอกสารผูกพันตามกฎหมาย
  -- ลบดีลทิ้งแล้วสัญญาหายตามเงียบ ๆ ไม่ได้ · ตัวลบดีลต้องเจอด่านนี้แล้วบอกคนกด
  "dealId"       text NOT NULL REFERENCES public.sales_deals(id) ON DELETE RESTRICT,
  -- ใบเสนอราคาที่เป็นด่านผ่าน (ต้องอนุมัติแล้ว) — SET NULL ไม่ได้เพราะเป็นหลักฐาน
  -- ว่าใบนี้ออกโดยชอบ ⇒ RESTRICT เหมือนกัน
  "quotationId"  text REFERENCES public.quotations(id) ON DELETE RESTRICT,
  "customerId"   text REFERENCES public.customers(id) ON DELETE SET NULL,
  -- ชื่อ/ที่อยู่ ณ วันที่ทำสัญญา = หลักฐานบนกระดาษ ห้ามซิงก์ตามทะเบียนภายหลัง
  -- (กติกาเดียวกับ customerName บนใบเสนอราคา — ดู docs person-name copies)
  "customerName" text,

  "contractDate" date NOT NULL DEFAULT CURRENT_DATE,
  -- ค่าที่กรอกลงแม่แบบ (คู่สัญญา ราคา จำนวนครั้งแก้ไข ระยะเวลา ฯลฯ)
  fields         jsonb NOT NULL DEFAULT '{}'::jsonb,
  "templateKey"     text,
  "templateVersion" text,

  -- ── ฉบับที่ออกจริง (ตรึง) ───────────────────────────────────────────
  "issuedAt"     timestamptz,
  "issuedBy"     text,
  "issuedByName" text,
  "issuedHtml"   text,

  -- ── การลงนาม (นอกระบบ) ─────────────────────────────────────────────
  "signedAt"       timestamptz,
  "signedDate"     date,
  -- ⚠️ **uuid ไม่ใช่ text** — `attachments.id` เป็น uuid (mig 0028) ต่างจาก id ของ
  -- ตารางสายขายที่เป็น text ทั้งหมด · ประกาศผิดชนิด = สร้าง FK ไม่ผ่านตั้งแต่รัน migration
  "signedFileId"   uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  "effectiveDate"  date,
  "expiryDate"     date,

  "cancelledAt"     timestamptz,
  "cancelReason"    text,

  -- ⚠️ ทีมเจ้าของ = **สำเนาจากดีลตอนสร้าง** ไม่ใช่ join สด — ด่านรายแถวของสายขาย
  -- (`inScope`) อ่านคู่ `team` + `ownerId` จากตัวแถวเอง และไฟล์แนบของสัญญาก็ใช้ด่านนี้
  team           text,
  "ownerId"      text,
  "ownerName"    text,
  notes          text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy"     text,
  "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),

  -- เลขที่กับเวลาที่ออกมาคู่กันเสมอ · ส่วน "เนื้อที่ตรึง" ตามมาทีหลังได้
  --
  -- ⭐ ตรึงเนื้อเป็นขั้นที่สองโดยเจตนา (แพตเทิร์นเดียวกับ issued_documents ของใบเสนอ
  --    ราคา): หัวเอกสารต้องพิมพ์เลขที่จริง ⇒ เรนเดอร์ก่อนออกเลขไม่ได้ · ปล่อยให้เนื้อ
  --    ว่างชั่วคราวแล้วเรนเดอร์ซ้ำได้ (idempotent) ดีกว่าเขียนเลขปลอมลงกระดาษ
  -- ⚠️ ห้ามกลับด้าน — มีเนื้อแต่ไม่มีเลข = กระดาษไม่มีเลขที่อ้างอิง
  CONSTRAINT sales_contracts_issued_complete CHECK (
    ("contractNo" IS NULL AND "issuedAt" IS NULL AND "issuedHtml" IS NULL)
    OR ("contractNo" IS NOT NULL AND "issuedAt" IS NOT NULL)
  ),
  -- ร่างยังไม่มีเลข · ใบที่พ้นร่างแล้วต้องออกเลขไปแล้ว (ยกเลิกร่างก็ยังไม่มีเลขได้)
  CONSTRAINT sales_contracts_status_number CHECK (
    status = 'draft' OR status = 'cancelled' OR "contractNo" IS NOT NULL
  ),
  CONSTRAINT sales_contracts_signed_needs_date CHECK (
    status <> 'signed' OR "signedDate" IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS sales_contracts_deal_idx
  ON public.sales_contracts ("dealId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS sales_contracts_status_idx
  ON public.sales_contracts (status);
CREATE INDEX IF NOT EXISTS sales_contracts_customer_idx
  ON public.sales_contracts ("customerId");

ALTER TABLE public.sales_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_contracts FROM anon, authenticated;
GRANT ALL ON TABLE public.sales_contracts TO service_role;

-- ── ออกเลขที่สัญญา + ตรึงเนื้อในคำสั่งเดียว ────────────────────────────────
--
-- ⚠️ บทเรียน mig 0242: ห้ามจองเลขแล้วค่อย UPDATE แยก — UPDATE ล้มเมื่อไรเลขหายถาวร
--    และกดซ้ำจะกินเลขใหม่อีกใบ ⇒ ล็อกแถว อ่านเลขเดิม ออกเลข อัปเดต ในทรานแซกชันเดียว
-- ⚠️ ฟังก์ชันไม่รู้จักรูปแบบเลข — prefix/ความกว้างมาจากมาตรฐานเอกสารที่เผยแพร่
--    (lib/documentStandards.js) ที่เดียวที่รู้จัก token
CREATE OR REPLACE FUNCTION public.issue_sales_contract(
  p_id     text,
  p_month  text,
  p_prefix text,
  p_width  integer,
  p_patch  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no      integer;
  v_seed    integer := 0;
  v_number  text;
  v_status  text;
  v_sets    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'contract_id_required'; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'contract_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'contract_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'contract_width_invalid'; END IF;

  -- ล็อกแถวก่อนอ่าน — สองคนกดออกสัญญาพร้อมกันต้องไม่ได้คนละเลขบนใบเดียวกัน
  SELECT "contractNo", status INTO v_number, v_status
  FROM public.sales_contracts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found: %', p_id; END IF;
  IF v_number IS NOT NULL AND v_number <> '' THEN RAISE EXCEPTION 'contract_already_issued: %', v_number; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'contract_not_draft: %', v_status; END IF;

  -- แถวเคาน์เตอร์ของเดือนนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกา 0241/0242)
  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'CT' AND month = p_month) THEN
    SELECT COALESCE(max(substring("contractNo" from length(p_prefix) + 1 for p_width)::integer), 0)
    INTO v_seed
    FROM public.sales_contracts
    WHERE "contractNo" LIKE p_prefix || '%'
      AND substring("contractNo" from length(p_prefix) + 1 for p_width) ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('CT', p_month, v_seed + 1)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'contract_monthly_sequence_exhausted: %', p_month;
  END IF;

  v_number := p_prefix || lpad(v_no::text, p_width, '0');
  v_payload := COALESCE(p_patch, '{}'::jsonb) || jsonb_build_object(
    'contractNo', v_number,
    'status', 'awaiting_signature',
    'issuedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_sets := public.master_row_assignments('sales_contracts', v_payload, 'src');
  IF v_sets IS NULL THEN RAISE EXCEPTION 'contract_patch_empty'; END IF;

  EXECUTE format(
    'UPDATE public.sales_contracts t SET %s FROM jsonb_populate_record(NULL::public.sales_contracts, $1) src'
    || ' WHERE t.id = $2 RETURNING to_jsonb(t)',
    v_sets
  ) USING v_payload, p_id INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_sales_contract(text, text, text, integer, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_sales_contract(text, text, text, integer, jsonb) TO service_role;

COMMIT;
