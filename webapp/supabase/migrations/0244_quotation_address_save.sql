-- ============================================================
--  Migration 0244: ที่อยู่บนใบเสนอราคาบันทึกได้จริง (มติผู้ใช้ 2026-08-12)
--
--  🐞 **บั๊กเงียบที่ยืนยันบนฐานจริงแล้ว** — เปลี่ยน "ที่อยู่ออกบิล / ที่อยู่จัดส่ง" บนใบร่าง
--  แล้วกดบันทึก หน้าจอขึ้นว่าบันทึกแล้ว **แต่ที่อยู่ไม่เปลี่ยน** ไม่มี error ให้เห็นเลย
--
--  วัดจริงบน prod (QT-26080044-0 · 2026-08-12) ยิงสามคีย์ในคำสั่งเดียว:
--      docLanguage       th → en                  ✓ เปลี่ยน
--      billingAddressId  ADR-563b… → ADR-probe…   ✗ ไม่ขยับ
--      billingAddress    "99/9 เซ็นทรัล…" → …     ✗ ไม่ขยับ
--  คำสั่งเดียวกัน ไม่มี error คีย์หนึ่งผ่าน อีกสองคีย์หายไปเฉย ๆ
--
--  ⭐ สาเหตุ: UPDATE ของ `save_quotation_content` **whitelist คอลัมน์** คีย์ที่ไม่มีชื่อ
--  ในลิสต์ถูกทิ้งเงียบ · mig 0202/0203 เพิ่มคอลัมน์ที่อยู่ไว้แต่ไม่เคยขยาย RPC ตัวนี้
--  (อาการเดียวกับ mig 0124 ที่ `metadata` เคยหายไปทั้งก้อนด้วยเหตุผลเดียวกัน)
--
--  ⚠️ **กระทบใบปัจจุบัน ไม่ใช่แค่ฉบับ Rev.** — หายทั้ง id และตัวข้อความที่อยู่ ⇒ ใบที่
--  พิมพ์ออกไปใช้ที่อยู่เดิมที่ตั้งไว้ตอนสร้างใบ · ทางเดียวที่ตั้งที่อยู่ได้ทุกวันนี้คือ
--  ตอน **สร้างใบใหม่** หรือ **ออก Rev.** (สองเส้นนั้น insert ตรงเข้าตาราง ไม่ผ่าน RPC)
--
--  ขอบเขต ณ วันแก้: ลูกค้า 12 จาก 121 รายมีมากกว่าหนึ่งที่อยู่ · ใบเสนอราคา 8 ใบเป็นของ
--  ลูกค้ากลุ่มนั้น = กลุ่มที่ดรอปดาวน์เลือกที่อยู่มีความหมายจริง
--
--  ⚠️ **ไม่ backfill** — เดาไม่ได้ว่าใบเก่า "ตั้งใจ" เลือกที่อยู่ไหน (เลือกแล้วมันไม่เคย
--  บันทึกอยู่ดี) · หลัง deploy ให้ AE เปิดดู 8 ใบนั้นว่าที่อยู่บนใบถูกไหม
--  ใบที่ยัง draft/sent แก้ได้เลย · ใบที่อนุมัติแล้วต้องออก Rev.
--
--  🛑 **ต้องรันก่อน deploy** — ใบนี้เป็น CREATE OR REPLACE ของ RPC ล้วน ไม่เพิ่มคอลัมน์
--  ⚠️ ปลอดภัยกับโค้ดเวอร์ชันปัจจุบัน: โค้ดเก่าส่งคีย์ที่อยู่มาอยู่แล้ว (แค่ถูกทิ้ง)
--  รันแล้วมันจะเริ่มถูกบันทึกทันที ซึ่งคือพฤติกรรมที่ทุกคนเข้าใจว่าเป็นอยู่แล้ว
--  ⇒ **รันล่วงหน้าได้ทันที ไม่ต้องรอ deploy โค้ด**
--
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

-- คัดลอกนิยามล่าสุด (0238) มาทั้งก้อน + เพิ่มที่อยู่ 5 บรรทัด
-- guard, ลำดับบรรทัดอื่น และส่วน quotation_lines คงเดิมทุกตัวอักษร
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
    -- ที่อยู่บนใบ (0202/0203) — "ใบนี้ใช้ที่อยู่ไหนของลูกค้า" เป็นข้อมูลของเอกสารเอง
    -- ทั้งข้อความ (snapshot ณ วันออกใบ) และ id (ฉบับ Rev. ใช้ดึงสดของที่อยู่ตัวเดิม)
    "billingAddress" = CASE WHEN p_content ? 'billingAddress' THEN NULLIF(p_content->>'billingAddress', '') ELSE q."billingAddress" END,
    "shippingAddress" = CASE WHEN p_content ? 'shippingAddress' THEN NULLIF(p_content->>'shippingAddress', '') ELSE q."shippingAddress" END,
    "branchCode" = CASE WHEN p_content ? 'branchCode' THEN NULLIF(p_content->>'branchCode', '') ELSE q."branchCode" END,
    "billingAddressId" = CASE WHEN p_content ? 'billingAddressId' THEN NULLIF(p_content->>'billingAddressId', '') ELSE q."billingAddressId" END,
    "shippingAddressId" = CASE WHEN p_content ? 'shippingAddressId' THEN NULLIF(p_content->>'shippingAddressId', '') ELSE q."shippingAddressId" END,
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
      "sortOrder", metadata
    )
    SELECT
      x.id, p_quote_id, x."productId", x."fgCode", x.description, x.qty,
      x."unitPrice", COALESCE(NULLIF(x."unit", ''), 'ชิ้น'), x."discountType",
      x."discountValue", x."discountAmount",
      x."lineTotal", COALESCE(x.source, 'manual'), COALESCE(x."sortOrder", 0),
      COALESCE(x.metadata, '{}'::jsonb)
    FROM jsonb_to_recordset(p_lines) AS x(
      id text, "productId" text, "fgCode" text, description text, qty numeric,
      "unitPrice" numeric, "unit" text, "discountType" text, "discountValue" numeric,
      "discountAmount" numeric, "lineTotal" numeric, source text,
      "sortOrder" integer, metadata jsonb
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
NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
-- ต้องได้ t ทั้งห้าช่อง:
-- SELECT prosrc LIKE '%"billingAddress" = CASE%'   AS billing,
--        prosrc LIKE '%"shippingAddress" = CASE%'  AS shipping,
--        prosrc LIKE '%"branchCode" = CASE%'       AS branch,
--        prosrc LIKE '%"billingAddressId" = CASE%' AS billing_id,
--        prosrc LIKE '%"shippingAddressId" = CASE%' AS shipping_id
--   FROM pg_proc WHERE proname = 'save_quotation_content';
-- และของเดิมต้องไม่หาย:
-- SELECT prosrc LIKE '%docLanguage%' AND prosrc LIKE '%metadata = CASE%' FROM pg_proc
--   WHERE proname = 'save_quotation_content';   -- t

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- รันไฟล์ 0238 ซ้ำ (เป็น CREATE OR REPLACE) จะได้นิยามก่อนหน้ากลับมา
