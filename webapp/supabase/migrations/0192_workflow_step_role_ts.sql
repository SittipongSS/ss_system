-- ============================================================
--  Migration 0192: workflow_template_steps.role รับค่า 'TS' (ฝ่ายเทคนิคบริการ)
--  แผน docs/business-line-vs-project-seam.md §5 · L-2a
--
--  ⭐ กำแพงที่ค้างมาตั้งแต่ #868: ชุด role ของขั้นตอนแม่แบบมีแค่
--    SA / RD / PC / PD / QC / LG / WH / ALL — **ไม่มี TS**
--  ⇒ ขั้น "ประเมินพื้นที่หน้างาน" กับ "ติดตั้งหน้างาน" ของแม่แบบสายบริการ
--    มอบให้ฝ่ายช่างไม่ได้ในระดับ DB · ต้องพังกำแพงนี้ก่อนจะตั้งแม่แบบสายบริการได้
--
--  ⚠️ **กติกาอยู่ 3 ที่ ต้องแก้ให้ครบ ไม่งั้นเพี้ยนหากันเงียบ ๆ**
--    1. CHECK ของตาราง `workflow_template_steps.role`   (0121:51)  ← ไฟล์นี้
--    2. validation ใน RPC `save_workflow_template_draft` (0121:276) ← ไฟล์นี้
--    3. `WORKFLOW_TEMPLATE_ROLES` ใน lib/workflowTemplates.js       ← แก้ในโค้ด PR เดียวกัน
--  ถ้าแก้แค่ CHECK ตัวเดียว: ผู้ใช้เลือก TS ในหน้าตั้งค่าแล้วกดบันทึก → RPC โยน
--  `workflow_template_steps_invalid` ซึ่งอ่านไม่ออกว่าเป็นเพราะอะไร
--
--  ⚠️ RPC ด้านล่างเป็น **นิยามล่าสุดที่คัดมาทั้งดวงจาก 0121:256** แล้วเปลี่ยน
--    เฉพาะรายชื่อ role บรรทัดเดียว — ตรวจแล้วว่าไม่มีใบไหนหลัง 0121 แก้ฟังก์ชันนี้
--    (0136 แก้ guard/publish/discard ของแม่แบบ แต่ไม่แตะ save_...) ห้ามเขียนใหม่
--    จากความจำ ไม่งั้นจะกลืนกติกาอื่นที่อยู่ในฟังก์ชันหายไปเงียบ ๆ
--
--  ⚠ additive อย่างเดียว — ค่าเดิมทั้ง 8 ยังใช้ได้เหมือนเดิม แถวเก่าไม่กระทบ
--  ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้
-- ============================================================

BEGIN;

-- ── 1) CHECK ของตาราง ───────────────────────────────────────────────────
-- ชื่อ constraint ที่ Postgres ตั้งเองตอนเขียน CHECK ในคำสั่ง CREATE TABLE คือ
-- `<table>_<column>_check` — DROP ด้วยชื่อนั้นแล้วสร้างใหม่ด้วยชื่อเดิม เพื่อให้
-- ใบถัดไปที่มาอ่านหาเจอที่เดียว (ไม่ทิ้ง constraint ชื่อแปลก ๆ ไว้ให้งง)
ALTER TABLE public.workflow_template_steps
  DROP CONSTRAINT IF EXISTS workflow_template_steps_role_check;

ALTER TABLE public.workflow_template_steps
  ADD CONSTRAINT workflow_template_steps_role_check
  CHECK (role IN ('SA', 'RD', 'PC', 'PD', 'QC', 'LG', 'WH', 'TS', 'ALL'));

-- ── 2) validation ใน RPC (คัดจาก 0121:256 ทั้งดวง เปลี่ยนเฉพาะบรรทัด role) ──
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
      -- ⭐ บรรทัดเดียวที่ต่างจาก 0121: เพิ่ม 'TS'
      OR (s->>'role') NOT IN ('SA', 'RD', 'PC', 'PD', 'QC', 'LG', 'WH', 'TS', 'ALL')
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
