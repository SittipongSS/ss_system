-- 0421 — งานไทม์ไลน์ที่ระบบติ๊กเสร็จให้เอง (แผนรื้อสรรพสามิต Q21 · มติเจ้าของ 03/11/2026)
--
--  งาน SA "วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต" (npd-43 · reorder-16) ปิดเองเมื่อใบสั่งขายทุกใบของดีลออกใบค่าสรรพสามิต
--  หรือตัดสินไม่เรียกเก็บแล้ว · ย้อนการตัดสิน = งานกลับเป็นค้าง — **เฉพาะงานที่ระบบติ๊กเอง** (งานที่คนติ๊กเองไม่แตะ)
--  ⇒ ต้องจำว่าใครติ๊ก: สองคอลัมน์นี้ตั้งโดยตัวซิงก์ (`lib/pm/exciseBillingTaskSync.js`) · คนเปลี่ยนสถานะเองเมื่อไร
--     route PATCH ของขั้นตอนล้างทิ้ง (งานกลับเป็นของคน)
--
--  🛑 รันไฟล์นี้ก่อน merge PR ของงานนี้ — โค้ดชุดนั้นอ่าน/เขียนสองคอลัมน์นี้ · รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม
--  ✅ รันซ้ำได้ (IF NOT EXISTS · DROP CONSTRAINT IF EXISTS)
--  ⚠️ CHECK กันแค่ "มีคู่" — ไม่ผูกกับคอลัมน์ status เพราะมีทางเขียนสถานะหลายทาง (resync แม่แบบ · propagate) ที่ไม่รู้จักคอลัมน์นี้
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: cols = 2 · chk = 1 · marked_rows = 0 ──
--   SELECT
--    (SELECT count(*) FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'project_tasks'
--        AND column_name IN ('systemCompletedAt', 'systemCompletedBy')) AS cols,
--    (SELECT count(*) FROM pg_constraint WHERE convalidated AND conname = 'project_tasks_system_completed_pair') AS chk,
--    (SELECT count(*) FROM public.project_tasks WHERE "systemCompletedBy" IS NOT NULL) AS marked_rows;
--
--  ── ถอยกลับ (งานที่ระบบติ๊กไว้คงสถานะ Completed · แค่ลืมว่าใครติ๊ก) ─────────────────────────────
--   BEGIN;
--   ALTER TABLE public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_system_completed_pair;
--   ALTER TABLE public.project_tasks DROP COLUMN IF EXISTS "systemCompletedAt", DROP COLUMN IF EXISTS "systemCompletedBy";
--   COMMIT;

BEGIN;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS "systemCompletedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "systemCompletedBy" text;

ALTER TABLE public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_system_completed_pair;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_system_completed_pair CHECK (
    ("systemCompletedAt" IS NULL AND "systemCompletedBy" IS NULL)
    OR ("systemCompletedAt" IS NOT NULL AND char_length(btrim("systemCompletedBy")) BETWEEN 1 AND 40)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
