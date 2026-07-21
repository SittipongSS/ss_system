-- 0133 - Decision 0012: versioned Google Chat webhook settings.
--
-- Each notification space becomes its own versioned setting root
-- (draft → publish → archive) instead of a live-edited row. The sender
-- (lib/chat.js) reads the published version only.
--
-- Behavior preservation: the legacy rule was "a row in chat_webhooks makes the
-- table authoritative for that space; no row falls back to env". The seed
-- copies ONLY existing legacy rows as Published Version 1, so spaces that were
-- never configured keep their env fallback exactly as before. The legacy
-- `chat_webhooks` table (migration 0099) stays untouched as seed source and as
-- the fallback for a deploy that lands before this migration.
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

CREATE TABLE IF NOT EXISTS public.chat_webhook_settings (
  key                   text PRIMARY KEY,
  "publishedVersionId" text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  CHECK (key IN ('approvals', 'sales', 'pm', 'rd', 'leads'))
);

CREATE TABLE IF NOT EXISTS public.chat_webhook_setting_versions (
  id                    text PRIMARY KEY,
  "settingKey"          text NOT NULL REFERENCES public.chat_webhook_settings(key) ON DELETE RESTRICT,
  "baseVersionId"       text REFERENCES public.chat_webhook_setting_versions(id) ON DELETE RESTRICT,
  "versionNumber"       integer NOT NULL CHECK ("versionNumber" > 0),
  status                text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  -- โดเมนปลายทาง (chat.googleapis.com) บังคับฝั่ง API เหมือนตารางเดิม —
  -- DB คุมเฉพาะความยาว เพื่อให้ seed จากข้อมูลเดิมผ่านเสมอ
  url                   text CHECK (url IS NULL OR length(url) <= 600),
  enabled               boolean NOT NULL DEFAULT true,
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
  UNIQUE ("settingKey", "versionNumber"),
  CHECK (status <> 'draft' OR ("publishedAt" IS NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'published' OR ("publishedAt" IS NOT NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'archived' OR "archivedAt" IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_webhook_settings_published_version_fk'
  ) THEN
    ALTER TABLE public.chat_webhook_settings
      ADD CONSTRAINT chat_webhook_settings_published_version_fk
      FOREIGN KEY ("publishedVersionId")
      REFERENCES public.chat_webhook_setting_versions(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS chat_webhook_setting_versions_one_draft_idx
  ON public.chat_webhook_setting_versions ("settingKey") WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS chat_webhook_setting_versions_one_published_idx
  ON public.chat_webhook_setting_versions ("settingKey") WHERE status = 'published';

CREATE INDEX IF NOT EXISTS chat_webhook_setting_versions_history_idx
  ON public.chat_webhook_setting_versions ("settingKey", "versionNumber" DESC);

CREATE OR REPLACE FUNCTION public.guard_chat_webhook_setting_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'chat_webhook_setting_version_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."settingKey" IS DISTINCT FROM OLD."settingKey"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'chat_webhook_setting_version_identity_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'chat_webhook_setting_version_archived_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'chat_webhook_setting_version_published_immutable';
  END IF;

  -- A lifecycle transition may only publish/archive the Draft payload already
  -- stored in the database — it cannot smuggle a new URL into the same UPDATE.
  IF NEW.status <> 'draft' AND (
    NEW.url IS DISTINCT FROM OLD.url
    OR NEW.enabled IS DISTINCT FROM OLD.enabled
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'chat_webhook_setting_version_transition_payload_changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_webhook_setting_versions_guard ON public.chat_webhook_setting_versions;
CREATE TRIGGER chat_webhook_setting_versions_guard
BEFORE UPDATE OR DELETE ON public.chat_webhook_setting_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_chat_webhook_setting_version();

INSERT INTO public.chat_webhook_settings (key)
VALUES ('approvals'), ('sales'), ('pm'), ('rd'), ('leads')
ON CONFLICT (key) DO NOTHING;

-- Seed Published Version 1 only for spaces that already have a legacy row —
-- spaces without one keep "no published version" = env fallback, unchanged.
INSERT INTO public.chat_webhook_setting_versions (
  id, "settingKey", "versionNumber", status, url, enabled, "changeNote",
  "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
SELECT
  'chat-webhook-' || w.key || '-baseline-v1', w.key, 1, 'published',
  w.url, COALESCE(w.enabled, true),
  'นำเข้าค่าจากตาราง chat_webhooks เดิม (Decision 0012)',
  'migration-0133', 'Migration 0133', 'system',
  'migration-0133', 'Migration 0133', 'system',
  'migration-0133', 'Migration 0133', 'system', now()
FROM public.chat_webhooks w
WHERE w.key IN ('approvals', 'sales', 'pm', 'rd', 'leads')
ON CONFLICT (id) DO NOTHING;

UPDATE public.chat_webhook_settings s
SET "publishedVersionId" = 'chat-webhook-' || s.key || '-baseline-v1', "updatedAt" = now()
WHERE s."publishedVersionId" IS NULL
  AND EXISTS (
    SELECT 1 FROM public.chat_webhook_setting_versions v
    WHERE v.id = 'chat-webhook-' || s.key || '-baseline-v1' AND v.status = 'published'
  );

CREATE OR REPLACE FUNCTION public.create_chat_webhook_settings_draft(
  p_key text,
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
  v_root public.chat_webhook_settings%ROWTYPE;
  v_published public.chat_webhook_setting_versions%ROWTYPE;
  v_draft public.chat_webhook_setting_versions%ROWTYPE;
  v_next integer;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_draft_id), '') IS NULL OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'chat_webhook_settings_actor_required';
  END IF;

  SELECT * INTO v_root FROM public.chat_webhook_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat_webhook_settings_root_missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.chat_webhook_setting_versions
    WHERE "settingKey" = v_root.key AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'chat_webhook_settings_draft_exists';
  END IF;

  -- ต่างจาก organization settings: space ที่ยังไม่เคยตั้งค่า (ใช้ env อยู่)
  -- ไม่มี published version — เริ่มร่างเปล่าได้ (url ว่าง, เปิดใช้)
  SELECT * INTO v_published
  FROM public.chat_webhook_setting_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published';

  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.chat_webhook_setting_versions
  WHERE "settingKey" = v_root.key;

  INSERT INTO public.chat_webhook_setting_versions (
    id, "settingKey", "baseVersionId", "versionNumber", status,
    url, enabled, "changeNote", "createdById", "createdByName", "createdByRole",
    "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_draft_id, v_root.key, v_published.id, v_next, 'draft',
    v_published.url, COALESCE(v_published.enabled, true), NULL,
    p_actor_id, p_actor_name, p_actor_role,
    p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;

  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_chat_webhook_settings_draft_atomic(
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
  v_root public.chat_webhook_settings%ROWTYPE;
  v_draft public.chat_webhook_setting_versions%ROWTYPE;
  v_published public.chat_webhook_setting_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft
  FROM public.chat_webhook_setting_versions
  WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat_webhook_settings_version_not_found'; END IF;

  SELECT * INTO v_root FROM public.chat_webhook_settings WHERE key = v_draft."settingKey" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat_webhook_settings_root_missing'; END IF;

  -- re-read under the root lock
  SELECT * INTO v_draft
  FROM public.chat_webhook_setting_versions
  WHERE id = p_version_id AND "settingKey" = v_root.key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat_webhook_settings_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'chat_webhook_settings_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'chat_webhook_settings_draft_stale';
  END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN
    RAISE EXCEPTION 'chat_webhook_settings_change_note_required';
  END IF;

  -- Published เดิมอาจไม่มี (space ที่เพิ่งตั้งครั้งแรก) — ถ้ามีให้ archive ก่อน
  SELECT * INTO v_published
  FROM public.chat_webhook_setting_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.chat_webhook_setting_versions
    SET status = 'archived',
        "archivedById" = p_actor_id,
        "archivedByName" = p_actor_name,
        "archivedByRole" = p_actor_role,
        "archivedAt" = v_now,
        "updatedAt" = v_now
    WHERE id = v_published.id
    RETURNING * INTO v_published;
  END IF;

  UPDATE public.chat_webhook_setting_versions
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

  UPDATE public.chat_webhook_settings
  SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE key = v_root.key;

  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_chat_webhook_settings_draft_atomic(
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
  v_draft public.chat_webhook_setting_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft
  FROM public.chat_webhook_setting_versions
  WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat_webhook_settings_version_not_found'; END IF;

  PERFORM 1 FROM public.chat_webhook_settings WHERE key = v_draft."settingKey" FOR UPDATE;

  SELECT * INTO v_draft
  FROM public.chat_webhook_setting_versions
  WHERE id = p_version_id
  FOR UPDATE;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'chat_webhook_settings_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'chat_webhook_settings_draft_stale';
  END IF;

  UPDATE public.chat_webhook_setting_versions
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

ALTER TABLE public.chat_webhook_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_webhook_setting_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_webhook_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_webhook_setting_versions FROM anon, authenticated;
GRANT ALL ON TABLE public.chat_webhook_settings TO service_role;
GRANT ALL ON TABLE public.chat_webhook_setting_versions TO service_role;

REVOKE ALL ON FUNCTION public.create_chat_webhook_settings_draft(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_chat_webhook_settings_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_chat_webhook_settings_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_chat_webhook_settings_draft(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_chat_webhook_settings_draft_atomic(text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_chat_webhook_settings_draft_atomic(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Point lib/chat.js back at the legacy `chat_webhooks` table first.
-- 2) Keep both tables as audit/version evidence after real users publish.
-- 3) Functions and UI can be removed independently without deleting history.

NOTIFY pgrst, 'reload schema';
