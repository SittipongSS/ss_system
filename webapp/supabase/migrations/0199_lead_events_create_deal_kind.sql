-- ============================================================
--  Migration 0199: lead_events รับ kind = 'create_deal'
--
--  อาการ (ตรวจ flow LD → DL 2026-08-04): เปิดดีลจากลีดแล้ว **ไม่มีเหตุการณ์
--  "สร้างดีล" โผล่ในประวัติของลีดเลย** และลีดใบเดียวที่แตกดีลใบที่ 2, 3 …
--  ไม่ทิ้งร่องรอยอะไรไว้เลย (ใบแรกยังพอเห็นเพราะสถานะเปลี่ยนเป็น qualified)
--
--  ต้นเหตุ: CHECK ของ lead_events.kind ตั้งไว้ตั้งแต่ mig 0091 เป็นชุด
--    ('create','screen','assign','contact','meeting','qualify','disqualify','bounce','update')
--  ซึ่ง **ไม่มี 'create_deal'** — แต่ POST /api/sales-planning/deals เขียน
--  kind = 'create_deal' (transition route ปิด create_deal ของตัวเองไปแล้ว
--  ทางนี้จึงเป็นทางเดียวที่ปิดลีด) ⇒ insert ชน CHECK ทุกครั้ง และโค้ดไม่ได้
--  เช็ค error ของ insert นั้น (fire-and-forget) ⇒ **ล้มเหลวเงียบมาตลอด**
--
--  เจตนาที่เขียนไว้ในโค้ดคือ "บันทึกทุกครั้ง แม้ลีด qualified อยู่แล้ว เพื่อให้
--  conversion นับครบ" — เจตนานั้นไม่เคยทำงานจริงเลยจนกว่าจะรันไฟล์นี้
--
--  ไม่ backfill: เหตุการณ์ที่หายไปไม่มีเวลา/ผู้ทำที่เชื่อถือได้เหลืออยู่ใน
--  lead_events (ดีลมี createdAt ของตัวเอง แต่การเดาเวลาย้อนหลังลงตาราง
--  audit/KPI คือการสร้างหลักฐานปลอม) — ประวัติเริ่มนับครบตั้งแต่วันที่รัน
--
--  'qualify' ยังคงไว้ในชุด: เป็นค่าของเส้นทางเก่า อาจมีแถวจริงค้างอยู่
--
--  ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้
-- ============================================================

BEGIN;

ALTER TABLE public.lead_events
  DROP CONSTRAINT IF EXISTS lead_events_kind_check;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_kind_check
  CHECK (kind IN (
    'create', 'screen', 'assign', 'contact', 'meeting',
    'qualify', 'create_deal', 'disqualify', 'bounce', 'update'
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- ชุดค่าที่ยอมรับต้องมี create_deal (ต้องเห็นในผลลัพธ์):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.lead_events'::regclass AND conname = 'lead_events_kind_check';
--
-- หลังรันแล้วลองเปิดดีลจากลีด 1 ใบ แล้วต้องได้ 1 แถว:
--   SELECT * FROM lead_events WHERE kind = 'create_deal' ORDER BY "createdAt" DESC LIMIT 5;
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- ต้องลบแถว create_deal ก่อน ไม่งั้น CHECK ชุดเดิม add ไม่ผ่าน:
--   DELETE FROM public.lead_events WHERE kind = 'create_deal';
--   ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_kind_check;
--   ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_kind_check
--     CHECK (kind IN ('create','screen','assign','contact','meeting',
--                     'qualify','disqualify','bounce','update'));
