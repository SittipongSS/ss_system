-- ============================================================
--  Migration 0275: sales_deals.line — สายธุรกิจของดีล PRODUCT | SERVICE
--
--  ⭐ มติผู้ใช้ 2026-08-20: **สายมีผลต่อขั้นตอนไทม์ไลน์** ⇒ ดีลต้องถือสายของตัวเอง
--  ของเดิม (มติ 2026-08-02 · docs/business-line-level-and-handoff.md) วางแกนสายไว้
--  ที่โครงการอย่างเดียว โดยตั้งอยู่บนสมมติฐานว่า "แม่แบบถูกเลือกตอนผูกโครงการ"
--  ซึ่ง **ไม่จริงตั้งแต่ 2026-08-08**: ไทม์ไลน์ถูก gen พร้อมดีลตั้งแต่วันสร้าง
--  (DL1 — task ลอยที่ projectId ว่าง) ซึ่งเกิดก่อนโครงการ ⇒ ตอนเลือกแม่แบบยังไม่มี
--  โครงการให้ถามว่าสายอะไร และทุกดีลจึงได้แม่แบบสายสินค้าเงียบ ๆ มาตลอด
--
--  ⚠️ **ห้ามมี DEFAULT — โดยเจตนา** (บทเรียนเดียวกับ 0191/0008: `projects.type`
--  default 'NPD' แล้วโครงการทุกใบบน prod เป็น NPD หมดเพราะไม่มีใครถูกบังคับเลือก)
--  ⇒ คอลัมน์นี้ nullable ที่ชั้น DB · ตัวบังคับอยู่ที่ฟอร์มและ POST /api/sales-planning/deals
--  (ดีลใหม่ทุกใบต้องเลือก) ส่วนของเก่าเป็น NULL ได้ และจะถูกเติมตอนผูกโครงการ
--
--  ── backfill: ดีลที่ผูกโครงการอยู่แล้ว = สายของโครงการนั้น (มติผู้ใช้ 2026-08-20)
--  นี่ไม่ใช่การเดา — โครงการเป็นเจ้าของสายมาตั้งแต่ 0191 และ 0194 บังคับ NOT NULL
--  แล้ว ⇒ ดีลที่อยู่ในโครงการมีคำตอบที่ถูกต้องอยู่แล้ว · ดีลที่ยังไม่มีโครงการ
--  ปล่อย NULL ไว้ ให้ AE เลือกเองตอนแก้ดีล (ห้ามเดาจาก team — ทีมขาย ≠ สายธุรกิจ
--  มติ #868: prod มี SDS_…EGCO_HAND GEL อยู่ใต้ทีม SV ทั้งที่เป็นสายสินค้า)
--
--  ⚠ รันมือบน Supabase SQL Editor · additive ล้วน · รันซ้ำได้ (idempotent)
--  🛑 **ต้องรันก่อน deploy** — โค้ดใหม่อ่าน/เขียนคอลัมน์นี้ทุกครั้งที่สร้างดีล
-- ============================================================

BEGIN;

ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS line text;

-- CHECK แยกจาก ADD COLUMN เพื่อให้รันซ้ำได้ (ADD CONSTRAINT ไม่มี IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sales_deals'::regclass
      AND conname = 'sales_deals_line_check'
  ) THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_line_check
      CHECK (line IS NULL OR line IN ('PRODUCT', 'SERVICE'));
  END IF;
END $$;

-- backfill จากโครงการที่ผูกอยู่ (ดูหัวไฟล์) — เขียนเฉพาะแถวที่ยังว่าง
UPDATE public.sales_deals AS d
   SET line = p.line
  FROM public.projects AS p
 WHERE d."projectId" = p.id
   AND d.line IS NULL
   AND p.line IS NOT NULL;

COMMENT ON COLUMN public.sales_deals.line IS
  'สายธุรกิจของดีล: PRODUCT = ส่งมอบของแล้วจบ · SERVICE = มีงานดูแลต่อเนื่องหน้างาน. '
  'ครึ่งหนึ่งของกุญแจแม่แบบไทม์ไลน์ (สาย, ประเภทดีล) — NULL = ดีลเก่าก่อน mig 0275 ที่ยังไม่มีโครงการ. '
  'ห้ามใส่ default (ดูหัว mig 0191/0275)';

-- ไล่ดีลตามสาย (หน้ารวมดีล + ตัวนับ "ยังไม่ระบุสาย")
CREATE INDEX IF NOT EXISTS sales_deals_line_idx ON public.sales_deals (line);

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
