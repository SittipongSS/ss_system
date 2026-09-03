-- 0342 · ผู้ติดต่อบนใบเสนอราคาบันทึกได้จริง (🐞 IS: "แก้ผู้ติดต่อแล้วเอกสารไม่แก้ตาม")
--
-- อาการ: เปิดใบร่าง เลือกผู้ติดต่อคนใหม่จากทะเบียน กดบันทึก ระบบตอบ 200 ขึ้น "บันทึกแล้ว"
-- แต่คอลัมน์ไม่ขยับ และเอกสารยังพิมพ์ผู้ติดต่อคนเดิม (quotationMasterTemplate อ่าน
-- quote."contactName" ตรง ๆ) · ออก Rev. ใหม่ก็ไม่ช่วย เพราะ Rev. สืบทอดค่าเดิมมา
--
-- เหตุ: ทางเขียนของ PATCH มีทางเดียวคือ RPC save_quotation_content ซึ่งเป็น **whitelist
-- คอลัมน์** — คีย์ที่ไม่มีชื่ออยู่ในลิสต์ถูกทิ้งเงียบ ไม่ error · contact* ไม่เคยถูกใส่
-- ไว้เลยตั้งแต่ฟีเจอร์ "เลือกผู้ติดต่อบนใบ" ขึ้น (2026-08-27)
--
-- ⚠️ ไฟล์นี้คัดนิยามล่าสุดมาจาก 0326 ทั้งก้อน (ห้ามคัดจาก 0244/0267 — งานของ 0267
--    referenceNote และของ 0326 serviceRounds จะหายไปทั้งดุ้น) เพิ่มเฉพาะ 3 คอลัมน์
--    contact ที่บล็อก UPDATE public.quotations · ส่วนอื่นเหมือน 0326 ทุกตัวอักษร
--
-- ไม่ backfill: เดาไม่ได้ว่าใบเก่าตั้งใจใช้ผู้ติดต่อคนไหน · ใบที่ยังแก้ได้ให้เลือกใหม่
-- แล้วบันทึก · ใบที่อนุมัติแล้วพิมพ์จาก HTML ที่ตรึงไว้ ต้องออก Rev. ตามกติกาเดิม

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

REVOKE ALL ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_content(text, jsonb, jsonb) TO service_role;
