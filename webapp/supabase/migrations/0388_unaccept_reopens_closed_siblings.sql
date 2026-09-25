-- ============================================================
--  Migration 0388: ย้อนการรับใบเสนอราคา = เปิดใบพี่น้องที่ "การรับใบนี้" ปิดไว้คืนสถานะเดิม
--                  (มติเจ้าของ 25/09/2026 ข้อ 1 + ข้อ 4 · ค่าตั้งต้นที่เสนอทุกข้อ)
--
--  🐞 ทางตัน: รับใบ (accept_quotation_atomic · 0361) ปิดใบอื่นในดีลที่ยังเปิด (draft/sent/rejected) เป็น 'closed'
--     **โดยไม่จำว่าเดิมเป็นอะไร** · ย้อนการรับ (unaccept_quotation_atomic · 0380) คืนแค่ใบหลักกลับเป็น 'sent'
--     ⇒ ใบพี่น้องค้าง 'closed' บนดีลที่กลับมาเปิดแล้ว · แก้/ออก Rev./รับ/ยกเลิก ปฏิเสธใบ closed ทุกทาง
--     ⇒ ไม่มีปุ่มไหนพาออก ทั้งที่โมดัลย้อนการรับเองชวนว่า "ดีลนี้ต้องปิดด้วยใบเสนอราคาอีกใบ"
--     ⇒ ใบที่รออนุมัติอยู่ตอนถูกปิด หลุดคิวผู้อนุมัติถาวร (prod 25/09: pending 2 · not_submitted 3 จาก 20 ใบ)
--     ตั้งแต่ #1811 (24/09) เจ้าของดีลย้อนการรับเองได้ ⇒ ทางตันนี้จะโตตามจำนวนครั้งที่ย้อน
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) accept_quotation_atomic — ใบที่ถูกปิดพกตรา metadata.closedByAccept =
--       { quotationId, quoteNumber, prevStatus, at }  (ใบไหนรับ · ก่อนปิดเป็นอะไร · เมื่อไร)
--     ⭐ ปะแค่สิ่งที่ UPDATE เขียน — เงื่อนไขว่าใบไหนถูกปิดคงเดิมทุกตัวอักษร
--  2) unaccept_quotation_atomic — หลังถอยดีลแล้ว เปิดคืนใบพี่น้องในดีลเดียวกันที่สถานะ 'closed'
--     **เฉพาะใบที่พิสูจน์ได้ว่า "การรับใบนี้" เป็นคนปิด**:
--       · ตราชี้ใบนี้            → prevStatus ในตรา (ต้องเป็น draft/sent/rejected — เพี้ยน = ถอยไปเดา)
--       · ไม่มีตรา (ปิดก่อนไฟล์นี้) และ updatedAt = acceptedAt ของใบนี้
--         (RPC รับใบทุกรุ่นตั้งแต่ 0102 เขียนสองค่านี้ด้วย v_now ตัวเดียว · ย้อนการรับไม่ล้าง acceptedAt · ใบ closed
--          ไม่มีทางไหนแก้ต่อได้ ⇒ updatedAt ไม่ขยับหลังปิด)
--         → เดาจากผลอนุมัติ: approved/not_required → 'sent' · ที่เหลือ → 'draft'
--       · ตราชี้ใบอื่น / ไม่มีตราและเวลาไม่ตรง → ไม่แตะ (การรับใบอื่นเป็นคนปิด หรือพิสูจน์ไม่ได้)
--     🐞 รีวิว 25/09: ร่างแรกกลับด้าน — "ใบรุ่นเก่าเปิดทุกใบ เว้นแต่เจอใบ cancelled ที่ acceptedAt ตรง"
--        พึ่งแถวของใบอื่นที่ยังอยู่ ⇒ ใบที่ปิดไว้ถูกบังคับลบ (0381) / ใบ cancelled ถูกลบทีหลัง = หาไม่เจอ
--        = ใบที่การรับใบอื่นปิดถูกเปิดตอนย้อนการรับใบนี้ (ขัดข้อ 4 · ต่างจากใบมีตราที่ชี้ใบที่ถูกลบ = คงปิด)
--        ตอนนี้อ่านหลักฐานจากใบที่กำลังย้อนเอง (ล็อก FOR UPDATE อยู่ มีอยู่แน่) ⇒ ใบมีตรากับไม่มีตราตอบเหมือนกัน
--     แล้วลบตราทิ้ง (ออก Rev. ก๊อป metadata ต่อ — ตราค้างบนใบเปิด = ข้อมูลโกหก) · คืนรายการใบที่เปิดใน
--     `reopenedQuotations` ให้ route ลงเธรดดีล + audit ทีละใบ (route ไม่ต้องอ่านแถวซ้ำ — systemRules กฎ 6)
--
--  ⛔ ข้อ 4: **ทางย้อนการรับเท่านั้น** ที่เปิดใบพี่น้อง — ไม่แตะ
--     · cancel_sales_order_with_reversal_atomic (0170 · ยกเลิก SO พร้อมย้อน Won): ใบที่รับกลายเป็น 'cancelled'
--       และดีลมักเสนอราคาใหม่ทั้งชุด ⇒ ใบพี่น้องคงปิด (ตรายังชี้ใบที่ยกเลิกแล้ว ไม่มีใครเปิดตามมันอีก)
--     · force_delete_quotation → revert_deal_out_of_won (0381/0168 · บังคับลบของแอดมิน): เหมือนกัน
--
--  🔎 ข้อมูลจริงตอนเขียน (อ่านอย่างเดียว 25/09): ใบ closed 20 ใบ ไม่มีตราสักใบ (ยังไม่รัน) · ทุกใบอยู่บนดีล Won
--     และ updatedAt ตรงกับ acceptedAt ของใบที่รับอยู่ตอนนี้ทุกใบ ⇒ ย้อนการรับใบนั้นเปิดคืนได้ครบ 20 ใบ
--     (legacy_unprovable ข้างล่าง = 0) · ชุดใบรุ่นเก่าไม่มีวันโตอีก (ทุกการปิดหลังไฟล์นี้มีตรา)
--     ⚠️ ใบรุ่นเก่าที่ legacy_unprovable นับ = ใบที่ย้อนการรับไม่มีวันเปิด (ใบที่ปิดมันถูกย้อน/ยกเลิก/ลบไปก่อนรันไฟล์นี้)
--        — ไม่ใช่ความผิดของไฟล์นี้ แต่ต้องตามดูรายใบ ถ้าไม่ใช่ 0 ตอนรัน
--
--  ⭐ ปะจากนิยามที่รันอยู่จริง (pg_get_functiondef) แบบ 0382/0385 — ไม่ก๊อปเนื้อสองฟังก์ชัน (~250 บรรทัด)
--     ⇒ ด่านอื่นทุกตัว (fingerprint · live SO 0380 · stage history · forecast) คงเดิมทุกตัวอักษร
--     ⇒ CREATE OR REPLACE เก็บเจ้าของ · สิทธิ์ EXECUTE (0336/0380: service_role เท่านั้น) · search_path ไว้ครบ
--  🛑 จุดปะแต่ละจุดต้องเจอ **ครั้งเดียวพอดี** — ไม่เจอ/เจอเกิน = RAISE ทั้งไฟล์ถอยกลับ (BEGIN/COMMIT)
--  ✅ รันซ้ำได้ — ฟังก์ชันที่ปะแล้ว (มีตรา/มี v_reopened อยู่แล้ว) ถูกข้าม
--  ⛔ ไม่แตะตาราง · ไม่ backfill ตราให้ใบเก่า (กิ่ง "ไม่มีตรา" รับไว้แล้ว)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor **ก่อน** deploy โค้ดของ PR เดียวกัน
--     (โค้ดใหม่บนฟังก์ชันเก่า = พรีวิวบอกว่าจะเปิดใบ แต่ RPC ไม่เปิด · ฟังก์ชันใหม่บนโค้ดเก่า = เปิดใบได้ แต่ไม่มีเธรด/audit)
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: accept_stamps = t · unaccept_reopens = t · anon_exec = f · auth_exec = f · service_exec = t ·
--       legacy_closed = 20 (หรือน้อยกว่าถ้ามีการย้อนการรับไปแล้ว — ไม่มีวันเพิ่ม) · legacy_unprovable = 0
--
--   SELECT
--     (SELECT bool_and(strpos(p.prosrc, 'closedByAccept') > 0) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'accept_quotation_atomic')                        AS accept_stamps,
--     (SELECT bool_and(strpos(p.prosrc, 'v_reopened') > 0) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname = 'unaccept_quotation_atomic')                      AS unaccept_reopens,
--     has_function_privilege('anon', 'public.unaccept_quotation_atomic(text,text,text,text,text)', 'EXECUTE') AS anon_exec,
--     has_function_privilege('authenticated', 'public.unaccept_quotation_atomic(text,text,text,text,text)', 'EXECUTE') AS auth_exec,
--     has_function_privilege('service_role', 'public.unaccept_quotation_atomic(text,text,text,text,text)', 'EXECUTE') AS service_exec,
--     (SELECT count(*) FROM public.quotations
--       WHERE status = 'closed' AND jsonb_typeof(metadata->'closedByAccept') IS DISTINCT FROM 'object') AS legacy_closed,
--     (SELECT count(*) FROM public.quotations s
--       WHERE s.status = 'closed' AND jsonb_typeof(s.metadata->'closedByAccept') IS DISTINCT FROM 'object'
--         AND NOT EXISTS (SELECT 1 FROM public.quotations o
--                          WHERE o."dealId" = s."dealId" AND o.id <> s.id
--                            AND o.status = 'accepted' AND o."acceptedAt" = s."updatedAt")) AS legacy_unprovable;
-- ============================================================

