-- ============================================================
--  Migration 0374: ใบสั่งขายย้อนหลังแบบใหม่ — AE Sup อนุมัติ · โซนจากทะเบียน · งวดยกมา · เอกสารแทนสัญญาในใบ
--                  (มติเจ้าของ 22/09/2026 · แทนโมเดล "เกิดเป็นอนุมัติแล้ว" ของ 0360)
--
--  🐞 **โมเดล 0360 ขัดกับงานจริงสี่จุด** (เจ้าของเคาะใหม่ 22/09)
--    · ใบเกิดเป็นอนุมัติตอนคีย์ (ข้อ 6) ⇒ ไม่มีใครตรวจ — เจ้าของ: *"ต้องมี AE Sup"* · *"อนุมัติ แต่ไม่ต้องนับ Actual"*
--    · คีย์ได้แค่ AE Sup/Admin (ข้อ 15) ⇒ ฝ่ายขายทุกตำแหน่งต้องคีย์ใบของตัวเองได้
--    · ฝ่ายขายพิมพ์ชื่อจุดเป็นข้อความ แล้ว TS ผูกโซนทีหลัง (ข้อ 17) ⇒ เลือกไซต์/โซนจากทะเบียนตั้งแต่ตอนคีย์
--    · เงินที่เก็บนอกระบบแล้วใช้สวิตช์ "ยกเว้นด่านเงิน" (ข้อ 13 · คำตอบข้อ 2) ⇒ คีย์เป็น **งวดยกมา** หนึ่งงวด
--      ให้บัญชีรับรองครั้งเดียว · สวิตช์ยกเว้นเลิกใช้ (ใบ ฿0 ผ่านด่าน ② ด้วย paymentNotRequired ฝั่ง JS)
--    · สัญญาต้องทำสี่ขั้นแยกหลังคีย์ (สร้าง → แนบ → อนุมัติ → ผูก) ⇒ เอกสารแทนสัญญาเกิดพร้อมใบ อนุมัติพร้อมใบ
--
--  ⭐ สายสถานะของใบย้อนหลัง (CHECK ข้อ 5 + trigger ข้อ 7)
--      draft ──ส่งอนุมัติ──> pending_approval ──AE Sup อนุมัติ──> approved
--        ^                     │ ตีกลับ → rejected ──แก้ในฟอร์มเดิม──> draft
--        └──────ดึงกลับ────────┘
--      cancelled ได้จากทุกสถานะ · approval_revoked / revised เป็นไม่ได้ (CHECK)
--    · draft มีอยู่แค่ตอนฟอร์มกำลังอัปไฟล์ (ไฟล์ต้องมีแถวใบ/สัญญาก่อน) หรือหลังส่งไม่สำเร็จ/ดึงกลับ
--    · อนุมัติ/ยกเลิกแล้ว **กลับไปแก้ไม่ได้** (trigger sales_orders_historical_no_reopen) — CHECK ใหม่ยอม
--      draft ที่ approvedAt ว่าง จึงกันการคืนเป็นร่างแทน CHECK เดิมไม่ได้แล้ว
--    · ข้อมูลที่อนุมัติแล้วผิด = AE Sup ยกเลิกใบ แล้วฝ่ายขายคีย์ใหม่ · เอกสารแทนสัญญาถูกยกเลิกตามในทรานแซกชันเดียวกัน
--      (trigger sales_orders_historical_void_contract_*) · เลข CT ที่ออกไปแล้วไม่คืน
--
--  ⭐ กติกาที่ไม่เปลี่ยนจาก 0360
--    · ใบย้อนหลังไม่นับ Actual / FC / เป้า — cache ของดีลกรอง origin = 'pipeline' อยู่แล้ว (0360 ข้อ 5)
--      ⇒ ไฟล์นี้ **ไม่นิยามตัวคำนวณ Actual ใหม่** และไม่แตะ trigger เดิมของ sales_orders/sales_deals
--    · ดีลภาชนะ 1 ใบต่อ (ลูกค้า × AE) · AE บังคับ · เลขใบเป็นเลขปกติของปีที่คีย์ · ส่งซ้ำได้ใบเดิม
--    · อนุมัติใบย้อนหลัง **ไม่แตะ** actualAmount · financeStatus · หลักฐานลายเซ็น · ฉบับตรึง
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) sales_order_lines."serviceZoneId" — บรรทัด = โซนจากทะเบียน (FK RESTRICT) · installationPoint เป็นภาพนิ่งชื่อไซต์·โซน
--  2) ด่าน: ห้ามมีใบย้อนหลังแบบเดิมค้างอยู่ (0 ใบ ณ 22/09) — ใบแบบใหม่ทุกใบมีบรรทัดชี้โซน
--  3) sales_order_installments.kind ('regular' | 'opening') + รูปทรงงวดยกมา + งวดยกมาได้ใบละงวดเดียว
--  4) ชนิดเอกสารแทนสัญญาเพิ่ม 'signed_quotation' (ใบเสนอราคาที่ลูกค้าเซ็น)
--  5) CHECK sales_orders_origin_shape ใหม่ — สาย pipeline เหมือน 0360 ทุกตัวอักษร · สาย historical ยอม
--     draft / pending_approval / rejected (approvedAt ว่าง) · ห้ามร่องรอยยกเว้นด่านเงิน
--  6) DROP ฟังก์ชันของโมเดลเดิม 4 ตัว (สร้างใบ 9 อาร์กิวเมนต์ · เพิ่มงวด · ตัวรวมงวด · ถอดจุด 0366)
--  7) ตัวตรวจกลาง 4 ตัว (ไม่ GRANT ใครเลย) + trigger 3 ตัว: ยกเลิกเอกสารแทนสัญญาตามใบ (ยกเลิก/ลบ) · ห้ามคืนร่าง
--  8–11) RPC create / update / submit / approve ของใบย้อนหลัง
--  12) สิทธิ์: REVOKE ทุกตัว · GRANT service_role เฉพาะ RPC 4 ตัว
--
--  ⛔ ไม่แตะ: sync_sales_order_actual / enforce_sales_order_actual_on_deal · trigger ของ 0279/0110/0294/0360
--     · คอลัมน์ paymentGateExempt* (อยู่ต่อ แต่ใบย้อนหลังต้องว่าง — โค้ดที่ deploy อยู่ยังอ่านได้ระหว่างรันถึง deploy)
--     · คอลัมน์/CHECK/trigger ของ 0362 (ไม่มีแถวใช้ — บรรทัดผูกโซนตั้งแต่อนุมัติ ⇒ ทาง "ไม่พบจุด" ไปไม่ถึง)
--  ⛔ ไม่ backfill — นอกตัวฟังก์ชันมีแค่ SELECT ของด่านข้อ 2
--  🔐 สิทธิ์: ตัวตรวจกลางและฟังก์ชัน trigger ถูกเรียกจาก SECURITY DEFINER/trigger เท่านั้น (รันเป็นเจ้าของ)
--     ⇒ REVOKE จาก service_role ด้วย · RPC 4 ตัว GRANT service_role อย่างเดียว (แพตเทิร์น 0336)
--
--  🛑 **รันก่อน merge โค้ด JS ของรอบนี้** (แบบเดียวกับ 0360) — โค้ดใหม่ select "serviceZoneId"/kind และเรียก RPC ใหม่
--     · รันแล้วโค้ดที่ deploy อยู่ยังทำงานได้: คอลัมน์ใหม่ว่างได้/มีค่าตั้งต้น · CHECK ขยายเฉพาะสาย historical
--       · trigger ใหม่ยิงเฉพาะแถว historical (0 แถว)
--     · ⚠️ **ช่วงระหว่างรันถึง deploy ห้ามคีย์ใบย้อนหลัง** — โมดัลเดิมเรียก RPC สร้างใบ 9 อาร์กิวเมนต์ที่ถูก DROP
--       ⇒ ตอบ 503 "ยังไม่ได้รัน migration" (PGRST202) · ปุ่มเพิ่มงวด/ถอดจุดต้องมีใบ approved ซึ่งไม่มี
--     · CI check:columns แดงจนกว่าจะรัน (ด่านนั้นอ่านสคีมาจริง)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/INDEX/TRIGGER/FUNCTION IF EXISTS แล้วสร้างใหม่
--     · CREATE OR REPLACE FUNCTION) — รอบสองไม่เปลี่ยนอะไร · ด่านข้อ 2 ผ่านเพราะใบแบบใหม่ทุกใบมีบรรทัดชี้โซน
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ตัวนับเลขใบ/เลข CT/รหัสดีลเป็นแถวในตาราง ⇒ ROLLBACK คืนเลขให้) ───────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายไฟล์ด้วยบล็อก "ลองจริง" ข้างล่าง
--           (บล็อกจบด้วย ROLLBACK; ⇒ DDL ทั้งไฟล์ + การเรียก RPC ถูกยกเลิกหมด)
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อก "ลองจริง" ทั้งก้อน โดยนำหน้าด้วย BEGIN;
--  แทนค่า <...> ก่อนรัน: ลูกค้าที่อนุมัติแล้ว · AE (ae/senior_ae ยังใช้งาน · id จาก Auth) + ทีมของ AE คนนั้น
--  · โซนที่ยังใช้งานของไซต์ลูกค้ารายนั้น · สินค้าหมวด 02-001 · AE Sup **อีกคน** (ผู้อนุมัติต้องไม่ใช่ผู้คีย์)
--  · prefix เลข CT ของเดือนนี้ (เช่น CT-SR-2609) · ใบเกิด error กลางทาง = ทรานแซกชันล้มทั้งก้อน
--
--   SELECT public.create_historical_sales_order(
--     'smoke-0374', repeat('b', 64), '<aeUserId>', 'smoke 0374', 'ae',
--     '{"customerId":"<customerId>","ownerId":"<aeUserId>","team":"<teamCode>",
--       "subtotal":1000,"vatAmount":70,"totalAmount":1070,"notes":"ทดสอบ 0374"}',
--     '[{"zoneId":"<zoneId>","productId":"<productId หมวด 02-001>","qty":1,"unitPrice":1000,"lineTotal":1000,"serviceRounds":12}]',
--     '[{"kind":"opening","amount":535,"coversFrom":"2026-01-01","coversTo":"2026-06-30","paidOn":"2026-01-05"},
--       {"label":"งวด ก.ค.–ธ.ค.","amount":535,"dueDate":"2026-07-01","coversFrom":"2026-07-01","coversTo":"2026-12-31"}]',
--     '{"docKind":"customer_po","ref":"PO-SMOKE-0374","startDate":"2026-01-01","endDate":"2026-12-31"}',
--     '{"id":"DEAL-smoke0374","historyId":"DSH-smoke0374","title":"ทดสอบ 0374","ownerName":"<ชื่อ AE>",
--       "month":"26","prefix":"DL-2609","width":5}'
--   ) ->> 'replayed';                                                                 -- คาด false
--   SELECT public.update_historical_sales_order(
--     'SOR-H' || substr(md5('smoke-0374'), 1, 16),
--     (SELECT "updatedAt" FROM public.sales_orders WHERE id = 'SOR-H' || substr(md5('smoke-0374'), 1, 16)),
--     '<aeUserId>', 'smoke 0374', 'ae',
--     '{"customerId":"<customerId>","ownerId":"<aeUserId>","team":"<teamCode>",
--       "subtotal":1000,"vatAmount":70,"totalAmount":1070,"notes":"ทดสอบ 0374 (แก้)"}',
--     '[{"zoneId":"<zoneId>","productId":"<productId หมวด 02-001>","qty":1,"unitPrice":1000,"lineTotal":1000,"serviceRounds":12}]',
--     '[{"kind":"opening","amount":535,"coversFrom":"2026-01-01","coversTo":"2026-06-30","paidOn":"2026-01-05",
--        "evidence":[{"storagePath":"sales-orders/smoke/payments/smoke.pdf","fileName":"smoke.pdf"}]},
--       {"label":"งวด ก.ค.–ธ.ค.","amount":535,"dueDate":"2026-07-01","coversFrom":"2026-07-01","coversTo":"2026-12-31"}]',
--     '{"docKind":"customer_po","ref":"PO-SMOKE-0374","startDate":"2026-01-01","endDate":"2026-12-31"}'
--   ) -> 'order' ->> 'status';                                                        -- คาด draft
--   INSERT INTO public.attachments (id, "entityType", "entityId", "docType", "fileUrl", "fileName")
--   VALUES ('00000000-0000-0000-0000-000000000374', 'contract', 'CTR-H' || substr(md5('smoke-0374:contract'), 1, 16),
--           'external_doc', 'smoke://0374', 'smoke-0374.pdf');
--   SELECT public.submit_historical_sales_order(
--     'SOR-H' || substr(md5('smoke-0374'), 1, 16),
--     (SELECT "updatedAt" FROM public.sales_orders WHERE id = 'SOR-H' || substr(md5('smoke-0374'), 1, 16)),
--     '<aeUserId>', 'smoke 0374', 'ae', NULL
--   ) -> 'order' ->> 'status';                                                        -- คาด pending_approval
--   SELECT public.approve_historical_sales_order(
--     'SOR-H' || substr(md5('smoke-0374'), 1, 16),
--     (SELECT "updatedAt" FROM public.sales_orders WHERE id = 'SOR-H' || substr(md5('smoke-0374'), 1, 16)),
--     '<aeSupUserId>', 'smoke sup', 'ae_supervisor', NULL, NULL,
--     '00000000-0000-0000-0000-000000000374', '-', '<CT-SR-YYMM>', 4
--   ) ->> 'replayed';                                                                 -- คาด false
--   SELECT status, "approvedBy" = '<aeSupUserId>', "financeStatus", "ownerId" = '<aeUserId>'
--     FROM public.sales_orders WHERE id = 'SOR-H' || substr(md5('smoke-0374'), 1, 16);   -- approved · true · null · true
--   SELECT status, "contractNo", "signedFileId"
--     FROM public.sales_contracts WHERE id = 'CTR-H' || substr(md5('smoke-0374:contract'), 1, 16);
--                                                          -- signed · <CT-SR-YYMM>xxxx-0 · 00000000-…-000000000374
--   SELECT seq, kind, status, "frozenAt" IS NOT NULL FROM public.sales_order_installments
--    WHERE "salesOrderId" = 'SOR-H' || substr(md5('smoke-0374'), 1, 16) ORDER BY seq;
--                                                          -- 1 opening reported true · 2 regular pending true
--   SELECT count(*) FROM public.service_zone_terms WHERE "salesOrderId" = 'SOR-H' || substr(md5('smoke-0374'), 1, 16);  -- 1
--   SELECT "wonValue", metadata->>'wonMonth' FROM public.sales_deals WHERE id = 'DEAL-smoke0374';  -- 0 · null
--   UPDATE public.sales_orders SET status = 'cancelled', "cancelledAt" = now()
--    WHERE id = 'SOR-H' || substr(md5('smoke-0374'), 1, 16);
--   SELECT status, "cancelReason" FROM public.sales_contracts
--    WHERE id = 'CTR-H' || substr(md5('smoke-0374:contract'), 1, 16);            -- cancelled · ใบสั่งขายย้อนหลัง SO-… ถูกยกเลิก
--   DO $$ BEGIN   -- ใบที่ยกเลิกแล้วคืนเป็นร่างไม่ได้
--     BEGIN UPDATE public.sales_orders SET status = 'draft' WHERE id = 'SOR-H' || substr(md5('smoke-0374'), 1, 16);
--           RAISE EXCEPTION 'SMOKE FAIL 1'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 1: %', SQLERRM; END;
--   END $$;                                                                          -- คาด NOTICE ok 1: historical_so_reopen_forbidden…
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT conname FROM pg_constraint WHERE conname IN ('sales_orders_origin_shape','sales_contracts_external_kind',
--     'sales_order_installments_kind_check','sales_order_installments_opening_shape');        -- 4 แถว
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'sales_contracts_external_kind';  -- มี signed_quotation
--   SELECT indexname FROM pg_indexes WHERE indexname IN ('sales_order_installments_opening_uk',
--     'sales_order_lines_service_zone_idx');                                                    -- 2 แถว
--   SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
--    AND ((table_name = 'sales_order_lines' AND column_name = 'serviceZoneId')
--      OR (table_name = 'sales_order_installments' AND column_name = 'kind'));               -- 2 แถว
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('sales_orders_historical_void_contract_upd',
--     'sales_orders_historical_void_contract_del','sales_orders_historical_no_reopen');       -- 3 แถว
--   SELECT to_regprocedure('public.create_historical_sales_order(text,text,text,text,text,jsonb,jsonb,jsonb,jsonb)'),
--          to_regprocedure('public.append_historical_installments(text,text,text,text,jsonb)'),
--          to_regprocedure('public.historical_so_installments_total(jsonb)'),
--          to_regprocedure('public.remove_historical_sales_order_line(text,text,text,text,text)');  -- null ทั้ง 4
--   SELECT r.role, f.sig, has_function_privilege(r.role, f.sig, 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role),
--          (VALUES ('public.create_historical_sales_order(text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)'),
--                  ('public.update_historical_sales_order(text,timestamptz,text,text,text,jsonb,jsonb,jsonb,jsonb)'),
--                  ('public.submit_historical_sales_order(text,timestamptz,text,text,text,jsonb)'),
--                  ('public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)'),
--                  ('public.historical_so_check_contract(jsonb)'),
--                  ('public.historical_so_check_lines(jsonb,text)'),
--                  ('public.historical_so_check_installments(jsonb,numeric,date,date)'),
--                  ('public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)'),
--                  ('public.historical_so_void_substitute_contract()'),
--                  ('public.historical_so_no_reopen()')) AS f(sig);
--                        -- RPC 4 ตัว: service_role = true · anon/authenticated = false
--                        -- ตัวตรวจกลาง/ฟังก์ชัน trigger 6 ตัว: false ทั้งสามบทบาท
--   SELECT origin, status, count(*) FROM public.sales_orders GROUP BY 1, 2;  -- ไม่มีแถว historical (ยังไม่คีย์)
--   แล้วรัน `npm run check:columns` กับ `npm run check:rowcap` ในเครื่อง (ต้องเขียวก่อน merge คอมมิต JS)
-- ============================================================

