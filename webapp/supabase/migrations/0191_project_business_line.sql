-- ============================================================
--  Migration 0191: projects.line — สายธุรกิจ PRODUCT | SERVICE
--  แผน docs/business-line-level-and-handoff.md §1, §4
--
--  ⭐ มติ 2026-08-02: แกนสายธุรกิจอยู่ที่ **โครงการ** ไม่ใช่ดีล
--  เพราะโครงการคือหน่วยที่ตัดสินว่า "งานนี้จบยังไง" — ส่งของแล้วจบ (PRODUCT)
--  vs ตั้งรอบดูแลตลอดกาล (SERVICE) · ส่วนดีลถือ `dealType` (SCENT/NPD/RE-ORDER)
--  ที่ตัดสินว่า "ใบนี้เติมช่วงไหนของเส้นทาง" เหมือนเดิม
--  ⇒ แม่แบบไทม์ไลน์ = คู่ (project.line, deal.type)
--
--  ⚠️ **ห้ามมี DEFAULT — โดยเจตนา**
--  นี่คือบทเรียนตรงจาก `projects.type` ในไฟล์เดียวกันนี้ (`0008:17`) ที่เขียนว่า
--    "type" text not null default 'NPD' check (...)
--  แล้วผลคือ **โครงการทั้ง 11 ใบบน prod เป็น 'NPD' หมด** รวม 2 ใบของทีม SV
--  ที่เป็นงานบริการชัด ๆ — เพราะไม่มีใครถูกบังคับให้เลือก และหน้าสร้างโครงการ
--  ฝั่งขาย (SalesProjectCreateModal) ก็ไม่มีช่องนี้เลยสักช่อง
--
--  คอลัมน์นี้จึง **nullable ไม่มี default** · ของเก่าเป็น NULL แล้วขึ้นตัวนับ
--  "โครงการที่ยังไม่ระบุสาย" ให้คนมาเลือกเอง — เดาแทนแล้วเงียบคือสิ่งที่ต้องกัน
--
--  ⚠ รันมือบน Supabase SQL Editor · additive อย่างเดียว รันก่อน deploy ได้
--  ⚠ รันซ้ำได้ (idempotent)
-- ============================================================

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS line text;

-- ตั้ง CHECK แยกจาก ADD COLUMN เพื่อให้รันซ้ำได้ (ADD CONSTRAINT ไม่มี IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass
      AND conname = 'projects_line_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_line_check
      CHECK (line IS NULL OR line IN ('PRODUCT', 'SERVICE'));
  END IF;
END $$;

COMMENT ON COLUMN public.projects.line IS
  'สายธุรกิจ PRODUCT|SERVICE — NULL = ยังไม่ระบุ (ห้ามใส่ default ดูหัวไฟล์ 0191)';

-- ดัชนีของ "ยังไม่ระบุสาย" — ตัวนับบนหน้ารวมโครงการยิงคิวรีนี้ทุกครั้งที่เปิดหน้า
-- partial index เพราะแถวที่ระบุแล้วไม่เกี่ยวกับคิวรีนี้เลย
CREATE INDEX IF NOT EXISTS projects_line_unset_idx
  ON public.projects (id) WHERE line IS NULL;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
