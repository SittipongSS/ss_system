-- ============================================================
--  Migration 0382: ผังตำแหน่งฝ่ายขาย — ฟังก์ชันอนุมัติในฐานรู้จัก CCO / CM / AC Supervisor / Senior AC
--                  (มติผู้ใช้ 24/09/2026: CCO → Commercial Manager → AE/AC Supervisor → Senior AE/AC → AE/AC)
--
--  ⭐ ทำไมต้องมี: ฟังก์ชันอนุมัติในฐาน **เช็คตำแหน่งซ้ำอีกชั้น** ด้วยรายชื่อที่เขียนตรง ๆ 13 ตัว
--    เช่น `COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')` · ฝั่ง JS เปิดสิทธิ์ให้ตำแหน่งใหม่
--    แล้วแต่ฐานไม่รู้จัก ⇒ **จอให้กด route ยอม แต่ฐานตอบ forbidden** (signature_evidence_forbidden ฯลฯ)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) ฟังก์ชันกลางสองตัว — รายชื่อตำแหน่งมีบ้านเดียวในฐาน (คู่กับ lib/permissions.js)
--     · public.is_sales_manager_role(role) = ผู้มีอำนาจตัดสิน: admin · cco · commercial_manager · ae_supervisor
--       (= ['admin', ...SALES_MANAGER_ROLES] · AC Supervisor **ไม่อยู่** — เห็นทุกทีมแต่ไม่อนุมัติ มติข้อ 1)
--     · public.is_sales_keyer_role(role)   = ผู้คีย์ใบสั่งขายย้อนหลัง: admin + ฝ่ายขายทุกตำแหน่ง
--       (= HISTORICAL_KEYER_ROLES · มติ 22/09 "ฝ่ายขายทุกตำแหน่งคีย์ได้")
--     🔴 สองชุดนี้ต้องตรงกับฝั่ง JS — salesRoleSqlParity.test.mjs อ่านไฟล์นี้เทียบ
--  2) ปะ 13 ฟังก์ชันให้เรียกฟังก์ชันกลางแทนรายชื่อที่เขียนตรง ๆ
--     ⭐ **ปะจากนิยามที่รันอยู่จริงในฐาน** (`pg_get_functiondef`) แล้วแทนเฉพาะเงื่อนไขตำแหน่ง — ไม่ก๊อปเนื้อ
--        ฟังก์ชันทั้งตัว (รวม ~1,700 บรรทัด) มาไว้ที่นี่ ⇒ ไม่มีทางเผลอถอยเนื้อส่วนอื่นกลับเป็นรุ่นเก่า
--     ⭐ CREATE OR REPLACE เก็บเจ้าของ · สิทธิ์ EXECUTE (0336) · SECURITY DEFINER · search_path ไว้ครบ
--        (ทุกอย่างอยู่ในข้อความที่ pg_get_functiondef คืนมา)
--     🛑 เงื่อนไขที่คาดไว้ต้องเจอ **ครั้งเดียวพอดี** ในฟังก์ชันนั้น — ไม่เจอเลยและยังไม่เคยปะ หรือเจอเกิน
--        = RAISE EXCEPTION ทั้งไฟล์ถอยกลับ (BEGIN/COMMIT) ไม่มีครึ่ง ๆ กลาง ๆ
--
--     ผู้มีอำนาจตัดสิน (is_sales_manager_role):
--       withdraw_quotation_submission_atomic (0161) · withdraw_sales_order_submission_atomic (0161) ·
--       reject_quotation_submission_atomic (0164) · approve_quotation_with_signature_evidence_atomic (0165 · หรือเจ้าของดีล) ·
--       revoke_sales_order_approval_atomic (0166) · approve_sales_order_with_signature_evidence_atomic (0197) ·
--       approve_historical_sales_order (0374) · revise_approved_sales_order_atomic (0376) ·
--       replan_sales_order_installments (0377) · carry_sales_order_installments (0378 · + finance)
--     ผู้คีย์ (is_sales_keyer_role):
--       create_historical_sales_order · update_historical_sales_order · submit_historical_sales_order (0374)
--
--  ⛔ ไม่แตะตาราง/ข้อมูล · ไม่แตะด่าน admin ที่เหลือ (`p_actor_role <> 'admin'` ของการอนุมัติใบตัวเอง ·
--     `IS DISTINCT FROM 'admin'` ของ 0251) · ตำแหน่งเดิมทั้งสี่ได้ผลเหมือนเดิมทุกฟังก์ชัน
--  ⭐ ตำแหน่งใหม่ยังไม่มีใครถือจนกว่าแอดมินจะย้ายบัญชี ⇒ รันก่อนหรือหลัง deploy โค้ดก็ได้ แต่ **ต้องรันก่อน
--     ย้ายบัญชีคนแรกเป็น CCO/CM** ไม่งั้นเขากดอนุมัติแล้วเจอ forbidden
--  ⚠️ DDL — รันมือบน Supabase SQL Editor
--  ✅ รันซ้ำได้ — ฟังก์ชันที่ปะแล้ว (มีเงื่อนไขใหม่อยู่แล้ว) ถูกข้าม · ฟังก์ชันกลาง CREATE OR REPLACE
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: patched = 13 · leftover = 0 · manager = t,t,t,t,f · keyer = t,t,f
--
--   SELECT
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.proname IN (
--         'withdraw_quotation_submission_atomic', 'withdraw_sales_order_submission_atomic',
--         'reject_quotation_submission_atomic', 'approve_quotation_with_signature_evidence_atomic',
--         'revoke_sales_order_approval_atomic', 'approve_sales_order_with_signature_evidence_atomic',
--         'approve_historical_sales_order', 'revise_approved_sales_order_atomic',
--         'replan_sales_order_installments', 'carry_sales_order_installments',
--         'create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order')
--         AND (strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0
--           OR strpos(p.prosrc, 'public.is_sales_keyer_role(p_actor_role)') > 0))           AS patched,
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND p.prosrc ~ 'p_actor_role[^;]*NOT IN \([^)]*''ae_supervisor''') AS leftover,
--     public.is_sales_manager_role('cco') AS cco, public.is_sales_manager_role('commercial_manager') AS cm,
--     public.is_sales_manager_role('ae_supervisor') AS ae_sup, public.is_sales_manager_role('admin') AS admin,
--     public.is_sales_manager_role('ac_supervisor') AS ac_sup_manager,
--     public.is_sales_keyer_role('senior_ac') AS senior_ac_keyer, public.is_sales_keyer_role('ac_supervisor') AS ac_sup_keyer,
--     public.is_sales_keyer_role('finance') AS finance_keyer;
-- ============================================================

