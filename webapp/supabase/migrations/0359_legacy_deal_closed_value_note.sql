-- ============================================================
--  Migration 0359: ยอดที่พิมพ์ในสวิตช์ "ดีลเก่า" ย้ายไปเป็นบันทึก "ยอดปิดในระบบเดิม"
--                  (มติผู้ใช้ 2026-09-14)
--
--  🐞 **ยอดที่พิมพ์ไม่เคยเข้า Actual แม้แต่วันเดียว** — ฟอร์มสร้างดีล (สวิตช์ดีลเก่า + ขั้น Won)
--    ส่งยอดไปเป็น wonValue + ค่าที่มาของ Actual แบบ "legacy" แต่ trigger
--    `sales_deals_enforce_so_actual_trg` (0110 · ตัวฟังก์ชันล่าสุดอยู่ใน 0353) คิด wonValue ใหม่
--    จาก SO ที่อนุมัติแล้วทุกครั้งที่ INSERT/UPDATE ⇒ ยอดเป็น 0 ตั้งแต่ก่อนแถวลงฐาน
--    · ยอดที่พิมพ์ยังค้างอยู่ใน projectValue ⇒ ถูกนับเป็น FC Total (dashboardMetrics · projectRollup)
--      ส่วนต่าง FC ติดลบทั้งก้อน และโผล่ในรายงาน FC Excel ของฝ่ายวางแผนผลิต
--    · prod 2026-09-14: 15 ใบ รวม 1,956,850 บาท · ไม่มีใบเสนอราคาหรือ SO เลยสักใบ
--      (ดีลที่สร้างเป็น Won แล้วออกใบเสนอราคา/SO ไม่ได้อีก)
--
--  ⭐ **มติ: Actual มาจาก SO ที่อนุมัติแล้วเท่านั้น** — trigger ถูกแล้ว ไฟล์นี้ไม่แตะ trigger
--    ยอดที่พิมพ์ย้ายไปเก็บเป็นบันทึกแบบอ่านอย่างเดียวบนหน้าดีล (metadata สองคีย์)
--      legacyClosedValue  number  ยอดที่พิมพ์ตอนสร้าง (= projectValue ณ 14/09)
--      legacyClosedDate   text    YYYY-MM-DD = วันที่ปิด (confirmedAt เวลาไทย)
--    หน้าดีลแสดงว่า "ยอดปิดในระบบเดิม ฿X · ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC"
--    · สองคีย์นี้เขียนได้จากไฟล์นี้ที่เดียว — API ถอดทิ้งถ้า client ส่งมา (POST/PATCH ·
--      SERVER_ONLY_DEAL_METADATA_KEYS ใน lib/sales/legacyDealSwitch.js)
--    · enforce รวม metadata ด้วย `||` ไม่ลบคีย์อื่น ⇒ บันทึกอยู่รอดทุกการเขียนดีล
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) ทั้ง 15 ใบ: เขียนบันทึกลง metadata — ตัวเลขไม่เปลี่ยน
--  2) บล็อก A (4 ใบ · 311,500 · endDate ผ่านไปแล้ว): ล้างยอดที่ยังนับเป็น FC
--     projectValue = 0 · forecastManualValue = 0 · แถวมูลค่ารายหมวด unitPrice/amount = 0
--     (FC Total/ส่วนต่างอ่าน projectValue · รายงาน FC Excel ข้ามดีลที่ projectValue = 0 ·
--      forecastManualValue ล้างด้วยกันไม่ให้ทางไหนดึงยอดกลับมา · แถวรายหมวดล้างให้ผลรวมตรงกับดีล)
--     + ต่อแถวประวัติ FC (sales_deal_forecasts) และเธรดดีล kind 'forecast'
--       เหมือนที่ PATCH ของแอปทำเมื่อมูลค่าเปลี่ยน (สองตารางนี้ไม่มีตัวเลข FC ตัวไหนอ่าน)
--  3) บล็อก B (11 ใบ · 1,645,350): **ยังไม่ล้าง** — endDate (แกนเดือนของรายงาน FC Excel ·
--     forecastMonthOfDeal) ตั้งแต่ 14/09/2026 ขึ้นไป อาจยังผลิตจริงอยู่ ⇒ ให้เจ้าของยืนยันก่อน
--     คำสั่งอยู่ท้ายไฟล์ในคอมเมนต์ (เป็นธุรกรรมแยก) · ระหว่างรอ หน้าดีลบอกว่ายอดยังอยู่ใน FC
--
--  ⛔ ไม่แตะ: DL-26080394 (มี SO อนุมัติแล้ว) · ดีลที่ยังไม่ Won · ดีลเก่าที่พิมพ์ยอด 0
--     · wonValue / actualSource / wonMonth / stage · sales_history · แถวประวัติ FC เดิม
--  ⛔ ไม่วนทุกดีล (บทเรียนจาก 0279) — ทุกคำสั่ง join กับรายชื่อ id ที่เขียนไว้ในไฟล์นี้เท่านั้น
--
--  🛡️ ด่านรายแถว: id + รหัสดีลตรงกัน · stage='won' · metadata.legacy=true · ไม่มี SO อนุมัติ
--     · ไม่มีใบเสนอราคา · projectValue และวันที่ปิดตรงกับที่อ่านจาก prod วันที่ 14/09
--     ⇒ ถ้าใบไหนข้อมูลเปลี่ยนไป **ทั้งไฟล์ถูกยกเลิก** (RAISE EXCEPTION) ไม่มีการเขียนครึ่ง ๆ แล้วเงียบ
--     · ยกเว้นใบที่ **ถูกลบไปแล้ว** (เจ้าของอาจลบ/ย้ายสายระหว่างรอรัน — มติข้อ 3 ยังค้าง): ไม่มีอะไรให้บันทึก
--       หรือล้าง ⇒ ข้ามใบนั้น ไม่ยกเลิกทั้งไฟล์ · ด่านนับเทียบกับ "ใบในรายชื่อที่ยังอยู่" แทนเลข 15/4 ตายตัว
--       และประกาศรหัสที่ข้ามด้วย RAISE NOTICE (ไม่ข้ามเงียบ) · ห้ามแก้ VALUES เพื่อเอาใบที่ถูกลบออก
--       · ใบที่รหัสเปลี่ยน (id เดิมแต่ code ไม่ตรง) ยังนับว่า "ยังอยู่" ⇒ ยกเลิกทั้งไฟล์เหมือนเดิม
--
--  ✅ trigger ที่ทำงาน: ข้อ 1 เขียน metadata ⇒ enforce ทำงาน แต่ได้ค่าเดิมทุกคีย์
--     (ไม่มี SO ⇒ wonValue 0 · actualSource 'sale_order' · wonMonth null · wonValueExVat 0)
--     ข้อ 2 เขียนแค่ projectValue/forecastManualValue/updatedAt ⇒ enforce ไม่ทำงาน
--     ตารางอื่นที่เขียนไม่มี trigger · แจ้งเตือนกระดิ่งมาจากโค้ดแอป ไม่ใช่จากฐาน ⇒ ไม่มีแจ้งเตือนหลุด
--  ✅ ไม่ขึ้นกับ 0357/0358 — รันก่อนหรือหลังก็ได้ (ดีลกลุ่มนี้ไม่มี SO)
--
--  ⚠️ ค่าเดิมทุกแถวถูกคัดลอกลง audit_logs.before ก่อนแก้ (ระบบนี้ไม่มีถังขยะ)
--  🛑 **ให้รันหลัง deploy** — ไฟล์นี้ไม่เปลี่ยนสคีมา รันก่อนก็ไม่พัง แต่ช่วงก่อน deploy
--     หน้าดีลยังไม่แสดงบันทึก ⇒ ยอดของบล็อก A หายไปจากหน้าดีลโดยไม่มีคำอธิบาย
--     และฟอร์มเก่ายังสร้างดีลเก่า Won พร้อมยอดได้อยู่ (ใบใหม่ไม่อยู่ในรายชื่อนี้ — ข้อตรวจ V6 จับได้)
--  ✅ รันซ้ำได้ — รอบที่สองไม่เจอแถวที่เข้าเงื่อนไข (ไม่มีแถวเปลี่ยน · audit_logs ไม่เพิ่ม)
--  ⚠️ รันมือบน Supabase SQL Editor · ลองก่อนได้: เปลี่ยน COMMIT; ท้ายข้อ 2 เป็นสองคำสั่งนี้
--     SELECT (SELECT count(*) FROM _m0359_note) AS note, (SELECT count(*) FROM _m0359_zero) AS zero; ROLLBACK;
--     (ตัวเลขสองตัวอยู่ในแถวผลลัพธ์เดียวของ SELECT นี้ · ครั้งแรกคาด note 15 · zero 4 · รอบซ้ำคาด 0 · 0
--      · ถ้ามีใบถูกลบไปแล้ว ตัวเลขลดลงใบละ 1 · ถ้าข้อมูลไม่ครบ DO block จะ RAISE ก่อนถึงบรรทัดนี้
--      ⇒ ลองรันจบโดยไม่มี error ก็ยืนยันว่าด่านผ่านแล้ว · ROLLBACK ⇒ ไม่มีอะไรถูกเขียน)
--
--  ตรวจก่อนรัน (ไม่บังคับ) — trigger ที่มีจริงบนฐาน (ใน git มีแค่ sales_deals_enforce_so_actual_trg):
--    SELECT tgrelid::regclass, tgname FROM pg_trigger
--     WHERE NOT tgisinternal AND tgrelid IN ('public.sales_deals'::regclass,
--       'public.sales_deal_value_items'::regclass, 'public.sales_deal_forecasts'::regclass,
--       'public.entity_updates'::regclass, 'public.audit_logs'::regclass);
-- ============================================================

