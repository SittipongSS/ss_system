-- ============================================================
--  Migration 0379: บรรทัดโซนของใบสั่งขายย้อนหลัง = บรรทัดใบเสนอราคา
--                  (จำนวน × ราคา/หน่วยจากทะเบียน − ส่วนลดรายการ = จำนวนเงิน · มติเจ้าของ 23/09/2026)
--
--  🐞 **ทำไม** — ขั้น ② ของฟอร์มคีย์ (0374) ถามต่อโซนว่า "แพ็ค" + "รอบในสัญญา" + ยอดที่ **พิมพ์เอง**
--     พร้อมปุ่มลัด "ราคาแพ็คเกจ × แพ็ค × เดือน" ⇒ ผู้คีย์สับสนจนคีย์สามแบบในสัปดาห์แรก:
--       · 1 × 42,000 · 12 × 3,500 · และปุ่มลัดเสนอ 3,500 × 12 × 12 = 504,000 (คูณเดือนซ้ำ)
--     ตัวตรวจบรรทัดของ 0374 **ไม่ผูก** ยอดบรรทัดกับ จำนวน × ราคา (ราคาต่อแพ็ค = ยอด ÷ จำนวน) ⇒ ฐานรับได้ทุกแบบ
--  ⭐ มติเจ้าของ 23/09: *"3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา เพื่อไม่ให้ USER สับสน"*
--     ⇒ บรรทัดโซนคีย์ **เหมือนบรรทัดใบเสนอราคาทุกช่อง**: จำนวน · ราคา/หน่วย (ราคาผลิตในทะเบียน ล็อก) ·
--       ส่วนลดรายการ (ไม่ลด / % / บาท) · จำนวนเงิน = สูตรเดียวกับ quoteLineNet
--       "1 ชุด 12 เดือน" = จำนวน 12 (แพ็คเกจ) × 3,500 = 42,000 เหมือนที่คีย์ในใบเสนอราคา
--     ⇒ ไฟล์นี้ทำให้ฐานบังคับสูตรนั้น — ตัวตรวจบรรทัด + ตัวเขียนบรรทัดของ 0374 ถูกนิยามใหม่สองตัว (ตัวอื่นไม่แตะ)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) ด่าน (อ่านอย่างเดียว · รันซ้ำได้): ใบย้อนหลังที่ยังไม่อนุมัติ (ร่าง/รออนุมัติ/ตีกลับ) ต้องไม่มีบรรทัดที่
--     ยอดเกิน round(จำนวน × ราคา/หน่วย, 2) + 0.01 — แถวแบบนั้นจะอนุมัติไม่ได้หลังไฟล์นี้ ⇒ หยุดทั้งไฟล์ก่อน
--  2) historical_so_check_lines(jsonb, text) — ตัวเดิมของ 0374 ทุกบรรทัด + ส่วนลดรายการ + สูตรเงินสองระดับ:
--       · **บรรทัดที่พก discountAmount มา** (payload ของการบันทึก — รุ่น 0379 ส่งเสมอ) = สูตรเต็มของใบเสนอราคา
--           ส่วนลดที่คาด = round(LEAST(percent: gross × v/100 | amount: v | ไม่ลด: 0, gross), 2)
--           |discountAmount − ที่คาด| ≤ 0.01 และ |lineTotal − (gross − discountAmount)| ≤ 0.01
--       · **บรรทัดที่ไม่พก discountAmount** (แถวที่เก็บแล้ว ซึ่ง RPC ส่ง/อนุมัติของ 0374 ประกอบเป็น jsonb ใหม่
--           โดยไม่มีคีย์ส่วนลด) = แค่ lineTotal ≤ gross + 0.01 — ไม่งั้นบรรทัดที่มีส่วนลดจะอนุมัติไม่ได้เลย
--       gross = round(จำนวน × ราคา/หน่วย, 2) · ±0.01 = ค่าคลาดเดียวกับที่ 0374 ใช้ทุกจุด
--         (JS ปัดด้วย float ⇒ ค่ากึ่งสตางค์อย่าง 1.005 ปัดต่างจาก numeric ได้หนึ่งสตางค์)
--       · ยังคืน Σ lineTotal ⇒ ตัวเทียบยอดหัวใบของ RPC สร้าง/แก้/อนุมัติ (0374) ใช้ต่อได้ไม่ต้องนิยามใหม่
--  3) historical_so_write_children(text, jsonb, jsonb, numeric, text, text) — ตัวเดิมของ 0374 ทุกบรรทัด +
--       · ทุกบรรทัดต้องพก discountAmount/discountValue เป็นตัวเลข (ไม่พก = ฟอร์มรุ่นก่อน ⇒ historical_so_line_invalid)
--       · สินค้ายังไม่ตั้งราคา ("costPrice" ว่าง/≤0) = historical_so_line_unpriced
--       · ราคา/หน่วยต้อง **เท่าราคาผลิตในทะเบียน ณ ตอนบันทึก** = historical_so_line_price_not_registry
--         (ตรวจเฉพาะตอนบันทึก — ขั้นอนุมัติไม่ตรวจราคาซ้ำ ⇒ ทะเบียนเปลี่ยนราคาทีหลังไม่ขวางการอนุมัติ)
--       · บรรทัดเก็บ discountType / discountValue / discountAmount จาก payload · metadata = '{}' (ไม่มี grossAmount)
--         = รูปเดียวกับบรรทัดใบเสนอราคาที่ถูกก๊อปลงใบสั่งขาย (0363)
--  4) สิทธิ์: REVOKE ทั้งสองตัวจาก PUBLIC/anon/authenticated/service_role เท่า 0374 · ไม่มี GRANT
--
--  ⛔ ไม่แตะ: RPC สร้าง/แก้/ส่ง/อนุมัติของ 0374 · ตัวตรวจสัญญา/งวด · trigger · CHECK · ตัวคำนวณ Actual
--  ⛔ ไม่ backfill — นอกตัวฟังก์ชันมีแค่ SELECT ของด่านข้อ 1
--  ⚠️ ใบที่ค้างรออนุมัติอยู่แล้ว (ตรวจ 23/09: 4 ใบ · ทุกบรรทัด 12 × ราคาในทะเบียน · ไม่มีส่วนลด) ผ่านตัวตรวจแบบหลวม
--     ⇒ **AE Sup อนุมัติได้โดยไม่ต้องคีย์ใหม่** · ถ้าถูกตีกลับ ฟอร์มใหม่โหลดบรรทัดเดิมกลับมาครบ แล้วตัวเขียนแบบเข้ม
--     รับได้ที่ราคาในทะเบียนปัจจุบัน
--  ⚠️ ผลต่อฝั่ง TS: RPC อนุมัติ (0374) เขียน service_zone_terms."packageQty" = จำนวนของบรรทัด ⇒ "1 ชุด × 12 เดือน"
--     กลายเป็น packageQty 12 (ภาระงานของ TS นับ 12 แพ็คของโซนนั้น) — เท่ากับบรรทัดของใบ pipeline วันนี้ · ไม่แก้ในไฟล์นี้
--
--  🛑 **รันก่อน merge โค้ด JS ของรอบนี้** (แบบเดียวกับ 0374) แล้ว merge + deploy ต่อทันที
--     · หลังรัน ฟอร์มที่ deploy อยู่ (รุ่น 0374) บันทึกไม่ได้ — ตัวเขียนบังคับคีย์ส่วนลดซึ่งรุ่นนั้นไม่ส่ง ⇒ ตอบ 400
--       "ข้อมูลรายการของโซนไม่ถูกต้อง … โหลดหน้าฟอร์มใหม่" (ดัง ไม่ใช่เงียบ)
--     · ⚠️ **ห้ามคีย์ช่วงรันถึง deploy** — ห้ามคีย์/แก้ใบย้อนหลังระหว่างรันไฟล์นี้จนกว่า JS รุ่นใหม่ขึ้น prod
--     · สลับลำดับ (deploy JS ก่อนรัน) = ตัวเขียนเดิมของ 0374 **ทิ้งส่วนลดเงียบ ๆ** (เขียน 0 ตายตัว) แต่เก็บยอดที่หักแล้ว
--       ⇒ บรรทัดที่ยอดไม่ตรงสูตรลงฐาน โดยไม่มีอะไรฟ้อง — แพงกว่าการบันทึกไม่ได้ชั่วคราว
--     · ระหว่างรันถึง deploy AE Sup **อนุมัติ 4 ใบที่ค้างได้ตามปกติ** (ขั้นอนุมัติใช้ตัวตรวจแบบหลวม)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (CREATE OR REPLACE · REVOKE ซ้ำ · ด่านอ่านอย่างเดียว) — รอบสองไม่เปลี่ยนอะไร
--
--  ── ก่อนรัน (SQL Editor · อ่านอย่างเดียว) ─────────────────────────────────────────
--   SELECT o."orderNumber", o.status, l."sortOrder", l.qty, l.unit, l."unitPrice", l."lineTotal", p."costPrice",
--          round(l.qty * l."unitPrice", 2) - l."lineTotal" AS diff,
--          o.metadata -> 'historicalIntake' AS intake
--     FROM public.sales_order_lines l
--     JOIN public.sales_orders o ON o.id = l."salesOrderId"
--     LEFT JOIN public.products p ON p.id = l."productId"
--    WHERE o.origin = 'historical' AND o.status <> 'cancelled'
--    ORDER BY o."orderNumber", l."sortOrder";
--   -- คาด: 4 ใบ · diff = 0 ทุกแถว · unitPrice = costPrice · intake ไม่มี "amountsIncludeVat": true
--   --      · unit ของแพ็คเกจ 02-001 ควรเป็น แพ็คเกจ/เดือน (ไม่ใช่ ชุด — "12 ชุด × 3,500" อ่านผิดความหมาย)
--   -- diff < 0 (ยอดเกิน จำนวน × ราคา) = ด่านข้อ 1 จะหยุดทั้งไฟล์ ⇒ ให้ผู้คีย์ดึงกลับ/แก้ใบนั้นก่อน
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ROLLBACK คืนเลขใบ/เลขดีลให้) ──────────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายไฟล์ด้วยบล็อกข้างล่าง (จบด้วย ROLLBACK;)
--  ทางที่ 2 (หลังรันแล้ว): รันบล็อกข้างล่างทั้งก้อน โดยนำหน้าด้วย BEGIN;
--  แทนค่า <...> ก่อนรัน: ลูกค้าที่อนุมัติแล้ว · AE (ae/senior_ae ยังใช้งาน) + ทีม · โซนที่ยังใช้งานของไซต์ลูกค้ารายนั้น
--  · สินค้าหมวด 02-001 ที่ตั้งราคาแล้ว (ราคาอ่านจากทะเบียนในบล็อกเอง)
--
--   -- ① ใบที่ค้างรออนุมัติทุกใบผ่านตัวตรวจแบบหลวม (ตัวเดียวกับขั้นอนุมัติ) และยอดบรรทัดรวม = ยอดหัวใบ
--   SELECT o."orderNumber",
--          abs(public.historical_so_check_lines(
--                (SELECT jsonb_agg(jsonb_build_object(
--                          'zoneId', l."serviceZoneId", 'productId', l."productId", 'qty', l.qty,
--                          'unitPrice', l."unitPrice", 'lineTotal', l."lineTotal", 'serviceRounds', l."serviceRounds"
--                        ) ORDER BY l."sortOrder")
--                   FROM public.sales_order_lines l WHERE l."salesOrderId" = o.id),
--                o."customerId") - o.subtotal) <= 0.01 AS approvable
--     FROM public.sales_orders o WHERE o.origin = 'historical' AND o.status = 'pending_approval';   -- ทุกแถว true
--   -- ② ใบใหม่แบบใบเสนอราคา: 12 × ราคาในทะเบียน ลด 5% · งวดเดียวเท่ายอดใบ — ผ่าน RPC สร้าง (ตัวเขียนแบบเข้ม)
--   WITH m AS (SELECT "costPrice" AS price, round(12 * "costPrice", 2) AS gross,
--                     round(round(12 * "costPrice", 2) * 5 / 100, 2) AS disc
--                FROM public.products WHERE id = '<productId หมวด 02-001>')
--   SELECT public.create_historical_sales_order(
--     'smoke-0379', repeat('c', 64), '<aeUserId>', 'smoke 0379', 'ae',
--     jsonb_build_object('customerId', '<customerId>', 'ownerId', '<aeUserId>', 'team', '<teamCode>',
--       'subtotal', m.gross - m.disc, 'discountAmount', 0, 'vatAmount', 0, 'totalAmount', m.gross - m.disc,
--       'notes', 'ทดสอบ 0379', 'intake', jsonb_build_object('vatRate', 0)),
--     jsonb_build_array(jsonb_build_object('zoneId', '<zoneId>', 'productId', '<productId หมวด 02-001>', 'qty', 12,
--       'unitPrice', m.price, 'discountType', 'percent', 'discountValue', 5, 'discountAmount', m.disc,
--       'lineTotal', m.gross - m.disc, 'serviceRounds', 12)),
--     jsonb_build_array(jsonb_build_object('label', 'ทั้งสัญญา', 'amount', m.gross - m.disc, 'dueDate', '2026-12-31',
--       'coversFrom', '2026-01-01', 'coversTo', '2026-12-31')),
--     '{"docKind":"customer_po","ref":"PO-SMOKE-0379","startDate":"2026-01-01","endDate":"2026-12-31"}',
--     '{"id":"DEAL-smoke0379","historyId":"DSH-smoke0379","title":"ทดสอบ 0379","ownerName":"<ชื่อ AE>",
--       "month":"26","prefix":"DL-2609","width":5}'
--   ) -> 'lines' -> 0 FROM m;
--   -- คาด: บรรทัดเดียว · unit = หน่วยขายของแพ็คเกจ · discountType percent · discountValue 5 ·
--   --       discountAmount = 5% ของ 12 × ราคา (ไม่ใช่ 0) · lineTotal = ยอดหลังหัก · metadata {} (ไม่มี grossAmount)
--   -- ③ ตัวตรวจแบบเข้มตีกลับยอดผิดสูตร / % เกิน 100 / ชนิดแปลก (ตัวตรวจไม่ต้องมีใบ)
--   DO $$ BEGIN
--     BEGIN PERFORM public.historical_so_check_lines('[{"zoneId":"<zoneId>","productId":"<productId หมวด 02-001>","qty":12,
--             "unitPrice":3500,"discountType":null,"discountValue":0,"discountAmount":0,"lineTotal":41999.98}]', '<customerId>');
--           RAISE EXCEPTION 'SMOKE FAIL 1'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 1: %', SQLERRM; END;
--     BEGIN PERFORM public.historical_so_check_lines('[{"zoneId":"<zoneId>","productId":"<productId หมวด 02-001>","qty":12,
--             "unitPrice":3500,"discountType":"percent","discountValue":101,"discountAmount":42000,"lineTotal":0}]', '<customerId>');
--           RAISE EXCEPTION 'SMOKE FAIL 2'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 2: %', SQLERRM; END;
--     BEGIN PERFORM public.historical_so_check_lines('[{"zoneId":"<zoneId>","productId":"<productId หมวด 02-001>","qty":12,
--             "unitPrice":3500,"discountType":"foo","discountValue":1,"discountAmount":0,"lineTotal":42000}]', '<customerId>');
--           RAISE EXCEPTION 'SMOKE FAIL 3'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 3: %', SQLERRM; END;
--   END $$;   -- คาด NOTICE ok 1: historical_so_line_money_mismatch · ok 2/3: historical_so_line_invalid
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT p.oid::regprocedure, position('discountAmount' IN pg_get_functiondef(p.oid)) > 0 AS has_discount
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname IN ('historical_so_check_lines', 'historical_so_write_children');
--                                                                   -- 2 แถว · true ทั้งคู่
--   SELECT r.role, f.sig, has_function_privilege(r.role, f.sig, 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role),
--          (VALUES ('public.historical_so_check_lines(jsonb,text)'),
--                  ('public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)')) AS f(sig);
--                                                                   -- false ทั้ง 6 แถว
--   แล้วรันคำสั่ง "ก่อนรัน" ①ของบล็อกลองจริงอีกครั้ง (ทุกใบที่ค้างรออนุมัติ approvable = true)
--   และ `npm run check:columns` ในเครื่อง (ต้องเขียวก่อน merge คอมมิต JS)
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────
--   รันสองตัวนี้ซ้ำจากไฟล์ 0374 ทั้งก้อน: ข้อ 7b (ตัวตรวจบรรทัด) และข้อ 7d (ตัวเขียนบรรทัด+งวด) แล้ว REVOKE สองบรรทัด
--   ของข้อ 12 ที่เป็นของสองตัวนั้น · ⚠️ ใช้ได้เฉพาะตอน **ยังไม่มีบรรทัดใบย้อนหลังที่มีส่วนลด** — ตัวเขียนของ 0374
--   เขียนส่วนลดเป็น 0 ตายตัว ⇒ แก้ใบที่มีส่วนลดหลังถอย = ส่วนลดหายเงียบ ๆ
--   (ตรวจก่อนถอย: SELECT count(*) FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId"
--                   WHERE o.origin = 'historical' AND l."discountAmount" > 0;   -- ต้องเป็น 0)
--   แล้วถอยโค้ด JS รอบนี้ออกพร้อมกัน (ฟอร์มรุ่นนี้ส่งบรรทัดที่ตัวตรวจของ 0374 รับได้ แต่ตัวเขียนของ 0374 ทิ้งส่วนลด)
-- ============================================================