BEGIN;

-- ── 1) ฟังก์ชันกลาง ───────────────────────────────────────────────────────
-- IMMUTABLE + ไม่อ่านตาราง ⇒ ผลขึ้นกับอาร์กิวเมนต์ล้วน · NULL/ว่าง = false เสมอ (fail-closed)
CREATE OR REPLACE FUNCTION public.is_sales_manager_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_role, '') IN ('admin', 'cco', 'commercial_manager', 'ae_supervisor');
$$;

CREATE OR REPLACE FUNCTION public.is_sales_keyer_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_role, '') IN ('admin', 'cco', 'commercial_manager', 'ae_supervisor', 'ac_supervisor', 'senior_ae', 'senior_ac', 'ae', 'ac');
$$;

COMMENT ON FUNCTION public.is_sales_manager_role(text) IS
  'ผู้มีอำนาจตัดสินของฝ่ายขาย (admin · CCO · CM · AE Supervisor) — ต้องตรงกับ SALES_MANAGER_ROLES ใน lib/permissions.js (mig 0382)';
COMMENT ON FUNCTION public.is_sales_keyer_role(text) IS
  'ผู้คีย์ใบสั่งขายย้อนหลัง (admin + ฝ่ายขายทุกตำแหน่ง) — ต้องตรงกับ HISTORICAL_KEYER_ROLES (mig 0382)';

-- แพตเทิร์น 0336: ถอนจาก PUBLIC/anon/authenticated · ให้ service_role (ฟังก์ชันที่เรียกบางตัวไม่ใช่ SECURITY DEFINER
-- ⇒ รันด้วยสิทธิ์ service_role ของ route จึงต้องเรียกตัวกลางได้)
REVOKE ALL ON FUNCTION public.is_sales_manager_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_manager_role(text) TO service_role;
REVOKE ALL ON FUNCTION public.is_sales_keyer_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_keyer_role(text) TO service_role;

