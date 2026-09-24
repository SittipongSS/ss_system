-- ============================================================
--  Migration 0387: ผู้จัดการฝ่ายขายยกเลิกใบสั่งขายย้อนหลังที่อนุมัติแล้วได้ — งวดยกมาเป็นโมฆะตามใบ
--                  (มติเจ้าของ 24/09/2026 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ")
--
--  🐞 ต้นเรื่อง: ทางแก้ใบย้อนหลังที่อนุมัติแล้วข้อมูลผิดมีทางเดียวคือ "ยกเลิกใบ แล้วคีย์ใหม่" (มติ 22/09 · 0374) แต่
--     ขั้นอนุมัติ (0374 ข้อ ③) ดันงวดยกมาขึ้นเป็น "แจ้งชำระแล้ว" รอบัญชีรับรองให้เอง และ route ยกเลิกบล็อกทั้งงวดที่รอตรวจ
--     และงวดที่รับรองแล้ว ⇒ **ใบที่เพิ่งอนุมัติยกเลิกไม่ได้เลยทั้งที่ผู้ยกเลิกคือคนที่เพิ่งกดอนุมัติ** (รวม Admin) จนกว่า
--     บัญชีจะตีกลับ · และถ้าบัญชีรับรองไปแล้ว ต้องถอนคำรับรองแล้วตีกลับ ก่อนผู้จัดการจะกดยกเลิกได้
--
--  ⭐ มติเจ้าของ 24/09
--    · ผู้ยกเลิกใบที่อนุมัติแล้ว = ผู้จัดการฝ่ายขายที่อนุมัติได้ (CD · CM · AE Sup · Admin — ด่านสิทธิ์อยู่ที่ route เหมือนเดิม)
--    · **งวดยกมาเป็นโมฆะตามใบ** — รอบัญชีรับรอง: ฐานตีกลับให้ในทรานแซกชันเดียวกับการยกเลิก (เหตุบอกว่าเป็นการยกเลิก
--      ไม่ใช่บัญชีตัดสิน) · รับรองแล้ว: คงแถวไว้เป็นประวัติการรับรอง (ฝั่ง JS ถือว่าโมฆะตาม kind — ไม่ใช่เงินค้าง)
--    · **งวดปกติที่รับเงินในระบบหลังอนุมัติ (รับรองแล้ว/รอตรวจ) ยังบล็อก** — ใบย้อนหลังไม่มีทางยก/คืนเงิน (0378 เปิดเฉพาะ
--      ใบ pipeline) ⇒ บัญชีตีกลับก่อน — ที่รับรองแล้ว ถอนคำรับรองแล้วตีกลับ (ถอนอย่างเดียวแถวกลับเป็น reported ซึ่งยังบล็อก)
--      · ใบยังอนุมัติอยู่ ทำได้ตามปกติ — ไม่ใช่ทางตัน
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) historical_so_cancel_settle() + trigger sales_orders_historical_cancel_settle
--     AFTER UPDATE OF status ON sales_orders · เฉพาะใบย้อนหลังที่เพิ่งกลายเป็น cancelled
--       a) ล็อกงวดทุกแถวของใบ (FOR UPDATE) — การรับรอง/แจ้งของบัญชีที่เริ่มก่อนต้องจบก่อน แล้วค่อยตัดสิน
--       b) งวดปกติ (รวมแถวเก่าที่ไม่มี kind) ที่ confirmed/reported → RAISE historical_so_cancel_money_held
--          (route ตรวจงวดสดก่อนแล้ว — ตัวนี้คือกรณีแข่งกันพอดี · ทั้งคำสั่งถอย รวมการยกเลิกเอกสารแทนสัญญาของ 0374)
--       b2) งวดยกมาที่ confirmed + หมายเหตุยกเลิก (cancelReason) สั้นกว่า 10 ตัวอักษร → RAISE historical_so_cancel_note_required
--          🐞 review 25/09: หมายเหตุบังคับ (มติ 24/09) เคยตัดสินฝั่ง JS จากงวดที่อ่านก่อน UPDATE — บัญชีรับรองแทรกระหว่างอ่านกับเขียน
--             = เงินที่รับรองแล้วโมฆะโดยไม่มีเหตุ ⇒ ตัดสินซ้ำที่นี่หลังล็อกงวด (ค่าที่ commit ล่าสุด) · นับ length() = charLength ฝั่ง JS
--       c) งวดยกมาที่ reported → rejected พร้อมเหตุ "ยกเลิกตามใบ… ไม่ใช่การตีกลับของบัญชี"
--          ⇒ ออกจากคิว "รอคุณรับรอง" และป้ายเมนูของบัญชี (ตัวนับอ่าน status='reported' ดิบ) ในทรานแซกชันเดียวกัน
--          ⛔ ห้ามทำฝั่ง JS: พลิกก่อน/หลัง UPDATE แล้วล้มกลางทาง = ใบอนุมัติอยู่แต่งวดยกมาถูกตีกลับ (หรือกลับกัน)
--       · งวดยกมาที่ confirmed ไม่แตะ — ประวัติว่าบัญชีรับรองเมื่อไร โดยใคร
--       · ชื่อ trigger เรียงก่อน sales_orders_historical_void_contract_upd (AFTER trigger ยิงตามลำดับชื่อ) — RAISE แล้วไม่มีอะไรค้าง
--  2) historical_so_installment_order_live() + trigger sales_order_installments_historical_cancelled_guard
--     BEFORE INSERT OR UPDATE OF status ON sales_order_installments · เฉพาะแถวที่กำลัง **กลายเป็น** reported/confirmed
--       ⇒ RAISE historical_so_installment_order_cancelled ถ้าใบเป็นใบย้อนหลังที่ยกเลิกแล้ว
--     🐞 race ฝั่งกลับ: route งวดอ่านใบเป็น "อนุมัติ" → ผู้จัดการยกเลิกสำเร็จ → UPDATE ของบัญชี/ฝ่ายขายลงทีหลัง = งวดปกติ
--        ที่มีเงินบนใบย้อนหลังที่ยกเลิก (ไม่มีทางออก: ล็อกทั้งใบของ JS ปิดทุกคำสั่ง · ไม่มียก/คืน)
--     · อ่านใบแบบไม่ล็อก — ล็อกใบจากฝั่งงวดกลับลำดับกับข้อ 1 (ใบ → งวด) = deadlock · ข้อ 1 ล็อกงวดไว้แล้ว:
--       ใครถือแถวงวดก่อน อีกฝ่ายรอ แล้วคำสั่งถัดไปของ plpgsql เห็นค่าที่ commit แล้ว (READ COMMITTED) ⇒ ปิดครบสองลำดับ
--     · ใบ pipeline ไม่แตะ — บัญชีรับรอง/ตีกลับงวดของใบ pipeline ที่ยกเลิกได้ตามปกติ (PR0/PR3 · เงินค้าง)
--  3) สิทธิ์: ฟังก์ชัน trigger ทั้งสองถูกเรียกจาก trigger เท่านั้น ⇒ REVOKE ทุก role (แพตเทิร์น 0374)
--     · SECURITY DEFINER — ผู้ยกเลิก/ผู้แก้งวดอาจเป็น client ที่ติด RLS · ต้องอ่าน/เขียนงวดและอ่านใบได้ครบเสมอ
--  4) historical_so_cancel_settle_ready() — ตัวถามความพร้อม (อ่านอย่างเดียว · review 25/09 fail closed)
--     ตอบ true เมื่อ trigger สองตัวของไฟล์นี้อยู่ **และเปิดอยู่** (tgenabled O/A) · GRANT service_role (route) อย่างเดียว
--     🐞 route ปล่อยงวดยกมาที่มีเงินให้ข้อ 1 จัดการ — ถ้าโค้ดขึ้นก่อนไฟล์นี้ (deploy อัตโนมัติวันละ 3 รอบไม่ถามมิก) ยกเลิกผ่านโดยไม่มี
--        ใครตีกลับ = งวดยกมาค้าง reported บนใบที่ยกเลิกถาวร (ล็อกทั้งใบปิดปุ่มบัญชี · ป้ายเมนูบัญชี +1) และรันไฟล์นี้ทีหลังไม่ซ่อม
--        (trigger ข้อ 1 ยิงตอนเปลี่ยนสถานะเท่านั้น) ⇒ route ถามตัวนี้ก่อนเขียน: ไม่มีฟังก์ชัน/ตอบ false = บล็อกแบบก่อนมติ 24/09
--
--  ⛔ ไม่แตะ: CHECK/enum (origin_shape ยอมใบย้อนหลัง cancelled ที่มี approvedAt อยู่แล้ว · state_sane ของงวดผ่าน: rejected มี
--     rejectedAt + เหตุ ≥ 10 ตัวอักษร) · RPC ใด ๆ · trigger ของ 0374 · ยอด/Actual (ใบย้อนหลังไม่นับอยู่แล้ว)
--  ⛔ ไม่ backfill — ไม่มีทางไหนสร้างงวดที่มีเงินบนใบย้อนหลังที่ยกเลิกได้: route ก่อนมติบล็อกทั้ง reported และ confirmed · route หลังมติ
--     ปล่อยงวดยกมาที่มีเงินเฉพาะเมื่อข้อ 4 ตอบ true (= trigger ข้อ 1 อยู่แล้ว) ⇒ ตรวจด้วยคำสั่งข้อ ③ ข้างล่าง (คาด 0 แถว)
--
--  ✅ รันซ้ำได้ (CREATE OR REPLACE FUNCTION · DROP TRIGGER IF EXISTS แล้วสร้างใหม่ · REVOKE ซ้ำได้)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · รันก่อนหรือหลัง deploy โค้ดก็ได้ (route ถามข้อ 4 ก่อนเขียน = fail closed):
--     · รันก่อน: โค้ดเดิมตอบ 400 ก่อนถึง UPDATE ทุกใบที่งวดมีเงิน/รอตรวจ ⇒ ข้อ 1 ไม่มีอะไรให้ทำ · ข้อ 2 ปิดแค่ race
--     · deploy ก่อน: route ถามข้อ 4 ไม่เจอ (PGRST202) ⇒ ยกเลิกใบที่งวดยกมามีเงินยังไม่ได้ (503 "ยังไม่ได้รัน migration 0387" +
--       ทางออกเดิม: บัญชีตีกลับงวดยกมาก่อน) · ใบอื่นยกเลิกได้ตามเดิม · ไม่มีงวดค้าง — รันไฟล์นี้แล้วสิทธิ์ใหม่เปิดเอง
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  ① trigger สองตัว (คาด 2 แถว · tgenabled = 'O')
--   SELECT tgname, tgrelid::regclass AS on_table, tgenabled
--     FROM pg_trigger
--    WHERE tgname IN ('sales_orders_historical_cancel_settle', 'sales_order_installments_historical_cancelled_guard')
--      AND NOT tgisinternal
--    ORDER BY tgname;
--  ② ฟังก์ชันสองตัวเป็น SECURITY DEFINER และไม่มีใครเรียกตรงได้ (คาด 2 แถว · prosecdef = true · anon/auth/service = false)
--   SELECT p.proname, p.prosecdef,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('historical_so_cancel_settle', 'historical_so_installment_order_live')
--    ORDER BY p.proname;
--  ④ ตัวถามความพร้อมที่ route ใช้ (คาด true) · สิทธิ์: service_role เรียกได้ · anon/authenticated ไม่ได้ · ไม่ใช่ SECURITY DEFINER
--   SELECT public.historical_so_cancel_settle_ready();
--   SELECT p.prosecdef,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'historical_so_cancel_settle_ready';     -- คาด f · f · f · t
--  ③ ใบย้อนหลังที่ยกเลิกแล้วแต่ยังมีงวดที่มีเงิน/รอตรวจ (คาด 0 แถว — ถ้ามี ให้บัญชี/แอดมินดูเป็นรายใบ)
--     ⚠️ งวดยกมาที่ confirmed บนใบที่ยกเลิกหลังไฟล์นี้ = ประวัติการรับรองที่เป็นโมฆะตามใบ (ถูกต้อง) — ตัดออกจากคำถาม
--   SELECT o."orderNumber", i.seq, i.kind, i.status, i.amount
--     FROM public.sales_order_installments i
--     JOIN public.sales_orders o ON o.id = i."salesOrderId"
--    WHERE o.origin = 'historical' AND o.status = 'cancelled' AND i.status IN ('reported', 'confirmed')
--      AND NOT (i.kind = 'opening' AND i.status = 'confirmed')
--    ORDER BY o."orderNumber", i.seq;
--
--  ── ลองจริงบนฐานก่อนใช้งาน (ไม่ทิ้งของ — จบด้วย ROLLBACK) ───────────────────────────
--  แทน <SO ย้อนหลังที่อนุมัติแล้วและงวดยกมารอบัญชีรับรอง> ก่อนรัน · หลังรันไฟล์นี้แล้วเท่านั้น
--   BEGIN;
--   UPDATE public.sales_orders
--      SET status = 'cancelled', "cancelledAt" = now(), "cancelledBy" = 'smoke 0387',
--          "cancelReasonCode" = 'reissue_correction', "cancelReason" = 'ทดสอบ 0387 — ยกเลิกเพื่อคีย์ใหม่', "updatedAt" = now()
--    WHERE id = '<soId>' AND origin = 'historical' AND status = 'approved';            -- คาด UPDATE 1
--   SELECT kind, status, "rejectedByName", "rejectedReason"
--     FROM public.sales_order_installments WHERE "salesOrderId" = '<soId>' ORDER BY seq; -- งวดยกมา: rejected · เหตุ "ยกเลิกตามใบ…"
--   SELECT status FROM public.sales_contracts WHERE metadata->>'historicalSalesOrderId' = '<soId>';  -- cancelled (0374)
--   UPDATE public.sales_order_installments SET status = 'reported', "reportedAt" = now()
--    WHERE "salesOrderId" = '<soId>' AND kind = 'regular' AND status = 'pending';      -- คาด ERROR historical_so_installment_order_cancelled
--   ROLLBACK;
--  (ใบที่งวดยกมารับรองแล้ว: ตั้ง "cancelReason" = 'สั้น' ใน UPDATE แรก → คาด ERROR historical_so_cancel_note_required)
-- ============================================================

