-- ============================================================
--  Migration 0393: กำหนดวางบิลรุ่นสี่ — "ต้องวางบิลไหม" (need) ที่ลูกค้า + ติ๊ก "งวดนี้ไม่ต้องวางบิล" รายงวด
--  (มติเจ้าของ 28–29/09/2026 · ม็อก mockups/billing-cycle/rework-v4 · system-design.md §5.2 ข้อ 1–6)
--
--  ต้นเรื่อง: ลูกค้า "ไม่มีเครดิต" 449 รายถูกอ่านเป็น "วางบิลได้ทุกวัน + ชำระวันวางบิล" ⇒ ต้องใส่วันวางบิลปลอมให้งวดที่ลูกค้า
--  โอนก่อน · เจ้าของ: "กำหนดชำระเป็นหลัก ตั้งเดี่ยวได้เสมอ · วันวางบิลมีเฉพาะลูกค้าที่ต้องวางบิล"
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  ① ตัวตรวจรูปใหม่ (ตัวตรวจฝั่งโค้ด: lib/sales/billingRuleV4.js normalizeRule — รูปที่ฐานรับต้องตรงกัน
--     ตัวอย่างถูก/ผิดชุดเดียวกันอยู่ที่ lib/sales/billingRuleFixtures.json)
--       jsonb_run_rounds_ok(v)        รอบจ่ายรายเดือน [{ cutoffDay 1..31, payDay 1..31, payMonthOffset 0|1 }] 1–4 ตัว
--                                     · cutoffDay ไม่ซ้ำ · จ่ายเดือนเดียวกัน ⇒ payDay ≥ cutoffDay
--       jsonb_weekday_runs_ok(v)      วันจ่ายประจำ { kind:'weekday', weekday 0..6, nths [1..5] 1–4 ตัวไม่ซ้ำ } · ไม่มีเวลาตัดรอบ
--       jsonb_billing_calendar_ok(v)  ปฏิทินรายปีของลูกค้า { kind:'calendar', years:{ "YYYY": { runs:[{cutoff,pay}], fileId? } },
--                                     estimate?, cutoffTime? } · วันที่มีจริง · วันตัดรอบอยู่ในปีนั้น เรียงขึ้นไม่ซ้ำ ·
--                                     pay ≥ cutoff ห่างไม่เกิน 120 วัน · ปีละ 1–48 รอบ · เดือนละไม่เกิน 4 รอบ
--       customer_billing_rule_v4_ok(r) { v:4, need:'none' } · { v:4, need:'required', billing:null }
--                                     · { v:4, need:'required', billing, creditDays 0..365, runs null|รายเดือน|วันจ่ายประจำ|ปฏิทิน }
--                                     · คีย์ได้แค่ v need billing creditDays runs note (⛔ ไม่รับ legacyNoCredit = ผลการอ่าน ห้ามบันทึก)
--                                     · ปฏิทิน ⇒ billing ต้องเป็น anyday
--     ⚠️ วันจ่ายประจำ/ปฏิทิน **ฐานรับรูปได้แต่ยังไม่มีจอเขียน** (ติดรอมติ ข้อ 1 · ข้อ 3) — รับไว้ก่อนเพื่อไม่ต้องแก้ CHECK ซ้ำ
--  ② customer_billing_rule_ok(r) CREATE OR REPLACE — เพิ่มกิ่งแรก `r ? 'v'` ⇒ ตัวตรวจรุ่นสี่
--     (ต้องอยู่ก่อนกิ่ง `? 'credit'` และ "billing/payment ต้องเป็น object" — รุ่นสี่ไม่มี payment วางหลัง = ตกทุกแถว)
--     กิ่งรุ่นหนึ่ง/สอง (0389/0390) คงเดิมทุกตัวอักษร ⇒ 449 { credit:false } + 11 รายที่ตั้งแล้ว ผ่านเหมือนเดิม
--  ③ sales_order_installments."billingSkip" boolean — ติ๊ก "งวดนี้ไม่ต้องวางบิล" (เช่น มัดจำโอนก่อน · กลุ่ม K2)
--     NULL/false = ตามลูกค้า · ⛔ ไม่ผูก CHECK กับคอลัมน์อื่น (ด่าน API กันคู่กับวันวางบิล) — ทางเขียนงวดเก่า
--     (RPC ปรับแผน 0377 · ใบย้อนหลัง · carry) ที่ไม่รู้จักคอลัมน์นี้ต้องไม่พัง 23514
--
--  ⛔ DDL ล้วน — ไม่แตะแถวข้อมูล (ลูกค้า 553 ราย + งวดทุกงวดคงเดิม · อ่านผ่าน toV4 ได้วันเท่าเดิมทุกวัน)
--     backfill "ต้องวางบิลไหม" ของลูกค้าเดิม (รอมติ ข้อ 4 ทาง 3) เป็นสคริปต์ node แยก ต้องได้คำยินยอมของเจ้าของก่อนรัน
--  ⛔ ไม่มี "dueEstimatedAs" (รอยประมาณการ = ช่วง 2b ติดรอมติ ข้อ 3) · ไม่มี CHECK "รอเหตุการณ์ ⇒ ไม่มีกำหนดชำระ" (ช่วง 5)
--  ✅ รันซ้ำได้ — CREATE OR REPLACE · ADD COLUMN IF NOT EXISTS
--  ⚠️ รันมือบน Supabase SQL Editor · รันก่อน deploy ได้ (แค่ขยายสิ่งที่ฐานรับ) — โค้ดเช็คคอลัมน์ billingSkip ก่อนใช้
--     (billingPolicySchema.js · ธง billingSkipReady) และแปล 23514 ของกติการุ่นสี่เป็น "รอรัน migration 0393"
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: 1 แถว (boolean)
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'sales_order_installments' AND column_name = 'billingSkip';
--  คาด: 4 แถว
--   SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('jsonb_run_rounds_ok', 'jsonb_weekday_runs_ok', 'jsonb_billing_calendar_ok', 'customer_billing_rule_v4_ok');
--  คาด: true true true true true true true (รูปเดิมยังผ่าน · รุ่นสี่ผ่าน)
--   SELECT public.customer_billing_rule_ok('{"credit":false}'),
--          public.customer_billing_rule_ok('{"billing":{"mode":"monthly","days":[21]},"payment":{"mode":"monthly","rounds":[{"day":30,"monthOffset":1}]}}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"none"}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"required","billing":null}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"required","billing":{"mode":"anyday"},"creditDays":30,"runs":null}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"required","billing":{"mode":"anyday"},"creditDays":0,"runs":{"kind":"monthly","rounds":[{"cutoffDay":5,"payDay":25,"payMonthOffset":0}]}}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"required","billing":{"mode":"anyday"},"creditDays":30,"runs":{"kind":"weekday","weekday":3,"nths":[2,4]}}');
--  คาด: false false false false false false (ไม่มีเครดิต · ไม่ต้องวางบิลมีรอบ · ธงผลการอ่าน · จ่ายก่อนตัดรอบ · รุ่นสาม · v สตริง)
--   SELECT public.customer_billing_rule_ok('{"v":4,"need":"required","billing":{"mode":"anyday"},"runs":null}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"none","creditDays":30}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"required","billing":{"mode":"anyday"},"creditDays":0,"runs":null,"legacyNoCredit":true}'),
--          public.customer_billing_rule_ok('{"v":4,"need":"required","billing":{"mode":"anyday"},"creditDays":0,"runs":{"kind":"monthly","rounds":[{"cutoffDay":25,"payDay":10,"payMonthOffset":0}]}}'),
--          public.customer_billing_rule_ok('{"v":3,"billing":{"mode":"anyday"},"creditDays":0,"runs":null}'),
--          public.customer_billing_rule_ok('{"v":"4","need":"none"}');
--  คาด: เท่าก่อนรันทุกแถว (prod 28/09: ไม่มีเครดิต 449 · ยังไม่ตั้ง 93 · เครดิต 10 · รายเดือน 1 · รุ่นสี่ 0)
--   SELECT CASE WHEN "billingRule" IS NULL THEN 'ยังไม่ตั้ง'
--               WHEN "billingRule" ? 'v' THEN 'รุ่นสี่'
--               WHEN "billingRule" ? 'credit' THEN 'ไม่มีเครดิต'
--               WHEN "billingRule" #>> '{payment,mode}' = 'credit' THEN 'เครดิต'
--               ELSE 'รายเดือน' END AS kind, count(*)
--     FROM public.customers GROUP BY 1 ORDER BY 1;
--  คาด: 0 (ทุกแถวเดิมยังผ่านตัวตรวจใหม่)
--   SELECT count(*) FROM public.customers WHERE NOT public.customer_billing_rule_ok("billingRule");
-- ============================================================

