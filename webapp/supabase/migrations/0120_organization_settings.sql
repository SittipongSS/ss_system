-- 0120 - Phase 4A: versioned organization settings.
--
-- Company data is managed as one system profile with immutable Published/
-- Archived versions. Draft writes and lifecycle transitions are server-only.

CREATE TABLE IF NOT EXISTS public.organization_settings (
  id                    text PRIMARY KEY,
  "publishedVersionId" text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 'primary')
);

CREATE TABLE IF NOT EXISTS public.organization_setting_versions (
  id                      text PRIMARY KEY,
  "organizationId"        text NOT NULL REFERENCES public.organization_settings(id) ON DELETE RESTRICT,
  "baseVersionId"         text REFERENCES public.organization_setting_versions(id) ON DELETE RESTRICT,
  "versionNumber"         integer NOT NULL CHECK ("versionNumber" > 0),
  status                  text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  "legalNameTh"           text NOT NULL CHECK (length(btrim("legalNameTh")) BETWEEN 1 AND 200),
  "legalNameEn"           text CHECK ("legalNameEn" IS NULL OR length("legalNameEn") <= 200),
  "taxId"                 varchar(13) NOT NULL CHECK ("taxId" ~ '^[0-9]{13}$'),
  "branchCode"            varchar(5) NOT NULL DEFAULT '00000' CHECK ("branchCode" ~ '^[0-9]{5}$'),
  "registeredAddressTh"   text NOT NULL CHECK (length(btrim("registeredAddressTh")) BETWEEN 1 AND 1000),
  "registeredAddressEn"   text CHECK ("registeredAddressEn" IS NULL OR length("registeredAddressEn") <= 1000),
  phone                   text CHECK (phone IS NULL OR length(phone) <= 50),
  email                   text CHECK (email IS NULL OR length(email) <= 254),
  "lineId"                text CHECK ("lineId" IS NULL OR length("lineId") <= 100),
  website                 text CHECK (website IS NULL OR length(website) <= 255),
  "changeNote"            text CHECK ("changeNote" IS NULL OR length("changeNote") <= 500),
  "createdById"           text NOT NULL,
  "createdByName"         text,
  "createdByRole"         text,
  "updatedById"           text NOT NULL,
  "updatedByName"         text,
  "updatedByRole"         text,
  "publishedById"         text,
  "publishedByName"       text,
  "publishedByRole"       text,
  "archivedById"          text,
  "archivedByName"        text,
  "archivedByRole"        text,
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  "publishedAt"           timestamptz,
  "archivedAt"            timestamptz,
  UNIQUE ("organizationId", "versionNumber"),
  CHECK (status <> 'draft' OR ("publishedAt" IS NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'published' OR ("publishedAt" IS NOT NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'archived' OR "archivedAt" IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_published_version_fk'
  ) THEN
    ALTER TABLE public.organization_settings
      ADD CONSTRAINT organization_settings_published_version_fk
      FOREIGN KEY ("publishedVersionId")
      REFERENCES public.organization_setting_versions(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS organization_setting_versions_one_draft_idx
  ON public.organization_setting_versions ("organizationId") WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS organization_setting_versions_one_published_idx
  ON public.organization_setting_versions ("organizationId") WHERE status = 'published';

CREATE INDEX IF NOT EXISTS organization_setting_versions_history_idx
  ON public.organization_setting_versions ("organizationId", "versionNumber" DESC);

CREATE OR REPLACE FUNCTION public.guard_organization_setting_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'organization_setting_version_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'organization_setting_version_identity_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'organization_setting_version_archived_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'organization_setting_version_published_immutable';
  END IF;

  -- A lifecycle transition may only publish/archive the Draft payload already
  -- stored in the database. It cannot smuggle new company data into the same UPDATE.
  IF NEW.status <> 'draft' AND (
    NEW."legalNameTh" IS DISTINCT FROM OLD."legalNameTh"
    OR NEW."legalNameEn" IS DISTINCT FROM OLD."legalNameEn"
    OR NEW."taxId" IS DISTINCT FROM OLD."taxId"
    OR NEW."branchCode" IS DISTINCT FROM OLD."branchCode"
    OR NEW."registeredAddressTh" IS DISTINCT FROM OLD."registeredAddressTh"
    OR NEW."registeredAddressEn" IS DISTINCT FROM OLD."registeredAddressEn"
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW."lineId" IS DISTINCT FROM OLD."lineId"
    OR NEW.website IS DISTINCT FROM OLD.website
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'organization_setting_version_transition_payload_changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_setting_versions_guard ON public.organization_setting_versions;
CREATE TRIGGER organization_setting_versions_guard
BEFORE UPDATE OR DELETE ON public.organization_setting_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_organization_setting_version();

INSERT INTO public.organization_settings (id)
VALUES ('primary')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_setting_versions (
  id, "organizationId", "versionNumber", status,
  "legalNameTh", "legalNameEn", "taxId", "branchCode",
  "registeredAddressTh", "registeredAddressEn", phone, email, "lineId", website,
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
VALUES (
  'organization-baseline-v1', 'primary', 1, 'published',
  'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด',
  'SCENT & SENSE LABORATORY CO., LTD.',
  '0105557081665', '00000',
  '2/4 ซอยเพชรเกษม 35/1 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',
  NULL, '02-000-7722', NULL, '@perfumefactory', 'www.scentandsense.co.th',
  'นำเข้าจากค่าเริ่มต้นของระบบก่อน Phase 4A',
  'migration-0120', 'Migration 0120', 'system',
  'migration-0120', 'Migration 0120', 'system',
  'migration-0120', 'Migration 0120', 'system', now()
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.organization_settings
SET "publishedVersionId" = 'organization-baseline-v1', "updatedAt" = now()
WHERE id = 'primary' AND "publishedVersionId" IS NULL;

CREATE OR REPLACE FUNCTION public.create_organization_settings_draft(
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
  v_root public.organization_settings%ROWTYPE;
  v_published public.organization_setting_versions%ROWTYPE;
  v_draft public.organization_setting_versions%ROWTYPE;
  v_next integer;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_draft_id), '') IS NULL OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'organization_settings_actor_required';
  END IF;

  SELECT * INTO v_root FROM public.organization_settings WHERE id = 'primary' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_root_missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_setting_versions
    WHERE "organizationId" = v_root.id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'organization_settings_draft_exists';
  END IF;

  SELECT * INTO v_published
  FROM public.organization_setting_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_published_missing'; END IF;

  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.organization_setting_versions
  WHERE "organizationId" = v_root.id;

  INSERT INTO public.organization_setting_versions (
    id, "organizationId", "baseVersionId", "versionNumber", status,
    "legalNameTh", "legalNameEn", "taxId", "branchCode",
    "registeredAddressTh", "registeredAddressEn", phone, email, "lineId", website,
    "changeNote", "createdById", "createdByName", "createdByRole",
    "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_draft_id, v_root.id, v_published.id, v_next, 'draft',
    v_published."legalNameTh", v_published."legalNameEn", v_published."taxId", v_published."branchCode",
    v_published."registeredAddressTh", v_published."registeredAddressEn",
    v_published.phone, v_published.email, v_published."lineId", v_published.website,
    NULL, p_actor_id, p_actor_name, p_actor_role,
    p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;

  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_organization_settings_draft_atomic(
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
  v_root public.organization_settings%ROWTYPE;
  v_draft public.organization_setting_versions%ROWTYPE;
  v_published public.organization_setting_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_root FROM public.organization_settings WHERE id = 'primary' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_root_missing'; END IF;

  SELECT * INTO v_draft
  FROM public.organization_setting_versions
  WHERE id = p_version_id AND "organizationId" = v_root.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'organization_settings_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'organization_settings_draft_stale';
  END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN
    RAISE EXCEPTION 'organization_settings_change_note_required';
  END IF;

  SELECT * INTO v_published
  FROM public.organization_setting_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_published_missing'; END IF;

  UPDATE public.organization_setting_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedAt" = v_now
  WHERE id = v_published.id
  RETURNING * INTO v_published;

  UPDATE public.organization_setting_versions
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

  UPDATE public.organization_settings
  SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE id = v_root.id;

  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_organization_settings_draft_atomic(
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
  v_draft public.organization_setting_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  PERFORM 1 FROM public.organization_settings WHERE id = 'primary' FOR UPDATE;

  SELECT * INTO v_draft
  FROM public.organization_setting_versions
  WHERE id = p_version_id AND "organizationId" = 'primary'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'organization_settings_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'organization_settings_draft_stale';
  END IF;

  UPDATE public.organization_setting_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedAt" = v_now
  WHERE id = v_draft.id
  RETURNING * INTO v_draft;

  RETURN to_jsonb(v_draft);
END;
$$;

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_setting_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.organization_setting_versions FROM anon, authenticated;
GRANT ALL ON TABLE public.organization_settings TO service_role;
GRANT ALL ON TABLE public.organization_setting_versions TO service_role;

REVOKE ALL ON FUNCTION public.create_organization_settings_draft(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_organization_settings_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_organization_settings_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_settings_draft(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_organization_settings_draft_atomic(text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_organization_settings_draft_atomic(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Remove the Phase 4A page/API callers first; Production documents still use constants.
-- 2) Keep both tables as audit/version evidence after real users publish a version.
-- 3) Functions and UI can be removed independently without deleting history.

NOTIFY pgrst, 'reload schema';
