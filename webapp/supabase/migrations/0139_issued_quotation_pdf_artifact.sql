-- Phase 7C (D-7C-1): PDF ไบนารีของใบเสนอราคาที่ออกจริง (immutable).
-- issued_document_artifacts เดิมเก็บ HTML canonical แบบ text (locked text/html) — PDF เป็น
-- ไบนารีจึงเก็บใน private bucket 'issued-quotation-pdf' ส่วนตารางนี้เก็บ metadata อ้าง
-- issued_documents แบบ 1:1 (path/sha256/size/mime + generatorVersion) ตาม contract Phase 7B.
-- เข้าถึงผ่าน service-role ในแอปเท่านั้น (ไม่พึ่ง storage RLS — เหมือน bucket อื่นของระบบ).

-- bucket ส่วนตัว (เหมือน 0105/0122): public=false + จำกัดชนิด/ขนาดไฟล์
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('issued-quotation-pdf', 'issued-quotation-pdf', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.issued_document_pdf_artifacts (
  id                    text PRIMARY KEY,
  "issuedDocumentId"    text NOT NULL UNIQUE REFERENCES public.issued_documents(id) ON DELETE RESTRICT,
  "storageBucket"       text NOT NULL CHECK (length(btrim("storageBucket")) BETWEEN 1 AND 200),
  "storagePath"         text NOT NULL CHECK (length(btrim("storagePath")) BETWEEN 1 AND 400),
  "mimeType"            text NOT NULL DEFAULT 'application/pdf' CHECK ("mimeType" IN ('application/pdf')),
  "sha256"              text NOT NULL CHECK ("sha256" ~ '^sha256:[0-9a-f]{64}$'),
  "sizeBytes"           integer NOT NULL CHECK ("sizeBytes" > 0),
  "generatorVersion"    text NOT NULL CHECK (length(btrim("generatorVersion")) BETWEEN 1 AND 60),
  "createdAt"           timestamptz NOT NULL DEFAULT now()
);

-- immutable เหมือน artifact HTML: ห้าม UPDATE/DELETE (reuse guard เดิมจาก mig 0130).
-- INSERT ยังทำได้ (idempotent ผ่าน UNIQUE(issuedDocumentId) + ON CONFLICT DO NOTHING ฝั่งแอป).
DROP TRIGGER IF EXISTS issued_document_pdf_artifacts_guard ON public.issued_document_pdf_artifacts;
CREATE TRIGGER issued_document_pdf_artifacts_guard
BEFORE UPDATE OR DELETE ON public.issued_document_pdf_artifacts
FOR EACH ROW EXECUTE FUNCTION public.guard_issued_document_immutable();

ALTER TABLE public.issued_document_pdf_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issued_document_pdf_artifacts FROM anon, authenticated;
GRANT ALL ON TABLE public.issued_document_pdf_artifacts TO service_role;
