-- ============================================================
--  Migration 0303: replacedByAssetId ต้องเป็น RESTRICT ไม่ใช่ SET NULL
--
--  🐞 0301 ตั้ง FK เป็น ON DELETE SET NULL พร้อมกับ CHECK ที่บอกว่า
--        outcome = 'swapped' ⇒ "replacedByAssetId" IS NOT NULL
--     สองข้อนี้ขัดกันเอง: พอลบเครื่องที่เคยถูกใช้เป็น "ตัวแทน" Postgres จะ
--     SET NULL ให้ตามคำสั่ง แล้วแถวนั้นก็ไปชน CHECK ทันที
--     ⇒ ผู้ใช้ได้ 500 พร้อมข้อความดิบ
--        `violates check constraint "service_visit_assets_swap_needs_target"`
--     แทนที่จะได้คำตอบว่าลบไม่ได้เพราะอะไร (เจอตอนเก็บกวาดข้อมูลทดสอบ 2026-08-28)
--
--  ⭐ ทางที่ถูกคือ RESTRICT ด้วยเหตุผลเดียวกับ "assetId" ในใบเดียวกัน:
--     ประวัติที่บอกว่า "เปลี่ยนเป็นเครื่องไหน" แล้วช่องนั้นว่าง คือแถวที่อ่านไม่ได้เลย
--     ⇒ ลบเครื่องที่เคยเป็นตัวแทนไม่ได้ · ถอดของจริงให้ใช้สถานะ "ถอดออกแล้ว"
--     (ด่านฝั่งแอปที่ /api/service/sites/[id]/assets/[assetId] นับทั้งสองคอลัมน์แล้ว
--      ใบนี้คือด่านชั้นล่างเผื่อเส้นทางอื่นที่ยังไม่มีวันนี้)
--
--  ⚠️ รันมือบน Supabase SQL Editor · เปลี่ยนกฎ FK อย่างเดียว ไม่แตะข้อมูล
-- ============================================================

BEGIN;

ALTER TABLE public.service_visit_assets
  DROP CONSTRAINT IF EXISTS "service_visit_assets_replacedByAssetId_fkey";

ALTER TABLE public.service_visit_assets
  ADD CONSTRAINT "service_visit_assets_replacedByAssetId_fkey"
  FOREIGN KEY ("replacedByAssetId") REFERENCES public.service_assets(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.service_visit_assets."replacedByAssetId" IS
  'เครื่องที่เอามาแทนตอน outcome = swapped — RESTRICT: ลบเครื่องที่เคยเป็นตัวแทนไม่ได้ (แถวที่ไม่รู้ว่าเปลี่ยนเป็นตัวไหน = อ่านไม่ได้) · ถอดของจริงให้ใช้สถานะ removed';

COMMIT;

NOTIFY pgrst, 'reload schema';