BEGIN;

-- ── 1) ด่าน: ใบย้อนหลังที่ยังไม่อนุมัติต้องไม่มีบรรทัดที่ยอดเกิน จำนวน × ราคา/หน่วย ─────────────────
-- รันครั้งแรก (ตรวจ 23/09): 4 ใบรออนุมัติ ทุกบรรทัด 12 × ราคาในทะเบียน ไม่มีส่วนลด ⇒ 0 แถว
-- ใบแบบนั้นจะติดตัวตรวจแบบหลวม (ข้อ 2) ตอนส่ง/อนุมัติ = ค้างตลอดกาล ⇒ หยุดทั้งไฟล์ แล้วให้แก้ใบก่อน
-- ใบที่อนุมัติแล้วไม่ถูกตรวจซ้ำที่ไหนอีก ⇒ ไม่อยู่ในด่าน · รันซ้ำ: ตัวเขียนของไฟล์นี้บังคับสูตร ⇒ ผ่านเสมอ
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.sales_order_lines l
    JOIN public.sales_orders o ON o.id = l."salesOrderId"
   WHERE o.origin = 'historical'
     AND o.status IN ('draft', 'pending_approval', 'rejected')
     AND l."lineTotal" > round(l.qty * l."unitPrice", 2) + 0.01;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'mig_0379_historical_lines_not_quote_shaped — % บรรทัด (ดูคำสั่ง "ก่อนรัน" ที่หัวไฟล์)', v_bad;
  END IF;