BEGIN;

-- ── ① ตัวตรวจรูปรุ่นสี่ ─────────────────────────────────────────────────────
-- รอบจ่ายรายเดือน [{ cutoffDay, payDay, payMonthOffset }] 1..4 ตัว · cutoffDay ไม่ซ้ำ · จ่ายเดือนเดียวกัน ⇒ วันจ่ายไม่มาก่อนวันตัดรอบ
-- ⚠️ ตรวจช่องละตัวใน CASE ก่อนแปลง ::int — OR ของ SQL ไม่รับประกันลำดับ (1.5::int / "x"::int โยน error แทนที่จะคืน false)
CREATE OR REPLACE FUNCTION public.jsonb_run_rounds_ok(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) <> 'array' THEN false
    WHEN jsonb_array_length(v) < 1 OR jsonb_array_length(v) > 4 THEN false
    ELSE NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v) AS e(x)
            WHERE CASE
                    WHEN jsonb_typeof(e.x) <> 'object' THEN true
                    WHEN NOT (public.jsonb_int_between(e.x -> 'cutoffDay', 1, 31)
                              AND public.jsonb_int_between(e.x -> 'payDay', 1, 31)
                              AND public.jsonb_int_between(e.x -> 'payMonthOffset', 0, 1)) THEN true
                    ELSE (e.x ->> 'payMonthOffset')::numeric = 0
                         AND (e.x ->> 'payDay')::numeric < (e.x ->> 'cutoffDay')::numeric
                  END
         )
         AND (SELECT count(DISTINCT e.x ->> 'cutoffDay') FROM jsonb_array_elements(v) AS e(x)) = jsonb_array_length(v)
  END
