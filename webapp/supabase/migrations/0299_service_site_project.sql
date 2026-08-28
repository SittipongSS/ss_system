-- ============================================================
--  Migration 0299: service_sites."projectId" — ไซต์คือ deliverable ของโครงการสายบริการ
--
--  มติ docs/business-line-vs-project-seam.md (#868 · ก้อน F):
--    · โครงการสายบริการ "คลอด" ไซต์ แล้วปิดตัวเองเมื่อรอบเดินได้เอง
--    · nullable + **ไม่มี FK** — แพตเทิร์นเดียวกับ production_jobs."projectId":
--      โครงการถูกลบ/รวมได้ แต่ไซต์ที่ติดตั้งไปแล้วต้องอยู่ต่อ
--    · 🔴 ลิงก์โครงการมีได้ที่ service_sites **ที่เดียว** — service_visits /
--      service_plans / service_visit_items เป็นรอบที่เกิดซ้ำตลอดกาล ห้ามมี
--      projectId เด็ดขาด (เทสต์ยาม lib/service/serviceSchemaGuards.test.mjs คุมไว้)
--
--  additive ล้วน รันก่อน deploy ได้
-- ============================================================

ALTER TABLE public.service_sites
  ADD COLUMN IF NOT EXISTS "projectId" text;

CREATE INDEX IF NOT EXISTS service_sites_project_idx
  ON public.service_sites ("projectId") WHERE "projectId" IS NOT NULL;

COMMENT ON COLUMN public.service_sites."projectId" IS
  'โครงการสายบริการที่คลอดไซต์นี้ (ไม่มี FK โดยเจตนา — โครงการลบ/รวมได้ ไซต์ต้องอยู่) · ลิงก์โครงการมีที่นี่ที่เดียว ห้ามลามไป visits/plans/items';

NOTIFY pgrst, 'reload schema';
