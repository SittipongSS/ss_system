-- ============================================================
--  Migration 0390: รอบวางบิลรุ่นสอง — สวิตช์เครดิต + หลายรอบวางบิลต่อเดือน + แปลงข้อความเครดิตเดิม
--  (มติเจ้าของ 26/09/2026 หลังเห็นโมดัลบน prod: "เครดิตเป็นข้อความ อยากให้เป็นสวิตช์ ไม่มีเครดิต ถ้ามีก็กรอกวัน" ·
--   "รอบวางบิลเพิ่มมากกว่า 1 รอบได้ เพราะบางบริษัทมี 2 รอบ" · เปลี่ยนเครดิตไม่ต้องอนุมัติ · แปลงข้อความเดิมที่ชัด)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  ① customer_billing_rule_ok() รับรูปรุ่นสอง (ตัวตรวจฝั่งโค้ด: lib/sales/billingRule.js normalizeBillingRule)
--       { "credit": false, "note"? }                                        ไม่มีเครดิต
--       billing.days   [1..31 · 1–4 ตัว ไม่ซ้ำ]                             หลายรอบวางบิลต่อเดือน
--       payment.rounds [{ "day": 1..31, "monthOffset": 0|1 } · 1–4 ตัว]     เงินเข้ารายรอบ (คู่กับ billing.days)
--     และยังรับรูปรุ่นแรก (billing.day · payment.day + monthOffset) — โค้ดรุ่นก่อนที่ยังรันอยู่ตอน deploy เขียนรูปนั้น
--     (ความยาวคู่ของ days/rounds + กติกาข้ามช่องตรวจที่โค้ด — ฐานกันรูป)
--  ② แปลงข้อความ "เงื่อนไขเครดิต" เดิมที่ชัดเจนเป็นรอบวางบิล — **เฉพาะลูกค้าที่ยังไม่ตั้งรอบ** (billingRule IS NULL)
--       "0 วัน" · "0" · "ไม่มีเครดิต" · "ไม่มีเครติด" · "ไม่มี" · "-"          → ไม่มีเครดิต
--       "เครดิต N วัน" · "N วัน"                                              → วางบิลได้ทุกวัน · เครดิต N วัน
--       "หลังจากติดตั้ง เครดิต 30 วัน" · "เครดิต 30 วัน หลังจัดส่งสินค้า"      → เครดิต 30 วัน + หมายเหตุ
--     ที่เหลือ (ข้อความยาว/ปนเงื่อนไขอื่น เช่น AR-267) **ไม่แตะ** ให้คนตั้งเองที่หน้าลูกค้า
--     ข้อความเดิมใน "creditTerms" **คงไว้** (ไม่ลบ) · ผู้แก้ล่าสุดบันทึกเป็น "ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)"
--
--  นับตอนเขียนไฟล์ (prod 26/09 อ่านอย่างเดียว): ไม่มีเครดิต 449 · เครดิต 30 วัน 8+2 · เครดิต 14 วัน 1 = 460 แถว · ไม่แตะ 2 แถว
--  ⛔ ไม่แตะ customers แถวที่ตั้งรอบแล้ว · ไม่แตะงวดชำระ · ไม่ลบข้อมูล
--  ✅ รันซ้ำได้ — CREATE OR REPLACE · UPDATE เฉพาะ billingRule IS NULL
--  ⚠️ รันมือบน Supabase SQL Editor · รันก่อนหรือหลัง deploy ก็ได้: โค้ดรุ่นแรกอ่านรูปรุ่นสองไม่ออก = ขึ้น "ยังไม่ตั้ง" (ไม่พัง)
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: true true true false
--   SELECT public.customer_billing_rule_ok('{"credit":false}'),
--          public.customer_billing_rule_ok('{"billing":{"mode":"monthly","days":[10,25]},"payment":{"mode":"monthly","rounds":[{"day":25,"monthOffset":0},{"day":10,"monthOffset":1}]}}'),
--          public.customer_billing_rule_ok('{"billing":{"mode":"monthly","day":5},"payment":{"mode":"monthly","day":25,"monthOffset":0}}'),
--          public.customer_billing_rule_ok('{"billing":{"mode":"monthly","days":[]},"payment":{"mode":"credit","days":30}}');
--  คาด: ไม่มีเครดิต ~449 · เครดิต ~11 · ยังไม่ตั้ง = ที่เหลือ
--   SELECT CASE WHEN "billingRule" IS NULL THEN 'ยังไม่ตั้ง'
--               WHEN "billingRule" ? 'credit' THEN 'ไม่มีเครดิต' ELSE 'เครดิต' END AS kind, count(*)
--     FROM public.customers GROUP BY 1;
-- ============================================================

