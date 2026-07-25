-- 0155 - ใบเสนอราคามี "ขั้นยื่นอนุมัติ" + ยื่น = การลงนามของผู้เสนอราคา
--
-- ที่มา: ใบเสนอราคาไม่มีขั้นยื่นเลย — ใบเกิดมาเป็น approvalStatus='pending' (รออนุมัติ) ทันที
-- ตั้งแต่ mig 0114 เจ้าของดีลจึงกดอนุมัติได้เลยแม้ยังกรอกไม่เสร็จ ต่างจากใบสั่งขายที่มี
-- draft → pending_approval → approved. ผลข้างเคียงคือช่อง "ผู้เสนอราคา" บนเอกสารไม่มีจุด
-- ที่ถือว่าลงนาม จึงไม่มีวันที่/Evidence (ปัญหาต้นเรื่องเดียวกับ mig 0153 ฝั่งใบสั่งขาย)
--
-- มติผู้ใช้ 2026-07-25:
--   · QT เพิ่มขั้นยื่นให้ flow เหมือน SO: ร่าง → บันทึก → ยื่นอนุมัติ → ผู้อนุมัติอนุมัติ
--   · **ใบที่ค้าง "รออนุมัติ" ตอนนี้ → เด้งกลับเป็นร่าง ต้องยื่นใหม่** (ข้อ 6)
--   · แก้เนื้อหาหลังยื่น → เด้งกลับร่าง ต้องยื่นใหม่ (ข้อ 7 — ฝั่งแอปทำ)
--   · ไม่บังคับแยกหน้าที่ (ข้อ 8) — เจ้าของดีลยื่นเองอนุมัติเองได้เหมือนเดิม
--
-- ⚠️ ผลกระทบผู้ใช้: ใบที่รออนุมัติอยู่ทั้งหมดจะกลายเป็นร่าง เซลต้องกด "ยื่นอนุมัติ" ใหม่ทุกใบ
--    นับจำนวนก่อนรัน:
--      select count(*) from public.quotations
--       where "approvalStatus" = 'pending' and status in ('draft','sent','rejected');
-- ⚠️ ผู้ยื่นต้องมีลายเซ็นในบัญชี (capture โยน signature_evidence_signature_required แล้ว
--    rollback ทั้งก้อน = สถานะไม่เปลี่ยน) — ปิดรายงาน /settings/signature-coverage ให้ครบก่อน
-- Idempotent — รันซ้ำได้.

-- ── 1) สถานะใหม่ 'not_submitted' (= ร่างที่ยังไม่ยื่น) ──
-- ชื่อ constraint มาจาก inline CHECK ตอน ADD COLUMN (mig 0070) — หาโดยดูนิยามจริงแทนการเดาชื่อ
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.quotations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%approvalStatus%'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.quotations DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_approval_status_check
  CHECK ("approvalStatus" IN ('not_required', 'not_submitted', 'pending', 'approved', 'rejected'));

-- ใบใหม่เริ่มที่ "ยังไม่ยื่น" (ฝั่งแอปส่งค่ามาเองอยู่แล้ว — default นี้กันเส้นทางที่ลืมส่ง)
ALTER TABLE public.quotations
  ALTER COLUMN "approvalStatus" SET DEFAULT 'not_submitted';

-- ── 2) backfill: ใบที่ค้างรออนุมัติ → กลับเป็นร่างที่ยังไม่ยื่น (มติข้อ 6) ──
-- ปลอดภัยเพราะใบที่ส่งลูกค้า/Won แล้วต้องเป็น approved|not_required อยู่ก่อน (guard ของ
-- save_quotation_content + accept RPC) จึงไม่มีใบ pending ที่หลุดไปสถานะปลายทางแล้ว.
-- trigger clear_inactive_quotation_signature_evidence_pointer จะล้าง pointer ให้เอง — ถูกต้อง
-- เพราะการยื่นรอบก่อน (ถ้ามี) สิ้นผลแล้ว. ใบ not_required (grandfather) ไม่ถูกแตะ
UPDATE public.quotations
SET "approvalStatus" = 'not_submitted',
    "approvalRequestedAt" = NULL,
    "approvalRequestedBy" = NULL,
    "approvalRequestedByName" = NULL
WHERE "approvalStatus" = 'pending';

