-- ============================================================
--  Migration 0238: ใบเสนอราคาจำได้ว่า "ใบนี้พิมพ์ภาษาอะไร" (IS-26080005 · มติผู้ใช้ 2026-08-12)
--
--  ⭐ ที่มา: AE แจ้งผ่านระบบแจ้งปัญหา 2026-08-10 — "ต้องการใบเสนอราคาที่เป็นภาษาอังกฤษ
--  สำหรับส่งให้ลูกค้าต่างชาติ" · ทุกวันนี้ป้ายบนเอกสารเป็นไทยตายตัว ลูกค้าสิงคโปร์/
--  มาเลเซียอ่าน "ยอดรวมทั้งสิ้น" ไม่ออก
--
--  ⚠️ **เก็บภาษาไว้กับ "ใบ" ไม่ใช่กับ "คนกด"** — ถ้าให้เลือกภาษาตอนกดพิมพ์แทน ใบเดิม
--  จะพิมพ์ซ้ำได้คนละภาษากับที่ส่งลูกค้าไปแล้ว ขึ้นกับว่าใครกดวันไหน ⇒ เอกสารฉบับ
--  เดียวกันมีสองหน้าตา ซึ่งขัดกับ ADR 0011 (issued document ต้องไม่เปลี่ยน)
--
--  ⚠️ **NOT NULL DEFAULT 'th'** — ใบเก่าทุกใบได้ 'th' ทันทีจาก default ซึ่งตรงกับ
--  พฤติกรรมเดิมเป๊ะ ไม่ต้อง backfill และไม่มีใบไหนอ่านค่าเป็น null แล้วต้องเดา
--
--  ⚠️ **ระดับ 1 เท่านั้น** — ป้ายบนเอกสารเป็นสองภาษา ส่วน *ข้อมูล* (ชื่อลูกค้า ที่อยู่
--  ชื่อกลิ่น/สูตร เงื่อนไขชำระ) ยังเป็นค่าเดียวที่คนกรอก ไม่มีคอลัมน์ En คู่
--  เหตุผล: ลูกค้าต่างชาติกรอกชื่อ-ที่อยู่เป็นอังกฤษอยู่แล้วโดยธรรมชาติ (บริษัท
--  สิงคโปร์ไม่มีชื่อไทย) การเพิ่มคอลัมน์ที่ไม่มีใครกรอกคือหนี้ที่จ่ายเปล่า
--
--  ✅ **รันบนฐานจริงไปแล้ว 2026-08-12** (ตอนนั้นไฟล์ยังชื่อ 0236 — ดูบันทึกการเลื่อนเลข
--  ท้ายหัวไฟล์) · ยืนยันแล้ว: quotations.docLanguage อ่านผ่าน PostgREST ได้ 44 ใบเป็น 'th'
--  ทั้งหมด ไม่มี NULL · prosrc ของ save_quotation_content มีคำว่า docLanguage แล้ว
--  ⇒ **ไม่ต้องรันซ้ำ** (แต่รันซ้ำก็ไม่เสียหาย ทุกคำสั่งเป็น IF NOT EXISTS / OR REPLACE)
--
--  🛑 **ต้องรันก่อน deploy เท่านั้น** — บทเรียนจาก 0233 และ 0234/0235 (2026-08-12):
--  โค้ดใหม่ส่งคีย์ที่ DB ยังไม่มี ⇒ PostgREST ตอบ 500 "Could not find the ... column
--  in the schema cache" · เส้นที่พังคือ **การสร้างใบเสนอราคาใหม่และการออก Rev.**
--  (createQuotationDraft / revise ยิง .insert() ตรงเข้าตาราง) ⇒ เปิดใบใหม่ไม่ได้
--  ทั้งระบบ ไม่ใช่แค่ใบที่เลือกภาษาอังกฤษ
--  ⚠️ SQL นี้ปลอดภัยกับโค้ดเวอร์ชันปัจจุบัน (ไม่รู้จักคอลัมน์จึงไม่แตะ) ⇒ รันล่วงหน้าได้ทันที
--
--  ⚠️ รันมือบน Supabase SQL Editor · เพิ่มคอลัมน์ล้วน ไม่แตะข้อมูลเดิม · รันซ้ำได้
--
--  ⚠️ **0236 → 0238 (2026-08-12)** — ใบนี้เขียนและ **รันบนฐานจริง** ในชื่อ 0236 แล้ว
--  ระหว่างรอ review มีสองสายชิงเลขไปก่อน: 0236_drop_chat_webhooks (#1195) และ
--  0237_master_code_atomic_insert (#1194) จึงเลื่อนใบนี้เป็น 0238 ตามกติกาโปรเจกต์
--  (เลื่อนใบที่ยังไม่ merge · **ไม่แตะเนื้อ SQL แม้แต่บรรทัดเดียว** เปลี่ยนแค่ชื่อไฟล์
--  กับเลขบนหัว) — เคสเดียวกับที่ 0219 → 0223 และ 0234 → 0235 เคยเจอ
--
--  ⚠️ **ลำดับเลขไม่ตรงกับลำดับที่รันจริงบนฐาน** และไม่เป็นไร — สามใบนี้ไม่แตะของกันเลย
--  (0236 = chat webhooks · 0237 = customers/products + เคาน์เตอร์รหัส · ใบนี้ =
--  quotations + save_quotation_content) ฐานที่รัน 0238 ไปก่อน 0236/0237 ได้ผลเหมือนกัน
-- ============================================================

BEGIN;

-- 1) คอลัมน์ใหม่ — ใบเก่าได้ 'th' จาก default ทันที (= พฤติกรรมเดิม)
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "docLanguage" text NOT NULL DEFAULT 'th';

-- ชุดค่าปิด ไม่ใช่ข้อความอิสระ: ตัวเรนเดอร์เอกสารมีพจนานุกรมป้ายแค่สองชุด
-- ค่านอกลิสต์จะตกไปใช้ไทยเงียบ ๆ ซึ่งอ่านไม่ออกว่าตั้งใจหรือข้อมูลเสีย
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_doc_language_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_doc_language_check
      CHECK ("docLanguage" IN ('th', 'en'));
  END IF;
END $$;

COMMIT;

-- 2) save_quotation_content — คัดลอกจากนิยามล่าสุด (0146) + เพิ่ม "docLanguage" หนึ่งบรรทัด
--    guard และบรรทัดอื่นคงเดิมทุกตัวอักษร
--
--    🐞 **บรรทัดเดียวนี้คือทั้งหมดของบั๊ก 0124** — UPDATE ของ RPC นี้ whitelist คอลัมน์
--    ไว้ ไม่ได้เขียนทั้งก้อน ⇒ คีย์ที่ไม่มีชื่ออยู่ในลิสต์ถูก **ทิ้งเงียบ ๆ** ไม่ error
--    ตอนนั้น metadata (ผู้รับผิดชอบเอกสาร) หายไปแบบนี้มาแล้วรอบหนึ่ง · ถ้าลืมบรรทัดนี้
--    สวิตช์ภาษาจะกดได้ บันทึกผ่าน แล้วรีเฟรชกลับมาเป็นไทยเหมือนเดิมโดยไม่มีข้อความ error
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
-- SELECT "docLanguage", count(*) FROM public.quotations GROUP BY 1;  -- ต้องได้ th อย่างเดียว
-- SELECT count(*) FROM pg_constraint WHERE conname = 'quotations_doc_language_check';  -- 1
-- ต้องเจอบรรทัด docLanguage ในตัว RPC:
-- SELECT prosrc LIKE '%docLanguage%' FROM pg_proc WHERE proname = 'save_quotation_content';  -- t

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- ⚠️ ย้อนคอลัมน์ต้องย้อน RPC กลับเป็นนิยาม 0146 ด้วย ไม่งั้น RPC อ้างคอลัมน์ที่ไม่มีแล้ว
--    ⇒ บันทึกใบเสนอราคาพังทุกใบ (รันไฟล์ 0146 ซ้ำได้เลย เป็น CREATE OR REPLACE)
-- ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_doc_language_check;
-- ALTER TABLE public.quotations DROP COLUMN IF EXISTS "docLanguage";
-- NOTIFY pgrst, 'reload schema';
