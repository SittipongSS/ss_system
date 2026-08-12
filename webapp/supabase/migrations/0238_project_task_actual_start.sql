-- ============================================================
--  Migration 0238: วันเริ่มจริงของขั้นตอนไทม์ไลน์ (มติผู้ใช้ 2026-08-12)
--  (เดิมจอง 0236 · ชนกับ 0236_drop_chat_webhooks และ 0237_master_code_atomic_insert
--   ที่เข้า main ก่อน จึงเลื่อนเลขไฟล์ — **เนื้อ SQL ไม่เปลี่ยน** ตามกติกาโปรเจกต์)
--
--  ⭐ ที่มา: ไทม์ไลน์เป็นเอกสาร "แผน" แล้วของจริงต้องเดินคู่ไปใต้แผนได้ แต่ฐานเก็บฝั่ง
--  ของจริงไว้ครึ่งเดียว — mig 0009 ให้ `actualFinishDate` มาตั้งแต่ต้น (server ตั้งให้เอง
--  ตอนกด "เสร็จแล้ว") แต่ **ไม่มีคู่ของมันฝั่งวันเริ่ม** และไม่มีตารางประวัติสถานะของ
--  ขั้นตอน (ดีลมี sales_deal_stage_history · ขั้นตอนไม่มี) · route แก้ขั้นตอนก็ไม่เรียก
--  recordAudit ⇒ ทั้งระบบตอบไม่ได้เลยว่าขั้นไหน "เริ่มทำจริง" วันไหน
--
--  สแตมตอนไหน: ตอนสถานะเปลี่ยนเป็น 'In Progress' — การกดนั้นเป็นการกระทำของคนล้วน ๆ
--  (lib/pm/status.js ควบคุมอัตโนมัติเฉพาะ 'Pending') จึงแปลว่า "คนบอกว่าเริ่มทำวันนี้"
--  ไม่ใช่ผลข้างเคียงของการคำนวณ · ถอยกลับเป็น Pending = ล้างค่า (กระจกเงาของกติกา
--  actualFinishDate ที่มีอยู่แล้วใน PATCH /api/pm/project-tasks/[id])
--
--  ⚠️ **ไม่ backfill** — ขั้นตอนที่ทำไปแล้วไม่มีร่องรอยว่าเริ่มวันไหน การเดาจาก
--  startDate (วันตามแผน) จะกลายเป็น "ของจริง" ปลอมที่แยกไม่ออกจากของจริงจริง ๆ
--  แถวเก่าจึงเป็น NULL และหน้าจอแสดง "—" ตรงบรรทัดของจริง
--
--  ⚠️ รันมือบน Supabase SQL Editor · เพิ่มคอลัมน์ล้วน ไม่แตะข้อมูลเดิม ปลอดภัยกับโค้ดเก่า
--  (โค้ดเวอร์ชันก่อนหน้าไม่รู้จักคอลัมน์นี้และไม่แตะมัน) ⇒ รันล่วงหน้าได้ทันที
--  แต่ **ต้องรันก่อน deploy** ไม่งั้น PATCH ขั้นตอนที่เปลี่ยนสถานะจะตอบ 500
--  "Could not find the 'actualStartDate' column of 'project_tasks' in the schema cache"
--  = กดเริ่มทำ/กดเสร็จไม่ได้ทั้งระบบ ไม่ใช่แค่เรื่องการแสดงผล
--
--  ⚠️ เลข 0238 จองต่อจาก 0237 ตามกติกาโปรเจกต์ — ถ้าสายอื่น merge ก่อนแล้วกินเลขนี้ไป
--  ให้เลื่อนเลขไฟล์ **โดยไม่แตะเนื้อ SQL** (เคสเดียวกับที่ 0219 → 0223 เคยเจอ)
-- ============================================================

BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS "actualStartDate" date;

-- เริ่มจริงต้องไม่หลังเสร็จจริง — แถวที่กลับด้านอ่านไม่ออกว่าแปลว่าอะไร และทำให้
-- ส่วนต่างที่โชว์บนตารางติดลบแบบไม่มีความหมาย (แถวที่มีค่าข้างเดียวยังปกติ:
-- กำลังทำ = มีเริ่มจริงยังไม่มีเสร็จจริง · ของเก่า = มีเสร็จจริงแต่ไม่มีเริ่มจริง)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_actual_order'
  ) THEN
    ALTER TABLE public.project_tasks
      ADD CONSTRAINT project_tasks_actual_order
      CHECK (
        "actualStartDate" IS NULL
        OR "actualFinishDate" IS NULL
        OR "actualFinishDate" >= "actualStartDate"
      );
  END IF;
