-- 0119 - Product category import history and atomic commit.
--
-- Phase 3 keeps the uploaded workbook outside the database. The API parses it,
-- stores a tamper-evident preview (file hash + row evidence), and calls the RPC
-- below only after the user confirms. product_types codes remain immutable.

CREATE TABLE IF NOT EXISTS public.product_category_import_runs (
  id                text PRIMARY KEY,
  "fileName"        text NOT NULL,
  "fileHash"        text NOT NULL,
  "templateVersion" text NOT NULL,
  "sourceExportedAt" timestamptz,
  status            text NOT NULL DEFAULT 'previewed'
                    CHECK (status IN ('previewed', 'completed', 'failed', 'expired')),
  summary           jsonb NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(summary) = 'object'),
  error             text,
  "actorId"         text NOT NULL,
  "actorName"       text,
  "actorRole"       text,
  "actorTeam"       text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "expiresAt"       timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  "completedAt"     timestamptz,
  CHECK (length("fileName") BETWEEN 1 AND 255),
  CHECK (length("fileHash") BETWEEN 32 AND 128),
  CHECK (length("templateVersion") BETWEEN 1 AND 50),
  CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE IF NOT EXISTS public.product_category_import_rows (
  id                  bigserial PRIMARY KEY,
  "runId"             text NOT NULL REFERENCES public.product_category_import_runs(id) ON DELETE RESTRICT,
  "rowNumber"         integer NOT NULL CHECK ("rowNumber" > 0),
  "mainCategoryCode"  varchar(2),
  "typeCode"          varchar(3),
  action              text NOT NULL
                      CHECK (action IN ('create', 'update', 'activate', 'deactivate', 'unchanged', 'error', 'conflict')),
  before              jsonb,
  after               jsonb,
  errors              jsonb NOT NULL DEFAULT '[]'::jsonb
                      CHECK (jsonb_typeof(errors) = 'array'),
  "expectedUpdatedAt" timestamptz,
  "appliedAt"         timestamptz,
  UNIQUE ("runId", "rowNumber")
);

CREATE INDEX IF NOT EXISTS product_category_import_runs_created_idx
  ON public.product_category_import_runs ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS product_category_import_runs_status_expiry_idx
  ON public.product_category_import_runs (status, "expiresAt");

CREATE INDEX IF NOT EXISTS product_category_import_rows_run_code_idx
  ON public.product_category_import_rows ("runId", "mainCategoryCode", "typeCode");

ALTER TABLE public.product_category_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_category_import_rows ENABLE ROW LEVEL SECURITY;