BEGIN;

/* ── 0) รายชื่อ 15 ใบ — อ่านจาก prod วันที่ 2026-09-14 ─────────────────────────
   closed_value = projectValue = forecastManualValue = ผลรวมแถวรายหมวด (ถ้ามี)
   closed_date  = confirmedAt เวลาไทย
   A = endDate < 2026-09-14 (ล้างในไฟล์นี้) · B = endDate ≥ 2026-09-14 (รอเจ้าของยืนยัน) */
CREATE TEMP TABLE _m0359_list (
  id           text    PRIMARY KEY,
  code         text    NOT NULL,
  closed_value numeric NOT NULL CHECK (closed_value > 0),
  closed_date  date    NOT NULL,
  block        text    NOT NULL CHECK (block IN ('A', 'B'))
) ON COMMIT DROP;

INSERT INTO _m0359_list (id, code, closed_value, closed_date, block) VALUES
  -- บล็อก A · endDate ผ่านไปแล้ว
  ('DEAL-msmq1f4i8jdh',  'DL-26080119',  204000, DATE '2026-05-15', 'A'),  -- Sunichacha · end 2026-08-31
  ('DEAL-mso2whm714hu',  'DL-26080143',   17500, DATE '2026-08-02', 'A'),  -- Sunichacha · end 2026-08-31
  ('DEAL-mtclsh5v11135', 'DL-26080384',   60000, DATE '2026-08-28', 'A'),  -- Kamonrat · end 2026-08-28
  ('DEAL-mtclxp1c1y5',   'DL-26080385',   30000, DATE '2026-08-28', 'A'),  -- Kamonrat · end 2026-08-28
  -- บล็อก B · endDate ตั้งแต่ 2026-09-14
  ('DEAL-mtjj5bkd314k8', 'DL-260900424', 100000, DATE '2026-03-31', 'B'),  -- Sunichacha · end 2026-09-30
  ('DEAL-mt8660q31616',  'DL-26080340',  283350, DATE '2025-11-17', 'B'),  -- Sunichacha · end 2026-10-30
  ('DEAL-mtiaoz3i115l1', 'DL-26090005',  120000, DATE '2026-03-16', 'B'),  -- Sunichacha · end 2026-10-30
  ('DEAL-msqy1mna15ve',  'DL-26080160',  600000, DATE '2026-07-15', 'B'),  -- Sunichacha · end 2026-10-30
  ('DEAL-mtjjdmno29qr',  'DL-260900425', 210000, DATE '2026-02-27', 'B'),  -- Sunichacha · end 2026-12-31
  ('DEAL-mts2kiwy3rne',  'DL-260900461',  60000, DATE '2026-05-07', 'B'),  -- Threerapong · end 2026-10-31
  ('DEAL-mts2m2z4739k',  'DL-260900462',  20000, DATE '2026-05-17', 'B'),  -- Threerapong · end 2026-10-31
  ('DEAL-mt0zkjhh1a6q',  'DL-26080238',  180000, DATE '2026-05-18', 'B'),  -- Threerapong · end 2026-10-31
  ('DEAL-mt0yzt6d419so', 'DL-26080236',   30000, DATE '2026-07-31', 'B'),  -- Threerapong · end 2026-10-31 · ไม่มีลูกค้า
  ('DEAL-mtwuygxk1ftc',  'DL-260900491',  12000, DATE '2026-09-11', 'B'),  -- Supisara · end 2026-10-30
  ('DEAL-mu10cfma1ect',  'DL-260900501',  30000, DATE '2026-09-14', 'B');  -- Supisara · end 2026-10-30

