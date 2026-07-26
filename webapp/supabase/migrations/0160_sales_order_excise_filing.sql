-- 0160 - Link excise filings to their approved Sale Order source.
-- One SO may create at most one filing. Tax line values remain snapshots so
-- later product-master changes never rewrite a filed amount.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "salesOrderId" text REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "amountToCollect" numeric,
  ADD COLUMN IF NOT EXISTS "collectedConfirmedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "collectedConfirmedBy" text,
  ADD COLUMN IF NOT EXISTS "docsDeliveredAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "docsDeliveredBy" text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_sales_order_unique_idx
  ON public.orders ("salesOrderId")
  WHERE "salesOrderId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_sales_order_status_idx
  ON public.orders ("salesOrderId", status)
  WHERE "salesOrderId" IS NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS "salesOrderLineId" text
    REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS order_items_sales_order_line_idx
  ON public.order_items ("salesOrderLineId")
  WHERE "salesOrderLineId" IS NOT NULL;

COMMENT ON COLUMN public.orders."salesOrderId"
  IS 'Approved Sale Order source. Unique: one SO creates one excise filing.';
COMMENT ON COLUMN public.orders."amountToCollect"
  IS 'Excise plus local tax snapshot communicated to the customer at creation.';
COMMENT ON COLUMN public.order_items."salesOrderLineId"
  IS 'Sale Order line used to derive this immutable tax snapshot.';
