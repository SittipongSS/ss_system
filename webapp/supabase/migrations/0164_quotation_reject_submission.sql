-- 0164 - "ตีกลับ" ใบเสนอราคา (มติผู้ใช้ 2026-07-26).
--
-- คำศัพท์ที่ตกลงกันแล้ว — สองคำนี้ต่างกันที่ "ใครเป็นคนทำ" ไม่ใช่ผลลัพธ์:
--   ตีกลับ  = ผู้อนุมัติส่งเอกสารกลับให้ผู้จัดทำแก้ พร้อมเหตุผลที่ผู้จัดทำมองเห็น
--   ดึงกลับ = ผู้ยื่นดึงคำขอของตัวเองคืนก่อนถูกอนุมัติ (เดิมเรียก "ถอนการยื่น")
--
-- ก่อนหน้านี้ใบเสนอราคา **ไม่มีทางตีกลับเลย** (ต่างจากใบสั่งขายที่มีตั้งแต่ต้น) เจ้าของดีล
-- ที่เห็นว่าใบผิดมีทางเดียวคือกด "ถอนการยื่น" ซึ่งเก็บเหตุผลไว้ใน metadata แล้วไม่แสดง
-- ที่ไหนเลย — ผู้จัดทำได้ใบคืนมาโดยไม่รู้ว่าต้องแก้อะไร.
--
-- ปลายทางของการตีกลับคือ 'not_submitted' (ไม่ใช่ 'rejected') โดยเจตนา: ใบต้องกลับมา
-- แก้ได้และยื่นซ้ำได้ทันที ซึ่ง canEditQuotationContent และ RPC ยื่นอนุมัติรับเฉพาะ
-- 'not_submitted' อยู่แล้ว. สิ่งที่ทำให้ต่างจากการดึงกลับคือคอลัมน์ rejected* ด้านล่าง
-- ที่หน้าเว็บเอาไปแสดงเป็นกล่องเหตุผล + การแจ้งเตือนฝั่งแอป.

-- ── 1) เหตุผลการตีกลับ — คอลัมน์จริงชุดเดียวกับที่ sales_orders ใช้อยู่ ─────────

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "rejectedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "rejectedBy" text,
  ADD COLUMN IF NOT EXISTS "rejectedByName" text,
  ADD COLUMN IF NOT EXISTS "rejectionReason" text
    CHECK ("rejectionReason" IS NULL OR length(btrim("rejectionReason")) BETWEEN 10 AND 500);

-- ── 2) ล้างเหตุผลเมื่อใบถูกยื่นใหม่ ─────────────────────────────────────────
-- ถ้าไม่ล้าง จะเกิดเคสนี้: ตีกลับ → แก้ → ยื่นใหม่ → ผู้ยื่นดึงกลับเอง → approvalStatus
-- กลับเป็น 'not_submitted' อีกครั้ง แล้วกล่องเหตุผลของการตีกลับรอบก่อนโผล่ขึ้นมาใหม่
-- ทั้งที่เรื่องนั้นจบไปแล้ว. ประวัติการตีกลับยังอยู่ครบใน audit log และการแจ้งเตือน.
CREATE OR REPLACE FUNCTION public.clear_quotation_rejection_on_resubmit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."approvalStatus" IS DISTINCT FROM 'not_submitted' THEN
    NEW."rejectedAt" := NULL;
    NEW."rejectedBy" := NULL;
    NEW."rejectedByName" := NULL;
    NEW."rejectionReason" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_clear_rejection_trg ON public.quotations;
CREATE TRIGGER quotations_clear_rejection_trg
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.clear_quotation_rejection_on_resubmit();

-- ── 3) ตีกลับแบบ atomic ────────────────────────────────────────────────────
-- โครงเดียวกับ withdraw_quotation_submission_atomic (0161) ต่างกันสองข้อ:
--   * ผู้ทำต้องเป็น "ผู้อนุมัติ" เท่านั้น — ผู้ยื่นตีกลับใบตัวเองไม่ได้ (ใช้ดึงกลับแทน)
--   * เก็บเหตุผลลงคอลัมน์จริงเพื่อให้แสดงบนใบได้ ไม่ใช่ซ่อนใน metadata
CREATE OR REPLACE FUNCTION public.reject_quotation_submission_atomic(
  p_quote_id text,
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
  v_quote public.quotations%ROWTYPE;
  v_deal public.sales_deals%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_actor_required';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'workflow_reason_invalid';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quote_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;

  IF v_quote.status NOT IN ('draft', 'sent', 'rejected')
     OR v_quote."approvalStatus" <> 'pending' THEN
    RAISE EXCEPTION 'quotation_reject_state_invalid';
  END IF;
  IF v_quote."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workflow_stale';
  END IF;

  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId";
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_deal_not_found'; END IF;

  -- ผู้อนุมัติของใบนี้เท่านั้น (เจ้าของดีล / ae_supervisor / admin) — ตรงกับ
  -- canApproveQuotation ฝั่งแอป. ผู้ยื่นที่บังเอิญเป็นเจ้าของดีลด้วยใช้ดึงกลับได้อยู่แล้ว.
  IF v_deal."ownerId" IS DISTINCT FROM p_actor_id
     AND COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'quotation_reject_forbidden';
  END IF;

  UPDATE public.quotations
  SET
    "approvalStatus" = 'not_submitted',
    "approvalRequestedAt" = NULL,
    "approvalRequestedBy" = NULL,
    "approvalRequestedByName" = NULL,
    "rejectedAt" = v_now,
    "rejectedBy" = p_actor_id,
    "rejectedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
    "rejectionReason" = v_reason,
    "updatedAt" = v_now
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  -- trigger 0151 ล้าง pointer ผู้ยื่นให้เอง (การยื่นรอบนี้สิ้นผล) — แถวหลักฐานยังอยู่
  RETURN to_jsonb(v_quote);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_quotation_submission_atomic(
  text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_quotation_submission_atomic(
  text, timestamptz, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
