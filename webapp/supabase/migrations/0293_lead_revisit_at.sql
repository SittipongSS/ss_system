-- ── 0293 · วันกลับมาถามใหม่ของลีดที่ปิดว่า "ยังไม่พร้อม" (มติผู้ใช้ 2026-08-26) ──
--
-- ⭐ ที่มา: รหัส `timing` ("ยังไม่พร้อม ไว้ทีหลัง") **ไม่ใช่แพ้ถาวร** — ลูกค้าสนใจ
--   แต่ยังไม่ถึงเวลา · ปิดลีดแล้วไม่เก็บวันกลับมาถาม = ดีลที่แค่เลื่อนเวลาหายไปเท่ากับ
--   ดีลที่แพ้จริง แล้วไม่มีใครกลับไปถามอีกเลย
--   (mig 0290 นับ `timing` เข้าตัวส่วนของอัตราแปลงตามเดิม — เสียไปในงวดนี้จริง
--   แต่รายงานแยกให้เห็นได้ว่าเป็นกองที่กลับมาได้)
--
-- ⚠️ **ไม่บังคับกรอก** — บางเคสลูกค้าบอกแค่ "ไว้ก่อน" โดยไม่มีกำหนด · บังคับแล้วคนจะ
--    กรอกวันมั่วเพื่อให้ผ่านด่าน ซึ่งเป็นข้อมูลที่แย่กว่าเว้นว่าง
--
-- ⚠️ **ไม่ backfill** — ใบที่ปิดไปแล้วไม่มีใครเคยถูกถามคำถามนี้
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS "revisitAt" timestamptz;

-- รายงาน "ใบที่ถึงเวลากลับไปถามแล้ว" กวาดเฉพาะใบที่มีวันจริง
CREATE INDEX IF NOT EXISTS sales_leads_revisit_idx
  ON public.sales_leads ("revisitAt")
  WHERE "revisitAt" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- คอลัมน์ต้องมี และยังว่างทั้งหมด (ไม่ backfill — ต้องได้ 0):
--   SELECT count(*) FROM public.sales_leads WHERE "revisitAt" IS NOT NULL;
-- หลังใช้งานจริง ใบที่ถึงเวลากลับไปถาม:
--   SELECT id, "contactName", "revisitAt" FROM public.sales_leads
--    WHERE "disqualifiedCode" = 'timing' AND "revisitAt" <= now() ORDER BY "revisitAt";
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.sales_leads_revisit_idx;
--   ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS "revisitAt";
