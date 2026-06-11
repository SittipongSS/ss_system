-- ============================================================
--  Migration 0022: ที่มาของ task — แยก template / เพิ่มใหม่ / แก้ไขโดยผู้ใช้
--  "origin"     : 'template' (seed จาก template) | 'custom' (ผู้ใช้เพิ่มเอง)
--  "userEdited" : true เมื่อผู้ใช้แก้ field สำคัญของ task จาก template
--                 (ไม่นับการเปลี่ยนสถานะ / การเลื่อน downstream อัตโนมัติ)
--  Additive + idempotent. ⚠ ต้องรัน migration นี้ก่อน deploy โค้ดที่ insert origin
-- ============================================================

alter table public.project_tasks add column if not exists "origin"     text    not null default 'template';
alter table public.project_tasks add column if not exists "userEdited"  boolean not null default false;

-- Backfill "เพิ่มใหม่" ย้อนหลัง: task ที่ถูกสร้างหลังชุด seed แรกของโปรเจกต์ (> 5 วินาที)
-- ถือว่าเป็น task ที่ผู้ใช้เพิ่มเองภายหลัง (template ทั้งชุดถูก insert พร้อมกันตอนสร้างโปรเจกต์).
-- ประวัติ "แก้ไข" ย้อนหลังกู้ไม่ได้ → userEdited เริ่มนับจากตอนนี้.
update public.project_tasks pt
set "origin" = 'custom'
where "origin" = 'template'
  and "createdAt" > (
    select min(t2."createdAt") + interval '5 seconds'
    from public.project_tasks t2
    where t2."projectId" = pt."projectId"
  );