BEGIN;

DO $patch$
DECLARE
  -- ── 1) รับใบ: ใบที่ถูกปิดพกตรา ─────────────────────────────────────────
  v_acc_old constant text := $acc_old$UPDATE public.quotations SET status = 'closed', "updatedAt" = v_now$acc_old$;
  v_acc_new constant text := $acc_new$UPDATE public.quotations SET status = 'closed', "updatedAt" = v_now,
    -- ⬇ 0388 (มติ 25/09): ตราว่า "การรับใบไหน" ปิดใบนี้ และก่อนปิดเป็นอะไร — ย้อนการรับเปิดคืนได้ตรงตัว
    --   ⚠️ `status` ฝั่งขวาของ SET = ค่าก่อน UPDATE (Postgres ประเมินทุกนิพจน์จากแถวเดิม)
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('closedByAccept', jsonb_build_object(
      'quotationId', v_quote.id,
      'quoteNumber', v_quote."quoteNumber",
      'prevStatus', status,
      'at', v_now))$acc_new$;

  -- ── 2) ย้อนการรับ: ตัวแปรรายการที่เปิด + ขั้นเปิดคืนก่อน RETURN ─────────────
  v_un_decl_old constant text := $un_decl_old$v_now timestamptz := now();$un_decl_old$;
  v_un_decl_new constant text := $un_decl_new$v_now timestamptz := now();
  -- ⬇ 0388: ใบพี่น้องที่เปิดคืน (route ลงเธรดดีล + audit ทีละใบจากค่านี้)
  v_reopened jsonb := '[]'::jsonb;$un_decl_new$;
  v_un_ret_old constant text := $un_ret_old$RETURN jsonb_build_object('quotation', to_jsonb(v_updated_quote), 'deal', to_jsonb(v_updated_deal));$un_ret_old$;
  v_un_ret_new constant text := $un_ret_new$-- 8) ⬇ 0388 (มติ 25/09): ใบพี่น้องที่ "การรับใบนี้" ปิดไว้ → เปิดคืนสถานะเดิม · ลบตราทิ้ง
  --    ต้องพิสูจน์ได้ว่าการรับใบนี้เป็นคนปิด: ตราชี้ใบนี้ (→ prevStatus) หรือไม่มีตรา (ปิดก่อน 0388) และ
  --    updatedAt = acceptedAt ของใบนี้ (RPC รับใบเขียนสองค่าด้วย v_now ตัวเดียว → เดาจากผลอนุมัติ)
  --    ⛔ พิสูจน์ไม่ได้ = คงปิด — ใบที่การรับใบอื่นปิด (ใบนั้นถูกยกเลิกทาง SO 0170 / บังคับลบ 0381 / ลบทีหลัง)
  --      ย้อนการรับใบนี้ไม่เปิด (มติข้อ 4) · หลักฐานอ่านจาก v_quote ที่ล็อกอยู่ ไม่พึ่งแถวของใบอื่น (รีวิว 25/09)
  WITH reopened AS (
    UPDATE public.quotations q SET
      status = CASE
        WHEN t.stamp->>'prevStatus' IN ('draft', 'sent', 'rejected') THEN t.stamp->>'prevStatus'
        WHEN q."approvalStatus" IN ('approved', 'not_required') THEN 'sent'
        ELSE 'draft'
      END,
      metadata = COALESCE(q.metadata, '{}'::jsonb) - 'closedByAccept',
      "updatedAt" = v_now
    FROM (
      SELECT s.id, s.metadata->'closedByAccept' AS stamp
        FROM public.quotations s
       WHERE s."dealId" = v_deal.id AND s.id <> v_quote.id AND s.status = 'closed'
         AND (
           s.metadata->'closedByAccept'->>'quotationId' = v_quote.id
           OR (
             jsonb_typeof(s.metadata->'closedByAccept') IS DISTINCT FROM 'object'
             AND s."updatedAt" = v_quote."acceptedAt"
           )
         )
    ) t
    WHERE q.id = t.id AND q.status = 'closed'
    RETURNING q.id, q."quoteNumber", q."dealId", q.status, q."approvalStatus", t.stamp
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'quoteNumber', r."quoteNumber",
      'dealId', r."dealId",
      'status', r.status,
      'approvalStatus', r."approvalStatus",
      'inferred', NOT COALESCE(r.stamp->>'prevStatus' IN ('draft', 'sent', 'rejected'), false),
      'closedByAccept', r.stamp
    ) ORDER BY r."quoteNumber"), '[]'::jsonb)
    INTO v_reopened
    FROM reopened r;

  RETURN jsonb_build_object('quotation', to_jsonb(v_updated_quote), 'deal', to_jsonb(v_updated_deal),
    'reopenedQuotations', v_reopened);$un_ret_new$;

  v_proc record;
  v_hits int;
  v_hits2 int;
  v_patched int := 0;
  v_already int := 0;