BEGIN;

-- ── 1) ยกเลิกใบย้อนหลัง: ล็อกงวด → ด่านเงินของงวดปกติ → ตีกลับงวดยกมาที่รอตรวจ ─────────────────────────────
CREATE OR REPLACE FUNCTION public.historical_so_cancel_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_held int;
BEGIN
  -- a) การรับรอง/แจ้งที่กำลังเขียนงวดของใบนี้ต้องจบก่อน — แถวที่ล็อกได้แล้วคือค่าที่ commit ล่าสุด
  PERFORM 1
     FROM public.sales_order_installments i
    WHERE i."salesOrderId" = NEW.id
      FOR UPDATE;

  -- b) งวดปกติที่รับเงินในระบบหลังอนุมัติ = บล็อก (บัญชีตีกลับก่อน · ที่รับรองแล้วถอนคำรับรองแล้วตีกลับ) · แถวเก่าที่ไม่มี kind = งวดปกติ
  SELECT count(*)::int INTO v_held
    FROM public.sales_order_installments i
   WHERE i."salesOrderId" = NEW.id
     AND COALESCE(i.kind, 'regular') <> 'opening'
     AND i.status IN ('confirmed', 'reported');
  IF v_held > 0 THEN
    RAISE EXCEPTION 'historical_so_cancel_money_held: % (% งวด)', NEW."orderNumber", v_held;
  END IF;

  -- b2) งวดยกมาที่รับรองแล้ว = หมายเหตุบังคับ ≥ 10 ตัวอักษร (มติ 24/09) — ตัวตัดสินจริง: route ตรวจจากงวดที่อ่านก่อน UPDATE
  --     บัญชีรับรองแทรกระหว่างอ่านกับเขียน = เงินที่รับรองแล้วโมฆะโดยไม่มีเหตุ · นับ length() แบบเดียวกับ charLength ฝั่ง JS
  IF EXISTS (SELECT 1
               FROM public.sales_order_installments i
              WHERE i."salesOrderId" = NEW.id
                AND i.kind = 'opening'
                AND i.status = 'confirmed')
     AND length(btrim(COALESCE(NEW."cancelReason", ''))) < 10 THEN
    RAISE EXCEPTION 'historical_so_cancel_note_required: %', NEW."orderNumber";
  END IF;

  -- c) งวดยกมาที่รอบัญชีรับรอง → ตีกลับตามใบ (เหตุ ≥ 10 ตัวอักษร ผ่าน CHECK state_sane) · ที่รับรองแล้วคงไว้เป็นประวัติ
  UPDATE public.sales_order_installments i
     SET status = 'rejected',
         "rejectedAt" = now(),
         "rejectedById" = NULL,
         "rejectedByName" = NEW."cancelledBy",
         "rejectedReason" = left('ยกเลิกตามใบสั่งขายย้อนหลัง ' || NEW."orderNumber"
                                 || ' — งวดยกมาเป็นโมฆะ ไม่ใช่การตีกลับของบัญชี', 500),
         "updatedAt" = now()
   WHERE i."salesOrderId" = NEW.id
     AND i.kind = 'opening'
     AND i.status = 'reported';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_historical_cancel_settle ON public.sales_orders;
