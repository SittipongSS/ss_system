-- ============================================================
--  Migration 0246: เลขที่ PO บนหลักฐานปิด Won → ใบสั่งขายดึงเป็น "เอกสารอ้างอิง"
--  (มติผู้ใช้ 2026-08-13)
--
--  ⭐ คำสั่งตั้งต้น: *"won ด้วย PO ขอเพิ่มให้กรอกเลขที่ PO ด้วย เพราะ SO จะได้ดึง
--  ข้อมูลเอกสารอ้างอิงมาได้"*
--
--  ของเดิม: หลักฐานปิด Won เก็บ **ประเภท + วันที่ + ไฟล์** แต่ไม่เก็บ *เลขที่เอกสาร*
--  ⇒ เลข PO อยู่แค่ในรูปที่แนบ ค้นไม่ได้ และช่อง "เอกสารอ้างอิง" ของใบสั่งขาย
--  (mig 0235 · ค้นได้ + ขึ้นเป็นคอลัมน์ในตาราง) ต้องให้ AE พิมพ์ซ้ำเองทุกใบ
--
--  ⚠️ **บังคับเฉพาะ `po`** — สลิปโอนเงินไม่มีเลขที่เอกสารที่มีความหมาย ส่วน
--  "เอกสารยืนยันการสั่งซื้อ" กรอกได้แต่ไม่บังคับ เพราะของจริงบางเจ้าเป็นอีเมลยืนยัน
--  ที่ไม่มีเลขที่ · ด่านอยู่ทั้งฝั่ง route (validateWonEvidence) และในฟังก์ชันนี้
--  (กันยิงตรงเข้ามา) — รูปเดียวกับด่านอื่นในฟังก์ชันเดิม
--
--  ⚠️ **ไม่ backfill** — ใบเก่าที่ปิด Won ไปแล้วไม่มีเลขเก็บไว้ เดาจากรูปแนบไม่ได้
--  ใบสั่งขายเก่าที่อยากได้เลขอ้างอิงยังพิมพ์เองในช่อง "เอกสารอ้างอิง" ได้เหมือนเดิม
--
--  ⚠️ ใบสั่งขายที่สร้างหลังใบนี้เท่านั้นที่ได้ referenceDoc อัตโนมัติ · ค่าที่ดึงมาเป็น
--  **ค่าตั้งต้น** AE ยังแก้ทับได้ (ช่องนั้นแก้ได้อยู่แล้วตอนใบยังเป็นร่าง)
--
--  🛑 ลำดับ deploy: รันใบนี้ได้ล่วงหน้า — คอลัมน์ใหม่เป็น NULL ได้ และโค้ดเก่าที่ยัง
--  ไม่ส่ง docNo มาจะโดนด่าน `po` ปฏิเสธ ⇒ **ต้อง deploy โค้ดพร้อมกันหรือก่อนหน้า**
--  ถ้ารันใบนี้ก่อนแล้วโค้ดเก่ายังอยู่ การปิด Won ด้วย PO จะล้มจนกว่าโค้ดใหม่จะขึ้น
--
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "wonDocNo" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_won_doc_no_len'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_won_doc_no_len
      CHECK ("wonDocNo" IS NULL OR length("wonDocNo") BETWEEN 1 AND 100);
  END IF;
END $$;

COMMENT ON COLUMN public.quotations."wonDocNo" IS
  'เลขที่เอกสารหลักฐานปิด Won (PO/เอกสารยืนยันสั่งซื้อ) — ใบสั่งขายดึงไปเป็น referenceDoc';