/* ── 1) บันทึก "ยอดปิดในระบบเดิม" — ทั้ง 15 ใบ ─────────────────────────────── */
CREATE TEMP TABLE _m0359_note ON COMMIT DROP AS
SELECT d.*
FROM public.sales_deals d
JOIN _m0359_list l ON l.id = d.id AND l.code = d.code
WHERE d.stage = 'won'
  AND d.metadata->>'legacy' = 'true'
  AND NOT (d.metadata ? 'legacyClosedValue')
  AND d."projectValue" = l.closed_value
  AND (d."confirmedAt" AT TIME ZONE 'Asia/Bangkok')::date = l.closed_date
  AND NOT EXISTS (SELECT 1 FROM public.sales_orders so
                   WHERE so."dealId" = d.id AND so.status = 'approved')
  AND NOT EXISTS (SELECT 1 FROM public.quotations q WHERE q."dealId" = d.id);

/* ครบหรือไม่ทำเลย — ใบในรายชื่อที่ยังอยู่ (15 ถ้าไม่มีใบถูกลบ) ต้อง "เข้าเงื่อนไข" หรือ "มีบันทึกแล้ว"
   ครบทุกใบ · นับ "ยังอยู่" ด้วย id อย่างเดียว ⇒ ใบที่รหัสเปลี่ยนยังถูกนับ แล้วไม่เข้า _m0359_note ⇒ ยกเลิก */