END $$;

-- ── 2) ตัวตรวจบรรทัด = โซน × แพ็คเกจ × สูตรเงินของใบเสนอราคา — คืนผลรวมยอดบรรทัด ─────────────────
--  ส่วนของ 0374 คงเดิมทุกบรรทัด (โซนเท่าด่าน bindTargetError · หมวด 02-001 · จำนวนเต็ม · โซนไม่ซ้ำ)
--  + ส่วนลดรายการ: ชนิด NULL | 'percent' | 'amount' (= QUOTE_DISCOUNT_TYPES ฝั่ง JS) · ค่าไม่ติดลบ ·
--    ไม่ลดต้องมีค่า 0 · % ไม่เกิน 100 (normalizeDiscountValue ตัดให้แล้วฝั่ง JS — ค่าเกินคือ payload ที่ไม่ผ่านแผน)
--  + สูตรเงินสองระดับ (หัวไฟล์ข้อ 2) — มีคีย์ discountAmount = เข้ม · ไม่มี = หลวม (แถวที่เก็บแล้วของขั้นส่ง/อนุมัติ)
--  ⚠️ ราคา/หน่วยไม่ถูกเทียบกับทะเบียนที่นี่ — ตัวนี้รันตอนอนุมัติด้วย ⇒ ตัวเขียน (ข้อ 3) ตรวจราคาตอนบันทึกเท่านั้น
CREATE OR REPLACE FUNCTION public.historical_so_check_lines(p_lines jsonb, p_customer_id text)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item       jsonb;
  v_zone_id    text;
  v_product_id text;
  v_qty        numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_gross      numeric;
  v_rounds     integer;
  v_dtype      text;
  v_dvalue     numeric;
  v_damount    numeric;
  v_line_gross numeric;
  v_expect     numeric;
  v_seen       text[] := ARRAY[]::text[];
  v_sum        numeric := 0;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'historical_so_lines_required';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;
    v_zone_id    := NULLIF(btrim(COALESCE(v_item->>'zoneId', '')), '');
    v_product_id := NULLIF(btrim(COALESCE(v_item->>'productId', '')), '');
    BEGIN
      v_qty        := (v_item->>'qty')::numeric;
      v_unit_price := (v_item->>'unitPrice')::numeric;
      v_line_total := (v_item->>'lineTotal')::numeric;
      v_gross      := NULLIF(v_item->>'grossAmount', '')::numeric;
      v_rounds     := NULLIF(v_item->>'serviceRounds', '')::integer;
      v_dtype      := NULLIF(btrim(COALESCE(v_item->>'discountType', '')), '');
      v_dvalue     := COALESCE(NULLIF(v_item->>'discountValue', '')::numeric, 0);
      v_damount    := NULLIF(v_item->>'discountAmount', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'historical_so_line_invalid';
    END;
    IF v_zone_id IS NULL OR v_product_id IS NULL
       OR v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty)
       OR v_unit_price IS NULL OR v_unit_price < 0
       OR v_line_total IS NULL OR v_line_total < 0
       OR 'NaN'::numeric IN (v_qty, v_unit_price, v_line_total)
       OR (v_gross IS NOT NULL AND (v_gross < 0 OR v_gross = 'NaN'::numeric))
       OR COALESCE(v_rounds, 1) <= 0
       OR length(btrim(COALESCE(v_item->>'description', ''))) > 200 THEN
      RAISE EXCEPTION 'historical_so_line_invalid';
    END IF;
    -- ส่วนลดรายการ — รูปของตัวเลือก "ไม่ลด / % / บาท" ของตารางใบเสนอราคา
    IF (v_dtype IS NOT NULL AND v_dtype NOT IN ('percent', 'amount'))
       OR v_dvalue < 0 OR v_dvalue = 'NaN'::numeric
       OR (v_dtype IS NULL AND v_dvalue <> 0)
       OR (v_dtype = 'percent' AND v_dvalue > 100)
       OR (v_damount IS NOT NULL AND (v_damount < 0 OR v_damount = 'NaN'::numeric)) THEN
      RAISE EXCEPTION 'historical_so_line_invalid';
    END IF;
    -- สูตรเงินของใบเสนอราคา (quoteLineNet) — ค่าคลาด ±0.01 เท่าทุกจุดของ 0374
    v_line_gross := round(v_qty * v_unit_price, 2);
    IF v_damount IS NULL THEN
      -- แถวที่เก็บแล้ว (ขั้นส่ง/อนุมัติของ 0374 ไม่ส่งคีย์ส่วนลด): ยอดต้องไม่เกิน จำนวน × ราคา
      IF v_line_total > v_line_gross + 0.01 THEN RAISE EXCEPTION 'historical_so_line_money_mismatch'; END IF;
    ELSE
      v_expect := round(LEAST(CASE v_dtype
                                WHEN 'percent' THEN v_line_gross * v_dvalue / 100
                                WHEN 'amount'  THEN v_dvalue
                                ELSE 0 END, v_line_gross), 2);
      IF abs(v_damount - v_expect) > 0.01
         OR abs(v_line_total - (v_line_gross - v_damount)) > 0.01 THEN
        RAISE EXCEPTION 'historical_so_line_money_mismatch';
      END IF;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = v_product_id
         AND substring(p."fgCode" from '(\d{2}-\d{3})') = '02-001'
    ) THEN
      RAISE EXCEPTION 'historical_so_line_not_package';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.service_zones z
        JOIN public.service_sites s ON s.id = z."siteId"
       WHERE z.id = v_zone_id
         AND z."isActive" AND s."isActive"
         AND s.kind = 'customer'
         AND s."customerId" = p_customer_id
    ) THEN
      RAISE EXCEPTION 'historical_so_zone_invalid';
    END IF;
    IF v_zone_id = ANY (v_seen) THEN RAISE EXCEPTION 'historical_so_zone_duplicate'; END IF;
    v_seen := v_seen || v_zone_id;
    v_sum := v_sum + v_line_total;
  END LOOP;
  RETURN v_sum;
