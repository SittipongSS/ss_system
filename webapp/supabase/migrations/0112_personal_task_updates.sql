-- 0112 - งานของฉัน (personal_tasks): สายบันทึกอัปเดตความคืบหน้า (thread)
--   ให้เจ้าของงานอัปเดตได้ตลอดว่า "ติดอะไร/คืบหน้าแค่ไหน" (หัวหน้ามาถามแล้วเห็นทันที)
--   แพตเทิร์นเดียวกับ mgmt_updates (0080) + inquiry_messages (0104).
--   kind: note = โน้ตที่พิมพ์เอง, status = ระบบบันทึกตอนเปลี่ยนสถานะ,
--         due = เลื่อนกำหนด, late = เหตุผลตอนปิดงานที่เลยกำหนด
-- ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (เหมือน migration อื่น).

CREATE TABLE IF NOT EXISTS public.personal_task_updates (
  id           text PRIMARY KEY,
  "taskId"     text NOT NULL,
  kind         text NOT NULL DEFAULT 'note'
               CHECK (kind IN ('note', 'status', 'due', 'late')),
  body         text,
  "fromStatus" text,
  "toStatus"   text,
  "authorId"   text,
  "authorName" text,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_task_updates_task_idx
  ON public.personal_task_updates ("taskId", "createdAt");
ALTER TABLE public.personal_task_updates ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
