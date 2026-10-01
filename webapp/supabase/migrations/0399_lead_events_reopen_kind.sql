-- ── 0399 · ลูกค้ากลับมา — ดึงลีดที่ปิด "ไม่ไปต่อ" กลับมาทำต่อ (มติผู้ใช้ 2026-10-01) ──
--
-- ⭐ ที่มา: ใบที่ปิด "ไม่ไปต่อ" เป็นทางตัน (`LEAD_TRANSITIONS.disqualified` ว่าง) ทางเดียวที่
--   กลับได้คือผูกดีลย้อนหลัง (mig 0371) ซึ่งใช้ได้เฉพาะตอนลูกค้าพร้อมเปิดดีลแล้ว
--   prod 01/10: ใบปิด 181 ใบ — "ติดต่อไม่ได้/เงียบ" 60 · "ยังไม่พร้อม ไว้ทีหลัง" 31
--   = 91 ใบที่ลูกค้ากลับมาได้จริง แต่กลับมาแล้วต้องสร้างลีดใบใหม่ (ประวัติขาด · ยอดลีดนับซ้ำ)
--   ⇒ action ใหม่ `reopen`: เจ้าของลีด + ผู้มีอำนาจเหนือกว่า ดึงใบกลับไปสถานะก่อนปิด
--   (กติกาอยู่ที่ lib/sales/leads.js — leadReopenStatus / canReopenLead)
--
-- `lead_events.kind` รับค่าใหม่ 'reopen'
--    ⚠️ ไม่เพิ่ม = insert ชน CHECK ⇒ ลีดกลับมาเดินแล้วแต่ประวัติไม่มีบรรทัดว่าใครดึงกลับ เพราะอะไร
--    🪤 ต้องรัน **ก่อน** deploy โค้ดชุดนี้ — บทเรียน mig 0199 (create_deal หายเงียบหลายวัน)
--
-- ⚠️ **ไม่มีคอลัมน์ใหม่ ไม่ backfill** — สถานะปลายทางอ่านจากแถว (การปิดไม่ล้างคอลัมน์ไหน)
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.lead_events'::regclass AND conname = 'lead_events_kind_check';
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.lead_events
  DROP CONSTRAINT IF EXISTS lead_events_kind_check;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_kind_check
  CHECK (kind IN (
    'create', 'screen', 'assign', 'reassign', 'contact', 'followup', 'meeting',
    'qualify', 'create_deal', 'link_deal', 'unlink_deal', 'disqualify', 'reopen',
    'bounce', 'auto_bounce', 'update'
  ));

COMMIT;

-- ── Rollback ───────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อน (ไม่งั้นการดึงกลับครั้งถัดไปชน CHECK) แล้วค่อยย้อน schema
--   DELETE FROM public.lead_events WHERE kind = 'reopen';
--   ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_kind_check;
--   ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_kind_check
--     CHECK (kind IN ('create','screen','assign','reassign','contact','followup','meeting',
--                     'qualify','create_deal','link_deal','unlink_deal','disqualify','bounce',
--                     'auto_bounce','update'));
--   ⚠️ ลีดที่ดึงกลับไปแล้วไม่ย้อน — สถานะบนแถวคงตามที่ทำไว้
