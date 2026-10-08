-- ── 0402 · รหัสเหตุผล "ระบบปิดลีดอัตโนมัติ" (มติผู้ใช้ 2026-09-16 · ลงมือ 2026-10-05) ──
--
-- ⭐ ที่มา: ลีดที่อยู่ในมือฝ่ายขายพ้น 10 วันทำการแล้วยังไม่ได้นัดประชุม ⇒ ระบบปิดเป็น "ไม่ไปต่อ"
--   (cron/auto-bounce-leads · กติกาอยู่ที่ lib/sales/leadAutoLost.js)
--   ตีกลับอัตโนมัติเดิมจับใบพวกนี้ไม่ได้ เพราะนับจาก followUpAt ที่ AE เลื่อนเองได้ทุกครั้งที่กดติดตาม
--
-- `sales_leads.disqualifiedCode` รับสามค่าใหม่ = สามฉลากความพยายามของคนถือใบ
--    'auto_followed'  ระบบปิด · ตามครบ    (ติดต่อ ≥ 3 ครั้งตลอดอายุใบ)
--    'auto_partial'   ระบบปิด · ตามไม่ครบ (ติดต่อ 1–2 ครั้ง)
--    'auto_untouched' ระบบปิด · ไม่เคยแตะ  (ไม่มีบันทึกการติดต่อเลย)
--    ⭐ ฉลากอยู่ในรหัส ไม่ใช่คอลัมน์ใหม่ — รายงาน "แพ้เพราะอะไร" แยกสามแถวได้ทันที
--    ⚠️ ชุดค่าต้องตรงกับ `LEAD_LOST_REASONS` ใน lib/sales/leads.js เป๊ะ
--       (leadLostReason.test อ่าน CHECK จาก migration ล่าสุดที่สร้างมันมาเทียบ)
--
-- 🪤 ต้องรัน **ก่อน** deploy โค้ดชุดนี้ — ไม่รัน = cron ปิดลีดชน CHECK ทุกใบ
--    (route ข้ามใบที่เขียนไม่ลงแล้วเดินต่อ ⇒ ไม่มีอะไรพัง แต่ไม่มีใบไหนถูกปิดเลย)
--
-- ⚠️ ไม่มีคอลัมน์ใหม่ ไม่ backfill · `lead_events` ไม่ต้องแก้ (เหตุการณ์ใช้ kind 'disqualify' เดิม
--    ผู้กระทำเป็น "ระบบ")
--
-- ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้

BEGIN;

ALTER TABLE public.sales_leads
  DROP CONSTRAINT IF EXISTS sales_leads_disqualified_code_check;

ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_disqualified_code_check
  CHECK ("disqualifiedCode" IS NULL OR "disqualifiedCode" IN (
    'no_response', 'budget', 'not_target', 'timing',
    'competitor', 'duplicate', 'invalid', 'other',
    'auto_followed', 'auto_partial', 'auto_untouched'
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- CHECK ต้องมีครบ 11 ค่า:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.sales_leads'::regclass
--      AND conname = 'sales_leads_disqualified_code_check';
-- หลัง cron รอบแรก ดูใบที่ระบบปิด:
--   SELECT "disqualifiedCode", count(*) FROM public.sales_leads
--    WHERE "disqualifiedCode" LIKE 'auto\_%' GROUP BY 1;
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อน (ไม่งั้น cron รอบถัดไปชน CHECK) · ใบที่ระบบปิดไปแล้วต้องเปลี่ยนรหัสก่อนย้อน CHECK
--   UPDATE public.sales_leads SET "disqualifiedCode" = 'no_response'
--    WHERE "disqualifiedCode" IN ('auto_followed', 'auto_partial', 'auto_untouched');
--   ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_disqualified_code_check;
--   ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_disqualified_code_check
--     CHECK ("disqualifiedCode" IS NULL OR "disqualifiedCode" IN (
--       'no_response','budget','not_target','timing','competitor','duplicate','invalid','other'));
