-- ============================================================
--  Migration 0436: ย้อนไทม์ไลน์ของดีลกลับไป Rev. ที่เลือก — งวด P2b ของการยุบดีล/โครงการ
--
--  มติเจ้าของ 13/11/2026: Rev. ไทม์ไลน์ต้องเก็บ (ส่งลูกค้าแล้วต้องปรับได้) และเดินบนดีล
--  (เลขที่เอกสาร = รหัสดีล + Rev.) · ประวัติอยู่ที่ `deal_timeline_revisions` (mig 0435)
--
--  ฟังก์ชันเดียว atomic: ลบขั้นตอนทั้งชุดของดีล แล้วใส่กลับจาก snapshot ของ Rev. นั้น
--  ⭐ ต่างจาก `pm_restore_snapshot` ของโครงการ (0239) สามเรื่อง:
--     1) ขอบเขต = ขั้นตอนที่ "dealId" = ดีลนี้ — ขั้นของดีลอื่น/งานกลางในโครงการเดียวกันไม่ถูกแตะ
--     2) ใส่ "dealId" + "projectId" (ของดีล ณ ตอนย้อน) กลับเสมอ
--        🐞 ตัวของโครงการไม่ใส่ "dealId" ⇒ ย้อน Rev. ที่หน้าโครงการ = ป้ายดีลของทุกขั้นหายเงียบ
--     3) ใส่ "systemCompletedAt"/"systemCompletedBy" (mig 0421) กลับด้วย — ลิสต์คอลัมน์ตายตัวที่ขาดคอลัมน์
--        = ค่านั้นกลายเป็น NULL ทุกแถวเงียบ ๆ (บทเรียนเดียวกับ actualStartDate ใน 0239)
--  ⚠️ เพิ่มคอลัมน์ใหม่ใน project_tasks เมื่อไร ต้องต่อคอลัมน์ในฟังก์ชันนี้ในคอมมิตเดียวกัน
--     (ยาม: lib/sales/dealTimelineRestore.test.mjs เทียบลิสต์กับคอลัมน์ที่ snapshot ถือ)
--
--  ⚠ รันมือบน Supabase SQL Editor · บล็อกเดียว · SELECT ท้ายไฟล์ = ตรวจว่ามีฟังก์ชันแล้วและ anon เรียกไม่ได้
-- ============================================================

CREATE OR REPLACE FUNCTION public.deal_restore_timeline_revision(p_deal_id text, p_rev_no integer)
RETURNS json
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tasks jsonb;
  v_project_id text;
  v_deleted integer;
  v_overwritten integer;
  v_recreated integer;
  v_total integer;
BEGIN
  SELECT snapshot -> 'tasks' INTO v_tasks
    FROM public.deal_timeline_revisions
   WHERE "dealId" = p_deal_id AND "revNo" = p_rev_no;
  IF v_tasks IS NULL OR jsonb_typeof(v_tasks) <> 'array' THEN
    RAISE EXCEPTION 'deal_timeline_revision_not_found' USING errcode = 'P0002';
  END IF;

  -- โครงการของดีล "ตอนนี้" (ดีลย้ายโครงการหลังออก Rev. ได้) · ล็อกแถวดีลกันย้อนซ้อนกันสองหน้าต่าง
  SELECT "projectId" INTO v_project_id FROM public.sales_deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal_not_found' USING errcode = 'P0002';
  END IF;

  v_total := jsonb_array_length(v_tasks);
  SELECT count(*) INTO v_deleted FROM public.project_tasks pt
   WHERE pt."dealId" = p_deal_id
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_tasks) e WHERE e ->> 'id' = pt.id);
  SELECT count(*) INTO v_overwritten FROM public.project_tasks pt
   WHERE pt."dealId" = p_deal_id
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_tasks) e WHERE e ->> 'id' = pt.id);
  v_recreated := v_total - v_overwritten;

  DELETE FROM public.project_tasks WHERE "dealId" = p_deal_id;

  INSERT INTO public.project_tasks (
    "id", "projectId", "dealId", "stepOrder", "name", "role", "assignee", "assigneeId", "phase", "isMilestone",
    "durationDays", "startDate", "finishDate", "actualStartDate", "actualFinishDate", "status",
    "predecessors", "cellsOverride",
    "note", "showNoteInPrint", "origin", "userEdited", "dueDate", "startLocked",
    "workflowTemplateVersionId", "workflowTemplateStepKey",
    "systemCompletedAt", "systemCompletedBy", "updatedAt"
  )
  SELECT
    t ->> 'id', v_project_id, p_deal_id, COALESCE((t ->> 'stepOrder')::int, 0), COALESCE(t ->> 'name', ''),
    COALESCE(t ->> 'role', 'SA'), t ->> 'assignee', t ->> 'assigneeId', t ->> 'phase',
    COALESCE((t ->> 'isMilestone')::boolean, false), COALESCE((t ->> 'durationDays')::int, 1),
    NULLIF(t ->> 'startDate', '')::date, NULLIF(t ->> 'finishDate', '')::date,
    NULLIF(t ->> 'actualStartDate', '')::date, NULLIF(t ->> 'actualFinishDate', '')::date,
    COALESCE(t ->> 'status', 'Pending'),
    COALESCE(t -> 'predecessors', '[]'::jsonb), t -> 'cellsOverride',
    COALESCE(t ->> 'note', ''), COALESCE((t ->> 'showNoteInPrint')::boolean, false),
    COALESCE(t ->> 'origin', 'template'), COALESCE((t ->> 'userEdited')::boolean, false),
    NULLIF(t ->> 'dueDate', '')::date, COALESCE((t ->> 'startLocked')::boolean, false),
    NULLIF(t ->> 'workflowTemplateVersionId', ''), NULLIF(t ->> 'workflowTemplateStepKey', ''),
    NULLIF(t ->> 'systemCompletedAt', '')::timestamptz, NULLIF(t ->> 'systemCompletedBy', ''),
    now()
  FROM jsonb_array_elements(v_tasks) t;

  -- ย้อนแล้ว live = Rev. นี้เป๊ะ · trigger ของ 0435 ตีดีลเป็น "แก้แล้ว" ระหว่างลบ/ใส่ ⇒ เขียนทับหลังสุด
  UPDATE public.sales_deals
     SET "timelineRev" = p_rev_no,
         "timelineRevStale" = false
   WHERE id = p_deal_id;

  RETURN json_build_object(
    'restored', true,
    'revNo', p_rev_no,
    'deleted', v_deleted,
    'recreated', v_recreated,
    'overwritten', v_overwritten
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deal_restore_timeline_revision(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deal_restore_timeline_revision(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจ ───────────────────────────────────────────────────────────────────
SELECT
  to_regprocedure('public.deal_restore_timeline_revision(text, integer)') IS NOT NULL AS function_exists,
  has_function_privilege('anon', 'public.deal_restore_timeline_revision(text, integer)', 'EXECUTE') AS anon_can_execute;
