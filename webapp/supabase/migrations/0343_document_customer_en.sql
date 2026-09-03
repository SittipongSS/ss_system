-- ============================================================
--  Migration 0343: ชื่อ/ที่อยู่ลูกค้าภาษาอังกฤษบนใบเสนอราคา–ใบสั่งขาย
--
--  🐞 อาการ: สลับใบเป็นภาษาอังกฤษแล้วป้ายหัวข้อเป็นอังกฤษครบ แต่ **ชื่อลูกค้ากับ
--     ที่อยู่ยังพิมพ์ไทยเสมอ** — ทั้งที่ทะเบียนลูกค้ามีช่องอังกฤษ (`nameEn` ของลูกค้า ·
--     `addressEn` ของที่อยู่) กรอกไว้แล้วตั้งแต่ 0283
--
--  ── เหตุ ────────────────────────────────────────────────────────────────
--  ข้อความอังกฤษ **ถูกยุบทิ้งตั้งแต่ตอนแช่แข็งลงใบ** ไม่ใช่ตอนพิมพ์:
--  `pickDocumentAddresses` (lib/master/addresses.js) ผลิต snapshot ช่องเดียวต่อที่อยู่
--      billingAddress: billing.address || billing.addressEn
--  ⇒ ลูกค้าที่มีทั้งสองภาษาได้ไทยเสมอ · อังกฤษไม่เคยเดินทางมาถึงตาราง `quotations`
--  ⇒ ตอนพิมพ์ เอกสารจึงไม่มีอะไรให้เลือก ต่อให้รู้ว่าใบนี้เป็นภาษาอังกฤษ
--  (ชื่อลูกค้าป่วยแบบเดียวกัน: `customerName` เก็บภาษาเดียวมาตั้งแต่วันแรก)
--
--  ── ทำไมต้องเป็น "คอลัมน์คู่" ไม่ใช่อ่านสดจากทะเบียนตอนพิมพ์ ────────────────
--  ใบเป็น **frozen mirror** ของทะเบียน ณ วันออกใบ (กติกาเดียวกับ customerName เดิม)
--  ⇒ อ่านสดตอนพิมพ์ = ใบเก่าที่พิมพ์ซ้ำวันนี้เปลี่ยนตามทะเบียนที่แก้ไปแล้ว
--    ซึ่งคือสิ่งที่ทั้งระบบสร้างคอลัมน์กระจกขึ้นมาเพื่อกัน (ดู customer-name-mirrors)
--  ⇒ ภาษาอังกฤษต้องถูก **แช่ลงใบตอนบันทึก** เหมือนภาษาไทย จึงต้องมีคอลัมน์ของตัวเอง
--
--  ── ทำไมไม่เขียนทับคอลัมน์เดิม ────────────────────────────────────────────
--  🔴 `customerName` ของใบสั่งขายอยู่ใน **fingerprint การอนุมัติ** — แตะค่าในนั้น
--     เมื่อไร ใบที่อนุมัติแล้วกลายเป็น "แก้หลังอนุมัติ" ทันที และย้อนกลับไม่ได้
--  ⇒ คอลัมน์ไทยสามตัวเดิมต้องอยู่เท่าเดิมทุกตัวอักษร · ของใหม่เป็นช่องแยกล้วน
--  ⚠️ และคอลัมน์ใหม่ทั้งสามตัวนี้ **ไม่เข้า fingerprint** เช่นกัน (แบบเดียวกับที่
--     docLanguage / descriptionEn / docNoteEn เคยทำ) — เพิ่มคีย์ = ใบที่อนุมัติแล้ว
--     ทุกใบบน production เพี้ยนพร้อมกัน
--
--  ── ไม่ backfill ────────────────────────────────────────────────────────
--  · ใบที่อนุมัติแล้วพิมพ์จาก **HTML ที่ตรึงไว้** และมี trigger ห้าม UPDATE ระดับ DB
--    ⇒ เติมคอลัมน์ย้อนหลังก็ไม่มีผลกับกระดาษที่ออกไปแล้ว มีแต่ทำให้ข้อมูลบนใบ
--    ไม่ตรงกับเอกสารที่ลูกค้าถืออยู่
--  · ใบที่ยังแก้ได้: เปิดใบแล้วกดบันทึกครั้งเดียว ค่าจะถูกแช่ลงมาเอง
--  · ช่องอังกฤษว่างไม่ทำให้ใบพัง — จอถอยไปพิมพ์ไทยแล้วเตือนที่หน้าต่างพิมพ์
--    (กติกาเดียวกับชื่อสินค้า) ⇒ ไม่ต้องมีค่าตั้งต้น ปล่อย NULL ได้
--
--  ── ทำไมต้องนิยามฟังก์ชันใหม่ทั้งสามตัว ──────────────────────────────────
--  ทั้ง `save_quotation_content` (whitelist คอลัมน์) · `create_sales_order_draft`
--  และ `revise_approved_sales_order_atomic` (รายการคอลัมน์เขียนตายตัว) เป็นด่านที่
--  **ทิ้งคอลัมน์ใหม่เงียบ ๆ** มาแล้วหลายรอบ (0124 · 0244 · 0340 · 0341 · 0342)
--  ⇒ ไม่แตะทั้งสามตัว = ค่าอังกฤษบันทึกไม่ลง / หายตอนออกใบสั่งขาย / หายตอนออก Rev.
--  ⚠️ ไฟล์นี้คัดนิยามล่าสุดมาทั้งก้อน: save_quotation_content จาก **0342**
--     (ห้ามคัดจาก 0326 หรือเก่ากว่า — งานผู้ติดต่อของ 0342 จะหายทั้งดุ้น) ·
--     create_sales_order_draft จาก **0341** · revise_... จาก **0340**
--     ส่วนอื่นเหมือนต้นฉบับทุกตัวอักษร เพิ่มเฉพาะสามคอลัมน์ใหม่
--
--  ⚠️ **ต้องรันก่อน deploy** — ทางเขียนอยู่ในฟังก์ชันทั้งหมด ไม่รัน = จอบันทึกได้ 200
--     แล้วค่าอังกฤษถูกทิ้งเงียบ ไม่มีอะไรฟ้อง (โรคเดิมของ whitelist)
--
--  idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE ล้วน ไม่แตะแถวเดิม
-- ============================================================

