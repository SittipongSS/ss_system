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

create index if not exists personal_task_updates_task_idx
  on public.personal_task_updates ("taskId", "createdAt" desc);

alter table public.personal_task_updates enable row level security;

NOTIFY pgrst, 'reload schema';
