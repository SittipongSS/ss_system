-- ============================================================
--  Migration 0305: เก็บกวาดกฎซ้ำบน service_assets (ผลพวงจาก 0298 ฉบับแรก)
--
--  🐞 0298 ฉบับแรกห้อย CHECK/REFERENCES ไว้ในบรรทัด `ADD COLUMN IF NOT EXISTS`
--     Postgres ข้ามเฉพาะ **คอลัมน์** ส่วน constraint ถูกแยกเป็น subcommand ที่ไม่มี
--     IF NOT EXISTS คุม และเมื่อไม่ได้ตั้งชื่อ มันจะเลือกชื่อใหม่ต่อท้ายเลขให้เรื่อย ๆ
--     ⇒ รันไฟล์ชุดรวมซ้ำอีกรอบ = ได้ service_assets_qty_check1 / _colour_check1 /
--       _floor_check1 / _spot_check1 / "service_assets_zoneId_fkey1" เพิ่มเงียบ ๆ
--       ไม่มี error ไม่มีอะไรบนจอ และ SELECT ตรวจผลก็ยังขึ้น ok เพราะมันนับแต่คอลัมน์
--     ผลระยะยาว: DROP CONSTRAINT ตามชื่อเดิมของ migration วันหลังจะถอดกฎไม่ออก
--     (ตัวซ้ำยังคาอยู่) และ FK ซ้ำ = ON DELETE SET NULL วิ่งสองชุดตอนลบโซน
--
--  ⭐ 0298 ถูกแก้ให้ตั้งชื่อเอง + DO guard แล้ว (ใช้ชื่อเดียวกับที่ Postgres ตั้งให้
--     ตอนรันครั้งแรก 2026-08-28) ⇒ ตั้งแต่นี้รันซ้ำได้จริง · ใบนี้มีไว้เก็บของที่
--     อาจเกิดไปแล้วถ้าเคยรันชุดรวมมากกว่าหนึ่งรอบ
--
--  ⚠️ รันมือบน Supabase SQL Editor · **ถ้าไม่เคยรันซ้ำ ใบนี้จะไม่ทำอะไรเลย**
--     (ไม่มีของซ้ำให้ลบ) — ปลอดภัยทั้งสองทาง
-- ============================================================

BEGIN;

DO $$
DECLARE
  dup record;
  dropped int := 0;
BEGIN
  /* ลบเฉพาะตัวที่ **ลงท้ายด้วยเลข** ซึ่งเป็นลายเซ็นของชื่อที่ Postgres เลือกให้เอง
     ตอนชนชื่อ — ตัวที่ไม่มีเลขคือของจริงจากการรันครั้งแรก ห้ามแตะ
     ⚠️ จำกัดที่ตาราง service_assets ตารางเดียว และเฉพาะกฎที่คุมคอลัมน์ของ 0298 */
  FOR dup IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.service_assets'::regclass
      AND conname ~ '^service_assets_(qty|colour|floor|spot)_check[0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE public.service_assets DROP CONSTRAINT %I', dup.conname);
    dropped := dropped + 1;
  END LOOP;

  FOR dup IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.service_assets'::regclass
      AND conname ~ '^service_assets_zoneId_fkey[0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE public.service_assets DROP CONSTRAINT %I', dup.conname);
    dropped := dropped + 1;
  END LOOP;

  RAISE NOTICE 'service_assets: ลบกฎซ้ำ % ตัว (0 = ไม่เคยรันชุดรวมซ้ำ)', dropped;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