DO $$
DECLARE v_targets integer; v_done integer; v_live integer; v_gone text;
BEGIN
  SELECT count(*) INTO v_targets FROM _m0359_note;
  SELECT count(*) INTO v_done
    FROM public.sales_deals d JOIN _m0359_list l ON l.id = d.id
   WHERE d.metadata ? 'legacyClosedValue';
  SELECT count(*) INTO v_live
    FROM _m0359_list l JOIN public.sales_deals d ON d.id = l.id;
  SELECT string_agg(l.code, ', ' ORDER BY l.code) INTO v_gone
    FROM _m0359_list l
   WHERE NOT EXISTS (SELECT 1 FROM public.sales_deals d WHERE d.id = l.id);
  IF v_gone IS NOT NULL THEN
    RAISE NOTICE 'mig 0359: ข้ามดีลที่ถูกลบไปแล้ว (ไม่มีอะไรให้บันทึก): %', v_gone;
  END IF;
  IF v_targets + v_done <> v_live THEN
    RAISE EXCEPTION 'mig 0359: เข้าเงื่อนไข % ใบ + มีบันทึกแล้ว % ใบ ไม่ครบ % ใบที่ยังอยู่ — ข้อมูลเปลี่ยนไปจาก 14/09/2026 ยังไม่ได้เขียนอะไร (ดูข้อตรวจ V1)', v_targets, v_done, v_live;
  END IF;
END $$;

-- ร่องรอยก่อนแก้
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT
  'migration-0359', 'ระบบ (mig 0359)', 'system', 'update', 'sales_deal', t.id,
  'บันทึกยอดปิดในระบบเดิมของ ' || t.code || ' ลง metadata — ไม่นับ Actual และไม่เข้า FC (มติ 2026-09-14)',
  '["metadata"]'::jsonb,
  to_jsonb(t), now()
FROM _m0359_note t;

UPDATE public.sales_deals d SET
  metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
    'legacyClosedValue', l.closed_value,
    'legacyClosedDate',  to_char(l.closed_date, 'YYYY-MM-DD')
  ),
  "updatedAt" = now()
FROM _m0359_note t
JOIN _m0359_list l ON l.id = t.id
WHERE d.id = t.id;

/* ── 2) บล็อก A — ล้างยอดที่ยังนับเป็น FC (4 ใบ · 311,500) ─────────────────── */
CREATE TEMP TABLE _m0359_zero ON COMMIT DROP AS
SELECT d.*
FROM public.sales_deals d
JOIN _m0359_list l ON l.id = d.id AND l.code = d.code AND l.block = 'A'
WHERE d.stage = 'won'
  AND d.metadata->>'legacy' = 'true'
  -- ต้องย้ายยอดไปอยู่ในบันทึกแล้วเท่านั้นถึงจะล้างได้ (ข้อ 1 ในธุรกรรมเดียวกัน)
  AND (d.metadata->>'legacyClosedValue')::numeric = l.closed_value
  AND d."endDate" < DATE '2026-09-14'
  AND d."forecastSource" = 'manual'
  AND d."projectValue" IN (l.closed_value, 0)
  AND d."forecastManualValue" IN (l.closed_value, 0)
  AND (d."projectValue" <> 0 OR d."forecastManualValue" <> 0
       OR EXISTS (SELECT 1 FROM public.sales_deal_value_items i
                   WHERE i."dealId" = d.id AND (i.amount <> 0 OR i."unitPrice" <> 0)))
  AND NOT EXISTS (SELECT 1 FROM public.sales_orders so
                   WHERE so."dealId" = d.id AND so.status = 'approved')
  AND NOT EXISTS (SELECT 1 FROM public.quotations q WHERE q."dealId" = d.id);

