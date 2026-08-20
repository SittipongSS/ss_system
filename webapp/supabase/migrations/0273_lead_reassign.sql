-- ── 0273 · เปลี่ยนผู้รับผิดชอบลีดที่มอบหมายไปแล้ว (มติผู้ใช้ 2026-08-20) ──────
--
-- ⭐ ที่มา: ของเดิม `assign` ทำได้จากสถานะ `screened` เท่านั้น ⇒ ลีดที่มอบหมายไปแล้ว
--   เปลี่ยนมือได้ทางเดียวคือ "ตีกลับ" ซึ่งล้างทีม/ผู้รับ/เวลาติดต่อ/นัดทิ้งทั้งรอบแล้ว
--   เริ่มคัดกรองใหม่ — แรงเกินไปสำหรับเคสจริง (AE ลาออก/ลาป่วย/สลับงานกันในทีม)
--   ตอนนี้ Senior AE ของทีม (+ AC ของทีม + Supervisor/แอดมิน) กด "เปลี่ยนผู้รับผิดชอบ"
--   ได้จาก `assigned` · `contacted` · `meeting` โดยสถานะ**ไม่ถอยกลับ**
--
-- 1) `lead_events.kind` รับ 'reassign' — ไม่เพิ่ม = insert ชน CHECK แล้วประวัติหาย
--    เงียบ ๆ (บทเรียนเดียวกับ 'create_deal' ใน mig 0199 ที่ล้มเงียบอยู่เป็นปี)
--
-- 2) `sales_leads.firstAssignedAt` — **แยกหน้าที่ของ `assignedAt` เหมือนที่ mig 0234
--    แยก `firstScreenedAt` ออกจาก `screenedAt`** ด้วยเหตุผลตัวเดียวกันเป๊ะ:
--      `assignedAt` เป็นทั้ง *จุดจบ* ของด่านกระจาย (screenedAt → assignedAt) และ
--      *จุดเริ่ม* ของด่านติดต่อกลับ (assignedAt → firstContactAt)
--    พอเปลี่ยนผู้รับผิดชอบ ค่าที่ถูกของสองด่านคนละตัว: ด่านกระจายอยากได้ครั้งแรก
--    (Senior AE มอบทันเวลาไปแล้ว ห้ามถูกลบผลงานเพราะมีคนย้ายงานทีหลัง) ส่วนด่าน
--    ติดต่อกลับอยากได้ครั้งล่าสุด (เจ้าของใหม่เริ่มนับตอนใบมาถึงมือเขา)
--      `firstAssignedAt` = มอบครั้งแรกของรอบ → วัด **SLA กระจาย**
--      `assignedAt`      = เจ้าของปัจจุบันรับเมื่อไร → วัด **SLA ติดต่อกลับ**
--    ทั้งคู่ล้างตอนตีกลับ (รอบใหม่เริ่มนับใหม่ทั้งชุด — กติกาเดิมของ 0234)
--
-- ⚠️ เปลี่ยนผู้รับผิดชอบ**หลังติดต่อลูกค้าไปแล้ว** ไม่ขยับ `assignedAt` (โค้ดใน
--    transition/route.js เขียนเมื่อ `firstContactAt` ยังว่างเท่านั้น) ไม่งั้น
--    assignedAt ใหม่ > firstContactAt เก่า ⇒ countBusinessDays ติดลบ แล้ว SLA
--    ติดต่อกลับของใบนั้นกลายเป็น "นับไม่ได้" ทั้งที่ทำทันไปแล้วจริง ๆ
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.lead_events
  DROP CONSTRAINT IF EXISTS lead_events_kind_check;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_kind_check
  CHECK (kind IN (
    'create', 'screen', 'assign', 'reassign', 'contact', 'meeting',
    'qualify', 'create_deal', 'disqualify', 'bounce', 'update'
  ));

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS "firstAssignedAt" timestamptz;

-- ใบเก่า: ยังไม่มีการเปลี่ยนผู้รับผิดชอบเกิดขึ้นได้เลย ⇒ ค่าที่มีคือ "ครั้งแรก" อยู่แล้ว
UPDATE public.sales_leads
   SET "firstAssignedAt" = "assignedAt"
 WHERE "firstAssignedAt" IS NULL
   AND "assignedAt" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- ชุด kind ต้องมี reassign:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.lead_events'::regclass AND conname = 'lead_events_kind_check';
-- backfill ต้องไม่เหลือใบที่มอบแล้วแต่ firstAssignedAt ว่าง (ต้องได้ 0):
--   SELECT count(*) FROM public.sales_leads
--    WHERE "assignedAt" IS NOT NULL AND "firstAssignedAt" IS NULL;
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   DELETE FROM public.lead_events WHERE kind = 'reassign';
--   ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_kind_check;
--   ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_kind_check
--     CHECK (kind IN ('create','screen','assign','contact','meeting',
--                     'qualify','create_deal','disqualify','bounce','update'));
--   ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS "firstAssignedAt";
