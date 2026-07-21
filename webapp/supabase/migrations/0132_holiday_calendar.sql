-- 0132 - Decision 0012: versioned holiday calendar (draft → publish → archive).
--
-- The working-day calendar that drives every PM/sales timeline becomes one
-- versioned setting: a version holds the WHOLE holiday set as jsonb, so
-- entering a new year's holidays is one draft edited over time and published
-- in a single atomic step. Published/Archived versions are immutable evidence;
-- the scheduler reads the published version only.
--
-- The legacy `holidays` table (migration 0018) stays untouched as the seed
-- source and as the fallback for a deploy that lands before this migration.
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

CREATE OR REPLACE FUNCTION public.holiday_calendar_entries_valid(p_rows jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_date text;
  v_dates text[] := '{}';
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
    RETURN false;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' OR jsonb_typeof(v_row->'date') <> 'string' THEN
      RETURN false;
    END IF;
    v_date := v_row->>'date';
    IF v_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN false;
    END IF;
    -- ตัดวันที่ที่ไม่มีจริง (เช่น 2026-02-30) — cast ล้มเหลว = ตก EXCEPTION ด้านล่าง
    PERFORM v_date::date;
    IF v_row ? 'name' AND v_row->'name' <> 'null'::jsonb AND jsonb_typeof(v_row->'name') <> 'string' THEN
      RETURN false;
    END IF;
    IF length(COALESCE(v_row->>'name', '')) > 200 THEN
      RETURN false;
    END IF;
    IF v_date = ANY (v_dates) THEN
      RETURN false;
    END IF;
    v_dates := array_append(v_dates, v_date);
  END LOOP;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.holiday_calendars (
  id                    text PRIMARY KEY,
  "publishedVersionId" text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 'primary')
);

