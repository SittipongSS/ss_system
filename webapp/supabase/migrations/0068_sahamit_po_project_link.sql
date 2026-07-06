-- 0068 - Link Sahamit PO to PM project.
-- A PO can spawn one RE-ORDER PM project. The action is API-owned and
-- idempotent through sahamit_pos.projectId.

ALTER TABLE public.sahamit_pos
  ADD COLUMN IF NOT EXISTS "projectId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sahamit_pos_project_id_fkey'
      AND conrelid = 'public.sahamit_pos'::regclass
  ) THEN
    ALTER TABLE public.sahamit_pos
      ADD CONSTRAINT sahamit_pos_project_id_fkey
      FOREIGN KEY ("projectId")
      REFERENCES public.projects(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sahamit_pos_project_id_uidx
  ON public.sahamit_pos ("projectId")
  WHERE "projectId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS sahamit_pos_project_id_idx
  ON public.sahamit_pos ("projectId");

NOTIFY pgrst, 'reload schema';