-- ── 3) ยื่นอนุมัติ = ลงนามผู้เสนอราคา (atomic เหมือน mig 0153 ฝั่งใบสั่งขาย) ──
-- ห้ามเอาไปฝังใน save_quotation_content: ฟังก์ชันนั้นถูกเรียกทุกครั้งที่กดบันทึก จะได้
-- หลักฐานซ้ำทุกการบันทึก — การยื่นต้องเป็น action แยกที่ผู้ใช้เจตนากด
CREATE OR REPLACE FUNCTION public.submit_quotation_with_signature_evidence_atomic(
  p_quote_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_line_count integer;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature_evidence_document_not_found'; END IF;

  -- ยื่นได้เฉพาะใบที่ยังแก้ได้และยังไม่ยื่น (ใบ not_required = grandfather ต้องไม่ถูกดึงเข้า
  -- flow นี้; ใบ pending = ยื่นแล้ว; ใบ approved = อนุมัติแล้ว)
  IF v_quote.status NOT IN ('draft', 'sent', 'rejected')
     OR v_quote."approvalStatus" <> 'not_submitted' THEN
    RAISE EXCEPTION 'signature_evidence_submit_state_invalid';
  END IF;
  -- optimistic guard เดียวกับ approve/submit ตัวอื่น — กันแก้เนื้อหาจากอีกหน้าต่างแล้วยื่นทับ
  -- (หลักฐานจะผูก fingerprint ที่ไม่ตรงเนื้อหาจริง)
  IF v_quote."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'signature_evidence_approval_stale';
  END IF;

  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId";
  IF NOT FOUND OR v_deal.stage = 'lost' THEN
    RAISE EXCEPTION 'signature_evidence_deal_invalid';
  END IF;

  SELECT count(*) INTO v_line_count FROM public.quotation_lines WHERE "quotationId" = p_quote_id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'signature_evidence_lines_required'; END IF;

  -- หลักฐานผู้เสนอราคา: ตรึงลายเซ็น active + มาตรฐานเอกสารที่เผยแพร่ + fingerprint เนื้อหา
  -- signedAt = approvalRequestedAt = v_now ตัวเดียวกัน → วันที่บนเอกสาร = เวลาที่ลงนามจริง
  SELECT * INTO v_evidence FROM public.capture_document_signature_evidence(
    p_evidence_id, 'quotation', v_quote.id, v_quote."quoteNumber",
    p_document_fingerprint, 'quotation', p_actor_id, p_actor_name,
    p_actor_role, p_actor_team, v_now, 'proposer'
  );

  -- reuse คอลัมน์ approvalRequested* ที่ตายอยู่ตั้งแต่ mig 0100 (ถูก NULL ทิ้งทั้งตาราง)
  -- = ข้อมูล "ยื่นเมื่อไหร่ ใครยื่น" ไม่ต้องเพิ่มคอลัมน์ใหม่
  UPDATE public.quotations SET
    "approvalStatus" = 'pending',
    "approvalRequestedAt" = v_now,
    "approvalRequestedBy" = p_actor_id,
    "approvalRequestedByName" = p_actor_name,
    "proposerSignatureEvidenceId" = v_evidence.id,
    "updatedAt" = v_now
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  RETURN jsonb_build_object(
    'document', to_jsonb(v_quote),
    'evidence', to_jsonb(v_evidence)
  );
END;
$$;

-- หมายเหตุ: RPC นี้ไม่ตรวจสิทธิ์/scope ทีม (DB ไม่รู้ salesPlanningEditScope) — ชั้น API
-- ยังต้อง gate canEditSalesPlanning + inSalesEditScope เหมือน approve RPC

REVOKE ALL ON FUNCTION public.submit_quotation_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quotation_with_signature_evidence_atomic(
  text, text, timestamptz, text, text, text, text, text
) TO service_role;

-- save_quotation_content ไม่ต้องแก้: guard ตอนส่งลูกค้าเช็ค
--   approvalStatus NOT IN ('not_required','approved') → RAISE quotation_approval_required
-- ซึ่งครอบ 'not_submitted' ให้เองอยู่แล้ว (เหมือนที่ครอบ 'pending')

-- Rollback guidance:
-- 1) เปลี่ยนฝั่งแอปกลับไปสร้างใบด้วย approvalStatus='pending' (ข้ามขั้นยื่น)
-- 2) UPDATE quotations SET "approvalStatus"='pending' WHERE "approvalStatus"='not_submitted';
--    (ใบที่ยื่นแล้วจะกลับไปเป็นรออนุมัติทั้งหมด — ตรงกับพฤติกรรมเดิม)
-- 3) คืน DEFAULT เป็น 'pending' + คืน CHECK เดิม (4 ค่า) + DROP FUNCTION submit_quotation_*
-- 4) แถว evidence บทบาท proposer ที่เกิดแล้วลบไม่ได้ (immutable) — ปล่อยเป็นประวัติ

NOTIFY pgrst, 'reload schema';
