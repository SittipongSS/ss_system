-- 0130 - Phase 7B: immutable issued-document snapshot + canonical artifact.
--
-- When a quotation is approved (FM-SA-01) the application captures an immutable
-- snapshot that pins the resolved commercial content and the exact versions used
-- (document standard, optional commercial preset, signature evidence) plus a
-- canonical HTML artifact and content fingerprint. Reprints render from the
-- snapshot, never from live data. Phase 7B stores the artifact inline as
-- canonical HTML; binary PDF storage is deferred to Phase 7C.
--
-- Existing quotation print consumers and data are intentionally not changed and
-- no legacy documents are backfilled.

CREATE TABLE IF NOT EXISTS public.issued_documents (
  id                          text PRIMARY KEY,
  "documentType"              text NOT NULL CHECK ("documentType" IN ('quotation')),
  "documentId"                text NOT NULL,
  "quotationId"               text REFERENCES public.quotations(id) ON DELETE RESTRICT,
  "documentNumber"            text NOT NULL CHECK (length(btrim("documentNumber")) BETWEEN 1 AND 100),
  "issueSequence"             integer NOT NULL CHECK ("issueSequence" > 0),
  "contentFingerprint"        text NOT NULL CHECK ("contentFingerprint" ~ '^sha256:[0-9a-f]{64}$'),
  "resolvedPayload"           jsonb NOT NULL CHECK (jsonb_typeof("resolvedPayload") = 'object'),
  "documentStandardVersionId" text NOT NULL REFERENCES public.document_standard_versions(id) ON DELETE RESTRICT,
  "commercialPresetVersionId" text REFERENCES public.commercial_preset_versions(id) ON DELETE RESTRICT,
  "signatureEvidenceId"       text NOT NULL REFERENCES public.document_signature_evidence(id) ON DELETE RESTRICT,
  "layoutTemplateVersion"     text NOT NULL CHECK (length(btrim("layoutTemplateVersion")) BETWEEN 1 AND 60),
  "locale"                    text NOT NULL CHECK (length(btrim("locale")) BETWEEN 2 AND 20),
  "issuedAt"                  timestamptz NOT NULL,
  "issuedBy"                  text NOT NULL CHECK (length(btrim("issuedBy")) > 0),
  "issuedByName"              text,
  "createdAt"                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("documentType", "documentId", "issueSequence"),
  UNIQUE ("documentType", "documentId", "contentFingerprint"),
  CHECK ("documentType" = 'quotation' AND "quotationId" IS NOT NULL AND "quotationId" = "documentId")
);

