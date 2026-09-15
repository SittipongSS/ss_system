-- ============================================================
--  Migration 0360: ใบสั่งขายย้อนหลัง (SO ย้อนหลัง) — ธง origin · ตัวเขียนทางเดียว · กันเงินที่ต้นทาง
--                  (มติผู้ใช้ 14/09/2026 ข้อ 1–16 + กลุ่ม 4 ข้อ 18–21 · ข้อ 17 เคาะ 15/09/2026
--                   · คำตอบคำถามเปิดของแผน P1 ข้อ 1–4 เคาะ 15/09/2026)
--
--  🐞 **งานบริการที่ขายนอกระบบผูกโซนไม่ได้เลย** — ชีต "SDS ระบบกระจายกลิ่น" (ภาพนิ่ง ไม่อัปเดตกลับ)
--    มีงานที่ยังเดิน ~180 จุด แต่สะพานขาย→บริการ service_zone_terms บังคับ salesOrderId + salesOrderLineId
--    (0297) ⇒ ไม่มีแถวใน sales_orders = ไม่ขึ้นคิวนัด · ไม่มีรอบเติม · ไม่มีต่อสัญญา
--  🐞 **คีย์เป็นใบปกติ = นับยอดซ้ำ** — trigger Actual (0279 · ตัวฟังก์ชันล่าสุด 0353) ดันยอดใบที่อนุมัติ
--    เข้า wonValue ของเดือนที่อนุมัติทันที ทั้งที่เงินก้อนนี้ออกบิลผ่าน Express ไปแล้ว
--
--  ⭐ กติกา
--  · ตารางเดียว + ธง origin ('pipeline' | 'historical') บน sales_orders และ sales_deals
--    ไม่ใช้คำว่า 'legacy' — metadata.legacy เป็นของสวิตช์ "ดีลเก่า" ในฟอร์มดีล (51 ดีลบน prod · 0359)
--  · เก็บยอดจริงไว้ในใบ แล้วกรองที่ตัวคำนวณ (ข้อ 2) — ไฟล์นี้กรองฝั่ง DB (cache Actual/รออนุมัติของดีล)
--    ตัวอ่านฝั่งแอป (รายงานเป้า · ผลิตอัตโนมัติ · สรรพสามิต · KPI ดีล) กรองในโค้ดรอบถัดไป
--  · ใบย้อนหลัง: ไม่มีใบเสนอราคา · ไม่มีโครงการ · เกิดเป็นอนุมัติแล้ว (approvedAt = เวลาคีย์ ⇒ ตัวอ่านที่ลืมกรอง
--    โผล่เดือนนี้ให้เห็น ไม่ใช่เดือนที่ปิดไปแล้ว) · financeStatus ว่างเสมอ (ไม่เข้าคิวบัญชีปิดใบ)
--    · สถานะได้แค่ approved/cancelled ⇒ ย้อนอนุมัติ / ออก Rev. / คืนเป็นร่าง ตายที่ CHECK
--  · ดีลภาชนะ 1 ใบต่อ (ลูกค้า × AE) · Won · SERVICE · RE-ORDER · ไม่มีโครงการ · มูลค่า 0
--    · ห้ามเป็นดีลสวิตช์ "ดีลเก่า" (ข้อ 19–20)
--  · **AE บังคับ** (คำตอบข้อ 1): ผู้คีย์ต้องเลือก AE ที่ยังถือดีลได้ (ae/senior_ae — route ตรวจด้วย
--    validateDealOwner เพราะ role อยู่ใน Supabase Auth ไม่อยู่ในฐาน) · ทีมของดีลภาชนะ = ทีมตาม AE ที่เลือก
--    ⇒ ดีลภาชนะไม่มีวัน ownerId ว่าง (CHECK) · แถวชีตที่ AE ว่าง ผู้คีย์เลือก AE ให้เอง
--  · **ย้ายเจ้าของดีลภาชนะทีละใบ** (คำตอบข้อ 4): ปุ่มโอนงานพนักงานไม่แตะ (ดีล Won อยู่นอกเงื่อนไขโอนอยู่แล้ว)
--    ย้ายรายใบไปหา AE ที่มีดีลภาชนะของลูกค้ารายเดียวกันอยู่แล้ว = ชน UNIQUE ข้อ 1 ⇒ route ตอบ 409 ไทย
--    · ไม่รวมใบใน P1
--    · 🪤 ย้ายเจ้าของ (PATCH ธรรมดา ไม่ถือล็อกคู่ข้อ ④) แข่งกับการคีย์ของ AE ปลายทางพอดี ⇒ RPC สร้างใบชน
--      UNIQUE เอง ⇒ จับไว้แล้วผูกกับดีลที่เพิ่งย้ายมา (ผลเท่ากับกดบันทึกซ้ำ) · หาไม่เจอ = historical_so_container_deal_race
--      ⇒ 23505 ของ index นี้ไม่หลุดจาก RPC สร้างใบ · route POST ห้ามแปลเป็น 409 "มีดีลของ AE คนนั้นอยู่แล้ว"
--      (ข้อความนั้นเป็นของ PATCH ย้ายเจ้าของเท่านั้น — ผู้คีย์ไม่ได้ย้ายอะไร)
--  · บรรทัด = จุดติดตั้ง · ฝ่ายขายพิมพ์ชื่อสาขา/จุดเป็นข้อความ · TS ผูกโซนจริงในคิวงานเข้าใหม่ (ข้อ 17)
--    ⇒ ไฟล์นี้ไม่แตะ service_zone_terms (ตัวเขียนรอบขายยังมีทางเดียว = route ผูกโซนของ TS)
--    · จุดที่ TS หาไม่เจอหน้างาน: P1 **ไม่มีทางออก** (คำตอบข้อ 3) — ต้องมีมติ/ทางออกก่อนเริ่มคีย์จริง (เฟส 3)
--  · งวดที่คีย์ = เฉพาะยอดที่ **ยังต้องเก็บ** (คำตอบข้อ 2 — งวดที่เก็บนอกระบบแล้วไม่คีย์ ใช้ยกเว้นด่านเงินรายใบแทน)
--    · 'pending' เท่านั้น + หยุดยอดทันที (frozenAt) · บัญชียืนยันเอง · ตัวตรวจงวดตัวเดียว
--    ใช้ทั้งตอนคีย์และตอนเพิ่มงวดทีหลัง และตรวจเท่ากับ CHECK ของตาราง (0245/0320)
--  · ยกเว้นด่านเงินรายใบ: ใคร/เมื่อไร/ทำไม ครบทุกช่องหรือว่างทุกช่อง · ใบยอด 0 ต้องยกเว้น + มีหมายเหตุ (ข้อ 11)
--  · ส่งซ้ำได้ใบเดิม **เฉพาะคำขอเดิมทุกตัวอักษร** (ลายนิ้วมือ historicalIntakeHash) — ต่างแม้ช่องเดียว = ชนกัน
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) sales_deals.origin + CHECK รูปทรงดีลภาชนะ (รวม ownerId ห้ามว่าง) + UNIQUE (ลูกค้า, AE) เฉพาะ historical
--  2) sales_orders: origin · เลขอ้างอิงเดิม 3 ช่อง · ยกเว้นด่านเงิน 4 ช่อง · ลายนิ้วมือคำขอ 1 ช่อง
--     + CHECK รูปทรง แล้วจึงปลด NOT NULL ของ quotationId — ลำดับนี้ห้ามสลับ
--  3) sales_order_lines."installationPoint"
--  4) origin แก้ไม่ได้หลังเกิด (trigger ทั้งสองตาราง)
--  5) cache Actual/รออนุมัติของดีล — คัดสองฟังก์ชันจาก 0353 ทุกตัวอักษร เพิ่มแค่ origin = 'pipeline' ในสี่ SELECT
--     (เทสต์ตัดตัวกรองออกแล้วเทียบกับ 0353 ทั้งก้อน) · สองตัวต้องอยู่ไฟล์เดียวกัน (soPendingApprovalMigration.test.mjs)
--     · trigger บน sales_orders (0279) / sales_deals (0110) / เจ้าของใบ (0294) ไม่แก้ — sync คิดใหม่จากใบ pipeline
--     ล้วนทุกครั้งอยู่แล้ว (เทสต์ตรึงว่าคำสั่งสุดท้ายของแต่ละตัวยังเป็น CREATE เดิม — DROP/DISABLE ตามหลัง = แดง)
--  6) ตัวตรวจงวด + RPC create_historical_sales_order (ดีลภาชนะ + เลขใบ + หัวใบ + บรรทัด + งวด ในทรานแซกชันเดียว)
--     + RPC append_historical_installments · บล็อกออกเลขคัดจาก RPC สร้างใบร่าง (0343) ทุกตัวอักษร (เทสต์เทียบ)
--     ใช้เวลาตอนคีย์ ไม่ใช่วันที่ใบ
--
--  ⛔ ไม่แตะ: service_zone_terms · สัญญา (ผูกทีหลังผ่าน route เดิม) · trigger เดิมของ sales_orders
--     · RPC ย้อนอนุมัติ/ออก Rev./ยกเลิกพร้อมย้อน Won (CHECK ของไฟล์นี้กันแถวย้อนหลังให้แล้ว — ดีลภาชนะต้อง won
--       ⇒ RPC ย้อน Won ล้มทั้งทรานแซกชัน)
--  ⛔ ไม่ backfill — แถวเดิมได้ 'pipeline' จาก DEFAULT ⇒ ตัวกรองให้ผลเท่าเดิมทุกดีล
--     ห้ามวนคิดทุกดีลใหม่ — ทุก UPDATE metadata ปลุก enforce ซึ่งประทับ actualSource ใหม่ (บทเรียน 0353)
--  🔐 สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated + GRANT service_role ทุกฟังก์ชันใหม่ (แพตเทิร์น 0336)
--
--  🛑 **รันก่อน merge โค้ด JS ของ P1** — โค้ด P1 select/กรองคอลัมน์ origin · ขึ้นก่อนรัน = 42703 ⇒ แดชบอร์ด ·
--     รายงานเป้า · คิวผลิต · ตัวเลือกยื่นภาษีตอบ 500 และคิวส่งมอบของแดชบอร์ดของฉัน/หน้าดีลว่างเงียบ
--     · CI check:columns แดงจนกว่าจะรัน (ด่านนั้นอ่านสคีมาจริง)
--     รันล่วงหน้านานเท่าไรก็ปลอดภัย: ตัวเขียนเดิมส่ง quotationId ทุกครั้ง และตัวกรองจับทุกแถวเดิม
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/INDEX/TRIGGER IF EXISTS แล้วสร้างใหม่
--     ⇒ นิยามบนฐานตรงกับไฟล์เสมอ ไม่ใช่ข้ามเงียบเพราะชื่อซ้ำ · CREATE OR REPLACE FUNCTION)
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — ตัวนับเลขใบ/รหัสดีลเป็นแถวในตาราง ⇒ ROLLBACK คืนเลขให้) ──────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายข้อ 6 ด้วยบล็อก "ลองจริง" ข้างล่าง
--           (บล็อกจบด้วย ROLLBACK; ⇒ DDL ทั้งไฟล์ + การเรียก RPC ถูกยกเลิกหมด)
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อก "ลองจริง" ทั้งก้อน โดยนำหน้าด้วย BEGIN;
--  แทนค่า <...> ก่อนรัน: ลูกค้าที่ approvalStatus = 'approved' · AE ที่ role ae/senior_ae ยังใช้งานอยู่ (id จาก Auth)
--  · ทีม = ทีมของ AE คนนั้น · ใบเกิด error กลางทาง = ทรานแซกชันล้มทั้งก้อน ไม่มีอะไรถูกบันทึก
--
--   SELECT public.create_historical_sales_order(
--     'smoke-0360', repeat('a', 64), '<adminUserId>', 'smoke 0360', 'admin',
--     '{"customerId":"<customerId>","ownerId":"<aeUserId>","team":"<teamCode>","orderDate":"2024-06-01",
--       "subtotal":100,"vatAmount":7,"totalAmount":107}',
--     '[{"installationPoint":"จุดทดสอบ 0360","qty":1,"unitPrice":100,"lineTotal":100}]',
--     '[{"label":"งวด 1/1","amount":107,"coversFrom":"2026-06-01","coversTo":"2027-05-31"}]',
--     '{"id":"DEAL-smoke0360","historyId":"DSH-smoke0360","title":"ทดสอบ 0360","ownerName":"<ชื่อ AE>",
--       "month":"26","prefix":"DL-2609","width":5}'
--   ) ->> 'dealCreated';                                                             -- คาด true
--   SELECT origin, stage, "wonValue", metadata->>'wonMonth', "ownerId" IS NOT NULL, team
--     FROM public.sales_deals WHERE id = 'DEAL-smoke0360';                  -- historical · won · 0 · null · true · <teamCode>
--   SELECT "orderNumber", status, origin, "quotationId", "financeStatus", "ownerId" = '<aeUserId>'
--     FROM public.sales_orders WHERE id = 'SOR-H' || substr(md5('smoke-0360'), 1, 16);
--                                                    -- SO-{YY}{MM}xxxx-0 · approved · historical · null · null · true
--   SELECT count(*), count(*) FILTER (WHERE "frozenAt" IS NULL)
--     FROM public.sales_order_installments WHERE "salesOrderId" = 'SOR-H' || substr(md5('smoke-0360'), 1, 16);  -- 1 · 0
--   DO $$ BEGIN   -- ใบ pipeline ปลดใบเสนอราคาไม่ได้ · ย้อนใบย้อนหลังเป็นร่างไม่ได้ · เปลี่ยน origin ไม่ได้
--     BEGIN UPDATE public.sales_orders SET "quotationId" = NULL WHERE origin = 'pipeline' AND id = (SELECT min(id) FROM public.sales_orders WHERE origin = 'pipeline');
--           RAISE EXCEPTION 'SMOKE FAIL 1'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok 1: %', SQLERRM; END;
--     BEGIN UPDATE public.sales_orders SET status = 'draft' WHERE id = 'SOR-H' || substr(md5('smoke-0360'), 1, 16);
--           RAISE EXCEPTION 'SMOKE FAIL 2'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok 2: %', SQLERRM; END;
--     BEGIN UPDATE public.sales_deals SET origin = 'pipeline' WHERE id = 'DEAL-smoke0360';
--           RAISE EXCEPTION 'SMOKE FAIL 3'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 3: %', SQLERRM; END;
--   END $$;                                                                          -- คาด NOTICE ok 1 · ok 2 · ok 3
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT origin, count(*) FROM public.sales_orders GROUP BY 1;      -- คาด: pipeline = จำนวนใบทั้งหมด (175 ณ 15/09)
--   SELECT origin, count(*) FROM public.sales_deals  GROUP BY 1;      -- คาด: pipeline = จำนวนดีลทั้งหมด
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'quotationId';  -- YES
--   SELECT conname FROM pg_constraint WHERE conname IN ('sales_deals_origin_check','sales_deals_historical_shape',
--     'sales_orders_origin_check','sales_orders_origin_shape','sales_orders_historical_refs_len',
--     'sales_orders_historical_intake_hash_format','sales_orders_payment_gate_exempt_sane',
--     'sales_order_lines_installation_point_len');                                                   -- 8 แถว
--   SELECT indexname FROM pg_indexes WHERE indexname = 'sales_deals_historical_container_uk';        -- 1 แถว
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('sales_orders_origin_immutable_trg','sales_deals_origin_immutable_trg');  -- 2 แถว
--   SELECT r.role, has_function_privilege(r.role, f.sig, 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role),
--          (VALUES ('public.create_historical_sales_order(text,text,text,text,text,jsonb,jsonb,jsonb,jsonb)'),
--                  ('public.append_historical_installments(text,text,text,text,jsonb)'),
--                  ('public.historical_so_installments_total(jsonb)')) AS f(sig);
--                                                     -- anon/authenticated = false ทั้ง 6 · service_role = true ทั้ง 3
--   แล้วรัน `npm run check:columns` กับ `npm run check:rowcap` ในเครื่อง (ต้องเขียวก่อน merge คอมมิต JS)
-- ============================================================

