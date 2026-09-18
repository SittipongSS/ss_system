-- ============================================================
--  Migration 0366: ถอดจุดติดตั้งออกจากใบสั่งขายย้อนหลัง + คิดเงินหัวใบใหม่ในทรานแซกชันเดียว
--                  (มติผู้ใช้ 16/09/2026 ข้อ 23 ส่วน ข2 · บรีฟ §3B ข้อ 23 ทาง ก)
--
--  🐞 **ทางเดียวที่ฝ่ายขายมีวันนี้คือ "ปิดจุด เก็บยอด"** (ข1 · mig 0362) — จุดที่ไม่มีอยู่จริง
--    ยังกินยอดอยู่ในใบตลอดไป · ใบที่ลูกค้าเลิกสาขาไปครึ่งหนึ่งจึงมีมูลค่าสูงกว่าสัญญาจริง
--    และไม่มีทางแก้นอกจากให้แอดมินลบทั้งใบแล้วคีย์ใหม่ (ซึ่งฆ่ารอบบริการของจุดที่ TS หาเจอ)
--  🐞 **คิดเงินหัวใบใหม่ด้วยมือไม่ได้** — ไม่มีตัวเขียนไหนในระบบที่คิดยอดหัวใบจากบรรทัดที่เหลือเลย
--    ทุกเส้นวันนี้ก๊อปยอดมาจากใบเสนอราคา หรือรับค่าที่ JS คิดมาแล้ว ⇒ ต้องมีฟังก์ชันของมันเอง
--
--  ⭐ กติกา
--  · **ลบบรรทัด + คิดเงินหัวใบใหม่ ต้องอยู่ทรานแซกชันเดียว** — ครึ่งทางคือใบที่ยอดหัวไม่ตรงบรรทัด
--    ซึ่ง `create_historical_sales_order` ถือเป็น `historical_so_money_mismatch` มาตั้งแต่ต้น
--  · **ถอดได้เฉพาะจุดที่ TS แจ้งว่าไม่พบ และฝ่ายขายยังไม่ตัดสิน** (`siteNotFoundAt` ไม่ว่าง ·
--    `siteClosedAt` ว่าง) — ฝ่ายขายถอดบรรทัดของตัวเองเงียบ ๆ ไม่ได้ ต้องมีข้อเท็จจริงจากหน้างานก่อน
--    ⇒ เป็นทางที่สามของการ์ดตัดสิน ไม่ใช่ปุ่มลอยบนตารางบรรทัด
--  · **ห้ามถอดบรรทัดสุดท้าย** — ใบที่ไม่มีบรรทัดเลยคือใบที่ไม่มีความหมาย (ยกเลิกใบไปเลยดีกว่า)
--  · **ห้ามถอดบรรทัดที่ TS ผูกโซนแล้ว** — FK ของ `service_zone_terms` เป็น ON DELETE CASCADE
--    (0297) ⇒ ลบบรรทัดคือลบรอบขายของโซนทิ้งเงียบ ๆ พร้อมประวัติการบริการทั้งเส้น
--    (ด่านของ 0362 กันไว้ตอน "ติดธง" อยู่แล้ว แต่ต้องกันซ้ำที่นี่ — โซนอาจถูกผูกก่อนติดธงในอดีต)
--  · **ห้ามถอดเมื่อใบมีส่วนลดหัวใบ** (`discountAmount > 0`) — ไม่มีกติกาว่าส่วนลดก้อนนั้นเฉลี่ย
--    ลงบรรทัดยังไง · ใบย้อนหลังที่ RPC ข้อ 6 สร้างไม่เคยมีส่วนลด (เขียน 0 ตายตัว) ⇒ ถ้าเจอ
--    แปลว่ามีคนแก้ด้วยมือ ต้องให้คนตัดสิน ไม่ใช่ให้ฟังก์ชันเดา
--  · **งวดที่คีย์ไว้ต้องไม่เกินยอดใหม่** — เกณฑ์เดียวกับ `append_historical_installments`
--    (นับทุกสถานะรวมงวดที่บัญชีตีกลับ · เผื่อ 0.01)
--  · เหตุผล 10–500 ตัวอักษร (เท่าเหตุผลยกเว้นด่านเงินของ 0360) · audit เก็บบรรทัดเต็มจาก `RETURNING`
--
--  ── VAT คิดใหม่จากสัดส่วนเดิม ไม่ใช่จากอัตราที่เก็บไว้ ─────────────────────────────
--  🪤 **`sales_orders` ไม่มีคอลัมน์ `vatRate`** — อัตราเป็นค่าที่ผู้คีย์เลือกตอนกรอก แล้ว JS
--     (`splitHistoricalAmounts`) แตกเป็น subtotal/vat ก่อนส่งเข้า RPC · หลังบันทึกอัตราหายไป
--  ⇒ ยอด VAT ใหม่ = `round(subtotal_ใหม่ × vat_เดิม / subtotal_เดิม, 2)` ซึ่งรักษาอัตราเดิมไว้
--     โดยไม่ต้องเดาว่าเป็น 0 หรือ 7 · ใบที่ subtotal เดิมเป็น 0 ⇒ VAT ใหม่ = 0
--  ⚠️ ยอดรวมคิดจาก `subtotal + vat` เสมอ **ห้ามลบยอดบรรทัดออกจาก totalAmount ตรง ๆ**
--     เพราะเศษปัดของ VAT จะสะสมจนใบเสีย invariant ของ 0360 (`|subtotal - discount + vat - total| ≤ 0.01`)
--  ⚠️ `actualAmount = GREATEST(0, total - vat)` สูตรเดียวกับทุกตัวเขียน SO ในระบบ
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) RPC `remove_historical_sales_order_line(p_order_id, p_line_id, p_actor_id, p_actor_name, p_reason)`
--     → ล็อกหัวใบ → ด่าน 8 ชั้น → ลบบรรทัด → คิดเงินหัวใบใหม่ → คืน jsonb ของใบ+บรรทัดที่ถอด
--
--  ⛔ ไม่แตะ: sales_order_installments (ยอดงวดที่คีย์ไว้เท่าเดิมทุกบาท — ตรวจว่าไม่เกินยอดใหม่เท่านั้น) ·
--     service_plans (ไม่มี FK ถึงบรรทัด) · ตัวคำนวณ Actual ของดีล (ใบย้อนหลังถูกกรองออกตั้งแต่ 0360)
--  ⛔ ไม่ backfill — ฟังก์ชันล้วน ไม่มี DDL ของตาราง
--  🔐 สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated + GRANT service_role (แพตเทิร์น 0336/0360)
--
--  🛑 **รันก่อน merge โค้ด JS ของ ข2** — route เรียก RPC ตัวนี้ · ขึ้นก่อนรัน = PGRST202
--     ⇒ ปุ่ม "ถอดออกจากใบ" บนการ์ดตัดสินตอบ 500 (จอส่วนอื่นไม่กระทบ เพราะไม่มีใครเรียก)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (CREATE OR REPLACE FUNCTION)
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — บล็อกจบด้วย ROLLBACK) ──────────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ด้วยบล็อก "ลองจริง" ข้างล่าง
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อก "ลองจริง" ทั้งก้อน โดยนำหน้าด้วย BEGIN;
--  ⚠️ ยังไม่มีใบย้อนหลังบนฐานจริงสักใบ (origin = 'historical' = 0 แถว ณ 18/09) ⇒ บล็อกนี้
--     สร้างใบทดสอบเองด้วย RPC ของ 0360 ก่อน แล้วค่อยถอดบรรทัด — แทนค่า <...> ให้ครบก่อนรัน
--
--   SELECT public.create_historical_sales_order(
--     'smoke-0366', repeat('b', 64), '<adminUserId>', 'smoke 0366', 'admin',
--     '{"customerId":"<customerId>","ownerId":"<aeUserId>","team":"<teamCode>","orderDate":"2024-06-01",
--       "subtotal":200,"vatAmount":14,"totalAmount":214}',
--     '[{"installationPoint":"จุด A 0366","qty":1,"unitPrice":100,"lineTotal":100},
--       {"installationPoint":"จุด B 0366","qty":1,"unitPrice":100,"lineTotal":100}]',
--     '[]',
--     '{"id":"DEAL-smoke0366","historyId":"DSH-smoke0366","title":"ทดสอบ 0366","ownerName":"<ชื่อ AE>",
--       "month":"26","prefix":"DL-2609","width":5}'
--   ) ->> 'dealCreated';
--   -- ติดธงให้บรรทัด B ก่อน (ปกติ TS เป็นคนกด) แล้วค่อยถอด
--   UPDATE public.sales_order_lines SET "siteNotFoundAt" = now(), "siteNotFoundById" = 'smoke',
--          "siteNotFoundReason" = 'branch_closed'
--    WHERE "salesOrderId" = 'SOR-H' || substr(md5('smoke-0366'), 1, 16) AND "installationPoint" = 'จุด B 0366';
--   SELECT public.remove_historical_sales_order_line(
--     'SOR-H' || substr(md5('smoke-0366'), 1, 16),
--     (SELECT id FROM public.sales_order_lines
--       WHERE "salesOrderId" = 'SOR-H' || substr(md5('smoke-0366'), 1, 16)
--         AND "installationPoint" = 'จุด B 0366'),
--     '<adminUserId>', 'smoke 0366', 'ทดสอบถอดบรรทัดออกจากใบย้อนหลัง'
--   ) -> 'order';                          -- คาด subtotal 100 · vatAmount 7 · totalAmount 107 · actualAmount 100
--   DO $$ BEGIN   -- ถอดบรรทัดสุดท้ายไม่ได้ · ถอดจุดที่ไม่มีธงไม่ได้
--     BEGIN PERFORM public.remove_historical_sales_order_line(
--             'SOR-H' || substr(md5('smoke-0366'), 1, 16),
--             (SELECT id FROM public.sales_order_lines
--               WHERE "salesOrderId" = 'SOR-H' || substr(md5('smoke-0366'), 1, 16) LIMIT 1),
--             '<adminUserId>', 'smoke 0366', 'ทดสอบถอดบรรทัดสุดท้าย');
--           RAISE EXCEPTION 'SMOKE FAIL 1'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 1: %', SQLERRM; END;
--   END $$;                                                          -- คาด NOTICE ok 1
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT proname FROM pg_proc WHERE proname = 'remove_historical_sales_order_line';   -- คาด 1 แถว
--   SELECT r.role, has_function_privilege(r.role, f.sig, 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role),
--          (VALUES ('public.remove_historical_sales_order_line(text,text,text,text,text)')) AS f(sig);
--                                                     -- anon/authenticated = false · service_role = true
--   SELECT count(*) FROM public.sales_orders
--    WHERE origin = 'historical' AND abs(subtotal - "discountAmount" + "vatAmount" - "totalAmount") > 0.01;
--                                                     -- คาด 0 (ยอดหัวใบสมดุลทุกใบ)
--   แล้วรัน `npm run check:columns` กับ `npm run check:rowcap` ในเครื่อง (ต้องเขียวก่อน merge คอมมิต JS)
-- ============================================================