CREATE TABLE IF NOT EXISTS public.issued_document_artifacts (
  id                    text PRIMARY KEY,
  "issuedDocumentId"    text NOT NULL UNIQUE REFERENCES public.issued_documents(id) ON DELETE RESTRICT,
  "mimeType"            text NOT NULL DEFAULT 'text/html' CHECK ("mimeType" IN ('text/html')),
  "content"             text NOT NULL CHECK (length("content") > 0),
  "sha256"              text NOT NULL CHECK ("sha256" ~ '^sha256:[0-9a-f]{64}$'),
  "sizeBytes"           integer NOT NULL CHECK ("sizeBytes" > 0),
  "generatorVersion"    text NOT NULL CHECK (length(btrim("generatorVersion")) BETWEEN 1 AND 60),
  "createdAt"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issued_documents_document_idx
  ON public.issued_documents ("documentType", "documentId", "issueSequence" DESC);
CREATE INDEX IF NOT EXISTS issued_documents_signature_evidence_idx
  ON public.issued_documents ("signatureEvidenceId");
CREATE INDEX IF NOT EXISTS issued_documents_standard_version_idx
  ON public.issued_documents ("documentStandardVersionId");

-- Snapshots and artifacts are write-once; block every UPDATE/DELETE at the row level.
CREATE OR REPLACE FUNCTION public.guard_issued_document_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'issued_document_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'issued_document_update_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS issued_documents_guard ON public.issued_documents;
CREATE TRIGGER issued_documents_guard
BEFORE UPDATE OR DELETE ON public.issued_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_issued_document_immutable();

DROP TRIGGER IF EXISTS issued_document_artifacts_guard ON public.issued_document_artifacts;
CREATE TRIGGER issued_document_artifacts_guard
BEFORE UPDATE OR DELETE ON public.issued_document_artifacts
FOR EACH ROW EXECUTE FUNCTION public.guard_issued_document_immutable();

CREATE OR REPLACE FUNCTION public.capture_issued_quotation_snapshot_atomic(
  p_snapshot_id text,
  p_artifact_id text,
  p_quotation_id text,
  p_content_fingerprint text,
  p_resolved_payload jsonb,
  p_artifact_html text,
  p_artifact_sha256 text,
  p_document_standard_version_id text,
  p_commercial_preset_version_id text,
  p_signature_evidence_id text,
  p_layout_version text,
  p_locale text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_standard_version public.document_standard_versions%ROWTYPE;
  v_preset_version public.commercial_preset_versions%ROWTYPE;
  v_existing public.issued_documents%ROWTYPE;
  v_snapshot public.issued_documents%ROWTYPE;
  v_artifact public.issued_document_artifacts%ROWTYPE;
  v_sequence integer;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_snapshot_id), '') IS NULL
     OR NULLIF(btrim(p_artifact_id), '') IS NULL
     OR NULLIF(btrim(p_quotation_id), '') IS NULL
     OR NULLIF(btrim(p_signature_evidence_id), '') IS NULL
     OR NULLIF(btrim(p_document_standard_version_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL
     OR NULLIF(btrim(p_layout_version), '') IS NULL
     OR NULLIF(btrim(p_locale), '') IS NULL THEN
    RAISE EXCEPTION 'issued_document_identity_required';
  END IF;
  IF p_content_fingerprint IS NULL OR p_content_fingerprint !~ '^sha256:[0-9a-f]{64}$'
     OR p_artifact_sha256 IS NULL OR p_artifact_sha256 !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'issued_document_fingerprint_invalid';
  END IF;
  IF p_resolved_payload IS NULL OR jsonb_typeof(p_resolved_payload) <> 'object' THEN
    RAISE EXCEPTION 'issued_document_payload_invalid';
  END IF;
  IF NULLIF(btrim(p_artifact_html), '') IS NULL THEN
    RAISE EXCEPTION 'issued_document_artifact_invalid';
  END IF;

  -- Lock the quotation; only approved documents can be issued and the snapshot
  -- must bind to the same signature evidence produced at approval.
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issued_document_document_not_found'; END IF;
  IF v_quote."approvalStatus" <> 'approved' THEN
    RAISE EXCEPTION 'issued_document_document_state_invalid';
  END IF;
  IF v_quote."signatureEvidenceId" IS DISTINCT FROM p_signature_evidence_id THEN
    RAISE EXCEPTION 'issued_document_signature_mismatch';
  END IF;

  SELECT * INTO v_evidence
  FROM public.document_signature_evidence
  WHERE id = p_signature_evidence_id
    AND "documentType" = 'quotation'
    AND "documentId" = p_quotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'issued_document_signature_required'; END IF;
  IF v_evidence."documentStandardVersionId" IS DISTINCT FROM p_document_standard_version_id THEN
    RAISE EXCEPTION 'issued_document_standard_mismatch';
  END IF;

  SELECT * INTO v_standard_version
  FROM public.document_standard_versions
  WHERE id = p_document_standard_version_id AND "documentKey" = 'quotation';
  IF NOT FOUND THEN RAISE EXCEPTION 'issued_document_standard_missing'; END IF;

  IF NULLIF(btrim(p_commercial_preset_version_id), '') IS NOT NULL THEN
    SELECT * INTO v_preset_version
    FROM public.commercial_preset_versions
    WHERE id = p_commercial_preset_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'issued_document_preset_missing'; END IF;
  END IF;

  -- Idempotency: identical content for the same document returns the existing
  -- snapshot + artifact instead of creating a duplicate sequence. Safe to retry.
  SELECT * INTO v_existing
  FROM public.issued_documents
  WHERE "documentType" = 'quotation'
    AND "documentId" = p_quotation_id
    AND "contentFingerprint" = p_content_fingerprint;
  IF FOUND THEN
    SELECT * INTO v_artifact
    FROM public.issued_document_artifacts
    WHERE "issuedDocumentId" = v_existing.id;
    RETURN jsonb_build_object(
      'snapshot', to_jsonb(v_existing),
      'artifact', to_jsonb(v_artifact),
      'reused', true
    );
  END IF;

  SELECT COALESCE(max("issueSequence"), 0) + 1 INTO v_sequence
  FROM public.issued_documents
  WHERE "documentType" = 'quotation' AND "documentId" = p_quotation_id;

  INSERT INTO public.issued_documents (
    id, "documentType", "documentId", "quotationId", "documentNumber",
    "issueSequence", "contentFingerprint", "resolvedPayload",
    "documentStandardVersionId", "commercialPresetVersionId", "signatureEvidenceId",
    "layoutTemplateVersion", "locale", "issuedAt", "issuedBy", "issuedByName", "createdAt"
  ) VALUES (
    p_snapshot_id, 'quotation', p_quotation_id, p_quotation_id, v_quote."quoteNumber",
    v_sequence, p_content_fingerprint, p_resolved_payload,
    p_document_standard_version_id,
    NULLIF(btrim(p_commercial_preset_version_id), ''),
    p_signature_evidence_id,
    p_layout_version, p_locale, v_now, p_actor_id, p_actor_name, v_now
  ) RETURNING * INTO v_snapshot;

  INSERT INTO public.issued_document_artifacts (
    id, "issuedDocumentId", "mimeType", "content", "sha256", "sizeBytes",
    "generatorVersion", "createdAt"
  ) VALUES (
    p_artifact_id, v_snapshot.id, 'text/html', p_artifact_html, p_artifact_sha256,
    octet_length(p_artifact_html), p_layout_version, v_now
  ) RETURNING * INTO v_artifact;

  RETURN jsonb_build_object(
    'snapshot', to_jsonb(v_snapshot),
    'artifact', to_jsonb(v_artifact),
    'reused', false
  );
END;
$$;

ALTER TABLE public.issued_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issued_documents FROM anon, authenticated;
REVOKE ALL ON TABLE public.issued_document_artifacts FROM anon, authenticated;
GRANT ALL ON TABLE public.issued_documents TO service_role;
GRANT ALL ON TABLE public.issued_document_artifacts TO service_role;

REVOKE ALL ON FUNCTION public.capture_issued_quotation_snapshot_atomic(
  text, text, text, text, jsonb, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_issued_quotation_snapshot_atomic(
  text, text, text, text, jsonb, text, text, text, text, text, text, text, text, text
) TO service_role;

-- Rollback guidance:
-- 1) Disable the application snapshot caller and the reprint route first.
-- 2) Keep issued_documents and issued_document_artifacts and every referenced
--    quotation/standard/preset/signature row; never backfill or mutate them.
-- 3) Legacy reprint continues through the live quotePrint engine unchanged.

NOTIFY pgrst, 'reload schema';
