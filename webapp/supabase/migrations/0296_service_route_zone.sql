-- 0296 - เปลี่ยนชื่อ service_sites.zone เป็น "routeZone" (เขตวิ่งงาน)
--
-- ⭐ มติผู้ใช้ 2026-08-27 (แผนระบบธุรกิจบริการ เฟส 1): ระบบกำลังจะได้ entity ใหม่
-- "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception) ที่เกิดโยงจากบรรทัดใบสั่งขาย —
-- แต่คอลัมน์ `zone` เดิมของไซต์หมายถึง **เขตวิ่งงานของช่าง** ('BKK-E' / 'ปริมณฑล'
-- ใช้จัดรอบวิ่งไม่ให้ข้ามเมืองในวันเดียว) ซึ่งเป็นคนละเรื่องกันสิ้นเชิง
--
-- ถ้าปล่อยให้คำว่า zone มีสองความหมายในโมดูลเดียว ทั้งโค้ดและจอจะสับสนถาวร
-- ⇒ เปลี่ยนชื่อของเดิมตอนนี้ ระหว่างการ์ดระบบยังปิดอยู่ (`systems.js` disabled
-- ตั้งแต่ 2026-08-09) — เปิดใช้เมื่อไหร่หน้าต่างเปลี่ยนชื่อนี้ปิดถาวร
--
-- ⚠️ ลำดับ deploy: รันใบนี้ **ชิดกับ deploy โค้ดชุดเดียวกัน** — `visitsRepo.js`
-- SELECT ระบุชื่อคอลัมน์ตรง ๆ ทิ้งช่วงนานฝั่งใดฝั่งหนึ่งจะอ่านคอลัมน์ที่ไม่มีแล้ว
--
-- idempotent: เช็คก่อนเปลี่ยนชื่อ — รันซ้ำได้ไม่มีอะไรเปลี่ยน

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_sites' AND column_name = 'zone'
  ) THEN
    ALTER TABLE public.service_sites RENAME COLUMN zone TO "routeZone";
  END IF;
END $$;

-- ดัชนีเดิมตามคอลัมน์มาเองตอน RENAME — เปลี่ยนชื่อดัชนีให้ตรงเนื้อด้วย
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'service_sites_zone_idx') THEN
    ALTER INDEX public.service_sites_zone_idx RENAME TO service_sites_route_zone_idx;
  END IF;
END $$;

COMMENT ON COLUMN public.service_sites."routeZone" IS
  'เขตวิ่งงานของช่าง (BKK-E / ปริมณฑล) ใช้จัดรอบวิ่ง — คนละเรื่องกับ "โซน" (service_zones) ที่เป็นพื้นที่ย่อยในไซต์';

NOTIFY pgrst, 'reload schema';