BEGIN;

-- ── 1) บรรทัด = โซนจากทะเบียน (แทนมติข้อ 17) ─────────────────────────────────
-- ⚠️ ON DELETE RESTRICT = ลบโซน/ไซต์ที่มีบรรทัดใบสั่งขายชี้อยู่ไม่ได้ ⇒ ทางบังคับลบของแอดมินต้องนับบรรทัดเหล่านี้
--    เป็นตัวขวางตั้งแต่พรีวิว (ไม่งั้นลบไปครึ่งทางแล้วล้มกลางขั้น — ขั้นของมัน commit แยกกัน)
-- installationPoint อยู่ต่อ (CHECK 1–200 ของ 0360) — ใบแบบใหม่เก็บภาพนิ่ง '<รหัสไซต์> <ชื่อไซต์> · <ชื่อโซน>'
-- ตอนคีย์ ⇒ ทะเบียนเปลี่ยนชื่อทีหลัง ใบที่ออกไปแล้วยังอ่านได้เหมือนเดิม
ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS "serviceZoneId" text REFERENCES public.service_zones(id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.sales_order_lines_service_zone_idx;
CREATE INDEX sales_order_lines_service_zone_idx
  ON public.sales_order_lines ("serviceZoneId")
  WHERE "serviceZoneId" IS NOT NULL;

COMMENT ON COLUMN public.sales_order_lines."serviceZoneId" IS
  'โซนที่ใบสั่งขายย้อนหลังเลือกจากทะเบียนตอนคีย์ (มติ 22/09 · mig 0374) — รอบขายของโซน (service_zone_terms) เกิดตอน AE Sup อนุมัติ · ใบ pipeline ว่างเสมอ';

-- ── 2) ด่าน: ใบย้อนหลังแบบเดิม (เกิดเป็นอนุมัติ · จุดเป็นข้อความ · ยกเว้นด่านเงิน) ต้องไม่มีเหลือ ──
-- รันครั้งแรก: 0 ใบ (ตรวจ 22/09) · รันซ้ำ: ใบแบบใหม่ทุกใบมีบรรทัดชี้โซนและไม่มีร่องรอยยกเว้น ⇒ ผ่านเสมอ
-- เจอ = หยุดทั้งไฟล์ก่อนแตะ CHECK — แถวแบบเดิมจะตายที่ CHECK ใหม่อยู่ดี แต่ข้อความนี้บอกทางออกตรงกว่า
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales_orders o
     WHERE o.origin = 'historical'
       AND (o."paymentGateExemptAt" IS NOT NULL
            OR NOT EXISTS (SELECT 1 FROM public.sales_order_lines l
                            WHERE l."salesOrderId" = o.id AND l."serviceZoneId" IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'mig_0374_old_historical_rows_exist — ลบใบย้อนหลังแบบเดิมก่อน';
  END IF;
END $$;

-- ── 3) ชนิดงวด: งวดยกมา (เงินที่เก็บนอกระบบแล้ว · บัญชีรับรองครั้งเดียว) ───────────
-- งวดยกมาไม่มีวันครบกำหนด (เก็บไปแล้ว — ถ้ามีจะถูกนับเป็นงวดค้างชำระทันที) และต้องบอกช่วงครอบบริการเสมอ
-- (ด่านเงินของนัดบริการอ่าน coversTo ของงวดที่รับรองแล้ว) · CHECK เดิมของงวดไม่แตะ (0245/0259/0320/0348)
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'regular';

ALTER TABLE public.sales_order_installments DROP CONSTRAINT IF EXISTS sales_order_installments_kind_check;
ALTER TABLE public.sales_order_installments
  ADD CONSTRAINT sales_order_installments_kind_check CHECK (kind IN ('regular', 'opening'));

ALTER TABLE public.sales_order_installments DROP CONSTRAINT IF EXISTS sales_order_installments_opening_shape;
ALTER TABLE public.sales_order_installments
  ADD CONSTRAINT sales_order_installments_opening_shape CHECK (
    kind <> 'opening' OR ("coversFrom" IS NOT NULL AND "coversTo" IS NOT NULL AND "dueDate" IS NULL)
  );

DROP INDEX IF EXISTS public.sales_order_installments_opening_uk;
CREATE UNIQUE INDEX sales_order_installments_opening_uk
  ON public.sales_order_installments ("salesOrderId")
  WHERE kind = 'opening';

COMMENT ON COLUMN public.sales_order_installments.kind IS
  'regular = งวดปกติ · opening = งวดยกมาของใบสั่งขายย้อนหลัง (เงินที่เก็บก่อนเข้าระบบ · ใบละงวดเดียว · บัญชีรับรองครั้งเดียว · ใบกำกับอยู่ใน Express) — mig 0374';

-- ── 4) ชนิดเอกสารแทนสัญญา + ใบเสนอราคาที่ลูกค้าเซ็น (0322 ประกาศใน DO block — แทนด้วย DROP/ADD) ──
ALTER TABLE public.sales_contracts DROP CONSTRAINT IF EXISTS sales_contracts_external_kind;
ALTER TABLE public.sales_contracts
  ADD CONSTRAINT sales_contracts_external_kind CHECK (
    (source = 'external' AND "externalDocKind" IN ('customer_po', 'email', 'paper_contract', 'signed_quotation', 'other'))
    OR (source = 'generated' AND "externalDocKind" IS NULL)
  );

