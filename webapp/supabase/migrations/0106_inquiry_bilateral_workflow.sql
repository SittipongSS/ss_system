-- 0106 - Bilateral SA <-> RD inquiry workflow.
-- Separate requested/SLA/committed dates, acknowledgement locks, two-party
-- closure, responder details, accurate first-responder KPI credit, and tasks
-- linked to an individual message.

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS "requestedDueDate" date,
  ADD COLUMN IF NOT EXISTS "committedDueDate" date,
  ADD COLUMN IF NOT EXISTS "committedDueBy" text,
  ADD COLUMN IF NOT EXISTS "committedDueAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "committedDueAcknowledgedBy" text,
  ADD COLUMN IF NOT EXISTS "committedDueAcknowledgedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "acceptedBy" text,
  ADD COLUMN IF NOT EXISTS "acceptedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "answeredById" text,
  ADD COLUMN IF NOT EXISTS "answeredByName" text,
  ADD COLUMN IF NOT EXISTS "responderDetail" text,
  ADD COLUMN IF NOT EXISTS "responderDetailUpdatedBy" text,
  ADD COLUMN IF NOT EXISTS "responderDetailUpdatedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "requesterCloseConfirmedBy" text,
  ADD COLUMN IF NOT EXISTS "requesterCloseConfirmedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "responderCloseConfirmedBy" text,
  ADD COLUMN IF NOT EXISTS "responderCloseConfirmedAt" timestamptz;

ALTER TABLE public.inquiry_messages
  ADD COLUMN IF NOT EXISTS "editedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "acknowledgedBy" text,
  ADD COLUMN IF NOT EXISTS "acknowledgedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "deletedBy" text,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;

ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS "inquiryMessageId" text;

CREATE INDEX IF NOT EXISTS personal_tasks_inquiry_message_idx
  ON public.personal_tasks ("inquiryMessageId");

NOTIFY pgrst, 'reload schema';