BEGIN;

-- ── 1) sales_deals: origin + ดีลภาชนะ ─────────────────────────────────────
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'pipeline';

ALTER TABLE public.sales_deals DROP CONSTRAINT IF EXISTS sales_deals_origin_check;
ALTER TABLE public.sales_deals
  ADD CONSTRAINT sales_deals_origin_check CHECK (origin IN ('pipeline', 'historical'));

-- ดีลภาชนะเป็นยอด/FC/เดือน Won ไม่ได้ และกลายเป็นดีลชนิดอื่นไม่ได้ — ทุกช่องที่ตัวอ่าน KPI ใช้ถูกตรึงที่นี่
-- (wonMonthOf ถอยไป confirmedAt → poReceivedDate → forecastMonth · FC Excel ข้าม projectValue 0
--  · สัญญาบริการต้อง RE-ORDER/NPD + SERVICE · projectRollup/ส่งของวัตถุดิบเดินตาม projectId · หน้าลีดเดินตาม leadId)
-- ownerId ห้ามว่าง (คำตอบข้อ 1) — ใบย้อนหลังทุกใบมี AE เจ้าของ ⇒ ขอบเขต "ของฉัน" ของ AE เห็นครบ
-- ⚠️ ย้ายเจ้าของรายใบ = เขียนแค่ ownerId/ownerName/team/updatedAt · ช่องอื่นในรายการนี้ขยับ = 23514
ALTER TABLE public.sales_deals DROP CONSTRAINT IF EXISTS sales_deals_historical_shape;
ALTER TABLE public.sales_deals
  ADD CONSTRAINT sales_deals_historical_shape CHECK (
    origin = 'pipeline'
    OR (
      stage = 'won'
      AND line = 'SERVICE'
      AND "dealType" = 'RE-ORDER'
      AND "projectId" IS NULL
      AND "customerId" IS NOT NULL
      AND "ownerId" IS NOT NULL
      AND team IS NOT NULL
      AND "projectValue" = 0
      AND "forecastManualValue" = 0
      AND "forecastSource" = 'manual'
      AND "confirmedAt" IS NULL
      AND "forecastMonth" IS NULL
      AND "leadId" IS NULL
      AND "parentDealId" IS NULL
      AND (metadata->>'legacy') IS DISTINCT FROM 'true'
    )
  );

