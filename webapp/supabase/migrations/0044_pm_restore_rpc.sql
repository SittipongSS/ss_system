-- ============================================================
--  Migration 0044: atomic restore RPC + revNo uniqueness (PM doc revisions)
--
--  H2 — restore เดิมทำใน API ทีละแถว (delete → insert → update) ไม่ atomic:
--       ถ้าพังกลางคันข้อมูล task ค้างครึ่ง ๆ กู้ไม่ได้. ย้ายลอจิกย้อนทั้งชุดมาเป็น
--       Postgres function (รันใน transaction เดียว — สำเร็จทั้งหมดหรือไม่เปลี่ยนเลย).
--       วิธี: ลบ task ของโปรเจกต์ทั้งหมด แล้ว insert จาก snapshot ใหม่หมด — ผลลัพธ์
--       เท่ากับ delete-ส่วนเกิน/insert-ที่ขาด/update-ที่มี ของเดิม แต่ปลอดภัยกว่า
--       (ไม่มี FK ชี้มาที่ project_tasks.id — predecessors เป็น jsonb, ลบ-สร้างใหม่ได้).
--
--  M1 — เพิ่ม unique index กันเลข Rev ซ้ำที่ต้นเหตุ (race ตอนออก Rev พร้อมกัน).
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0043).
--  ⚠ ถ้าข้อมูลเดิมมี revNo ซ้ำสำหรับ kind='rev' การสร้าง unique index จะ error —
--     ต้อง dedupe ก่อน (ลบ/รวมแถวซ้ำ) แล้วค่อยรันใหม่.
-- ============================================================

-- ── M1: unique revNo ต่อโปรเจกต์ เฉพาะเวอร์ชันทางการ (save มี revNo=null → ไม่นับ) ──
create unique index if not exists doc_rev_unique_revno
  on public.project_doc_revisions ("projectId", "revNo")
  where "kind" = 'rev';

-- ── H2: atomic restore ──────────────────────────────────────
-- คืน json { restored, deleted, recreated, overwritten } เหมือนที่ API เดิมรายงาน.
-- อ่าน snapshot จาก DB เอง (authoritative — ไม่เชื่อค่าจาก client).
create or replace function public.pm_restore_snapshot(
  p_project_id text,
  p_snapshot_id uuid
) returns json
language plpgsql
as $$
declare
  v_tasks       jsonb;
  v_deleted     int;
  v_overwritten int;
  v_recreated   int;
  v_total       int;
begin
  -- snapshot ต้องเป็นของโปรเจกต์นี้ (กัน id ข้ามโปรเจกต์)
  select (snapshot -> 'tasks')
    into v_tasks
    from public.project_doc_revisions
   where id = p_snapshot_id and "projectId" = p_project_id;

  if v_tasks is null or jsonb_typeof(v_tasks) <> 'array' then
    raise exception 'snapshot_not_found' using errcode = 'P0002';
  end if;

  v_total := jsonb_array_length(v_tasks);

  -- นับก่อนเปลี่ยน (เพื่อรายงานผลให้ตรงกับของเดิม)
  select count(*) into v_deleted
    from public.project_tasks pt
   where pt."projectId" = p_project_id
     and not exists (
       select 1 from jsonb_array_elements(v_tasks) e where e->>'id' = pt.id
     );

  select count(*) into v_overwritten
    from public.project_tasks pt
   where pt."projectId" = p_project_id
     and exists (
       select 1 from jsonb_array_elements(v_tasks) e where e->>'id' = pt.id
     );

  v_recreated := v_total - v_overwritten;

  -- replace ทั้งชุด (atomic — อยู่ใน transaction ของ function)
  delete from public.project_tasks where "projectId" = p_project_id;

  insert into public.project_tasks (
    "id", "projectId", "stepOrder", "name", "role", "assignee", "assigneeId",
    "phase", "isMilestone", "durationDays", "startDate", "finishDate",
    "actualFinishDate", "status", "predecessors", "cellsOverride", "note",
    "showNoteInPrint", "origin", "userEdited", "dueDate", "startLocked", "updatedAt"
  )
  select
    t->>'id',
    p_project_id,                                             -- บังคับ projectId (กัน snapshot ข้ามโปรเจกต์)
    coalesce((t->>'stepOrder')::int, 0),
    coalesce(t->>'name', ''),
    coalesce(t->>'role', 'SA'),
    t->>'assignee',
    t->>'assigneeId',
    t->>'phase',
    coalesce((t->>'isMilestone')::boolean, false),
    coalesce((t->>'durationDays')::int, 1),
    nullif(t->>'startDate', '')::date,
    nullif(t->>'finishDate', '')::date,
    nullif(t->>'actualFinishDate', '')::date,
    coalesce(t->>'status', 'Pending'),
    coalesce(t->'predecessors', '[]'::jsonb),
    t->'cellsOverride',
    coalesce(t->>'note', ''),
    coalesce((t->>'showNoteInPrint')::boolean, false),
    coalesce(t->>'origin', 'template'),
    coalesce((t->>'userEdited')::boolean, false),
    nullif(t->>'dueDate', '')::date,
    coalesce((t->>'startLocked')::boolean, false),
    now()
  from jsonb_array_elements(v_tasks) as t;

  return json_build_object(
    'restored', true,
    'deleted', v_deleted,
    'recreated', v_recreated,
    'overwritten', v_overwritten
  );
end;
$$;

NOTIFY pgrst, 'reload schema';
