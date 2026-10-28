-- 0414 — ใบเสนอราคา / ใบสั่งขาย "ค่าสรรพสามิต": origin ใหม่ + ลิงก์ SO ต้นทาง + ปลด dealId (โครงสร้างล้วน)
--
--  แผน: docs/excise-qt-so-rework-plan.md (มติเจ้าของ 28/10/2026) หมวด 3 + หมวด 6
--  · ใบเสนอราคาค่าสรรพสามิตเป็นแถวจริงใน `quotations` (ฟอร์ม QT เดิม · SA ออก) — origin = 'excise' · ไม่มีดีล ·
--    ชี้ SO ลูกค้าที่เป็นต้นเหตุด้วย "sourceSalesOrderId"
--  · SO ค่าสรรพสามิตเป็นแถวจริงใน `sales_orders` — origin = 'excise' · ไม่มีดีล/โครงการ · Actual = 0 เสมอ · ไม่มี Rev.
--  · "ไม่เรียกเก็บค่าสรรพสามิตในระบบ" เป็นคอลัมน์บน SO ลูกค้า (ขั้นของ SA บนเอกสารเดิม — กฎความเป็นเจ้าของโมดูลข้อ 2)
--
--  ไฟล์นี้ **ไม่มี RPC** และไม่สร้างแถว excise สักแถว — เส้นออกใบมากับ 0415 (QT) / 0416 (SO) และ PR3/PR4
--  ⇒ แถวเดิมทั้งหมดเป็น pipeline/historical ที่มีดีล ผ่านทุก CHECK ใหม่ (ADD CONSTRAINT ตรวจทุกแถวเดิม)
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน deploy โค้ด PR1** (`claude/excise-pr1-guards`) — โค้ดชุดนั้น select
--     "sourceSalesOrderId" / origin ของใบเสนอราคา · deploy ก่อนรัน = ลิสต์/หน้า QT/SO พังทั้ง query (42703)
--     รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม: คอลัมน์ใหม่มีค่าตั้งต้น · ไม่มีใครเขียนค่าใหม่
--  ⚠️ DDL — รันมือใน Supabase SQL Editor
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่ · CREATE OR REPLACE)
--  🧪 พิสูจน์บนฮาร์เนส PGlite (นอก repo) — โหลด schema.sql + 0001–0412 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + กรณีทดสอบ
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: q_cols = 2 · so_cols = 7 · chk = 6 · trg = 3 · deal_nullable = 2 · excise_rows = 0 ──
--   SELECT
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotations'
--      AND column_name IN ('origin', 'sourceSalesOrderId')) AS q_cols,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders'
--      AND (column_name = 'sourceSalesOrderId' OR column_name LIKE 'exciseNotBilled%')) AS so_cols,
--    (SELECT count(*) FROM pg_constraint WHERE convalidated AND conname IN ('quotations_origin_check', 'quotations_origin_shape',
--      'sales_orders_origin_check', 'sales_orders_origin_shape', 'sales_orders_deal_by_origin',
--      'sales_orders_excise_not_billed_shape')) AS chk,
--    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('quotations_origin_immutable_trg',
--      'quotations_source_so_immutable_trg', 'sales_orders_source_so_immutable_trg')) AS trg,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'dealId'
--      AND table_name IN ('quotations', 'sales_orders') AND is_nullable = 'YES') AS deal_nullable,
--    (SELECT count(*) FROM public.quotations WHERE origin = 'excise')
--      + (SELECT count(*) FROM public.sales_orders WHERE origin = 'excise') AS excise_rows;
--
--  ── ถอยกลับ (ใช้ได้ตราบที่ยังไม่มีแถว excise — มีแล้ว ห้ามถอย) ─────────────────────────────────────
--   BEGIN;
--   DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.quotations WHERE origin = 'excise')
--     OR EXISTS (SELECT 1 FROM public.sales_orders WHERE origin = 'excise')
--     THEN RAISE EXCEPTION 'excise rows exist'; END IF; END $$;
--   DROP TRIGGER IF EXISTS quotations_origin_immutable_trg ON public.quotations;
--   DROP TRIGGER IF EXISTS quotations_source_so_immutable_trg ON public.quotations;
--   DROP TRIGGER IF EXISTS sales_orders_source_so_immutable_trg ON public.sales_orders;
--   DROP FUNCTION IF EXISTS public.guard_source_sales_order_immutable();
--   ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_origin_shape,
--     DROP CONSTRAINT IF EXISTS quotations_origin_check, DROP COLUMN IF EXISTS "sourceSalesOrderId",
--     DROP COLUMN IF EXISTS origin, ALTER COLUMN "dealId" SET NOT NULL;
--   ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_deal_by_origin,
--     DROP CONSTRAINT IF EXISTS sales_orders_excise_not_billed_shape, ALTER COLUMN "dealId" SET NOT NULL;
--   -- origin_check / origin_shape: สร้างกลับตาม 0360 / 0374 (สองสาย) · คอลัมน์ exciseNotBilled* / sourceSalesOrderId ทิ้งได้
--   COMMIT;

