-- Migrate legacy 2-state order statuses to the new 3-state model.
--   pending_payment -> pending   (awaiting customer payment, Sales step)
--   cleared         -> complete  (tax paid, releasable)
-- Old `cleared` rows already carry a "clearedAt" timestamp, so it is left as-is.
-- There is no legacy status that maps to the new intermediate `received` state.
--
-- Run once via the Supabase SQL editor or CLI after deploying the 3-state code.

update public.orders set status = 'pending'  where status = 'pending_payment';
update public.orders set status = 'complete' where status = 'cleared';