$$;

-- วันจ่ายประจำ "วัน…ที่ n ของเดือน" (AR-035 "พุธที่ 2,4") · 5 = สุดท้ายของเดือน · ไม่มีเวลาตัดรอบ (ตัวตรวจฝั่งโค้ดตีกลับ)
CREATE OR REPLACE FUNCTION public.jsonb_weekday_runs_ok(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) <> 'object' THEN false
    WHEN v ->> 'kind' IS DISTINCT FROM 'weekday' THEN false
    WHEN v ? 'cutoffTime' THEN false
    ELSE public.jsonb_int_between(v -> 'weekday', 0, 6)
         AND public.jsonb_int_array_ok(v -> 'nths', 1, 5, 4)
  END
$$;

-- เวลาตัดรอบ "HH:MM" (24 ชม.)
CREATE OR REPLACE FUNCTION public.jsonb_time_ok(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v IS NOT NULL AND jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
$$;

-- ปฏิทินรายปีของลูกค้า — plpgsql เพราะต้องแปลง ::date ในบล็อกกัน error (วันที่ไม่มีจริง = false ไม่ใช่ 22008)
CREATE OR REPLACE FUNCTION public.jsonb_billing_calendar_ok(v jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  y text;
  block jsonb;
  run jsonb;
  c date;
  p date;
  prev date;
  n integer;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'object' OR v ->> 'kind' IS DISTINCT FROM 'calendar' THEN RETURN false; END IF;
  IF v ? 'cutoffTime' AND NOT public.jsonb_time_ok(v -> 'cutoffTime') THEN RETURN false; END IF;
  IF v ? 'estimate' AND NOT public.jsonb_run_rounds_ok(v -> 'estimate') THEN RETURN false; END IF;
  IF jsonb_typeof(v -> 'years') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(v -> 'years')) THEN RETURN false; END IF;
  FOR y, block IN SELECT key, value FROM jsonb_each(v -> 'years') LOOP
    IF y !~ '^[0-9]{4}$' THEN RETURN false; END IF;
    IF y::integer NOT BETWEEN 2000 AND 2100 THEN RETURN false; END IF;
    IF jsonb_typeof(block) IS DISTINCT FROM 'object' OR jsonb_typeof(block -> 'runs') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF block ? 'fileId'
       AND NOT (jsonb_typeof(block -> 'fileId') = 'string' AND length(block ->> 'fileId') BETWEEN 1 AND 64) THEN RETURN false; END IF;
    n := jsonb_array_length(block -> 'runs');
    IF n < 1 OR n > 48 THEN RETURN false; END IF;
    prev := NULL;
    FOR run IN SELECT value FROM jsonb_array_elements(block -> 'runs') LOOP
      IF jsonb_typeof(run) IS DISTINCT FROM 'object'
         OR jsonb_typeof(run -> 'cutoff') IS DISTINCT FROM 'string'
         OR jsonb_typeof(run -> 'pay') IS DISTINCT FROM 'string'
         OR (run ->> 'cutoff') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR (run ->> 'pay') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
      BEGIN
        c := (run ->> 'cutoff')::date;
        p := (run ->> 'pay')::date;
      EXCEPTION WHEN others THEN
        RETURN false;
      END;
      IF extract(year FROM c)::integer <> y::integer THEN RETURN false; END IF;
      IF p < c OR p - c > 120 THEN RETURN false; END IF;
      -- ตัวตรวจฝั่งโค้ดเรียงวันตัดรอบก่อนบันทึก ⇒ รูปที่เก็บเรียงขึ้นเคร่งครัด (ไม่ซ้ำ)
      IF prev IS NOT NULL AND c <= prev THEN RETURN false; END IF;
      prev := c;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(block -> 'runs') AS e(x)
       GROUP BY substr(e.x ->> 'cutoff', 1, 7) HAVING count(*) > 4
    ) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$$;

