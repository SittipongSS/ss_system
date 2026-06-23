-- ============================================================
--  Migration 0043: working-saves + rollback (ต่อยอด 0040 doc revisions)
--  โมเดลใหม่ (คล้าย Git):
--    kind='save' = "เซฟใหญ่" จุดย้อนระหว่างทำ — ถ่าย snapshot ทุกครั้งที่กดเซฟ,
--                  ไม่มีเลข Rev ("revNo" = null), เก็บย้อนหลัง 3 วัน (prune ใน API).
--    kind='rev'  = "ออกเวอร์ชัน (Rev)" เวอร์ชันทางการสำหรับส่ง/อ้างอิง — มีเลข Rev,
--                  เก็บถาวร (ค่าเดิมทั้งหมดเป็น 'rev').
--  ทั้งสอง snapshot งานทั้งชุด → ย้อนกลับ (restore) ได้เหมือนกันผ่าน snapshot id.
--  additive + idempotent. ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role ไม่ได้).
-- ============================================================

-- ประเภทของ snapshot; แถวเดิมทั้งหมด = เวอร์ชันทางการ → default 'rev'
alter table public.project_doc_revisions
  add column if not exists "kind" text not null default 'rev'
    check ("kind" in ('save','rev'));

-- working-save ไม่มีเลข Rev → ปลดเงื่อนไข not null ของ revNo
alter table public.project_doc_revisions
  alter column "revNo" drop not null;

-- ดึงประวัติเรียงตามเวลา (รวม save + rev ในไทม์ไลน์เดียว)
create index if not exists doc_rev_project_created_idx
  on public.project_doc_revisions ("projectId", "createdAt" desc);

NOTIFY pgrst, 'reload schema';