BEGIN;

-- ── 1) ถอดจุดติดตั้งออกจากใบ + คิดเงินหัวใบใหม่ ──────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_historical_sales_order_line(
  p_order_id   text,
  p_line_id    text,
  p_actor_id   text,
  p_actor_name text,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order      public.sales_orders%ROWTYPE;
  v_line       public.sales_order_lines%ROWTYPE;
  v_reason     text;
  v_left       integer;
  v_subtotal   numeric;
  v_vat        numeric;
  v_total      numeric;
  v_paid       numeric;
BEGIN
  -- ① ตัวตน + เหตุผล (เท่าเหตุผลยกเว้นด่านเงินของ 0360)
  IF COALESCE(btrim(p_actor_id), '') = '' THEN RAISE EXCEPTION 'historical_so_actor_required'; END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'historical_so_line_remove_reason_invalid';
  END IF;

  -- ② ล็อกหัวใบก่อนอ่านอะไรทั้งนั้น — สองคนกดถอดคนละบรรทัดพร้อมกัน ยอดหัวใบต้องไม่ทับกัน
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'historical_so_not_found'; END IF;
  IF v_order.origin <> 'historical' THEN RAISE EXCEPTION 'historical_so_line_remove_pipeline'; END IF;
  IF v_order.status <> 'approved' THEN RAISE EXCEPTION 'historical_so_line_remove_status'; END IF;
  -- ส่วนลดหัวใบไม่มีกติกาเฉลี่ยลงบรรทัด ⇒ ไม่เดา (ใบที่ RPC ข้อ 6 สร้างเขียน 0 ตายตัว)
  IF COALESCE(v_order."discountAmount", 0) > 0 THEN
    RAISE EXCEPTION 'historical_so_line_remove_has_discount';
  END IF;

  -- ③ บรรทัดต้องเป็นของใบนี้ และต้องเป็นจุดที่ TS แจ้งไว้แล้วแต่ยังไม่ถูกตัดสิน
  SELECT * INTO v_line FROM public.sales_order_lines
   WHERE id = p_line_id AND "salesOrderId" = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'historical_so_line_not_found'; END IF;
  IF v_line."siteNotFoundAt" IS NULL THEN RAISE EXCEPTION 'historical_so_line_remove_not_flagged'; END IF;
  IF v_line."siteClosedAt" IS NOT NULL THEN RAISE EXCEPTION 'historical_so_line_remove_decided'; END IF;

  -- ④ TS ผูกโซนแล้วถอดไม่ได้ — FK ของ service_zone_terms เป็น CASCADE (0297) ลบบรรทัด = ลบรอบขายทิ้งเงียบ ๆ
  IF EXISTS (SELECT 1 FROM public.service_zone_terms t WHERE t."salesOrderLineId" = p_line_id) THEN
    RAISE EXCEPTION 'historical_so_line_remove_allocated';
  END IF;

  -- ⑤ ห้ามถอดบรรทัดสุดท้าย — ใบที่ไม่เหลือบรรทัดเลยควรถูกยกเลิกทั้งใบ ไม่ใช่ถอดจนหมด
  SELECT count(*) INTO v_left FROM public.sales_order_lines WHERE "salesOrderId" = p_order_id;
  IF v_left <= 1 THEN RAISE EXCEPTION 'historical_so_line_remove_last_line'; END IF;

  -- ⑥ ยอดใหม่ — VAT คิดจากสัดส่วนเดิมของใบ (ไม่มีคอลัมน์ vatRate ให้อ่าน · เหตุผลเต็มที่หัวไฟล์)
  v_subtotal := COALESCE(v_order.subtotal, 0) - COALESCE(v_line."lineTotal", 0);
  IF v_subtotal < 0 THEN v_subtotal := 0; END IF;
  IF COALESCE(v_order.subtotal, 0) > 0 THEN
    v_vat := round(v_subtotal * COALESCE(v_order."vatAmount", 0) / v_order.subtotal, 2);
  ELSE
    v_vat := 0;
  END IF;
  v_total := round(v_subtotal, 2) + v_vat;
  v_subtotal := round(v_subtotal, 2);

  -- ⑦ งวดที่คีย์ไว้ต้องไม่เกินยอดใหม่ — เกณฑ์เดียวกับ append_historical_installments
  --    (นับทุกสถานะ งวดที่บัญชีตีกลับยังเป็นยอดที่ต้องเก็บ · เผื่อ 0.01)
  SELECT COALESCE(sum(amount), 0) INTO v_paid
    FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;
  IF v_paid > v_total + 0.01 THEN RAISE EXCEPTION 'historical_so_line_remove_installments_over'; END IF;

  -- ⑧ ใบที่เหลือยอด 0 ต้องมีการยกเว้นด่านเงินอยู่แล้ว ไม่งั้นนัดบริการติดด่านทุกครั้งโดยไม่มีทางปลด
  IF v_total = 0 AND v_order."paymentGateExemptAt" IS NULL THEN
    RAISE EXCEPTION 'historical_so_line_remove_zero_needs_exemption';
  END IF;

  -- ⑨ ลบบรรทัด แล้วคิดเงินหัวใบใหม่ในทรานแซกชันเดียวกัน
  DELETE FROM public.sales_order_lines WHERE id = p_line_id;

  UPDATE public.sales_orders SET
    subtotal       = v_subtotal,
    "vatAmount"    = v_vat,
    "totalAmount"  = v_total,
    "actualAmount" = GREATEST(0, v_total - v_vat),
    "updatedAt"    = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'removedLine', to_jsonb(v_line),
    'reason', v_reason,
    'actorId', p_actor_id,
    'actorName', p_actor_name,
    'linesLeft', v_left - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_historical_sales_order_line(text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_historical_sales_order_line(text, text, text, text, text)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ถอยกลับ ────────────────────────────────────────────────────────────────
--   DROP FUNCTION public.remove_historical_sales_order_line(text, text, text, text, text);
