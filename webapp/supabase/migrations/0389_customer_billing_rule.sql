-- ============================================================
--  Migration 0389: กำหนดวางบิล — รอบวางบิลของลูกค้า + วันวางบิลรายงวด
--  (มติเจ้าของ 25–26/09/2026 · ม็อก mockups/billing-cycle)
--
--  ต้นเรื่อง: ลูกค้าเครดิตมีรอบวางบิล ("วางบิลทุกวันที่ 5 · เงินเข้าทุกวันที่ 25") แต่ระบบไม่มีที่เก็บ
--  ⇒ SA พิมพ์ไว้ในช่องข้อความ "เงื่อนไขเครดิต" แล้วกรอกวันวางบิลลงช่องกำหนดชำระ (SO-26080050-0
--  งวด 1 = 5 ก.ย.) ⇒ ใบขึ้นแดง "เลยกำหนด" ทั้งที่เงินยังไม่ถึงกำหนด (และด่านช่างเข้าไซต์อ่านช่องเดียวกัน)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  ① customers."billingRule" jsonb — รอบวางบิล NULL = ยังไม่ตั้ง (ไม่มีค่าตั้งต้น)
--     รูป: { "billing": { "mode": "anyday" }                      วางบิลได้ทุกวัน
--                     | { "mode": "monthly", "day": 1..31 },     ทุกเดือนวันที่ n (31 = สิ้นเดือน)
--            "payment": { "mode": "credit", "days": 0..365 }      เครดิต n วันนับจากวันวางบิล
--                     | { "mode": "monthly", "day": 1..31, "monthOffset": 0|1 },  ทุกเดือนวันที่ n
--            "note": "…" (ไม่บังคับ ≤ 1000) }
--     ตรวจรูปที่ฐานด้วย customer_billing_rule_ok() — ตัวตรวจฝั่งโค้ดคือ lib/sales/billingRule.js
--     (ต้องตรงกัน · ฐานกันแค่รูป กติกาข้ามช่อง เช่น "เงินเข้าก่อนวางบิล" อยู่ในโค้ด)
--     + ผู้แก้ล่าสุด 3 คอลัมน์ (การ์ดบนหน้าลูกค้าโชว์ "แก้ล่าสุดโดย") · ประวัติเต็มอยู่ที่ audit_logs
--  ② sales_order_installments."billingDate" date — วันวางบิลของงวด (คนละช่องกับ "dueDate" = กำหนดชำระ
--     ⚠️ ป้าย "เลยกำหนด" + ด่านช่าง (visitGate) ยังอ่าน dueDate ช่องเดียว · วันวางบิลที่ผ่านไปแล้วไม่ทำให้แดง)
--     sales_order_installments."billingEvent" text — "รอเหตุการณ์" (เช่น ก่อนส่งสินค้า) เมื่อยังวางบิลไม่ได้
--     จนกว่าเหตุการณ์จะเกิด · มีวันวางบิลแล้วต้องไม่มีเหตุการณ์ (เลือกได้อย่างเดียว) · งวดยกมาไม่มีทั้งคู่
--  ③ index ของคิวเตือน (daily-digest) — งวดรอชำระที่มีวันวางบิล
--
--  ⛔ ไม่แตะแถวข้อมูล · ไม่ backfill (มติ: ใบเก่าไม่เติมวันย้อนหลัง) · ไม่แตะ dueDate / paymentDueDate
--  ⛔ ไม่ใช้ชื่อ billingCycle — จองไว้ให้ความถี่งวดของสัญญาบริการ
--
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · CREATE OR REPLACE FUNCTION · CHECK/INDEX ข้ามเมื่อมีแล้ว
--  ✅ แถวเดิมผ่าน CHECK ทุกแถว (คอลัมน์ใหม่เป็น NULL ทั้งหมด)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor **ก่อน merge** (check:columns ใน CI อ่าน schema จริง)
--     ไม่มีโค้ดตัวไหนบน main อ่านคอลัมน์เหล่านี้ ⇒ รันก่อน deploy ได้ ไม่มีอะไรพัง
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: 6 แถว
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ((table_name = 'customers' AND column_name IN
--             ('billingRule','billingRuleUpdatedAt','billingRuleUpdatedById','billingRuleUpdatedByName'))
--        OR (table_name = 'sales_order_installments' AND column_name IN ('billingDate','billingEvent')));
--  คาด: 2 แถว
--   SELECT conname FROM pg_constraint
--    WHERE conname IN ('customers_billing_rule_shape', 'sales_order_installments_billing_sane');
--  คาด: true · false
--   SELECT public.customer_billing_rule_ok('{"billing":{"mode":"monthly","day":5},"payment":{"mode":"monthly","day":25,"monthOffset":0}}'),
--          public.customer_billing_rule_ok('{"billing":{"mode":"monthly","day":32},"payment":{"mode":"credit","days":30}}');
-- ============================================================