BEGIN;

-- ── ① คอลัมน์คู่ภาษาอังกฤษบนใบ ─────────────────────────────────────────────
-- text ธรรมดา ปล่อย NULL ได้: ว่าง = ไม่มีข้อความอังกฤษให้พิมพ์ ⇒ ถอยไปไทย
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "customerNameEn" text,
  ADD COLUMN IF NOT EXISTS "billingAddressEn" text,
  ADD COLUMN IF NOT EXISTS "shippingAddressEn" text;

-- ใบสั่งขายมีคอลัมน์คู่ของตัวเองด้วย ไม่ได้อ่านผ่านใบเสนอราคาเสมอไป — ใบ Rev. ที่ 2
-- อยู่ห่างจากใบเสนอราคาไปหนึ่งทอด และเส้นก๊อปทั้งสองเส้นถูกล็อกด้วยเทสต์
-- (serviceRoundsCopyPaths.test.mjs) ที่บังคับว่าทุกคอลัมน์ของ sales_orders ต้องถูกก๊อป
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "customerNameEn" text,
  ADD COLUMN IF NOT EXISTS "billingAddressEn" text,
  ADD COLUMN IF NOT EXISTS "shippingAddressEn" text;

-- ── ② ทางเขียนของใบเสนอราคา (คัดจาก 0342 ทั้งก้อน + 3 คอลัมน์ใหม่) ──────────
CREATE OR REPLACE FUNCTION public.save_quotation_content(
  p_quote_id text,
  p_content jsonb,
  p_lines jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_before public.quotations%ROWTYPE;
  v_after public.quotations%ROWTYPE;
  v_line_count integer;
BEGIN
  SELECT * INTO v_before FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_before.status NOT IN ('draft', 'sent', 'rejected') THEN
    RAISE EXCEPTION 'quotation_read_only';
  END IF;
  IF p_content ? 'status' AND p_content->>'status' NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'quotation_status_transition_invalid';
  END IF;

  UPDATE public.quotations q SET
    "quoteDate" = CASE WHEN p_content ? 'quoteDate' THEN (p_content->>'quoteDate')::date ELSE q."quoteDate" END,
    "validUntil" = CASE WHEN p_content ? 'validUntil' THEN NULLIF(p_content->>'validUntil', '')::date ELSE q."validUntil" END,
    "paymentTerms" = CASE WHEN p_content ? 'paymentTerms' THEN NULLIF(p_content->>'paymentTerms', '') ELSE q."paymentTerms" END,
    notes = CASE WHEN p_content ? 'notes' THEN NULLIF(p_content->>'notes', '') ELSE q.notes END,
    status = CASE WHEN p_content ? 'status' THEN p_content->>'status' ELSE q.status END,
    subtotal = CASE WHEN p_content ? 'subtotal' THEN (p_content->>'subtotal')::numeric ELSE q.subtotal END,
    "vatAmount" = CASE WHEN p_content ? 'vatAmount' THEN (p_content->>'vatAmount')::numeric ELSE q."vatAmount" END,
    "totalAmount" = CASE WHEN p_content ? 'totalAmount' THEN (p_content->>'totalAmount')::numeric ELSE q."totalAmount" END,
    "discountType" = CASE WHEN p_content ? 'discountType' THEN NULLIF(p_content->>'discountType', '') ELSE q."discountType" END,
    "discountValue" = CASE WHEN p_content ? 'discountValue' THEN (p_content->>'discountValue')::numeric ELSE q."discountValue" END,
    "discountAmount" = CASE WHEN p_content ? 'discountAmount' THEN (p_content->>'discountAmount')::numeric ELSE q."discountAmount" END,
    "vatRate" = CASE WHEN p_content ? 'vatRate' THEN (p_content->>'vatRate')::numeric ELSE q."vatRate" END,
    "paymentPlan" = CASE WHEN p_content ? 'paymentPlan' THEN p_content->'paymentPlan' ELSE q."paymentPlan" END,
    "docLanguage" = CASE WHEN p_content ? 'docLanguage' THEN COALESCE(NULLIF(p_content->>'docLanguage', ''), q."docLanguage") ELSE q."docLanguage" END,
    -- เอกสารอ้างอิง (0266) — ข้อความอิสระที่คนทำใบพิมพ์เอง ขึ้นในบล็อกอ้างอิงบนเอกสาร
    "referenceNote" = CASE WHEN p_content ? 'referenceNote' THEN NULLIF(p_content->>'referenceNote', '') ELSE q."referenceNote" END,
    -- ที่อยู่บนใบ (0202/0203) — "ใบนี้ใช้ที่อยู่ไหนของลูกค้า" เป็นข้อมูลของเอกสารเอง
    -- ทั้งข้อความ (snapshot ณ วันออกใบ) และ id (ฉบับ Rev. ใช้ดึงสดของที่อยู่ตัวเดิม)
    "billingAddress" = CASE WHEN p_content ? 'billingAddress' THEN NULLIF(p_content->>'billingAddress', '') ELSE q."billingAddress" END,
    "shippingAddress" = CASE WHEN p_content ? 'shippingAddress' THEN NULLIF(p_content->>'shippingAddress', '') ELSE q."shippingAddress" END,
    "branchCode" = CASE WHEN p_content ? 'branchCode' THEN NULLIF(p_content->>'branchCode', '') ELSE q."branchCode" END,
    "billingAddressId" = CASE WHEN p_content ? 'billingAddressId' THEN NULLIF(p_content->>'billingAddressId', '') ELSE q."billingAddressId" END,
    "shippingAddressId" = CASE WHEN p_content ? 'shippingAddressId' THEN NULLIF(p_content->>'shippingAddressId', '') ELSE q."shippingAddressId" END,
    /* คู่ภาษาอังกฤษของชื่อ/ที่อยู่ (0343, มติผู้ใช้ 2026-09-03) — ช่องแยกล้วน
       ⭐ ทำไมต้องแช่ลงใบ ไม่อ่านสดตอนพิมพ์: ใบเป็นกระจกของทะเบียน ณ วันออกใบ
          อ่านสด = ใบเก่าพิมพ์ซ้ำแล้วเปลี่ยนตามทะเบียนที่แก้ไปแล้ว
       🔴 **ห้ามเอาไปทับคอลัมน์ไทยสามตัวข้างบน** — `customerName` อยู่ใน fingerprint
          การอนุมัติของใบสั่งขาย ⇒ ค่าขยับเมื่อไร ใบที่อนุมัติแล้วเพี้ยนทั้งระบบ
       ว่างได้: ไม่มีข้อความอังกฤษ = จอถอยไปพิมพ์ไทยแล้วเตือนที่หน้าต่างพิมพ์ */
    "customerNameEn" = CASE WHEN p_content ? 'customerNameEn' THEN NULLIF(p_content->>'customerNameEn', '') ELSE q."customerNameEn" END,
    "billingAddressEn" = CASE WHEN p_content ? 'billingAddressEn' THEN NULLIF(p_content->>'billingAddressEn', '') ELSE q."billingAddressEn" END,
    "shippingAddressEn" = CASE WHEN p_content ? 'shippingAddressEn' THEN NULLIF(p_content->>'shippingAddressEn', '') ELSE q."shippingAddressEn" END,
    /* ผู้ติดต่อบนใบ (#1467, มติผู้ใช้ 2026-08-27) — เหตุผลเดียวกับที่อยู่ทุกประการ:
       ไม่ใช่การ "แก้ข้อมูลลูกค้า" แต่คือ "ใบนี้ติดต่อใคร" = ข้อมูลของเอกสารเอง
       🐞 ตกหล่นตั้งแต่วันที่ฟีเจอร์ขึ้น ⇒ route เขียน patch.contactName ถูกต้อง แต่ RPC
          เป็น whitelist คอลัมน์ คีย์ที่ไม่มีชื่อในลิสต์ถูกทิ้งเงียบ ไม่ error ⇒ ผู้ใช้เห็น
          "บันทึกแล้ว" แล้วผู้ติดต่อบนเอกสารไม่ขยับ · ทั้งระบบไม่เคยมีใบไหนเปลี่ยน
          ผู้ติดต่อสำเร็จเลยสักใบ (audit_logs changedKeys มี contactName = 0 แถว)
       ⚠️ รอบที่ 3 ของบั๊กคลาสนี้: 0124 metadata · 0244 ที่อยู่ · รอบนี้ผู้ติดต่อ */
    "contactName" = CASE WHEN p_content ? 'contactName' THEN NULLIF(p_content->>'contactName', '') ELSE q."contactName" END,
    "contactPhone" = CASE WHEN p_content ? 'contactPhone' THEN NULLIF(p_content->>'contactPhone', '') ELSE q."contactPhone" END,
    "contactEmail" = CASE WHEN p_content ? 'contactEmail' THEN NULLIF(p_content->>'contactEmail', '') ELSE q."contactEmail" END,
    "approvalStatus" = CASE WHEN p_content ? 'approvalStatus' THEN p_content->>'approvalStatus' ELSE q."approvalStatus" END,
    "approvalReason" = CASE WHEN p_content ? 'approvalReason' THEN NULLIF(p_content->>'approvalReason', '') ELSE q."approvalReason" END,
    "approvalRequestedAt" = CASE WHEN p_content ? 'approvalRequestedAt' THEN NULLIF(p_content->>'approvalRequestedAt', '')::timestamptz ELSE q."approvalRequestedAt" END,
    "approvalRequestedBy" = CASE WHEN p_content ? 'approvalRequestedBy' THEN NULLIF(p_content->>'approvalRequestedBy', '') ELSE q."approvalRequestedBy" END,
    "approvalRequestedByName" = CASE WHEN p_content ? 'approvalRequestedByName' THEN NULLIF(p_content->>'approvalRequestedByName', '') ELSE q."approvalRequestedByName" END,
    "approvalFingerprint" = CASE WHEN p_content ? 'approvalFingerprint' THEN NULLIF(p_content->>'approvalFingerprint', '') ELSE q."approvalFingerprint" END,
    "approvedAt" = CASE WHEN p_content ? 'approvedAt' THEN NULLIF(p_content->>'approvedAt', '')::timestamptz ELSE q."approvedAt" END,
    "approvedBy" = CASE WHEN p_content ? 'approvedBy' THEN NULLIF(p_content->>'approvedBy', '') ELSE q."approvedBy" END,
    "approvedByName" = CASE WHEN p_content ? 'approvedByName' THEN NULLIF(p_content->>'approvedByName', '') ELSE q."approvedByName" END,
    metadata = CASE WHEN p_content ? 'metadata' THEN p_content->'metadata' ELSE q.metadata END,
    "updatedAt" = COALESCE(NULLIF(p_content->>'updatedAt', '')::timestamptz, now())
  WHERE q.id = p_quote_id
  RETURNING q.* INTO v_after;

  IF p_lines IS NOT NULL THEN
    DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;
    INSERT INTO public.quotation_lines (
      id, "quotationId", "productId", "fgCode", description, qty, "unitPrice",
      "unit", "discountType", "discountValue", "discountAmount", "lineTotal", source,
      "sortOrder", metadata, "serviceRounds"
    )
    SELECT
      x.id, p_quote_id, x."productId", x."fgCode", x.description, x.qty,
      x."unitPrice", COALESCE(NULLIF(x."unit", ''), 'ชิ้น'), x."discountType",
      x."discountValue", x."discountAmount",
      x."lineTotal", COALESCE(x.source, 'manual'), COALESCE(x."sortOrder", 0),
      COALESCE(x.metadata, '{}'::jsonb), x."serviceRounds"
    FROM jsonb_to_recordset(p_lines) AS x(
      id text, "productId" text, "fgCode" text, description text, qty numeric,
      "unitPrice" numeric, "unit" text, "discountType" text, "discountValue" numeric,
      "discountAmount" numeric, "lineTotal" numeric, source text,
      "sortOrder" integer, metadata jsonb, "serviceRounds" integer
    );
  END IF;

  -- ยอดรวม 0 ไม่บล็อกอีกต่อไป (มติ 2026-07-18) — accept ยังบังคับ > 0 ที่ RPC ของมันเอง
  IF v_after.status = 'sent' THEN
    SELECT count(*) INTO v_line_count FROM public.quotation_lines
    WHERE "quotationId" = p_quote_id;
    IF v_line_count = 0 THEN RAISE EXCEPTION 'quotation_lines_required'; END IF;
    IF v_after."approvalStatus" NOT IN ('not_required', 'approved') THEN
      RAISE EXCEPTION 'quotation_approval_required';
    END IF;
    IF v_after."approvalStatus" = 'approved' AND v_after."approvalFingerprint" IS NULL THEN
      RAISE EXCEPTION 'quotation_approval_stale';
    END IF;
  END IF;

  RETURN to_jsonb(v_after);
END;
$$;

-- 🪤 revoke ยาว ๆ กว่าต้นฉบับ 0342 หนึ่งท่อน: 0336 กวาด anon/authenticated ออกทั้ง
--    schema แล้ว และเขียนไว้เองว่าสิทธิ์ "กลับมาเปิดใหม่ทุกครั้งที่มีคน DROP+CREATE"
--    ⇒ เขียนชื่อทั้งสามให้ครบตรงนี้ ปลอดภัยกว่าพึ่งว่า CREATE OR REPLACE เก็บ ACL ให้
REVOKE ALL ON FUNCTION public.save_quotation_content(text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) TO service_role;

-- ── ③ ทอด QT → SO (คัดจาก 0341 ทั้งก้อน + 3 คอลัมน์ใหม่ทั้งสองฝั่ง) ─────────
CREATE OR REPLACE FUNCTION public.create_sales_order_draft(
  p_quote_id text,
  p_order_id text,
  p_actor_id text,
  p_actor_name text,
  p_overrides jsonb DEFAULT '{}'::jsonb
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
  v_year text;
  v_seed integer := 0;
  v_pattern text;
  v_running_width integer;
  v_running_no integer;
  v_order_number text;
  v_overrides jsonb := COALESCE(p_overrides, '{}'::jsonb);
  v_confirm_type text := NULLIF(v_overrides->>'confirmDocType', '');
  v_confirm_no text := NULLIF(btrim(COALESCE(v_overrides->>'confirmDocNo', '')), '');
  v_confirm_date date := NULLIF(v_overrides->>'confirmDocDate', '')::date;
  v_confirm_files jsonb := COALESCE(v_overrides->'confirmAttachments', '[]'::jsonb);
  v_reference_doc text := NULLIF(btrim(COALESCE(v_overrides->>'referenceDoc', '')), '');
  v_notes text := NULLIF(v_overrides->>'notes', '');
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_won'; END IF;
  -- นับเฉพาะ SO ที่ยังมีชีวิต (0246)
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
  IF v_confirm_type IS NOT NULL AND v_confirm_type NOT IN ('payment_slip','po','order_confirmation') THEN
    RAISE EXCEPTION 'sales_order_confirm_type_invalid';
  END IF;
  IF jsonb_typeof(v_confirm_files) <> 'array' THEN
    RAISE EXCEPTION 'sales_order_confirm_files_invalid';
  END IF;

  v_now := timezone('Asia/Bangkok', now());
  -- ⭐ คีย์ถังนับ = **ปี** (0328) · เดือนยังอยู่ในตัวเลขผ่าน v_pattern ข้างล่าง
  v_year := to_char(v_now, 'YY');

  -- รูปแบบจากมาตรฐานที่เผยแพร่ (มี unique partial index กันไว้ว่ามีได้ชนิดละใบเดียว)
  -- ไม่มี/ว่าง → รูปแบบเดิมของระบบ · ห้ามออกเลขไม่ได้เพราะตารางตั้งค่าไม่พร้อม
  SELECT NULLIF(btrim(v."numberingPattern"), '') INTO v_pattern
  FROM public.document_standard_versions v
  WHERE v."documentKey" = 'salesOrder' AND v.status = 'published';
  v_pattern := COALESCE(v_pattern, 'SO-{YY}{MM}{RUNNING:4}-{REVISION}');

  -- ความกว้างเลขรันตามรูปแบบจริง — ด่าน "เลขเต็มรอบ" ต้องขยับตามด้วย ไม่ใช่ 9999 ตายตัว
  v_running_width := COALESCE((substring(v_pattern from '\{RUNNING:(\d)\}'))::integer, 4);

  -- แถวของปีนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ QT/0241)
  -- ปีใหม่ปกติจะไม่มีแถวยุคเดือนของปีนั้น ⇒ ได้ 0 แล้วเริ่ม 0001 ตามที่ควรเป็น
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_number_counters WHERE month = v_year) THEN
    SELECT COALESCE(max("lastNo"), 0) INTO v_seed
    FROM public.sales_order_number_counters
    WHERE month LIKE v_year || '%' AND length(month) = 4;
  END IF;

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > power(10, v_running_width)::integer - 1 THEN
    RAISE EXCEPTION 'sales_order_yearly_sequence_exhausted';
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
    "referenceDoc", "confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments",
    -- ── เติม 2026-09-02 (0341) — ตกหล่นมาตั้งแต่ 0295 เพิ่มคอลัมน์ ──────────
    "docLanguage",
    -- ── เติม 2026-09-03 (0343) — คู่ภาษาอังกฤษของชื่อ/ที่อยู่ ────────────────
    "customerNameEn", "billingAddressEn", "shippingAddressEn",
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    p_order_id, v_order_number, v_quote.id, v_quote."dealId", d."projectId",
    v_quote."customerId", v_quote."customerName", 'draft',
    -- ⭐ วันที่บนหัวใบ = วันที่ออกใบ (มติ 2026-08-18: "วันที่ SO = วันที่สร้างใบ แก้ไม่ได้")
    v_now::date,
    -- กำหนดชำระอยู่ที่งวดเท่านั้น — ช่องบนหัวใบเหลือไว้ให้ใบเก่าที่มีค่าอยู่แล้ว
    v_quote."wonPaymentDueDate",
    v_quote.subtotal, COALESCE(v_quote."discountAmount", 0),
    v_quote."vatAmount", v_quote."totalAmount",
    GREATEST(0, v_quote."totalAmount" - COALESCE(v_quote."vatAmount", 0)),
    COALESCE(v_notes, v_quote.notes),
    -- เลขที่เอกสารยืนยันเป็นค่าตั้งต้นของเอกสารอ้างอิง (ผู้กรอกทับได้จากฟอร์ม)
    COALESCE(v_reference_doc, v_confirm_no, v_quote."wonDocNo"),
    v_confirm_type, v_confirm_no, v_confirm_date, v_confirm_files,
    /* ภาษาเอกสารสืบจากใบเสนอราคาที่ใบนี้ออกต่อมา — กติกาเดียวกับที่ 0295 ใช้ backfill
       ⚠️ คอลัมน์เป็น NOT NULL และ CHECK ยอมแค่ 'th'/'en' ⇒ กันค่าแปลก/NULL ไว้ที่นี่
          ไม่ใช่ปล่อยให้ CHECK ตีกลับตอนสร้างใบ (คนกดจะเจอ error ที่อ่านไม่ออก) */
    CASE WHEN v_quote."docLanguage" IN ('th', 'en') THEN v_quote."docLanguage" ELSE 'th' END,
    /* ข้อความอังกฤษก๊อปดิบ ๆ ไม่ต้อง COALESCE — ว่างคือ "ไม่มีอังกฤษให้พิมพ์" ซึ่งมี
       ความหมายของมันเอง (จอถอยไปไทยแล้วเตือน) · ยัดไทยลงช่องอังกฤษแทน = ทั้งระบบ
       แยกไม่ออกอีกต่อไปว่าใบไหนมีอังกฤษจริง */
    v_quote."customerNameEn", v_quote."billingAddressEn", v_quote."shippingAddressEn",
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
    'SOL-' || md5(p_order_id || ':' || ql.id), p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_draft(text, text, text, text, jsonb) TO service_role;

