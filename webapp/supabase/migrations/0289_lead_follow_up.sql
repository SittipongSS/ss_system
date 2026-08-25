-- ── 0289 · วันติดตามต่อของลีด (มติผู้ใช้ 2026-08-25) ────────────────────────
--
-- ⭐ ที่มา: `contacted` เป็นสถานะเดียวในเส้นทางลีดที่ **ไม่มีนาฬิกาเลย**
--   SLA มีสามด่าน (คัดกรอง · กระจาย · ติดต่อกลับ) ซึ่งจบลงตอน `firstContactAt`
--   หลังจากนั้นลีดนอนอยู่ใน `contacted` ได้ตลอดกาลโดยไม่มีอะไรทวง — ตรวจข้อมูลจริง
--   2026-08-08 พบลีด 14 ใบค้างข้ามเดือน ใบที่นานสุด 10 วันทำการ
--
--   `followUpAt` = **วันที่ AE รับปากลูกค้าไว้ว่าจะกลับไปหา** ไม่ใช่ SLA ที่ระบบตั้งให้
--   จึงเป็นกำหนดจริง (`basis: 'deadline'` ในคิวของฉัน) ต่างจากของค้างที่นับจาก
--   "วันที่เริ่มค้าง" — ดูคอมเมนต์ `row()` ใน lib/salesPlanning/myQueue.js
--
-- 1) `lead_events.kind` รับ 'followup' — ไม่เพิ่ม = insert ชน CHECK แล้ว **ประวัติหาย
--    เงียบ ๆ** เพราะ transition/route.js ไม่ได้อ่าน error ของ insert
--    (บทเรียนเดียวกับ 'create_deal' ใน mig 0199 ที่ล้มเงียบอยู่เป็นปี และ 'reassign'
--    ใน mig 0273) · `followup` = การติดต่อครั้งที่สองขึ้นไป **ไม่ขยับสถานะ**
--    (TRANSITION_TO_STATUS.followup === null — ท่าเดียวกับ reassign)
--    🪤 ของเดิมบันทึกการติดต่อซ้ำไม่ได้เลย: `LEAD_TRANSITIONS.contacted` ไม่มี
--    'contact' ⇒ AE ที่โทรตามรอบสองกดปุ่มไม่ได้ ต้องไปเขียนในเธรดกลางแทน
--    ซึ่งไม่มีวันที่ให้ระบบทวงต่อ
--
-- 2) `sales_leads.followUpAt` — ช่องเดียว เก็บ **นัดติดตามครั้งถัดไป** เท่านั้น
--    ประวัติการติดตามทุกครั้งอยู่ที่ `lead_events` ครบอยู่แล้ว (kind = contact/followup)
--    ⚠️ ล้างตอน `bounce` เหมือน `meetingAt`/`firstContactAt` — ไม่ล้างแล้ววันติดตาม
--    ของเจ้าของคนเก่าจะฟื้นขึ้นมาบนลีดของเจ้าของคนใหม่ (บั๊กพี่น้องกับที่ mig 0234
--    แก้ให้ screenedAt/assignedAt ไปแล้ว)
--    ⚠️ ล้างตอน `meeting` ด้วย — วันประชุมที่นัดไว้แทนที่คำสัญญา "จะโทรกลับ" ไปแล้ว
--    ปล่อยไว้ทั้งคู่ = ลีดใบเดียวโผล่สองแถวในคิวของฉันด้วยกำหนดคนละวัน
--
-- ⚠️ **ไม่ backfill** — ใบที่ค้างอยู่ตอนนี้ไม่มีใครเคยรับปากวันไหนไว้กับลูกค้า
--    เดาวันให้แล้วระบบจะเริ่มทวง (และตีกลับ ถ้าเปิดใช้ทีหลัง) ด้วยกำหนดที่ไม่มีใคร
--    เคยตกลง · ใบเก่าจึงยังไม่มีวันติดตามจนกว่า AE จะกดบันทึกการติดต่อครั้งถัดไป
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.lead_events
  DROP CONSTRAINT IF EXISTS lead_events_kind_check;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_kind_check
  CHECK (kind IN (
    'create', 'screen', 'assign', 'reassign', 'contact', 'followup', 'meeting',
    'qualify', 'create_deal', 'disqualify', 'bounce', 'update'
  ));

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS "followUpAt" timestamptz;

-- คิวของฉันกับ cron ทวงประจำวันถามคำถามเดียวกัน: "ใบไหนเลยวันติดตามแล้วบ้าง"
-- ⚠️ partial index — ใบที่ไม่มีวันติดตาม (ทุกใบก่อน migration นี้) ไม่ต้องอยู่ในดัชนี
CREATE INDEX IF NOT EXISTS sales_leads_follow_up_idx
  ON public.sales_leads ("followUpAt")
  WHERE "followUpAt" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- ชุด kind ต้องมี followup:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.lead_events'::regclass AND conname = 'lead_events_kind_check';
-- คอลัมน์ต้องมีและยังว่างทั้งหมด (ไม่ backfill — ต้องได้ 0):
--   SELECT count(*) FROM public.sales_leads WHERE "followUpAt" IS NOT NULL;
-- หลังใช้งานจริงไปแล้ว ใบที่เลยกำหนดดูได้จาก:
--   SELECT id, "contactName", "assigneeName", "followUpAt" FROM public.sales_leads
--    WHERE status = 'contacted' AND "followUpAt" < now() ORDER BY "followUpAt";
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.sales_leads_follow_up_idx;
--   ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS "followUpAt";
--   DELETE FROM public.lead_events WHERE kind = 'followup';
--   ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_kind_check;
--   ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_kind_check
--     CHECK (kind IN ('create','screen','assign','reassign','contact','meeting',
--                     'qualify','create_deal','disqualify','bounce','update'));