-- No browser-facing policies: preview evidence and commits go through server
-- routes using service_role after canManageProductCategories() has passed.
REVOKE ALL ON TABLE public.product_category_import_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_category_import_rows FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.product_category_import_rows_id_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.product_category_import_runs TO service_role;
GRANT ALL ON TABLE public.product_category_import_rows TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.product_category_import_rows_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.apply_product_category_import_atomic(
  p_run_id text,
  p_file_hash text,
  p_actor_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run public.product_category_import_runs%ROWTYPE;
  v_row public.product_category_import_rows%ROWTYPE;
  v_current public.product_types%ROWTYPE;
  v_after public.product_types%ROWTYPE;
  v_now timestamptz := now();
  v_main_code text;
  v_type_code text;
  v_main_name text;
  v_name_th text;
  v_name_en text;
  v_note text;
  v_is_active boolean;
  v_applied integer := 0;
  v_created integer := 0;
  v_updated integer := 0;
  v_activated integer := 0;
  v_deactivated integer := 0;
  v_unchanged integer := 0;
BEGIN
  SELECT * INTO v_run
  FROM public.product_category_import_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'product_category_import_not_found'; END IF;
  IF v_run.status <> 'previewed' THEN RAISE EXCEPTION 'product_category_import_not_previewed'; END IF;
  IF v_run."expiresAt" <= v_now THEN RAISE EXCEPTION 'product_category_import_expired'; END IF;
  IF v_run."fileHash" <> p_file_hash THEN RAISE EXCEPTION 'product_category_import_hash_mismatch'; END IF;
  IF p_actor_id IS NULL OR v_run."actorId" <> p_actor_id THEN
    RAISE EXCEPTION 'product_category_import_actor_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_category_import_rows WHERE "runId" = p_run_id
  ) THEN
    RAISE EXCEPTION 'product_category_import_rows_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_category_import_rows
    WHERE "runId" = p_run_id
      AND (action IN ('error', 'conflict') OR jsonb_array_length(errors) > 0)
  ) THEN
    RAISE EXCEPTION 'product_category_import_not_committable';
  END IF;

  -- One main-category code must resolve to one final name inside the preview.
  IF EXISTS (
    SELECT 1
    FROM public.product_category_import_rows
    WHERE "runId" = p_run_id
      AND action NOT IN ('error', 'conflict')
      AND jsonb_typeof(after) = 'object'
    GROUP BY btrim(after->>'mainCategoryCode')
    HAVING count(DISTINCT btrim(after->>'mainCategoryName')) > 1
  ) THEN
    RAISE EXCEPTION 'product_category_import_main_name_conflict';
  END IF;

  -- A main-category rename is denormalized across every existing child row.
  -- Require the preview to include every affected sibling as an update so the
  -- stored row evidence covers the complete cascade.
  IF EXISTS (
    SELECT 1
    FROM public.product_category_import_rows r
    JOIN public.product_types existing_group
      ON existing_group."mainCategoryCode" = btrim(r.after->>'mainCategoryCode')
    WHERE r."runId" = p_run_id
      AND r.action IN ('create', 'update')
      AND jsonb_typeof(r.after) = 'object'
      AND btrim(r.after->>'mainCategoryName') IS DISTINCT FROM existing_group."mainCategoryName"
      AND EXISTS (
        SELECT 1
        FROM public.product_types sibling
        WHERE sibling."mainCategoryCode" = existing_group."mainCategoryCode"
          AND NOT EXISTS (
            SELECT 1
            FROM public.product_category_import_rows sibling_row
            WHERE sibling_row."runId" = p_run_id
              AND sibling_row.action = 'update'
              AND sibling_row."mainCategoryCode" = sibling."mainCategoryCode"
              AND sibling_row."typeCode" = sibling."typeCode"
              AND btrim(sibling_row.after->>'mainCategoryName') = btrim(r.after->>'mainCategoryName')
          )
      )
  ) THEN
    RAISE EXCEPTION 'product_category_import_main_rename_incomplete';
  END IF;

  SELECT count(*) INTO v_unchanged
  FROM public.product_category_import_rows
  WHERE "runId" = p_run_id AND action = 'unchanged';

  FOR v_row IN
    SELECT *
    FROM public.product_category_import_rows
    WHERE "runId" = p_run_id
    ORDER BY "rowNumber", id
  LOOP
    IF v_row.action = 'unchanged' THEN CONTINUE; END IF;
    IF jsonb_typeof(v_row.after) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'product_category_import_payload_invalid';
    END IF;

    v_main_code := btrim(COALESCE(v_row.after->>'mainCategoryCode', ''));
    v_type_code := btrim(COALESCE(v_row.after->>'typeCode', ''));
    v_main_name := btrim(COALESCE(v_row.after->>'mainCategoryName', ''));
    v_name_th := NULLIF(btrim(COALESCE(v_row.after->>'nameTh', '')), '');
    v_name_en := NULLIF(btrim(COALESCE(v_row.after->>'nameEn', '')), '');
    v_note := NULLIF(btrim(COALESCE(v_row.after->>'note', '')), '');

    IF v_main_code !~ '^[0-9]{2}$' OR v_type_code !~ '^[0-9]{3}$' THEN
      RAISE EXCEPTION 'product_category_import_code_invalid';
    END IF;
    IF v_main_name = '' OR length(v_main_name) > 50 THEN
      RAISE EXCEPTION 'product_category_import_main_name_invalid';
    END IF;
    IF (v_name_th IS NULL AND v_name_en IS NULL)
       OR length(COALESCE(v_name_th, '')) > 100
       OR length(COALESCE(v_name_en, '')) > 100
       OR length(COALESCE(v_note, '')) > 255 THEN
      RAISE EXCEPTION 'product_category_import_name_invalid';
    END IF;
    IF NOT (v_row.after ? 'isActive')
       OR jsonb_typeof(v_row.after->'isActive') <> 'boolean' THEN
      RAISE EXCEPTION 'product_category_import_status_invalid';
    END IF;
    v_is_active := (v_row.after->>'isActive')::boolean;

    -- Row key columns are evidence/index fields. They must match the payload
    -- that was previewed so a server bug cannot apply one row under another key.
    IF v_row."mainCategoryCode" IS DISTINCT FROM v_main_code
       OR v_row."typeCode" IS DISTINCT FROM v_type_code THEN
      RAISE EXCEPTION 'product_category_import_row_key_mismatch';
    END IF;

    SELECT * INTO v_current
    FROM public.product_types
    WHERE "mainCategoryCode" = v_main_code AND "typeCode" = v_type_code
    FOR UPDATE;

    IF v_row.action = 'create' THEN
      IF FOUND THEN RAISE EXCEPTION 'product_category_import_code_exists'; END IF;

      INSERT INTO public.product_types (
        "mainCategoryCode", "mainCategoryName", "typeCode", "nameEn", "nameTh", note,
        "isActive", "createdAt", "updatedAt", "deactivatedAt"
      ) VALUES (
        v_main_code, v_main_name, v_type_code, v_name_en, v_name_th, v_note,
        v_is_active, v_now, v_now, CASE WHEN v_is_active THEN NULL ELSE v_now END
      )
      RETURNING * INTO v_after;

      UPDATE public.product_category_import_rows
      SET before = NULL, after = to_jsonb(v_after), "appliedAt" = v_now
      WHERE id = v_row.id;
      v_created := v_created + 1;
      v_applied := v_applied + 1;
      CONTINUE;
    END IF;

    IF NOT FOUND THEN RAISE EXCEPTION 'product_category_import_target_missing'; END IF;
    IF v_row."expectedUpdatedAt" IS NULL
       OR v_current."updatedAt" IS DISTINCT FROM v_row."expectedUpdatedAt" THEN
      RAISE EXCEPTION 'product_category_import_stale';
    END IF;

    IF v_row.action = 'activate' AND (
      NOT v_is_active
      OR v_main_name IS DISTINCT FROM v_current."mainCategoryName"
      OR v_name_th IS DISTINCT FROM NULLIF(v_current."nameTh", '')
      OR v_name_en IS DISTINCT FROM NULLIF(v_current."nameEn", '')
      OR v_note IS DISTINCT FROM NULLIF(v_current.note, '')
    ) THEN
      RAISE EXCEPTION 'product_category_import_activate_payload_invalid';
    END IF;
    IF v_row.action = 'deactivate' AND (
      v_is_active
      OR v_main_name IS DISTINCT FROM v_current."mainCategoryName"
      OR v_name_th IS DISTINCT FROM NULLIF(v_current."nameTh", '')
      OR v_name_en IS DISTINCT FROM NULLIF(v_current."nameEn", '')
      OR v_note IS DISTINCT FROM NULLIF(v_current.note, '')
    ) THEN
      RAISE EXCEPTION 'product_category_import_deactivate_payload_invalid';
    END IF;

    UPDATE public.product_types
    SET "mainCategoryName" = v_main_name,
        "nameEn" = v_name_en,
        "nameTh" = v_name_th,
        note = v_note,
        "isActive" = v_is_active,
        "deactivatedAt" = CASE
          WHEN v_is_active THEN NULL
          WHEN v_current."isActive" THEN v_now
          ELSE v_current."deactivatedAt"
        END,
        "updatedAt" = v_now
    WHERE id = v_current.id
    RETURNING * INTO v_after;

    UPDATE public.product_category_import_rows
    SET before = to_jsonb(v_current), after = to_jsonb(v_after), "appliedAt" = v_now
    WHERE id = v_row.id;

    IF v_current."mainCategoryName" IS DISTINCT FROM v_after."mainCategoryName"
       OR NULLIF(v_current."nameTh", '') IS DISTINCT FROM NULLIF(v_after."nameTh", '')
       OR NULLIF(v_current."nameEn", '') IS DISTINCT FROM NULLIF(v_after."nameEn", '')
       OR NULLIF(v_current.note, '') IS DISTINCT FROM NULLIF(v_after.note, '') THEN
      v_updated := v_updated + 1;
    END IF;
    IF NOT v_current."isActive" AND v_after."isActive" THEN
      v_activated := v_activated + 1;
    ELSIF v_current."isActive" AND NOT v_after."isActive" THEN
      v_deactivated := v_deactivated + 1;
    END IF;
    v_applied := v_applied + 1;
  END LOOP;

  UPDATE public.product_category_import_runs
  SET status = 'completed',
      "completedAt" = v_now,
      error = NULL,
      summary = summary || jsonb_build_object(
        'applied', v_applied,
        'created', v_created,
        'updated', v_updated,
        'activated', v_activated,
        'deactivated', v_deactivated,
        'unchanged', v_unchanged
      )
  WHERE id = p_run_id
  RETURNING * INTO v_run;

  RETURN jsonb_build_object(
    'runId', v_run.id,
    'status', v_run.status,
    'completedAt', v_run."completedAt",
    'summary', v_run.summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_product_category_import_atomic(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_product_category_import_atomic(text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_product_category_import_atomic(text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Remove Phase 3 API/UI callers first.
-- 2) Keep both history tables when possible because they are audit evidence.
-- 3) To remove only executable behavior, DROP FUNCTION apply_product_category_import_atomic(text,text,text).
-- 4) Drop rows before runs only when the business owner explicitly approves deleting evidence.

NOTIFY pgrst, 'reload schema';
