-- ============================================================
--  Migration 0384: ที่อยู่ไซต์แบบแยกช่อง + ชั้นที่พิมพ์เองได้ (มติผู้ใช้ 2026-09-24)
--
--  ⚠️ **เคยตั้งเลข 0383 แล้วเปลี่ยนเป็น 0384 ก่อนเคยรัน** — 0382 กับ 0383 เป็นของสาย
--  `claude/sales-role-hierarchy` (`0382_sales_role_hierarchy` · `0383_sales_role_commercial_director`
--  · PR #1807) ⇒ บทเรียนเดิม "เลข migration ชนข้าม worktree" (#1702) ต้องสแกนซ้ำก่อน push ไม่ใช่แค่ตอนจอง
--
--  ── 1) ที่อยู่ของไซต์บริการแยกช่องแบบทะเบียนลูกค้า ────────────────────────────
--  *"การพิมพ์ไซต์อื่น อยากให้ฟอร์มเหมือนที่อยู่ของฐานข้อมูล"* — ไซต์ที่ไม่ได้ตั้งจากที่อยู่
--  ในทะเบียนลูกค้า (ของจริง 158/169 ไซต์) เดิมเป็นช่องข้อความก้อนเดียว คีย์ไปแล้วปนไทย/อังกฤษ
--  ("กรุงเทพมหานคร … Bangkok 10270") · ตอนนี้ฟอร์มไซต์ใช้ช่องที่อยู่ตัวเดียวกับทะเบียนลูกค้า
--  (`components/master/ThaiAddressFields`) ⇒ ต้องมีที่เก็บฟิลด์ย่อยบนแถวไซต์
--
--  ⭐ **รูปเดียวกับ `customers.addresses[]` (mig 0202/0217)** แต่เป็นคอลัมน์จริง ไม่ใช่ jsonb —
--     ไซต์มีที่อยู่เดียว และวันหนึ่งจะจัดเส้นทางช่างตามอำเภอ (เหตุผลเดียวกับที่หัว
--     `lib/master/thaiAddress.js` เขียนไว้ว่าทำไมต้องแยกช่อง)
--  ⭐ **จังหวัดไม่เพิ่ม** — `province`/`provinceCode` มีตั้งแต่ mig 0315 และเป็นช่องเดียวกัน
--     (จังหวัดของที่อยู่ = จังหวัดในรหัสไซต์)
--  ⭐ `address` **ยังเป็นข้อความที่ทุกจออ่าน** — ฟิลด์ย่อยเป็นตัวประกอบ (server ประกอบให้ที่
--     `normalizeSiteInput` → `siteAddressText`) ⇒ ปลายทางทุกตัวไม่ต้องแก้
--  ✅ ไม่ต้อง backfill — ไซต์เดิมคงข้อความก้อนเดียวไว้ครบ ฟอร์มเสนอปุ่ม "แยกที่อยู่อัตโนมัติ" ให้เอง
--  ⚠️ ต้องรัน **ก่อน deploy** — ยังไม่รัน = เพิ่ม/แก้ไซต์ถูกตีกลับ 503 พร้อมข้อความไทย
--    (ด่าน `siteAddressColumnsError` · ตัวออกรหัสทิ้งคอลัมน์ที่ไม่มีเงียบ ๆ จึงต้องมีด่าน)
--    และ CI ด่าน check:columns แดงจนกว่าจะรัน
--
--  ── 2) ชั้นของโซนที่ไม่อยู่ในรายการ ───────────────────────────────────────────
--  *"ส่วนโซน ชั้น อยากให้เพิ่มชั้นเองได้ เผื่อตัวเลือกไม่มี"* — CHECK เดิม (mig 0315) รับแค่
--  01–99 · GF · MZ · RF · B1–B9 ⇒ LG/UG (ห้าง) · P1 (ชั้นจอดรถ) · 12A (ตึกข้ามชั้น 13) บันทึกไม่ได้
--  ⭐ กติกาใหม่ = ของเดิมทุกค่า **+ อังกฤษพิมพ์ใหญ่/ตัวเลข 2–3 ตัวที่มีตัวอักษรอย่างน้อยหนึ่งตัว**
--     ตรงกับ `CUSTOM_FLOOR_RE` ใน `lib/service/zoneCode.js` ทุกตัวอักษร
--  ⚠️ ต้องมีตัวอักษร — ตัวเลขล้วนเป็นของชั้น 01–99 (เติมศูนย์) · '4' กับ '04' เป็นสองค่า = โซน
--     ชั้นเดียวกันได้สองรหัส
--  ⚠️ ท่อน FF ของรหัส `ZN-CCCC-FF-DDDDD` กว้าง 2–3 ตัวได้แล้ว — ไม่มีอะไรในฐานกันรูปของ `code`
--     (ตัวออกรหัสต่อ prefix เฉย ๆ) · ตัวอ่านรหัสมีที่เดียวคือ `parseZoneCode` ซึ่งแยกด้วย '-'
--  ✅ ค่าเดิมทุกแถวผ่านกติกาใหม่ (ชุดใหม่ครอบชุดเดิม) ⇒ ADD CONSTRAINT ไม่ล้ม
-- ============================================================

