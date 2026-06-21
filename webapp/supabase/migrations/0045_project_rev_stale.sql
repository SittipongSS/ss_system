-- ============================================================
--  Migration 0045: "live doc แก้ไขหลังออก Rev" flag (PM doc revisions)
--
--  H1 — หลังออก Rev แล้ว ถ้าย้อนกลับ (restore) หรือแก้ขั้นตอนใด ๆ live doc จะไม่ตรงกับ
--       Rev ทางการล่าสุดอีกต่อไป แต่ป้าย/หัวพิมพ์ยังขึ้น "Rev. N" ทับเนื้อหาที่ต่าง.
--       เพิ่ม flag projects."revStale": true = live diverged จาก Rev ล่าสุด.
--         • แก้ task ใด ๆ (insert/update/delete) → trigger ตั้ง true อัตโนมัติ
--           (ครอบทุกทาง: PATCH/POST/DELETE/reorder/restore/เปลี่ยนหมวด — ไม่ต้องแก้ราย route)
--         • ออก Rev (kind='rev') → API ตั้ง false (snapshot = live อีกครั้ง)
--       UI โชว์ "Rev. N • แก้แล้ว" และพิมพ์ live เป็น "ฉบับร่าง" เมื่อ true
--       (ไม่แตะ currentRev → ไม่มีปัญหาเลข Rev ซ้ำ, ประวัติ Rev ไม่หาย).
--
--  additive + idempotent. ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role ไม่ได้).
-- ============================================================

alter table public.projects
  add column if not exists "revStale" boolean not null default false;

-- แก้ task ใด ๆ ในโปรเจกต์ → live doc ต่างจาก Rev ล่าสุด → ตั้ง revStale=true.
-- ใช้ row-level AFTER trigger; delete อ่าน OLD, insert/update อ่าน NEW.
create or replace function public.pm_mark_rev_stale()
returns trigger
language plpgsql
as $$
declare
  v_pid text;
begin
  v_pid := coalesce(NEW."projectId", OLD."projectId");
  if v_pid is not null then
    update public.projects set "revStale" = true
     where id = v_pid and "revStale" = false;  -- เขียนเฉพาะเมื่อยังไม่ stale (กัน write ซ้ำ)
  end if;
  return null; -- AFTER trigger: ค่าคืนไม่ถูกใช้
end;
$$;

drop trigger if exists project_tasks_mark_rev_stale on public.project_tasks;
create trigger project_tasks_mark_rev_stale
  after insert or update or delete on public.project_tasks
  for each row execute function public.pm_mark_rev_stale();

NOTIFY pgrst, 'reload schema';
