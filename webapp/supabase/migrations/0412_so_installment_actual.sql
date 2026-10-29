-- ============================================================
--  Migration 0412: ใบสั่งขาย "นับ Actual ทั้งใบ" หรือ "นับ Actual รายงวด"
--                  (มติเจ้าของ 26/10/2026 ข้อ 1–10 · สัญญาเทคนิค docs/so-installment-actual.md)
--
--  ⭐ คำขอ: ตอน AE Sup กดอนุมัติใบสั่งขาย ให้เลือกได้ว่านับ Actual ทั้งใบ (เหมือนเดิมทุกอย่าง) หรือรายงวด
--    ใบรายงวด = ยื่น → AE Sup อนุมัติ (นับ Actual) → แจ้งสลิป → บัญชีรับรอง วนทุกงวดจนครบ
--    ⇒ **ยกเว้นมติ 13/08** ("Actual ยอดเต็ม 100% แล้วค่อยแบ่งจ่าย") เฉพาะใบที่ AE Sup เลือกรายงวด
--  ⭐ ใบรายงวดยังเป็น 'approved' ตั้งแต่คลิกแรก (ปลดล็อกงานบริการ · ผลิต · ภาษี · บัญชี ฯลฯ เหมือนเดิม) — ตัวเลือกนี้ย้ายแค่ Actual
--    · ยอดงวดเข้า Actual ตอนอนุมัติงวด (ข้อ 1) · เดือน = GREATEST(เวลาอนุมัติงวด, เวลาอนุมัติใบ) เวลาไทย
--      (Rev. อนุมัติ = งวดที่เคยนับย้ายมาเดือน Rev. — ข้อ 7) · คลิกอนุมัติใบ = นับงวด 1 ทันที (ข้อ 3)
--    · ยื่นงวด n ได้เมื่อทุกงวดก่อนหน้าบัญชีรับรองแล้ว (ข้อ 2) · บัญชีรับรองงวดที่ยังไม่อนุมัติไม่ได้ (trigger ข้อ 5b)
--    · ยอดก่อน VAT ของงวด = ส่วนแบ่งของ "actualAmount" ใบ (งวดสุดท้ายรับเศษ ⇒ นับครบ Σ = actualAmount พอดี)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านลำดับรัน (0377 · 0378 · 0382 · ตัวอนุมัติใบ) + ลายนิ้วมือ (md5) ของฟังก์ชันที่ไฟล์นี้ต้องไม่แตะ
--  §1 sales_orders: "actualMode" ('order' | 'installment' · ค่าเริ่ม 'order' = ทุกใบเดิม) · cache สองช่อง
--     "actualCountedAmount" (Σ ยอดงวดที่นับแล้ว) · "actualSubmittedAmount" (Σ ยอดประมาณของงวดที่ยื่นแล้ว)
--     + CHECK sales_orders_actual_mode_valid (ใบย้อนหลัง และใบร่าง/รออนุมัติ/ตีกลับ เป็น 'order' เสมอ) · sales_orders_actual_cache_sane
--  §2 sales_order_installments: "actualStatus" (NULL | submitted | approved | rejected) + ผู้ยื่น/ผู้อนุมัติ/ผู้ตีกลับ ·
--     "actualAmount" (ก่อน VAT ตรึงตอนอนุมัติงวด) · "actualApprovedVia" · "actualNote" + CHECK sales_order_installments_actual_shape
--  §3 ตัวช่วยคำนวณ (คู่กับ src/lib/sales/salesOrderActualMode.js):
--     _so_installment_actual_share(งวด) — ส่วนแบ่งตอนอนุมัติงวด · _so_installment_actual_estimates(ใบ, actual, total) —
--     ยอดประมาณของงวดที่ยังไม่นับ · _so_installment_actual_cache(ใบ, actual, total) — cache สองช่อง ·
--     _deal_so_actual_extras(ดีล) — คีย์ใหม่ของ metadata ดีล + ยอดงวดที่นับแล้ว
--  §4 คู่ sync_sales_order_actual + enforce_sales_order_actual_on_deal (แก้คู่กันเสมอ · กติกา 0353):
--     wonValue = Σ actualAmount ใบทั้งใบ + Σ ยอดงวดที่นับแล้วของใบรายงวด · wonMonth = เดือนที่อนุมัติ **ใบ** ล่าสุด (ความหมายเดิม)
--     · คีย์ใหม่ (เจ้าของคีย์ = คู่นี้ — ถอดแล้วเขียนใหม่ทุกครั้งเหมือน soPending*):
--       actualByMonth {"YYYY-MM": ยอด} (มีเมื่อดีลมีใบอนุมัติ) · soInstPendingAmount/Count (งวดที่ยื่นแล้ว · Count = จำนวนใบ · มีเมื่อ > 0) ·
--       soInstRemainingByDue {"YYYY-MM" | "none": ยอด} (งวดที่ยังไม่ยื่น/ถูกตีกลับ ตามเดือนครบกำหนด · มีเมื่อไม่ว่าง ·
--         ใบรายงวดที่อนุมัติแล้วแต่ยังไม่มีงวด = ยอดทั้งใบลง "none")
--     · ใบทั้งใบ (ทุกใบวันนี้): wonValue · wonMonth · actualSource · wonValueExVat · soPending* = ค่าเดิมทุกตัวอักษร
--  §5 trigger
--     a) sales_orders_actual_mode_trg (BEFORE INSERT OR UPDATE OF status/"actualAmount"/"totalAmount") — ใบกลับเป็นร่าง/
--        รออนุมัติ/ตีกลับ = "actualMode" กลับเป็น 'order' · คิด cache สองช่องใหม่ด้วยยอดของแถวที่กำลังเขียน
--     b) sales_order_installments_actual_guard (BEFORE INSERT OR UPDATE OF status) — ใบรายงวด (ไม่ใช่ใบที่ยกเลิก) + งวดกำลังเข้า
--        confirmed + งวดยังไม่อนุมัติ = installment_actual_not_approved (ปฏิเสธอย่างเดียว ไม่เขียนทับแถว)
--     c) sales_order_installments_actual_sync (AFTER INSERT / UPDATE OF ช่อง Actual · ใบ · ยอด · วันครบกำหนด · เลขงวด / DELETE) —
--        คิด cache ของใบ (UPDATE เฉพาะเมื่อค่าเปลี่ยน) แล้วเรียก sync ของดีลเมื่อใบเป็นใบรายงวดที่อนุมัติแล้ว (ใบเดิมด้วยเมื่อย้ายใบ ·
--        ใบถูกลบไปแล้วจาก cascade = ข้าม) · ใบทั้งใบไม่แตะ sales_deals เลย (เหมือนวันนี้ — งานงวดไม่ขยับ updatedAt ของดีล)
--     d) sales_orders_sync_actual_trg (0279) สร้างใหม่ + "actualMode" ในรายการคอลัมน์ (ฟังก์ชัน sales_order_actual_trigger ของ 0108 คงเดิม)
--     e) sales_order_installments_actual_delete_guard (BEFORE DELETE · มติเจ้าของข้อ 9 "ปรับยอด/วันได้ ลบไม่ได้") — งวดที่นับ Actual แล้ว
--        ของใบรายงวด pipeline ที่อนุมัติอยู่ = installment_actual_counted_row_delete (ปฏิเสธอย่างเดียว) · ลบทั้งใบ (cascade) ใบหายไปก่อน = ผ่าน
--     f) sales_order_installments_actual_autocount (CONSTRAINT TRIGGER · DEFERRABLE INITIALLY DEFERRED · AFTER INSERT / UPDATE OF
--        "salesOrderId", "actualStatus" · มติเจ้าของข้อ 10 "นับให้เอง ไม่ต้องยื่น") — ใบรายงวดที่เคยกด "นับที่เหลือทั้งหมด" (มีงวด via
--        count_rest) = นับทั้งก้อนจากนี้ไปถาวร: งวดที่ยังไม่นับที่โผล่มาทีหลัง (ปรับแผนแบ่ง/เพิ่มงวด · ยกเงินเข้า) นับให้ตอน COMMIT
--        (via count_rest · ส่วนแบ่งตามกติกาเดิม — ปกติ 0) · ตัวเดียวที่เขียนแถวงวดจาก trigger (ข้อยกเว้นของยาม installmentReplanMigration)
--  §6 RPC (ไม่ใช่ SECURITY DEFINER · REVOKE PUBLIC/anon/authenticated · GRANT service_role)
--     ① approve_sales_order_with_actual_mode(พารามิเตอร์ชุดเดียวกับตัวอนุมัติใบเดิม 10 ตัว, p_actual_mode) — ตัวห่อ:
--        ตรวจแบบ → ล็อกใบ → installment ต้องเป็นใบ pipeline ยอด > 0 → เรียกตัวอนุมัติใบเดิม (ไม่แตะเนื้อ) → ตั้ง "actualMode"
--        ในทรานแซกชันเดียวกัน · คืน jsonb เดิม (document = แถวหลังตั้งแบบ) · route เรียกตัวนี้ทุกครั้ง (ทั้งใบก็ส่ง 'order')
--        · 'order' ล้างช่อง Actual รายงวดที่งวดพามาจากใบรายงวด (Rev.) — ไม่งั้นงวดที่ยื่นค้างล็อกการปรับแผนถาวร
--     ② start_sales_order_installment_actual — นับงวดเลขน้อยสุด + งวดยอด 0 + งวดที่บัญชีรับรองแล้ว (via so_approval) · รันซ้ำได้
--        · p_counted_at (route ส่งเวลาอนุมัติใบ) = งวด 1 ลงเดือนที่อนุมัติใบแม้ขั้นนี้ข้ามเที่ยงคืนสิ้นเดือน · ปุ่มกู้ไม่ส่ง = เดือนที่กด
--        · ใบที่มีงวด via count_rest (Rev. ของใบที่กดนับที่เหลือทั้งหมด · มติข้อ 10) = นับ **ทุกงวด** ที่ยังไม่นับ (via count_rest)
--     ③ sales_order_installment_actual_action — submit · withdraw · approve · reject ของงวดเดียว (คืน {before, after})
--     ④ count_rest_sales_order_installment_actual — "นับที่เหลือทั้งหมด" (AE Sup + เหตุผล · via count_rest) · กดแล้วใบนับทั้งก้อนถาวร (§5f)
--  §7 ตัวล็อกปรับแผนงวด: _so_installment_replan_locked ตัวใหม่ 8 พารามิเตอร์ (+ "actualStatus", amount) — ยื่นขอนับอยู่ = ล็อก ·
--     นับ Actual แล้ว = **ไม่ล็อก** (มติข้อ 9: ปรับยอด/วันได้ ลบไม่ได้ — ด่านลบคือ trigger §5e) ยกเว้นงวดยอด 0 (แถวเปิดต้องยอด > 0
--     ⇒ ปล่อยเปิด = ปรับแผนใบนั้นไม่ได้เลย · คงล็อกเหมือนเดิม)
--     + ปะฟังก์ชันที่รันอยู่จริงสองตัวให้เรียกตัวใหม่ (pg_get_functiondef แบบ 0382/0404 · anchor ต้องเจอครบจำนวนพอดี):
--       แกนเขียนแผนของ 0377 (5 จุด) · ตัวยกเงินของ 0378 (3 จุด) + C1: แถวที่ยกมาล้างช่อง Actual รายงวด
--       (มติ: ยกเงินเข้าใบรายงวด = ต้องยื่น-อนุมัติในใบใหม่อีกรอบ — ส่วนแบ่งเดิมเป็นของใบที่ยกเลิกไปแล้ว)
--       + C2: มัดจำที่ยกมาแทนงวดที่นับตอนอนุมัติใบทั้งงวด (Actual ย้ายไปแถวที่ยก) · ด่าน installment_carry_counted_locked
--       + W1 (แกนเขียนแผน) / C2o (ตัวยกเงินหลัง C2b · review รอบสาม 26/10): แผนที่ไม่เหลืองวดที่ยังไม่นับ Actual ทั้งที่ Σ ยอดที่นับแล้ว
--         < actualAmount ของใบ = installment_actual_remainder_orphaned (ยอดที่เหลือไม่มีงวดไหนนับได้อีก — ส่วนแบ่งวางเศษที่งวดที่ยังไม่นับเท่านั้น)
--     · ตัวล็อก 6 พารามิเตอร์ของ 0377 คงไว้ไม่แตะ (บล็อกลองของ 0377/0378 ยังเรียกได้) — §8 ตรวจว่าไม่มีฟังก์ชันไหนเรียกมันแล้ว
--  §8 ตรวจท้าย — ลายนิ้วมือของที่ต้องไม่แตะเท่าเดิม · ไม่มีใครเรียกตัวล็อก 6 พารามิเตอร์ · ป้ายแพตช์ครบ
--
--  ── รหัสผิดพลาดใหม่ (ข้อความไทยอยู่ที่ src/lib/sales/documentWorkflowErrors.js) ─────────────────────────
--   sales_order_actual_mode_invalid · sales_order_actual_mode_ineligible · installment_actual_not_approved ·
--   installment_actual_order_not_installment · installment_actual_order_not_approved · installment_actual_bad_state ·
--   installment_actual_previous_unconfirmed · installment_actual_forbidden · installment_actual_self_approval ·
--   installment_actual_reason_required · installment_actual_stale · installment_actual_not_found ·
--   installment_carry_counted_locked · installment_actual_counted_row_delete · installment_actual_remainder_orphaned ·
--   installment_actual_unfrozen (review รอบสี่: ยื่น/อนุมัติ/นับที่เหลือทั้งหมดบนใบที่มีงวดยังไม่ตรึง — route ตรึงก่อนเฉพาะ start/count_rest)
--   (ใช้ซ้ำ: workflow_identity_required · sales_order_not_found · และทุกรหัสของตัวอนุมัติใบเดิมไหลผ่านตามเดิม)
--
--  ⛔ ไม่แตะ: ตัวอนุมัติใบเดิม (md5 เท่าเดิม · ตรวจท้าย) · ตัวย้อนอนุมัติ · ตัวออก Rev. (ย้ายงวดทั้งแถว — ช่อง Actual รายงวดติดไป
--     ⇒ Rev. อนุมัติแบบรายงวด = งวดที่เคยนับกลับมาในเดือน Rev.) · ตัวปรับแผน (replan RPC) · sales_order_actual_trigger (0108) ·
--     sales_deals_enforce_so_actual_trg (0110) · เจ้าของยอด (0294) · ด่านใบย้อนหลังของงวด (0387)
--  ⛔ ไม่ backfill — ไม่มี INSERT/UPDATE/DELETE นอกตัวฟังก์ชัน · ใบเดิมทุกใบได้ 'order' + cache 0 จาก DEFAULT ·
--     ดีลยังไม่มีคีย์ใหม่จนกว่าจะถูก sync ครั้งถัดไป (ตัวอ่านฝั่งแอปถอยไปใช้ {wonMonth: wonValue} — เท่ากันทุกดีลวันนี้)
--     ห้ามวนคิดทุกดีลใหม่ — ทุก UPDATE metadata ปลุก enforce (บทเรียน 0353)
--  🪤 ไฟล์นี้เขียนข้อความ FUNCTION ตามด้วย public. + ชื่อ เฉพาะตัวที่ไฟล์นี้นิยามเอง — ฟังก์ชันที่รันอยู่ซึ่งถูกปะ/ถูกเรียก
--     อ้างด้วยชื่อเปล่าหรือ p.proname = '…' เท่านั้น (ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของนิยามด้วยข้อความนั้น)
--
--  🛑 **ลำดับขึ้นระบบ: รันไฟล์นี้ก่อน deploy โค้ด JS ของฟีเจอร์นี้**
--     · รันแล้วโค้ดที่ deploy อยู่ทำงานได้เหมือนเดิม: คอลัมน์ใหม่มีค่าตั้งต้น · RPC ใหม่ยังไม่มีใครเรียก ·
--       คู่ sync ให้ค่าเดิมทุกดีลแบบทั้งใบ · trigger งวดไม่แตะดีลของใบทั้งใบ · ตัวล็อกตัวใหม่ = ตัวเดิมเมื่อ "actualStatus" ว่าง
--     · deploy โค้ดก่อนรัน = หน้า SO / แดชบอร์ดพัง (โค้ดใหม่ select คอลัมน์ใหม่ · CI check:columns แดงจนกว่าจะรัน)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE ·
--     แพตช์ที่มีป้ายแล้ว = ข้าม "ปะไว้แล้ว")
--  ⚠️ ห้ามรัน 0377 / 0378 ซ้ำหลังไฟล์นี้ (เขียนทับแกนเขียนแผน/ตัวยกเงินกลับเป็นตัวที่เรียกตัวล็อก 6 พารามิเตอร์) —
--     ถ้าจำเป็น รันไฟล์นี้ซ้ำตามหลังทันที
--  🧪 พิสูจน์บนฮาร์เนส PGlite (นอก repo) — โหลด schema.sql + 0001–0411 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ROLLBACK คืนทุกอย่าง) ───────────────────────────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายไฟล์ด้วยบล็อกข้างล่าง (ตัด BEGIN; บรรทัดแรกของบล็อกทิ้ง)
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อกข้างล่างทั้งก้อน
--  แทนค่า <SO> = id ของใบจาก SELECT แรก (ใบ pipeline ที่อนุมัติแล้ว · มี ≥ 2 งวด · ยอด > 0) · <adminId> = id ผู้ใช้ admin
--  บล็อกนี้สลับใบเป็นรายงวดตรง ๆ (ไม่ผ่านตัวห่อ — prod ไม่มีใบรออนุมัติ) → ดูดีลหลุด Actual → นับงวด 1 → ดูดีล แล้ว ROLLBACK
--
--   BEGIN;
--   SELECT o.id, o."orderNumber", o."dealId", o."actualAmount", count(i.*) AS rows
--     FROM public.sales_orders o JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
--    WHERE o.status = 'approved' AND o.origin = 'pipeline' AND o."totalAmount" > 0
--    GROUP BY o.id HAVING count(i.*) >= 2 ORDER BY o."approvedAt" DESC LIMIT 5;
--   SELECT d."wonValue", d.metadata->>'wonMonth' AS won_month, d.metadata->'actualByMonth' AS by_month
--     FROM public.sales_deals d WHERE d.id = (SELECT "dealId" FROM public.sales_orders WHERE id = '<SO>');  -- ค่าเดิม
--   UPDATE public.sales_orders SET "actualMode" = 'installment' WHERE id = '<SO>';
--   SELECT d."wonValue", d.metadata->'actualByMonth' AS by_month, d.metadata->'soInstRemainingByDue' AS remaining
--     FROM public.sales_deals d WHERE d.id = (SELECT "dealId" FROM public.sales_orders WHERE id = '<SO>');
--                                         -- wonValue หักยอดใบนี้ · remaining รวม = actualAmount ของใบ
--   SELECT public.start_sales_order_installment_actual('<SO>', '<adminId>', 'smoke 0412', 'admin') -> 'counted';  -- ≥ 1
--   SELECT seq, amount, "actualStatus", "actualAmount", "actualApprovedVia"
--     FROM public.sales_order_installments WHERE "salesOrderId" = '<SO>' ORDER BY seq;   -- งวด 1 = approved · so_approval
--   SELECT d."wonValue", d.metadata->'actualByMonth' AS by_month, d.metadata->'soInstRemainingByDue' AS remaining,
--          (SELECT "actualCountedAmount" FROM public.sales_orders WHERE id = '<SO>') AS counted
--     FROM public.sales_deals d WHERE d.id = (SELECT "dealId" FROM public.sales_orders WHERE id = '<SO>');
--                                         -- wonValue = ใบอื่น + ยอดงวด 1 (ก่อน VAT) · by_month เดือนนี้ · counted = ยอดงวด 1
--   ROLLBACK;
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   ① ของที่ต้องมี — คาด: so_cols = 3 · inst_cols = 14 · chk = 3 · trg = 6 · fns = 15 · anon_rpc = f · svc_rpc = t
--   SELECT
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders'
--      AND column_name IN ('actualMode', 'actualCountedAmount', 'actualSubmittedAmount')) AS so_cols,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_order_installments'
--      AND column_name LIKE 'actual%') AS inst_cols,
--    (SELECT count(*) FROM pg_constraint WHERE conname IN ('sales_orders_actual_mode_valid', 'sales_orders_actual_cache_sane',
--      'sales_order_installments_actual_shape') AND convalidated) AS chk,
--    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sales_orders_actual_mode_trg',
--      'sales_order_installments_actual_guard', 'sales_order_installments_actual_sync', 'sales_orders_sync_actual_trg',
--      'sales_order_installments_actual_delete_guard', 'sales_order_installments_actual_autocount')) AS trg,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname IN ('approve_sales_order_with_actual_mode', 'start_sales_order_installment_actual',
--        'sales_order_installment_actual_action', 'count_rest_sales_order_installment_actual',
--        '_so_installment_actual_share', '_so_installment_actual_estimates', '_so_installment_actual_cache',
--        '_deal_so_actual_extras', '_so_installment_actual_refresh', 'sales_order_actual_mode_guard',
--        'so_installment_actual_confirm_guard', 'so_installment_actual_after', 'so_installment_actual_delete_guard',
--        'so_installment_actual_autocount')
--      OR (n.nspname = 'public' AND p.proname = '_so_installment_replan_locked' AND p.pronargs = 8)) AS fns,
--    has_function_privilege('anon', 'public.sales_order_installment_actual_action(text,text,text,timestamptz,text,text,text)', 'EXECUTE') AS anon_rpc,
--    has_function_privilege('service_role', 'public.sales_order_installment_actual_action(text,text,text,timestamptz,text,text,text)', 'EXECUTE') AS svc_rpc;
--   ② ไม่มีอะไรขยับ — คาด: modes = 0 · caches = 0 · statuses = 0
--   SELECT
--    (SELECT count(*) FROM public.sales_orders WHERE "actualMode" <> 'order') AS modes,
--    (SELECT count(*) FROM public.sales_orders WHERE "actualCountedAmount" <> 0 OR "actualSubmittedAmount" <> 0) AS caches,
--    (SELECT count(*) FROM public.sales_order_installments WHERE "actualStatus" IS NOT NULL) AS statuses;
--   ③ ทุกดีล: wonValue / wonMonth / ยอดรออนุมัติที่เก็บไว้ = ค่าที่คู่ sync ตัวใหม่คิดได้ (ไม่มีดีลไหนขยับ)
--      คาด: won_value_diff = 0 · won_month_diff = 0 · pending_diff = 0 · deals = จำนวนดีลที่มี actualSource = 'sale_order'
--      (ไม่ใช่ 0 = cache ของดีลนั้นเพี้ยนมาก่อนไฟล์นี้ — ไฟล์นี้ไม่เขียนดีลเลย · แจ้งผู้พัฒนาพร้อมรหัสดีลจากคำสั่งเดียวกันที่ตัด count ออก)
--   SELECT count(*) AS deals,
--          count(*) FILTER (WHERE d."wonValue" IS DISTINCT FROM r.won_value) AS won_value_diff,
--          count(*) FILTER (WHERE d.metadata->>'wonMonth' IS DISTINCT FROM r.won_month) AS won_month_diff,
--          count(*) FILTER (WHERE (d.metadata->>'soPendingAmount')::numeric IS DISTINCT FROM r.pending) AS pending_diff
--     FROM public.sales_deals d
--     CROSS JOIN LATERAL (
--       SELECT COALESCE(sum(o."actualAmount") FILTER (WHERE o.status = 'approved' AND o."actualMode" <> 'installment'), 0)
--                + COALESCE((SELECT x.counted FROM public._deal_so_actual_extras(d.id) x), 0) AS won_value,
--              to_char(max(COALESCE(o."approvedAt" AT TIME ZONE 'Asia/Bangkok', o."orderDate"::timestamp))
--                FILTER (WHERE o.status = 'approved'), 'YYYY-MM') AS won_month,
--              sum(o."actualAmount") FILTER (WHERE o.status = 'pending_approval') AS pending
--         FROM public.sales_orders o
--        WHERE o."dealId" = d.id AND o.origin = 'pipeline' AND o.status IN ('approved', 'pending_approval')
--     ) r
--    WHERE d.metadata->>'actualSource' = 'sale_order';
--   ④ แพตช์ — คาด: plan8 = 5 · carry8 = 3 · c1 = 1 · c2 = 1 · w1 = 1 · c2o = 1 · six_arg_callers = 0
--   SELECT
--    (SELECT count(*) FROM pg_proc p, regexp_matches(p.prosrc, '_so_installment_replan_locked\([^;]*?"actualStatus", [a-z]+\.amount\)', 'g')
--      WHERE p.proname = '_so_installments_write_plan') AS plan8,
--    (SELECT count(*) FROM pg_proc p, regexp_matches(p.prosrc, '_so_installment_replan_locked\([^;]*?"actualStatus", [a-z]+\.amount\)', 'g')
--      WHERE p.proname = 'carry_sales_order_installments') AS carry8,
--    (SELECT count(*) FROM pg_proc p WHERE p.proname = 'carry_sales_order_installments' AND strpos(p.prosrc, '0412/C1 ▶') > 0) AS c1,
--    (SELECT count(*) FROM pg_proc p WHERE p.proname = 'carry_sales_order_installments' AND strpos(p.prosrc, '0412/C2b ▶') > 0) AS c2,
--    (SELECT count(*) FROM pg_proc p WHERE p.proname = '_so_installments_write_plan' AND strpos(p.prosrc, '0412/W1 ▶') > 0) AS w1,
--    (SELECT count(*) FROM pg_proc p WHERE p.proname = 'carry_sales_order_installments' AND strpos(p.prosrc, '0412/C2o ▶') > 0) AS c2o,
--    (SELECT count(*) FROM pg_proc p, regexp_matches(p.prosrc, '_so_installment_replan_locked\([^()]*"paidOn"\)', 'g')) AS six_arg_callers;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อนเสมอ (โค้ดใหม่ select คอลัมน์ใหม่) · ถอยได้สะอาดเฉพาะตอนที่ยังไม่มีใบรายงวด (② modes = 0 · statuses = 0) —
--   มีแล้ว = Actual ของใบนั้นกลับเป็นทั้งใบในเดือนที่อนุมัติใบ (คู่ sync ของ 0360 ไม่รู้จักงวด)
--   1) รัน 0377 §1–§2 และ 0378 §3 ซ้ำ (แกนเขียนแผน/ตัวยกเงินกลับเรียกตัวล็อก 6 พารามิเตอร์ · ป้าย C1 หาย) แล้วรัน 0382 §2 ซ้ำ
--      (ด่านตำแหน่งของตัวยกเงินกลับเป็น is_sales_manager_role) · 2) รันคู่ sync/enforce ของ 0360 §5 ซ้ำ ·
--      สร้าง sales_orders_sync_actual_trg ตาม 0279 §3 ใหม่ · 3) DROP TRIGGER ห้าตัวใหม่ (รวม constraint trigger
--      sales_order_installments_actual_autocount) + DROP FUNCTION ตัวใหม่ทั้งหมดของไฟล์นี้ ·
--      4) DROP CONSTRAINT สามตัว + DROP COLUMN ใหม่ทั้งหมด · NOTIFY pgrst, 'reload schema';
-- ============================================================

