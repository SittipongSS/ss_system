-- 0062 - Product price history for Sales Planning quotations.
-- Product master remains the write owner for current prices; quotation lines
-- will later freeze the price snapshot they used. This table records each
-- product price baseline/change at the API layer.

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId" text NOT NULL,
  "changedBy" text,
  "changedByName" text,
  "changeType" text NOT NULL DEFAULT 'update'
    CHECK ("changeType" IN ('create', 'update')),
  "costPriceBefore" numeric,
  "costPriceAfter" numeric,
  "retailPriceIncVatBefore" numeric,
  "retailPriceIncVatAfter" numeric,
  "retailPriceExVatBefore" numeric,
  "retailPriceExVatAfter" numeric,
  "exciseTaxBefore" numeric,
  "exciseTaxAfter" numeric,
  "localTaxBefore" numeric,
  "localTaxAfter" numeric,
  "currency" text NOT NULL DEFAULT 'THB',
  "source" text NOT NULL DEFAULT 'products-api',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS product_price_history_product_created_idx
  ON public.product_price_history ("productId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS product_price_history_changed_by_idx
  ON public.product_price_history ("changedBy", "createdAt" DESC);

NOTIFY pgrst, 'reload schema';
