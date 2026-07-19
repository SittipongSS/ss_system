-- 0123 - Phase 6A: versioned controlled document standards.
--
-- Form identity, effective date, accent and guarded numbering metadata are
-- versioned independently per document key. Production print consumers remain
-- on their existing constants until immutable issued snapshots arrive in Phase 7.

CREATE TABLE IF NOT EXISTS public.document_standards (
  "documentKey"         text PRIMARY KEY,
  "publishedVersionId" text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim("documentKey")) BETWEEN 1 AND 50)
);

CREATE TABLE IF NOT EXISTS public.document_standard_versions (
  id                    text PRIMARY KEY,
  "documentKey"         text NOT NULL REFERENCES public.document_standards("documentKey") ON DELETE RESTRICT,
  "baseVersionId"       text REFERENCES public.document_standard_versions(id) ON DELETE RESTRICT,
  "versionNumber"       integer NOT NULL CHECK ("versionNumber" > 0),
  status                text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  "titleTh"             text NOT NULL CHECK (length(btrim("titleTh")) BETWEEN 1 AND 150),
  "titleEn"             text CHECK ("titleEn" IS NULL OR length("titleEn") <= 150),
  "formCode"            text NOT NULL CHECK (
    length("formCode") BETWEEN 1 AND 40
    AND "formCode" ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
  ),
  revision              text NOT NULL CHECK (
    length(revision) BETWEEN 1 AND 20
    AND revision ~ '^[A-Z0-9][A-Z0-9._-]*$'
  ),
  "effectiveDate"       date NOT NULL,
  "accentKey"           text NOT NULL CHECK ("accentKey" IN ('terracotta', 'teal', 'amber', 'green', 'navy')),
  "numberingPattern"    text NOT NULL CHECK (length(btrim("numberingPattern")) BETWEEN 1 AND 120),
  "changeNote"          text CHECK ("changeNote" IS NULL OR length("changeNote") <= 500),
  "createdById"         text NOT NULL,
  "createdByName"       text,
  "createdByRole"       text,
  "updatedById"         text NOT NULL,
  "updatedByName"       text,
  "updatedByRole"       text,
  "publishedById"       text,
  "publishedByName"     text,
  "publishedByRole"     text,
  "archivedById"        text,
  "archivedByName"      text,
  "archivedByRole"      text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "publishedAt"         timestamptz,
  "archivedAt"          timestamptz,
  UNIQUE ("documentKey", "versionNumber"),
  CHECK (status <> 'draft' OR ("publishedAt" IS NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'published' OR ("publishedAt" IS NOT NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'archived' OR "archivedAt" IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_standards_published_version_fk'
  ) THEN
    ALTER TABLE public.document_standards
      ADD CONSTRAINT document_standards_published_version_fk
      FOREIGN KEY ("publishedVersionId")
      REFERENCES public.document_standard_versions(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS document_standard_versions_one_draft_idx
  ON public.document_standard_versions ("documentKey") WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS document_standard_versions_one_published_idx
  ON public.document_standard_versions ("documentKey") WHERE status = 'published';

CREATE INDEX IF NOT EXISTS document_standard_versions_history_idx
  ON public.document_standard_versions ("documentKey", "versionNumber" DESC);

CREATE OR REPLACE FUNCTION public.guard_document_standard_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document_standard_version_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."documentKey" IS DISTINCT FROM OLD."documentKey"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'document_standard_version_identity_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'document_standard_version_archived_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'document_standard_version_published_immutable';
  END IF;

  IF NEW.status <> 'draft' AND (
    NEW."titleTh" IS DISTINCT FROM OLD."titleTh"
    OR NEW."titleEn" IS DISTINCT FROM OLD."titleEn"
    OR NEW."formCode" IS DISTINCT FROM OLD."formCode"
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW."effectiveDate" IS DISTINCT FROM OLD."effectiveDate"
    OR NEW."accentKey" IS DISTINCT FROM OLD."accentKey"
    OR NEW."numberingPattern" IS DISTINCT FROM OLD."numberingPattern"
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'document_standard_version_transition_payload_changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_standard_versions_guard ON public.document_standard_versions;
CREATE TRIGGER document_standard_versions_guard
BEFORE UPDATE OR DELETE ON public.document_standard_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_document_standard_version();

INSERT INTO public.document_standards ("documentKey")
VALUES ('quotation'), ('salesOrder')
ON CONFLICT ("documentKey") DO NOTHING;

INSERT INTO public.document_standard_versions (
  id, "documentKey", "versionNumber", status,
  "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
VALUES
  (
    'document-standard-quotation-v1', 'quotation', 1, 'published',
    'ใบเสนอราคา', 'QUOTATION', 'FM-SA-01', '00', DATE '2025-05-08', 'terracotta',
    'QT-{YY}{MM}{RUNNING:4}-{REVISION}',
    'นำเข้าจากค่ามาตรฐานเอกสารเดิมก่อน Phase 6A',
    'migration-0123', 'Migration 0123', 'system',
    'migration-0123', 'Migration 0123', 'system',
    'migration-0123', 'Migration 0123', 'system', now()
  ),
  (
    'document-standard-sales-order-v1', 'salesOrder', 1, 'published',
    'ใบสั่งขาย', 'SALES ORDER', 'FM-SA-03', '00', DATE '2025-05-08', 'teal',
    'SO-{YY}{MM}{RUNNING:4}-{REVISION}',
    'นำเข้าจากค่ามาตรฐานเอกสารเดิมก่อน Phase 6A',
    'migration-0123', 'Migration 0123', 'system',
    'migration-0123', 'Migration 0123', 'system',
    'migration-0123', 'Migration 0123', 'system', now()
  )
ON CONFLICT (id) DO NOTHING;

UPDATE public.document_standards
SET "publishedVersionId" = CASE "documentKey"
  WHEN 'quotation' THEN 'document-standard-quotation-v1'
  WHEN 'salesOrder' THEN 'document-standard-sales-order-v1'
END,
"updatedAt" = now()
WHERE "documentKey" IN ('quotation', 'salesOrder') AND "publishedVersionId" IS NULL;

CREATE OR REPLACE FUNCTION public.create_document_standard_draft(
  p_document_key text,
  p_draft_id text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.document_standards%ROWTYPE;
  v_published public.document_standard_versions%ROWTYPE;
  v_draft public.document_standard_versions%ROWTYPE;
  v_next integer;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_document_key), '') IS NULL
     OR NULLIF(btrim(p_draft_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'document_standard_actor_required';
  END IF;

  SELECT * INTO v_root
  FROM public.document_standards
  WHERE "documentKey" = p_document_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_not_found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_standard_versions
    WHERE "documentKey" = v_root."documentKey" AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'document_standard_draft_exists';
  END IF;

  SELECT * INTO v_published
  FROM public.document_standard_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_published_missing'; END IF;

  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.document_standard_versions
  WHERE "documentKey" = v_root."documentKey";

  INSERT INTO public.document_standard_versions (
    id, "documentKey", "baseVersionId", "versionNumber", status,
    "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
    "changeNote", "createdById", "createdByName", "createdByRole",
    "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_draft_id, v_root."documentKey", v_published.id, v_next, 'draft',
    v_published."titleTh", v_published."titleEn", v_published."formCode", v_published.revision,
    v_published."effectiveDate", v_published."accentKey", v_published."numberingPattern",
    NULL, p_actor_id, p_actor_name, p_actor_role,
    p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;

  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_document_standard_draft_atomic(
  p_version_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.document_standards%ROWTYPE;
  v_draft public.document_standard_versions%ROWTYPE;
  v_published public.document_standard_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft
  FROM public.document_standard_versions
  WHERE id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_version_not_found'; END IF;

  SELECT * INTO v_root
  FROM public.document_standards
  WHERE "documentKey" = v_draft."documentKey"
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_not_found'; END IF;

  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'document_standard_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'document_standard_draft_stale';
  END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN
    RAISE EXCEPTION 'document_standard_change_note_required';
  END IF;

  SELECT * INTO v_published
  FROM public.document_standard_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_published_missing'; END IF;

  UPDATE public.document_standard_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedAt" = v_now
  WHERE id = v_published.id
  RETURNING * INTO v_published;

  UPDATE public.document_standard_versions
  SET status = 'published',
      "publishedById" = p_actor_id,
      "publishedByName" = p_actor_name,
      "publishedByRole" = p_actor_role,
      "publishedAt" = v_now,
      "updatedById" = p_actor_id,
      "updatedByName" = p_actor_name,
      "updatedByRole" = p_actor_role,
      "updatedAt" = v_now
  WHERE id = v_draft.id
  RETURNING * INTO v_draft;

  UPDATE public.document_standards
  SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE "documentKey" = v_root."documentKey";

  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_document_standard_draft_atomic(
  p_version_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_draft public.document_standard_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft
  FROM public.document_standard_versions
  WHERE id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'document_standard_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'document_standard_draft_stale';
  END IF;

  UPDATE public.document_standard_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedById" = p_actor_id,
      "updatedByName" = p_actor_name,
      "updatedByRole" = p_actor_role,
      "updatedAt" = v_now
  WHERE id = v_draft.id
  RETURNING * INTO v_draft;

  RETURN to_jsonb(v_draft);
END;
$$;

ALTER TABLE public.document_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_standard_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.document_standards, public.document_standard_versions FROM anon, authenticated;
GRANT ALL ON TABLE public.document_standards, public.document_standard_versions TO service_role;

REVOKE ALL ON FUNCTION public.create_document_standard_draft(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_document_standard_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_document_standard_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_document_standard_draft(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_document_standard_draft_atomic(text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_document_standard_draft_atomic(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Remove the Phase 6A settings page/API consumers first; Production print
--    still uses documentBrand.js constants and is unaffected.
-- 2) Keep both tables and their immutable version history after real users
--    publish a standard or Phase 5B references a version.
-- 3) Functions and UI can be disabled independently without deleting evidence.
