-- 0070 - Quotation approval workflow.
-- Approval is tracked separately from quotation status so existing draft/sent/
-- accepted lifecycle stays stable.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "approvalStatus" text NOT NULL DEFAULT 'not_required'
    CHECK ("approvalStatus" IN ('not_required', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS "approvalReason" text,
  ADD COLUMN IF NOT EXISTS "approvalRequestedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "approvalRequestedBy" text,
  ADD COLUMN IF NOT EXISTS "approvalRequestedByName" text,
  ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "approvedBy" text,
  ADD COLUMN IF NOT EXISTS "approvedByName" text,
  ADD COLUMN IF NOT EXISTS "approvalNotes" text;

CREATE INDEX IF NOT EXISTS quotations_approval_status_idx
  ON public.quotations ("approvalStatus", status);

NOTIFY pgrst, 'reload schema';