BEGIN;

-- ── 1) quotations — origin + ลิงก์ SO ต้นทาง ─────────────────────────────────────────────────
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'pipeline',
  ADD COLUMN IF NOT EXISTS "sourceSalesOrderId" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT;

ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_origin_check;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_origin_check CHECK (origin IN ('pipeline', 'excise'));

-- pipeline ⇔ มีดีล ไม่มี SO ต้นทาง · excise ⇔ ไม่มีดีล มี SO ต้นทาง — ต้องมาก่อนปลด NOT NULL เสมอ
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_origin_shape;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_origin_shape CHECK (
    (origin = 'pipeline' AND "dealId" IS NOT NULL AND "sourceSalesOrderId" IS NULL)
    OR (origin = 'excise' AND "dealId" IS NULL AND "sourceSalesOrderId" IS NOT NULL)
  );
ALTER TABLE public.quotations ALTER COLUMN "dealId" DROP NOT NULL;

-- ฟังก์ชันกลางของ 0360 (อ่าน TG_TABLE_NAME + OLD.id) — ใช้กับตารางนี้ได้ตามเดิม
DROP TRIGGER IF EXISTS quotations_origin_immutable_trg ON public.quotations;
CREATE TRIGGER quotations_origin_immutable_trg
BEFORE UPDATE OF origin ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_record_origin_immutable();

CREATE INDEX IF NOT EXISTS quotations_source_sales_order_idx
  ON public.quotations ("sourceSalesOrderId") WHERE "sourceSalesOrderId" IS NOT NULL;
-- ใบที่ "รับแล้ว" ได้ใบเดียวต่อ SO ต้นทาง · ใบร่าง/ส่งแล้วกันซ้ำในแอป (เส้น Rev. แทรกใบใหม่ก่อนพลิกใบเดิม — ไม่ atomic)
CREATE UNIQUE INDEX IF NOT EXISTS quotations_one_accepted_excise_per_source_uidx
  ON public.quotations ("sourceSalesOrderId") WHERE origin = 'excise' AND status = 'accepted';

-- ── 2) sales_orders — origin 'excise' + ลิงก์ SO ต้นทาง + "ไม่เรียกเก็บในระบบ" บน SO ลูกค้า ─────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "sourceSalesOrderId" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledKind" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledReason" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledRef" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledById" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledByName" text;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_origin_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_origin_check CHECK (origin IN ('pipeline', 'historical', 'excise'));