-- ── 5) รูปทรงสองสายของใบสั่งขาย (แทน 0360 ข้อ 2) ─────────────────────────────
-- pipeline: เหมือน 0360 ทุกตัวอักษร (ตรวจแถวเดิมทั้งหมดใหม่ตอน ADD — ห้ามแน่นขึ้น)
-- historical:
--   · สถานะ draft / pending_approval / rejected / approved / cancelled — ย้อนอนุมัติ/ออก Rev. ยังตายที่นี่
--   · approved ต้องมีผู้อนุมัติ · ยังไม่อนุมัติต้องไม่มีร่องรอยอนุมัติ · cancelled ได้ทั้งสองแบบ (ยกเลิกก่อน/หลังอนุมัติ)
--   · approvalMode admin_override ได้ (Admin อนุมัติใบที่ตัวเองคีย์) — CHECK 0150 คุมเหตุผลอยู่แล้ว
--   · ไม่มีหลักฐานลายเซ็น (ใบย้อนหลังไม่เซ็น) · ไม่เข้าขั้นบัญชีปิดใบ · ไม่มีร่องรอยยกเว้นด่านเงิน (เลิกใช้)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_origin_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_origin_shape CHECK (
    (
      origin = 'pipeline'
      AND "quotationId" IS NOT NULL
      AND "historicalQuoteRef" IS NULL
      AND "historicalExpressRef" IS NULL
      AND "historicalInvoiceRef" IS NULL
      AND "historicalIntakeHash" IS NULL
      AND "paymentGateExemptAt" IS NULL
    )
    OR (
      origin = 'historical'
      AND "quotationId" IS NULL
      AND "projectId" IS NULL
      AND status IN ('draft', 'pending_approval', 'rejected', 'approved', 'cancelled')
      AND (status <> 'approved' OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL))
      AND (status NOT IN ('draft', 'pending_approval', 'rejected') OR ("approvedAt" IS NULL AND "approvedBy" IS NULL))
      AND (status <> 'pending_approval' OR "submittedAt" IS NOT NULL)
      AND "createdBy" IS NOT NULL
      AND "approvalMode" IN ('standard', 'admin_override')
      AND "revisionNo" = 0
      AND "revisedFromId" IS NULL
      AND "supersededById" IS NULL
      AND "financeStatus" IS NULL
      AND "signatureEvidenceId" IS NULL
      AND "proposerSignatureEvidenceId" IS NULL
      AND "historicalIntakeHash" IS NOT NULL
      AND "paymentGateExemptAt" IS NULL
    )
  );

