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
--      ใบ pipeline) ⇒ บัญชีถอนคำรับรอง/ตีกลับก่อน (ใบยังอนุมัติอยู่ ทำได้ตามปกติ — ไม่ใช่ทางตัน)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) historical_so_cancel_settle() + trigger sales_orders_historical_cancel_settle
--     AFTER UPDATE OF status ON sales_orders · เฉพาะใบย้อนหลังที่เพิ่งกลายเป็น cancelled
--       a) ล็อกงวดทุกแถวของใบ (FOR UPDATE) — การรับรอง/แจ้งของบัญชีที่เริ่มก่อนต้องจบก่อน แล้วค่อยตัดสิน
--       b) งวดปกติ (รวมแถวเก่าที่ไม่มี kind) ที่ confirmed/reported → RAISE historical_so_cancel_money_held
--          (route ตรวจงวดสดก่อนแล้ว — ตัวนี้คือกรณีแข่งกันพอดี · ทั้งคำสั่งถอย รวมการยกเลิกเอกสารแทนสัญญาของ 0374)
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
--
--  ⛔ ไม่แตะ: CHECK/enum (origin_shape ยอมใบย้อนหลัง cancelled ที่มี approvedAt อยู่แล้ว · state_sane ของงวดผ่าน: rejected มี
--     rejectedAt + เหตุ ≥ 10 ตัวอักษร) · RPC ใด ๆ · trigger ของ 0374 · ยอด/Actual (ใบย้อนหลังไม่นับอยู่แล้ว)
--  ⛔ ไม่ backfill — ใบย้อนหลังที่ยกเลิกก่อนไฟล์นี้ไม่มีงวดที่มีเงิน (route เดิมบล็อกทั้ง reported และ confirmed)
--     ⇒ ตรวจด้วยคำสั่งข้อ ③ ข้างล่าง (คาด 0 แถว)
--
--  ✅ รันซ้ำได้ (CREATE OR REPLACE FUNCTION · DROP TRIGGER IF EXISTS แล้วสร้างใหม่ · REVOKE ซ้ำได้)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · รันก่อนหรือหลัง deploy โค้ดก็ได้:
--     · รันก่อน: โค้ดเดิมตอบ 400 ก่อนถึง UPDATE ทุกใบที่งวดมีเงิน/รอตรวจ ⇒ ข้อ 1 ไม่มีอะไรให้ทำ · ข้อ 2 ปิดแค่ race
--     · deploy ก่อน: ผู้จัดการยกเลิกใบที่งวดยกมารอตรวจได้ แต่งวดค้าง reported บนใบที่ยกเลิก (คิว/ป้ายบัญชี) จนกว่าจะรัน
--       ⇒ **แนะนำรันก่อน deploy**
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

  -- b) งวดปกติที่รับเงินในระบบหลังอนุมัติ = บล็อก (บัญชีถอนคำรับรอง/ตีกลับก่อน) · แถวเก่าที่ไม่มี kind = งวดปกติ
  SELECT count(*)::int INTO v_held
    FROM public.sales_order_installments i
   WHERE i."salesOrderId" = NEW.id
     AND COALESCE(i.kind, 'regular') <> 'opening'
     AND i.status IN ('confirmed', 'reported');
  IF v_held > 0 THEN
    RAISE EXCEPTION 'historical_so_cancel_money_held: % (% งวด)', NEW."orderNumber", v_held;
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

COMMIT;
