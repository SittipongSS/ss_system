-- ============================================================
--  Migration 0308: รหัสฝ่ายของขั้นตอนแม่แบบ 'LG' → 'RA'
--
--  ⭐ ฝ่ายกฎหมายเปลี่ยนชื่อเป็น **ฝ่ายกฎระเบียบและขึ้นทะเบียนผลิตภัณฑ์
--     (Regulatory Affairs)** — รหัสฝ่ายของผู้ใช้เปลี่ยนเป็น RA แล้วในโค้ด
--     (`DEPARTMENTS` · `LEGACY_DEPARTMENT` แปลงค่าเก่าให้ตอนอ่าน)
--
--  ⚠️ รหัสของ **ขั้นตอนแม่แบบ** เป็นคนละทะเบียนกับรหัสฝ่ายของผู้ใช้ แต่ใช้ชุดค่า
--     เดียวกันโดยตั้งใจ (permissions.js: "matching the PM step-role codes") และ
--     `pmTaskEditTier` เทียบตรง ๆ: `normalizeDepartment(user.department) === task.role`
--     ⇒ ปล่อยให้ค้างเป็น 'LG' = ฝั่งผู้ใช้เป็น RA แล้วแต่ขั้นตอนยังเป็น LG
--     สองฝั่งไม่มีวันแมตช์กันอีก
--
--  ⚠️ ค่านี้ถูกบังคับ **สามชั้น** (บทเรียนจาก 0192 ซึ่งเจอปัญหาเดียวกันตอนเพิ่ม TS):
--     1. CHECK ของ `workflow_template_steps.role`   (0121:51 → 0192:37)
--     2. CHECK ของ `project_tasks.role`             (0009:15)
--     3. validation ใน RPC `save_workflow_template_draft` (0121:256 → 0192:42)
--     แก้ไม่ครบชั้นใดชั้นหนึ่ง = บันทึกแม่แบบไม่ผ่านโดยไม่มีข้อความบอกสาเหตุ
--
--  ⚠️ **อัปเดตแถวก่อน แล้วค่อยเปลี่ยน CHECK** — สลับลำดับแล้วแถวเดิมที่ยังเป็น 'LG'
--     จะทำให้ ADD CONSTRAINT ล้มทั้งใบ
--
--  ของจริงบนฐาน ณ 2026-08-28: project_tasks 26 แถว · workflow_template_steps 3 แถว
--
--  Idempotent (รันซ้ำได้)
-- ============================================================

BEGIN;

-- ── 1) ย้ายแถวเดิมก่อน ────────────────────────────────────────────────────
UPDATE public.project_tasks SET role = 'RA' WHERE role = 'LG';
UPDATE public.workflow_template_steps SET role = 'RA' WHERE role = 'LG';
-- แม่แบบเก็บขั้นตอนเป็น jsonb ด้วยในบางเวอร์ชัน — กวาดให้ตรงกัน
UPDATE public.workflow_template_versions
SET steps = (
  SELECT jsonb_agg(
    CASE WHEN s->>'role' = 'LG' THEN jsonb_set(s, '{role}', '"RA"'::jsonb) ELSE s END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(steps) WITH ORDINALITY AS t(s, ordinality)
)
WHERE jsonb_typeof(steps) = 'array' AND steps::text LIKE '%"role": "LG"%';

-- ── 2) CHECK ทั้งสองตาราง ────────────────────────────────────────────────
ALTER TABLE public.workflow_template_steps
  DROP CONSTRAINT IF EXISTS workflow_template_steps_role_check;
ALTER TABLE public.workflow_template_steps
  ADD CONSTRAINT workflow_template_steps_role_check
  CHECK (role IN ('SA', 'RD', 'PC', 'PD', 'QC', 'RA', 'WH', 'TS', 'ALL'));

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_role_check;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_role_check
  CHECK ("role" IN ('SA', 'RD', 'PC', 'PD', 'QC', 'RA', 'WH', 'TS', 'ALL'));

-- ── 3) validation ใน RPC (คัดจาก 0192 ทั้งดวง เปลี่ยนเฉพาะบรรทัด role) ──
CREATE OR REPLACE FUNCTION public.save_workflow_template_draft(
  p_version_id text, p_expected_updated_at timestamptz, p_name_th text, p_description text,
  p_change_note text, p_steps jsonb, p_actor_id text, p_actor_name text, p_actor_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_draft public.workflow_template_versions%ROWTYPE; v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.workflow_template_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'workflow_template_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_template_draft_stale'; END IF;
  IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'workflow_template_steps_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_steps) s GROUP BY s->>'stepKey' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'workflow_template_step_key_duplicate'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_steps) s
    WHERE NULLIF(btrim(s->>'stepKey'), '') IS NULL OR NULLIF(btrim(s->>'name'), '') IS NULL
      OR (s->>'dependencyMode') NOT IN ('sequential', 'root', 'custom')
      -- ⭐ บรรทัดเดียวที่ต่างจาก 0192: 'LG' → 'RA'
      OR (s->>'role') NOT IN ('SA', 'RD', 'PC', 'PD', 'QC', 'RA', 'WH', 'TS', 'ALL')
  ) THEN RAISE EXCEPTION 'workflow_template_steps_invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_steps) s,
      jsonb_array_elements_text(COALESCE(s->'dependsOnStepKeys', '[]'::jsonb)) dependency
    WHERE s->>'dependencyMode' = 'custom'
      AND (dependency = s->>'stepKey' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_steps) candidate WHERE candidate->>'stepKey' = dependency
      ))
  ) THEN RAISE EXCEPTION 'workflow_template_dependency_invalid'; END IF;

  DELETE FROM public.workflow_template_steps WHERE "versionId" = p_version_id;
  INSERT INTO public.workflow_template_steps (
    id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase, "isMilestone",
    "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude", "createdAt", "updatedAt"
  ) SELECT
    p_version_id || '-' || (s.value->>'stepKey'), p_version_id, s.value->>'stepKey', s.ordinality - 1,
    s.value->>'name', s.value->>'role', (s.value->>'durationDays')::integer, NULLIF(s.value->>'phase', ''),
    COALESCE((s.value->>'isMilestone')::boolean, false), s.value->>'dependencyMode',
    CASE WHEN s.value->>'dependencyMode' = 'custom' THEN COALESCE(s.value->'dependsOnStepKeys', '[]'::jsonb) ELSE '[]'::jsonb END,
    NULLIF(s.value->>'categoryOnly', ''), NULLIF(s.value->>'categoryExclude', ''), v_now, v_now
  FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS s(value, ordinality);

  UPDATE public.workflow_template_versions SET
    "nameTh" = btrim(p_name_th), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
    "changeNote" = NULLIF(btrim(COALESCE(p_change_note, '')), ''), "updatedById" = p_actor_id,
    "updatedByName" = p_actor_name, "updatedByRole" = p_actor_role, "updatedAt" = v_now
  WHERE id = p_version_id RETURNING * INTO v_draft;
  RETURN to_jsonb(v_draft);
END;
$$;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
