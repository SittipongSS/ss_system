-- 0117 - ด่านอนุมัติปิดโครงการ (เฟส F — มติผู้ใช้ 2026-07-18).
-- ปิดโครงการทุกแบบ (สำเร็จ/ยกเลิก) ต้องให้ AE Supervisor อนุมัติ; ปิดแล้วเปิดใหม่ได้
-- (Supervisor/admin) เพื่อรองรับ RE-ORDER. เป็นชั้นเซ็นรับรองแยกจาก status free text เดิม.
--   closeStatus: open (ค่าเริ่มต้น) → pending_close (ขอปิด) → closed (อนุมัติ); reject/reopen → open
--   closeType:   completed (ปิดสำเร็จ) | cancelled (ยกเลิก) — เลือกตอนขอปิด

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS "closeStatus" text NOT NULL DEFAULT 'open'
    CHECK ("closeStatus" IN ('open', 'pending_close', 'closed')),
  ADD COLUMN IF NOT EXISTS "closeType" text
    CHECK ("closeType" IS NULL OR "closeType" IN ('completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS "closeReason" text,
  ADD COLUMN IF NOT EXISTS "closeRequestedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "closeRequestedBy" text,
  ADD COLUMN IF NOT EXISTS "closeRequestedByName" text,
  ADD COLUMN IF NOT EXISTS "closedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "closedBy" text,
  ADD COLUMN IF NOT EXISTS "closedByName" text;

CREATE INDEX IF NOT EXISTS projects_close_status_idx ON public.projects ("closeStatus");

NOTIFY pgrst, 'reload schema';