-- มติข้อ 4: ดีลภาชนะ 1 ใบต่อลูกค้าต่อ AE · ownerId ห้ามว่าง (CHECK ข้างบน) ⇒ ไม่ต้อง COALESCE
-- ย้ายเจ้าของไปหา AE ที่มีดีลภาชนะของลูกค้านี้อยู่แล้ว = 23505 ชื่อนี้ ⇒ route PATCH ตอบ 409 (ไม่รวมใบใน P1)
-- · RPC สร้างใบจับ 23505 ชื่อนี้เอง (ย้ายเจ้าของแข่งกับการคีย์ · ข้อ 6b ⑩) ⇒ route POST ไม่เคยเห็นชื่อนี้
DROP INDEX IF EXISTS public.sales_deals_historical_container_uk;
CREATE UNIQUE INDEX sales_deals_historical_container_uk
  ON public.sales_deals ("customerId", "ownerId")
  WHERE origin = 'historical';

COMMENT ON COLUMN public.sales_deals.origin IS
  'pipeline = ดีลปกติ · historical = ดีลภาชนะของใบสั่งขายย้อนหลัง (mig 0360) — ไม่ใช่สวิตช์ "ดีลเก่า" (metadata.legacy) · แก้ไม่ได้หลังเกิด';

-- ── 2) sales_orders: origin + เลขอ้างอิงเดิม + ยกเว้นด่านเงิน + ลายนิ้วมือคำขอ ──────
-- ⚠️ ต้องเป็นคำสั่ง ALTER TABLE เดียว นอก DO/EXECUTE — ยาม serviceRoundsCopyPaths.test.mjs อ่านคอลัมน์ของ
--    sales_orders จากรูปประโยคนี้ แล้วบังคับให้ทุกคอลัมน์ถูกตัดสินว่า Rev./ใบร่าง ก๊อปหรือไม่
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'pipeline',
  ADD COLUMN IF NOT EXISTS "historicalQuoteRef" text,
  ADD COLUMN IF NOT EXISTS "historicalExpressRef" text,
  ADD COLUMN IF NOT EXISTS "historicalInvoiceRef" text,
  ADD COLUMN IF NOT EXISTS "historicalIntakeHash" text,
  ADD COLUMN IF NOT EXISTS "paymentGateExemptAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "paymentGateExemptById" text,
  ADD COLUMN IF NOT EXISTS "paymentGateExemptByName" text,
  ADD COLUMN IF NOT EXISTS "paymentGateExemptReason" text;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_origin_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_origin_check CHECK (origin IN ('pipeline', 'historical'));

