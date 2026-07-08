-- 0066 - Link excise registrations back to PM projects.
-- Tax remains the write owner of excise_registrations; PM only triggers a Tax
-- owned create action through API. The projectId is a traceability link.

ALTER TABLE public.excise_registrations
  ADD COLUMN IF NOT EXISTS "projectId" text;

CREATE INDEX IF NOT EXISTS excise_reg_project_idx
  ON public.excise_registrations ("projectId");

CREATE INDEX IF NOT EXISTS excise_reg_project_product_idx
  ON public.excise_registrations ("projectId", "productId");

NOTIFY pgrst, 'reload schema';
