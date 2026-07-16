-- 0111 - งานของฉัน (personal_tasks): เก็บสาเหตุที่ทำเสร็จเกินกำหนด + เดดไลน์แรก
--   • lateReason      — สาเหตุที่กดเสร็จหลังเลยกำหนด (บังคับกรอกฝั่ง server ตอนปิดงานที่เลยกำหนด)
--   • originalDueDate — เดดไลน์แรกก่อนถูกเลื่อนครั้งแรก (จำไว้เพื่อวัดการเลื่อน; null = ไม่เคยเลื่อน)
-- ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (เหมือน migration อื่น).

ALTER TABLE public.personal_tasks
  ADD COLUMN IF NOT EXISTS "lateReason" text,
  ADD COLUMN IF NOT EXISTS "originalDueDate" date;

NOTIFY pgrst, 'reload schema';