-- รูปทรงสองสาย — ต้องมีก่อนปลด NOT NULL ของ quotationId
-- pipeline: เหมือนเดิมทุกอย่าง (175/175 แถวบน prod มี quotationId · ตรวจ 15/09) · ห้ามมีเลขเดิม/ยกเว้นด่านเงิน/ลายนิ้วมือ
--           ⇒ Rev. ที่ก๊อป quotationId NULL จากใบย้อนหลัง (ถ้าหลุดมาได้) ตายที่นี่ด้วย
-- historical: สถานะได้แค่ approved/cancelled · financeStatus ว่างเสมอ (ขั้นบัญชีปิดใบต้องการ 'pending')
--           · ยกเลิกแบบปกติไม่ล้าง approvedAt ⇒ ยังผ่าน · คืนเป็นร่าง (ล้าง approvedAt + status draft) ตายที่นี่
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
      AND status IN ('approved', 'cancelled')
      AND "approvedAt" IS NOT NULL
      AND "createdBy" IS NOT NULL
      AND "approvalMode" = 'standard'
      AND "revisionNo" = 0
      AND "revisedFromId" IS NULL
      AND "supersededById" IS NULL
      AND "financeStatus" IS NULL
      AND "signatureEvidenceId" IS NULL
      AND "historicalIntakeHash" IS NOT NULL
    )
  );

-- ความยาวเท่า referenceDoc (0235)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_historical_refs_len;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_historical_refs_len CHECK (
    ("historicalQuoteRef" IS NULL OR length(btrim("historicalQuoteRef")) BETWEEN 1 AND 200)
    AND ("historicalExpressRef" IS NULL OR length(btrim("historicalExpressRef")) BETWEEN 1 AND 200)
    AND ("historicalInvoiceRef" IS NULL OR length(btrim("historicalInvoiceRef")) BETWEEN 1 AND 200)
  );

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_historical_intake_hash_format;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_historical_intake_hash_format
  CHECK ("historicalIntakeHash" IS NULL OR "historicalIntakeHash" ~ '^[0-9a-f]{64}$');

-- ร่องรอยการยกเว้น: ว่างทั้งชุด หรือ มีเวลา + ผู้ยกเว้น + เหตุผล 10–500 ตัวอักษร (เท่ากับ RPC ข้อ 6b ⑨)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_payment_gate_exempt_sane;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_payment_gate_exempt_sane CHECK (
    (
      "paymentGateExemptAt" IS NULL AND "paymentGateExemptById" IS NULL
      AND "paymentGateExemptByName" IS NULL AND "paymentGateExemptReason" IS NULL
    )
    OR (
      "paymentGateExemptAt" IS NOT NULL AND "paymentGateExemptById" IS NOT NULL
      AND "paymentGateExemptReason" IS NOT NULL
      AND length(btrim("paymentGateExemptReason")) BETWEEN 10 AND 500
    )
  );

-- มติข้อ 3: ปลดเงื่อนไขใบเสนอราคาเฉพาะสายย้อนหลัง (CHECK ข้างบนบังคับ pipeline ต่อ) · FK เดิมคงไว้
ALTER TABLE public.sales_orders ALTER COLUMN "quotationId" DROP NOT NULL;

COMMENT ON COLUMN public.sales_orders.origin IS
  'pipeline = ใบปกติจากใบเสนอราคา · historical = ใบสั่งขายย้อนหลัง (mig 0360) ไม่นับ Actual/FC/เป้า · แก้ไม่ได้หลังเกิด';
COMMENT ON COLUMN public.sales_orders."historicalIntakeHash" IS
  'sha256 ของคำขอคีย์ที่สร้างใบนี้ — ส่งซ้ำด้วยรหัสการคีย์เดิมได้ใบเดิมเฉพาะเมื่อคำขอตรงทุกตัวอักษร (mig 0360)';
COMMENT ON COLUMN public.sales_orders."paymentGateExemptReason" IS
  'เหตุผลยกเว้นด่านเงินของนัดบริการ — เฉพาะใบย้อนหลัง (มติข้อ 13) · ใบยอด 0 ได้เหตุผลอัตโนมัติจากตัวเขียน';