BEGIN;

-- ── ① ตัวตรวจรูป ─────────────────────────────────────────────────────────
-- เลขจำนวนเต็มในช่วง — jsonb ที่ไม่ใช่ตัวเลข / มีทศนิยม / นอกช่วง = false (ไม่ throw)
CREATE OR REPLACE FUNCTION public.jsonb_int_between(v jsonb, lo integer, hi integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) <> 'number' THEN false
    ELSE (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
         AND (v #>> '{}')::numeric BETWEEN lo AND hi
  END
$$;

CREATE OR REPLACE FUNCTION public.customer_billing_rule_ok(r jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN r IS NULL THEN true
    WHEN jsonb_typeof(r) <> 'object'
      OR jsonb_typeof(r -> 'billing') IS DISTINCT FROM 'object'
      OR jsonb_typeof(r -> 'payment') IS DISTINCT FROM 'object' THEN false
    ELSE
      (CASE r #>> '{billing,mode}'
         WHEN 'anyday'  THEN true
         WHEN 'monthly' THEN public.jsonb_int_between(r #> '{billing,day}', 1, 31)
         ELSE false
       END)
      AND
      (CASE r #>> '{payment,mode}'
         WHEN 'credit'  THEN public.jsonb_int_between(r #> '{payment,days}', 0, 365)
         WHEN 'monthly' THEN public.jsonb_int_between(r #> '{payment,day}', 1, 31)
                         AND public.jsonb_int_between(r #> '{payment,monthOffset}', 0, 1)
         ELSE false
       END)
      AND (r -> 'note' IS NULL
           OR (jsonb_typeof(r -> 'note') = 'string' AND length(r ->> 'note') <= 1000))
  END
$$;

REVOKE ALL ON FUNCTION public.jsonb_int_between(jsonb, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_billing_rule_ok(jsonb) FROM anon, authenticated;

-- ── ① รอบวางบิลของลูกค้า ─────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS "billingRule"              jsonb,
  ADD COLUMN IF NOT EXISTS "billingRuleUpdatedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "billingRuleUpdatedById"   text,
  ADD COLUMN IF NOT EXISTS "billingRuleUpdatedByName" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.customers'::regclass
       AND conname = 'customers_billing_rule_shape'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_billing_rule_shape CHECK (public.customer_billing_rule_ok("billingRule"));
  END IF;
END $$;

-- ── ② วันวางบิล / รอเหตุการณ์ รายงวด ──────────────────────────────────────
ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "billingDate"  date,
  ADD COLUMN IF NOT EXISTS "billingEvent" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sales_order_installments'::regclass
       AND conname = 'sales_order_installments_billing_sane'
  ) THEN
    ALTER TABLE public.sales_order_installments
      ADD CONSTRAINT sales_order_installments_billing_sane CHECK (
        -- กันปีพิมพ์ผิด (แบบเดียวกับ dates_sane ของ 0245)
        ("billingDate" IS NULL OR "billingDate" BETWEEN '2000-01-01' AND '2100-12-31')
        AND ("billingEvent" IS NULL OR length(btrim("billingEvent")) BETWEEN 1 AND 120)
        -- เลือกได้อย่างเดียว: มีวันวางบิล หรือ รอเหตุการณ์
        AND ("billingDate" IS NULL OR "billingEvent" IS NULL)
        -- งวดยกมา (0374) ไม่มีวันเสมอ — แบบเดียวกับ dueDate ใน opening_shape
        AND (kind <> 'opening' OR ("billingDate" IS NULL AND "billingEvent" IS NULL))
      );
  END IF;
END $$;

-- ── ③ คิวเตือนก่อนถึงวันวางบิล ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS sales_order_installments_billing_due_idx
  ON public.sales_order_installments ("billingDate")
  WHERE status = 'pending' AND "billingDate" IS NOT NULL;

COMMIT;
