-- 0105 - Private storage for quotation Won evidence.
-- Renumbered from 0104 because 0104_inquiries.sql already owns that version.
-- This is idempotent, so environments that ran the earlier manual SQL are safe.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-evidence', 'sales-evidence', false)
ON CONFLICT (id) DO UPDATE
SET public = false;