-- ── 6) ฟังก์ชันของโมเดลเดิม — ทางเดียวที่ถึงคือโมดัลเดิม/ปุ่มของใบ approved ที่ยังไม่มี ──────────
DROP FUNCTION IF EXISTS public.create_historical_sales_order(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.append_historical_installments(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.historical_so_installments_total(jsonb);
DROP FUNCTION IF EXISTS public.remove_historical_sales_order_line(text, text, text, text, text);

-- ── 7a) ตัวตรวจเอกสารแทนสัญญา — ชนิด · เลขอ้างอิง · ช่วงวัน ─────────────────────
--  วันเริ่ม = วันที่ใบ (มติข้อ 5 เดิม) ⇒ ห้ามอนาคต (เวลาไทย) · "วันสิ้นสุดต้องไม่ก่อนวันนี้" (มติข้อ 9)
--  ตรวจฝั่ง JS อย่างเดียว — ในฐานใบที่ค้างรออนุมัติข้ามวันสิ้นสุดต้องยังอนุมัติได้
--  ความยาวเลขอ้างอิงเท่า CHECK sales_contracts_external_ref_len (0322)
CREATE OR REPLACE FUNCTION public.historical_so_check_contract(p_contract jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind  text;
  v_ref   text;
  v_start date;
  v_end   date;
BEGIN
  IF jsonb_typeof(p_contract) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'historical_so_contract_invalid';
  END IF;
  v_kind := NULLIF(btrim(COALESCE(p_contract->>'docKind', '')), '');
  v_ref  := NULLIF(btrim(COALESCE(p_contract->>'ref', '')), '');
  BEGIN
    v_start := NULLIF(p_contract->>'startDate', '')::date;
    v_end   := NULLIF(p_contract->>'endDate', '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'historical_so_contract_invalid';
  END;
  IF v_kind IS NULL
     OR v_kind NOT IN ('customer_po', 'email', 'paper_contract', 'signed_quotation', 'other')
     OR COALESCE(length(v_ref), 0) > 200
     OR v_start IS NULL OR v_end IS NULL
     OR v_start NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
     OR v_end   NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
     OR v_start > v_end
     OR v_start > timezone('Asia/Bangkok', now())::date THEN
    RAISE EXCEPTION 'historical_so_contract_invalid';
  END IF;
  RETURN jsonb_build_object('docKind', v_kind, 'ref', v_ref, 'startDate', v_start, 'endDate', v_end);
END;
$$;

-- ── 7b) ตัวตรวจบรรทัด = โซน × แพ็คเกจ — คืนผลรวมยอดบรรทัด ────────────────────────
--  โซน: ด่านเดียวกับ bindTargetError (lib/service/intake.js) — ไซต์ของลูกค้าในใบ · ไซต์ลูกค้า · ไซต์และโซนยังใช้งาน
--  สินค้า: ต้องเป็นแพ็คเกจบริการหมวด 02-001 (SERVICE_ROUND_CATEGORY · categoryOf = คู่ตัวเลขแรกแบบ NN-NNN)
--    ⇒ รอบขายของโซนเกิดจากแพ็คเกจเท่านั้น และใบย้อนหลังทุกใบเป็น "ใบมีรอบบริการ" (ด่านช่วงครอบก่อนรับรองไม่เปิดเงียบ)
--  จำนวนแพ็คเป็นจำนวนเต็ม · ยอดบรรทัดคีย์เอง (ไม่บังคับ = จำนวน × ราคา — ราคาต่อแพ็คปัดสองตำแหน่ง)
--  คำอธิบายที่ส่งมาเองยาวได้เท่าชื่อจุดติดตั้ง (0360) · ไม่ส่ง = ใช้คำอธิบายสินค้าจากทะเบียน
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

-- ── 7c) ตัวตรวจงวด — งวดยกมา + งวดที่ยังต้องเก็บ ครอบสัญญาพอดี ────────────────────
--  ตัวเดียวทั้งตอนคีย์ (payload) และตอนส่ง/อนุมัติ (แถวที่เก็บไว้) · ต้องตัดสินเท่ากับ planner ฝั่ง JS ทุกข้อ
--  · งวดยกมา ≤ 1 · ยอด > 0 · เริ่มครอบ = วันเริ่มสัญญา · ครอบถึงไม่เกินวันสิ้นสุด · ไม่มีวันครบกำหนด
--    · มีวันรับเงิน (ไม่เกินวันนี้ เวลาไทย) — ขั้นอนุมัติดันงวดนี้เป็น "แจ้งชำระแล้ว" ให้บัญชีรับรอง
--  · งวดปกติ: ชื่อ 1–120 (0245) · ยอดไม่ติดลบ · **ต้องมีวันครบกำหนด** · ช่วงครอบครบ · วันที่ปี 2000–2100 (0245/0320)
--  · หมายเหตุ ≤ 1000 ทุกงวด (CHECK note ของ 0245)
--  · ใบ ฿0 ไม่มีงวด (ไม่มีเงินให้เก็บ — ด่าน ② ผ่านด้วย paymentNotRequired) · ใบมียอด: ผลรวมงวด = ยอดใบ (±0.01)
--  · ช่วงครอบเรียงตามวันเริ่มต้องต่อกันพอดีตั้งแต่วันเริ่มถึงวันสิ้นสุดสัญญา — ไม่เว้น ไม่ซ้อน
CREATE OR REPLACE FUNCTION public.historical_so_check_installments(
  p_rows  jsonb,
  p_total numeric,
  p_start date,
  p_end   date
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows     jsonb := COALESCE(p_rows, '[]'::jsonb);
  v_item     jsonb;
  v_kind     text;
  v_amount   numeric;
  v_due      date;
  v_from     date;
  v_to       date;
  v_paid     date;
  v_openings integer := 0;
  v_count    integer := 0;
  v_sum      numeric := 0;
  v_today    date := timezone('Asia/Bangkok', now())::date;
  v_expect   date := p_start;
  v_span     record;
BEGIN
  IF jsonb_typeof(v_rows) <> 'array' THEN RAISE EXCEPTION 'historical_so_installment_invalid'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'historical_so_installment_invalid'; END IF;
    v_kind := COALESCE(NULLIF(v_item->>'kind', ''), 'regular');
    IF v_kind NOT IN ('regular', 'opening') THEN RAISE EXCEPTION 'historical_so_opening_invalid'; END IF;
    BEGIN
      v_amount := (v_item->>'amount')::numeric;
      v_due    := NULLIF(v_item->>'dueDate', '')::date;
      v_from   := NULLIF(v_item->>'coversFrom', '')::date;
      v_to     := NULLIF(v_item->>'coversTo', '')::date;
      v_paid   := NULLIF(v_item->>'paidOn', '')::date;
    EXCEPTION WHEN others THEN
      IF v_kind = 'opening' THEN RAISE EXCEPTION 'historical_so_opening_invalid'; END IF;
      RAISE EXCEPTION 'historical_so_installment_invalid';
    END;
    IF v_kind = 'opening' THEN
      v_openings := v_openings + 1;
      IF v_openings > 1
         OR v_amount IS NULL OR v_amount <= 0 OR v_amount = 'NaN'::numeric
         OR v_from IS DISTINCT FROM p_start
         OR v_to IS NULL OR v_to < p_start OR v_to > p_end
         OR v_due IS NOT NULL
         OR v_paid IS NULL OR v_paid < DATE '2000-01-01' OR v_paid > v_today
         OR length(btrim(COALESCE(v_item->>'note', ''))) > 1000 THEN
        RAISE EXCEPTION 'historical_so_opening_invalid';
      END IF;
    ELSE
      IF v_amount IS NULL OR v_amount < 0 OR v_amount = 'NaN'::numeric
         OR length(btrim(COALESCE(v_item->>'label', ''))) NOT BETWEEN 1 AND 120
         OR v_due IS NULL OR v_from IS NULL OR v_to IS NULL
         OR v_due  NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
         OR v_from NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
         OR v_to   NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
         OR v_from > v_to
         OR length(btrim(COALESCE(v_item->>'note', ''))) > 1000 THEN
        RAISE EXCEPTION 'historical_so_installment_invalid';
      END IF;
    END IF;
    v_count := v_count + 1;
    v_sum := v_sum + v_amount;
  END LOOP;

  IF p_total = 0 AND v_count > 0 THEN RAISE EXCEPTION 'historical_so_zero_value_has_installments'; END IF;
  IF p_total > 0 AND (v_count = 0 OR abs(v_sum - p_total) > 0.01) THEN
    RAISE EXCEPTION 'historical_so_installment_sum_mismatch';
  END IF;

  IF v_count > 0 THEN
    FOR v_span IN
      SELECT NULLIF(e.value->>'coversFrom', '')::date AS f, NULLIF(e.value->>'coversTo', '')::date AS t
        FROM jsonb_array_elements(v_rows) AS e
       ORDER BY 1, 2
    LOOP
      IF v_span.f IS DISTINCT FROM v_expect THEN RAISE EXCEPTION 'historical_so_coverage_broken'; END IF;
      v_expect := v_span.t + 1;
    END LOOP;
    IF v_expect - 1 IS DISTINCT FROM p_end THEN RAISE EXCEPTION 'historical_so_coverage_broken'; END IF;
  END IF;
END;
$$;

-- ── 7d) ตัวเขียนบรรทัด + งวด (ลบของเดิมแล้วเขียนใหม่ทั้งชุด) ─────────────────────────
--  ⚠️ **ด่านของตัวเองมาก่อนทุกอย่าง** — ฟังก์ชันนี้ลบบรรทัด/งวดทิ้ง ⇒ ต้องเป็นใบย้อนหลังที่ยังแก้ได้
--     (ร่าง/ตีกลับ) ไม่มีรอบขายของโซน และไม่มีงวดที่หยุดยอดแล้ว — ไม่พึ่งว่าผู้เรียกตรวจมาให้
--     (บรรทัดถูกลบ = รอบขายของโซนถูก cascade ทิ้ง · งวดหยุดยอด = เงินที่บัญชีเห็นแล้ว)
--  ⚠️ ห้ามใช้ตัวช่วย master_row_* — ลิสต์คอลัมน์ตายตัว ⇒ คอลัมน์หาย = 42703 ดัง ๆ ไม่ใช่ข้อมูลหายเงียบ
--  · รหัส FG / คำอธิบาย / หน่วย อ่านจากทะเบียนสินค้า ไม่รับจาก payload (ตัวตรวจ 7b ผ่านมาแล้ว)
--  · id แน่นอนตามลำดับ ⇒ แก้ใบซ้ำได้ id เดิม · งวดยกมาเป็นงวดที่ 1 เสมอ แล้วงวดปกติเรียงตามวันเริ่มครอบ
--  · หลักฐานเก็บเฉพาะงวดยกมา (JS กรองให้เหลือไฟล์ใต้ sales-orders/<ใบ>/payments/ แล้ว) — งวดปกติยังไม่มีใครจ่าย
--  · งวดทุกแถว pending + ยังไม่หยุดยอด ⇒ บัญชียังไม่เห็น จนกว่า AE Sup อนุมัติ (ทะเบียนการชำระอ่านเฉพาะงวดที่หยุดยอด)
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
    (e.l->>'qty')::numeric, (e.l->>'unitPrice')::numeric, NULL, 0, 0, (e.l->>'lineTotal')::numeric,
    NULLIF(e.l->>'serviceRounds', '')::integer, (e.ord - 1)::integer,
    jsonb_build_object('grossAmount', COALESCE(NULLIF(e.l->>'grossAmount', '')::numeric, (e.l->>'lineTotal')::numeric))
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

-- ── 7e) ยกเลิกเอกสารแทนสัญญาตามใบ — ใบย้อนหลังถูกยกเลิกหรือถูกลบ (ทุกทาง: route · RPC บังคับลบ · SQL) ──
--  เอกสารแทนสัญญาเป็นของใบ (เกิดพร้อมใบ อนุมัติพร้อมใบ) ⇒ ใบไปแล้ว สัญญาต้องไม่ค้างเป็น "มีผล" ให้ด่าน ① ของโซนอ่าน
--  · ยกเลิกได้ทั้งร่างและที่ลงนามแล้ว (CHECK ของสัญญายอม cancelled ทั้งมี/ไม่มีเลข — 0278/0323) · เลข CT ไม่คืน
--  · 🔴 **ตามหาด้วยตัวชี้กลับ `metadata.historicalSalesOrderId` ไม่ใช่ลิงก์ปัจจุบัน `serviceContractId` ของใบ**
--    ของเดิมจับคู่ด้วยลิงก์ปัจจุบันด้วย ⇒ ใครถอดสัญญาออกจากใบก่อนแล้วค่อยยกเลิก/ลบใบ trigger หาไม่เจอ และทิ้ง
--    เอกสาร signed ที่ถือเลข CT ค้างเป็น "มีผล" โดยไม่มีใบเป็นเจ้าของ (ด่าน ① ของโซนอื่นในดีลเดียวกันปลดได้ด้วยมัน)
--    ⇒ ของใบก็ต้องตายตามใบ ไม่ว่าใบยังชี้มันอยู่หรือไม่ · ด่านฝั่งจอ/API (serviceContractLinkError) ปิดการถอดไว้
--    อีกชั้นแล้ว — สองชั้นนี้คนละหน้าที่: ชั้นนั้นกันไม่ให้เกิด ชั้นนี้กันของที่เกิดไปแล้วไม่ให้ค้าง
--  · 🪤 สัญญาที่ใบอื่นที่ยังไม่ยกเลิกผูกอยู่ (ผูกย้ายทีหลัง) ไม่แตะ — ใบนั้นยังใช้มันอยู่
--  · อยู่ในทรานแซกชันเดียวกับการยกเลิก/ลบใบ ⇒ ไม่มีจังหวะที่ใบหายแต่สัญญายังล็อก/ยังมีผล
CREATE OR REPLACE FUNCTION public.historical_so_void_substitute_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sales_orders%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  UPDATE public.sales_contracts c
     SET status = 'cancelled',
         "cancelledAt" = now(),
         "cancelReason" = left('ใบสั่งขายย้อนหลัง ' || v_row."orderNumber"
                               || CASE TG_OP WHEN 'DELETE' THEN ' ถูกลบ' ELSE ' ถูกยกเลิก' END, 500),
         "updatedAt" = now()
   WHERE c.metadata->>'historicalSalesOrderId' = v_row.id
     AND c.source = 'external'
     AND c.status IN ('draft', 'signed')
     AND NOT EXISTS (
       SELECT 1 FROM public.sales_orders o
        WHERE o."serviceContractId" = c.id AND o.id <> v_row.id AND o.status <> 'cancelled'
     );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_historical_void_contract_upd ON public.sales_orders;
CREATE TRIGGER sales_orders_historical_void_contract_upd
AFTER UPDATE OF status ON public.sales_orders
FOR EACH ROW
WHEN (NEW.origin = 'historical' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.historical_so_void_substitute_contract();

DROP TRIGGER IF EXISTS sales_orders_historical_void_contract_del ON public.sales_orders;
CREATE TRIGGER sales_orders_historical_void_contract_del
BEFORE DELETE ON public.sales_orders
FOR EACH ROW
WHEN (OLD.origin = 'historical')
EXECUTE FUNCTION public.historical_so_void_substitute_contract();

-- ── 7f) ใบย้อนหลังที่อนุมัติ/ยกเลิกแล้ว ห้ามกลับไปร่าง/รออนุมัติ/ตีกลับ ────────────────
--  🪤 CHECK ข้อ 5 ยอม draft ที่ approvedAt ว่าง ⇒ การ "คืนสถานะ" ของแอดมิน (ล้าง approvedAt + draft) ผ่าน CHECK ได้แล้ว
--     ใบที่อนุมัติไปแล้วมีรอบขายของโซน + งวดที่หยุดยอด + สัญญาที่ลงนาม — กลับไปร่าง = ของปลายน้ำค้างโดยไม่มีเจ้าของ
--     ⇒ ทางแก้ของใบที่อนุมัติแล้วคือยกเลิกแล้วคีย์ใหม่เท่านั้น
CREATE OR REPLACE FUNCTION public.historical_so_no_reopen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'historical_so_reopen_forbidden: %', OLD."orderNumber";
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_historical_no_reopen ON public.sales_orders;
CREATE TRIGGER sales_orders_historical_no_reopen
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW
WHEN (OLD.origin = 'historical' AND OLD.status IN ('approved', 'cancelled')
      AND NEW.status IN ('draft', 'pending_approval', 'rejected'))
EXECUTE FUNCTION public.historical_so_no_reopen();

