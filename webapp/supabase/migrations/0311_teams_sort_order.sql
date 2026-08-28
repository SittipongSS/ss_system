-- ============================================================
--  Migration 0311: ลำดับทีมในทะเบียนให้ตรงกับลำดับมาตรฐานของระบบ
--
--  🐞 mig 0310 backfill ลำดับตาม `TEAMS` เดิม (ODM → KA → SV) แต่ **ลำดับที่ระบบ
--  ใช้แสดงผลจริงมาตลอดคือ KA → ODM → SV** (`SALES_TEAMS` ในหน้าวางเป้า และ
--  `TEAM_ORDER` ในแดชบอร์ด ซึ่งคอมเมนต์ของมันเองเขียนว่า "ลำดับทีมมาตรฐานทั้งระบบ")
--  ⇒ งวด T-5 ยุบสามชุดเหลือชุดเดียวที่ KA → ODM → SV และทะเบียนต้องเรียงตามนั้น
--  ⚠️ มีด่าน CI (`npm run check:teams`) เทียบลำดับสองฝั่ง ผิดเมื่อไรแดงทันที
--
--  ── สิ่งที่ **ไม่ได้ทำ** และเหตุผล ────────────────────────────────────────
--  ฉบับแรกของใบนี้จะเปลี่ยน `commercial_presets.teamKey` จาก CHECK ที่ฝังรหัส
--  ('ODM','KA','SV') เป็น FK ชี้ทะเบียน — **แต่คอลัมน์นั้นไม่มีอยู่แล้ว**
--  `mig 0149` ถอด teamKey/dealType/serviceType/priority ทิ้งตอนรื้อคลังเงื่อนไข
--  การค้าเป็น "คลังตามชนิด" (kind = payment | remarks) ⇒ ไม่มีรหัสทีมฝังใน SQL
--  ของตารางนั้นอีกแล้ว และทีมขายที่สร้างใหม่ไม่ติดอะไรตรงนี้
--  (ใบแรกล้มที่ ERROR 42703 ตอนรันจริง — ข้อมูลที่ใช้ออกแบบมาจากการอ่าน mig 0128
--   โดยไม่ได้ไล่ต่อว่ามี migration ที่ถอดคอลัมน์ไปแล้ว)
--
--  ⚠️ รันมือบน Supabase SQL Editor · idempotent (UPDATE ตามรหัส รันซ้ำได้)
-- ============================================================

BEGIN;

UPDATE public.teams SET "sortOrder" = 10, "updatedAt" = now() WHERE code = 'KA';
UPDATE public.teams SET "sortOrder" = 20, "updatedAt" = now() WHERE code = 'ODM';
UPDATE public.teams SET "sortOrder" = 30, "updatedAt" = now() WHERE code = 'SV';

COMMIT;

NOTIFY pgrst, 'reload schema';
