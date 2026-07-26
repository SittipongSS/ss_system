-- 0162 - Controlled excise-tax payment notice.
--
-- Adds the notice to Settings > Document standards, gives every tax filing an
-- immutable document number and a snapshot of the published standard used when
-- the filing was created. Existing filings keep their operational identity and
-- receive deterministic ET numbers ordered by creation time.

INSERT INTO public.document_standards ("documentKey")
VALUES ('exciseTaxNotice')
ON CONFLICT ("documentKey") DO NOTHING;

INSERT INTO public.document_standard_versions (
  id, "documentKey", "versionNumber", status,
  "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
VALUES (
  'document-standard-excise-tax-notice-v1', 'exciseTaxNotice', 1, 'published',
  'ใบแจ้งชำระค่าภาษีสรรพสามิต', 'EXCISE TAX PAYMENT NOTICE',
  'FM-TAX-01', '00', DATE '2026-07-26', 'amber',
  'ET-{YY}{MM}{RUNNING:4}-{REVISION}',
  'เพิ่มเอกสารแจ้งชำระค่าภาษีสรรพสามิตเป็นเอกสารควบคุมของระบบ',
  'migration-0162', 'Migration 0162', 'system',
  'migration-0162', 'Migration 0162', 'system',
  'migration-0162', 'Migration 0162', 'system', now()
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.document_standards
SET "publishedVersionId" = 'document-standard-excise-tax-notice-v1',
    "updatedAt" = now()
WHERE "documentKey" = 'exciseTaxNotice'
  AND "publishedVersionId" IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "taxNoticeNumber" text,
  ADD COLUMN IF NOT EXISTS "taxNoticeStandardVersionId" text
    REFERENCES public.document_standard_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "taxNoticeStandardSnapshot" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tax_notice_number_key
  ON public.orders ("taxNoticeNumber")
  WHERE "taxNoticeNumber" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.excise_tax_notice_number_counters (
  month text PRIMARY KEY,
  "lastNo" integer NOT NULL DEFAULT 0 CHECK ("lastNo" >= 0)
);

ALTER TABLE public.excise_tax_notice_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.excise_tax_notice_number_counters FROM anon, authenticated;
GRANT ALL ON TABLE public.excise_tax_notice_number_counters TO service_role;

WITH numbered AS (
  SELECT
    id,
    to_char(timezone('Asia/Bangkok', COALESCE("createdAt", now())), 'YYMM') AS month,
    row_number() OVER (
      PARTITION BY to_char(timezone('Asia/Bangkok', COALESCE("createdAt", now())), 'YYMM')
      ORDER BY "createdAt", id
    ) AS running_no
  FROM public.orders
  WHERE "taxNoticeNumber" IS NULL
)
UPDATE public.orders AS o
SET "taxNoticeNumber" = 'ET-' || n.month || lpad(n.running_no::text, 4, '0') || '-0',
    "taxNoticeStandardVersionId" = 'document-standard-excise-tax-notice-v1',
    "taxNoticeStandardSnapshot" = (
      SELECT to_jsonb(v)
      FROM public.document_standard_versions AS v
      WHERE v.id = 'document-standard-excise-tax-notice-v1'
    )
FROM numbered AS n
WHERE o.id = n.id;

INSERT INTO public.excise_tax_notice_number_counters (month, "lastNo")
SELECT
  substring("taxNoticeNumber" FROM '^ET-([0-9]{4})'),
  max(substring("taxNoticeNumber" FROM '^ET-[0-9]{4}([0-9]{4})-0$')::integer)
FROM public.orders
WHERE "taxNoticeNumber" ~ '^ET-[0-9]{8}-0$'
GROUP BY 1
ON CONFLICT (month) DO UPDATE
SET "lastNo" = GREATEST(
  public.excise_tax_notice_number_counters."lastNo",
  EXCLUDED."lastNo"
);

CREATE OR REPLACE FUNCTION public.assign_excise_tax_notice_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_standard public.document_standard_versions%ROWTYPE;
  v_local_time timestamp;
  v_month text;
  v_pattern text;
  v_width integer;
  v_running integer;
BEGIN
  IF NEW."taxNoticeNumber" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.* INTO v_standard
  FROM public.document_standards AS s
  JOIN public.document_standard_versions AS v
    ON v.id = s."publishedVersionId"
  WHERE s."documentKey" = 'exciseTaxNotice'
    AND v.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'excise_tax_notice_standard_missing';
  END IF;

  v_local_time := timezone('Asia/Bangkok', COALESCE(NEW."createdAt", now()));
  v_month := to_char(v_local_time, 'YYMM');
  v_pattern := COALESCE(
    NULLIF(btrim(v_standard."numberingPattern"), ''),
    'ET-{YY}{MM}{RUNNING:4}-{REVISION}'
  );
  v_width := COALESCE((substring(v_pattern FROM '\{RUNNING:(\d)\}'))::integer, 4);

  INSERT INTO public.excise_tax_notice_number_counters AS c (month, "lastNo")
  VALUES (v_month, 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running;

  IF v_running > power(10, v_width)::integer - 1 THEN
    RAISE EXCEPTION 'excise_tax_notice_monthly_sequence_exhausted';
  END IF;

  NEW."taxNoticeNumber" := v_pattern;
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{YYYY}', to_char(v_local_time, 'YYYY'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{YY}', to_char(v_local_time, 'YY'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{MM}', to_char(v_local_time, 'MM'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{DD}', to_char(v_local_time, 'DD'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{RUNNING:3}', lpad(v_running::text, 3, '0'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{RUNNING:4}', lpad(v_running::text, 4, '0'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{RUNNING:5}', lpad(v_running::text, 5, '0'));
  NEW."taxNoticeNumber" := replace(NEW."taxNoticeNumber", '{REVISION}', '0');
  NEW."taxNoticeStandardVersionId" := v_standard.id;
  NEW."taxNoticeStandardSnapshot" := to_jsonb(v_standard);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_excise_tax_notice_identity ON public.orders;
CREATE TRIGGER orders_assign_excise_tax_notice_identity
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assign_excise_tax_notice_identity();

NOTIFY pgrst, 'reload schema';
