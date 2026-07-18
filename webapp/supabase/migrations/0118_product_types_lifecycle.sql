-- 0118 - Product category lifecycle and operational metadata.
-- Codes remain immutable in the application because products, deals, projects,
-- timeline rules and the excise rule 01-002 reference the combined code.

ALTER TABLE public.product_types
  ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "deactivatedAt" timestamptz;

CREATE INDEX IF NOT EXISTS product_types_active_code_idx
  ON public.product_types ("isActive", "mainCategoryCode", "typeCode");

NOTIFY pgrst, 'reload schema';
