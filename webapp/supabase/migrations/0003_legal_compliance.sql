-- ============================================================
--  Migration 0003: Legal / Excise compliance fields
--  Adds the data LG needs to file excise tax properly + an
--  approval/rejection audit trail. Safe & idempotent — run once
--  in the Supabase SQL editor. (New DBs get these via schema.sql.)
-- ============================================================

-- ---------- products: approval / rejection audit + taxable override ----------
-- approvedBy/At + approvedByName: who registered the product and when.
alter table public.products add column if not exists "approvedBy"     uuid;
alter table public.products add column if not exists "approvedByName" text;
alter table public.products add column if not exists "approvedAt"     timestamptz;
-- rejectionReason: set when LG sends a product back for correction (status='rejected').
alter table public.products add column if not exists "rejectionReason" text;
-- taxableOverride: LG is the legal authority on taxability. NULL = follow the
-- automatic FG-code rule; TRUE/FALSE = explicit LG override.
alter table public.products add column if not exists "taxableOverride" boolean;

-- ---------- orders: structured excise filing data ----------
-- taxDueDate: legal deadline to file/pay excise (date string, like deliveryDate).
alter table public.orders add column if not exists "taxDueDate"          text;
-- filing audit: who filed and when the order reached 'complete'.
alter table public.orders add column if not exists "filedAt"             timestamptz;
alter table public.orders add column if not exists "filedBy"             uuid;
alter table public.orders add column if not exists "filedByName"         text;
-- structured receipt from the Excise Dept (distinct from S&S receiptNumber).
alter table public.orders add column if not exists "exciseReceiptNumber" text;
-- actual amount paid to the Excise Dept (may differ from the computed totalTax).
alter table public.orders add column if not exists "exciseTaxPaidAmount" numeric;
-- reference of the ภส. form submitted (e.g. ภส.03-07).
alter table public.orders add column if not exists "taxFormRef"          text;
-- rejectionReason: set when LG sends an order back (status='rejected').
alter table public.orders add column if not exists "rejectionReason"     text;

-- NOTE: status is free-text. New values introduced by the app:
--   products: 'rejected'  (in addition to 'pending_legal' | 'approved')
--   orders:   'filing'    (LG started filing, awaiting Excise receipt)
--             'rejected'  (sent back for correction)
-- No CHECK constraint is added so legacy rows stay valid.