BEGIN
  -- ── 1) accept_quotation_atomic ────────────────────────────────────────
  FOR v_proc IN
    SELECT p.oid, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'accept_quotation_atomic'
  LOOP
    IF strpos(v_proc.prosrc, 'closedByAccept') > 0 THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    v_hits := (length(v_proc.prosrc) - length(replace(v_proc.prosrc, v_acc_old, ''))) / length(v_acc_old);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION '0388: accept_quotation_atomic มีคำสั่งปิดใบพี่น้อง % จุด (คาด 1 — นิยาม 0361) — ไม่ปะ', v_hits;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_proc.oid), v_acc_old, v_acc_new);
    v_patched := v_patched + 1;
  END LOOP;
  IF v_patched = 0 AND v_already = 0 THEN
    RAISE EXCEPTION '0388: ไม่พบฟังก์ชัน accept_quotation_atomic — ไม่ปะ';
  END IF;
  RAISE NOTICE '0388: accept_quotation_atomic — ปะ % · ปะไว้แล้ว %', v_patched, v_already;

  -- ── 2) unaccept_quotation_atomic ──────────────────────────────────────
  v_patched := 0;
  v_already := 0;
  FOR v_proc IN
    SELECT p.oid, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'unaccept_quotation_atomic'
  LOOP
    IF strpos(v_proc.prosrc, 'v_reopened') > 0 THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    v_hits := (length(v_proc.prosrc) - length(replace(v_proc.prosrc, v_un_decl_old, ''))) / length(v_un_decl_old);
    v_hits2 := (length(v_proc.prosrc) - length(replace(v_proc.prosrc, v_un_ret_old, ''))) / length(v_un_ret_old);
    IF v_hits <> 1 OR v_hits2 <> 1 THEN
      RAISE EXCEPTION '0388: unaccept_quotation_atomic จุดปะ DECLARE % จุด · RETURN % จุด (คาด 1 · 1 — นิยาม 0380) — ไม่ปะ', v_hits, v_hits2;
    END IF;
    EXECUTE replace(replace(pg_get_functiondef(v_proc.oid), v_un_decl_old, v_un_decl_new), v_un_ret_old, v_un_ret_new);
    v_patched := v_patched + 1;
  END LOOP;
  IF v_patched = 0 AND v_already = 0 THEN
    RAISE EXCEPTION '0388: ไม่พบฟังก์ชัน unaccept_quotation_atomic — ไม่ปะ';
  END IF;
  RAISE NOTICE '0388: unaccept_quotation_atomic — ปะ % · ปะไว้แล้ว %', v_patched, v_already;
END
$patch$;

COMMIT;

NOTIFY pgrst, 'reload schema';