-- ── ④ ทอด SO → SO Rev. (คัดจาก 0340 ทั้งก้อน + 3 คอลัมน์ใหม่ทั้งสองฝั่ง) ────
CREATE OR REPLACE FUNCTION public.revise_approved_sales_order_atomic(
  p_order_id text,
  p_revision_id text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source public.sales_orders%ROWTYPE;
  v_revision public.sales_orders%ROWTYPE;
  v_reason text;
  v_next_revision integer;
  v_order_number text;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_revision_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'sales_order_revision_forbidden';
  END IF;

  SELECT * INTO v_source
  FROM public.sales_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;

  IF v_source.status <> 'approval_revoked' THEN
    RAISE EXCEPTION 'sales_order_revision_state_invalid';
  END IF;
  IF v_source."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;
  IF v_source."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'sales_order_revision_exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders WHERE "salesOrderId" = v_source.id
  ) THEN
    RAISE EXCEPTION 'sales_order_revision_filing_exists';
  END IF;

  -- เหตุผลกรอกไว้แล้วตอนยกเลิกอนุมัติ; ส่งมาใหม่ก็ได้ (ทับของเดิม)
  v_reason := btrim(COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), v_source."revisionReason", ''));
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT COALESCE(max("revisionNo"), 0) + 1
    INTO v_next_revision
  FROM public.sales_orders
  WHERE "baseNumber" = v_source."baseNumber";

  v_order_number := v_source."baseNumber"
    || COALESCE(v_source."revisionSeparator", '-')
    || v_next_revision::text;

  INSERT INTO public.sales_orders (
    id, "orderNumber", "baseNumber", "revisionNo", "revisionSeparator",
    "revisedFromId", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt",
    "approvalMode",
    -- ── เติม 2026-09-02 (0340) — เจ็ดคอลัมน์ที่ตกหล่นสะสมมาตั้งแต่ 0166 ──────
    "serviceContractId", "docLanguage", "referenceDoc",
    "confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments",
    -- ── เติม 2026-09-03 (0343) — คู่ภาษาอังกฤษของชื่อ/ที่อยู่ ────────────────
    -- ไม่ก๊อป = Rev. ของใบภาษาอังกฤษถอยไปพิมพ์ไทยเงียบ ๆ ทั้งที่ต้นฉบับพิมพ์อังกฤษได้
    "customerNameEn", "billingAddressEn", "shippingAddressEn"
  ) VALUES (
    p_revision_id, v_order_number, v_source."baseNumber", v_next_revision,
    v_source."revisionSeparator", v_source.id, v_source."quotationId",
    v_source."dealId", v_source."projectId", v_source."customerId",
    v_source."customerName", 'draft',
    timezone('Asia/Bangkok', v_now)::date, v_source."paymentDueDate",
    v_source.subtotal, v_source."discountAmount", v_source."vatAmount",
    v_source."totalAmount", v_source."actualAmount", v_source.notes,
    COALESCE(v_source.metadata, '{}'::jsonb) || jsonb_build_object(
      'revisedFrom', v_source."orderNumber",
      'revisionReason', v_reason
    ),
    p_actor_id, NULLIF(btrim(COALESCE(p_actor_name, '')), ''), v_now, v_now,
    'standard',
    v_source."serviceContractId", v_source."docLanguage", v_source."referenceDoc",
    v_source."confirmDocType", v_source."confirmDocNo", v_source."confirmDocDate",
    COALESCE(v_source."confirmAttachments", '[]'::jsonb),
    v_source."customerNameEn", v_source."billingAddressEn", v_source."shippingAddressEn"
  )
  RETURNING * INTO v_revision;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", unit, "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata, "createdAt", "serviceRounds"
  )
  SELECT
    'SOL-' || md5(p_revision_id || ':' || line.id),
    v_revision.id, line."quotationLineId", line."productId", line."fgCode",
    line.description, line.qty, line."unitPrice", line.unit,
    line."discountType", line."discountValue", line."discountAmount",
    line."lineTotal", line."sortOrder", line.metadata, v_now, line."serviceRounds"
  FROM public.sales_order_lines line
  WHERE line."salesOrderId" = v_source.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sales_order_revision_lines_required';
  END IF;

  UPDATE public.sales_orders
  SET
    status = 'revised',
    "supersededById" = v_revision.id,
    "revisionReason" = v_reason,
    "revisedAt" = COALESCE(v_source."revisedAt", v_now),
    "revisedBy" = COALESCE(v_source."revisedBy", p_actor_id),
    "revisedByName" = COALESCE(v_source."revisedByName", NULLIF(btrim(COALESCE(p_actor_name, '')), '')),
    "updatedAt" = v_now
  WHERE id = v_source.id
  RETURNING * INTO v_source;

  -- ทั้ง approval_revoked และ revised หลุดจาก sync_sales_order_actual อยู่แล้ว
  -- (นับเฉพาะ 'approved') ยอด Actual จึงไม่ขยับซ้ำที่ขั้นนี้
  RETURN jsonb_build_object(
    'source', to_jsonb(v_source),
    'revision', to_jsonb(v_revision)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revise_approved_sales_order_atomic(
  text, text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_approved_sales_order_atomic(
  text, text, timestamptz, text, text, text, text
) TO service_role;

COMMIT;

-- คอลัมน์ใหม่ต้องเข้า schema cache ของ PostgREST ทันที ไม่งั้นทางที่ยิงผ่าน REST
-- (สร้างใบ · ออก Rev.) ตอบ PGRST204 "column not found" จนกว่าจะรีสตาร์ต
NOTIFY pgrst, 'reload schema';