-- ── คัดนิยามล่าสุด (0196) มาทั้งก้อน + เพิ่ม 3 จุด: อ่าน docNo · ด่าน po · เขียนคอลัมน์
CREATE OR REPLACE FUNCTION public.accept_quotation_atomic(
  p_quote_id text,
  p_current_fingerprint text,
  p_actor_id text,
  p_actor_name text,
  p_history_id text,
  p_forecast_id text,
  p_evidence jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_accepted public.quotations%ROWTYPE;
  v_updated_deal public.sales_deals%ROWTYPE;
  v_won_value numeric;
  v_now timestamptz := now();
  v_doc_type text := p_evidence->>'docType';
  v_doc_date date := NULLIF(p_evidence->>'docDate', '')::date;
  v_due_date date := NULLIF(p_evidence->>'paymentDueDate', '')::date;
  v_files jsonb := COALESCE(p_evidence->'attachments', '[]'::jsonb);
  v_doc_no text := NULLIF(btrim(COALESCE(p_evidence->>'docNo', '')), '');
  v_won_month text;
BEGIN
  -- หลักฐานบังคับ (validate ซ้ำชั้น DB — route ตรวจก่อนแล้วแต่กันยิงตรง)
  IF v_doc_type IS NULL OR v_doc_type NOT IN ('payment_slip','po','order_confirmation') THEN
    RAISE EXCEPTION 'quotation_evidence_type_invalid';
  END IF;
  IF v_doc_date IS NULL THEN RAISE EXCEPTION 'quotation_evidence_date_required'; END IF;
  -- ⭐ ปิด Won ด้วย PO ต้องมีเลขที่ใบสั่งซื้อ (มติผู้ใช้ 2026-08-13) — ใบสั่งขายดึงไปเป็น
  -- "เอกสารอ้างอิง" ให้อัตโนมัติ · ชนิดอื่นกรอกได้แต่ไม่บังคับ
  IF v_doc_type = 'po' AND v_doc_no IS NULL THEN
    RAISE EXCEPTION 'quotation_evidence_doc_no_required';
  END IF;
  IF jsonb_typeof(v_files) <> 'array' OR jsonb_array_length(v_files) < 1 THEN
    RAISE EXCEPTION 'quotation_evidence_file_required';
  END IF;
  -- เอกสารที่ไม่ใช่การชำระเงิน (PO/ยืนยันสั่งซื้อ) ต้องมีกำหนดชำระ
  IF v_doc_type <> 'payment_slip' AND v_due_date IS NULL THEN
    RAISE EXCEPTION 'quotation_payment_due_required';
  END IF;

  v_won_month := to_char(v_doc_date, 'YYYY-MM');

  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status IN ('accepted', 'cancelled', 'rejected', 'revised', 'closed') THEN
    RAISE EXCEPTION 'quotation_not_acceptable';
  END IF;
  -- (ถอด quotation_total_zero — มติ 2026-08-03: ยอด 0 ปิด Won ได้)
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;
  IF v_quote."approvalStatus" NOT IN ('not_required', 'approved') THEN
    RAISE EXCEPTION 'quotation_approval_required';
  END IF;
  IF v_quote."approvalStatus" = 'approved' AND
     (v_quote."approvalFingerprint" IS NULL OR v_quote."approvalFingerprint" <> p_current_fingerprint) THEN
    RAISE EXCEPTION 'quotation_approval_stale';
  END IF;

  SELECT * INTO v_deal FROM public.sales_deals
  WHERE id = v_quote."dealId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;
  IF v_deal."projectId" IS NULL THEN RAISE EXCEPTION 'deal_project_required'; END IF;
  IF v_deal.stage IN ('lost', 'won', 'in_project') THEN RAISE EXCEPTION 'deal_closed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotations
    WHERE "dealId" = v_deal.id AND status = 'accepted' AND id <> v_quote.id
  ) THEN RAISE EXCEPTION 'deal_already_has_accepted_quotation'; END IF;

  -- ยอด Won = ยอดก่อน VAT; GREATEST กัน VAT ที่มากกว่ายอดรวม (ข้อมูลเพี้ยน) ไม่ให้ติดลบ
  -- 0 ผ่านได้ (ถอด quotation_won_value_zero — มติ 2026-08-03)
  v_won_value := GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0));

  UPDATE public.quotations SET
    status = 'accepted', "acceptedAt" = v_now,
    "acceptedBy" = COALESCE(p_actor_name, p_actor_id),
    "wonDocType" = v_doc_type,
    "wonDocDate" = v_doc_date,
    "wonPaymentDueDate" = v_due_date,
    "wonAttachments" = v_files,
    "wonDocNo" = v_doc_no,
    "updatedAt" = v_now
  WHERE id = v_quote.id RETURNING * INTO v_accepted;

  -- ใบอื่นในดีลที่ยังเปิดอยู่ → ปิด (ล็อกแก้/ลบ/Revise — ดีลจบด้วยใบที่ accept แล้ว)
  -- revised/cancelled เป็น read-only อยู่แล้ว คงสถานะเดิมไว้เป็นประวัติ
  UPDATE public.quotations SET status = 'closed', "updatedAt" = v_now
  WHERE "dealId" = v_deal.id AND id <> v_quote.id
    AND status IN ('draft', 'sent', 'rejected');

  UPDATE public.sales_deals d SET
    stage = 'won',
    "wonValue" = v_won_value,
    probability = 100,
    "confirmedAt" = v_now,
    metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'acceptedQuotationId', v_quote.id,
      'acceptedQuoteNumber', v_quote."quoteNumber",
      'acceptedQuoteAt', v_now,
      'wonSource', 'quotation',
      'wonAt', v_now,
      'wonMonth', v_won_month,
      'wonValueExVat', v_won_value,
      'wonDocType', v_doc_type,
      'wonDocDate', to_char(v_doc_date, 'YYYY-MM-DD')
    ),
    "updatedAt" = v_now
  WHERE d.id = v_deal.id RETURNING d.* INTO v_updated_deal;

  IF v_deal.stage IS DISTINCT FROM v_updated_deal.stage THEN
    INSERT INTO public.sales_deal_stage_history (
      id, "dealId", "fromStage", "toStage", "changedBy", "changedByName"
    ) VALUES (
      p_history_id, v_deal.id, v_deal.stage, v_updated_deal.stage, p_actor_id, p_actor_name
    );
  END IF;

  INSERT INTO public.sales_deal_forecasts (
    id, "dealId", "forecastMonth", "forecastAmount", probability, source,
    "createdBy", "createdByName"
  ) VALUES (
    p_forecast_id, v_deal.id, v_won_month, v_won_value, 100, 'quotation',
    p_actor_id, p_actor_name
  );

  RETURN jsonb_build_object('quotation', to_jsonb(v_accepted), 'deal', to_jsonb(v_updated_deal));