-- ── 8) RPC สร้างใบย้อนหลัง (ร่าง) + ดีลภาชนะ + เอกสารแทนสัญญา (ร่าง) + บรรทัด + งวด ในทรานแซกชันเดียว ──
-- ⚠️ route ตรวจ AE (validateDealOwner — role อยู่ใน Supabase Auth ไม่อยู่ในฐาน) · ล็อก AE/SA ให้คีย์เฉพาะของตัวเอง
--    · ขอบเขตทีมของดีลภาชนะ · คำนวณเงิน/VAT ด้วยตัวตัดสินเดียวกับพรีวิว — ฟังก์ชันนี้ตรวจซ้ำทุกข้อที่ตรวจในฐานได้
-- ⚠️ ใบเกิดเป็น **ร่าง** — ไฟล์เอกสารแทนสัญญาต้องเป็นไฟล์แนบของแถวสัญญา และหลักฐานงวดยกมาต้องอยู่ใต้โฟลเดอร์ของใบ
--    ⇒ สองอย่างนี้มีได้หลังแถวเกิดแล้วเท่านั้น · ฟอร์มกดครั้งเดียว = สร้าง → อัปไฟล์ → แก้ใบเก็บหลักฐาน → ส่งอนุมัติ
-- ⚠️ ไม่แตะรอบขายของโซน · ไม่ตั้งสถานะที่บัญชียืนยัน · ไม่ประทับหลักฐานลายเซ็น/ฉบับตรึง · ไม่ใช้ตัวช่วย master_row_*
-- ⚠️ ส่งซ้ำ (รหัสการคีย์ + ลายนิ้วมือเดิม) ได้ใบเดิมในสถานะไหนก็ได้ที่ยังไม่ยกเลิก — ฟอร์มกดซ้ำหลังเน็ตหลุดได้ใบเดิม
CREATE OR REPLACE FUNCTION public.create_historical_sales_order(
  p_intake_key   text,
  p_intake_hash  text,
  p_actor_id     text,
  p_actor_name   text,
  p_actor_role   text,
  p_header       jsonb,
  p_lines        jsonb,
  p_installments jsonb,
  p_contract     jsonb,
  p_new_deal     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id       text;
  v_contract_id    text;
  v_existing       public.sales_orders%ROWTYPE;
  v_order          public.sales_orders%ROWTYPE;
  v_contract       public.sales_contracts%ROWTYPE;
  v_customer       public.customers%ROWTYPE;
  v_deal           public.sales_deals%ROWTYPE;
  v_deal_created   boolean := false;
  v_deal_raced     boolean := false;
  v_conflict       text;
  v_deal_width     integer;
  v_created        jsonb;
  v_c              jsonb;
  v_start          date;
  v_end            date;
  v_customer_id    text := NULLIF(btrim(COALESCE(p_header->>'customerId', '')), '');
  v_owner_id       text := NULLIF(btrim(COALESCE(p_header->>'ownerId', '')), '');
  v_team           text := NULLIF(btrim(COALESCE(p_header->>'team', '')), '');
  v_notes          text := NULLIF(btrim(COALESCE(p_header->>'notes', '')), '');
  v_customer_name  text;
  v_subtotal       numeric;
  v_discount       numeric;
  v_vat            numeric;
  v_total          numeric;
  v_line_sum       numeric;
  v_now timestamp;
  v_year text;
  v_seed integer := 0;
  v_pattern text;
  v_running_width integer;
  v_running_no integer;
  v_order_number text;
BEGIN
  -- ① ตัวตน + สิทธิ์ (ฝ่ายขายทุกตำแหน่ง + Admin = HISTORICAL_KEYER_ROLES ฝั่ง JS) + AE บังคับ
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_actor_required'; END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'historical_so_actor_forbidden';
  END IF;
  IF NULLIF(btrim(COALESCE(p_intake_key, '')), '') IS NULL THEN RAISE EXCEPTION 'historical_so_intake_key_required'; END IF;
  IF COALESCE(p_intake_hash, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'historical_so_intake_hash_invalid'; END IF;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'historical_so_customer_required'; END IF;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'historical_so_owner_required'; END IF;

  -- ② ล็อกรหัสการคีย์ก่อนทุกอย่าง — กดซ้ำ/สองแท็บเดินทีละคำขอ แม้ส่ง AE มาคนละคน
  PERFORM pg_advisory_xact_lock(hashtext('historical_so_key:' || p_intake_key));

  -- ③ ส่งซ้ำ = ได้ใบเดิม เฉพาะเมื่อคำขอเดิมทุกตัวอักษรและใบยังไม่ถูกยกเลิก · ไม่ออกเลขใหม่
  v_order_id := 'SOR-H' || substr(md5(p_intake_key), 1, 16);
  SELECT * INTO v_existing FROM public.sales_orders WHERE id = v_order_id;
  IF FOUND THEN
    IF v_existing.origin <> 'historical'
       OR v_existing."customerId" IS DISTINCT FROM v_customer_id
       OR v_existing."historicalIntakeHash" IS DISTINCT FROM p_intake_hash
       OR v_existing.status = 'cancelled' THEN
      RAISE EXCEPTION 'historical_so_intake_key_conflict';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'order', to_jsonb(v_existing),
      'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder")
                         FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order_id), '[]'::jsonb),
      'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                                FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order_id), '[]'::jsonb),
      'contract', (SELECT to_jsonb(c) - 'issuedHtml' FROM public.sales_contracts c WHERE c.id = v_existing."serviceContractId"),
      'deal', (SELECT to_jsonb(d) FROM public.sales_deals d WHERE d.id = v_existing."dealId"),
      'dealCreated', false
    );
  END IF;

  -- ④ ล็อกคู่ (ลูกค้า × AE) — ดีลภาชนะไม่ซ้อน (UNIQUE ของ 0360 เป็นด่านสุดท้าย)
  PERFORM pg_advisory_xact_lock(hashtext('historical_so:' || v_customer_id || ':' || v_owner_id));

  -- ⑤ ลูกค้า — ต้องใช้ออกเอกสารได้ (กติกาเดียวกับ isQuotableCustomer: NULL ยุคก่อน 0027/0030 = อนุมัติ)
  SELECT * INTO v_customer FROM public.customers WHERE id = v_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'historical_so_customer_not_found'; END IF;
  IF (v_customer."approvalStatus" IS NOT NULL AND v_customer."approvalStatus" <> 'approved')
     OR v_customer."isActive" IS FALSE THEN
    RAISE EXCEPTION 'historical_so_customer_inactive';
  END IF;
  -- ชื่อสำเนาอ่านจากทะเบียนเสมอ ไม่รับจาก payload — ไทยก่อน ไม่มีค่อยอังกฤษ (= customerSnapshotName)
  v_customer_name := COALESCE(NULLIF(btrim(v_customer.name), ''), NULLIF(btrim(v_customer."nameEn"), ''));

  -- ⑥ เอกสารแทนสัญญา: วันที่ใบ = วันเริ่มสัญญาจริง
  v_c := public.historical_so_check_contract(p_contract);
  v_start := (v_c->>'startDate')::date;
  v_end   := (v_c->>'endDate')::date;

  -- ⑦ เงินหัวใบสมดุล · ผลรวมบรรทัด = ยอดก่อน VAT
  BEGIN
    v_subtotal := COALESCE((p_header->>'subtotal')::numeric, 0);
    v_discount := COALESCE((p_header->>'discountAmount')::numeric, 0);
    v_vat      := COALESCE((p_header->>'vatAmount')::numeric, 0);
    v_total    := COALESCE((p_header->>'totalAmount')::numeric, 0);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'historical_so_header_invalid';
  END;
  IF v_subtotal < 0 OR v_discount < 0 OR v_vat < 0 OR v_total < 0
     OR 'NaN'::numeric IN (v_subtotal, v_discount, v_vat, v_total) THEN
    RAISE EXCEPTION 'historical_so_money_invalid';
  END IF;
  IF abs(v_subtotal - v_discount + v_vat - v_total) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;
  v_line_sum := public.historical_so_check_lines(p_lines, v_customer_id);
  IF abs(v_line_sum - v_subtotal) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;

  -- ⑧ งวดยกมา + งวดที่ยังต้องเก็บ ครอบสัญญาพอดี · ⑨ ใบ ฿0 ต้องมีหมายเหตุบอกเหตุผล (มติข้อ 11)
  PERFORM public.historical_so_check_installments(p_installments, v_total, v_start, v_end);
  IF v_total = 0 AND v_notes IS NULL THEN RAISE EXCEPTION 'historical_so_zero_value_note_required'; END IF;

  -- ⑩ ดีลภาชนะของคู่ (ลูกค้า × AE): ผูกได้เฉพาะ origin historical + won + SERVICE + ไม่มีโครงการ (ข้อ 20)
  SELECT * INTO v_deal FROM public.sales_deals
   WHERE origin = 'historical'
     AND "customerId" = v_customer_id
     AND "ownerId" = v_owner_id
   FOR UPDATE;
  IF NOT FOUND THEN
    -- ทีมตามดีล = ทีมของ AE ที่ route ได้จาก validateDealOwner (CHECK ของ 0360 บังคับ team)
    IF v_team IS NULL THEN RAISE EXCEPTION 'historical_so_team_required'; END IF;
    IF p_new_deal IS NULL
       OR NULLIF(btrim(COALESCE(p_new_deal->>'id', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_new_deal->>'historyId', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_new_deal->>'title', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_new_deal->>'ownerName', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_new_deal->>'month', '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(p_new_deal->>'prefix', '')), '') IS NULL THEN
      RAISE EXCEPTION 'historical_so_deal_payload_required';
    END IF;
    BEGIN
      v_deal_width := (p_new_deal->>'width')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'historical_so_deal_payload_required';
    END;
    -- รหัส DL ออกในทรานแซกชันเดียวกัน (0240/0344) · ถัง/prefix/ความกว้างมาจาก route (แพตเทิร์น 0322)
    -- 🪤 ย้ายเจ้าของรายใบ (PATCH ธรรมดา ไม่ถือล็อกข้อ ④) ย้ายดีลภาชนะของลูกค้านี้มาหา AE คนนี้แล้ว commit
    --    ระหว่าง SELECT ข้างบนกับ insert นี้ ⇒ insert ชน sales_deals_historical_container_uk
    --    ⇒ ห้ามปล่อย 23505 ออกไป (ชื่อนั้นคือ 409 ของการย้ายเจ้าของ) ⇒ หาใหม่แล้วผูกดีลที่ย้ายมา (0360 ข้อ 6b ⑩)
    BEGIN
      SELECT public.create_entity_rows_with_code(
        'DL', p_new_deal->>'month', p_new_deal->>'prefix', v_deal_width,
        jsonb_build_array(jsonb_build_object(
          'id', p_new_deal->>'id',
          'origin', 'historical',
          'customerId', v_customer_id,
          'customerName', v_customer_name,
          'title', btrim(p_new_deal->>'title'),
          'stage', 'won',
          'line', 'SERVICE',
          'dealType', 'RE-ORDER',
          'projectValue', 0,
          'forecastManualValue', 0,
          'forecastSource', 'manual',
          'probability', public.deal_probability_for_stage('won'),
          'ownerId', v_owner_id,
          'ownerName', btrim(p_new_deal->>'ownerName'),
          'team', v_team,
          'metadata', jsonb_build_object('projectType', 'RE-ORDER'),
          'createdAt', now(),
          'updatedAt', now()
        ))
      ) -> 0 INTO v_created;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_conflict = CONSTRAINT_NAME;
      IF v_conflict IS DISTINCT FROM 'sales_deals_historical_container_uk' THEN RAISE; END IF;
      v_deal_raced := true;
    END;
    IF v_deal_raced THEN
      SELECT * INTO v_deal FROM public.sales_deals
       WHERE origin = 'historical'
         AND "customerId" = v_customer_id
         AND "ownerId" = v_owner_id
       FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'historical_so_container_deal_race'; END IF;
    ELSE
      SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_created->>'id';
      -- ตัวออกรหัสทิ้งคีย์ที่ไม่มีคอลัมน์เงียบ ๆ — origin หาย = ดีล Won ปกติมูลค่า 0 หลุดเข้า KPI ⇒ หยุดทั้งใบ
      IF v_deal.origin IS DISTINCT FROM 'historical' THEN RAISE EXCEPTION 'historical_so_deal_origin_dropped'; END IF;
      INSERT INTO public.sales_deal_stage_history (id, "dealId", "fromStage", "toStage", "changedBy", "changedByName")
      VALUES (p_new_deal->>'historyId', v_deal.id, NULL, 'won', p_actor_id, p_actor_name);
      v_deal_created := true;
    END IF;
  END IF;
  -- ดีลที่ผูก (เจอตั้งแต่แรก หรือย้ายมาแข่ง) ต้องยังเป็นภาชนะที่ใช้ได้ · ดีลที่เพิ่งสร้างผ่าน CHECK ของ 0360 มาแล้ว
  IF v_deal.stage <> 'won' OR v_deal.line IS DISTINCT FROM 'SERVICE' OR v_deal."projectId" IS NOT NULL THEN
    RAISE EXCEPTION 'historical_so_deal_invalid';
  END IF;

  -- ⑪ เลขที่ใบ — คัดจาก RPC สร้างใบร่าง (0343) ทุกตัวอักษร · ตัวนับของปีปัจจุบัน ไม่ใช่ปีของวันที่ใบ
  v_now := timezone('Asia/Bangkok', now());
  -- ⭐ คีย์ถังนับ = **ปี** (0328) · เดือนยังอยู่ในตัวเลขผ่าน v_pattern ข้างล่าง
  v_year := to_char(v_now, 'YY');

  -- รูปแบบจากมาตรฐานที่เผยแพร่ (มี unique partial index กันไว้ว่ามีได้ชนิดละใบเดียว)
  -- ไม่มี/ว่าง → รูปแบบเดิมของระบบ · ห้ามออกเลขไม่ได้เพราะตารางตั้งค่าไม่พร้อม
  SELECT NULLIF(btrim(v."numberingPattern"), '') INTO v_pattern
  FROM public.document_standard_versions v
  WHERE v."documentKey" = 'salesOrder' AND v.status = 'published';
  v_pattern := COALESCE(v_pattern, 'SO-{YY}{MM}{RUNNING:4}-{REVISION}');

  -- ความกว้างเลขรันตามรูปแบบจริง — ด่าน "เลขเต็มรอบ" ต้องขยับตามด้วย ไม่ใช่ 9999 ตายตัว
  v_running_width := COALESCE((substring(v_pattern from '\{RUNNING:(\d)\}'))::integer, 4);

  -- แถวของปีนี้หาย = ห้ามเริ่มนับ 1 ใหม่ทับเลขที่ออกไปแล้ว (กติกาเดียวกับ QT/0241)
  -- ปีใหม่ปกติจะไม่มีแถวยุคเดือนของปีนั้น ⇒ ได้ 0 แล้วเริ่ม 0001 ตามที่ควรเป็น
  IF NOT EXISTS (SELECT 1 FROM public.sales_order_number_counters WHERE month = v_year) THEN
    SELECT COALESCE(max("lastNo"), 0) INTO v_seed
    FROM public.sales_order_number_counters
    WHERE month LIKE v_year || '%' AND length(month) = 4;
  END IF;

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > power(10, v_running_width)::integer - 1 THEN
    RAISE EXCEPTION 'sales_order_yearly_sequence_exhausted';
  END IF;

  v_order_number := v_pattern;
  v_order_number := replace(v_order_number, '{YYYY}', to_char(v_now, 'YYYY'));
  v_order_number := replace(v_order_number, '{YY}', to_char(v_now, 'YY'));
  v_order_number := replace(v_order_number, '{MM}', to_char(v_now, 'MM'));
  v_order_number := replace(v_order_number, '{DD}', to_char(v_now, 'DD'));
  v_order_number := replace(v_order_number, '{RUNNING:3}', lpad(v_running_no::text, 3, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:4}', lpad(v_running_no::text, 4, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:5}', lpad(v_running_no::text, 5, '0'));
  v_order_number := replace(v_order_number, '{REVISION}', '0');

  -- ⑫ เอกสารแทนสัญญา (ร่าง · ไม่มีเลข) — ต้องเกิดก่อนหัวใบ (FK serviceContractId) · id แน่นอนตามรหัสการคีย์
  --    ทีม/เจ้าของตามดีลภาชนะ (ด่านแนบไฟล์ของสัญญาอ่านขอบเขตจากสองช่องนี้) · เลข CT ออกตอน AE Sup อนุมัติ
  --    id ชนแถวเดิม = ใบของรหัสนี้เคยถูกลบไปแล้ว (สัญญาถูกยกเลิกค้างไว้) ⇒ บอกว่าคำขอชนกัน ไม่ใช่ 23505 ดิบ
  v_contract_id := 'CTR-H' || substr(md5(p_intake_key || ':contract'), 1, 16);
  IF EXISTS (SELECT 1 FROM public.sales_contracts WHERE id = v_contract_id) THEN
    RAISE EXCEPTION 'historical_so_intake_key_conflict';
  END IF;
  INSERT INTO public.sales_contracts (
    id, kind, status, source, "externalDocKind", "externalRef", "dealId", "quotationId",
    "customerId", "customerName", "contractDate", "effectiveDate", "expiryDate", fields,
    team, "ownerId", "ownerName", metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  ) VALUES (
    v_contract_id, 'service', 'draft', 'external', v_c->>'docKind', v_c->>'ref', v_deal.id, NULL,
    v_customer.id, v_customer_name, v_start, v_start, v_end, '{}'::jsonb,
    v_deal.team, v_deal."ownerId", v_deal."ownerName",
    jsonb_build_object('historicalSalesOrderId', v_order_id, 'dealCode', v_deal.code, 'dealTitle', v_deal.title),
    p_actor_id, p_actor_name, now(), now()
  )
  RETURNING * INTO v_contract;

  -- ⑬ หัวใบ — เกิดเป็นร่าง (ยังไม่มีร่องรอยอนุมัติ) · วันที่ใบ = วันเริ่มสัญญา · ภาษาเอกสารไทย (ใบย้อนหลังไม่พิมพ์)
  --    ownerId/ownerName: trigger snapshot_sales_order_owner (0294) ก๊อปจากดีลภาชนะให้เองตอนอนุมัติ
  INSERT INTO public.sales_orders (
    id, "orderNumber", origin, "quotationId", "dealId", "projectId", "customerId",
    "customerName", "customerNameEn", status, "orderDate",
    subtotal, "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes, "docLanguage",
    "historicalQuoteRef", "historicalExpressRef", "historicalInvoiceRef", "historicalIntakeHash",
    "serviceContractId", "approvalMode", "approvedAt", "approvedBy", "approvedByName", "financeStatus",
    "confirmAttachments", metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  ) VALUES (
    v_order_id, v_order_number, 'historical', NULL, v_deal.id, NULL, v_customer.id,
    v_customer_name, v_customer."nameEn", 'draft', v_start,
    v_subtotal, v_discount, v_vat, v_total, GREATEST(0, v_total - v_vat), v_notes, 'th',
    NULLIF(btrim(COALESCE(p_header->>'historicalQuoteRef', '')), ''),
    NULLIF(btrim(COALESCE(p_header->>'historicalExpressRef', '')), ''),
    NULLIF(btrim(COALESCE(p_header->>'historicalInvoiceRef', '')), ''),
    p_intake_hash,
    v_contract.id, 'standard', NULL, NULL, NULL, NULL,
    '[]'::jsonb,
    CASE WHEN p_header ? 'intake' THEN jsonb_build_object('historicalIntake', p_header->'intake') ELSE '{}'::jsonb END,
    p_actor_id, p_actor_name, now(), now()
  )
  RETURNING * INTO v_order;

  -- ⑭ บรรทัด (โซน) + งวด — ตัวเขียนเดียวกับตอนแก้ใบ
  PERFORM public.historical_so_write_children(v_order_id, p_lines, p_installments, v_total, p_actor_id, p_actor_name);

  RETURN jsonb_build_object(
    'replayed', false,
    'order', to_jsonb(v_order),
    'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder")
                       FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order_id), '[]'::jsonb),
    'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                              FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order_id), '[]'::jsonb),
    'contract', to_jsonb(v_contract) - 'issuedHtml',
    'deal', (SELECT to_jsonb(d) FROM public.sales_deals d WHERE d.id = v_deal.id),
    'dealCreated', v_deal_created
  );
END;
$$;

-- ── 9) RPC แก้ใบย้อนหลัง (ร่าง/ตีกลับ) — ฟอร์มเดียวกับตอนสร้าง ─────────────────────────
-- ⚠️ ลูกค้า/AE ล็อกหลังบันทึกครั้งแรก — ดีลภาชนะ เลขใบ และทีม/เจ้าของของสัญญาผูกกับคู่นี้ไปแล้ว (คีย์ผิดคู่ = ลบใบแล้วคีย์ใหม่)
CREATE OR REPLACE FUNCTION public.update_historical_sales_order(
  p_order_id            text,
  p_expected_updated_at timestamptz,
  p_actor_id            text,
  p_actor_name          text,
  p_actor_role          text,
  p_header              jsonb,
  p_lines               jsonb,
  p_installments        jsonb,
  p_contract            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    public.sales_orders%ROWTYPE;
  v_deal     public.sales_deals%ROWTYPE;
  v_contract public.sales_contracts%ROWTYPE;
  v_c        jsonb;
  v_start    date;
  v_end      date;
  v_notes    text := NULLIF(btrim(COALESCE(p_header->>'notes', '')), '');
  v_subtotal numeric;
  v_discount numeric;
  v_vat      numeric;
  v_total    numeric;
  v_line_sum numeric;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_actor_required'; END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'historical_so_actor_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.origin IS DISTINCT FROM 'historical' THEN RAISE EXCEPTION 'historical_so_not_found'; END IF;
  IF v_order.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'historical_so_edit_state_invalid'; END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_stale'; END IF;

  SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_order."dealId";
  IF NULLIF(btrim(COALESCE(p_header->>'customerId', '')), '') IS DISTINCT FROM v_order."customerId"
     OR NULLIF(btrim(COALESCE(p_header->>'ownerId', '')), '') IS DISTINCT FROM v_deal."ownerId" THEN
    RAISE EXCEPTION 'historical_so_owner_locked';
  END IF;

  -- เอกสารแทนสัญญาของใบนี้เอง ยังเป็นร่าง
  SELECT * INTO v_contract FROM public.sales_contracts WHERE id = v_order."serviceContractId" FOR UPDATE;
  IF NOT FOUND OR v_contract.status <> 'draft' OR v_contract.source <> 'external'
     OR v_contract.metadata->>'historicalSalesOrderId' IS DISTINCT FROM v_order.id THEN
    RAISE EXCEPTION 'historical_so_contract_state_invalid';
  END IF;

  -- ตัวตรวจชุดเดียวกับตอนสร้าง (ข้อ 8 ⑥–⑨)
  v_c := public.historical_so_check_contract(p_contract);
  v_start := (v_c->>'startDate')::date;
  v_end   := (v_c->>'endDate')::date;
  BEGIN
    v_subtotal := COALESCE((p_header->>'subtotal')::numeric, 0);
    v_discount := COALESCE((p_header->>'discountAmount')::numeric, 0);
    v_vat      := COALESCE((p_header->>'vatAmount')::numeric, 0);
    v_total    := COALESCE((p_header->>'totalAmount')::numeric, 0);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'historical_so_header_invalid';
  END;
  IF v_subtotal < 0 OR v_discount < 0 OR v_vat < 0 OR v_total < 0
     OR 'NaN'::numeric IN (v_subtotal, v_discount, v_vat, v_total) THEN
    RAISE EXCEPTION 'historical_so_money_invalid';
  END IF;
  IF abs(v_subtotal - v_discount + v_vat - v_total) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;
  v_line_sum := public.historical_so_check_lines(p_lines, v_order."customerId");
  IF abs(v_line_sum - v_subtotal) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;
  PERFORM public.historical_so_check_installments(p_installments, v_total, v_start, v_end);
  IF v_total = 0 AND v_notes IS NULL THEN RAISE EXCEPTION 'historical_so_zero_value_note_required'; END IF;

  UPDATE public.sales_contracts SET
    "externalDocKind" = v_c->>'docKind',
    "externalRef" = v_c->>'ref',
    "contractDate" = v_start,
    "effectiveDate" = v_start,
    "expiryDate" = v_end,
    "updatedAt" = now()
  WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  PERFORM public.historical_so_write_children(v_order.id, p_lines, p_installments, v_total, p_actor_id, p_actor_name);

  -- ⚠️ ตีกลับ → ร่าง **ต้องมี ไม่ใช่แค่ความสวย**: ด่านอัปหลักฐานการชำระไม่รับใบสถานะ rejected
  --    (lib/sales/privateEvidence.js) ⇒ ไม่พลิกเป็นร่าง = ฟอร์มแก้ของใบที่ถูกตีกลับอัปหลักฐานงวดยกมาไม่ได้เลย
  --    · ร่องรอยการตีกลับ (rejected*) เก็บไว้ให้ฟอร์มโชว์เหตุผลจนกว่าจะส่งอนุมัติใหม่ (ข้อ 10 ล้าง)
  UPDATE public.sales_orders SET
    "orderDate" = v_start,
    subtotal = v_subtotal,
    "discountAmount" = v_discount,
    "vatAmount" = v_vat,
    "totalAmount" = v_total,
    "actualAmount" = GREATEST(0, v_total - v_vat),
    notes = v_notes,
    "historicalQuoteRef" = NULLIF(btrim(COALESCE(p_header->>'historicalQuoteRef', '')), ''),
    "historicalExpressRef" = NULLIF(btrim(COALESCE(p_header->>'historicalExpressRef', '')), ''),
    "historicalInvoiceRef" = NULLIF(btrim(COALESCE(p_header->>'historicalInvoiceRef', '')), ''),
    metadata = CASE WHEN p_header ? 'intake'
                    THEN COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('historicalIntake', p_header->'intake')
                    ELSE metadata END,
    status = 'draft',
    "updatedAt" = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder")
                       FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order.id), '[]'::jsonb),
    'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                              FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id), '[]'::jsonb),
    'contract', to_jsonb(v_contract) - 'issuedHtml'
  );