-- สองสายแรกลอกจาก 0374 ตัวต่อตัว (สาย pipeline = 0360 ทุกตัวอักษร — ห้ามแน่นขึ้น) แล้วเพิ่มสาย excise:
--   ไม่มีดีล/โครงการ · มีใบเสนอราคา (ใบค่าสรรพสามิต) และ SO ต้นทาง · Actual = 0 · ไม่มี Rev. · ช่องย้อนหลัง/ยกเว้นด่านเงินว่าง ·
--   ไม่มีการตัดสิน "ไม่เรียกเก็บ" (นั่นเป็นของ SO ลูกค้า) · ยอม financeStatus และลายเซ็น (ต่างจากสาย historical)
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
    OR (
      origin = 'excise'
      AND "dealId" IS NULL
      AND "projectId" IS NULL
      AND "quotationId" IS NOT NULL
      AND "sourceSalesOrderId" IS NOT NULL
      AND "actualAmount" = 0
      AND "revisionNo" = 0
      AND "revisedFromId" IS NULL
      AND "historicalQuoteRef" IS NULL
      AND "historicalExpressRef" IS NULL
      AND "historicalInvoiceRef" IS NULL
      AND "historicalIntakeHash" IS NULL
      AND "paymentGateExemptAt" IS NULL
      AND "exciseNotBilledKind" IS NULL
    )
  );

-- ไม่มีดีลได้เฉพาะใบ excise · SO ต้นทางมีได้เฉพาะใบ excise — ต้องมาก่อนปลด NOT NULL เสมอ
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_deal_by_origin;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_deal_by_origin CHECK (
    (origin = 'excise') = ("dealId" IS NULL)
    AND ("sourceSalesOrderId" IS NULL OR origin = 'excise')
  );
ALTER TABLE public.sales_orders ALTER COLUMN "dealId" DROP NOT NULL;

-- "ไม่เรียกเก็บในระบบ" — ครบทั้งชุดหรือว่างทั้งชุด (ถอนการตัดสิน = ล้างทุกช่อง) · เฉพาะใบ pipeline ·
-- เหตุผล 10–500 ตัว ตามแบบ payment_gate_exempt_sane (0360) · เลขอ้างอิง (Express / เลข QT) ≤ 100
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_excise_not_billed_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_excise_not_billed_shape CHECK (
    (
      "exciseNotBilledKind" IS NULL AND "exciseNotBilledReason" IS NULL AND "exciseNotBilledRef" IS NULL
      AND "exciseNotBilledAt" IS NULL AND "exciseNotBilledById" IS NULL AND "exciseNotBilledByName" IS NULL
    )
    OR (
      origin = 'pipeline'
      AND "exciseNotBilledKind" IN ('collected_outside', 'included_in_price', 'not_liable')
      AND char_length(btrim("exciseNotBilledReason")) BETWEEN 10 AND 500
      AND ("exciseNotBilledRef" IS NULL OR char_length("exciseNotBilledRef") <= 100)
      AND "exciseNotBilledAt" IS NOT NULL
      AND "exciseNotBilledById" IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS sales_orders_source_sales_order_idx
  ON public.sales_orders ("sourceSalesOrderId") WHERE "sourceSalesOrderId" IS NOT NULL;

-- ── 3) ลิงก์ SO ต้นทางคือสมอของสิทธิ์ (ใบไม่มีดีลเห็นได้ตามทีมของดีลต้นทาง) ⇒ แก้ไม่ได้หลังเกิด ─────────────
CREATE OR REPLACE FUNCTION public.guard_source_sales_order_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."sourceSalesOrderId" IS DISTINCT FROM OLD."sourceSalesOrderId" THEN
    RAISE EXCEPTION 'source_sales_order_immutable: % %', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_source_sales_order_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS quotations_source_so_immutable_trg ON public.quotations;
CREATE TRIGGER quotations_source_so_immutable_trg
BEFORE UPDATE OF "sourceSalesOrderId" ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_source_sales_order_immutable();

DROP TRIGGER IF EXISTS sales_orders_source_so_immutable_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_source_so_immutable_trg
BEFORE UPDATE OF "sourceSalesOrderId" ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_source_sales_order_immutable();

-- ── 4) ชื่อหมวด 04-003 — nameEn เดิมเป็นคำไทย "ค่าสรรพสามิต" · nameTh ว่าง · isExcise ยัง false (ห้ามติ๊ก) ──────
UPDATE public.product_types
   SET "nameTh" = 'ค่าภาษีสรรพสามิต', "nameEn" = 'Excise tax recharge'
 WHERE "mainCategoryCode" = '04' AND "typeCode" = '003';

COMMIT;

NOTIFY pgrst, 'reload schema';
