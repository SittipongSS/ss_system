-- ── 0290 · รหัสเหตุผลที่ลีดไม่ไปต่อ (มติผู้ใช้ 2026-08-25) ───────────────────
--
-- ⭐ ที่มา: `disqualifiedReason` เป็นข้อความอิสระ และ **ไม่มีจอไหนอ่านมันเลย**
--   (ตรวจ 2026-08-25: เขียนที่ transition/route.js ที่เดียว · grep ทั้ง src ไม่เจอ
--   ผู้อ่าน) ⇒ เหตุผลที่ฝ่ายขายพิมพ์ทุกใบตลอดปีเป็นข้อมูลที่เขียนแล้วทิ้ง
--   ส่วน KPI มีแค่ % รวม ("ไม่ไปต่อ 32 จาก 113 ใบ") ตอบไม่ได้ว่า **แพ้เพราะอะไร**
--
--   ⚠️ ข้อความอิสระนับไม่ได้ — "งบไม่ถึง" / "งบไม่พอ" / "ลูกค้าบอกแพง" คือเรื่องเดียวกัน
--   แต่ group by ไม่ได้ · จึงต้องเป็น **รหัส** คู่กับข้อความ ไม่ใช่แทนที่ข้อความ
--
-- 1) `disqualifiedCode` — รหัสเหตุผล 8 ค่า (ชุดเดียวกับ `LEAD_LOST_REASONS`
--    ใน lib/sales/leads.js · เพิ่มค่าใหม่ต้องแก้ทั้งสองที่ ไม่งั้นบันทึกไม่ได้ทั้งที่
--    ฟอร์มโชว์ตัวเลือกให้เลือกแล้ว — โรคเดียวกับ CHECK ของ `channel` ที่ mig 0129/0252)
--
--    'duplicate' กับ 'invalid' **ไม่ใช่ "แพ้"** — ลีดซ้ำและข้อมูลติดต่อผิดไม่เคยเป็น
--    โอกาสขาย นับเข้าตัวส่วนของอัตราแปลงเมื่อไร ตัวเลขจะต่ำลงตามปริมาณสแปมที่เข้ามา
--    ซึ่งไม่ใช่ผลงานของใครเลย · กติกา "ใบไหนอยู่ในตัวส่วน" อยู่ที่ `LEAD_LOST_REASONS`
--    ฝั่งโค้ด ไม่ได้บังคับที่ DB (รายงานเปลี่ยนนิยามได้โดยไม่ต้อง migrate)
--
-- ⚠️ **ไม่ backfill** — ใบเก่ามีแต่ข้อความอิสระ เดารหัสจากคำพูดคือการสร้างข้อมูลที่
--    ไม่มีใครเคยกรอก แล้วรายงานจะดูเหมือนมีข้อมูลย้อนหลังครบทั้งที่เดาเอาทั้งนั้น
--    ⇒ ใบเก่าคืน NULL · ฝั่งโค้ดนับเป็น "ไม่ระบุ" และยังอยู่ในตัวส่วนตามเดิม
--    รายงานจะสมบูรณ์เองเมื่อใบใหม่สะสมพอ
--
-- ⚠️ **ไม่บังคับ NOT NULL** ด้วยเหตุผลเดียวกัน — ใบเก่าทั้งหมดจะละเมิดทันที
--    ด่านบังคับกรอกอยู่ที่ API + ฟอร์ม (`leadLostReasonError`) ซึ่งมีผลกับใบใหม่เท่านั้น
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS "disqualifiedCode" text;

ALTER TABLE public.sales_leads
  DROP CONSTRAINT IF EXISTS sales_leads_disqualified_code_check;

ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_disqualified_code_check
  CHECK ("disqualifiedCode" IS NULL OR "disqualifiedCode" IN (
    'no_response', 'budget', 'not_target', 'timing',
    'competitor', 'duplicate', 'invalid', 'other'
  ));

-- รายงาน "แพ้เพราะอะไร" กวาดเฉพาะใบที่ปิดแล้วและมีรหัส
CREATE INDEX IF NOT EXISTS sales_leads_disqualified_code_idx
  ON public.sales_leads ("disqualifiedCode", "closedAt" DESC)
  WHERE "disqualifiedCode" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- CHECK ต้องมีครบ 8 ค่า:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.sales_leads'::regclass
--      AND conname = 'sales_leads_disqualified_code_check';
-- ไม่ backfill — ใบเก่าต้องยังว่างทั้งหมด (ต้องได้ 0):
--   SELECT count(*) FROM public.sales_leads WHERE "disqualifiedCode" IS NOT NULL;
-- หลังใช้งานจริงไปแล้ว ดูสัดส่วนเหตุผลได้จาก:
--   SELECT "disqualifiedCode", count(*) FROM public.sales_leads
--    WHERE status = 'disqualified' GROUP BY 1 ORDER BY 2 DESC;
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.sales_leads_disqualified_code_idx;
--   ALTER TABLE public.sales_leads
--     DROP CONSTRAINT IF EXISTS sales_leads_disqualified_code_check;
--   ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS "disqualifiedCode";
