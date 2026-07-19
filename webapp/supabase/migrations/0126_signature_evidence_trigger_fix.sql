-- 0126 - Keep signature-evidence pointer cleanup type-safe per document table.
--
-- Migration 0125 reused one trigger function for quotations and sales_orders.
-- PostgreSQL resolves NEW fields against the row type before the table-name
-- branch can protect them, so updating sales_orders.status failed because that
-- row has no approvalStatus field. Separate functions keep each NEW reference
-- bound to the table that owns the column.

CREATE OR REPLACE FUNCTION public.clear_inactive_quotation_signature_evidence_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."approvalStatus" IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_inactive_sales_order_signature_evidence_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
    NEW."approvalFingerprint" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_clear_signature_evidence_trg ON public.quotations;
CREATE TRIGGER quotations_clear_signature_evidence_trg
BEFORE UPDATE OF "approvalStatus" ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.clear_inactive_quotation_signature_evidence_pointer();

DROP TRIGGER IF EXISTS sales_orders_clear_signature_evidence_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_clear_signature_evidence_trg
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.clear_inactive_sales_order_signature_evidence_pointer();

DROP FUNCTION IF EXISTS public.clear_inactive_signature_evidence_pointer();

NOTIFY pgrst, 'reload schema';