CREATE TRIGGER sales_orders_historical_cancel_settle
AFTER UPDATE OF status ON public.sales_orders
FOR EACH ROW
WHEN (NEW.origin = 'historical' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.historical_so_cancel_settle();

-- ── 2) ฝั่งงวด: งวดของใบย้อนหลังที่ยกเลิกแล้ว แจ้ง/รับรองไม่ได้อีก (ปิด race ฝั่งกลับของข้อ 1) ─────────────────────
CREATE OR REPLACE FUNCTION public.historical_so_installment_order_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  -- แก้ช่องอื่นของแถวที่เป็น reported/confirmed อยู่แล้ว (สถานะไม่ขยับ) ไม่ใช่การรับเงินใหม่
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  -- ⚠️ ไม่ล็อกใบ (FOR UPDATE/SHARE) — ลำดับล็อกของตัวยกเลิกคือ ใบ → งวด · ฝั่งนี้ถืองวดอยู่แล้ว
  SELECT o.origin, o.status, o."orderNumber" INTO v_order
    FROM public.sales_orders o
   WHERE o.id = NEW."salesOrderId";
  IF FOUND AND v_order.origin = 'historical' AND v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'historical_so_installment_order_cancelled: %', v_order."orderNumber";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_installments_historical_cancelled_guard ON public.sales_order_installments;