BEGIN;

-- ── §0 ด่านลำดับรัน + ลายนิ้วมือของที่ต้องไม่แตะ ─────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regprocedure('public._so_installments_write_plan(text, jsonb, timestamptz, text, text)') IS NULL
     OR to_regprocedure('public.carry_sales_order_installments(text, text, text[], jsonb, jsonb, text, text, text, text)') IS NULL
     OR to_regprocedure('public.is_sales_manager_role(text)') IS NULL
     OR to_regprocedure('public._so_installment_replan_locked(text, text, text, text, jsonb, date)') IS NULL
     OR to_regprocedure('public.approve_sales_order_with_signature_evidence_atomic(text, text, timestamptz, text, text, text, text, text, text, text)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_order_installments' AND column_name = 'movedFrom') THEN
    RAISE EXCEPTION 'mig_0412_requires_0378_0382 — รัน 0376 · 0377 · 0378 · 0382 ก่อน';
  END IF;

  -- ลายนิ้วมือของฟังก์ชันเงินที่ไฟล์นี้ต้องไม่แตะ — ตัวแปรของทรานแซกชัน (ตายตอน COMMIT/ROLLBACK) · §8 เทียบ
  PERFORM set_config('mig_0412.untouched', (
    SELECT jsonb_object_agg(p.proname || '/' || p.pronargs, md5(p.prosrc))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY[
         'approve_sales_order_with_signature_evidence_atomic', 'revoke_sales_order_approval_atomic',
         'revise_approved_sales_order_atomic', 'replan_sales_order_installments', 'sales_order_actual_trigger',
         'snapshot_sales_order_owner', 'historical_so_installment_order_live'])
  ), true);
END
$pre$;

-- ── §1 sales_orders: แบบการนับ Actual + cache ของยอดงวด ──────────────────────────────────────────
-- ⚠️ คำสั่ง ALTER TABLE เดียวชั้นนอก — serviceRoundsCopyPaths.test.mjs เก็บคอลัมน์จากรูปประโยคนี้แล้วบังคับให้ทุกตัว
--    ถูกตัดสินว่าทาง Rev./ใบร่างพาไปหรือไม่ (ทั้งสามตัว = ไม่พา: แบบเป็นของการอนุมัติแต่ละรอบ · cache คิดจากแถวงวดเอง)
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "actualMode" text NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS "actualCountedAmount" numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "actualSubmittedAmount" numeric NOT NULL DEFAULT 0;

-- รายงวดได้เฉพาะใบ pipeline (ใบย้อนหลังไม่นับ Actual เลย — 0360) ที่ผ่านการอนุมัติมาแล้ว
-- (ร่าง/รออนุมัติ/ตีกลับ = 'order' เสมอ — trigger §5a คืนค่าให้ตอนสถานะถอยกลับก่อนถึง CHECK · เขียนตรงลงใบก่อนอนุมัติ = ตายที่นี่)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_actual_mode_valid;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_actual_mode_valid CHECK (
    "actualMode" IN ('order', 'installment')
    AND ("actualMode" = 'order'
      OR (origin = 'pipeline' AND status NOT IN ('draft', 'pending_approval', 'rejected')))
  );

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_actual_cache_sane;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_actual_cache_sane CHECK (
    "actualCountedAmount" >= 0 AND "actualSubmittedAmount" >= 0
  );