/* บล็อก A ต้องครบทุกใบที่ยังอยู่ (4 ถ้าไม่มีใบถูกลบ · ใบที่ถูกลบประกาศไว้แล้วในข้อ 1) */
DO $$
DECLARE v_targets integer; v_done integer; v_live integer;
BEGIN
  SELECT count(*) INTO v_targets FROM _m0359_zero;
  SELECT count(*) INTO v_done
    FROM public.sales_deals d JOIN _m0359_list l ON l.id = d.id AND l.block = 'A'
   WHERE d.metadata ? 'legacyClosedValue'
     AND d."projectValue" = 0 AND d."forecastManualValue" = 0
     AND NOT EXISTS (SELECT 1 FROM public.sales_deal_value_items i
                      WHERE i."dealId" = d.id AND (i.amount <> 0 OR i."unitPrice" <> 0));
  SELECT count(*) INTO v_live
    FROM _m0359_list l JOIN public.sales_deals d ON d.id = l.id AND l.block = 'A';
  IF v_targets + v_done <> v_live THEN
    RAISE EXCEPTION 'mig 0359: บล็อก A เข้าเงื่อนไข % ใบ + ล้างแล้ว % ใบ ไม่ครบ % ใบที่ยังอยู่ — ยกเลิกทั้งธุรกรรม (ดูข้อตรวจ V1/V2)', v_targets, v_done, v_live;
  END IF;
END $$;

CREATE TEMP TABLE _m0359_zero_items ON COMMIT DROP AS
SELECT i.*, z.code AS "dealCode"
FROM public.sales_deal_value_items i
JOIN _m0359_zero z ON z.id = i."dealId"
WHERE i.amount <> 0 OR i."unitPrice" <> 0;

-- ร่องรอยก่อนแก้ (ดีล · แถวมูลค่า)
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT
  'migration-0359', 'ระบบ (mig 0359)', 'system', 'update', 'sales_deal', z.id,
  'ล้างมูลค่า FC ของ ' || z.code || ' เป็น 0 — ยอดย้ายไปอยู่ในบันทึกยอดปิดในระบบเดิมแล้ว (มติ 2026-09-14)',
  '["projectValue","forecastManualValue"]'::jsonb,
  to_jsonb(z), now()
FROM _m0359_zero z;

INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT
  'migration-0359', 'ระบบ (mig 0359)', 'system', 'update', 'sales_deal_value_item', t.id,
  'ล้างราคาแถวมูลค่ารายหมวดของ ' || t."dealCode" || ' เป็น 0 (มติ 2026-09-14)',
  '["unitPrice","amount"]'::jsonb,
  to_jsonb(t) - 'dealCode', now()
FROM _m0359_zero_items t;

UPDATE public.sales_deal_value_items i SET
  "unitPrice" = 0,
  amount      = 0,
  "updatedAt" = now()
FROM _m0359_zero_items t
WHERE i.id = t.id;

-- ⚠️ ห้ามเติม metadata/stage/wonValue ในคำสั่งนี้ — enforce จะทำงานโดยไม่จำเป็น
UPDATE public.sales_deals d SET
  "projectValue"        = 0,
  "forecastManualValue" = 0,
  "updatedAt"           = now()
FROM _m0359_zero z
WHERE d.id = z.id;

-- ประวัติ FC + เธรดดีล — ทำเหมือนที่ PATCH ของแอปทำเมื่อมูลค่าเปลี่ยน (id คงที่ ⇒ รันซ้ำไม่ซ้ำ)
INSERT INTO public.sales_deal_forecasts
  (id, "dealId", "forecastMonth", "forecastAmount", probability, source, "createdBy", "createdByName")