-- กติการุ่นสี่ทั้งก้อน
CREATE OR REPLACE FUNCTION public.customer_billing_rule_v4_ok(r jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN r IS NULL OR jsonb_typeof(r) <> 'object' THEN false
    WHEN r -> 'v' IS DISTINCT FROM '4'::jsonb THEN false
    -- คีย์ที่ไม่รู้จัก = ตีกลับ (รุ่นสองไม่ตีกลับ — บทเรียนของธง legacyNoCredit ที่เป็นผลการอ่าน ห้ามลงฐาน)
    WHEN EXISTS (SELECT 1 FROM jsonb_object_keys(r) AS k(key)
                  WHERE k.key NOT IN ('v', 'need', 'billing', 'creditDays', 'runs', 'note')) THEN false
    WHEN r ? 'note' AND NOT (jsonb_typeof(r -> 'note') = 'string' AND length(r ->> 'note') <= 1000) THEN false
    -- ไม่ต้องวางบิล — ไม่มีวันวางบิล/เครดิต/รอบจ่าย
    WHEN r ->> 'need' = 'none' THEN
      coalesce(jsonb_typeof(r -> 'billing'), 'null') = 'null'
      AND coalesce(jsonb_typeof(r -> 'creditDays'), 'null') = 'null'
      AND coalesce(jsonb_typeof(r -> 'runs'), 'null') = 'null'
    WHEN r ->> 'need' IS DISTINCT FROM 'required' THEN false
    -- ต้องวางบิล · ยังไม่ตั้งรอบ — ไม่มีเครดิต/รอบจ่ายเช่นกัน
    WHEN coalesce(jsonb_typeof(r -> 'billing'), 'null') = 'null' THEN
      coalesce(jsonb_typeof(r -> 'creditDays'), 'null') = 'null'
      AND coalesce(jsonb_typeof(r -> 'runs'), 'null') = 'null'
    WHEN jsonb_typeof(r -> 'billing') <> 'object' THEN false
    ELSE
      (CASE r #>> '{billing,mode}'
         WHEN 'anyday'  THEN true
         WHEN 'monthly' THEN public.jsonb_int_array_ok(r #> '{billing,days}', 1, 31, 4)
         ELSE false
       END)
      -- เครดิตต้องส่งมาเสมอ (ไม่มีค่าตั้งต้นให้การตัดสินใจ · 0 = ชำระวันวางบิล)
      AND public.jsonb_int_between(r -> 'creditDays', 0, 365)
      AND (CASE
             WHEN coalesce(jsonb_typeof(r -> 'runs'), 'null') = 'null' THEN true
             WHEN jsonb_typeof(r -> 'runs') <> 'object' THEN false
             WHEN r #>> '{runs,kind}' = 'monthly' THEN
               public.jsonb_run_rounds_ok(r #> '{runs,rounds}')
               AND (NOT (r -> 'runs' ? 'cutoffTime') OR public.jsonb_time_ok(r #> '{runs,cutoffTime}'))
             WHEN r #>> '{runs,kind}' = 'weekday' THEN public.jsonb_weekday_runs_ok(r -> 'runs')
             WHEN r #>> '{runs,kind}' = 'calendar' THEN
               r #>> '{billing,mode}' = 'anyday' AND public.jsonb_billing_calendar_ok(r -> 'runs')
             ELSE false
           END)
  END
$$;

-- ── ② ตัวตรวจรวม: กิ่งรุ่นสี่มาก่อน · กิ่งรุ่นหนึ่ง/สอง (0390) คงเดิมทุกตัวอักษร ──────────────────────────
CREATE OR REPLACE FUNCTION public.customer_billing_rule_ok(r jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN r IS NULL THEN true
    WHEN jsonb_typeof(r) <> 'object' THEN false
    -- รุ่นสี่ (0393) — ต้องมาก่อนกิ่ง credit และ "billing/payment ต้องเป็น object" (รุ่นสี่ไม่มี payment)
    WHEN r ? 'v' THEN public.customer_billing_rule_v4_ok(r)
    -- หมายเหตุ (ทุกรูป)
    WHEN r -> 'note' IS NOT NULL
         AND NOT (jsonb_typeof(r -> 'note') = 'string' AND length(r ->> 'note') <= 1000) THEN false
    -- ไม่มีเครดิต — มีแค่ credit:false (+ note)
    WHEN r ? 'credit' THEN
      r -> 'credit' = 'false'::jsonb AND NOT (r ? 'billing') AND NOT (r ? 'payment')
    WHEN jsonb_typeof(r -> 'billing') IS DISTINCT FROM 'object'
      OR jsonb_typeof(r -> 'payment') IS DISTINCT FROM 'object' THEN false
    ELSE
      (CASE r #>> '{billing,mode}'
         WHEN 'anyday'  THEN true
         WHEN 'monthly' THEN
           CASE WHEN r -> 'billing' ? 'days'
                THEN public.jsonb_int_array_ok(r #> '{billing,days}', 1, 31, 4)
                ELSE public.jsonb_int_between(r #> '{billing,day}', 1, 31) END
         ELSE false
       END)
      AND
      (CASE r #>> '{payment,mode}'
         WHEN 'credit'  THEN public.jsonb_int_between(r #> '{payment,days}', 0, 365)
         WHEN 'monthly' THEN
           CASE WHEN r -> 'payment' ? 'rounds'
                THEN public.jsonb_pay_rounds_ok(r #> '{payment,rounds}')
                ELSE public.jsonb_int_between(r #> '{payment,day}', 1, 31)
                     AND public.jsonb_int_between(r #> '{payment,monthOffset}', 0, 1) END
         ELSE false
       END)
  END
$$;

REVOKE ALL ON FUNCTION public.jsonb_run_rounds_ok(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jsonb_weekday_runs_ok(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jsonb_time_ok(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jsonb_billing_calendar_ok(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_billing_rule_v4_ok(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_billing_rule_ok(jsonb) FROM anon, authenticated;

-- ── ③ ติ๊ก "งวดนี้ไม่ต้องวางบิล" รายงวด ─────────────────────────────────────────
-- NULL/false = ตามลูกค้า · ไม่มี CHECK ข้ามคอลัมน์โดยเจตนา (ด่านอยู่ที่ API: validateInstallmentDates)
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "billingSkip" boolean;

COMMIT;