CREATE TRIGGER sales_order_installments_historical_cancelled_guard
BEFORE INSERT OR UPDATE OF status ON public.sales_order_installments
FOR EACH ROW
WHEN (NEW.status IN ('reported', 'confirmed'))
EXECUTE FUNCTION public.historical_so_installment_order_live();

-- ── 3) สิทธิ์: เรียกจาก trigger เท่านั้น ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.historical_so_cancel_settle() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_installment_order_live() FROM PUBLIC, anon, authenticated, service_role;

-- ── 4) ตัวถามความพร้อมของ route (fail closed · review 25/09): trigger สองตัวข้างบนอยู่และเปิดอยู่ ─────────────────────
--    ⚠️ tgenabled 'O'/'A' เท่านั้นที่ยิงในโหมดปกติ ('D' ปิด · 'R' ยิงเฉพาะโหมด replica) · อ่านแค็ตตาล็อก ไม่แตะข้อมูล
CREATE OR REPLACE FUNCTION public.historical_so_cancel_settle_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1
                   FROM pg_catalog.pg_trigger t
                  WHERE t.tgrelid = 'public.sales_orders'::regclass
                    AND t.tgname = 'sales_orders_historical_cancel_settle'
                    AND NOT t.tgisinternal
                    AND t.tgenabled IN ('O', 'A'))
     AND EXISTS (SELECT 1
                   FROM pg_catalog.pg_trigger t
                  WHERE t.tgrelid = 'public.sales_order_installments'::regclass
                    AND t.tgname = 'sales_order_installments_historical_cancelled_guard'
                    AND NOT t.tgisinternal
                    AND t.tgenabled IN ('O', 'A'));
$$;

REVOKE ALL ON FUNCTION public.historical_so_cancel_settle_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.historical_so_cancel_settle_ready() TO service_role;

COMMIT;
