-- 0067 - PM shipment preparation document.
-- First slice is document-only: PM prepares/prints a warehouse handoff sheet.
-- Warehouse status tracking remains out of scope for this phase.

CREATE TABLE IF NOT EXISTS public.shipment_prep (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  "projectCode" text,
  "prepNumber" text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'printed', 'cancelled')),
  "prepDate" date NOT NULL DEFAULT CURRENT_DATE,
  "customerId" text REFERENCES public.customers(id) ON DELETE SET NULL,
  "customerName" text,
  "dueDate" date,
  remarks text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shipment_prep_project_uidx
  ON public.shipment_prep ("projectId");

CREATE INDEX IF NOT EXISTS shipment_prep_project_idx
  ON public.shipment_prep ("projectId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS shipment_prep_status_idx
  ON public.shipment_prep (status);

CREATE TABLE IF NOT EXISTS public.shipment_prep_lines (
  id text PRIMARY KEY,
  "shipmentPrepId" text NOT NULL REFERENCES public.shipment_prep(id) ON DELETE CASCADE,
  "productId" text REFERENCES public.products(id) ON DELETE SET NULL,
  "fgCode" text,
  description text,
  qty numeric NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit text,
  note text,
  "sortOrder" integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipment_prep_lines_prep_idx
  ON public.shipment_prep_lines ("shipmentPrepId", "sortOrder");

CREATE INDEX IF NOT EXISTS shipment_prep_lines_product_idx
  ON public.shipment_prep_lines ("productId");

ALTER TABLE public.shipment_prep ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_prep_lines ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
