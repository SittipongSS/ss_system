-- 0415 — ใบเสนอราคาค่าสรรพสามิต: ยื่น/อนุมัติ/ดึงกลับ/ตีกลับถอยไปดีลของ SO ต้นทาง + RPC รับใบแบบไม่แตะดีล
--
--  แผน: docs/excise-qt-so-rework-plan.md หมวด 6 (0415) · มติเจ้าของ 28/10/2026
--  · ใบค่าสรรพสามิต (`quotations.origin = 'excise'` · 0414) ไม่มีดีล — ผู้อนุมัติ = เจ้าของดีลของ SO ลูกค้าต้นทาง / ผู้จัดการขาย
--    ตามกติกาเดิมทุกตัวอักษร ⇒ สี่ RPC ที่อ่านดีลจาก `v_quote."dealId"` ถอยไปดีลของ SO ต้นทางเมื่อใบไม่มีดีล
--  · รับใบ (ลูกค้าตกลง) ใช้ RPC ใหม่ `accept_excise_quotation_atomic` — **ไม่แตะดีล/FC/Won/ใบพี่น้อง**
--    (`accept_quotation_atomic` เดิมพาดีลเป็น Won + เขียน FC ⇒ ใช้กับใบไม่มีดีลไม่ได้ · route แตกสาขาตาม origin)
--  · `unaccept_quotation_atomic` ไม่แตะ — ใบค่าสรรพสามิตย้อนการรับไม่ได้ (ยกเลิกแทน · route ปฏิเสธ)
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน merge PR3** (`claude/excise-pr3-quotation`) — โค้ดชุดนั้นเรียก RPC ใหม่ ·
--     รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม: ใบปกติมี dealId เสมอ (CHECK 0414) ⇒ COALESCE คืนค่าเดิมทุกใบ
--  ⚠️ เนื้อ RPC ที่ปะมาจาก `pg_get_functiondef` ของตัวที่รันจริง (ไม่ลอกจากไฟล์เก่า · แบบ 0382/0404/0412):
--     ข้อความยึดต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ functiondef ไม่งั้นหยุดทั้งไฟล์ · มีป้าย 0415/E1 แล้ว = ข้าม
--  ✅ รันซ้ำได้ (ปะแล้วข้าม · CREATE OR REPLACE)
--  🧪 พิสูจน์บนฮาร์เนส PGlite (นอก repo) — โหลด schema.sql + 0001–0414 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + กรณีทดสอบ
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: patched = 4 · accept_fn = 1 · accept_grant = 0 ──
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND strpos(p.prosrc, '0415/E1') > 0
--        AND p.proname IN ('submit_quotation_with_signature_evidence_atomic', 'approve_quotation_with_signature_evidence_atomic',
--                          'withdraw_quotation_submission_atomic', 'reject_quotation_submission_atomic')) AS patched,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'accept_excise_quotation_atomic') AS accept_fn,
--    (SELECT count(*) FROM information_schema.routine_privileges
--      WHERE routine_schema = 'public' AND routine_name = 'accept_excise_quotation_atomic'
--        AND grantee IN ('anon', 'authenticated', 'PUBLIC')) AS accept_grant;
--
--  ── ถอยกลับ (ใช้ได้ตราบที่ยังไม่มีใบ excise — มีแล้ว ห้ามถอย) ─────────────────────────────────────
--   BEGIN;
--   DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.quotations WHERE origin = 'excise')
--     THEN RAISE EXCEPTION 'excise quotations exist'; END IF; END $$;
--   DROP FUNCTION IF EXISTS public.accept_excise_quotation_atomic(text, text, text, text);
--   DO $undo$ DECLARE r record; v_def text; BEGIN
--     FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND strpos(p.prosrc, '0415/E1') > 0 LOOP
--       v_def := pg_get_functiondef(r.oid);
--       EXECUTE replace(v_def,
--         'WHERE id = COALESCE(v_quote."dealId", (SELECT so."dealId" FROM public.sales_orders so WHERE so.id = v_quote."sourceSalesOrderId")); -- 0415/E1',
--         'WHERE id = v_quote."dealId";');
--     END LOOP; END $undo$;
--   COMMIT;

BEGIN;