BEGIN;

-- ── 1) ที่อยู่แยกช่องของไซต์ ─────────────────────────────────────────────────
ALTER TABLE public.service_sites
  ADD COLUMN IF NOT EXISTS line1 text,
  ADD COLUMN IF NOT EXISTS subdistrict text,
  ADD COLUMN IF NOT EXISTS "subdistrictCode" text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS "districtCode" text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS "addressOverride" boolean NOT NULL DEFAULT false;

ALTER TABLE public.service_sites DROP CONSTRAINT IF EXISTS service_sites_address_parts_check;
ALTER TABLE public.service_sites
  /* เพดานเดียวกับตัวตรวจฝั่งแอป (`normalizeSiteInput`) · รหัสเป็นตัวเลขกรมการปกครองล้วน ·
     รหัสไปรษณีย์ 5 หลักหรือว่าง (ไม่ครบ = ยังไม่ได้กรอก ตัวตรวจเก็บเป็น NULL) */
  ADD CONSTRAINT service_sites_address_parts_check CHECK (
        (line1 IS NULL OR length(line1) <= 400)
    AND (subdistrict IS NULL OR length(subdistrict) <= 100)
    AND (district IS NULL OR length(district) <= 100)
    AND ("subdistrictCode" IS NULL OR "subdistrictCode" ~ '^[0-9]{2,10}$')
    AND ("districtCode" IS NULL OR "districtCode" ~ '^[0-9]{2,10}$')
    AND (postcode IS NULL OR postcode ~ '^[0-9]{5}$')
  );

COMMENT ON COLUMN public.service_sites.line1 IS
  'บ้านเลขที่/อาคาร/ถนน ของที่อยู่หน้างาน (mig 0384) — ฟิลด์ย่อยประกอบ address ที่ server (siteAddressText)';
COMMENT ON COLUMN public.service_sites."addressOverride" IS
  'true = address เป็นข้อความที่พิมพ์เองทั้งก้อน ไม่ประกอบจากฟิลด์ย่อย (ที่อยู่ที่ไม่เข้าแบบฟอร์ม)';

-- ── 2) ชั้นที่พิมพ์เองได้ ───────────────────────────────────────────────────
ALTER TABLE public.service_zones
  DROP CONSTRAINT IF EXISTS service_zones_floor_format;
ALTER TABLE public.service_zones
  ADD CONSTRAINT service_zones_floor_format
  CHECK (floor ~ '^(0[1-9]|[1-9][0-9])$'
         OR (floor ~ '^[A-Z0-9]{2,3}$' AND floor ~ '[A-Z]'));

COMMENT ON COLUMN public.service_zones.floor IS
  'ชั้น 01–99 · GF/MZ/RF/B1–B9 หรือชั้นที่พิมพ์เอง (อังกฤษ/ตัวเลข 2–3 ตัว มีตัวอักษร เช่น LG P1 12A · mig 0384) — ท่อน FF ของรหัส ZN (lib/service/zoneCode.js)';

ALTER TABLE public.service_survey_zones
  DROP CONSTRAINT IF EXISTS service_survey_zones_new_zone_needs_floor;
ALTER TABLE public.service_survey_zones
  /* 🔴 **ต้องมี `floor IS NOT NULL` ด้วย** (บทเรียน mig 0315) — `NULL ~ '…'` ให้ NULL ซึ่ง
     Postgres ถือว่าผ่าน CHECK ⇒ แถวพื้นที่ใหม่ที่ไม่มีชั้นจะลอดไปได้ */
  ADD CONSTRAINT service_survey_zones_new_zone_needs_floor
  CHECK ("zoneId" IS NOT NULL
         OR (floor IS NOT NULL
             AND (floor ~ '^(0[1-9]|[1-9][0-9])$'
                  OR (floor ~ '^[A-Z0-9]{2,3}$' AND floor ~ '[A-Z]'))));

-- ⚠️ ให้ PostgREST เห็นคอลัมน์ใหม่ทันที — ไม่งั้นเส้นเขียนได้ PGRST204 จนกว่าแคชจะหมดเอง
NOTIFY pgrst, 'reload schema';

COMMIT;
