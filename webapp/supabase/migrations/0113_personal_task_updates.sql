-- ============================================================
--  Migration 0113: personal_task_updates — สายอัปเดตความคืบหน้าของงาน
--
--  ที่มา (มติผู้ใช้ 2026-07-16, ทำจริง 2026-07-17): "งานที่เลยกำหนด บางทีหัวหน้าจะมา
--  ถามว่าทำไมยังไม่เสร็จ เลยอยากให้อัปเดตสถานะได้ว่าติดอะไร" — #459 ทำไปแค่ครึ่งเดียว
--  (สาเหตุตอนปิดงานเกินกำหนด + จำเดดไลน์แรก, mig 0111) เธรดอัปเดตยังไม่เคยมี.
--
--  kind:
--    comment — คนพิมพ์เอง ("ติดรออนุมัติจากลูกค้า")
--    status  — ระบบบันทึกให้ตอนเปลี่ยนสถานะ
--    due     — ระบบบันทึกให้ตอนเลื่อนกำหนดเสร็จ (คู่กับ originalDueDate ของ 0111)
--    late    — สาเหตุที่ทำเสร็จช้า ตอนปิดงานที่เลยกำหนด
--  ระบบเขียนให้เองหลัง write สำเร็จ (แพตเทิร์นเดียวกับ mgmt_updates 0080 /
--  inquiry_messages 0104) — คู่กับ recordAudit แต่คนละหน้าที่: audit = ใครแก้อะไร
--  (supervisor อ่าน), updates = เล่าให้ทีมฟังว่าติดอะไร (ทุกคนในงานอ่าน).
--
--  ไม่มี FK ไป personal_tasks โดยเจตนา — ตรงกับความสัมพันธ์อื่นในตารางนี้
--  (ดู [[no-real-fk-constraints]]); ลบงานแล้วให้ API เก็บกวาดเอง.
--
--  additive ล้วน รันซ้ำได้. ⚠ รันมือบน Supabase SQL Editor ก่อน/พร้อม deploy —
--  ยังไม่รัน = หน้ารายละเอียดงานจะโหลดเธรดไม่ได้ (แต่ตัวงานยังใช้ได้ปกติ).
--
--  ⚠ prod เคยมีตารางชื่อนี้อยู่ก่อนแล้ว จากเซสชันเก่าที่ลองทำเธรดแล้วไม่จบ —
--  schema คนละแบบ (มี fromStatus/toStatus แทน meta) และไม่เคยมีไฟล์ migration
--  ในโปรเจกต์. "create table if not exists" จึงเป็น no-op เงียบ ๆ ไม่ซ่อมอะไร
--  แล้ว insert พังด้วย "Could not find the 'meta' column".
--  ⇒ ต้องมี alter add/drop ต่อท้ายเสมอ ตัว create table อย่างเดียวไม่พอ
--    (บทเรียน: idempotent ที่แท้จริง = รันกับตารางที่ผิดรูปแล้วต้องซ่อมให้ถูก
--     ไม่ใช่แค่ "รันซ้ำแล้วไม่ error")
-- ============================================================

create table if not exists public.personal_task_updates (
  id           text primary key,
  "taskId"     text not null,
  kind         text not null default 'comment'
               check (kind in ('comment', 'status', 'due', 'late')),
  body         text,
  meta         jsonb default '{}'::jsonb,   -- {field, from, to}
  "authorId"   text,
  "authorName" text,
  "createdAt"  timestamptz not null default now()
);

-- ซ่อมตารางที่สร้างไว้ก่อนด้วย schema เก่า (no-op ถ้าสร้างใหม่จากบล็อกข้างบน)
alter table public.personal_task_updates
  add column if not exists "taskId"     text,
  add column if not exists kind         text default 'comment',
  add column if not exists body         text,
  add column if not exists meta         jsonb default '{}'::jsonb,
  add column if not exists "authorId"   text,
  add column if not exists "authorName" text,
  add column if not exists "createdAt"  timestamptz default now();

-- คอลัมน์จากดีไซน์เก่า: เก็บได้แค่การเปลี่ยนสถานะ ใช้กับ kind='due' (เลื่อนกำหนด)
-- ไม่ได้ — meta jsonb เก็บ {field, from, to} ได้ทุกชนิด. ไม่มีโค้ดไหนอ่าน/เขียน
-- สองตัวนี้ (ในระบบมี fromStatus/toStatus ที่ sales_lead_events — คนละตาราง)
alter table public.personal_task_updates
  drop column if exists "fromStatus",
  drop column if exists "toStatus";

-- check constraint ของ kind: ตารางเก่าอาจมีของเดิมที่ไม่รู้จัก 'comment'/'due'/'late'
-- (ชื่อ constraint เดาไม่ได้) — ล้าง check ทั้งหมดบนตารางนี้แล้วใส่ชุดที่ถูกกลับไป
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.personal_task_updates'::regclass and contype = 'c'
  loop
    execute format('alter table public.personal_task_updates drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.personal_task_updates
  add constraint personal_task_updates_kind_check
  check (kind in ('comment', 'status', 'due', 'late'));

create index if not exists personal_task_updates_task_idx
  on public.personal_task_updates ("taskId", "createdAt" desc);

alter table public.personal_task_updates enable row level security;

NOTIFY pgrst, 'reload schema';