END $$;

-- ── ย้อน Rev ต้องไม่กลืนวันเริ่มจริง ────────────────────────────────────
-- 🐞 `pm_restore_snapshot` (mig 0044 → แทนที่ใน 0121) **ลบ task ทั้งโครงการแล้ว insert
--    ใหม่จาก snapshot ด้วยลิสต์คอลัมน์ที่สะกดไว้ตายตัว** ⇒ คอลัมน์ใหม่ที่ไม่ได้ใส่ในลิสต์
--    จะกลายเป็น NULL ทุกแถวเงียบ ๆ ทันทีที่มีคนกด "ย้อนกลับไป Rev นี้"
--    วันเริ่มจริงของทั้งโครงการหายโดยไม่มีข้อความอะไรบอก — ต้องต่อคอลัมน์ในคอมมิตเดียวกัน
--    (snapshot เก่าที่ยังไม่มีคีย์นี้จะได้ NULL ซึ่งถูกแล้ว: ตอนนั้นยังไม่มีการเก็บ)
CREATE OR REPLACE FUNCTION public.pm_restore_snapshot(p_project_id text, p_snapshot_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE v_tasks jsonb; v_deleted int; v_overwritten int; v_recreated int; v_total int;
BEGIN
  SELECT snapshot -> 'tasks' INTO v_tasks FROM public.project_doc_revisions
  WHERE id = p_snapshot_id AND "projectId" = p_project_id;
  IF v_tasks IS NULL OR jsonb_typeof(v_tasks) <> 'array' THEN
    RAISE EXCEPTION 'snapshot_not_found' USING errcode = 'P0002';
  END IF;
  v_total := jsonb_array_length(v_tasks);
  SELECT count(*) INTO v_deleted FROM public.project_tasks pt WHERE pt."projectId" = p_project_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_tasks) e WHERE e->>'id' = pt.id);
  SELECT count(*) INTO v_overwritten FROM public.project_tasks pt WHERE pt."projectId" = p_project_id
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_tasks) e WHERE e->>'id' = pt.id);
  v_recreated := v_total - v_overwritten;
  DELETE FROM public.project_tasks WHERE "projectId" = p_project_id;
  INSERT INTO public.project_tasks (
    "id", "projectId", "stepOrder", "name", "role", "assignee", "assigneeId", "phase", "isMilestone",
    "durationDays", "startDate", "finishDate", "actualStartDate", "actualFinishDate", "status",
    "predecessors", "cellsOverride",
    "note", "showNoteInPrint", "origin", "userEdited", "dueDate", "startLocked",
    "workflowTemplateVersionId", "workflowTemplateStepKey", "updatedAt"
  ) SELECT
    t->>'id', p_project_id, COALESCE((t->>'stepOrder')::int, 0), COALESCE(t->>'name', ''),
    COALESCE(t->>'role', 'SA'), t->>'assignee', t->>'assigneeId', t->>'phase',
    COALESCE((t->>'isMilestone')::boolean, false), COALESCE((t->>'durationDays')::int, 1),
    NULLIF(t->>'startDate', '')::date, NULLIF(t->>'finishDate', '')::date,
    NULLIF(t->>'actualStartDate', '')::date,
    NULLIF(t->>'actualFinishDate', '')::date, COALESCE(t->>'status', 'Pending'),
    COALESCE(t->'predecessors', '[]'::jsonb), t->'cellsOverride', COALESCE(t->>'note', ''),
    COALESCE((t->>'showNoteInPrint')::boolean, false), COALESCE(t->>'origin', 'template'),
    COALESCE((t->>'userEdited')::boolean, false), NULLIF(t->>'dueDate', '')::date,
    COALESCE((t->>'startLocked')::boolean, false), NULLIF(t->>'workflowTemplateVersionId', ''),
    NULLIF(t->>'workflowTemplateStepKey', ''), now()
  FROM jsonb_array_elements(v_tasks) t;
  RETURN json_build_object('restored', true, 'deleted', v_deleted, 'recreated', v_recreated, 'overwritten', v_overwritten);
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.project_tasks WHERE "actualStartDate" IS NOT NULL;  -- ต้องได้ 0
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.project_tasks'::regclass AND conname = 'project_tasks_actual_order';
--   ต้องได้ 1 แถว

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- ALTER TABLE public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_actual_order;
-- ALTER TABLE public.project_tasks DROP COLUMN IF EXISTS "actualStartDate";
-- แล้วรัน pm_restore_snapshot เวอร์ชันของ mig 0121 ทับกลับ (ลิสต์คอลัมน์ไม่มี actualStartDate)
-- NOTIFY pgrst, 'reload schema';
