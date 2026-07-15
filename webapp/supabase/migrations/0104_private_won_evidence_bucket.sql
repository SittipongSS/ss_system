-- 0104 - Private storage for quotation Won evidence.
-- The application uploads with the service-role client and streams downloads
-- through a scoped API. No storage.objects policy is added, so browser clients
-- cannot read the bucket directly.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-evidence', 'sales-evidence', false)
ON CONFLICT (id) DO UPDATE
SET public = false;