SELECT
  'DFC-mig0359-' || z.id, z.id,
  COALESCE(z."forecastMonth", to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')),
  0, z.probability, 'mig-0359', 'migration-0359', 'ระบบ (mig 0359)'
FROM _m0359_zero z
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entity_updates
  (id, "entityType", "entityId", kind, body, meta, "authorName", "createdAt")
SELECT
  'EUP-mig0359-' || z.id, 'deal', z.id, 'forecast',
  'มูลค่า ฿' || to_char(z."projectValue", 'FM999,999,999,990.00') || ' → ฿0.00 · เป็นยอดปิดในระบบเดิม ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC (มติ 2026-09-14)',
  jsonb_build_object('projectValue', jsonb_build_object('from', z."projectValue", 'to', 0), 'migration', '0359'),
  'ระบบ (mig 0359)', now()
FROM _m0359_zero z
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
--  บล็อก B — รันหลังเจ้าของยืนยันว่า "ไม่ได้ผลิต/ส่งของแล้ว" เท่านั้น (ยังไม่ได้รัน)
--  วิธีใช้: ลบบรรทัดของใบที่ยังผลิตอยู่ออกจาก VALUES · เอา "-- " หน้าทุกบรรทัดออก
--  · รันเป็นก้อนแยก หลังจากข้อ 0–2 ข้างบนรันแล้ว · รันซ้ำได้ด้วยกติกาเดียวกัน
--  ยืนยันกับ: Sunichacha (DL-260900424 · DL-26080340 · DL-26090005 · DL-26080160 · DL-260900425)
--             · Threerapong (DL-260900461 · DL-260900462 · DL-26080238 · DL-26080236)
--             · Supisara (DL-260900491 · DL-260900501)
-- ============================================================
-- BEGIN;
--
-- CREATE TEMP TABLE _m0359_b (
--   id text PRIMARY KEY, code text NOT NULL, closed_value numeric NOT NULL CHECK (closed_value > 0)
-- ) ON COMMIT DROP;
--
-- INSERT INTO _m0359_b (id, code, closed_value) VALUES
--   ('DEAL-mtjj5bkd314k8', 'DL-260900424', 100000),  -- Sunichacha · end 2026-09-30
--   ('DEAL-mt8660q31616',  'DL-26080340',  283350),  -- Sunichacha · end 2026-10-30
--   ('DEAL-mtiaoz3i115l1', 'DL-26090005',  120000),  -- Sunichacha · end 2026-10-30
--   ('DEAL-msqy1mna15ve',  'DL-26080160',  600000),  -- Sunichacha · end 2026-10-30
--   ('DEAL-mtjjdmno29qr',  'DL-260900425', 210000),  -- Sunichacha · end 2026-12-31
--   ('DEAL-mts2kiwy3rne',  'DL-260900461',  60000),  -- Threerapong · end 2026-10-31
--   ('DEAL-mts2m2z4739k',  'DL-260900462',  20000),  -- Threerapong · end 2026-10-31
--   ('DEAL-mt0zkjhh1a6q',  'DL-26080238',  180000),  -- Threerapong · end 2026-10-31
--   ('DEAL-mt0yzt6d419so', 'DL-26080236',   30000),  -- Threerapong · end 2026-10-31
--   ('DEAL-mtwuygxk1ftc',  'DL-260900491',  12000),  -- Supisara · end 2026-10-30
--   ('DEAL-mu10cfma1ect',  'DL-260900501',  30000);  -- Supisara · end 2026-10-30
--
-- CREATE TEMP TABLE _m0359_zero ON COMMIT DROP AS
-- SELECT d.*
-- FROM public.sales_deals d
-- JOIN _m0359_b l ON l.id = d.id AND l.code = d.code
-- WHERE d.stage = 'won'
--   AND d.metadata->>'legacy' = 'true'
--   AND (d.metadata->>'legacyClosedValue')::numeric = l.closed_value
--   AND d."forecastSource" = 'manual'
--   AND d."projectValue" IN (l.closed_value, 0)
--   AND d."forecastManualValue" IN (l.closed_value, 0)
--   AND (d."projectValue" <> 0 OR d."forecastManualValue" <> 0
--        OR EXISTS (SELECT 1 FROM public.sales_deal_value_items i
--                    WHERE i."dealId" = d.id AND (i.amount <> 0 OR i."unitPrice" <> 0)))
--   AND NOT EXISTS (SELECT 1 FROM public.sales_orders so
--                    WHERE so."dealId" = d.id AND so.status = 'approved')
--   AND NOT EXISTS (SELECT 1 FROM public.quotations q WHERE q."dealId" = d.id);
--
-- DO $$
-- DECLARE v_targets integer; v_done integer; v_list integer;
-- BEGIN
--   -- นับเฉพาะใบที่ยังอยู่ (ใบที่ถูกลบไม่มีอะไรให้ล้าง — กติกาเดียวกับข้อ 1–2)
--   SELECT count(*) INTO v_list FROM _m0359_b l JOIN public.sales_deals d ON d.id = l.id;
--   SELECT count(*) INTO v_targets FROM _m0359_zero;
--   SELECT count(*) INTO v_done
--     FROM public.sales_deals d JOIN _m0359_b l ON l.id = d.id
--    WHERE d.metadata ? 'legacyClosedValue'
--      AND d."projectValue" = 0 AND d."forecastManualValue" = 0
--      AND NOT EXISTS (SELECT 1 FROM public.sales_deal_value_items i
--                       WHERE i."dealId" = d.id AND (i.amount <> 0 OR i."unitPrice" <> 0));
--   IF v_targets + v_done <> v_list THEN
--     RAISE EXCEPTION 'mig 0359 บล็อก B: เข้าเงื่อนไข % + ล้างแล้ว % ไม่ครบ % ใบ — ยกเลิก', v_targets, v_done, v_list;
--   END IF;
-- END $$;
--
-- CREATE TEMP TABLE _m0359_zero_items ON COMMIT DROP AS
-- SELECT i.*, z.code AS "dealCode"
-- FROM public.sales_deal_value_items i
-- JOIN _m0359_zero z ON z.id = i."dealId"
-- WHERE i.amount <> 0 OR i."unitPrice" <> 0;
--
-- INSERT INTO public.audit_logs
--   ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
-- SELECT 'migration-0359', 'ระบบ (mig 0359)', 'system', 'update', 'sales_deal', z.id,
--   'ล้างมูลค่า FC ของ ' || z.code || ' เป็น 0 หลังเจ้าของยืนยันว่าไม่ได้ผลิตแล้ว (บล็อก B · มติ 2026-09-14)',
--   '["projectValue","forecastManualValue"]'::jsonb, to_jsonb(z), now()
-- FROM _m0359_zero z;
--
-- INSERT INTO public.audit_logs
--   ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
-- SELECT 'migration-0359', 'ระบบ (mig 0359)', 'system', 'update', 'sales_deal_value_item', t.id,
--   'ล้างราคาแถวมูลค่ารายหมวดของ ' || t."dealCode" || ' เป็น 0 (บล็อก B · มติ 2026-09-14)',
--   '["unitPrice","amount"]'::jsonb, to_jsonb(t) - 'dealCode', now()
-- FROM _m0359_zero_items t;
--
-- UPDATE public.sales_deal_value_items i SET "unitPrice" = 0, amount = 0, "updatedAt" = now()
-- FROM _m0359_zero_items t WHERE i.id = t.id;
--
-- UPDATE public.sales_deals d SET "projectValue" = 0, "forecastManualValue" = 0, "updatedAt" = now()
-- FROM _m0359_zero z WHERE d.id = z.id;
--
-- INSERT INTO public.sales_deal_forecasts
--   (id, "dealId", "forecastMonth", "forecastAmount", probability, source, "createdBy", "createdByName")
-- SELECT 'DFC-mig0359-' || z.id, z.id,
--   COALESCE(z."forecastMonth", to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')),
--   0, z.probability, 'mig-0359', 'migration-0359', 'ระบบ (mig 0359)'
-- FROM _m0359_zero z
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.entity_updates
--   (id, "entityType", "entityId", kind, body, meta, "authorName", "createdAt")
-- SELECT 'EUP-mig0359-' || z.id, 'deal', z.id, 'forecast',
--   'มูลค่า ฿' || to_char(z."projectValue", 'FM999,999,999,990.00') || ' → ฿0.00 · เป็นยอดปิดในระบบเดิม ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC (มติ 2026-09-14)',
--   jsonb_build_object('projectValue', jsonb_build_object('from', z."projectValue", 'to', 0), 'migration', '0359'),
--   'ระบบ (mig 0359)', now()
-- FROM _m0359_zero z
-- ON CONFLICT (id) DO NOTHING;
--
-- COMMIT;

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
-- ตัวเลขที่ "คาด" ข้างล่างคิดจากรายชื่อครบ 15 ใบ ณ 14/09 · ถ้ามีใบถูกลบก่อนรัน (ข้อ 1 ประกาศรหัสไว้)
-- จำนวนแถวของ V1/V3/V4 และยอด V7 ลดลงตามใบที่หายไป
-- (ID15) = 'DEAL-msmq1f4i8jdh','DEAL-mso2whm714hu','DEAL-mtclsh5v11135','DEAL-mtclxp1c1y5',
--          'DEAL-mtjj5bkd314k8','DEAL-mt8660q31616','DEAL-mtiaoz3i115l1','DEAL-msqy1mna15ve',
--          'DEAL-mtjjdmno29qr','DEAL-mts2kiwy3rne','DEAL-mts2m2z4739k','DEAL-mt0zkjhh1a6q',
--          'DEAL-mt0yzt6d419so','DEAL-mtwuygxk1ftc','DEAL-mu10cfma1ect'
--
-- V1 ทั้ง 15 ใบ — มีบันทึกครบ · A เป็น 0 · B ยอดเดิม · Actual ไม่ขยับ
--   SELECT d.code, d."ownerName", d."endDate", d."projectValue", d."forecastManualValue",
--          d.metadata->>'legacyClosedValue' AS closed_value, d.metadata->>'legacyClosedDate' AS closed_date,
--          d."wonValue", d.metadata->>'actualSource' AS actual_source, d.metadata->>'wonMonth' AS won_month
--     FROM public.sales_deals d WHERE d.id IN (ID15) ORDER BY d."endDate", d.code;
--   คาด: 15 แถว · closed_value/closed_date มีค่าทุกแถว · wonValue 0 · actual_source sale_order · won_month ว่าง
--        DL-26080119/143/384/385: projectValue = forecastManualValue = 0 · อีก 11 ใบ projectValue = closed_value
-- V2 แถวมูลค่ารายหมวด
--   SELECT d.code, count(i.id) AS rows, COALESCE(sum(i.amount), 0) AS amount
--     FROM public.sales_deals d LEFT JOIN public.sales_deal_value_items i ON i."dealId" = d.id
--    WHERE d.id IN (ID15) GROUP BY d.code ORDER BY d.code;
--   คาด: DL-26080384 2 แถว 0 · DL-26080385 1 แถว 0
--        · DL-26080119/143/160 0 แถว (ไม่มีแถวรายหมวดตั้งแต่ต้น · DL-26080160 เป็นบล็อก B ยอดยังอยู่ที่ projectValue)
--        · อีก 10 ใบของ B ผลรวม = closed_value
-- V3 ร่องรอย (รันซ้ำแล้วต้องเท่าเดิม)
--   SELECT "entityType", count(*) FROM public.audit_logs WHERE "actorId" = 'migration-0359' GROUP BY 1;
--   คาด: sales_deal 19 (บันทึก 15 + ล้าง 4) · sales_deal_value_item 3
-- V4 ประวัติ FC + เธรด
--   SELECT count(*) FROM public.sales_deal_forecasts WHERE id LIKE 'DFC-mig0359-%';  -- 4
--   SELECT count(*) FROM public.entity_updates      WHERE id LIKE 'EUP-mig0359-%';  -- 4
-- V5 ดีลที่มี SO อนุมัติแล้ว (DL-26080394) ต้องไม่ถูกแตะ — ตรวจด้วยรหัส ไม่อยู่ในรายชื่อข้างบน
--   SELECT code, "projectValue", "wonValue", "updatedAt", metadata ? 'legacyClosedValue' AS has_note
--     FROM public.sales_deals WHERE code = 'DL-26080394';
--   คาด: 125000 · 125000 · 2026-08-31 07:42:44.317169+00 · false
-- V6 ดีลเก่า Won ที่ยังมียอด FC และไม่มี SO อนุมัติ — ต้องเหลือแค่ 11 ใบของบล็อก B และ has_note = true
--   SELECT d.code, d."ownerName", d."projectValue", d."endDate",
--          d.metadata ? 'legacyClosedValue' AS has_note, d."createdAt"
--     FROM public.sales_deals d
--    WHERE d.stage = 'won' AND d.metadata->>'legacy' = 'true' AND d."projectValue" > 0
--      AND NOT EXISTS (SELECT 1 FROM public.sales_orders so WHERE so."dealId" = d.id AND so.status = 'approved')
--    ORDER BY d."createdAt";
--   has_note = false คือดีลที่สร้างหลังวันทำรายชื่อ ⇒ ต้องทำรายชื่อรอบใหม่เป็นไฟล์ใหม่ (ห้ามแก้ไฟล์นี้หลังรันแล้ว)
-- V7 ยอด FC ที่เหลือของ 15 ใบ
--   SELECT sum("projectValue") FROM public.sales_deals WHERE id IN (ID15);  -- 1645350 (เดิม 1956850)
--
-- Rollback: ค่าเดิมทุกแถวอยู่ใน
--   SELECT "entityType", "entityId", before FROM public.audit_logs
--    WHERE "actorId" = 'migration-0359' ORDER BY id;
--   (แถว DFC-mig0359-* และ EUP-mig0359-* เลือกด้วย id ได้ถ้าต้องถอย)
