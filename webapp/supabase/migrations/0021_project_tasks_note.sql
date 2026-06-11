-- ============================================================
--  Migration 0021: เพิ่ม "note" + "showNoteInPrint" ให้ project_tasks
--  หมายเหตุประจำแต่ละขั้นตอน + ติ๊กเลือกว่าจะให้แสดงตอนพิมพ์เอกสาร ISO หรือไม่.
--  default false = ไม่โชว์ตอนพิมพ์ (ต้องติ๊กเอง). Additive + idempotent.
-- ============================================================

alter table public.project_tasks add column if not exists "note"            text default '';
alter table public.project_tasks add column if not exists "showNoteInPrint" boolean not null default false;