END;
$$;

-- ── 3) ตัวเขียนบรรทัด + งวด (ลบของเดิมแล้วเขียนใหม่ทั้งชุด) ─────────────────────────────────
--  ส่วนของ 0374 คงเดิมทุกบรรทัด: ⚠️ ด่านของตัวเองมาก่อนทุกอย่าง (ใบย้อนหลังร่าง/ตีกลับ · ไม่มีรอบขายของโซน ·
--  ไม่มีงวดที่หยุดยอด) · ห้ามใช้ตัวช่วย master_row_* · FG/คำอธิบาย/หน่วยจากทะเบียน · id แน่นอนตามลำดับ ·
--  นับบรรทัดที่ JOIN ได้ให้ครบ · งวดยกมาเป็นงวดที่ 1 · หลักฐานเฉพาะงวดยกมา · งวดทุกแถว pending ยังไม่หยุดยอด
--  + ⭐ ด่านบรรทัดแบบใบเสนอราคา (หลังด่านสถานะ ก่อน DELETE — ตีกลับแล้วของเดิมต้องอยู่ครบ):
--    · ทุกบรรทัดพก discountAmount/discountValue เป็นตัวเลข — ไม่พก = ฟอร์มรุ่นก่อน 23/09 (ตัวตรวจข้อ 2 จะตกไปทางหลวม
--      แล้วส่วนลดหายเงียบ ๆ ถ้าไม่มีด่านนี้)
--    · ราคา/หน่วย = ราคาผลิตในทะเบียน ณ ตอนบันทึก (QUOTE_PRICE_FIELD ฝั่ง JS) · ยังไม่ตั้งราคา = ตีกลับ
--  + บรรทัดเก็บส่วนลดสามช่องจาก payload (รูปเดียวกับบรรทัดที่ 0363 ก๊อปจากใบเสนอราคา) · metadata ว่าง
CREATE OR REPLACE FUNCTION public.historical_so_write_children(
  p_order_id     text,
  p_lines        jsonb,
  p_installments jsonb,
  p_total        numeric,
  p_actor_id     text,
  p_actor_name   text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order    public.sales_orders%ROWTYPE;
  v_inserted integer;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND
     OR v_order.origin IS DISTINCT FROM 'historical'
     OR v_order.status NOT IN ('draft', 'rejected')
     OR EXISTS (SELECT 1 FROM public.service_zone_terms t WHERE t."salesOrderId" = p_order_id)
     OR EXISTS (SELECT 1 FROM public.sales_order_installments i
                 WHERE i."salesOrderId" = p_order_id AND i."frozenAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'historical_so_edit_state_invalid';
  END IF;

  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS e(l)
     WHERE jsonb_typeof(e.l) IS DISTINCT FROM 'object'
        OR jsonb_typeof(e.l->'discountAmount') IS DISTINCT FROM 'number'
        OR jsonb_typeof(e.l->'discountValue') IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'historical_so_line_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS e(l)
      JOIN public.products p ON p.id = btrim(e.l->>'productId')
     WHERE COALESCE(p."costPrice", 0) <= 0
  ) THEN
    RAISE EXCEPTION 'historical_so_line_unpriced';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) AS e(l)
      JOIN public.products p ON p.id = btrim(e.l->>'productId')
     WHERE (e.l->>'unitPrice')::numeric IS DISTINCT FROM p."costPrice"
  ) THEN
    RAISE EXCEPTION 'historical_so_line_price_not_registry';
  END IF;

  DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;
  DELETE FROM public.sales_order_lines WHERE "salesOrderId" = p_order_id;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "serviceZoneId", "installationPoint", "productId", "fgCode",
    description, unit, qty, "unitPrice", "discountType", "discountValue", "discountAmount", "lineTotal",
    "serviceRounds", "sortOrder", metadata
  )
  SELECT
    'SOL-' || md5(p_order_id || ':' || e.ord), p_order_id, NULL, z.id,
    btrim(left(concat_ws(' ', NULLIF(btrim(s.code), ''), btrim(s.name)) || ' · ' || btrim(z.name), 200)),
    p.id, p."fgCode",
    COALESCE(NULLIF(btrim(COALESCE(e.l->>'description', '')), ''), p."productDescription"),
    COALESCE(NULLIF(btrim(COALESCE(e.l->>'unit', '')), ''), NULLIF(btrim(p."saleUnit"), ''), 'ชิ้น'),
    (e.l->>'qty')::numeric, (e.l->>'unitPrice')::numeric,
    NULLIF(btrim(COALESCE(e.l->>'discountType', '')), ''),
    (e.l->>'discountValue')::numeric, (e.l->>'discountAmount')::numeric, (e.l->>'lineTotal')::numeric,
    NULLIF(e.l->>'serviceRounds', '')::integer, (e.ord - 1)::integer,
    '{}'::jsonb
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS e(l, ord)
  JOIN public.products p ON p.id = btrim(e.l->>'productId')
  JOIN public.service_zones z ON z.id = btrim(e.l->>'zoneId')
  JOIN public.service_sites s ON s.id = z."siteId";
  -- JOIN ทิ้งบรรทัดที่หาสินค้า/โซนไม่เจอเงียบ ๆ ได้ ⇒ นับให้ครบทุกบรรทัดที่ส่งมา
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'historical_so_line_invalid'; END IF;

  INSERT INTO public.sales_order_installments (
    id, "salesOrderId", seq, kind, label, percent, amount, "dueDate", "coversFrom", "coversTo",
    "paidOn", note, status, evidence, "frozenAt", "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    'SOI-' || md5(p_order_id || ':' || x.seq), p_order_id, x.seq::integer, x.kind,
    CASE WHEN x.kind = 'opening' THEN 'งวดยกมา' ELSE btrim(x.i->>'label') END,
    CASE WHEN p_total > 0 THEN LEAST(100, round((x.i->>'amount')::numeric / p_total * 100, 2)) ELSE 0 END,
    (x.i->>'amount')::numeric,
    NULLIF(x.i->>'dueDate', '')::date, NULLIF(x.i->>'coversFrom', '')::date, NULLIF(x.i->>'coversTo', '')::date,
    CASE WHEN x.kind = 'opening' THEN NULLIF(x.i->>'paidOn', '')::date END,
    NULLIF(btrim(COALESCE(x.i->>'note', '')), ''),
    'pending',
    CASE WHEN x.kind = 'opening' AND jsonb_typeof(x.i->'evidence') = 'array' THEN x.i->'evidence' ELSE '[]'::jsonb END,
    NULL, p_actor_id, p_actor_name, now(), now()
  FROM (
    SELECT e.i, COALESCE(NULLIF(e.i->>'kind', ''), 'regular') AS kind,
           row_number() OVER (
             ORDER BY CASE WHEN COALESCE(NULLIF(e.i->>'kind', ''), 'regular') = 'opening' THEN 0 ELSE 1 END,
                      NULLIF(e.i->>'coversFrom', '')::date, e.ord
           ) AS seq
      FROM jsonb_array_elements(COALESCE(p_installments, '[]'::jsonb)) WITH ORDINALITY AS e(i, ord)
  ) AS x;
END;
$$;

-- ── 4) สิทธิ์ — เท่า 0374 ข้อ 12: ตัวช่วยสองตัวถูกเรียกจาก RPC แบบ SECURITY DEFINER เท่านั้น (รันเป็นเจ้าของ) ────
-- ⚠️ Supabase ให้ EXECUTE กับ anon/authenticated/service_role ผ่าน default privileges ⇒ REVOKE รายบทบาท ไม่ใช่แค่ PUBLIC
REVOKE ALL ON FUNCTION public.historical_so_check_lines(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_write_children(text, jsonb, jsonb, numeric, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