-- ── 2) ปะ 13 ฟังก์ชัน ─────────────────────────────────────────────────────
-- old_expr = ข้อความเงื่อนไขตำแหน่งตรงตัวอักษรในนิยามล่าสุด (ไฟล์ที่อ้างในวงเล็บ) · new_expr = ตัวแทน
-- ⚠️ ห้ามจัดรูปข้อความ old_expr — เทียบแบบตัวอักษรต่อตัวอักษรกับ prosrc
DO $patch$
DECLARE
  r record;
  v_proc record;
  v_def text;
  v_hits int;
  v_patched int;
  v_already int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('withdraw_quotation_submission_atomic',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('withdraw_sales_order_submission_atomic',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('reject_quotation_submission_atomic',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('approve_quotation_with_signature_evidence_atomic',
        $o$(p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'ae_supervisor'))$o$,
        $n$(NOT public.is_sales_manager_role(p_actor_role))$n$),
      ('revoke_sales_order_approval_atomic',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('approve_sales_order_with_signature_evidence_atomic',
        $o$p_actor_role IS NULL OR p_actor_role NOT IN ('admin', 'ae_supervisor')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('create_historical_sales_order',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_keyer_role(p_actor_role)$n$),
      ('update_historical_sales_order',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_keyer_role(p_actor_role)$n$),
      ('submit_historical_sales_order',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_keyer_role(p_actor_role)$n$),
      ('approve_historical_sales_order',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('revise_approved_sales_order_atomic',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('replan_sales_order_installments',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin')$o$,
        $n$NOT public.is_sales_manager_role(p_actor_role)$n$),
      ('carry_sales_order_installments',
        $o$COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin', 'finance')$o$,
        $n$NOT (public.is_sales_manager_role(p_actor_role) OR COALESCE(p_actor_role, '') = 'finance')$n$)
    ) AS t(fn, old_expr, new_expr)
  LOOP
    v_patched := 0;
    v_already := 0;
    FOR v_proc IN
      SELECT p.oid, p.prosrc
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = r.fn
    LOOP
      v_hits := (length(v_proc.prosrc) - length(replace(v_proc.prosrc, r.old_expr, ''))) / length(r.old_expr);
      IF v_hits = 0 THEN
        -- รันซ้ำ: ปะไปแล้วรอบก่อน
        IF strpos(v_proc.prosrc, r.new_expr) > 0 THEN v_already := v_already + 1; END IF;
        CONTINUE;
      END IF;
      IF v_hits > 1 THEN
        RAISE EXCEPTION '0382: % มีเงื่อนไขตำแหน่งที่คาดไว้ % จุด (คาด 1) — ไม่ปะ ตรวจนิยามก่อน', r.fn, v_hits;
      END IF;
      v_def := pg_get_functiondef(v_proc.oid);
      EXECUTE replace(v_def, r.old_expr, r.new_expr);
      v_patched := v_patched + 1;
    END LOOP;
    IF v_patched = 0 AND v_already = 0 THEN
      RAISE EXCEPTION '0382: หาเงื่อนไขตำแหน่งของ % ไม่เจอ (ไม่มีฟังก์ชัน หรือนิยามต่างจากไฟล์ migration) — ไม่ปะ', r.fn;
    END IF;
    RAISE NOTICE '0382: % — ปะ % · ปะไว้แล้ว %', r.fn, v_patched, v_already;
  END LOOP;
END
$patch$;

-- ── 3) ตรวจท้าย: ต้องไม่เหลือรายชื่อตำแหน่งแบบเขียนตรงในฟังก์ชันอนุมัติของฝ่ายขาย ────────────
DO $verify$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_left
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ 'p_actor_role[^;]*NOT IN \([^)]*''ae_supervisor''';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION '0382: ยังเหลือฟังก์ชันที่เขียนรายชื่อตำแหน่งตรง ๆ: %', v_left;
  END IF;
END
$verify$;

COMMIT;
