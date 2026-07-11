-- 0092 - ใบเสนอราคาเต็มรูป FM-SA-01 (Sales Revamp เฟส D).
-- ยกระดับ quotations (0065/0070) ตาม spec ผู้ใช้: เลขรัน QT-YYMMXXXX-R กันซ้ำที่ DB
-- (sequence ต่อเดือน — มติ #3 รีเซ็ตทุกเดือน), revision chain, ส่วนลดรายบรรทัด +
-- ส่วนลดท้ายใบ, เงื่อนไขการชำระ, VAT, template หมายเหตุต่อประเภทบริการ.

-- ── quotations: revision + ส่วนลด + เงื่อนไขชำระ + VAT ──
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "baseNumber" text,
  ADD COLUMN IF NOT EXISTS "revisionNo" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revisedFromId" text REFERENCES public.quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "discountType" text
    CHECK ("discountType" IS NULL OR "discountType" IN ('percent','amount')),
  ADD COLUMN IF NOT EXISTS "discountValue" numeric NOT NULL DEFAULT 0 CHECK ("discountValue" >= 0),
  ADD COLUMN IF NOT EXISTS "discountAmount" numeric NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
  ADD COLUMN IF NOT EXISTS "vatRate" numeric NOT NULL DEFAULT 0 CHECK ("vatRate" >= 0),
  ADD COLUMN IF NOT EXISTS "paymentTerms" text;

-- status เพิ่ม 'revised' (ใบเก่าที่ถูกออกแทนด้วย R ใหม่ — read-only)
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_check
  CHECK (status IN ('draft','sent','accepted','rejected','cancelled','revised'));

-- backfill ใบเดิม: baseNumber = เลขเดิม (revisionNo=0 จาก default)
UPDATE public.quotations SET "baseNumber" = "quoteNumber" WHERE "baseNumber" IS NULL;

CREATE INDEX IF NOT EXISTS quotations_base_number_idx ON public.quotations ("baseNumber");

-- ── quotation_lines: ส่วนลดรายบรรทัด ──
ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS "discountType" text
    CHECK ("discountType" IS NULL OR "discountType" IN ('percent','amount')),
  ADD COLUMN IF NOT EXISTS "discountValue" numeric NOT NULL DEFAULT 0 CHECK ("discountValue" >= 0),
  ADD COLUMN IF NOT EXISTS "discountAmount" numeric NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0);

-- ── เลขรันต่อเดือน (atomic ที่ DB — กันเลขซ้ำเมื่อสร้างพร้อมกัน) ──
CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  month text PRIMARY KEY,          -- 'YYMM' (ค.ศ. 2 หลัก + เดือน) — รีเซ็ตทุกเดือน
  "lastNo" integer NOT NULL DEFAULT 0
);
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_quote_number(p_month text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.quote_number_counters AS c (month, "lastNo")
  VALUES (p_month, 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo";
$$;

-- backfill ตัวนับจากเลขเดิม (รูปแบบเก่า QT-YYMM### 3 หลัก / ใหม่ QT-YYMMXXXX)
INSERT INTO public.quote_number_counters (month, "lastNo")
SELECT substring("quoteNumber" from 4 for 4) AS month,
       max(NULLIF(regexp_replace(split_part(substring("quoteNumber" from 8), '-', 1), '\D', '', 'g'), '')::int)
FROM public.quotations
WHERE "quoteNumber" ~ '^QT-\d{4}'
GROUP BY 1
ON CONFLICT (month) DO UPDATE SET "lastNo" = GREATEST(public.quote_number_counters."lastNo", EXCLUDED."lastNo");

-- ── template หมายเหตุ ต่อประเภทบริการ (supervisor จัดการ, ทุก sales เลือกใช้) ──
CREATE TABLE IF NOT EXISTS public.quote_note_templates (
  id text PRIMARY KEY,
  "serviceType" text NOT NULL DEFAULT 'general',   -- general / SCENT / NPD / RE-ORDER / diffuser / workshop …
  title text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_note_templates ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
