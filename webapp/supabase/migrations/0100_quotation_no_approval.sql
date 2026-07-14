-- Quotations no longer use an approval workflow. Keep the columns for
-- backward-compatible reads, but normalize every existing and future row.
ALTER TABLE public.quotations
  ALTER COLUMN "approvalStatus" SET DEFAULT 'not_required';

UPDATE public.quotations
SET
  "approvalStatus" = 'not_required',
  "approvalReason" = NULL,
  "approvalRequestedAt" = NULL,
  "approvalRequestedBy" = NULL,
  "approvalRequestedByName" = NULL,
  "approvalFingerprint" = NULL,
  "approvalNotes" = NULL,
  "approvedAt" = NULL,
  "approvedBy" = NULL,
  "approvedByName" = NULL
WHERE "approvalStatus" IS DISTINCT FROM 'not_required'
   OR "approvalReason" IS NOT NULL
   OR "approvalRequestedAt" IS NOT NULL
   OR "approvalRequestedBy" IS NOT NULL
   OR "approvalRequestedByName" IS NOT NULL
   OR "approvalFingerprint" IS NOT NULL
   OR "approvalNotes" IS NOT NULL
   OR "approvedAt" IS NOT NULL
   OR "approvedBy" IS NOT NULL
   OR "approvedByName" IS NOT NULL;