END;
$$;

-- ── คัดนิยามล่าสุด (0169) มาทั้งก้อน + เพิ่ม referenceDoc ลงใน INSERT
CREATE OR REPLACE FUNCTION public.create_sales_order_draft(
  p_quote_id text,
  p_order_id text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
  v_now timestamp;
  v_month text;
  v_pattern text;
  v_running_width integer;
  v_running_no integer;
  v_order_number text;
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_won'; END IF;
  -- ⬇ จุดเดียวที่ต่างจาก 0155: นับเฉพาะ SO ที่ยังมีชีวิต (ดูหัวไฟล์)
  IF EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE "quotationId" = v_quote.id
      AND status <> 'cancelled'
      AND "supersededById" IS NULL
  ) THEN
    RAISE EXCEPTION 'sales_order_already_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;

  v_now := timezone('Asia/Bangkok', now());
  v_month := to_char(v_now, 'YYMM');

  -- รูปแบบจากมาตรฐานที่เผยแพร่ (มี unique partial index กันไว้ว่ามีได้ชนิดละใบเดียว)
  -- ไม่มี/ว่าง → รูปแบบเดิมของระบบ · ห้ามออกเลขไม่ได้เพราะตารางตั้งค่าไม่พร้อม
  SELECT NULLIF(btrim(v."numberingPattern"), '') INTO v_pattern
  FROM public.document_standard_versions v
  WHERE v."documentKey" = 'salesOrder' AND v.status = 'published';
  v_pattern := COALESCE(v_pattern, 'SO-{YY}{MM}{RUNNING:4}-{REVISION}');

  -- ความกว้างเลขรันตามรูปแบบจริง — ด่าน "เลขเต็มเดือน" ต้องขยับตามด้วย ไม่ใช่ 9999 ตายตัว
  v_running_width := COALESCE((substring(v_pattern from '\{RUNNING:(\d)\}'))::integer, 4);

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_month, 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > power(10, v_running_width)::integer - 1 THEN
    RAISE EXCEPTION 'sales_order_monthly_sequence_exhausted';
  END IF;

  v_order_number := v_pattern;
  v_order_number := replace(v_order_number, '{YYYY}', to_char(v_now, 'YYYY'));
  v_order_number := replace(v_order_number, '{YY}', to_char(v_now, 'YY'));
  v_order_number := replace(v_order_number, '{MM}', to_char(v_now, 'MM'));
  v_order_number := replace(v_order_number, '{DD}', to_char(v_now, 'DD'));
  v_order_number := replace(v_order_number, '{RUNNING:3}', lpad(v_running_no::text, 3, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:4}', lpad(v_running_no::text, 4, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:5}', lpad(v_running_no::text, 5, '0'));
  v_order_number := replace(v_order_number, '{REVISION}', '0');

  INSERT INTO public.sales_orders (
    id, "orderNumber", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    "referenceDoc", metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    p_order_id, v_order_number, v_quote.id, v_quote."dealId", d."projectId",
    v_quote."customerId", v_quote."customerName", 'draft',
    COALESCE(v_quote."wonDocDate", v_quote."acceptedAt"::date, v_quote."quoteDate"),
    v_quote."wonPaymentDueDate", v_quote.subtotal, COALESCE(v_quote."discountAmount", 0),
    v_quote."vatAmount", v_quote."totalAmount",
    GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0)), v_quote.notes,
    v_quote."wonDocNo",
    jsonb_build_object('source', 'quotation', 'quoteNumber', v_quote."quoteNumber"),
    p_actor_id, p_actor_name, now(), now()
  FROM public.sales_deals d WHERE d.id = v_quote."dealId"
  RETURNING * INTO v_order;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", "unit", "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata
  )
  SELECT
    -- id บรรทัดต้องผูกกับ **SO ใบนี้** ไม่ใช่กับบรรทัดของใบเสนอราคา: เดิมเป็น 'SOL-' || ql.id
    -- ซึ่งซ้ำทันทีเมื่อ QT ใบเดิมออก SO ใบที่สอง (บรรทัดของใบที่ยกเลิกยังอยู่ในตาราง) →
    -- ปลดด่านข้างบนอย่างเดียวจะย้ายทางตันไปเป็น duplicate key แทน. ใช้สูตรเดียวกับ
    -- เส้นทางออก Rev. (0161/0166) เพื่อให้ทั้งระบบออก id บรรทัด SO แบบเดียวกัน
    -- ไม่มีโค้ดไหนอ่านความหมายจาก id นี้ (ความสัมพันธ์อยู่ที่คอลัมน์ "quotationLineId")
    'SOL-' || md5(p_order_id || ':' || ql.id), p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text) TO service_role;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
