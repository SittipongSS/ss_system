-- ── 0371 · ผูก/ถอดดีลกับลีดต้นทางย้อนหลัง (มติผู้ใช้ 2026-09-22) ──
--
-- ⭐ ที่มา: SA ลืมกด "เปิดดีลจากลีดนี้" แล้วไปเปิดดีลตรงจากหน้าดีล ⇒ ลีดค้างสถานะ
--   ติดต่อแล้ว/นัดแล้ว (ระบบยังทวงและตีกลับต่อ) และ KPI นับลีดใบนั้นว่าไม่แปลง
--   (prod 22/09: ~11 ลีด 20+ ดีลเปิดนอกเส้นลีด เทียบกับ 22 ลีดที่เปิดถูกทาง)
--   ⇒ หน้าดีล/หน้าลีด/ฟอร์มเพิ่มดีล ผูกย้อนหลังได้ · ถอดได้ · ลบดีลย้อนสถานะลีด
--   (กติกาอยู่ที่ lib/sales/dealLeadLink.js · ฝั่งฐานอยู่ที่ lib/sales/dealLeadLinkRepo.js)
--
-- 1) `lead_events.kind` รับสองค่าใหม่
--    · 'link_deal'   = ผูกดีลที่มีอยู่เข้ากับลีด (ย้อนหลัง) — **แยกจาก 'create_deal'** เพราะเวลา
--      ที่บันทึกคือเวลาผูก ไม่ใช่เวลาเปิดดีลจริง · ประวัติบนหน้าลีดต้องไม่เล่าว่า "สร้างดีลจากลีดนี้"
--      ในวันที่ไม่ได้สร้าง
--    · 'unlink_deal' = ดีลหลุดจากลีด (ถอด หรือ ลบดีล) — ลีดที่ไม่เหลือดีลกลับไปสถานะก่อนเปิดดีล
--      ⇒ ตอนถอดต้องหา "สถานะก่อนหน้า" จาก `fromStatus` ของเหตุการณ์ create_deal/link_deal ล่าสุด
--    ⚠️ ไม่เพิ่ม = insert ชน CHECK แล้วประวัติหาย (โค้ดอ่าน error แล้วขึ้นเป็นคำเตือน ไม่เงียบ
--       แต่การถอดครั้งถัดไปจะหาสถานะก่อนหน้าไม่เจอ แล้วถอยไปเดาจากแถว)
--    🪤 ต้องรัน **ก่อน** deploy โค้ดชุดนี้ — บทเรียน mig 0199 (create_deal หายเงียบหลายวัน)
--
-- ⚠️ **ไม่มีคอลัมน์ใหม่** — `lead_events` ไม่มี dealId · ดีลของเหตุการณ์เล่าผ่าน `reason`
--    (รหัส · ชื่อดีล) ท่าเดียวกับเหตุการณ์อื่นของลีด · ความจริงว่าลีดใบนี้มีดีลไหนอยู่ที่
--    `sales_deals.leadId` (mig 0093) ที่เดียว
-- ⚠️ **ไม่ backfill** — ดีลที่ SA ลืมผูก ต้องให้คนผูกจากหน้าจอ (เดาคู่จากชื่อ/เบอร์ผิดได้ ·
--    ประวัติที่แต่งเวลาขึ้นเองผิดกติกา docs/archive/lead-deal-flow-audit.md)
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
    'qualify', 'create_deal', 'link_deal', 'unlink_deal', 'disqualify', 'bounce',
    'auto_bounce', 'update'
  ));

COMMIT;

-- ── Rollback ───────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อน (ไม่งั้นการผูก/ถอดครั้งถัดไปชน CHECK) แล้วค่อยย้อน schema
--   DELETE FROM public.lead_events WHERE kind IN ('link_deal', 'unlink_deal');
--   ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_kind_check;
--   ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_kind_check
--     CHECK (kind IN ('create','screen','assign','reassign','contact','followup','meeting',
--                     'qualify','create_deal','disqualify','bounce','auto_bounce','update'));
--   ⚠️ ดีลที่ผูก/ถอดไปแล้วไม่ย้อน — คอลัมน์ sales_deals.leadId กับสถานะลีดคงตามที่ทำไว้