-- ── 3) sales_order_lines: ชื่อสาขา/จุดติดตั้งตามชีต (มติข้อ 17) ─────────────────
ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS "installationPoint" text;

ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_installation_point_len;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_installation_point_len
  CHECK ("installationPoint" IS NULL OR length(btrim("installationPoint")) BETWEEN 1 AND 200);

COMMENT ON COLUMN public.sales_order_lines."installationPoint" IS
  'ข้อความสาขา/จุดติดตั้งตามชีตของใบย้อนหลัง — ไม่ใช่รหัสโซน · TS ผูกโซนจริงในคิวงานเข้าใหม่ (มติข้อ 17 · mig 0360)';

-- ── 4) origin แก้ไม่ได้หลังเกิด ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_record_origin_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'origin_immutable: % %', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_record_origin_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_orders_origin_immutable_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_origin_immutable_trg
BEFORE UPDATE OF origin ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_record_origin_immutable();

DROP TRIGGER IF EXISTS sales_deals_origin_immutable_trg ON public.sales_deals;
CREATE TRIGGER sales_deals_origin_immutable_trg
BEFORE UPDATE OF origin ON public.sales_deals
FOR EACH ROW EXECUTE FUNCTION public.guard_record_origin_immutable();

-- ── 5) cache Actual + ยอดรออนุมัติของดีล — คัดจาก 0353 · เพิ่มแค่ origin = 'pipeline' ──
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
BEGIN
  SELECT COALESCE(sum("actualAmount"), 0),
         to_char(max(COALESCE("approvedAt" AT TIME ZONE 'Asia/Bangkok', "orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'approved' AND origin = 'pipeline';

  SELECT COALESCE(sum("actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders
  WHERE "dealId" = p_deal_id AND status = 'pending_approval' AND origin = 'pipeline';

  UPDATE public.sales_deals d SET
    "wonValue" = v_actual,
    metadata = (COALESCE(d.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount')
      || jsonb_build_object(
        'actualSource', 'sale_order',
        'wonMonth', v_won_month,
        'wonValueExVat', v_actual
      )
      || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
        'soPendingAmount', v_pending,
        'soPendingCount', v_pending_count
      ) ELSE '{}'::jsonb END,
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
BEGIN
  SELECT COALESCE(sum(so."actualAmount"), 0),
         to_char(max(COALESCE(so."approvedAt" AT TIME ZONE 'Asia/Bangkok', so."orderDate"::timestamp)), 'YYYY-MM')
    INTO v_actual, v_won_month
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'approved' AND so.origin = 'pipeline';

  SELECT COALESCE(sum(so."actualAmount"), 0), count(*)
    INTO v_pending, v_pending_count
  FROM public.sales_orders so
  WHERE so."dealId" = NEW.id AND so.status = 'pending_approval' AND so.origin = 'pipeline';

  NEW."wonValue" := v_actual;
  NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - 'soPendingAmount' - 'soPendingCount')
    || jsonb_build_object(
      'actualSource', 'sale_order',
      'wonMonth', v_won_month,
      'wonValueExVat', v_actual
    )
    || CASE WHEN v_pending_count > 0 THEN jsonb_build_object(
      'soPendingAmount', v_pending,
      'soPendingCount', v_pending_count
    ) ELSE '{}'::jsonb END;
  RETURN NEW;
END;
$$;

-- ── 6a) ตัวตรวจงวดของใบย้อนหลัง — ตัวเดียวทั้งตอนคีย์และตอนเพิ่มงวด ────────────
--  ตรวจเท่ากับ CHECK ของตาราง (0245 label/ยอด/วันที่ · 0320 ช่วงครอบ) ⇒ ข้อมูลชีตที่ผิดตายด้วยรหัสมีชื่อ
--  ไม่ใช่ 23514/22007 ดิบที่ route แปลเป็น 500 · คืนผลรวมยอดของทุกแถว
CREATE OR REPLACE FUNCTION public.historical_so_installments_total(p_rows jsonb)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows jsonb := COALESCE(p_rows, '[]'::jsonb);
  v_item jsonb;
  v_amount numeric;
  v_due date;
  v_from date;
  v_to date;
  v_sum numeric := 0;
BEGIN
  IF jsonb_typeof(v_rows) <> 'array' THEN RAISE EXCEPTION 'historical_so_installment_invalid'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'historical_so_installment_invalid'; END IF;
    -- งวดที่ฝ่ายขายคีย์ = รอบัญชียืนยันเสมอ · สถานะอื่นเป็นของขั้นแจ้งชำระ/บัญชี (canConfirmPayment)
    IF COALESCE(v_item->>'status', 'pending') <> 'pending' THEN
      RAISE EXCEPTION 'historical_so_installment_status_invalid';
    END IF;
    BEGIN
      v_amount := (v_item->>'amount')::numeric;
      v_due  := NULLIF(v_item->>'dueDate', '')::date;
      v_from := NULLIF(v_item->>'coversFrom', '')::date;
      v_to   := NULLIF(v_item->>'coversTo', '')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'historical_so_installment_invalid';
    END;
    IF v_amount IS NULL OR v_amount < 0 OR v_amount = 'NaN'::numeric
       OR length(btrim(COALESCE(v_item->>'label', ''))) NOT BETWEEN 1 AND 120
       OR v_due  NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
       OR v_from NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
       OR v_to   NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
       OR v_from > v_to THEN
      RAISE EXCEPTION 'historical_so_installment_invalid';
    END IF;
    v_sum := v_sum + v_amount;
  END LOOP;
  RETURN v_sum;
END;
$$;
REVOKE ALL ON FUNCTION public.historical_so_installments_total(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.historical_so_installments_total(jsonb) TO service_role;

-- ── 6b) ตัวเขียนทางเดียวของใบย้อนหลัง ────────────────────────────────────────
-- ⚠️ route ตรวจ AE (validateDealOwner — role อยู่ใน Supabase Auth ไม่อยู่ในฐาน) ส่ง ownerName/team ที่
--    server คืนมา และคำนวณเงิน/VAT ด้วยตัวตัดสินเดียวกับพรีวิว · ฟังก์ชันนี้ตรวจซ้ำทุกข้อที่ตรวจในฐานได้
--    ด้วยรหัส error มีชื่อ (AE ว่าง = historical_so_owner_required ก่อนแตะอะไรทั้งนั้น)
-- ⚠️ ห้ามใช้ตัวช่วย master_row_* กับ sales_orders/บรรทัด/งวด — ตัวนั้นทิ้งคีย์ที่ไม่มีคอลัมน์เงียบ ๆ
--    ลิสต์คอลัมน์เขียนตายตัว ⇒ คอลัมน์หาย = 42703 ดัง ๆ ไม่ใช่ข้อมูลหายเงียบ
--    (ดีลภาชนะใช้ตัวออกรหัส DL ซึ่งใช้ตัวช่วยนั้น ⇒ ตรวจ origin ซ้ำหลัง insert ที่ข้อ ⑩)
-- ⚠️ ไม่ประทับหลักฐานลายเซ็น/ฉบับตรึง · ไม่ตั้ง financeStatus · ไม่เรียกตัวหยุดยอดงวดของขั้นอนุมัติ — งวดหยุดยอดที่นี่เอง
CREATE OR REPLACE FUNCTION public.create_historical_sales_order(
  p_intake_key   text,
  p_intake_hash  text,
  p_actor_id     text,
  p_actor_name   text,
  p_actor_role   text,
  p_header       jsonb,
  p_lines        jsonb,
  p_installments jsonb DEFAULT '[]'::jsonb,
  p_new_deal     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id       text;
  v_existing       public.sales_orders%ROWTYPE;
  v_order          public.sales_orders%ROWTYPE;
  v_customer       public.customers%ROWTYPE;
  v_deal           public.sales_deals%ROWTYPE;
  v_deal_created   boolean := false;
  v_deal_raced     boolean := false;
  v_conflict       text;
  v_deal_width     integer;
  v_created        jsonb;
  v_item           jsonb;
  v_qty            numeric;
  v_unit_price     numeric;
  v_line_total     numeric;
  v_rounds         integer;
  v_customer_id    text := NULLIF(btrim(COALESCE(p_header->>'customerId', '')), '');
  v_owner_id       text := NULLIF(btrim(COALESCE(p_header->>'ownerId', '')), '');
  v_team           text := NULLIF(btrim(COALESCE(p_header->>'team', '')), '');
  v_notes          text := NULLIF(btrim(COALESCE(p_header->>'notes', '')), '');
  v_exempt_reason  text := NULLIF(btrim(COALESCE(p_header->>'paymentGateExemptReason', '')), '');
  v_installments   jsonb := COALESCE(p_installments, '[]'::jsonb);
  v_customer_name  text;
  v_order_date     date;
  v_subtotal       numeric;
  v_discount       numeric;
  v_vat            numeric;
  v_total          numeric;
  v_line_sum       numeric := 0;
  v_inst_sum       numeric;
  v_now timestamp;
  v_year text;
  v_seed integer := 0;
  v_pattern text;
  v_running_width integer;
  v_running_no integer;
  v_order_number text;
BEGIN
  -- ① ตัวตน + สิทธิ์ (literal ชุดเดียวกับ 0166 · canKeyHistoricalSalesOrder ฝั่ง JS) + AE บังคับ (คำตอบข้อ 1)
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_actor_required'; END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'historical_so_actor_forbidden';
  END IF;
  IF NULLIF(btrim(COALESCE(p_intake_key, '')), '') IS NULL THEN RAISE EXCEPTION 'historical_so_intake_key_required'; END IF;
  IF COALESCE(p_intake_hash, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'historical_so_intake_hash_invalid'; END IF;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'historical_so_customer_required'; END IF;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'historical_so_owner_required'; END IF;

  -- ② ล็อกรหัสการคีย์ก่อนทุกอย่าง — กดซ้ำ/สองแท็บเดินทีละคำขอ แม้ส่ง AE มาคนละคน
  PERFORM pg_advisory_xact_lock(hashtext('historical_so_key:' || p_intake_key));

  -- ③ ส่งซ้ำ = ได้ใบเดิม เฉพาะเมื่อคำขอเดิมทุกตัวอักษรและใบยังอนุมัติอยู่ · ไม่ออกเลขใหม่
  v_order_id := 'SOR-H' || substr(md5(p_intake_key), 1, 16);
  SELECT * INTO v_existing FROM public.sales_orders WHERE id = v_order_id;
  IF FOUND THEN
    IF v_existing.origin <> 'historical'
       OR v_existing."customerId" IS DISTINCT FROM v_customer_id
       OR v_existing."historicalIntakeHash" IS DISTINCT FROM p_intake_hash
       OR v_existing.status <> 'approved' THEN
      RAISE EXCEPTION 'historical_so_intake_key_conflict';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'order', to_jsonb(v_existing),
      'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder")
                         FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order_id), '[]'::jsonb),
      'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                                FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order_id), '[]'::jsonb),
      'deal', (SELECT to_jsonb(d) FROM public.sales_deals d WHERE d.id = v_existing."dealId"),
      'dealCreated', false
    );
  END IF;

  -- ④ ล็อกคู่ (ลูกค้า × AE) — ดีลภาชนะไม่ซ้อน (UNIQUE ข้อ 1 เป็นด่านสุดท้าย)
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

  -- ⑥ หัวใบ: วันที่ใบ = วันเริ่มสัญญาจริง (ข้อ 5) · ห้ามอนาคต (เวลาไทย) · เงินสมดุล
  BEGIN
    v_order_date := NULLIF(p_header->>'orderDate', '')::date;
    v_subtotal := COALESCE((p_header->>'subtotal')::numeric, 0);
    v_discount := COALESCE((p_header->>'discountAmount')::numeric, 0);
    v_vat      := COALESCE((p_header->>'vatAmount')::numeric, 0);
    v_total    := COALESCE((p_header->>'totalAmount')::numeric, 0);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'historical_so_header_invalid';
  END;
  IF v_order_date IS NULL OR v_order_date < DATE '2000-01-01'
     OR v_order_date > timezone('Asia/Bangkok', now())::date THEN
    RAISE EXCEPTION 'historical_so_order_date_invalid';
  END IF;
  IF v_subtotal < 0 OR v_discount < 0 OR v_vat < 0 OR v_total < 0
     OR 'NaN'::numeric IN (v_subtotal, v_discount, v_vat, v_total) THEN
    RAISE EXCEPTION 'historical_so_money_invalid';
  END IF;
  IF abs(v_subtotal - v_discount + v_vat - v_total) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;

  -- ⑦ บรรทัด = จุดติดตั้ง (ข้อ 8) · zoneId บนบรรทัด = ผิดข้อ 17 (TS ผูกโซน ไม่ใช่ฝ่ายขาย)
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'historical_so_lines_required';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR v_item ? 'zoneId'
       OR length(btrim(COALESCE(v_item->>'installationPoint', ''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'historical_so_line_invalid';
    END IF;
    BEGIN
      v_qty        := (v_item->>'qty')::numeric;
      v_unit_price := (v_item->>'unitPrice')::numeric;
      v_line_total := (v_item->>'lineTotal')::numeric;
      v_rounds     := NULLIF(v_item->>'serviceRounds', '')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'historical_so_line_invalid';
    END;
    IF v_qty IS NULL OR v_qty <= 0 OR v_unit_price IS NULL OR v_unit_price < 0
       OR v_line_total IS NULL OR v_line_total < 0
       OR 'NaN'::numeric IN (v_qty, v_unit_price, v_line_total)
       OR v_rounds <= 0 THEN
      RAISE EXCEPTION 'historical_so_line_invalid';
    END IF;
    v_line_sum := v_line_sum + v_line_total;
  END LOOP;
  IF abs(v_line_sum - v_subtotal) > 0.01 THEN RAISE EXCEPTION 'historical_so_money_mismatch'; END IF;

  -- ⑧ งวด: ตัวตรวจกลาง (pending เท่านั้น · เท่ากับ CHECK ของตาราง) · ผลรวมไม่เกินยอดใบ
  v_inst_sum := public.historical_so_installments_total(v_installments);
  IF v_inst_sum > v_total + 0.01 THEN RAISE EXCEPTION 'historical_so_installment_over_total'; END IF;

  -- ⑨ ใบยอด 0 (ข้อ 11): ต้องยกเว้นด่านเงิน + ต้องมีหมายเหตุ · เหตุผลยกเว้น 10–500 (เท่ากับ CHECK ข้อ 2)
  IF v_total = 0 AND v_exempt_reason IS NULL THEN RAISE EXCEPTION 'historical_so_zero_value_needs_exemption'; END IF;
  IF v_total = 0 AND v_notes IS NULL THEN RAISE EXCEPTION 'historical_so_zero_value_note_required'; END IF;
  IF v_exempt_reason IS NOT NULL AND length(v_exempt_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'historical_so_exempt_reason_invalid';
  END IF;

  -- ⑩ ดีลภาชนะของคู่ (ลูกค้า × AE): ผูกได้เฉพาะ origin historical + won + SERVICE + ไม่มีโครงการ (ข้อ 20)
  SELECT * INTO v_deal FROM public.sales_deals
   WHERE origin = 'historical'
     AND "customerId" = v_customer_id
     AND "ownerId" = v_owner_id
   FOR UPDATE;
  IF NOT FOUND THEN
    -- ทีมตามดีล = ทีมของ AE ที่ route ได้จาก validateDealOwner (CHECK ข้อ 1 บังคับ team)
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
    --    ระหว่าง SELECT ข้างบนกับ insert นี้ (SELECT เห็นแถวนั้นยังเป็น AE เดิม ⇒ ไม่รอ ไม่ล็อก)
    --    ⇒ insert รอแถวนั้น commit แล้วชน sales_deals_historical_container_uk
    --    ⇒ ห้ามปล่อย 23505 ออกไป: ชื่อนี้คือ 409 "มีดีลของ AE คนนั้นอยู่แล้ว" ของการย้ายเจ้าของ = บอกผู้คีย์
    --       เรื่องที่เขาไม่ได้ทำ ทั้งที่กดใหม่ครั้งเดียวก็ผ่าน ⇒ หาใหม่ด้วย snapshot ใหม่แล้วผูกดีลที่ย้ายมา
    --    · unique_violation ตัวอื่น (id/รหัสชน) โยนต่อตามเดิม · ตัวนับรหัส DL ถอยคืนพร้อม subtransaction
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
      -- ถูกย้ายออกไปอีกทอดก่อนล็อกทัน (หรือทรานแซกชันไม่ใช่ READ COMMITTED) ⇒ ชื่อเฉพาะ
      -- route POST แปลเป็น "มีการย้ายเจ้าของดีลของลูกค้านี้พร้อมกัน กดบันทึกอีกครั้ง" — ไม่ใช่ 409 ของการย้ายเจ้าของ
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
  -- ดีลที่ผูก (เจอตั้งแต่แรก หรือย้ายมาแข่ง) ต้องยังเป็นภาชนะที่ใช้ได้ · ดีลที่เพิ่งสร้างผ่าน CHECK ข้อ 1 มาแล้ว
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

  -- ⑫ หัวใบ — เกิดเป็นอนุมัติแล้ว (ข้อ 6) · approvedAt = เวลาคีย์
  --    ownerId/ownerName: trigger snapshot_sales_order_owner (0294) ก๊อปจากดีลภาชนะให้เอง (INSERT ที่ approved)
  INSERT INTO public.sales_orders (
    id, "orderNumber", origin, "quotationId", "dealId", "projectId", "customerId",
    "customerName", "customerNameEn", status, "orderDate",
    subtotal, "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes, "docLanguage",
    "historicalQuoteRef", "historicalExpressRef", "historicalInvoiceRef", "historicalIntakeHash",
    "approvalMode", "approvedAt", "approvedBy", "approvedByName", "financeStatus",
    "paymentGateExemptAt", "paymentGateExemptById", "paymentGateExemptByName", "paymentGateExemptReason",
    "confirmAttachments", metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  ) VALUES (
    v_order_id, v_order_number, 'historical', NULL, v_deal.id, NULL, v_customer.id,
    v_customer_name, v_customer."nameEn", 'approved', v_order_date,
    v_subtotal, v_discount, v_vat, v_total, GREATEST(0, v_total - v_vat), v_notes,
    CASE WHEN p_header->>'docLanguage' IN ('th', 'en') THEN p_header->>'docLanguage' ELSE 'th' END,
    NULLIF(btrim(COALESCE(p_header->>'historicalQuoteRef', '')), ''),
    NULLIF(btrim(COALESCE(p_header->>'historicalExpressRef', '')), ''),
    NULLIF(btrim(COALESCE(p_header->>'historicalInvoiceRef', '')), ''),
    p_intake_hash,
    'standard', now(), p_actor_id, p_actor_name, NULL,
    CASE WHEN v_exempt_reason IS NULL THEN NULL ELSE now() END,
    CASE WHEN v_exempt_reason IS NULL THEN NULL ELSE p_actor_id END,
    CASE WHEN v_exempt_reason IS NULL THEN NULL ELSE p_actor_name END,
    v_exempt_reason,
    '[]'::jsonb, '{}'::jsonb, p_actor_id, p_actor_name, now(), now()
  )
  RETURNING * INTO v_order;

  -- ⑬ บรรทัด (ค่าผ่านตัวตรวจข้อ ⑦ แล้ว — cast ปลอดภัย)
  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description, "installationPoint",
    qty, "unitPrice", unit, "discountType", "discountValue", "discountAmount", "lineTotal",
    "serviceRounds", "sortOrder", metadata
  )
  SELECT
    'SOL-' || md5(v_order_id || ':' || e.ord), v_order_id, NULL,
    NULLIF(e.l->>'productId', ''), NULLIF(e.l->>'fgCode', ''), NULLIF(e.l->>'description', ''),
    btrim(e.l->>'installationPoint'),
    (e.l->>'qty')::numeric, (e.l->>'unitPrice')::numeric, COALESCE(NULLIF(e.l->>'unit', ''), 'ชิ้น'),
    NULL, 0, 0, (e.l->>'lineTotal')::numeric,
    NULLIF(e.l->>'serviceRounds', '')::integer, (e.ord - 1)::integer, '{}'::jsonb
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS e(l, ord);

  -- ⑭ งวด: pending + หยุดยอดทันที (เข้าทะเบียนการชำระของบัญชี · แจ้งชำระได้ · บัญชียืนยันเอง)
  INSERT INTO public.sales_order_installments (
    id, "salesOrderId", seq, label, percent, amount, "dueDate", "coversFrom", "coversTo",
    status, evidence, "frozenAt", "createdById", "createdByName", "createdAt", "updatedAt"
  )
  SELECT
    'SOI-' || md5(v_order_id || ':' || e.ord), v_order_id, e.ord::integer,
    btrim(e.i->>'label'),
    CASE WHEN v_total > 0 THEN LEAST(100, round((e.i->>'amount')::numeric / v_total * 100, 2)) ELSE 0 END,
    (e.i->>'amount')::numeric,
    NULLIF(e.i->>'dueDate', '')::date, NULLIF(e.i->>'coversFrom', '')::date, NULLIF(e.i->>'coversTo', '')::date,
    'pending', '[]'::jsonb, now(), p_actor_id, p_actor_name, now(), now()
  FROM jsonb_array_elements(v_installments) WITH ORDINALITY AS e(i, ord);

  RETURN jsonb_build_object(
    'replayed', false,
    'order', to_jsonb(v_order),
    'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."sortOrder")
                       FROM public.sales_order_lines l WHERE l."salesOrderId" = v_order_id), '[]'::jsonb),
    'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.seq)
                              FROM public.sales_order_installments i WHERE i."salesOrderId" = v_order_id), '[]'::jsonb),
    'deal', (SELECT to_jsonb(d) FROM public.sales_deals d WHERE d.id = v_deal.id),
    'dealCreated', v_deal_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_historical_sales_order(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_historical_sales_order(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb)
  TO service_role;

-- ── 6c) เพิ่มงวดทีหลัง (คีย์เท่าที่รู้ · ข้อ 13) — ล็อกหัวใบ ผลรวมเทียบของจริงล่าสุดเสมอ ─────
CREATE OR REPLACE FUNCTION public.append_historical_installments(
  p_order_id   text,
  p_actor_id   text,
  p_actor_name text,
  p_actor_role text,
  p_rows       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order    public.sales_orders%ROWTYPE;
  v_new      numeric;
  v_existing numeric;
  v_last_seq integer;
  v_out      jsonb;
BEGIN
  IF NULLIF(btrim(COALESCE(p_actor_id, '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_actor_required'; END IF;
  IF COALESCE(p_actor_role, '') NOT IN ('ae_supervisor', 'admin') THEN
    RAISE EXCEPTION 'historical_so_actor_forbidden';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'historical_so_installment_invalid';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sales_order_not_found'; END IF;
  IF v_order.origin <> 'historical' OR v_order.status <> 'approved' THEN
    RAISE EXCEPTION 'historical_so_installment_append_state_invalid';
  END IF;

  v_new := public.historical_so_installments_total(p_rows);
  -- งวดเดิมทุกสถานะนับรวม — งวดที่บัญชีตีกลับยังเป็นยอดที่ต้องเก็บ
  SELECT COALESCE(sum(amount), 0), COALESCE(max(seq), 0) INTO v_existing, v_last_seq
  FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;
  IF v_existing + v_new > v_order."totalAmount" + 0.01 THEN
    RAISE EXCEPTION 'historical_so_installment_over_total';
  END IF;

  WITH ins AS (
    INSERT INTO public.sales_order_installments (
      id, "salesOrderId", seq, label, percent, amount, "dueDate", "coversFrom", "coversTo",
      status, evidence, "frozenAt", "createdById", "createdByName", "createdAt", "updatedAt"
    )
    SELECT
      'SOI-' || md5(p_order_id || ':' || (v_last_seq + e.ord)), p_order_id, (v_last_seq + e.ord)::integer,
      btrim(e.i->>'label'),
      CASE WHEN v_order."totalAmount" > 0
           THEN LEAST(100, round((e.i->>'amount')::numeric / v_order."totalAmount" * 100, 2)) ELSE 0 END,
      (e.i->>'amount')::numeric,
      NULLIF(e.i->>'dueDate', '')::date, NULLIF(e.i->>'coversFrom', '')::date, NULLIF(e.i->>'coversTo', '')::date,
      'pending', '[]'::jsonb, now(), p_actor_id, p_actor_name, now(), now()
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(i, ord)
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ins) ORDER BY ins.seq), '[]'::jsonb) INTO v_out FROM ins;

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'installments', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.append_historical_installments(text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_historical_installments(text, text, text, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ถอยกลับ (ใช้ได้เฉพาะตอนยังไม่มีแถว origin = 'historical' เลย) ───────────────
--   DROP FUNCTION ×3 ของข้อ 6 · รันข้อ 1–2 ของ 0353 ซ้ำ (คืนตัวคำนวณเดิม) · ALTER quotationId SET NOT NULL
--   · DROP triggers/function ข้อ 4 · DROP CONSTRAINT 8 ตัว · DROP INDEX · DROP COLUMN ทั้งหมดของไฟล์นี้
