-- 0128 - Phase 7A: versioned commercial presets.
--
-- Adds independently versioned payment/remark/installment presets. Existing
-- quotation consumers and quote_note_templates remain unchanged in Phase 7A.

CREATE OR REPLACE FUNCTION public.commercial_installments_valid(p_rows jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_total numeric := 0;
  v_count integer := 0;
  v_key text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 12 THEN
    RETURN false;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_count := v_count + 1;
    IF jsonb_typeof(v_row) <> 'object'
       OR jsonb_typeof(v_row->'label') <> 'string'
       OR NULLIF(btrim(v_row->>'label'), '') IS NULL
       OR length(v_row->>'label') > 120
       OR jsonb_typeof(v_row->'percent') <> 'number'
       OR (v_row->>'percent')::numeric <= 0
       OR (v_row->>'percent')::numeric > 100 THEN
      RETURN false;
    END IF;

    FOR v_key IN SELECT unnest(ARRAY['trigger', 'dueRule', 'note'])
    LOOP
      IF v_row ? v_key AND v_row->v_key <> 'null'::jsonb AND jsonb_typeof(v_row->v_key) <> 'string' THEN
        RETURN false;
      END IF;
    END LOOP;
    IF length(COALESCE(v_row->>'trigger', '')) > 300
       OR length(COALESCE(v_row->>'dueRule', '')) > 300
       OR length(COALESCE(v_row->>'note', '')) > 500 THEN
      RETURN false;
    END IF;

    v_total := v_total + (v_row->>'percent')::numeric;
  END LOOP;

  RETURN v_count = 0 OR abs(v_total - 100) <= 0.001;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.commercial_presets (
  id                    text PRIMARY KEY,
  "presetKey"           text NOT NULL UNIQUE,
  "documentKey"         text NOT NULL CHECK ("documentKey" IN ('quotation')),
  "teamKey"             text CHECK ("teamKey" IS NULL OR "teamKey" IN ('ODM', 'KA', 'SV')),
  "dealType"            text CHECK ("dealType" IS NULL OR "dealType" IN ('SCENT', 'NPD', 'RE-ORDER')),
  "serviceType"         text CHECK ("serviceType" IS NULL OR length(btrim("serviceType")) BETWEEN 1 AND 80),
  priority              integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 9999),
  "legacyTemplateId"    text UNIQUE,
  "publishedVersionId" text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim("presetKey")) BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS public.commercial_preset_versions (
  id                    text PRIMARY KEY,
  "presetId"            text NOT NULL REFERENCES public.commercial_presets(id) ON DELETE RESTRICT,
  "baseVersionId"       text REFERENCES public.commercial_preset_versions(id) ON DELETE RESTRICT,
  "versionNumber"       integer NOT NULL CHECK ("versionNumber" > 0),
  status                text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 150),
  "paymentMethod"       text CHECK ("paymentMethod" IS NULL OR length("paymentMethod") <= 300),
  "paymentTerms"        text CHECK ("paymentTerms" IS NULL OR length("paymentTerms") <= 1500),
  remarks               text CHECK (remarks IS NULL OR length(remarks) <= 6000),
  installments          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.commercial_installments_valid(installments)),
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
  UNIQUE ("presetId", "versionNumber"),
  CHECK (status <> 'draft' OR ("publishedAt" IS NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'published' OR ("publishedAt" IS NOT NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'archived' OR "archivedAt" IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commercial_presets_published_version_fk') THEN
    ALTER TABLE public.commercial_presets
      ADD CONSTRAINT commercial_presets_published_version_fk
      FOREIGN KEY ("publishedVersionId") REFERENCES public.commercial_preset_versions(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS commercial_preset_versions_one_draft_idx
  ON public.commercial_preset_versions ("presetId") WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS commercial_preset_versions_one_published_idx
  ON public.commercial_preset_versions ("presetId") WHERE status = 'published';
CREATE INDEX IF NOT EXISTS commercial_preset_versions_history_idx
  ON public.commercial_preset_versions ("presetId", "versionNumber" DESC);
CREATE INDEX IF NOT EXISTS commercial_presets_resolver_idx
  ON public.commercial_presets ("documentKey", "teamKey", "dealType", "serviceType", priority, "presetKey");

CREATE OR REPLACE FUNCTION public.guard_commercial_preset_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'commercial_preset_delete_forbidden'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."presetKey" IS DISTINCT FROM OLD."presetKey"
     OR NEW."documentKey" IS DISTINCT FROM OLD."documentKey"
     OR NEW."teamKey" IS DISTINCT FROM OLD."teamKey"
     OR NEW."dealType" IS DISTINCT FROM OLD."dealType"
     OR NEW."serviceType" IS DISTINCT FROM OLD."serviceType"
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW."legacyTemplateId" IS DISTINCT FROM OLD."legacyTemplateId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'commercial_preset_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commercial_presets_guard ON public.commercial_presets;
CREATE TRIGGER commercial_presets_guard
BEFORE UPDATE OR DELETE ON public.commercial_presets
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_preset_root();

CREATE OR REPLACE FUNCTION public.guard_commercial_preset_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'commercial_preset_version_delete_forbidden'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."presetId" IS DISTINCT FROM OLD."presetId"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'commercial_preset_version_identity_immutable';
  END IF;
  IF OLD.status = 'archived' THEN RAISE EXCEPTION 'commercial_preset_version_archived_immutable'; END IF;
  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'commercial_preset_version_published_immutable';
  END IF;
  IF NEW.status <> 'draft' AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW."paymentMethod" IS DISTINCT FROM OLD."paymentMethod"
    OR NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms"
    OR NEW.remarks IS DISTINCT FROM OLD.remarks
    OR NEW.installments IS DISTINCT FROM OLD.installments
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'commercial_preset_version_transition_payload_changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commercial_preset_versions_guard ON public.commercial_preset_versions;
CREATE TRIGGER commercial_preset_versions_guard
BEFORE UPDATE OR DELETE ON public.commercial_preset_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_preset_version();

-- Preserve every legacy option as its own named preset. Multiple presets may
-- share a scope; resolution stays deterministic through priority + presetKey.
INSERT INTO public.commercial_presets (
  id, "presetKey", "documentKey", "teamKey", "dealType", "serviceType",
  priority, "legacyTemplateId", "createdAt", "updatedAt"
)
SELECT
  'commercial-preset-' || md5(q.id),
  'legacy-' || md5(q.id),
  'quotation',
  NULL,
  CASE WHEN upper(btrim(q."serviceType")) IN ('SCENT', 'NPD', 'RE-ORDER')
    THEN upper(btrim(q."serviceType")) ELSE NULL END,
  CASE WHEN lower(btrim(q."serviceType")) = 'general'
         OR upper(btrim(q."serviceType")) IN ('SCENT', 'NPD', 'RE-ORDER')
    THEN NULL ELSE NULLIF(btrim(q."serviceType"), '') END,
  GREATEST(0, LEAST(9999, COALESCE(q."sortOrder", 0))),
  q.id,
  q."createdAt",
  q."updatedAt"
FROM public.quote_note_templates q
ON CONFLICT ("legacyTemplateId") DO NOTHING;

INSERT INTO public.commercial_preset_versions (
  id, "presetId", "versionNumber", status, title, "paymentMethod", "paymentTerms", remarks, installments,
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt",
  "archivedById", "archivedByName", "archivedByRole", "archivedAt", "createdAt", "updatedAt"
)
SELECT
  p.id || '-v1', p.id, 1, CASE WHEN q.active THEN 'published' ELSE 'archived' END,
  q.title, NULL, NULL, q.body, '[]'::jsonb,
  'นำเข้าจาก Note Template เดิมโดย Migration 0128',
  COALESCE(q."createdBy", 'migration-0128'), 'Migration 0128', 'system',
  'migration-0128', 'Migration 0128', 'system',
  CASE WHEN q.active THEN 'migration-0128' END,
  CASE WHEN q.active THEN 'Migration 0128' END,
  CASE WHEN q.active THEN 'system' END,
  CASE WHEN q.active THEN now() END,
  CASE WHEN NOT q.active THEN 'migration-0128' END,
  CASE WHEN NOT q.active THEN 'Migration 0128' END,
  CASE WHEN NOT q.active THEN 'system' END,
  CASE WHEN NOT q.active THEN now() END,
  q."createdAt", q."updatedAt"
FROM public.commercial_presets p
JOIN public.quote_note_templates q ON q.id = p."legacyTemplateId"
ON CONFLICT (id) DO NOTHING;

UPDATE public.commercial_presets p
SET "publishedVersionId" = v.id, "updatedAt" = now()
FROM public.commercial_preset_versions v
WHERE v."presetId" = p.id AND v.status = 'published' AND p."publishedVersionId" IS NULL;

CREATE OR REPLACE FUNCTION public.create_commercial_preset_with_draft(
  p_preset_id text, p_preset_key text, p_version_id text,
  p_document_key text, p_team_key text, p_deal_type text, p_service_type text, p_priority integer,
  p_title text, p_payment_method text, p_payment_terms text, p_remarks text, p_installments jsonb, p_change_note text,
  p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.commercial_presets%ROWTYPE;
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_preset_id), '') IS NULL OR NULLIF(btrim(p_preset_key), '') IS NULL
     OR NULLIF(btrim(p_version_id), '') IS NULL OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'commercial_preset_actor_required';
  END IF;
  INSERT INTO public.commercial_presets (
    id, "presetKey", "documentKey", "teamKey", "dealType", "serviceType", priority, "createdAt", "updatedAt"
  ) VALUES (
    p_preset_id, p_preset_key, p_document_key, p_team_key, p_deal_type, p_service_type, p_priority, v_now, v_now
  ) RETURNING * INTO v_root;

  INSERT INTO public.commercial_preset_versions (
    id, "presetId", "versionNumber", status, title, "paymentMethod", "paymentTerms", remarks, installments, "changeNote",
    "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_version_id, v_root.id, 1, 'draft', p_title, p_payment_method, p_payment_terms, p_remarks, p_installments, p_change_note,
    p_actor_id, p_actor_name, p_actor_role, p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;
  RETURN jsonb_build_object('preset', to_jsonb(v_root), 'draft', to_jsonb(v_draft));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_commercial_preset_draft(
  p_preset_id text, p_version_id text, p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.commercial_presets%ROWTYPE;
  v_base public.commercial_preset_versions%ROWTYPE;
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_next integer;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_root FROM public.commercial_presets WHERE id = p_preset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.commercial_preset_versions WHERE "presetId" = v_root.id AND status = 'draft') THEN
    RAISE EXCEPTION 'commercial_preset_draft_exists';
  END IF;
  SELECT * INTO v_base FROM public.commercial_preset_versions
  WHERE "presetId" = v_root.id
  ORDER BY CASE WHEN id = v_root."publishedVersionId" THEN 0 ELSE 1 END, "versionNumber" DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_base_missing'; END IF;
  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.commercial_preset_versions WHERE "presetId" = v_root.id;

  INSERT INTO public.commercial_preset_versions (
    id, "presetId", "baseVersionId", "versionNumber", status, title, "paymentMethod", "paymentTerms", remarks, installments,
    "changeNote", "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_version_id, v_root.id, v_base.id, v_next, 'draft', v_base.title, v_base."paymentMethod", v_base."paymentTerms",
    v_base.remarks, v_base.installments, NULL, p_actor_id, p_actor_name, p_actor_role,
    p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;
  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_commercial_preset_draft_atomic(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.commercial_presets%ROWTYPE;
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_published public.commercial_preset_versions%ROWTYPE;
  v_archived jsonb := NULL;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.commercial_preset_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_version_not_found'; END IF;
  SELECT * INTO v_root FROM public.commercial_presets WHERE id = v_draft."presetId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'commercial_preset_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'commercial_preset_draft_stale'; END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN RAISE EXCEPTION 'commercial_preset_change_note_required'; END IF;

  IF v_root."publishedVersionId" IS NOT NULL THEN
    SELECT * INTO v_published FROM public.commercial_preset_versions
    WHERE id = v_root."publishedVersionId" AND status = 'published' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_published_missing'; END IF;
    UPDATE public.commercial_preset_versions
    SET status = 'archived', "archivedById" = p_actor_id, "archivedByName" = p_actor_name,
        "archivedByRole" = p_actor_role, "archivedAt" = v_now, "updatedAt" = v_now
    WHERE id = v_published.id RETURNING * INTO v_published;
    v_archived := to_jsonb(v_published);
  END IF;

  UPDATE public.commercial_preset_versions
  SET status = 'published', "publishedById" = p_actor_id, "publishedByName" = p_actor_name,
      "publishedByRole" = p_actor_role, "publishedAt" = v_now,
      "updatedById" = p_actor_id, "updatedByName" = p_actor_name, "updatedByRole" = p_actor_role, "updatedAt" = v_now
  WHERE id = v_draft.id RETURNING * INTO v_draft;
  UPDATE public.commercial_presets SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now WHERE id = v_root.id;
  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', v_archived);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_commercial_preset_draft_atomic(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.commercial_preset_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'commercial_preset_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'commercial_preset_draft_stale'; END IF;
  UPDATE public.commercial_preset_versions
  SET status = 'archived', "archivedById" = p_actor_id, "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role, "archivedAt" = v_now,
      "updatedById" = p_actor_id, "updatedByName" = p_actor_name, "updatedByRole" = p_actor_role, "updatedAt" = v_now
  WHERE id = v_draft.id RETURNING * INTO v_draft;
  RETURN to_jsonb(v_draft);
END;
$$;

ALTER TABLE public.commercial_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_preset_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_presets, public.commercial_preset_versions FROM anon, authenticated;
GRANT ALL ON TABLE public.commercial_presets, public.commercial_preset_versions TO service_role;

REVOKE ALL ON FUNCTION public.commercial_installments_valid(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_commercial_preset_with_draft(text, text, text, text, text, text, text, integer, text, text, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_commercial_preset_draft(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_commercial_preset_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_commercial_preset_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_installments_valid(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_commercial_preset_with_draft(text, text, text, text, text, text, text, integer, text, text, text, text, jsonb, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_commercial_preset_draft(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_commercial_preset_draft_atomic(text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_commercial_preset_draft_atomic(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Disable the Phase 7A Settings card/API; quotation creation and print remain unchanged.
-- 2) Keep these tables after users publish versions; do not delete audit history.
-- 3) quote_note_templates is never updated or deleted by this migration and remains the legacy fallback.

NOTIFY pgrst, 'reload schema';