END;
$$;

-- ── 10) RPC ส่งใบย้อนหลังให้ AE Sup อนุมัติ ────────────────────────────────────────
-- ⚠️ ไม่ประทับหลักฐานลายเซ็น (CHECK ข้อ 5 บังคับว่าง) · ส่งซ้ำโดยคนเดิม = ได้ผลเดิม (เน็ตหลุดหลังกด)
-- · ไฟล์เอกสารแทนสัญญาต้องแนบแล้ว (docType external_doc — ชนิดเดียวกับด่านอนุมัติเอกสารแทนสัญญา)
-- · ตรวจงวดซ้ำจากแถวที่เก็บจริง · งวดยกมาต้องมีหลักฐานการรับเงินอย่างน้อย 1 ไฟล์
-- · ตรวจโซน/สินค้าซ้ำด้วย — ทะเบียนเปลี่ยนได้ระหว่างบันทึกกับส่ง (ขั้นอนุมัติตรวจซ้ำอีกรอบ)
CREATE OR REPLACE FUNCTION public.submit_historical_sales_order(
  p_order_id            text,
  p_expected_updated_at timestamptz,
  p_actor_id            text,
  p_actor_name          text,
  p_actor_role          text,
  p_opening_evidence    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    public.sales_orders%ROWTYPE;
  v_contract public.sales_contracts%ROWTYPE;
  v_opening  public.sales_order_installments%ROWTYPE;
  v_rows     jsonb;
  v_lines    jsonb;
  v_evidence jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_actor_required'; END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'historical_so_actor_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.origin IS DISTINCT FROM 'historical' THEN RAISE EXCEPTION 'historical_so_not_found'; END IF;

  -- กดซ้ำหลังส่งสำเร็จแล้ว (คนเดิม) = ผลเดิม ไม่เขียนอะไรเพิ่ม
  IF v_order.status = 'pending_approval' AND v_order."submittedBy" = p_actor_id THEN
    RETURN jsonb_build_object('replayed', true, 'order', to_jsonb(v_order));
  END IF;
  IF v_order.status NOT IN ('draft', 'rejected') THEN RAISE EXCEPTION 'historical_so_submit_state_invalid'; END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_stale'; END IF;

  SELECT * INTO v_contract FROM public.sales_contracts WHERE id = v_order."serviceContractId" FOR UPDATE;
  IF NOT FOUND OR v_contract.status <> 'draft' OR v_contract.source <> 'external'
     OR v_contract.metadata->>'historicalSalesOrderId' IS DISTINCT FROM v_order.id THEN
    RAISE EXCEPTION 'historical_so_contract_state_invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attachments a
     WHERE a."entityType" = 'contract' AND a."entityId" = v_contract.id AND a."docType" = 'external_doc'
  ) THEN
    RAISE EXCEPTION 'historical_so_contract_file_missing';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'zoneId', l."serviceZoneId", 'productId', l."productId", 'qty', l.qty,
           'unitPrice', l."unitPrice", 'lineTotal', l."lineTotal", 'serviceRounds', l."serviceRounds"
         ) ORDER BY l."sortOrder"), '[]'::jsonb)
    INTO v_lines
    FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order.id;
  PERFORM public.historical_so_check_lines(v_lines, v_order."customerId");

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', i.kind, 'label', i.label, 'amount', i.amount, 'dueDate', i."dueDate",
           'coversFrom', i."coversFrom", 'coversTo', i."coversTo", 'paidOn', i."paidOn", 'note', i.note
         ) ORDER BY i.seq), '[]'::jsonb)
    INTO v_rows
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;
  PERFORM public.historical_so_check_installments(v_rows, v_order."totalAmount",
                                                  v_contract."effectiveDate", v_contract."expiryDate");

  -- หลักฐานงวดยกมา: ส่งมาใหม่ (ฟอร์มเพิ่งอัป) หรือใช้ที่เก็บไว้ตอนแก้ใบ
  SELECT * INTO v_opening FROM public.sales_order_installments
   WHERE "salesOrderId" = v_order.id AND kind = 'opening'
   FOR UPDATE;
  IF FOUND THEN
    v_evidence := CASE WHEN p_opening_evidence IS NULL OR jsonb_typeof(p_opening_evidence) = 'null'
                       THEN v_opening.evidence ELSE p_opening_evidence END;
    IF (CASE WHEN jsonb_typeof(v_evidence) = 'array' THEN jsonb_array_length(v_evidence) ELSE 0 END) = 0 THEN
      RAISE EXCEPTION 'historical_so_opening_evidence_missing';
    END IF;
    IF v_opening."paidOn" IS NULL THEN RAISE EXCEPTION 'historical_so_opening_invalid'; END IF;
    UPDATE public.sales_order_installments SET evidence = v_evidence, "updatedAt" = now()
     WHERE id = v_opening.id;
  END IF;

  -- ส่งใหม่หลังถูกตีกลับ = ล้างร่องรอยการตีกลับ (ชื่อคอลัมน์ของใบคือ "rejectionReason" — 0107)
  UPDATE public.sales_orders SET
    status = 'pending_approval',
    "submittedAt" = now(),
    "submittedBy" = p_actor_id,
    "submittedByName" = p_actor_name,
    "rejectedAt" = NULL,
    "rejectedBy" = NULL,
    "rejectedByName" = NULL,
    "rejectionReason" = NULL,
    "updatedAt" = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object('replayed', false, 'order', to_jsonb(v_order));