-- ── 1) สี่ RPC ของวงจรอนุมัติใบเสนอราคา: ดีลถอยไปดีลของ SO ต้นทาง ─────────────────────────────────────
DO $patch$
DECLARE
  v_anchor constant text := 'SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId";';
  v_new constant text := 'SELECT * INTO v_deal FROM public.sales_deals WHERE id = COALESCE(v_quote."dealId", '
    || '(SELECT so."dealId" FROM public.sales_orders so WHERE so.id = v_quote."sourceSalesOrderId")); -- 0415/E1';
  r record;
  v_n integer;
  v_oid oid;
  v_src text;
  v_def text;
  v_src_hits integer;
  v_def_hits integer;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'submit_quotation_with_signature_evidence_atomic',
    'approve_quotation_with_signature_evidence_atomic',
    'withdraw_quotation_submission_atomic',
    'reject_quotation_submission_atomic'
  ]) AS fn
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0415_patch_overload % count=%', r.fn, v_n; END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_def := pg_get_functiondef(v_oid);

    IF strpos(v_src, '0415/E1') > 0 THEN
      RAISE NOTICE '0415: % — ปะไว้แล้ว', r.fn;
      CONTINUE;
    END IF;

    v_src_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    v_def_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_src_hits <> 1 OR v_def_hits <> 1 THEN
      RAISE EXCEPTION 'mig_0415_patch_anchor % src=% def=%', r.fn, v_src_hits, v_def_hits;
    END IF;

    EXECUTE replace(v_def, v_anchor, v_new);
    RAISE NOTICE '0415: % — ปะแล้ว', r.fn;
  END LOOP;
END
$patch$;

-- ── 2) รับใบค่าสรรพสามิต — ไม่แตะดีล/FC/Won/ใบพี่น้อง ─────────────────────────────────────────────
--  ด่าน (ลำดับเดียวกับ accept_quotation_atomic เท่าที่ใช้กับใบไม่มีดีล):
--   · ใบต้องเป็น origin excise · สถานะยังรับได้ · มีบรรทัด · **อนุมัติแล้วเท่านั้น** (ใบ excise ไม่มีใบ grandfather) · fingerprint ตรง
--   · SO ลูกค้าต้นทางยังอนุมัติอยู่ · ไม่ถูกแทน (Rev.) · เป็นใบ pipeline · ไม่ได้ถูกตัดสิน "ไม่เรียกเก็บในระบบ"
--   · SO ต้นทางหนึ่งใบรับใบค่าสรรพสามิตได้ใบเดียว (unique index ของ 0414 เป็นตาข่ายท้าย)
--  ⚠️ ล็อก SO ต้นทาง FOR UPDATE — กันการยกเลิก/ย้อนอนุมัติ SO ลูกค้าที่วิ่งชนกันระหว่างรับ (ด่าน JS ของ SO ลูกค้าอ่านใบที่รับแล้ว)
CREATE OR REPLACE FUNCTION public.accept_excise_quotation_atomic(
  p_quote_id text,
  p_current_fingerprint text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_source public.sales_orders%ROWTYPE;
  v_accepted public.quotations%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.origin IS DISTINCT FROM 'excise' THEN RAISE EXCEPTION 'excise_quotation_origin_invalid'; END IF;
  IF v_quote.status IN ('accepted', 'cancelled', 'rejected', 'revised', 'closed') THEN
    RAISE EXCEPTION 'quotation_not_acceptable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;
  IF v_quote."approvalStatus" IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'quotation_approval_required';
  END IF;
  IF v_quote."approvalFingerprint" IS NULL OR v_quote."approvalFingerprint" <> p_current_fingerprint THEN
    RAISE EXCEPTION 'quotation_approval_stale';
  END IF;

  SELECT * INTO v_source FROM public.sales_orders WHERE id = v_quote."sourceSalesOrderId" FOR UPDATE;
  IF NOT FOUND OR v_source.origin IS DISTINCT FROM 'pipeline' OR v_source.status IS DISTINCT FROM 'approved'
     OR v_source."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'excise_source_order_invalid';
  END IF;
  IF v_source."exciseNotBilledKind" IS NOT NULL THEN
    RAISE EXCEPTION 'excise_source_not_billed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotations
     WHERE "sourceSalesOrderId" = v_source.id AND origin = 'excise' AND status = 'accepted' AND id <> v_quote.id
  ) THEN
    RAISE EXCEPTION 'excise_source_already_accepted';
  END IF;

  UPDATE public.quotations SET
    status = 'accepted',
    "acceptedAt" = v_now,
    "acceptedBy" = COALESCE(p_actor_name, p_actor_id),
    "updatedAt" = v_now
  WHERE id = v_quote.id
  RETURNING * INTO v_accepted;

  RETURN jsonb_build_object('quotation', to_jsonb(v_accepted));
END;
$$;

REVOKE ALL ON FUNCTION public.accept_excise_quotation_atomic(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_excise_quotation_atomic(text, text, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
