-- ============================================================
--  Migration 0183: เก็บกวาดงานที่ผูกดีลที่ถูกลบไปแล้ว + ปิดช่องไม่ให้เกิดซ้ำ
--
--  อาการที่ผู้ใช้เจอ (2026-07-30): "โครงการที่ลบดีลออกแล้ว ไทม์ไลน์ยังคงค้างอยู่"
--
--  ต้นเหตุ: DELETE /api/sales-planning/deals/[id] เรียก cleanupDealOrphans()
--  ใต้ `if (force)` เท่านั้น → ลบดีล**ตามปกติ** (ไม่ใช่ break-glass ของแอดมิน)
--  ไม่เคยกวาด personal_tasks.dealId ซึ่งเป็น logical link ไม่มี FK (mig 0085)
--  งานจึงค้างอยู่ในเมนูงานโดยชี้ดีลที่ไม่มีอยู่แล้ว — เปิดจากดีลไม่ได้ ลบตามไม่ได้
--
--  ⭐ ตรวจ prod 2026-07-30: personal_tasks ที่มี dealId ทั้งหมด 6 แถว
--     → กำพร้า 5 แถว (KARUNA 3 · Zeekr 1 · คุณเนย INNER 1 — สถานะ Completed ทุกใบ)
--     เธรดความเคลื่อนไหว (entity_updates) ของ 5 แถวนี้ = 0 แต่ยังกวาดเผื่อไว้
--     project_tasks / dept_requests / quotations / sales_orders กำพร้า = 0 (ปกติดี)
--
--  โค้ดฝั่งแอปแก้แล้วในคอมมิตเดียวกัน (กวาดทุกครั้งไม่ใช่เฉพาะ force) — ไฟล์นี้
--  จัดการ (1) ของที่ค้างอยู่แล้ว (2) FK ที่ทำให้เกิดซ้ำไม่ได้อีกในระดับฐานข้อมูล
--
--  ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้
-- ============================================================

BEGIN;

-- ── 1. กวาดเธรดของงานกำพร้าก่อน (entity_updates เป็น polymorphic ไม่มี FK) ──
-- ต้องทำก่อนลบตัวงาน ไม่งั้นเธรดจะกลายเป็นกำพร้าซ้อนกำพร้า หาไม่เจออีกเลย
DELETE FROM public.entity_updates u
WHERE u."entityType" = 'personal_task'
  AND EXISTS (
    SELECT 1 FROM public.personal_tasks t
    WHERE t.id = u."entityId"
      AND t."dealId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sales_deals d WHERE d.id = t."dealId")
  );

-- ── 2. ลบงานที่ชี้ดีลที่ไม่มีอยู่แล้ว ────────────────────────────────────────
-- ลบ ไม่ใช่ปลดลิงก์: งานพวกนี้ตั้งชื่อตามดีล (เช่น "KARUNA_ทำสัญญาผลิต") ปลด
-- dealId ทิ้งไว้เฉย ๆ ก็ยังค้างในเมนูงานแบบไร้ที่มา — ตรงกับที่เส้นทาง force
-- ทำมาตลอด (cleanupDealOrphans ลบ ไม่ใช่ปลด) จึงยึดพฤติกรรมเดียวกัน
DELETE FROM public.personal_tasks t
WHERE t."dealId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sales_deals d WHERE d.id = t."dealId");

-- ── 3. FK ให้ฐานข้อมูลบังคับเอง ─────────────────────────────────────────────
-- แอปกวาดให้แล้วก็จริง แต่ logical link ที่ไม่มี FK คือรากของบั๊กนี้ตั้งแต่ต้น:
-- ลืมเรียก cleanup ที่เส้นทางใดเส้นทางหนึ่ง = แถวกำพร้าเกิดเงียบ ๆ อีกรอบ
-- CASCADE (ไม่ใช่ SET NULL) เพราะงานที่ผูกดีลคืองานของดีล ไม่ใช่งานที่บังเอิญอ้างถึง
ALTER TABLE public.personal_tasks
  DROP CONSTRAINT IF EXISTS personal_tasks_deal_fk;
ALTER TABLE public.personal_tasks
  ADD CONSTRAINT personal_tasks_deal_fk
  FOREIGN KEY ("dealId") REFERENCES public.sales_deals(id) ON DELETE CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- ต้องได้ 0 ทั้งคู่:
--   SELECT count(*) FROM personal_tasks t
--   WHERE t."dealId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM sales_deals d WHERE d.id = t."dealId");
--
--   SELECT count(*) FROM entity_updates u
--   WHERE u."entityType" = 'personal_task'
--     AND NOT EXISTS (SELECT 1 FROM personal_tasks t WHERE t.id = u."entityId");
--
-- FK ต้องมีจริง (ต้องได้ 1 แถว):
--   SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid = 'public.personal_tasks'::regclass AND conname = 'personal_tasks_deal_fk';
--   -- confdeltype ต้องเป็น 'c' (cascade)
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- ALTER TABLE public.personal_tasks DROP CONSTRAINT IF EXISTS personal_tasks_deal_fk;
-- (งานที่ถูกลบในขั้น 1-2 กู้ไม่ได้ — เป็นแถวที่ชี้ดีลที่ไม่มีอยู่แล้ว ไม่มีทางเข้าถึง
--  จากหน้าจอไหนอยู่แล้วตั้งแต่ก่อนรัน)