END;
$$;

-- ── 11) RPC AE Sup อนุมัติใบย้อนหลัง — สัญญา + ใบ + หยุดยอดงวด + รอบขายของโซน ในทรานแซกชันเดียว ──
-- ⭐ ไม่นับ Actual: ไม่แตะ actualAmount/financeStatus · cache ของดีลกรอง origin = 'pipeline' (0360) ⇒ ดีลภาชนะยัง 0
-- ⚠️ ผู้คีย์/ผู้ส่งอนุมัติใบตัวเองไม่ได้ — Admin ได้แบบ admin_override (เหตุผลไม่บังคับ = เท่าสาย pipeline)
--    ตรวจทั้งหมดนี้ **ก่อนเขียนอะไร**
-- ⚠️ กดซ้ำโดยผู้อนุมัติคนเดิม = ผลเดิม ไม่ออกเลข CT ใหม่ ไม่เพิ่มรอบขาย · คนอื่นกดซ้ำ = state_invalid
-- ⚠️ ไฟล์ที่ผูกเป็นหลักฐานของสัญญาคือไฟล์ที่ AE Sup เห็นในโมดัล (p_signed_file_id) — ไม่ใช่ "ไฟล์แรก" ที่ฐานหยิบเอง
-- · เลข CT ออกด้วยตัวเขียนของ 0322 (บ่อเลขเดียวกับหน้าสัญญา) · YYMM = เดือนที่อนุมัติ
--   ตัวนั้นเขียนผ่าน master_row_assignments ซึ่งทิ้งคีย์ที่ไม่มีคอลัมน์เงียบ ๆ ⇒ อ่านสัญญากลับมาตรวจ
-- · หยุดยอดงวด: งวดที่มีวันรับเงิน + หลักฐานแล้ว (งวดยกมา) ขึ้นเป็น "แจ้งชำระแล้ว" ให้บัญชีรับรอง — ไม่ข้ามไป 'confirmed'
--   ไม่เรียกตัวหยุดยอดของสาย pipeline (ตัวนั้นสร้างงวดจากแผนชำระของใบเสนอราคาซึ่งใบนี้ไม่มี)
-- · รอบขายของโซน 1 แถวต่อบรรทัด — ช่วงวันว่าง (ตามสัญญา) · ปริมาณมาตรฐานว่าง (TS ยังไม่มีจอแก้)
CREATE OR REPLACE FUNCTION public.approve_historical_sales_order(
  p_order_id            text,
  p_expected_updated_at timestamptz,
  p_actor_id            text,
  p_actor_name          text,
  p_actor_role          text,
  p_override_reason     text,
  p_note                text,
  p_signed_file_id      uuid,
  p_contract_month      text,
  p_contract_prefix     text,
  p_contract_width      integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    public.sales_orders%ROWTYPE;
  v_contract public.sales_contracts%ROWTYPE;
  v_self     boolean;
  v_mode     text;
  v_reason   text;
  v_note     text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_lines    jsonb;
  v_rows     jsonb;
  v_line_sum numeric;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_actor_required'; END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'historical_so_approve_forbidden';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.origin IS DISTINCT FROM 'historical' THEN RAISE EXCEPTION 'historical_so_not_found'; END IF;

  -- กดซ้ำโดยผู้อนุมัติคนเดิม (เน็ตหลุดหลังอนุมัติสำเร็จ) = ผลเดิม · ต้องมาก่อนด่าน updatedAt (ค่าเปลี่ยนไปแล้ว)
  IF v_order.status = 'approved' AND v_order."approvedBy" = p_actor_id THEN
    RETURN jsonb_build_object(
      'replayed', true,
      'order', to_jsonb(v_order),
      'contract', (SELECT to_jsonb(c) - 'issuedHtml' FROM public.sales_contracts c WHERE c.id = v_order."serviceContractId"),
      'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                                FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id), '[]'::jsonb),
      'terms', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
                         FROM public.service_zone_terms t WHERE t."salesOrderId" = v_order.id), '[]'::jsonb)
    );
  END IF;
  IF v_order.status <> 'pending_approval' THEN RAISE EXCEPTION 'historical_so_approve_state_invalid'; END IF;
  IF v_order."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_stale'; END IF;

  -- ผู้คีย์/ผู้ส่งอนุมัติใบตัวเอง: Admin เท่านั้น (admin_override) — ตรวจก่อนเขียนทุกอย่าง
  v_self := COALESCE(p_actor_id = v_order."createdBy", false) OR COALESCE(p_actor_id = v_order."submittedBy", false);
  IF v_self AND p_actor_role <> 'admin' THEN RAISE EXCEPTION 'historical_so_self_approval'; END IF;
  v_mode := CASE WHEN v_self THEN 'admin_override' ELSE 'standard' END;
  v_reason := CASE WHEN v_self THEN NULLIF(btrim(COALESCE(p_override_reason, '')), '') END;
  IF COALESCE(length(v_reason), 0) > 500 OR COALESCE(length(v_note), 0) > 500 THEN
    RAISE EXCEPTION 'historical_so_approval_note_invalid';
  END IF;

  -- ตรวจซ้ำจากแถวที่เก็บจริง — โซน/สินค้าอาจถูกปิด/ย้ายหลังส่ง · งวด · หลักฐานงวดยกมา
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'zoneId', l."serviceZoneId", 'productId', l."productId", 'qty', l.qty,
           'unitPrice', l."unitPrice", 'lineTotal', l."lineTotal", 'serviceRounds', l."serviceRounds"
         ) ORDER BY l."sortOrder"), '[]'::jsonb)
    INTO v_lines
    FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order.id;
  v_line_sum := public.historical_so_check_lines(v_lines, v_order."customerId");
  IF abs(v_line_sum - v_order.subtotal) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;

  SELECT * INTO v_contract FROM public.sales_contracts WHERE id = v_order."serviceContractId" FOR UPDATE;
  IF NOT FOUND OR v_contract.status <> 'draft' OR v_contract.source <> 'external'
     OR v_contract.metadata->>'historicalSalesOrderId' IS DISTINCT FROM v_order.id THEN
    RAISE EXCEPTION 'historical_so_contract_state_invalid';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', i.kind, 'label', i.label, 'amount', i.amount, 'dueDate', i."dueDate",
           'coversFrom', i."coversFrom", 'coversTo', i."coversTo", 'paidOn', i."paidOn", 'note', i.note
         ) ORDER BY i.seq), '[]'::jsonb)
    INTO v_rows
    FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id;
  PERFORM public.historical_so_check_installments(v_rows, v_order."totalAmount",
                                                  v_contract."effectiveDate", v_contract."expiryDate");
  IF EXISTS (
    SELECT 1 FROM public.sales_order_installments i
     WHERE i."salesOrderId" = v_order.id AND i.kind = 'opening' AND jsonb_array_length(i.evidence) = 0
  ) THEN
    RAISE EXCEPTION 'historical_so_opening_evidence_missing';
  END IF;

  -- ไฟล์ที่ AE Sup เลือกต้องเป็นไฟล์เอกสารแทนสัญญาของสัญญาใบนี้ (ด่านเดียวกับ route อนุมัติเอกสารแทนสัญญา)
  IF p_signed_file_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.attachments a
     WHERE a.id = p_signed_file_id
       AND a."entityType" = 'contract' AND a."entityId" = v_contract.id AND a."docType" = 'external_doc'
  ) THEN
    RAISE EXCEPTION 'historical_so_signed_file_invalid';
  END IF;

  -- ① สัญญา: ออกเลข CT + ลงนาม (วันที่บนเอกสาร = วันเริ่มสัญญา) แล้วอ่านกลับมาตรวจ
  PERFORM public.approve_external_sales_contract(
    v_contract.id, p_contract_month, p_contract_prefix, p_contract_width,
    jsonb_build_object(
      'signedDate', v_contract."effectiveDate",
      'signedAt', now(),
      'signedFileId', p_signed_file_id,
      'effectiveDate', v_contract."effectiveDate",
      'expiryDate', v_contract."expiryDate",
      'approvedById', p_actor_id,
      'approvedByName', p_actor_name,
      'approvedAt', now()
    )
  );
  SELECT * INTO v_contract FROM public.sales_contracts WHERE id = v_contract.id;
  IF v_contract.status IS DISTINCT FROM 'signed' OR v_contract."contractNo" IS NULL
     OR v_contract."signedFileId" IS DISTINCT FROM p_signed_file_id THEN
    RAISE EXCEPTION 'historical_so_contract_state_invalid';
  END IF;

  -- ② ใบ: อนุมัติ (0294 ก๊อปเจ้าของจากดีลภาชนะ · 0279 คิด cache ดีลใหม่จากใบ pipeline ล้วน ⇒ ดีลภาชนะยัง 0)
  UPDATE public.sales_orders SET
    status = 'approved',
    "approvedAt" = now(),
    "approvedBy" = p_actor_id,
    "approvedByName" = p_actor_name,
    "approvalNote" = v_note,
    "approvalMode" = v_mode,
    "approvalOverrideReason" = v_reason,
    "updatedAt" = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- ③ หยุดยอดงวด — งวดยกมาที่มีวันรับเงิน + หลักฐาน ขึ้นเป็น "แจ้งชำระแล้ว" ในนามผู้ส่ง ให้บัญชีรับรองครั้งเดียว
  UPDATE public.sales_order_installments i SET
    "frozenAt" = now(),
    status = CASE WHEN i.status = 'pending' AND i."paidOn" IS NOT NULL AND jsonb_array_length(i.evidence) > 0
                  THEN 'reported' ELSE i.status END,
    "reportedAt" = CASE WHEN i.status = 'pending' AND i."paidOn" IS NOT NULL AND jsonb_array_length(i.evidence) > 0
                        THEN now() ELSE i."reportedAt" END,
    "reportedById" = CASE WHEN i.status = 'pending' AND i."paidOn" IS NOT NULL AND jsonb_array_length(i.evidence) > 0
                          THEN v_order."submittedBy" ELSE i."reportedById" END,
    "reportedByName" = CASE WHEN i.status = 'pending' AND i."paidOn" IS NOT NULL AND jsonb_array_length(i.evidence) > 0
                            THEN v_order."submittedByName" ELSE i."reportedByName" END,
    "updatedAt" = now()
  WHERE i."salesOrderId" = v_order.id AND i."frozenAt" IS NULL;

  -- ④ รอบขายของโซน — 1 แถวต่อบรรทัด ⇒ คิวรับงานของ TS เห็นเป็น "รอตั้งรอบ" (ไม่ผ่านขั้นผูกโซน)
  INSERT INTO public.service_zone_terms (
    id, "zoneId", "salesOrderId", "salesOrderLineId", "productId", "fgCode", description,
    "packageQty", unit, "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    'SZT-H' || substr(md5(l.id || ':' || l."serviceZoneId"), 1, 20), l."serviceZoneId", l."salesOrderId", l.id,
    l."productId", l."fgCode", l.description,
    l.qty, l.unit, p_actor_id, p_actor_name, now(), now()
  FROM public.sales_order_lines l
  WHERE l."salesOrderId" = v_order.id
  ORDER BY l."sortOrder";

  RETURN jsonb_build_object(
    'replayed', false,
    'order', to_jsonb(v_order),
    'contract', to_jsonb(v_contract) - 'issuedHtml',
    'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                              FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order.id), '[]'::jsonb),
    'terms', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
                       FROM public.service_zone_terms t WHERE t."salesOrderId" = v_order.id), '[]'::jsonb)
  );
