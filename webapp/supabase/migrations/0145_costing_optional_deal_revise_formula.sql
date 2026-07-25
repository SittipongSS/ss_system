-- 0145 - ระบบขอราคาผลิต ฉบับ 3 (PR-C): เลิกบังคับดีล + revise rev.2 + สูตร
--
-- 3 เรื่องตามมติ 2026-07-23:
--   1. เลิกบังคับผูกดีล — บางสินค้าที่ขอราคาผลิตก็อาจไม่ได้ไปต่อ (dealId nullable)
--   2. revise = ออกใบใหม่อ้างใบเดิม (rev.2) — baseRequestId + revisionNo
--   3. RM ผูกสูตร — snapshot ชื่อ/รหัส/วันที่สูตร (มีบน products แล้ว mig 0112)
--      ลงรายการ เพื่อเตือนเมื่อสูตรบนสินค้าเปลี่ยนทีหลัง
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ── 1) เลิกบังคับดีล ──
ALTER TABLE public.costing_requests ALTER COLUMN "dealId" DROP NOT NULL;

-- ── 2) สาย revise (ออกใบใหม่อ้างใบเดิม) ──
ALTER TABLE public.costing_requests
  ADD COLUMN IF NOT EXISTS "baseRequestId" text,   -- ใบต้นฉบับ (rev.1) — null = เป็นใบต้นเอง
  ADD COLUMN IF NOT EXISTS "revisionNo"    integer NOT NULL DEFAULT 1 CHECK ("revisionNo" >= 1);

CREATE INDEX IF NOT EXISTS costing_requests_base_idx
  ON public.costing_requests ("baseRequestId");

-- ── 3) snapshot สูตรบนรายการสินค้า ──
ALTER TABLE public.costing_request_items
  ADD COLUMN IF NOT EXISTS "formulaName" text,
  ADD COLUMN IF NOT EXISTS "formulaCode" text,
  ADD COLUMN IF NOT EXISTS "formulaDate" date;

-- guard เดิม (0141) เช็ค dealId immutable ผ่าน IS DISTINCT FROM ซึ่งครอบ null อยู่แล้ว
-- (null → null ไม่ trip). ไม่ต้องแก้ guard. revise สร้างใบใหม่ (คนละ id) จึงไม่ชน
-- กติกา identity immutable ของใบเดิม

-- Rollback guidance:
-- 1) dealId: ใบที่สร้างแบบไม่มีดีลจะค้างถ้าใส่ NOT NULL กลับ — ต้องเคลียร์ก่อน
-- 2) revise/formula columns ถอนด้วย DROP COLUMN ได้ (ข้อมูล snapshot หายเท่านั้น)

NOTIFY pgrst, 'reload schema';