CREATE TABLE IF NOT EXISTS public.holiday_calendar_versions (
  id                    text PRIMARY KEY,
  "calendarId"          text NOT NULL REFERENCES public.holiday_calendars(id) ON DELETE RESTRICT,
  "baseVersionId"       text REFERENCES public.holiday_calendar_versions(id) ON DELETE RESTRICT,
  "versionNumber"       integer NOT NULL CHECK ("versionNumber" > 0),
  status                text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  holidays              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.holiday_calendar_entries_valid(holidays)),
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
  UNIQUE ("calendarId", "versionNumber"),
  CHECK (status <> 'draft' OR ("publishedAt" IS NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'published' OR ("publishedAt" IS NOT NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'archived' OR "archivedAt" IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'holiday_calendars_published_version_fk'
  ) THEN
    ALTER TABLE public.holiday_calendars
      ADD CONSTRAINT holiday_calendars_published_version_fk
      FOREIGN KEY ("publishedVersionId")
      REFERENCES public.holiday_calendar_versions(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS holiday_calendar_versions_one_draft_idx
  ON public.holiday_calendar_versions ("calendarId") WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS holiday_calendar_versions_one_published_idx
  ON public.holiday_calendar_versions ("calendarId") WHERE status = 'published';

CREATE INDEX IF NOT EXISTS holiday_calendar_versions_history_idx
  ON public.holiday_calendar_versions ("calendarId", "versionNumber" DESC);

CREATE OR REPLACE FUNCTION public.guard_holiday_calendar_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'holiday_calendar_version_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."calendarId" IS DISTINCT FROM OLD."calendarId"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'holiday_calendar_version_identity_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'holiday_calendar_version_archived_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'holiday_calendar_version_published_immutable';
  END IF;

  -- A lifecycle transition may only publish/archive the Draft payload already
  -- stored in the database — it cannot smuggle a new calendar into the UPDATE.
  IF NEW.status <> 'draft' AND (
    NEW.holidays IS DISTINCT FROM OLD.holidays
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'holiday_calendar_version_transition_payload_changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS holiday_calendar_versions_guard ON public.holiday_calendar_versions;
CREATE TRIGGER holiday_calendar_versions_guard
BEFORE UPDATE OR DELETE ON public.holiday_calendar_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_holiday_calendar_version();

INSERT INTO public.holiday_calendars (id)
VALUES ('primary')
ON CONFLICT (id) DO NOTHING;

-- Seed: the ENTIRE current holidays table becomes Published Version 1, so the
-- scheduler sees the exact same non-working dates before and after cut-over.
INSERT INTO public.holiday_calendar_versions (
  id, "calendarId", "versionNumber", status, holidays, "changeNote",
  "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
SELECT
  'holiday-calendar-baseline-v1', 'primary', 1, 'published',
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('date', h.date, 'name', COALESCE(h.name, '')) ORDER BY h.date)
      FROM public.holidays h
    ),
    '[]'::jsonb
  ),
  'นำเข้าปฏิทินวันหยุดทั้งชุดจากตาราง holidays เดิม (Decision 0012)',
  'migration-0132', 'Migration 0132', 'system',
  'migration-0132', 'Migration 0132', 'system',
  'migration-0132', 'Migration 0132', 'system', now()
ON CONFLICT (id) DO NOTHING;

UPDATE public.holiday_calendars
SET "publishedVersionId" = 'holiday-calendar-baseline-v1', "updatedAt" = now()
WHERE id = 'primary' AND "publishedVersionId" IS NULL;

CREATE OR REPLACE FUNCTION public.create_holiday_calendar_draft(
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
  v_root public.holiday_calendars%ROWTYPE;
  v_published public.holiday_calendar_versions%ROWTYPE;
  v_draft public.holiday_calendar_versions%ROWTYPE;
  v_next integer;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_draft_id), '') IS NULL OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'holiday_calendar_actor_required';
  END IF;

  SELECT * INTO v_root FROM public.holiday_calendars WHERE id = 'primary' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_calendar_root_missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.holiday_calendar_versions
    WHERE "calendarId" = v_root.id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'holiday_calendar_draft_exists';
  END IF;

  SELECT * INTO v_published
  FROM public.holiday_calendar_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_calendar_published_missing'; END IF;

  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.holiday_calendar_versions
  WHERE "calendarId" = v_root.id;

  INSERT INTO public.holiday_calendar_versions (
    id, "calendarId", "baseVersionId", "versionNumber", status,
    holidays, "changeNote", "createdById", "createdByName", "createdByRole",
    "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_draft_id, v_root.id, v_published.id, v_next, 'draft',
    v_published.holidays, NULL, p_actor_id, p_actor_name, p_actor_role,
    p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;

  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_holiday_calendar_draft_atomic(
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
  v_root public.holiday_calendars%ROWTYPE;
  v_draft public.holiday_calendar_versions%ROWTYPE;
  v_published public.holiday_calendar_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_root FROM public.holiday_calendars WHERE id = 'primary' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_calendar_root_missing'; END IF;

  SELECT * INTO v_draft
  FROM public.holiday_calendar_versions
  WHERE id = p_version_id AND "calendarId" = v_root.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_calendar_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'holiday_calendar_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'holiday_calendar_draft_stale';
  END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN
    RAISE EXCEPTION 'holiday_calendar_change_note_required';
  END IF;

  SELECT * INTO v_published
  FROM public.holiday_calendar_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_calendar_published_missing'; END IF;

  UPDATE public.holiday_calendar_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedAt" = v_now
  WHERE id = v_published.id
  RETURNING * INTO v_published;

  UPDATE public.holiday_calendar_versions
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

  UPDATE public.holiday_calendars
  SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE id = v_root.id;

  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_holiday_calendar_draft_atomic(
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
  v_draft public.holiday_calendar_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  PERFORM 1 FROM public.holiday_calendars WHERE id = 'primary' FOR UPDATE;

  SELECT * INTO v_draft
  FROM public.holiday_calendar_versions
  WHERE id = p_version_id AND "calendarId" = 'primary'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'holiday_calendar_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'holiday_calendar_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'holiday_calendar_draft_stale';
  END IF;

  UPDATE public.holiday_calendar_versions
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

ALTER TABLE public.holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_calendar_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.holiday_calendars FROM anon, authenticated;
REVOKE ALL ON TABLE public.holiday_calendar_versions FROM anon, authenticated;
GRANT ALL ON TABLE public.holiday_calendars TO service_role;
GRANT ALL ON TABLE public.holiday_calendar_versions TO service_role;

REVOKE ALL ON FUNCTION public.create_holiday_calendar_draft(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_holiday_calendar_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_holiday_calendar_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_holiday_calendar_draft(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_holiday_calendar_draft_atomic(text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_holiday_calendar_draft_atomic(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Point lib/master/holidays.js back at the legacy `holidays` table first.
-- 2) Keep both tables as audit/version evidence after real users publish.
-- 3) Functions and UI can be removed independently without deleting history.

NOTIFY pgrst, 'reload schema';
