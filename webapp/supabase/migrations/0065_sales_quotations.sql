-- 0065 - Sales Planning quotations.
-- Quotations are children of sales_deals. Lines freeze their selling unitPrice
-- at creation time so later product master price changes do not rewrite old
-- quotes.

CREATE TABLE IF NOT EXISTS public.quotations (
  id text PRIMARY KEY,
  "dealId" text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  "quoteNumber" text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'cancelled')),
  "quoteDate" date NOT NULL DEFAULT CURRENT_DATE,
  "validUntil" date,
  "customerId" text REFERENCES public.customers(id) ON DELETE SET NULL,
  "customerName" text,
  "subtotal" numeric NOT NULL DEFAULT 0 CHECK ("subtotal" >= 0),
  "vatAmount" numeric NOT NULL DEFAULT 0 CHECK ("vatAmount" >= 0),
  "totalAmount" numeric NOT NULL DEFAULT 0 CHECK ("totalAmount" >= 0),
  "acceptedAt" timestamptz,
  "acceptedBy" text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotations_deal_idx
  ON public.quotations ("dealId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS quotations_status_idx
  ON public.quotations (status);

CREATE TABLE IF NOT EXISTS public.quotation_lines (
  id text PRIMARY KEY,
  "quotationId" text NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  "productId" text REFERENCES public.products(id) ON DELETE SET NULL,
  "fgCode" text,
  description text,
  qty numeric NOT NULL DEFAULT 1 CHECK (qty > 0),
  "unitPrice" numeric NOT NULL DEFAULT 0 CHECK ("unitPrice" >= 0),
  "lineTotal" numeric NOT NULL DEFAULT 0 CHECK ("lineTotal" >= 0),
  "source" text NOT NULL DEFAULT 'manual',
  "sortOrder" integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_lines_quote_idx
  ON public.quotation_lines ("quotationId", "sortOrder");
CREATE INDEX IF NOT EXISTS quotation_lines_product_idx
  ON public.quotation_lines ("productId");

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