BEGIN;

-- ── ① ตัวตรวจรูป ─────────────────────────────────────────────────────────
-- อาร์เรย์เลขจำนวนเต็มในช่วง ยาว 1..max ไม่ซ้ำ
CREATE OR REPLACE FUNCTION public.jsonb_int_array_ok(v jsonb, lo integer, hi integer, max_len integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) <> 'array' THEN false
    WHEN jsonb_array_length(v) < 1 OR jsonb_array_length(v) > max_len THEN false
    ELSE NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v) AS e(x)
            WHERE NOT public.jsonb_int_between(e.x, lo, hi)
         )
         AND (SELECT count(DISTINCT e.x #>> '{}') FROM jsonb_array_elements(v) AS e(x)) = jsonb_array_length(v)
  END
$$;

-- เงินเข้ารายรอบ [{ day, monthOffset }] ยาว 1..4
CREATE OR REPLACE FUNCTION public.jsonb_pay_rounds_ok(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) <> 'array' THEN false
    WHEN jsonb_array_length(v) < 1 OR jsonb_array_length(v) > 4 THEN false
    ELSE NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v) AS e(x)
            WHERE jsonb_typeof(e.x) <> 'object'
               OR NOT public.jsonb_int_between(e.x -> 'day', 1, 31)
               OR NOT public.jsonb_int_between(e.x -> 'monthOffset', 0, 1)
         )
  END
$$;

CREATE OR REPLACE FUNCTION public.customer_billing_rule_ok(r jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN r IS NULL THEN true
    WHEN jsonb_typeof(r) <> 'object' THEN false
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

REVOKE ALL ON FUNCTION public.jsonb_int_array_ok(jsonb, integer, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.jsonb_pay_rounds_ok(jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_billing_rule_ok(jsonb) FROM anon, authenticated;

-- ── ② แปลงข้อความเครดิตเดิม (เฉพาะที่ยังไม่ตั้งรอบ) ──────────────────────────
-- ไม่มีเครดิต
UPDATE public.customers
   SET "billingRule" = '{"credit":false}'::jsonb,
       "billingRuleUpdatedAt" = now(),
       "billingRuleUpdatedById" = 'migration-0390',
       "billingRuleUpdatedByName" = 'ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)'
 WHERE "billingRule" IS NULL
   AND btrim(coalesce("creditTerms", '')) IN ('0 วัน', '0', 'ไม่มีเครดิต', 'ไม่มีเครติด', 'ไม่มี', '-');

-- เครดิต N วัน (ข้อความล้วน ไม่มีอะไรต่อท้าย)
UPDATE public.customers
   SET "billingRule" = jsonb_build_object(
         'billing', jsonb_build_object('mode', 'anyday'),
         'payment', jsonb_build_object('mode', 'credit',
                      'days', (substring(btrim("creditTerms") FROM '^(?:เครดิต\s*)?(\d{1,3})\s*วัน$'))::int)),
       "billingRuleUpdatedAt" = now(),
       "billingRuleUpdatedById" = 'migration-0390',
       "billingRuleUpdatedByName" = 'ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)'
 WHERE "billingRule" IS NULL
   AND btrim(coalesce("creditTerms", '')) ~ '^(เครดิต\s*)?\d{1,3}\s*วัน$'
   AND (substring(btrim("creditTerms") FROM '^(?:เครดิต\s*)?(\d{1,3})\s*วัน$'))::int BETWEEN 1 AND 365;

-- เครดิต 30 วัน + เงื่อนไขนับวัน (สองข้อความที่มีจริง — เขียนตรงตัว ไม่เดารูปอื่น)
UPDATE public.customers
   SET "billingRule" = jsonb_build_object(
         'billing', jsonb_build_object('mode', 'anyday'),
         'payment', jsonb_build_object('mode', 'credit', 'days', 30),
         'note', CASE btrim("creditTerms")
                   WHEN 'หลังจากติดตั้ง เครดิต 30 วัน' THEN 'นับเครดิตหลังจากติดตั้ง'
                   ELSE 'นับเครดิตหลังจัดส่งสินค้า' END),
       "billingRuleUpdatedAt" = now(),
       "billingRuleUpdatedById" = 'migration-0390',
       "billingRuleUpdatedByName" = 'ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)'
 WHERE "billingRule" IS NULL
   AND btrim(coalesce("creditTerms", '')) IN ('หลังจากติดตั้ง เครดิต 30 วัน', 'เครดิต 30 วัน หลังจัดส่งสินค้า');

COMMIT;
