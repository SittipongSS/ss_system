-- ============================================================
--  Migration 0267: ใบเสนอราคาใส่ "เอกสารอ้างอิง" ได้ (มติผู้ใช้ 2026-08-17)
--
--  📌 **ใบนี้เคยเป็นเลข 0266 และถูกรันบนฐานจริงด้วยเลขนั้นไปแล้ว (2026-08-18)** —
--  เลื่อนเป็น 0267 เพราะ #1313 (0266_personal_task_waiting_chain) merge เข้า main
--  ก่อน และ `check:migrations` ห้ามเลขซ้ำ · **ตัว SQL ไม่เปลี่ยนแม้แต่ตัวอักษรเดียว**
--  ⇒ ฐานที่รัน 0266 ไปแล้วไม่ต้องทำอะไรอีก (เลขไฟล์เป็นป้ายฝั่งรีโป ฐานไม่ได้เก็บไว้)
--
--  บล็อกอ้างอิงบนเอกสารทุกแถวเป็นค่า derive ทั้งหมด (เลขที่โครงการ · โครงการ ·
--  ประเภท · ผู้เสนอราคา · โทร) — ไม่มีที่ให้คนทำใบพิมพ์เลขเอกสารที่ใบนี้อ้างถึง
--  เช่น "อ้างถึง PO-1234 ลว. 5 ส.ค. 69" ซึ่งลูกค้าใช้จับคู่เอกสารฝั่งตัวเอง
--
--  ขอบเขต (มติผู้ใช้): **ข้อความอิสระช่องเดียว ไม่ผูกกับเอกสารจริงในระบบ** —
--  ไม่มีตัวเลือกค้นหา ไม่มี FK ไม่ตรวจว่าเลขที่พิมพ์มามีจริง
--
--  ⚠️ **สองส่วนในใบเดียว ต้องรันทั้งคู่** — เพิ่มคอลัมน์อย่างเดียวไม่พอ:
--  UPDATE ของ `save_quotation_content` whitelist ชื่อคอลัมน์ คีย์ที่ไม่มีในลิสต์
--  **ถูกทิ้งเงียบ ไม่มี error** (บทเรียน mig 0124 = metadata หายทั้งก้อน และ
--  mig 0244 = ที่อยู่บนใบไม่เคยบันทึกเลยตั้งแต่ 0202/0203) ⇒ ถ้ารันแต่ท่อนแรก
--  ผู้ใช้จะกรอกได้ กดบันทึกแล้วขึ้นว่าสำเร็จ แต่ค่าไม่เคยลง
--
--  ⛔ **ห้ามเอา referenceNote ไปใส่ `quotationApprovalContent`** (fingerprint การ
--  อนุมัติ) — เหตุผลเดียวกับ docLanguage: ค่านั้นถูกตรึงไว้ในคอลัมน์
--  `approvalFingerprint` ของใบทุกใบบนฐานจริงแล้ว เพิ่มคีย์เข้าไป = ค่าที่คำนวณสด
--  ไม่ตรงกับที่ตรึงไว้ **ทุกใบที่อนุมัติแล้ว** ⇒ ปิด Won ไม่ได้ทั้งระบบ
--  และไม่จำเป็นเลย: ด่านหัว PATCH ยอมให้แก้เฉพาะใบที่ยังไม่ยื่น (not_submitted)
--  ⇒ แก้หลังอนุมัติเป็นไปไม่ได้อยู่แล้ว · ฝั่งโค้ดนับช่องนี้เป็น "เนื้อหาเอกสาร"
--  (contentChanged) ⇒ แก้แล้วต้องยื่นอนุมัติใหม่ เหมือนที่อยู่บนใบ
--
--  ใบเก่า = null ⇒ ไม่มีแถวนี้บนเอกสาร (ไม่ใช่แถวว่าง) ไม่ต้อง backfill
--
--  🛑 **ต้องรันก่อน deploy** — โค้ดใหม่ส่งคีย์ `referenceNote` มาด้วย ถ้ายังไม่มี
--  คอลัมน์ ตัว UPDATE จะพังทั้งคำสั่ง = บันทึกใบไม่ได้เลย
--  ⚠️ ปลอดภัยกับโค้ดเวอร์ชันปัจจุบัน: โค้ดเก่าไม่เคยส่งคีย์นี้ คอลัมน์คงเป็น null
--  ⇒ รันล่วงหน้าได้ทันที ไม่ต้องรอ deploy
--
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

alter table public.quotations
  add column if not exists "referenceNote" text;

-- คัดลอกนิยามล่าสุด (0244) มาทั้งก้อน + เพิ่ม referenceNote 1 บรรทัด
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
    -- เอกสารอ้างอิง (0266) — ข้อความอิสระที่คนทำใบพิมพ์เอง ขึ้นในบล็อกอ้างอิงบนเอกสาร
    "referenceNote" = CASE WHEN p_content ? 'referenceNote' THEN NULLIF(p_content->>'referenceNote', '') ELSE q."referenceNote" END,
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
-- 1) คอลัมน์เกิดแล้ว:
--    select column_name from information_schema.columns
--     where table_name = 'quotations' and column_name = 'referenceNote';
-- 2) RPC บันทึกค่าจริง (ใช้ใบร่างของตัวเอง):
--    select public.save_quotation_content('<QT id>', '{"referenceNote":"อ้างถึง PO-TEST"}'::jsonb);
--    select "referenceNote" from public.quotations where id = '<QT id>';
--    -- คืนค่าว่าง = RPC ยังเป็นนิยามเก่า (ท่อนที่สองยังไม่ได้รัน)
