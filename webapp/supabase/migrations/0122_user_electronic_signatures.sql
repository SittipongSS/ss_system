-- 0122 - Phase 5A: private, owner-scoped electronic signature vault.
--
-- Signature assets are immutable private PNG objects. A user root points to the
-- currently active version while append-only events preserve replace/revoke
-- history. Phase 5A does not change or block document approval workflows.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('signature-assets', 'signature-assets', false, 1048576, ARRAY['image/png']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 1048576,
    allowed_mime_types = ARRAY['image/png']::text[];

CREATE TABLE IF NOT EXISTS public.user_signatures (
  id                text PRIMARY KEY,
  "userId"          text NOT NULL UNIQUE,
  "activeVersionId" text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_signature_versions (
  id                text PRIMARY KEY,
  "signatureId"     text NOT NULL REFERENCES public.user_signatures(id) ON DELETE RESTRICT,
  "versionNumber"   integer NOT NULL CHECK ("versionNumber" > 0),
  "storageBucket"   text NOT NULL CHECK ("storageBucket" = 'signature-assets'),
  "storagePath"     text NOT NULL UNIQUE CHECK (length("storagePath") BETWEEN 1 AND 1000),
  "mimeType"        text NOT NULL CHECK ("mimeType" = 'image/png'),
  "sizeBytes"       bigint NOT NULL CHECK ("sizeBytes" BETWEEN 1 AND 1048576),
  "sha256"          text NOT NULL CHECK ("sha256" ~ '^sha256:[0-9a-f]{64}$'),
  width              integer NOT NULL CHECK (width BETWEEN 120 AND 2400),
  height             integer NOT NULL CHECK (height BETWEEN 40 AND 1200),
  "createdById"     text NOT NULL,
  "createdByName"   text,
  "createdByRole"   text,
  "createdByTeam"   text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("signatureId", "versionNumber"),
  UNIQUE ("signatureId", id)
);

CREATE TABLE IF NOT EXISTS public.user_signature_events (
  id                  text PRIMARY KEY,
  "signatureId"       text NOT NULL REFERENCES public.user_signatures(id) ON DELETE RESTRICT,
  "versionId"         text,
  "previousVersionId" text,
  action               text NOT NULL CHECK (action IN ('upload', 'replace', 'revoke')),
  reason               text CHECK (reason IS NULL OR length(reason) <= 500),
  "actorId"            text NOT NULL,
  "actorName"          text,
  "actorRole"          text,
  "actorTeam"          text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY ("signatureId", "versionId")
    REFERENCES public.user_signature_versions ("signatureId", id) ON DELETE RESTRICT,
  FOREIGN KEY ("signatureId", "previousVersionId")
    REFERENCES public.user_signature_versions ("signatureId", id) ON DELETE RESTRICT,
  CHECK (
    (action = 'upload' AND "versionId" IS NOT NULL AND "previousVersionId" IS NULL AND reason IS NULL)
    OR (action = 'replace' AND "versionId" IS NOT NULL AND "previousVersionId" IS NOT NULL
        AND "versionId" <> "previousVersionId" AND reason IS NULL)
    OR (action = 'revoke' AND "versionId" IS NOT NULL AND "previousVersionId" IS NULL
        AND NULLIF(btrim(COALESCE(reason, '')), '') IS NOT NULL)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_signatures_active_version_fk'
  ) THEN
    ALTER TABLE public.user_signatures
      ADD CONSTRAINT user_signatures_active_version_fk
      FOREIGN KEY (id, "activeVersionId")
      REFERENCES public.user_signature_versions ("signatureId", id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS user_signature_versions_history_idx
  ON public.user_signature_versions ("signatureId", "versionNumber" DESC);

CREATE INDEX IF NOT EXISTS user_signature_events_history_idx
  ON public.user_signature_events ("signatureId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS user_signature_events_version_idx
  ON public.user_signature_events ("versionId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION public.guard_user_signature_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user_signature_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'user_signature_identity_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_user_signature_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user_signature_evidence_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'user_signature_evidence_update_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS user_signatures_guard ON public.user_signatures;
CREATE TRIGGER user_signatures_guard
BEFORE UPDATE OR DELETE ON public.user_signatures
FOR EACH ROW EXECUTE FUNCTION public.guard_user_signature_root();

DROP TRIGGER IF EXISTS user_signature_versions_guard ON public.user_signature_versions;
CREATE TRIGGER user_signature_versions_guard
BEFORE UPDATE OR DELETE ON public.user_signature_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_user_signature_immutable_row();

DROP TRIGGER IF EXISTS user_signature_events_guard ON public.user_signature_events;
CREATE TRIGGER user_signature_events_guard
BEFORE UPDATE OR DELETE ON public.user_signature_events
FOR EACH ROW EXECUTE FUNCTION public.guard_user_signature_immutable_row();

CREATE OR REPLACE FUNCTION public.publish_user_signature_version_atomic(
  p_signature_id text,
  p_version_id text,
  p_event_id text,
  p_user_id text,
  p_expected_active_version_id text,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.user_signatures%ROWTYPE;
  v_version public.user_signature_versions%ROWTYPE;
  v_event public.user_signature_events%ROWTYPE;
  v_previous_id text;
  v_next integer;
  v_action text;
  v_now timestamptz := now();
  v_safe_user_id text;
BEGIN
  IF NULLIF(btrim(p_signature_id), '') IS NULL
     OR NULLIF(btrim(p_version_id), '') IS NULL
     OR NULLIF(btrim(p_event_id), '') IS NULL
     OR NULLIF(btrim(p_user_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'user_signature_identity_required';
  END IF;
  IF p_actor_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'user_signature_owner_mismatch';
  END IF;
  IF p_storage_bucket IS DISTINCT FROM 'signature-assets'
     OR p_mime_type IS DISTINCT FROM 'image/png'
     OR p_size_bytes NOT BETWEEN 1 AND 1048576
     OR p_sha256 !~ '^sha256:[0-9a-f]{64}$'
     OR p_width NOT BETWEEN 120 AND 2400
     OR p_height NOT BETWEEN 40 AND 1200 THEN
    RAISE EXCEPTION 'user_signature_asset_invalid';
  END IF;

  v_safe_user_id := regexp_replace(p_user_id, '[^a-zA-Z0-9_-]+', '_', 'g');
  IF p_storage_path NOT LIKE ('users/' || v_safe_user_id || '/%') THEN
    RAISE EXCEPTION 'user_signature_storage_path_invalid';
  END IF;

  INSERT INTO public.user_signatures (id, "userId", "createdAt", "updatedAt")
  VALUES (p_signature_id, p_user_id, v_now, v_now)
  ON CONFLICT ("userId") DO NOTHING;

  SELECT * INTO v_root
  FROM public.user_signatures
  WHERE "userId" = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_signature_root_missing'; END IF;

  IF v_root."activeVersionId" IS DISTINCT FROM NULLIF(p_expected_active_version_id, '') THEN
    RAISE EXCEPTION 'user_signature_active_stale';
  END IF;

  v_previous_id := v_root."activeVersionId";
  v_action := CASE WHEN v_previous_id IS NULL THEN 'upload' ELSE 'replace' END;

  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.user_signature_versions
  WHERE "signatureId" = v_root.id;

  INSERT INTO public.user_signature_versions (
    id, "signatureId", "versionNumber", "storageBucket", "storagePath",
    "mimeType", "sizeBytes", "sha256", width, height,
    "createdById", "createdByName", "createdByRole", "createdByTeam", "createdAt"
  ) VALUES (
    p_version_id, v_root.id, v_next, p_storage_bucket, p_storage_path,
    p_mime_type, p_size_bytes, p_sha256, p_width, p_height,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team, v_now
  ) RETURNING * INTO v_version;

  INSERT INTO public.user_signature_events (
    id, "signatureId", "versionId", "previousVersionId", action,
    "actorId", "actorName", "actorRole", "actorTeam", "createdAt"
  ) VALUES (
    p_event_id, v_root.id, v_version.id, v_previous_id, v_action,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team, v_now
  ) RETURNING * INTO v_event;

  UPDATE public.user_signatures
  SET "activeVersionId" = v_version.id, "updatedAt" = v_now
  WHERE id = v_root.id
  RETURNING * INTO v_root;

  RETURN jsonb_build_object(
    'root', to_jsonb(v_root),
    'version', to_jsonb(v_version),
    'event', to_jsonb(v_event)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_signature_atomic(
  p_event_id text,
  p_user_id text,
  p_expected_active_version_id text,
  p_reason text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.user_signatures%ROWTYPE;
  v_event public.user_signature_events%ROWTYPE;
  v_active_id text;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_event_id), '') IS NULL
     OR NULLIF(btrim(p_user_id), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'user_signature_identity_required';
  END IF;
  IF p_actor_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'user_signature_owner_mismatch';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'user_signature_revoke_reason_required';
  END IF;

  SELECT * INTO v_root
  FROM public.user_signatures
  WHERE "userId" = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_root."activeVersionId" IS NULL THEN
    RAISE EXCEPTION 'user_signature_active_missing';
  END IF;
  IF v_root."activeVersionId" IS DISTINCT FROM NULLIF(p_expected_active_version_id, '') THEN
    RAISE EXCEPTION 'user_signature_active_stale';
  END IF;

  v_active_id := v_root."activeVersionId";

  INSERT INTO public.user_signature_events (
    id, "signatureId", "versionId", action, reason,
    "actorId", "actorName", "actorRole", "actorTeam", "createdAt"
  ) VALUES (
    p_event_id, v_root.id, v_active_id, 'revoke', v_reason,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team, v_now
  ) RETURNING * INTO v_event;

  UPDATE public.user_signatures
  SET "activeVersionId" = NULL, "updatedAt" = v_now
  WHERE id = v_root.id
  RETURNING * INTO v_root;

  RETURN jsonb_build_object('root', to_jsonb(v_root), 'event', to_jsonb(v_event));
END;
$$;

ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_signature_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_signature_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_signatures FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_signature_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_signature_events FROM anon, authenticated;
GRANT ALL ON TABLE public.user_signatures TO service_role;
GRANT ALL ON TABLE public.user_signature_versions TO service_role;
GRANT ALL ON TABLE public.user_signature_events TO service_role;

REVOKE ALL ON FUNCTION public.publish_user_signature_version_atomic(
  text, text, text, text, text, text, text, text, bigint, text,
  integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_user_signature_atomic(
  text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_user_signature_version_atomic(
  text, text, text, text, text, text, text, text, bigint, text,
  integer, integer, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_signature_atomic(
  text, text, text, text, text, text, text, text
) TO service_role;

-- Rollback guidance:
-- 1) Remove Account/API callers first; Phase 5A does not affect document approval.
-- 2) Keep root/version/event tables and private objects after real enrollment.
-- 3) Never delete historical assets as part of an application rollback.

NOTIFY pgrst, 'reload schema';
