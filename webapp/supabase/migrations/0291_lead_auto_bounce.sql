-- ── 0291 · ตีกลับอัตโนมัติเมื่อลีดไม่มีความเคลื่อนไหว (มติผู้ใช้ 2026-08-25) ──
--
-- ⭐ ที่มา: ต่อจาก mig 0288 (วันติดตามต่อ) — เตือนแล้วยังเงียบต่อ ต้องมีขาที่สอง
--   ที่ดึงลีดออกจากมือคนที่ปล่อยทิ้ง ไม่งั้นคิวจะบวมค้างตลอดกาล
--   (ขาที่สองแบบเดียวกับ `close-resolved-issues` ของระบบแจ้งปัญหา · mig 0223)
--
-- 🔴 **ตีกลับ ไม่ใช่ปิดลีด** — เจตนาต่างกันคนละเรื่อง:
--   `disqualified` เป็นปลายทางที่ไม่มีทางกลับ (`LEAD_TRANSITIONS.disqualified` ว่าง)
--   และจะไปโผล่ในรายงาน "แพ้เพราะอะไร" ทั้งที่ลูกค้าไม่ได้ปฏิเสธอะไรเลย
--   ส่วน `bounce` พาลีดกลับคิวคัดกรอง — ย้อนได้ ส่งต่อคนอื่นได้ ประวัติไม่หาย
--   และ **ยังนับเป็นโอกาสขายอยู่** · ปิดอัตโนมัติเมื่อไรจะได้ระบบที่ลบหลักฐาน
--   คนดองงานให้ตัวเอง (ลีดหลุดจากคิว ⇒ ตัวเลข "ค้าง" ลดลง ⇒ คนที่ปล่อยทิ้งดูดีขึ้น)
--
-- 1) `lead_events.kind` รับ 'auto_bounce' — แยกจาก 'bounce' ที่คนกด เพราะสองอย่างนี้
--    ต้องนับแยกได้ในรายงาน ("ทีมไม่ตรง" vs "ไม่มีใครทำ") และเพื่อ **นับรอบ**
--    ⚠️ ไม่เพิ่ม = insert ชน CHECK แล้วประวัติหายเงียบ (route ไม่อ่าน error ของ insert)
--    🪤 ทุกที่ที่เคยเขียน `kind = 'bounce'` ตรง ๆ ต้องรับ 'auto_bounce' ด้วย —
--    ฝั่งโค้ดรวมไว้ที่ `LEAD_BOUNCE_KINDS` (lib/sales/leads.js) แล้ว · ลืมที่ไหน
--    ที่หนึ่ง นัดของรอบก่อนจะฟื้นขึ้นมาบนลีดของเจ้าของคนใหม่
--
-- ⚠️ **ไม่มีคอลัมน์ใหม่** — จำนวนรอบนับจาก `lead_events` ที่ kind = 'auto_bounce'
--    เก็บเป็นตัวเลขบนแถวแล้วจะมีสองความจริงที่ต้องคอยทำให้ตรงกัน และตัวเลขนั้นจะ
--    ไม่รอดการล้างตอนตีกลับ (ซึ่งล้างของรอบทิ้งหมด)
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.lead_events
  DROP CONSTRAINT IF EXISTS lead_events_kind_check;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_kind_check
  CHECK (kind IN (
    'create', 'screen', 'assign', 'reassign', 'contact', 'followup', 'meeting',
    'qualify', 'create_deal', 'disqualify', 'bounce', 'auto_bounce', 'update'
  ));

-- cron นับรอบด้วย `WHERE leadId IN (…) AND kind = 'auto_bounce'` ทุกครั้งที่รัน
CREATE INDEX IF NOT EXISTS lead_events_auto_bounce_idx
  ON public.lead_events ("leadId")
  WHERE kind = 'auto_bounce';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- ชุด kind ต้องมี auto_bounce:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.lead_events'::regclass AND conname = 'lead_events_kind_check';
--
-- ── ก่อนเปิดใช้จริง — ดูว่ารอบแรกจะกวาดอะไรบ้าง ────────────────────────────
-- ⚠️ **ห้ามเปิด cron ก่อนดูตัวเลขนี้** · ตรวจข้อมูลจริง 2026-08-08 พบลีด 14 ใบค้าง
--    ข้ามเดือน ใบที่นานสุด 10 วันทำการ ⇒ รอบแรกจะตีกลับของค้างทั้งกองในนาทีเดียว
--    โดยไม่มีใครทันดู · เปิดหน้า /api/cron/auto-bounce-leads?dry=1 ในฐานะแอดมิน
--    เพื่อดูรายการโดยไม่เขียนอะไรเลย แล้วค่อยตัดสินใจ
--   SELECT status, count(*) FROM public.sales_leads
--    WHERE status IN ('assigned','contacted') GROUP BY 1;
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   ถอดคิวใน vercel.json ก่อน แล้วค่อยย้อน schema
--   DROP INDEX IF EXISTS public.lead_events_auto_bounce_idx;
--   DELETE FROM public.lead_events WHERE kind = 'auto_bounce';
--   ALTER TABLE public.lead_events DROP CONSTRAINT IF EXISTS lead_events_kind_check;
--   ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_kind_check
--     CHECK (kind IN ('create','screen','assign','reassign','contact','followup',
--                     'meeting','qualify','create_deal','disqualify','bounce','update'));
--   ⚠️ ใบที่ถูกตีกลับไปแล้วไม่ย้อนกลับ — ประวัติหายแต่สถานะยังเป็น new