COMMENT ON COLUMN public.sales_orders."actualMode" IS
  'แบบการนับ Actual (0412): order = ทั้งใบตอนอนุมัติใบ (เดิม) · installment = รายงวดตอน AE Sup อนุมัติงวด · ตั้งได้ทางเดียวคือ approve_sales_order_with_actual_mode · ใบกลับเป็นร่าง/รออนุมัติ/ตีกลับ = order';
COMMENT ON COLUMN public.sales_orders."actualCountedAmount" IS
  'cache (0412): Σ "actualAmount" ของงวดที่ "actualStatus" = approved (ก่อน VAT) — trigger ของงวดดูแล ห้ามเขียนเอง';
COMMENT ON COLUMN public.sales_orders."actualSubmittedAmount" IS
  'cache (0412): Σ ยอดประมาณก่อน VAT ของงวดที่ยื่นแล้วรอ AE Sup (_so_installment_actual_estimates) — trigger ดูแล ห้ามเขียนเอง';

-- ── §2 sales_order_installments: วงจร ยื่น → อนุมัติ (นับ Actual) / ตีกลับ ของงวด ────────────────────────────
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "actualStatus" text,
  ADD COLUMN IF NOT EXISTS "actualSubmittedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "actualSubmittedById" text,
  ADD COLUMN IF NOT EXISTS "actualSubmittedByName" text,
  ADD COLUMN IF NOT EXISTS "actualApprovedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "actualApprovedById" text,
  ADD COLUMN IF NOT EXISTS "actualApprovedByName" text,
  ADD COLUMN IF NOT EXISTS "actualApprovedVia" text,
  ADD COLUMN IF NOT EXISTS "actualRejectedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "actualRejectedById" text,
  ADD COLUMN IF NOT EXISTS "actualRejectedByName" text,
  ADD COLUMN IF NOT EXISTS "actualRejectedReason" text,
  ADD COLUMN IF NOT EXISTS "actualAmount" numeric,
  ADD COLUMN IF NOT EXISTS "actualNote" text;

/* รูปของแถว — NULL = ยังไม่ยื่น (หรือใบทั้งใบ) · submitted = มีเวลายื่น ยังไม่มีผลอนุมัติ · approved = มีเวลาอนุมัติ + ยอด ≥ 0 + ทาง
   (count_rest ต้องมีเหตุผล) · rejected = มีเวลา + เหตุผล ≥ 10 ไม่มีผลอนุมัติ
   · ช่องผู้ยื่น/ผู้ตีกลับรอบก่อนค้างได้ (ประวัติของแถว — ยื่นใหม่หลังตีกลับไม่ล้างเหตุผลเดิม) · ยกเงินข้ามใบล้างทุกช่อง (§7 C1) */
ALTER TABLE public.sales_order_installments DROP CONSTRAINT IF EXISTS sales_order_installments_actual_shape;
ALTER TABLE public.sales_order_installments
  ADD CONSTRAINT sales_order_installments_actual_shape CHECK (
    ("actualStatus" IS NULL OR "actualStatus" IN ('submitted', 'approved', 'rejected'))
    AND ("actualApprovedVia" IS NULL OR "actualApprovedVia" IN ('so_approval', 'review', 'count_rest'))
    AND ("actualRejectedReason" IS NULL OR length("actualRejectedReason") <= 500)
    AND ("actualNote" IS NULL OR length("actualNote") <= 500)
    AND (
      ("actualStatus" IS NULL
        AND "actualApprovedAt" IS NULL AND "actualAmount" IS NULL AND "actualApprovedVia" IS NULL)
      OR ("actualStatus" = 'submitted' AND "actualSubmittedAt" IS NOT NULL
        AND "actualApprovedAt" IS NULL AND "actualAmount" IS NULL AND "actualApprovedVia" IS NULL)
      OR ("actualStatus" = 'approved' AND "actualApprovedAt" IS NOT NULL
        AND "actualAmount" IS NOT NULL AND "actualAmount" >= 0 AND "actualApprovedVia" IS NOT NULL
        AND ("actualApprovedVia" <> 'count_rest' OR length(btrim(COALESCE("actualNote", ''))) >= 10))
      OR ("actualStatus" = 'rejected' AND "actualRejectedAt" IS NOT NULL
        AND length(btrim(COALESCE("actualRejectedReason", ''))) >= 10
        AND "actualApprovedAt" IS NULL AND "actualAmount" IS NULL AND "actualApprovedVia" IS NULL)
    )
  );

COMMENT ON COLUMN public.sales_order_installments."actualStatus" IS
  'Actual รายงวด (0412): NULL = ยังไม่ยื่น (หรือใบทั้งใบ) · submitted = ยื่นแล้วรอ AE Sup · approved = นับ Actual แล้ว · rejected = ตีกลับ';
COMMENT ON COLUMN public.sales_order_installments."actualAmount" IS
  'ยอดก่อน VAT ของงวดที่นับเข้า Actual — ตรึงตอนอนุมัติงวด (_so_installment_actual_share · งวดสุดท้ายรับเศษ ⇒ Σ = actualAmount ของใบ)';
COMMENT ON COLUMN public.sales_order_installments."actualApprovedVia" IS
  'ทางที่งวดถูกนับ: so_approval = คลิกอนุมัติใบ (งวด 1 · งวด 0 บาท · งวดที่รับรองเงินแล้ว) · review = AE Sup อนุมัติงวดที่ยื่น · count_rest = นับที่เหลือทั้งหมด';
COMMENT ON COLUMN public.sales_order_installments."actualNote" IS
  'เหตุผลของ "นับที่เหลือทั้งหมด" (10–500 ตัวอักษร · 0412)';

-- ── §3 ตัวช่วยคำนวณ — คู่กับ src/lib/sales/salesOrderActualMode.js (แก้ฝั่งเดียว = จอกับฐานตอบคนละยอด) ─────────────
/* ส่วนแบ่งก่อน VAT ของงวดหนึ่ง ณ ตอนอนุมัติงวด ("actualAmount" ของใบ = ก่อน VAT · amount ของงวด = รวม VAT)
   · งวดสุดท้ายที่ยังไม่นับ = ยอดคงเหลือทั้งหมด (actualAmount − Σ งวดที่นับแล้ว) ⇒ นับครบทุกงวดแล้ว Σ = actualAmount พอดี
   · งวดอื่น = round(amount × actualAmount / totalAmount, 2) แต่ไม่เกินยอดคงเหลือ */
CREATE OR REPLACE FUNCTION public._so_installment_actual_share(p_installment_id text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_row public.sales_order_installments%ROWTYPE;
  v_actual numeric;
  v_total numeric;
  v_left numeric;
BEGIN
  SELECT * INTO v_row FROM public.sales_order_installments WHERE id = p_installment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment_actual_not_found'; END IF;

  SELECT GREATEST(COALESCE(o."actualAmount", 0), 0), COALESCE(o."totalAmount", 0)
    INTO v_actual, v_total
    FROM public.sales_orders o
   WHERE o.id = v_row."salesOrderId" AND o.origin = 'pipeline';
  IF NOT FOUND THEN RETURN 0; END IF;

  v_left := GREATEST(v_actual - COALESCE((
    SELECT sum(i."actualAmount") FROM public.sales_order_installments i
     WHERE i."salesOrderId" = v_row."salesOrderId" AND i.id <> v_row.id AND i."actualStatus" = 'approved'
  ), 0), 0);

  IF NOT EXISTS (
    SELECT 1 FROM public.sales_order_installments i
     WHERE i."salesOrderId" = v_row."salesOrderId" AND i.id <> v_row.id
       AND i."actualStatus" IS DISTINCT FROM 'approved'
  ) THEN
    RETURN v_left;
  END IF;

  RETURN LEAST(
    CASE WHEN v_total > 0 THEN round(GREATEST(COALESCE(v_row.amount, 0), 0) * v_actual / v_total, 2) ELSE 0 END,
    v_left);
END;
$$;

COMMENT ON FUNCTION public._so_installment_actual_share(text) IS
  'ส่วนแบ่งก่อน VAT ของงวด ณ ตอนอนุมัติงวด (0412) — งวดสุดท้ายที่ยังไม่นับรับยอดคงเหลือ · งวดอื่น round(amount × actual / total, 2) ไม่เกินคงเหลือ · คู่กับ salesOrderActualMode.js';

/* ยอดประมาณก่อน VAT ของงวดที่ยังไม่นับ (กอง "รออนุมัติ" / "รอนับรายงวด") — ตามลำดับงวด งวดละ round(...) ไม่เกินคงเหลือ
   งวดท้ายรับเศษ ⇒ นับแล้ว + ยื่นแล้ว + ยังไม่ยื่น = actualAmount พอดี · ยอดใบรับเป็นพารามิเตอร์ (trigger ก่อนเขียนใบส่งค่าใหม่มา)
   · ชื่อคอลัมน์ผลลัพธ์ไม่ชนชื่อคอลัมน์ของตาราง (plpgsql ถือชื่อผลลัพธ์เป็นตัวแปร) */
CREATE OR REPLACE FUNCTION public._so_installment_actual_estimates(p_order_id text, p_actual numeric, p_total numeric)
RETURNS TABLE (installment_id text, installment_seq integer, actual_status text, due_date date, estimate numeric)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_actual numeric := GREATEST(COALESCE(p_actual, 0), 0);
  v_total numeric := COALESCE(p_total, 0);
  v_left numeric;
  v_open integer;
  v_k integer := 0;
  r record;
BEGIN
  SELECT GREATEST(v_actual - COALESCE(sum(i."actualAmount") FILTER (WHERE i."actualStatus" = 'approved'), 0), 0),
         count(*) FILTER (WHERE i."actualStatus" IS DISTINCT FROM 'approved')
    INTO v_left, v_open
    FROM public.sales_order_installments i
   WHERE i."salesOrderId" = p_order_id;

  FOR r IN
    SELECT i.id, i.seq, i.amount, i."actualStatus" AS st, i."dueDate" AS due
      FROM public.sales_order_installments i
     WHERE i."salesOrderId" = p_order_id AND i."actualStatus" IS DISTINCT FROM 'approved'
     ORDER BY i.seq, i.id
  LOOP
    v_k := v_k + 1;
    installment_id := r.id;
    installment_seq := r.seq;
    actual_status := r.st;
    due_date := r.due;
    estimate := CASE
      WHEN v_k = v_open THEN v_left
      ELSE LEAST(CASE WHEN v_total > 0 THEN round(GREATEST(COALESCE(r.amount, 0), 0) * v_actual / v_total, 2) ELSE 0 END, v_left)
    END;
    v_left := v_left - estimate;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public._so_installment_actual_estimates(text, numeric, numeric) IS
  'ยอดประมาณก่อน VAT ของงวดที่ยังไม่นับ ตามลำดับงวด งวดท้ายรับเศษ (0412) — นับแล้ว + ยื่นแล้ว + ยังไม่ยื่น = actualAmount ของใบ · คู่กับ salesOrderActualMode.js';

-- cache สองช่องของใบ (คิดจากแถวงวด + ยอดใบที่ส่งมา)
CREATE OR REPLACE FUNCTION public._so_installment_actual_cache(
  p_order_id text,
  p_actual numeric,
  p_total numeric,
  OUT counted numeric,
  OUT submitted numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT sum(i."actualAmount") FROM public.sales_order_installments i
               WHERE i."salesOrderId" = p_order_id AND i."actualStatus" = 'approved'), 0),
    COALESCE((SELECT sum(e.estimate) FROM public._so_installment_actual_estimates(p_order_id, p_actual, p_total) e
               WHERE e.actual_status = 'submitted'), 0)
$$;

COMMENT ON FUNCTION public._so_installment_actual_cache(text, numeric, numeric) IS
  'ค่าของ cache "actualCountedAmount" / "actualSubmittedAmount" ของใบ (0412) — ผู้เรียก: trigger ของใบและของงวด';

/* คีย์ใหม่ของ metadata ดีล + ยอดงวดที่นับแล้ว (ผู้เรียก: คู่ sync/enforce ข้างล่างเท่านั้น)
   · counted = Σ ยอดงวดที่นับแล้วของใบรายงวดที่อนุมัติ (NULL = ไม่มีงวดที่นับเลย ⇒ wonValue ของใบทั้งใบไม่ถูกบวกอะไร = ค่าเดิมทุกตัวอักษร)
   · keys: actualByMonth (มีเมื่อดีลมีใบอนุมัติ) · soInstPending* (มีเมื่อ count > 0) · soInstRemainingByDue (มีเมื่อไม่ว่าง)
   · เดือนของใบทั้งใบ = นิพจน์เดียวกับ wonMonth (approvedAt เวลาไทย · ถอยไป orderDate) · ของงวด = GREATEST(อนุมัติงวด, อนุมัติใบ) */
CREATE OR REPLACE FUNCTION public._deal_so_actual_extras(p_deal_id text, OUT counted numeric, OUT keys jsonb)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_by_month jsonb;
  v_pending numeric;
  v_pending_count integer;
  v_remaining jsonb;