END;
$$;

-- ── 12) สิทธิ์ ─────────────────────────────────────────────────────────────────
-- ตัวตรวจกลาง + ฟังก์ชัน trigger: ไม่มีใครเรียกตรงได้ (รวม service_role) — ผู้เรียกคือ SECURITY DEFINER/trigger
-- ⚠️ Supabase ให้ EXECUTE กับ anon/authenticated/service_role ผ่าน default privileges ⇒ REVOKE รายบทบาท ไม่ใช่แค่ PUBLIC
REVOKE ALL ON FUNCTION public.historical_so_check_contract(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_check_lines(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_check_installments(jsonb, numeric, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_write_children(text, jsonb, jsonb, numeric, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_void_substitute_contract()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.historical_so_no_reopen()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_historical_sales_order(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_historical_sales_order(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_historical_sales_order(text, timestamptz, text, text, text, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_historical_sales_order(text, timestamptz, text, text, text, jsonb, jsonb, jsonb, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.submit_historical_sales_order(text, timestamptz, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_historical_sales_order(text, timestamptz, text, text, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.approve_historical_sales_order(text, timestamptz, text, text, text, text, text, uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_historical_sales_order(text, timestamptz, text, text, text, text, text, uuid, text, text, integer)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ถอยกลับ (ใช้ได้เฉพาะตอนยังไม่มีแถว origin = 'historical' เลย) ───────────────
--   DROP TRIGGER ×3 ของข้อ 7 · DROP FUNCTION ×10 ของไฟล์นี้ · รันข้อ 2 (CHECK origin_shape) และข้อ 6 ของ 0360 ซ้ำ
--   · รันข้อ 3 ของ 0366 ซ้ำ (RPC ถอดจุด) · คืน CHECK sales_contracts_external_kind ตาม 0322 (ต้องไม่มีแถว signed_quotation)
--   · DROP INDEX sales_order_installments_opening_uk / sales_order_lines_service_zone_idx
--   · DROP CONSTRAINT sales_order_installments_kind_check / _opening_shape · DROP COLUMN kind / "serviceZoneId"
