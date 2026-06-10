-- Add orderQty and productionQty to project_products
alter table public.project_products
  add column if not exists "orderQty" text,
  add column if not exists "productionQty" text;