BEGIN
  keys := '{}'::jsonb;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders o
     WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
  ) THEN
    RETURN;
  END IF;

  SELECT sum(i."actualAmount") INTO counted
    FROM public.sales_orders o
    JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
   WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
     AND o."actualMode" = 'installment' AND i."actualStatus" = 'approved';

  SELECT COALESCE(jsonb_object_agg(m.month, m.amount), '{}'::jsonb) INTO v_by_month
    FROM (
      SELECT e.month, sum(e.amount) AS amount
        FROM (
          SELECT to_char(COALESCE(o."approvedAt" AT TIME ZONE 'Asia/Bangkok', o."orderDate"::timestamp), 'YYYY-MM') AS month,
                 o."actualAmount" AS amount
            FROM public.sales_orders o
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" <> 'installment'
          UNION ALL
          SELECT to_char(GREATEST(i."actualApprovedAt", o."approvedAt") AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM'),
                 i."actualAmount"
            FROM public.sales_orders o
            JOIN public.sales_order_installments i ON i."salesOrderId" = o.id
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'installment' AND i."actualStatus" = 'approved'
        ) e
       WHERE e.month IS NOT NULL
       GROUP BY e.month
    ) m;
  keys := jsonb_build_object('actualByMonth', v_by_month);

  /* จำนวน = **ใบ** ที่มีงวดยื่นรออยู่ (review รอบสาม 26/10) ไม่ใช่จำนวนงวด — ทุกจอวาด soPendingCount + ตัวนี้เป็น "· n ใบ"
     (ใบหนึ่งอยู่กองเดียว: ใบรออนุมัติไม่มีงวดที่นับ/ยื่นได้ ⇒ ไม่นับซ้ำ) · ยอด = Σ ยอดประมาณของทุกงวดที่ยื่น */
  SELECT count(DISTINCT o.id), sum(x.estimate) INTO v_pending_count, v_pending
    FROM public.sales_orders o
    CROSS JOIN LATERAL public._so_installment_actual_estimates(o.id, o."actualAmount", o."totalAmount") x
   WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
     AND o."actualMode" = 'installment' AND x.actual_status = 'submitted';
  IF v_pending_count > 0 THEN
    keys := keys || jsonb_build_object('soInstPendingAmount', v_pending, 'soInstPendingCount', v_pending_count);
  END IF;

  /* กอง "รอนับรายงวด" — งวดที่ยังไม่ยื่น/ถูกตีกลับตามเดือนครบกำหนด
     + ใบรายงวดที่อนุมัติแล้วแต่ **ยังไม่มีงวดสักแถว** (ตัวหยุดยอดล้มหลังอนุมัติ · review 26/10): ยอดทั้งใบยังไม่นับ ⇒ ลง 'none'
       ไม่งั้นยอดทั้งใบหายจากทุกกอง (Actual 0 · รออนุมัติ 0 · ไม่ใช่ Won รอยื่น SO เพราะมี wonMonth) ขณะที่ตาราง SO นับเป็นรอนับรายงวด
       (salesOrderRemainingActual = actualAmount − นับแล้ว − ยื่นแล้ว) · มีงวดเมื่อไร trigger ของงวด sync ดีลใหม่ = ย้ายไปตามเดือนของงวดเอง */
  SELECT jsonb_object_agg(q.due_month, q.amount) INTO v_remaining
    FROM (
      SELECT r.due_month, sum(r.amount) AS amount
        FROM (
          SELECT COALESCE(to_char(x.due_date, 'YYYY-MM'), 'none') AS due_month, x.estimate AS amount
            FROM public.sales_orders o
            CROSS JOIN LATERAL public._so_installment_actual_estimates(o.id, o."actualAmount", o."totalAmount") x
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'installment' AND (x.actual_status IS NULL OR x.actual_status = 'rejected')
          UNION ALL
          SELECT 'none', o."actualAmount"
            FROM public.sales_orders o
           WHERE o."dealId" = p_deal_id AND o.status = 'approved' AND o.origin = 'pipeline'
             AND o."actualMode" = 'installment' AND COALESCE(o."actualAmount", 0) > 0
             AND NOT EXISTS (SELECT 1 FROM public.sales_order_installments i WHERE i."salesOrderId" = o.id)
        ) r
       GROUP BY r.due_month
    ) q;
  IF v_remaining IS NOT NULL THEN
    keys := keys || jsonb_build_object('soInstRemainingByDue', v_remaining);
  END IF;
END;
$$;

COMMENT ON FUNCTION public._deal_so_actual_extras(text) IS
  'คีย์ Actual รายงวดของดีล (0412) — actualByMonth · soInstPendingAmount/Count · soInstRemainingByDue + ยอดงวดที่นับแล้ว · ผู้เรียก: sync_sales_order_actual / enforce_sales_order_actual_on_deal';

-- ── §4 cache Actual / ยอดรออนุมัติของดีล — คัดจาก 0360 ทุกตัวอักษร + ใบรายงวด (สองตัวต้องอยู่ไฟล์เดียวกันเสมอ) ──────────
--  · SELECT แรกบวกเฉพาะใบทั้งใบ (FILTER) แต่เดือนยังมาจากทุกใบที่อนุมัติ = เดือนที่อนุมัติใบล่าสุด (ความหมายเดิม)
--  · ใบทั้งใบล้วน (ทุกดีลวันนี้): counted = NULL ⇒ wonValue/wonValueExVat = Σ เดิม (ค่าและจำนวนทศนิยมเท่าเดิม) · keys มีแค่ actualByMonth
CREATE OR REPLACE FUNCTION public.sync_sales_order_actual(p_deal_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
  v_pending numeric;
  v_pending_count integer;
  v_counted numeric;
  v_keys jsonb;
BEGIN
  SELECT COALESCE(sum("actualAmount") FILTER (WHERE "actualMode" <> 'installment'), 0),
         to_char(max(COALESCE("approvedAt" AT TIME ZONE 'Asia/Bangkok', "orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'approved' AND origin = 'pipeline';

  SELECT COALESCE(sum("actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'pending_approval' AND origin = 'pipeline';

  SELECT x.counted, x.keys INTO v_counted, v_keys FROM public._deal_so_actual_extras(p_deal_id) x;
  IF v_counted IS NOT NULL THEN
    v_actual := v_actual + v_counted;
  END IF;

  UPDATE public.sales_deals d SET
    "wonValue" = v_actual,
    metadata = (COALESCE(d.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount'
        - 'actualByMonth' - 'soInstPendingAmount' - 'soInstPendingCount' - 'soInstRemainingByDue')
      || jsonb_build_object(
        'actualSource', 'sale_order',
        'wonMonth', v_won_month,
        'wonValueExVat', v_actual
      )
      || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
        'soPendingAmount', v_pending,
        'soPendingCount', v_pending_count
      ) ELSE '{}'::jsonb END
      || COALESCE(v_keys, '{}'::jsonb),
    "updatedAt" = now()
  WHERE d.id = p_deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sales_order_actual_on_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual numeric;
  v_won_month text;
  v_pending numeric;
  v_pending_count integer;
  v_counted numeric;
  v_keys jsonb;
BEGIN
  SELECT COALESCE(sum(so."actualAmount") FILTER (WHERE so."actualMode" <> 'installment'), 0),
         to_char(max(COALESCE(so."approvedAt" AT TIME ZONE 'Asia/Bangkok', so."orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'approved' AND so.origin = 'pipeline';

  SELECT COALESCE(sum(so."actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'pending_approval' AND so.origin = 'pipeline';

  SELECT x.counted, x.keys INTO v_counted, v_keys FROM public._deal_so_actual_extras(NEW.id) x;
  IF v_counted IS NOT NULL THEN
    v_actual := v_actual + v_counted;
  END IF;

  NEW."wonValue" := v_actual;
  NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount'
      - 'actualByMonth' - 'soInstPendingAmount' - 'soInstPendingCount' - 'soInstRemainingByDue')
    || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonMonth', v_won_month,
      'wonValueExVat', v_actual
    )
    || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
      'soPendingAmount', v_pending,
      'soPendingCount', v_pending_count
    ) ELSE '{}'::jsonb END
    || COALESCE(v_keys, '{}'::jsonb);
  RETURN NEW;
END;
$$;

-- ── §5a ใบ: แบบกลับเป็น 'order' เมื่อใบกลับไปก่อนอนุมัติ + cache คิดด้วยยอดของแถวที่กำลังเขียน ───────────────────
-- แพตเทิร์นเดียวกับตัวล้างตราการข้ามของ 0404 (BEFORE UPDATE OF status · แก้เฉพาะช่องของตัวเอง)
-- · ใบที่กู้คืนเป็นร่างแล้วอนุมัติใหม่ไม่ค้างแบบเก่า · ย้อนอนุมัติ (approval_revoked) คงแบบไว้ (ตัวเลือกตั้งต้นของ Rev. อ่านจากใบเดิม)
CREATE OR REPLACE FUNCTION public.sales_order_actual_mode_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counted numeric;
  v_submitted numeric;
BEGIN
  IF NEW.status IN ('draft', 'pending_approval', 'rejected') AND NEW."actualMode" IS DISTINCT FROM 'order' THEN
    NEW."actualMode" := 'order';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT c.counted, c.submitted INTO v_counted, v_submitted
      FROM public._so_installment_actual_cache(NEW.id, NEW."actualAmount", NEW."totalAmount") c;
    NEW."actualCountedAmount" := v_counted;
    NEW."actualSubmittedAmount" := v_submitted;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_actual_mode_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_actual_mode_trg
BEFORE INSERT OR UPDATE OF status, "actualAmount", "totalAmount" ON public.sales_orders
FOR EACH ROW
EXECUTE FUNCTION public.sales_order_actual_mode_guard();

-- ── §5b งวด: บัญชีรับรองงวดที่ยังไม่อนุมัติไม่ได้ (ใบรายงวด) — ปฏิเสธอย่างเดียว ไม่เขียนทับแถว ─────────────────────
-- ด่านชั้นแรกอยู่ที่ installmentActionError (จอ/API) · ตัวนี้ปิด race กับการอนุมัติ/ย้อนอนุมัติ และทางเขียนที่ไม่ผ่าน route
-- ⚠️ ไม่ล็อกใบ (ลำดับล็อกของ RPC คือ ใบ → งวด · ฝั่งนี้ถืองวดอยู่แล้ว — แพตเทิร์น 0387)
-- ⛔ ยกเว้นใบที่ยกเลิก (review 26/10): ใบยกเลิกไม่นับ Actual และไม่มีใครอนุมัตินับงวดของใบนั้นได้ (RPC ต้องใบ approved) — ถ้ายังกัน
--    งวดที่ลูกค้าจ่ายมาแล้ว (reported) รับรอง → คืนเงินไม่ได้เลย (ทางตันคืนเงิน 23/09 D4) · ใบที่ย้อนอนุมัติยังกันตามเดิม (งวดย้ายไปใบ Rev.)
CREATE OR REPLACE FUNCTION public.so_installment_actual_confirm_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
BEGIN
  -- แก้ช่องอื่นของแถวที่ confirmed อยู่แล้ว (สถานะไม่ขยับ) ไม่ใช่การรับรองใหม่
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  SELECT o."actualMode" INTO v_mode
    FROM public.sales_orders o
   WHERE o.id = NEW."salesOrderId" AND o.origin = 'pipeline' AND o.status IS DISTINCT FROM 'cancelled';
  IF v_mode = 'installment' AND NEW."actualStatus" IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'installment_actual_not_approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_installments_actual_guard ON public.sales_order_installments;
CREATE TRIGGER sales_order_installments_actual_guard
BEFORE INSERT OR UPDATE OF status ON public.sales_order_installments
FOR EACH ROW
WHEN (NEW.status = 'confirmed')
EXECUTE FUNCTION public.so_installment_actual_confirm_guard();

-- ── §5c งวด: cache ของใบ + Actual ของดีล ────────────────────────────────────────────────────────────────
/* คิด cache ของใบหนึ่งใบ (UPDATE เฉพาะเมื่อค่าเปลี่ยน — ไม่แตะ "updatedAt" ของใบ ⇒ ไม่ชน CAS ของอนุมัติ/ย้อนอนุมัติ) แล้วเรียก sync
   ของดีลเมื่อใบเป็นใบรายงวดที่อนุมัติแล้ว (ใบอื่นไม่มีผลกับ metadata ดีล ⇒ ไม่แตะ sales_deals เลย = พฤติกรรมเดิมของใบทั้งใบ)
   · ใบไม่อยู่แล้ว (ลบใบ → cascade ลบงวด) = ข้าม — trigger ของใบ (0279) sync ดีลให้เองตอนลบใบ */
CREATE OR REPLACE FUNCTION public._so_installment_actual_refresh(p_order_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_counted numeric;
  v_submitted numeric;
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT c.counted, c.submitted INTO v_counted, v_submitted
    FROM public._so_installment_actual_cache(v_order.id, v_order."actualAmount", v_order."totalAmount") c;
  IF v_order."actualCountedAmount" IS DISTINCT FROM v_counted
     OR v_order."actualSubmittedAmount" IS DISTINCT FROM v_submitted THEN
    UPDATE public.sales_orders
       SET "actualCountedAmount" = v_counted,
           "actualSubmittedAmount" = v_submitted
     WHERE id = v_order.id;
  END IF;

  IF v_order.status = 'approved' AND v_order.origin = 'pipeline' AND v_order."actualMode" = 'installment'
     AND v_order."dealId" IS NOT NULL THEN
    PERFORM public.sync_sales_order_actual(v_order."dealId");
  END IF;
END;
$$;

COMMENT ON FUNCTION public._so_installment_actual_refresh(text) IS
  'คิด cache Actual รายงวดของใบ + sync ดีลเมื่อเป็นใบรายงวดที่อนุมัติแล้ว (0412) — ผู้เรียก: trigger sales_order_installments_actual_sync';

/* ช่องที่ปลุก: ช่อง Actual รายงวด · ใบ (ย้ายใบ: Rev. 0376 · ยกเงิน 0378) · ยอด/วันครบกำหนด (ยอดประมาณ + เดือนครบกำหนด) ·
   เลขงวด (ลำดับงวด = งวดไหนรับเศษ — ปรับแผนสลับเลขได้) · UPDATE OF ยิงแม้ค่าเท่าเดิม ⇒ ตรวจว่าเปลี่ยนจริงก่อน */
CREATE OR REPLACE FUNCTION public.so_installment_actual_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."actualStatus" IS NOT DISTINCT FROM OLD."actualStatus"
     AND NEW."actualAmount" IS NOT DISTINCT FROM OLD."actualAmount"
     AND NEW."actualApprovedAt" IS NOT DISTINCT FROM OLD."actualApprovedAt"
     AND NEW."salesOrderId" IS NOT DISTINCT FROM OLD."salesOrderId"
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW."dueDate" IS NOT DISTINCT FROM OLD."dueDate"
     AND NEW.seq IS NOT DISTINCT FROM OLD.seq THEN
    RETURN NULL;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public._so_installment_actual_refresh(NEW."salesOrderId");
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD."salesOrderId" IS DISTINCT FROM NEW."salesOrderId") THEN
    PERFORM public._so_installment_actual_refresh(OLD."salesOrderId");
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_installments_actual_sync ON public.sales_order_installments;
CREATE TRIGGER sales_order_installments_actual_sync
AFTER INSERT OR UPDATE OF "actualStatus", "actualAmount", "actualApprovedAt", "salesOrderId", amount, "dueDate", seq OR DELETE
ON public.sales_order_installments
FOR EACH ROW
EXECUTE FUNCTION public.so_installment_actual_after();

-- ── §5d trigger Actual ของใบ (0279) + "actualMode" — ฟังก์ชัน sales_order_actual_trigger (0108) คงเดิม ───────────────
DROP TRIGGER IF EXISTS sales_orders_sync_actual_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_sync_actual_trg
AFTER INSERT OR UPDATE OF status, "actualAmount", "orderDate", "approvedAt", "dealId", "actualMode" OR DELETE
ON public.sales_orders FOR EACH ROW
EXECUTE FUNCTION public.sales_order_actual_trigger();

-- ── §5e งวด: งวดที่นับ Actual แล้วลบไม่ได้ (มติเจ้าของข้อ 9 · 26/10 "ปรับยอด/วันได้ ลบไม่ได้") ─────────────────────────────
/* งวดที่นับแล้วแต่ยังไม่มีเงิน/เอกสาร ปรับแผนได้ (ตัวล็อก §7 ไม่ล็อกแล้ว) — แต่ห้ามหายจากแผน: Actual ที่นับไว้ผูกกับแถวนี้
   ⇒ ปฏิเสธอย่างเดียว ไม่เขียนทับแถว · ครอบทุกทางลบ (แกนเขียนแผนของปรับแผน/ยกเงิน · PostgREST ตรง) ด้วยตัวเดียว
   · ยกเว้น (ไม่ใช่ใบรายงวดที่อนุมัติอยู่ = ไม่ยิง):
     ลบทั้งใบ (force_delete_sales_order · DELETE ใบ → CASCADE) — ใบถูกลบก่อนงวดในคำสั่งเดียวกัน ⇒ อ่านใบไม่เจอ = ผ่าน
     (แพตเทิร์นเดียวกับ _so_installment_actual_refresh) · ใบย้อนหลังลบ-ตั้งงวดใหม่ (0374/0379/0409) เป็น 'order' เสมอ (CHECK) ·
     freezeInstallments ลบเฉพาะงวดร่างที่ยังไม่ตรึง (งวดที่นับแล้วตรึงก่อนนับเสมอ) ·
     C2 ของตัวยกเงิน (มัดจำที่ยกมาแทนงวดที่นับตอนอนุมัติใบทั้งงวด) ถอดการนับก่อนแกนเขียนแผนลบ แล้วคืน Actual ให้แถวที่ยกมา
   · ไม่ล็อกใบ (ลำดับล็อกของ RPC คือ ใบ → งวด · ผู้ลบผ่าน RPC ถือใบไว้แล้ว — แพตเทิร์น 0387) */
CREATE OR REPLACE FUNCTION public.so_installment_actual_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales_orders o
     WHERE o.id = OLD."salesOrderId" AND o.origin = 'pipeline' AND o.status = 'approved'
       AND o."actualMode" = 'installment'
  ) THEN
    RAISE EXCEPTION 'installment_actual_counted_row_delete';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_installments_actual_delete_guard ON public.sales_order_installments;
CREATE TRIGGER sales_order_installments_actual_delete_guard
BEFORE DELETE ON public.sales_order_installments
FOR EACH ROW
WHEN (OLD."actualStatus" = 'approved')
EXECUTE FUNCTION public.so_installment_actual_delete_guard();

-- ── §5f งวด: ใบที่กด "นับที่เหลือทั้งหมด" แล้ว = นับทั้งก้อนจากนี้ไปถาวร (มติเจ้าของข้อ 10 · 26/10 "นับให้เอง ไม่ต้องยื่น") ─────────
/* ⭐ สัญญาณ "เคยกดนับที่เหลือทั้งหมด" = มีงวดของใบที่ "actualApprovedVia" = 'count_rest' — ไม่มีคอลัมน์ใหม่ เพราะสัญญาณนี้ไม่หายกลางทาง:
     count_rest ต้องนับอย่างน้อยหนึ่งงวด (ไม่งั้น bad_state) · งวดที่นับแล้วลบไม่ได้ (§5e) · C2a ของยกเงินถอดการนับชั่วคราวเฉพาะ so_approval ·
     ออก Rev. ย้ายงวดทั้งแถว (สัญญาณติดไปใบ Rev. — ตามมติ) · ยกเงิน C1 ล้างช่องของแถวที่ยก (สัญญาณของใบต้นทางไม่ติดมาใบปลายทาง) ·
     อนุมัติ Rev. แบบทั้งใบล้างทุกช่อง (ใบกลับเป็นทั้งใบ = ไม่มีอะไรให้นับรายงวดแล้ว)
   ⭐ งวดที่ยังไม่นับ (NULL · ตีกลับ · ยื่นอยู่) ที่โผล่บนใบแบบนั้นทีหลัง — ปรับแผนแบ่ง/เพิ่มงวด (แกนเขียนแผน ⑤ INSERT) · ยกเงินเข้า
     (ย้ายใบ + C1 ล้างช่อง) — นับให้ตอน COMMIT: via count_rest · actualNote ข้อความคงที่ (= INSTALLMENT_ACTUAL_AUTO_NOTE ของ lib) ·
     เวลา = now() · ส่วนแบ่ง = _so_installment_actual_share (นับครบแล้ว = 0 ⇒ Actual/wonValue/actualByMonth ไม่ขยับ · ยังไม่ครบ = ยอดที่เหลือ
     เข้าเดือนที่บันทึก) · ผู้อนุมัติ = ผู้กดนับที่เหลือทั้งหมดล่าสุดของใบ ⇒ ไม่ต้องยื่น บัญชีรับรองเงินได้ทันที (ด่าน §5b ผ่าน)
   ⭐ ทำไม DEFERRABLE INITIALLY DEFERRED (constraint trigger แบบ 0375): RPC หลายขั้นต้องจบก่อน — C2a ถอดการนับงวดที่ถูกแทนชั่วคราว ·
     แกนเขียนแผนลบ/แทรก · C2b ย้าย Actual ให้แถวที่ยกแถวแรก · ด่าน W1/C2o ⇒ นับกลางทาง = ยอดของงวดที่ถอดชั่วคราวถูกแจกให้แถวที่ยก
     แล้ว C2b ทับซ้ำอีกรอบ (Σ เกิน actualAmount เมื่อยกหลายแถว) · ภาพ "after" ที่ RPC คืนเป็นภาพก่อน COMMIT — route อ่านงวดสดหลัง RPC
     แล้วใช้แถวชุดนั้นทั้ง audit (after.installments · ภาพของ RPC เก็บใน rpcAfter · สรุปบอกงวดที่นับเอง) และคำตอบ (review รอบห้า 27/10)
   ⭐ อ่านสถานะสดตอน COMMIT (NEW = ภาพตอนเกิดเหตุ — แถวอาจถูกลบ/ย้ายใบ/ถูกนับไปแล้วหลังจากนั้นในทรานแซกชันเดียวกัน) ·
     ไม่ใช่ใบรายงวด pipeline ที่อนุมัติอยู่ = ไม่ทำอะไร (ใบทั้งใบ · ร่าง Rev. · ย้อนอนุมัติ · ยกเลิก · ถูกแทน) · UPDATE ผ่าน trigger ปกติ
     (§5c cache + sync ดีล · §5b ไม่ยิงเพราะไม่แตะ status) · WHEN ตัดแถวที่นับแล้ว ⇒ UPDATE ของตัวเองไม่ต่อคิวซ้ำ (ไม่วน) · รันซ้ำ = ไม่มีอะไรให้นับ
   ⚠️ ไม่ล็อกใบ (ลำดับล็อก ใบ → งวด · ผู้เขียนผ่าน RPC ถือใบไว้จน COMMIT จบ — ตัวนี้รันก่อนปล่อยล็อก) — แพตเทิร์น 0387
   ⚠️ Rev. ที่อนุมัติแบบรายงวด = ไม่มีเหตุการณ์ของแถวงวด (งวดย้ายตอนออก Rev. ขณะใบยังเป็นร่าง) ⇒ start (§6②) นับทุกงวดที่ค้างให้แทน */
CREATE OR REPLACE FUNCTION public.so_installment_actual_autocount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sales_order_installments%ROWTYPE;
  v_by public.sales_order_installments%ROWTYPE;
  v_share numeric;
BEGIN
  SELECT * INTO v_row FROM public.sales_order_installments WHERE id = NEW.id;
  IF NOT FOUND OR v_row."actualStatus" = 'approved' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders o
     WHERE o.id = v_row."salesOrderId" AND o.origin = 'pipeline' AND o.status = 'approved'
       AND o."actualMode" = 'installment' AND o."supersededById" IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  -- ผู้ตัดสินนับก้อนเดียวล่าสุดของใบ — ไม่มี = ใบนี้ยังเดินรายงวด (ไม่ทำอะไร)
  SELECT * INTO v_by FROM public.sales_order_installments c
   WHERE c."salesOrderId" = v_row."salesOrderId"
     AND c."actualStatus" = 'approved' AND c."actualApprovedVia" = 'count_rest'
   ORDER BY c."actualApprovedAt" DESC, c.seq DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_share := public._so_installment_actual_share(v_row.id);
  UPDATE public.sales_order_installments
     SET "actualStatus" = 'approved',
         "actualAmount" = v_share,
         "actualApprovedAt" = now(),
         "actualApprovedById" = v_by."actualApprovedById",
         "actualApprovedByName" = v_by."actualApprovedByName",
         "actualApprovedVia" = 'count_rest',
         "actualNote" = 'นับอัตโนมัติ — ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว (มติข้อ 10)',
         "updatedAt" = now()
   WHERE id = v_row.id AND "actualStatus" IS DISTINCT FROM 'approved';
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.so_installment_actual_autocount() IS
  'มติเจ้าของข้อ 10 (0412): ใบรายงวดที่เคยกดนับที่เหลือทั้งหมด (มีงวด via count_rest) — งวดที่ยังไม่นับที่โผล่มาทีหลัง (ปรับแผน · ยกเงินเข้า) นับให้ตอน COMMIT (via count_rest · ส่วนแบ่งตามกติกาเดิม) · ผู้เรียก: constraint trigger sales_order_installments_actual_autocount';

DROP TRIGGER IF EXISTS sales_order_installments_actual_autocount ON public.sales_order_installments;
CREATE CONSTRAINT TRIGGER sales_order_installments_actual_autocount
AFTER INSERT OR UPDATE OF "salesOrderId", "actualStatus" ON public.sales_order_installments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."actualStatus" IS DISTINCT FROM 'approved')
EXECUTE FUNCTION public.so_installment_actual_autocount();

-- ── §6① ตัวห่อของการอนุมัติใบ: เลือกแบบการนับ Actual ในคลิกเดียวกัน ───────────────────────────────────────────
-- พารามิเตอร์ 10 ตัวแรก = ตัวอนุมัติใบเดิมทุกตัว ลำดับเดียวกัน (route ส่งชุดเดิม + p_actual_mode) · เรียกตัวเดิมทั้งตัว ไม่แตะเนื้อ
-- · p_actual_mode ต้องส่งเสมอ (ค่าว่าง = sales_order_actual_mode_invalid — โค้ดที่ลืมส่งต้องดัง ไม่ใช่นับทั้งใบเงียบ ๆ)
-- · installment: ใบ pipeline ยอด > 0 (จำนวนงวดตรวจไม่ได้ตรงนี้ — freezeInstallments ตั้งงวดหลังอนุมัติ · ใบ < 2 งวดนับทุกงวดที่ ②)
CREATE OR REPLACE FUNCTION public.approve_sales_order_with_actual_mode(
  p_order_id text,
  p_evidence_id text,
  p_expected_updated_at timestamptz,
  p_document_fingerprint text,
  p_approval_note text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_separation_override_reason text DEFAULT NULL,
  p_actual_mode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mode text := btrim(COALESCE(p_actual_mode, ''));
  v_order public.sales_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_mode NOT IN ('order', 'installment') THEN
    RAISE EXCEPTION 'sales_order_actual_mode_invalid';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF FOUND AND v_mode = 'installment'
     AND (NOT COALESCE(v_order.origin = 'pipeline', false) OR COALESCE(v_order."totalAmount", 0) <= 0) THEN
    RAISE EXCEPTION 'sales_order_actual_mode_ineligible';
  END IF;

  -- ตัวอนุมัติใบเดิมทั้งตัว (สิทธิ์ · สถานะ · CAS · ความครบ · หลักฐานลายเซ็น · งานบริการ) — ล้ม = ไม่มีอะไรถูกเขียน
  v_result := public.approve_sales_order_with_signature_evidence_atomic(
    p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint, p_approval_note,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team, p_separation_override_reason);

  -- ตั้งแบบหลังอนุมัติ (trigger §5a คืน 'order' ให้ใบที่ไม่ใช่ approved) · "updatedAt" ไม่ขยับ (= เวอร์ชันของการอนุมัติ)
  -- · sync ของดีลวิ่งอีกรอบจาก trigger 0279 ("actualMode" อยู่ในรายการคอลัมน์) ⇒ ใบรายงวดหลุดยอดเต็มในทรานแซกชันเดียวกัน
  UPDATE public.sales_orders
     SET "actualMode" = v_mode
   WHERE id = p_order_id AND "actualMode" IS DISTINCT FROM v_mode;

  -- ทั้งใบ: ช่อง Actual รายงวดที่ติดมากับงวด (Rev. ของใบรายงวด — 0376 ย้ายทั้งแถว) ไม่มีความหมายแล้ว ⇒ ล้าง
  -- ไม่ล้าง = งวดที่ "ยื่นแล้ว" ค้างล็อกการปรับแผนตลอดไป (ดึงกลับ/อนุมัติ/ตีกลับทำได้เฉพาะใบรายงวด) · ประวัติอยู่ที่ audit ของ route
  IF v_mode = 'order' THEN
    UPDATE public.sales_order_installments
       SET "actualStatus" = NULL, "actualAmount" = NULL, "actualApprovedVia" = NULL, "actualNote" = NULL,
           "actualSubmittedAt" = NULL, "actualSubmittedById" = NULL, "actualSubmittedByName" = NULL,
           "actualApprovedAt" = NULL, "actualApprovedById" = NULL, "actualApprovedByName" = NULL,
           "actualRejectedAt" = NULL, "actualRejectedById" = NULL, "actualRejectedByName" = NULL, "actualRejectedReason" = NULL,
           "updatedAt" = now()
     WHERE "salesOrderId" = p_order_id
       AND ("actualStatus" IS NOT NULL OR "actualSubmittedAt" IS NOT NULL OR "actualRejectedAt" IS NOT NULL);
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
  RETURN jsonb_set(v_result, '{document}', to_jsonb(v_order)) || jsonb_build_object('actualMode', v_order."actualMode");
END;
$$;

COMMENT ON FUNCTION public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text) IS
  'อนุมัติใบสั่งขาย + เลือกแบบการนับ Actual (0412) — เรียกตัวอนุมัติใบเดิมทั้งตัวแล้วตั้ง "actualMode" ในทรานแซกชันเดียวกัน · installment ต้องเป็นใบ pipeline ยอด > 0';

-- ── §6② นับงวดตอนคลิกอนุมัติใบ (route เรียกหลัง freezeInstallments · และเป็นทางกู้ถ้าขั้นนี้ล้ม) ─────────────────────
-- นับ (via so_approval): งวดเลขน้อยสุด + งวดยอด 0 + งวดที่บัญชีรับรองแล้ว (Rev. จากใบทั้งใบ) · ใบ < 2 งวด = ทุกงวด
-- · รันซ้ำได้: งวดที่นับแล้วข้าม (ไม่มีอะไรให้นับ = คืน counted 0 ไม่ error)
-- · มติเจ้าของข้อ 10: ใบที่มีงวด via count_rest (Rev. ของใบที่กด "นับที่เหลือทั้งหมด" — งวดย้ายมาทั้งแถว) = นับทั้งก้อนจากนี้ไป
--   ⇒ นับ **ทุกงวด** ที่ยังไม่นับ (via count_rest + ข้อความเดียวกับ §5f) — การอนุมัติ Rev. ไม่มีเหตุการณ์ของแถวงวดให้ §5f จับ
-- · เวลาที่นับ = p_counted_at หนีบไว้ในช่วง [approvedAt ของใบ, now()] (review รอบสอง 26/10 · เส้นเดือน): route ส่งเวลาอนุมัติที่เพิ่ง commit
--   ⇒ งวด 1 ลงเดือนเดียวกับการอนุมัติใบ (มติข้อ 1 + 3) แม้ขั้นนี้รันข้ามเที่ยงคืนสิ้นเดือน · ปุ่มกู้ "นับงวด 1" ไม่ส่ง (NULL) = now() = เดือนที่กด
--   ⚠️ ลายเซ็นเปลี่ยนจาก 4 พารามิเตอร์ (ไฟล์นี้ยังไม่เคยรันบนฐานจริง) — DROP ตัว 4 พารามิเตอร์ก่อน ไม่งั้นได้สองตัวซ้อน (overload)
DROP FUNCTION IF EXISTS public.start_sales_order_installment_actual(text, text, text, text);
CREATE OR REPLACE FUNCTION public.start_sales_order_installment_actual(
  p_order_id text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_counted_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_now timestamptz := now();
  v_at timestamptz;
  v_rows integer;
  v_min_seq integer;
  v_id text;
  v_share numeric;
  v_ids text[] := ARRAY[]::text[];
  v_rest boolean;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF NOT public.is_sales_manager_role(p_actor_role) THEN
    RAISE EXCEPTION 'installment_actual_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF NOT COALESCE(v_order.origin = 'pipeline', false)
     OR v_order.status IS DISTINCT FROM 'approved'
     OR v_order."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'installment_actual_order_not_approved';
  END IF;
  IF v_order."actualMode" IS DISTINCT FROM 'installment' THEN
    RAISE EXCEPTION 'installment_actual_order_not_installment';
  END IF;

  PERFORM 1 FROM public.sales_order_installments inst
   WHERE inst."salesOrderId" = v_order.id
   ORDER BY inst.seq
   FOR UPDATE;

  -- เวลาที่นับ: ไม่ก่อนอนุมัติใบ ไม่หลังตอนนี้ (GREATEST/LEAST ข้าม NULL) · ไม่ส่ง = now()
  v_at := GREATEST(v_order."approvedAt", LEAST(COALESCE(p_counted_at, v_now), v_now));

  SELECT count(*), min(i.seq) INTO v_rows, v_min_seq
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;

  -- มติข้อ 10: ใบเคยกด "นับที่เหลือทั้งหมด" (สัญญาณเดียวกับ §5f) ⇒ ทุกงวดที่ยังไม่นับ via count_rest
  v_rest := EXISTS (SELECT 1 FROM public.sales_order_installments i
                     WHERE i."salesOrderId" = v_order.id AND i."actualStatus" = 'approved' AND i."actualApprovedVia" = 'count_rest');

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_before
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;

  FOR v_id IN
    SELECT i.id FROM public.sales_order_installments i
     WHERE i."salesOrderId" = v_order.id
       AND i."actualStatus" IS DISTINCT FROM 'approved'
       AND (v_rest OR v_rows < 2 OR i.seq = v_min_seq OR i.amount = 0 OR i.status = 'confirmed')
     ORDER BY i.seq
  LOOP
    v_share := public._so_installment_actual_share(v_id);
    UPDATE public.sales_order_installments
       SET "actualStatus" = 'approved',
           "actualAmount" = v_share,
           "actualApprovedAt" = v_at,
           "actualApprovedById" = p_actor_id,
           "actualApprovedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
           "actualApprovedVia" = CASE WHEN v_rest THEN 'count_rest' ELSE 'so_approval' END,
           "actualNote" = CASE WHEN v_rest THEN 'นับอัตโนมัติ — ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว (มติข้อ 10)' ELSE "actualNote" END,
           "updatedAt" = v_now
     WHERE id = v_id;
    v_ids := v_ids || v_id;
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_after
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;

  RETURN jsonb_build_object('before', v_before, 'after', v_after,
    'counted', cardinality(v_ids), 'countedIds', to_jsonb(v_ids));
END;
$$;

COMMENT ON FUNCTION public.start_sales_order_installment_actual(text, text, text, text, timestamptz) IS
  'นับ Actual รายงวดตอนคลิกอนุมัติใบ (0412) — งวดเลขน้อยสุด + งวดยอด 0 + งวดที่รับรองเงินแล้ว (via so_approval) · ใบ < 2 งวด = ทุกงวด · ใบที่มีงวด via count_rest (มติข้อ 10) = ทุกงวดที่ยังไม่นับ via count_rest · รันซ้ำได้ · เวลาที่นับ = p_counted_at หนีบใน [approvedAt, now()] (NULL = now())';

-- ── §6③ งานของงวดเดียว: submit · withdraw · approve · reject ────────────────────────────────────────────
-- ร่วม: ล็อกใบก่อนงวด · ใบ pipeline + approved + รายงวด + ไม่ถูกแทน · CAS "updatedAt" ของงวดเมื่อส่งมา · คืน {before, after}
CREATE OR REPLACE FUNCTION public.sales_order_installment_actual_action(
  p_installment_id text,
  p_action text,
  p_reason text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_action text := lower(btrim(COALESCE(p_action, '')));
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_name text := NULLIF(btrim(COALESCE(p_actor_name, '')), '');
  v_now timestamptz := now();
  v_order_id text;
  v_order public.sales_orders%ROWTYPE;
  v_row public.sales_order_installments%ROWTYPE;
  v_after public.sales_order_installments%ROWTYPE;
  v_owner text;
  v_share numeric;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF v_action NOT IN ('submit', 'withdraw', 'approve', 'reject') THEN
    RAISE EXCEPTION 'installment_actual_forbidden';
  END IF;

  SELECT i."salesOrderId" INTO v_order_id FROM public.sales_order_installments i WHERE i.id = p_installment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment_actual_not_found'; END IF;

  -- ลำดับล็อก ใบ → งวด (เหมือนปรับแผน/ยกเงิน) · งวดถูกย้ายใบระหว่างอ่านกับล็อก = เก่า
  SELECT * INTO v_order FROM public.sales_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment_actual_not_found'; END IF;
  SELECT * INTO v_row FROM public.sales_order_installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment_actual_not_found'; END IF;
  IF v_row."salesOrderId" IS DISTINCT FROM v_order.id THEN
    RAISE EXCEPTION 'installment_actual_stale';
  END IF;

  IF NOT COALESCE(v_order.origin = 'pipeline', false)
     OR v_order.status IS DISTINCT FROM 'approved'
     OR v_order."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'installment_actual_order_not_approved';
  END IF;
  IF v_order."actualMode" IS DISTINCT FROM 'installment' THEN
    RAISE EXCEPTION 'installment_actual_order_not_installment';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'installment_actual_stale';
  END IF;

  IF v_action = 'submit' THEN
    -- ผู้ยื่น = เจ้าของดีลปัจจุบัน หรือผู้จัดการฝ่ายขาย (กติกาเดียวกับยื่นใบสั่งขาย)
    SELECT d."ownerId" INTO v_owner FROM public.sales_deals d WHERE d.id = v_order."dealId";
    IF NOT (public.is_sales_manager_role(p_actor_role) OR (v_owner IS NOT NULL AND v_owner = p_actor_id)) THEN
      RAISE EXCEPTION 'installment_actual_forbidden';
    END IF;
    IF v_row."actualStatus" IS NOT NULL AND v_row."actualStatus" <> 'rejected' THEN
      RAISE EXCEPTION 'installment_actual_bad_state';
    END IF;
    -- review รอบสี่ 26/10: งวดของใบยังไม่ตรึงครบ (ตัวหยุดยอดล้มตอนอนุมัติ) = ห้ามนับ — งวดที่ไม่ตรึงแจ้งสลิปได้แค่ pending
    -- บัญชีรับรองไม่ได้ (CHECK draft_pending) ⇒ ทางกู้ "นับงวด 1"/"นับงวดที่ค้าง" (route ตรึงก่อนนับ) ต้องมาก่อน · ด่าน JS ลำดับเดียวกัน
    IF EXISTS (SELECT 1 FROM public.sales_order_installments i
                WHERE i."salesOrderId" = v_order.id AND i."frozenAt" IS NULL) THEN
      RAISE EXCEPTION 'installment_actual_unfrozen';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sales_order_installments i
                WHERE i."salesOrderId" = v_order.id AND i.seq < v_row.seq AND i.status IS DISTINCT FROM 'confirmed') THEN
      RAISE EXCEPTION 'installment_actual_previous_unconfirmed';
    END IF;
    UPDATE public.sales_order_installments
       SET "actualStatus" = 'submitted',
           "actualSubmittedAt" = v_now,
           "actualSubmittedById" = p_actor_id,
           "actualSubmittedByName" = v_name,
           "updatedAt" = v_now
     WHERE id = v_row.id
    RETURNING * INTO v_after;

  ELSIF v_action = 'withdraw' THEN
    IF v_row."actualStatus" IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'installment_actual_bad_state';
    END IF;
    IF NOT (v_row."actualSubmittedById" IS NOT DISTINCT FROM p_actor_id OR COALESCE(p_actor_role, '') = 'admin') THEN
      RAISE EXCEPTION 'installment_actual_forbidden';
    END IF;
    UPDATE public.sales_order_installments
       SET "actualStatus" = NULL,
           "actualSubmittedAt" = NULL,
           "actualSubmittedById" = NULL,
           "actualSubmittedByName" = NULL,
           "updatedAt" = v_now
     WHERE id = v_row.id
    RETURNING * INTO v_after;

  ELSIF v_action = 'approve' THEN
    IF NOT public.is_sales_manager_role(p_actor_role) THEN
      RAISE EXCEPTION 'installment_actual_forbidden';
    END IF;
    IF v_row."actualStatus" IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'installment_actual_bad_state';
    END IF;
    IF v_row."actualSubmittedById" = p_actor_id AND COALESCE(p_actor_role, '') <> 'admin' THEN
      RAISE EXCEPTION 'installment_actual_self_approval';
    END IF;
    -- review รอบสี่ 26/10: งวดของใบยังไม่ตรึงครบ (ตัวหยุดยอดล้มตอนอนุมัติ) = ห้ามนับ — งวดที่ไม่ตรึงแจ้งสลิปได้แค่ pending
    -- บัญชีรับรองไม่ได้ (CHECK draft_pending) ⇒ ทางกู้ "นับงวด 1"/"นับงวดที่ค้าง" (route ตรึงก่อนนับ) ต้องมาก่อน · ด่าน JS ลำดับเดียวกัน
    IF EXISTS (SELECT 1 FROM public.sales_order_installments i
                WHERE i."salesOrderId" = v_order.id AND i."frozenAt" IS NULL) THEN
      RAISE EXCEPTION 'installment_actual_unfrozen';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sales_order_installments i
                WHERE i."salesOrderId" = v_order.id AND i.seq < v_row.seq AND i.status IS DISTINCT FROM 'confirmed') THEN
      RAISE EXCEPTION 'installment_actual_previous_unconfirmed';
    END IF;
    v_share := public._so_installment_actual_share(v_row.id);
    UPDATE public.sales_order_installments
       SET "actualStatus" = 'approved',
           "actualAmount" = v_share,
           "actualApprovedAt" = v_now,
           "actualApprovedById" = p_actor_id,
           "actualApprovedByName" = v_name,
           "actualApprovedVia" = 'review',
           "updatedAt" = v_now
     WHERE id = v_row.id
    RETURNING * INTO v_after;

  ELSE -- reject
    IF NOT public.is_sales_manager_role(p_actor_role) THEN
      RAISE EXCEPTION 'installment_actual_forbidden';
    END IF;
    IF v_row."actualStatus" IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'installment_actual_bad_state';
    END IF;
    IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
      RAISE EXCEPTION 'installment_actual_reason_required';
    END IF;
    UPDATE public.sales_order_installments
       SET "actualStatus" = 'rejected',
           "actualRejectedAt" = v_now,
           "actualRejectedById" = p_actor_id,
           "actualRejectedByName" = v_name,
           "actualRejectedReason" = v_reason,
           "updatedAt" = v_now
     WHERE id = v_row.id
    RETURNING * INTO v_after;
  END IF;

  -- route ลง audit before/after (ทางกู้ทางเดียวของระบบนี้คือ audit_logs.before)
  RETURN jsonb_build_object('before', to_jsonb(v_row), 'after', to_jsonb(v_after));
END;
$$;

COMMENT ON FUNCTION public.sales_order_installment_actual_action(text, text, text, timestamptz, text, text, text) IS
  'งานของงวดเดียวในใบรายงวด (0412) — submit (เจ้าของดีล/ผู้จัดการ · งวดก่อนหน้ารับรองเงินครบ) · withdraw (ผู้ยื่น/admin) · approve (ผู้อนุมัติ ≠ ผู้ยื่น ยกเว้น admin · นับ Actual) · reject (ผู้อนุมัติ + เหตุผล 10–500)';

-- ── §6④ "นับที่เหลือทั้งหมด" — ทางเดียวจากรายงวดกลับเป็นการนับก้อนเดียว (มติข้อ 8) ─────────────────────────────
-- ยอดที่เหลือเข้า Actual เดือนที่กด · เงินยังเก็บตามงวดเดิม · ไม่มีอะไรเหลือให้นับ = installment_actual_bad_state (กดซ้ำ/แข่งกัน)
-- · มติเจ้าของข้อ 10: กดแล้วใบนับทั้งก้อนถาวร — งวดที่โผล่ทีหลัง (ปรับแผน · ยกเงินเข้า) §5f นับให้ตอน COMMIT · Rev. แบบรายงวด §6② นับให้
CREATE OR REPLACE FUNCTION public.count_rest_sales_order_installment_actual(
  p_order_id text,
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
  v_order public.sales_orders%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_now timestamptz := now();
  v_id text;
  v_share numeric;
  v_count integer := 0;
  v_amount numeric := 0;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'workflow_identity_required';
  END IF;
  IF NOT public.is_sales_manager_role(p_actor_role) THEN
    RAISE EXCEPTION 'installment_actual_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF NOT COALESCE(v_order.origin = 'pipeline', false)
     OR v_order.status IS DISTINCT FROM 'approved'
     OR v_order."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'installment_actual_order_not_approved';
  END IF;
  IF v_order."actualMode" IS DISTINCT FROM 'installment' THEN
    RAISE EXCEPTION 'installment_actual_order_not_installment';
  END IF;
  IF length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'installment_actual_reason_required';
  END IF;

  PERFORM 1 FROM public.sales_order_installments inst
   WHERE inst."salesOrderId" = v_order.id
   ORDER BY inst.seq
   FOR UPDATE;

  -- review รอบสี่ 26/10: งวดยังไม่ตรึง = ห้ามนับ (route ตรึงก่อนเรียกเสมอ — เจอ = ตรึงไม่ทัน/แข่งกัน) · เหตุเดียวกับ submit/approve
  IF EXISTS (SELECT 1 FROM public.sales_order_installments i
              WHERE i."salesOrderId" = v_order.id AND i."frozenAt" IS NULL) THEN
    RAISE EXCEPTION 'installment_actual_unfrozen';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_before
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;

  FOR v_id IN
    SELECT i.id FROM public.sales_order_installments i
     WHERE i."salesOrderId" = v_order.id AND i."actualStatus" IS DISTINCT FROM 'approved'
     ORDER BY i.seq
  LOOP
    v_share := public._so_installment_actual_share(v_id);
    UPDATE public.sales_order_installments
       SET "actualStatus" = 'approved',
           "actualAmount" = v_share,
           "actualApprovedAt" = v_now,
           "actualApprovedById" = p_actor_id,
           "actualApprovedByName" = NULLIF(btrim(COALESCE(p_actor_name, '')), ''),
           "actualApprovedVia" = 'count_rest',
           "actualNote" = v_reason,
           "updatedAt" = v_now
     WHERE id = v_id;
    v_count := v_count + 1;
    v_amount := v_amount + v_share;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'installment_actual_bad_state';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_after
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;

  RETURN jsonb_build_object('before', v_before, 'after', v_after,
    'counted', v_count, 'countedAmount', v_amount, 'reason', v_reason);
END;
$$;

COMMENT ON FUNCTION public.count_rest_sales_order_installment_actual(text, text, text, text, text) IS
  'นับที่เหลือทั้งหมดของใบรายงวด (0412 · มติข้อ 8) — ผู้อนุมัติ + เหตุผล 10–500 · ทุกงวดที่ยังไม่นับตามลำดับ (via count_rest) · เดือนที่กด';

-- ── §7 ตัวล็อกปรับแผนงวด + ปะผู้เรียกสองตัว ──────────────────────────────────────────────────────────────
-- ห้าข้อเดิมของ 0377 ทุกตัวอักษร + ข้อหก: งวดที่ยื่นขอนับ Actual อยู่ (รอ AE Sup — ส่วนแบ่งคิดตอนอนุมัติ ⇒ แก้ยอดกลางทาง = ยอดที่ยื่นไม่ตรง)
-- + ข้อเจ็ด: งวดที่นับ Actual แล้วแต่ **ยอด 0** (แถวเปิดต้องยอด > 0 — ปล่อยเปิดแล้วเก็บ 0 ไว้ไม่ได้ ลบก็ไม่ได้ = ปรับแผนใบนั้นไม่ได้เลย)
-- ⭐ มติเจ้าของข้อ 9 (26/10/2026): งวดที่นับ Actual แล้วแต่เงินยังไม่เข้า **ปรับยอด/วันได้ ลบไม่ได้** ⇒ ไม่ล็อกด้วย "actualStatus" แล้ว
--   (ช่อง Actual ที่ตรึงไว้ — actualAmount/actualApprovedAt — ไม่มีใครเขียนในเส้นนี้ ⇒ Actual ของใบ/ดีลไม่ขยับ) · ด่าน "ลบไม่ได้" = trigger §5e
-- ⚠️ นิยามเดียวกับ installmentReplanLock (src/lib/sales/installmentReplan.js) — ขยายข้อหนึ่งฝั่งเดียว ปุ่มกับ RPC ตอบคนละคำ
CREATE OR REPLACE FUNCTION public._so_installment_replan_locked(
  p_status text,
  p_tax_invoice_no text,
  p_billing_request_id text,
  p_kind text,
  p_evidence jsonb,
  p_paid_on date,
  p_actual_status text,
  p_amount numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_status IN ('confirmed', 'reported')
    OR btrim(COALESCE(p_tax_invoice_no, '')) <> ''
    OR btrim(COALESCE(p_billing_request_id, '')) <> ''
    OR p_kind = 'opening'
    OR (p_status = 'pending' AND (jsonb_array_length(COALESCE(p_evidence, '[]'::jsonb)) > 0 OR p_paid_on IS NOT NULL))
    OR p_actual_status = 'submitted'
    OR (p_actual_status = 'approved' AND COALESCE(p_amount, 0) <= 0),
    false
  )
$$;

COMMENT ON FUNCTION public._so_installment_replan_locked(text, text, text, text, jsonb, date, text, numeric) IS
  'แถวงวดที่ปรับแผนไม่ได้ (0377 + 0412) — confirmed/reported · มีเลขใบกำกับ · ผูกคำร้องวางบิล · งวดยกมา · pending ที่มีหลักฐาน/วันจ่าย · ยื่นขอนับ Actual อยู่ · นับ Actual แล้วยอด 0 (นับแล้วยอด > 0 = ปรับยอด/วันได้ ลบไม่ได้ — มติข้อ 9 · trigger ลบ) · นิยามเดียวกับ installmentReplanLock (lib)';

/* ปะผู้เรียกที่รันอยู่จริง (แพตเทิร์น 0382/0404): ทุกจุดที่เรียกตัวล็อก 6 พารามิเตอร์ด้วยคอลัมน์ของแถวเดียวกัน → เติม "actualStatus", amount
   · anchor (ARE + back-reference ของชื่อแถว) ต้องเจอครบจำนวนพอดีทั้งใน prosrc และ pg_get_functiondef ไม่งั้นหยุดทั้งไฟล์
   · ป้าย = จำนวนจุดที่เรียกแบบ 8 พารามิเตอร์ครบแล้ว และไม่เหลือแบบ 6 = ปะไว้แล้ว (รันซ้ำ) ⇒ ข้าม
   ⭐ มติข้อ 9 ผ่านแกนเขียนแผนโดยไม่ต้องแก้เนื้อ: งวดที่นับแล้ว (ยอด > 0) ไม่ล็อก ⇒ ไม่อยู่ในชุด "ต้องเท่าเดิมทุกช่อง" (①) อีก ·
     อยู่ในชุดที่ ④ เขียนยอด/วัน/ป้าย/สัดส่วน/เลขงวด (ช่อง Actual ไม่ถูกเอ่ย) · ② ลบแถวที่แผนไม่เก็บ = trigger §5e ปฏิเสธ ⇒ "ต้องยังอยู่"
   · C1 (ตัวยกเงินเท่านั้น): แถวที่ยกเข้าใบใหม่ล้างช่อง Actual รายงวดทุกช่อง — ต้องยื่น-อนุมัติในใบใหม่อีกรอบ (ส่วนแบ่งเดิมคิดจากใบที่ยกเลิก)
     ⇒ ใบปลายทางแบบรายงวด: งวดที่มีเงินแล้ว (confirmed) ยื่นได้ทันทีเมื่องวดก่อนหน้ารับรองครบ · ใบทั้งใบ: ช่องว่างไม่มีผลอะไร
   · C2 (ตัวยกเงินเท่านั้น · review รอบสอง 26/10): ใบรายงวดที่งวดแรกนับตอนคลิกอนุมัติใบ (มติข้อ 3 · so_approval) แต่ยังไม่มีเงิน —
     มัดจำที่ยกมาจากใบที่ยกเลิกคือมัดจำงวดเดียวกัน ⇒ แผน (lib applyCarryIn) ตัดงวดนั้นทิ้งทั้งงวดได้: C2a เก็บภาพเดิม + ถอดการนับชั่วคราว
     (trigger §5e/แกนเขียนแผนเห็นเป็นงวดเปิด) · C2b คืน Actual (ยอดรวม · เวลา/ผู้อนุมัติ/ทางเดิม) ให้แถวที่ยกมาแถวแรก + คืนภาพ "ก่อน" ของ audit
     ⇒ Actual ของใบ/ดีลไม่ขยับ (ยอดและเดือนเดิม) — ข้อยกเว้นเดียวของ "ลบไม่ได้": Actual ไม่หาย ย้ายไปอยู่กับเงินก้อนเดียวกัน ·
     หักไม่หมดงวด = แผนเก็บงวดนั้นไว้ (ลดยอดได้ตามมติข้อ 9)
     + ด่าน installment_carry_counted_locked: ยกเกินเพราะติดงวดที่ยื่นขอนับอยู่ (ล็อก) หรืองวดที่นับแล้วซึ่งลดยอดได้แต่ต้องเหลือ ≥ 0.01
       ≠ เงินเกินยอดใบ (ไม่ใช่ทางคืนเงิน)
   · W1 (แกนเขียนแผน · review รอบสาม 26/10) + C2o (ตัวยกเงิน ท้าย C2b): ส่วนแบ่ง/ยอดประมาณวางยอดที่ยังไม่นับไว้ที่งวดที่ยังไม่นับเท่านั้น
     (งวดสุดท้ายที่ยังไม่นับรับเศษ) ⇒ แผนที่ไม่เหลืองวดที่ยังไม่นับ ทั้งที่ Σ ยอดที่นับแล้ว < actualAmount ของใบ = ยอดที่เหลือหายจากทุกกองถาวร
     (เช่นปรับงวด 1 ที่นับแล้วเป็นเต็มใบแล้วลบงวด 2 · ยกเงินเต็มใบก้อนเดียวที่ครอบทุกงวดที่ยังไม่นับ) ⇒ installment_actual_remainder_orphaned
     · ปฏิเสธ ไม่นับยอดที่เหลือให้เอง (มติข้อ 1: Actual เข้าตอน AE Sup อนุมัติงวด · ตัวยกเงินบัญชีกดได้ด้วย) — lib ตอบก่อน (buildReplanRows · applyCarryIn)
     · W1 ไม่ยิงในเส้นยกเงิน (แถวที่ยกยังไม่นับตอนแกนเขียนแผนจบ — C1) ⇒ ด่านของยกเงินคือ C2o หลัง C2b */
DO $patch$
DECLARE
  r record;
  v_n integer;
  v_oid oid;
  v_src text;
  v_def text;
  v_old_src integer;
  v_old_def integer;
  v_new_src integer;
  v_c1_src integer;
  v_c1_def integer;
  v_c2_src integer;
  v_c2_def integer;
  v_w1_src integer;
  v_w1_def integer;
  v_lock_anchor constant text :=
    $re$(_so_installment_replan_locked\(\s*([a-z]+)\.status,\s*\2\."taxInvoiceNo",\s*\2\."billingRequestId",\s*\2\.kind,\s*\2\.evidence,\s*\2\."paidOn")\)$re$;
  v_lock_new constant text :=
    $re$_so_installment_replan_locked\([^;]*?"paidOn", [a-z]+\."actualStatus", [a-z]+\.amount\)$re$;
  v_c1_anchor constant text := $re$(\n([ \t]*)SET "salesOrderId" = v_target\.id,)$re$;
  v_c1_replacement constant text := $rp$\1
\2    -- 0412/C1 ▶ ยกเข้าใบใหม่ = ต้องยื่น-อนุมัติ Actual รายงวดในใบใหม่อีกรอบ (ส่วนแบ่งเดิมคิดจากใบที่ยกเลิก)
\2    "actualStatus" = NULL, "actualAmount" = NULL, "actualApprovedVia" = NULL, "actualNote" = NULL,
\2    "actualSubmittedAt" = NULL, "actualSubmittedById" = NULL, "actualSubmittedByName" = NULL,
\2    "actualApprovedAt" = NULL, "actualApprovedById" = NULL, "actualApprovedByName" = NULL,
\2    "actualRejectedAt" = NULL, "actualRejectedById" = NULL, "actualRejectedByName" = NULL, "actualRejectedReason" = NULL,
\2    -- 0412/C1 ◀$rp$;
  /* C2 — สี่จุด (ตัวยกเงินเท่านั้น): ตัวแปร · C2a ก่อนรวมยอดล็อก · ด่าน counted_locked ก่อนด่านยกเกิน · C2b หลังแกนเขียนแผน
     ⚠️ ห้ามมีข้อความที่ anchor อื่นนับ (ตัวล็อก 6/8 พารามิเตอร์แบบมีคอลัมน์ "actualStatus", amount · SET "salesOrderId")
        — เรียกตัวล็อกด้วย NULL, NULL เท่านั้น (= ล็อกเพราะเงิน/เอกสารอย่างเดียว)
     ⚠️ UPDATE ในข้อความแทนที่เขียนชื่อตารางเปล่า (ตัวยกเงินตั้ง search_path = public) — ยาม "บล็อก DO ไม่เขียนข้อมูล" ของเทสต์อ่านข้อความ
        "UPDATE public." ในบล็อก DO เป็นการ backfill · โค้ดนี้เป็นเนื้อฟังก์ชันที่ EXECUTE นิยามใหม่ ไม่ได้รันตอน migrate */
  v_c2_decl_anchor constant text := $re$(\n([ \t]*)v_summary jsonb;)$re$;
  v_c2_decl_replacement constant text := $rp$\1
\2v_c2 jsonb := '[]'::jsonb; -- 0412/C2 ภาพเดิมของงวดที่นับตอนอนุมัติใบซึ่งเงินที่ยกมาแทนทั้งงวด$rp$;
  v_c2a_anchor constant text := $re$(\n([ \t]*)SELECT COALESCE\(sum\(i\.amount\), 0\) INTO v_locked)$re$;
  v_c2a_replacement constant text := $rp$
\2-- 0412/C2a ▶ ใบรายงวด: งวดที่นับ Actual ตอนอนุมัติใบ (so_approval) ที่ยังไม่มีเงิน/เอกสาร และแผนใหม่ไม่เก็บไว้ = เงินที่ยกมาแทนทั้งงวด
\2--   เก็บภาพเดิม (v_c2) แล้วถอดการนับชั่วคราว ⇒ ด่านยกเกิน/เลขงวดซ้ำ/แกนเขียนแผนเห็นเป็นงวดเปิด · C2b คืน Actual ให้แถวที่ยกมา
\2IF v_target."actualMode" = 'installment' AND jsonb_typeof(p_target_rows) = 'array' THEN
\2  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.seq), '[]'::jsonb) INTO v_c2
\2    FROM public.sales_order_installments i
\2   WHERE i."salesOrderId" = v_target.id
\2     AND i."actualStatus" = 'approved' AND i."actualApprovedVia" = 'so_approval' AND i.amount > 0
\2     AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
\2       i.kind, i.evidence, i."paidOn", NULL, NULL)
\2     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_target_rows) e(r) WHERE e.r->>'id' = i.id);
\2  IF jsonb_array_length(v_c2) > 0 THEN
\2    UPDATE sales_order_installments i
\2       SET "actualStatus" = NULL, "actualAmount" = NULL, "actualApprovedVia" = NULL, "actualNote" = NULL,
\2           "actualApprovedAt" = NULL, "actualApprovedById" = NULL, "actualApprovedByName" = NULL
\2     WHERE i.id IN (SELECT x.e->>'id' FROM jsonb_array_elements(v_c2) x(e));
\2  END IF;
\2END IF;
\2-- 0412/C2a ◀\1$rp$;
  v_c2c_anchor constant text := $re$(\n([ \t]*)IF v_locked \+ v_carried - v_target\."totalAmount" >= 0\.005 THEN)$re$;
  v_c2c_replacement constant text := $rp$
\2-- 0412/C2 ▶ ยกเกินเพราะติดงวดที่ยื่นขอนับ Actual อยู่ (ล็อก) หรืองวดที่นับ Actual แล้วแต่ยังไม่มีเงิน — มติข้อ 9: ลดยอดได้แต่ลบไม่ได้
\2--   ⇒ แต่ละงวดที่นับแล้ว (ยอด > 0 · ไม่ใช่ C2a ที่ถูกแทนทั้งงวด) ต้องเหลืออย่างน้อย 0.01 บาท · ไม่ใช่เงินเกินยอดใบ
\2--   ⇒ รหัสแยก ไม่ใช่คำแนะนำคืนเงินของ installment_carry_overpaid (lib applyCarryIn แยกเหตุและคิดยอดที่รับได้ด้วยกติกาเดียวกัน)
\2IF (v_locked + v_carried
\2      + 0.01 * (SELECT count(*) FROM public.sales_order_installments i
\2                 WHERE i."salesOrderId" = v_target.id AND i."actualStatus" = 'approved' AND i.amount > 0
\2                   AND NOT public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
\2                     i.kind, i.evidence, i."paidOn", NULL, NULL)))
\2     - v_target."totalAmount" >= 0.005
\2   AND (SELECT COALESCE(sum(i.amount), 0) FROM public.sales_order_installments i
\2         WHERE i."salesOrderId" = v_target.id
\2           AND public._so_installment_replan_locked(i.status, i."taxInvoiceNo", i."billingRequestId",
\2             i.kind, i.evidence, i."paidOn", NULL, NULL))
\2     + v_carried - v_target."totalAmount" < 0.005 THEN
\2  RAISE EXCEPTION 'installment_carry_counted_locked';
\2END IF;
\2-- 0412/C2 ◀\1$rp$;
  v_c2b_anchor constant text :=
    $re$(\n([ \t]*)PERFORM public\._so_installments_write_plan\(v_target\.id, p_target_rows, v_now, p_actor_id, p_actor_name\);)$re$;
  v_c2b_replacement constant text := $rp$\1
\2-- 0412/C2b ▶ Actual ของงวดที่ถูกแทน (C2a) → แถวที่ยกมาแถวแรก (เลขงวดน้อยสุด): ยอดรวม · เวลา/ผู้อนุมัติ/ทางของงวดแรกที่ถูกแทน
\2--   ⇒ เดือน Actual เดิม · ภาพ "ก่อน" ที่คืนให้ audit ได้ช่อง Actual ของงวดที่ถูกแทนกลับ (ถอดชั่วคราวก่อนถ่ายภาพ)
\2IF jsonb_array_length(v_c2) > 0 THEN
\2  UPDATE sales_order_installments i
\2     SET "actualStatus" = 'approved',
\2         "actualAmount" = (SELECT COALESCE(sum((x.e->>'actualAmount')::numeric), 0) FROM jsonb_array_elements(v_c2) x(e)),
\2         "actualApprovedAt" = (v_c2->0->>'actualApprovedAt')::timestamptz,
\2         "actualApprovedById" = v_c2->0->>'actualApprovedById',
\2         "actualApprovedByName" = v_c2->0->>'actualApprovedByName',
\2         "actualApprovedVia" = 'so_approval',
\2         "updatedAt" = v_now
\2   WHERE i.id = (SELECT c.id FROM public.sales_order_installments c
\2                  WHERE c.id = ANY (v_ids) AND c."salesOrderId" = v_target.id ORDER BY c.seq LIMIT 1);
\2  SELECT jsonb_agg(COALESCE((SELECT x.e FROM jsonb_array_elements(v_c2) x(e) WHERE x.e->>'id' = b.e->>'id'), b.e) ORDER BY b.ord)
\2    INTO v_before
\2    FROM jsonb_array_elements(v_before) WITH ORDINALITY b(e, ord);
\2END IF;
\2-- 0412/C2o ▶ (review รอบสาม 26/10) หลังยก ไม่เหลืองวดที่ยังไม่นับ Actual แต่ Σ ยอดที่นับแล้ว < actualAmount ของใบ ⇒ ยอดที่เหลือไม่มีงวดไหนนับได้อีก
\2--   (แถวที่ยกแถวเดียวครอบทุกงวดที่ยังไม่นับ แล้ว C2b ให้มันถือ Actual ของงวดที่ถูกแทน) ⇒ ปฏิเสธ — ไม่นับยอดที่เหลือให้เอง (มติข้อ 1)
\2IF v_target."actualMode" = 'installment'
\2   AND NOT EXISTS (SELECT 1 FROM public.sales_order_installments u
\2                    WHERE u."salesOrderId" = v_target.id AND u."actualStatus" IS DISTINCT FROM 'approved')
\2   AND COALESCE((SELECT sum(c."actualAmount") FROM public.sales_order_installments c
\2                  WHERE c."salesOrderId" = v_target.id AND c."actualStatus" = 'approved'), 0)
\2       < COALESCE(v_target."actualAmount", 0) - 0.005 THEN
\2  RAISE EXCEPTION 'installment_actual_remainder_orphaned';
\2END IF;
\2-- 0412/C2o ◀
\2-- 0412/C2b ◀$rp$;
  /* W1 — แกนเขียนแผน (ตรวจท้ายต่อจากด่าน Σ): ใบรายงวดที่อนุมัติอยู่ต้องเหลืองวดที่ยังไม่นับ Actual ถ้า Σ ยอดที่นับแล้วยังไม่ครบ actualAmount
     ⚠️ ข้อความแทนที่ห้ามมีข้อความที่ anchor อื่นนับ (ตัวล็อก · UPDATE public.) */
  v_w1_anchor constant text := $re$(\n([ \t]*)RAISE EXCEPTION 'installment_replan_sum_mismatch';\n[ \t]*END IF;)$re$;
  v_w1_replacement constant text := $rp$\1
\2-- 0412/W1 ▶ (review รอบสาม 26/10) ใบรายงวดที่อนุมัติอยู่: แผนที่ไม่เหลืองวดที่ยังไม่นับ Actual ทั้งที่ Σ ยอดที่นับแล้ว < actualAmount ของใบ
\2--   = ยอดที่เหลือไม่มีงวดไหนนับได้อีก (ส่วนแบ่ง/ยอดประมาณวางเศษที่งวดที่ยังไม่นับเท่านั้น) — มติข้อ 9 ให้ลบงวดที่ยังไม่นับได้ แต่ต้องเหลือหนึ่งงวด
\2IF EXISTS (
\2  SELECT 1 FROM public.sales_orders o
\2   WHERE o.id = p_order_id AND o.origin = 'pipeline' AND o.status = 'approved' AND o."actualMode" = 'installment'
\2     AND NOT EXISTS (SELECT 1 FROM public.sales_order_installments u
\2                      WHERE u."salesOrderId" = o.id AND u."actualStatus" IS DISTINCT FROM 'approved')
\2     AND COALESCE((SELECT sum(c."actualAmount") FROM public.sales_order_installments c
\2                    WHERE c."salesOrderId" = o.id AND c."actualStatus" = 'approved'), 0)
\2         < COALESCE(o."actualAmount", 0) - 0.005
\2) THEN
\2  RAISE EXCEPTION 'installment_actual_remainder_orphaned';
\2END IF;
\2-- 0412/W1 ◀$rp$;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('_so_installments_write_plan', 5, false, true),
      ('carry_sales_order_installments', 3, true, false)
    ) AS t(fn, expected, with_c1, with_w1)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0412_patch_overload % count=%', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_def := pg_get_functiondef(v_oid);

    SELECT count(*) INTO v_old_src FROM regexp_matches(v_src, v_lock_anchor, 'g');
    SELECT count(*) INTO v_old_def FROM regexp_matches(v_def, v_lock_anchor, 'g');
    SELECT count(*) INTO v_new_src FROM regexp_matches(v_src, v_lock_new, 'g');
    v_c1_src := CASE WHEN r.with_c1 THEN (SELECT count(*) FROM regexp_matches(v_src, v_c1_anchor, 'g')) ELSE 0 END;
    v_c1_def := CASE WHEN r.with_c1 THEN (SELECT count(*) FROM regexp_matches(v_def, v_c1_anchor, 'g')) ELSE 0 END;
    -- C2: สี่ anchor ต้องเจอจุดละหนึ่งพอดี (ผลรวม = 4) ทั้ง prosrc และ functiondef
    v_c2_src := CASE WHEN r.with_c1 THEN
        (SELECT count(*) FROM regexp_matches(v_src, v_c2_decl_anchor, 'g')) * 1000
      + (SELECT count(*) FROM regexp_matches(v_src, v_c2a_anchor, 'g')) * 100
      + (SELECT count(*) FROM regexp_matches(v_src, v_c2c_anchor, 'g')) * 10
      + (SELECT count(*) FROM regexp_matches(v_src, v_c2b_anchor, 'g')) ELSE 0 END;
    v_c2_def := CASE WHEN r.with_c1 THEN
        (SELECT count(*) FROM regexp_matches(v_def, v_c2_decl_anchor, 'g')) * 1000
      + (SELECT count(*) FROM regexp_matches(v_def, v_c2a_anchor, 'g')) * 100
      + (SELECT count(*) FROM regexp_matches(v_def, v_c2c_anchor, 'g')) * 10
      + (SELECT count(*) FROM regexp_matches(v_def, v_c2b_anchor, 'g')) ELSE 0 END;
    -- W1: anchor ต้องเจอครั้งเดียวพอดีในแกนเขียนแผน (ด่าน Σ ของ ⑥)
    v_w1_src := CASE WHEN r.with_w1 THEN (SELECT count(*) FROM regexp_matches(v_src, v_w1_anchor, 'g')) ELSE 0 END;
    v_w1_def := CASE WHEN r.with_w1 THEN (SELECT count(*) FROM regexp_matches(v_def, v_w1_anchor, 'g')) ELSE 0 END;

    -- ปะไว้แล้ว = ทุกป้ายของรุ่นนี้ครบ (C2o · W1 ของ review รอบสาม ด้วย — ร่างก่อนหน้าที่ไม่มีป้ายใหม่ ⇒ ตกด่าน anchor ข้างล่าง)
    IF v_old_src = 0 AND v_new_src = r.expected
       AND (NOT r.with_c1 OR (strpos(v_src, '0412/C1 ▶') > 0 AND strpos(v_src, '0412/C2a ▶') > 0
         AND strpos(v_src, '0412/C2b ▶') > 0 AND strpos(v_src, '0412/C2o ▶') > 0))
       AND (NOT r.with_w1 OR strpos(v_src, '0412/W1 ▶') > 0) THEN
      RAISE NOTICE '0412: % — ปะไว้แล้ว', r.fn;
      CONTINUE;
    END IF;
    IF v_old_src <> r.expected OR v_old_def <> r.expected OR v_new_src <> 0
       OR (r.with_c1 AND (v_c1_src <> 1 OR v_c1_def <> 1 OR strpos(v_src, '0412/C1') > 0
         OR v_c2_src <> 1111 OR v_c2_def <> 1111 OR strpos(v_src, '0412/C2') > 0))
       OR (r.with_w1 AND (v_w1_src <> 1 OR v_w1_def <> 1 OR strpos(v_src, '0412/W1') > 0)) THEN
      RAISE EXCEPTION 'mig_0412_patch_anchor % lock=%/%/% c1=%/% c2=%/% w1=%/%', r.fn, v_old_src, v_old_def, v_new_src, v_c1_src, v_c1_def,
        v_c2_src, v_c2_def, v_w1_src, v_w1_def;
    END IF;

    v_def := regexp_replace(v_def, v_lock_anchor, '\1, \2."actualStatus", \2.amount)', 'g');
    IF r.with_c1 THEN
      v_def := regexp_replace(v_def, v_c1_anchor, v_c1_replacement);
      v_def := regexp_replace(v_def, v_c2_decl_anchor, v_c2_decl_replacement);
      v_def := regexp_replace(v_def, v_c2a_anchor, v_c2a_replacement);
      v_def := regexp_replace(v_def, v_c2c_anchor, v_c2c_replacement);
      v_def := regexp_replace(v_def, v_c2b_anchor, v_c2b_replacement);
    END IF;
    IF r.with_w1 THEN
      v_def := regexp_replace(v_def, v_w1_anchor, v_w1_replacement);
    END IF;
    EXECUTE v_def;
    RAISE NOTICE '0412: % — ปะแล้ว (% จุด%)', r.fn, r.expected,
      CASE WHEN r.with_c1 THEN ' + C1 + C2 + C2o' WHEN r.with_w1 THEN ' + W1' ELSE '' END;
  END LOOP;
END
$patch$;

-- ── สิทธิ์ (แพตเทิร์น 0336 — ลายเซ็นเต็มทุกบรรทัด) ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._so_installment_actual_share(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installment_actual_share(text) TO service_role;
REVOKE ALL ON FUNCTION public._so_installment_actual_estimates(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installment_actual_estimates(text, numeric, numeric) TO service_role;
REVOKE ALL ON FUNCTION public._so_installment_actual_cache(text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installment_actual_cache(text, numeric, numeric) TO service_role;
REVOKE ALL ON FUNCTION public._deal_so_actual_extras(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._deal_so_actual_extras(text) TO service_role;
REVOKE ALL ON FUNCTION public._so_installment_actual_refresh(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installment_actual_refresh(text) TO service_role;
REVOKE ALL ON FUNCTION public._so_installment_replan_locked(text, text, text, text, jsonb, date, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._so_installment_replan_locked(text, text, text, text, jsonb, date, text, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_sales_order_with_actual_mode(text, text, timestamptz, text, text, text, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.start_sales_order_installment_actual(text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_sales_order_installment_actual(text, text, text, text, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.sales_order_installment_actual_action(text, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_installment_actual_action(text, text, text, timestamptz, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.count_rest_sales_order_installment_actual(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_rest_sales_order_installment_actual(text, text, text, text, text) TO service_role;
-- ตัว trigger: เรียกจาก trigger เท่านั้น (แพตเทิร์น 0387)
REVOKE ALL ON FUNCTION public.sales_order_actual_mode_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.so_installment_actual_confirm_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.so_installment_actual_after() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.so_installment_actual_delete_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.so_installment_actual_autocount() FROM PUBLIC, anon, authenticated, service_role;
-- คู่ sync/enforce: CREATE OR REPLACE เก็บสิทธิ์เดิม (0107/0108) · ย้ำให้ไฟล์นี้ยืนได้เองบนฐานใหม่
REVOKE ALL ON FUNCTION public.sync_sales_order_actual(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_sales_order_actual(text) TO service_role;

-- ── §8 ตรวจท้าย ─────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_now_fp text;
  v_six integer;
BEGIN
  SELECT jsonb_object_agg(p.proname || '/' || p.pronargs, md5(p.prosrc))::text INTO v_now_fp
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = ANY (ARRAY[
       'approve_sales_order_with_signature_evidence_atomic', 'revoke_sales_order_approval_atomic',
       'revise_approved_sales_order_atomic', 'replan_sales_order_installments', 'sales_order_actual_trigger',
       'snapshot_sales_order_owner', 'historical_so_installment_order_live']);
  IF v_now_fp::jsonb IS DISTINCT FROM current_setting('mig_0412.untouched', true)::jsonb THEN
    RAISE EXCEPTION 'mig_0412_untouched_changed — ฟังก์ชันที่ไฟล์นี้ต้องไม่แตะถูกเปลี่ยน';
  END IF;

  -- ไม่เหลือผู้เรียกตัวล็อก 6 พารามิเตอร์ (ทุกตัวต้องได้ "actualStatus", amount ของข้อหก/ข้อเจ็ด)
  SELECT count(*) INTO v_six
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         regexp_matches(p.prosrc, $re$_so_installment_replan_locked\([^()]*"paidOn"\)$re$, 'g')
   WHERE n.nspname = 'public';
  IF v_six <> 0 THEN
    RAISE EXCEPTION 'mig_0412_six_arg_callers_left %', v_six;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
