-- ============================================================
--  Migration 0384: ที่อยู่ไซต์แบบแยกช่อง + ชั้นที่พิมพ์เองได้ + รหัสโซนตัดท่อนชั้น (มติผู้ใช้ 2026-09-24)
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
--  ⚠️ ต้องมีตัวอักษร — ตัวเลขล้วนเป็นของชั้น 01–99 (เติมศูนย์) · '4' กับ '04' เป็นสองค่า = ชั้นเดียวกัน
--     กลายเป็นสองชิป สองป้าย
--  ✅ ค่าเดิมทุกแถวผ่านกติกาใหม่ (ชุดใหม่ครอบชุดเดิม) ⇒ ADD CONSTRAINT ไม่ล้ม
--
--  ── 3) รหัสโซนตัดท่อนชั้นออก: `ZN-CCCC-FF-DDDDD` → `ZN-CCCC-DDDDD` ──────────────────
--  *"รหัสโซน ตัด FF ชั้นออกเลยดีกว่า"* — ชั้นผูกกับตัวตนทำให้ชั้นที่ไม่อยู่ในชุดมาตรฐานต้องยืดรหัส
--  และย้ายชั้นทีหลังแล้วรหัสยังอ่านว่าชั้นเก่า ⇒ ชั้นเหลือเป็นคอลัมน์ `floor` อย่างเดียว
--  ⭐ **เขียนรหัสเดิมทุกแถวเป็นรูปใหม่** (ไม่ปล่อยสองรูปในระบบเดียว — กติกาเดียวกับ mig 0315 ข้อ 7)
--     · ทำได้เพราะ DDDDD นับตัวเดียวทั้งระบบ ⇒ ตัดท่อนชั้นแล้วไม่มีทางชนกัน (UNIQUE ของ `code`
--       กันซ้ำให้อีกชั้น — ชนเมื่อไรทั้งใบถอย)
--     · และ **รหัสโซนไม่เคยถูกตรึงลงเอกสารที่ออกไปแล้ว** — ตรวจ 24/09: QT/SO ที่ตรึง HTML 734 ใบ
--       ไม่พิมพ์รหัสโซน (บรรทัด SO ใช้รหัสไซต์ + ชื่อโซน) · ทุกจออ่านรหัสสดจากตารางนี้ด้วย `zoneId`
--  ⚠️ ร่องรอยก่อนเขียนทับ = `audit_logs` (entityType `service_zone` แบบเดียวกับที่แอปเขียน)
--     รหัสเดิมกู้ได้จาก `audit_logs.before` เท่านั้น
--  ⚠️ ตัวนับเลขรัน `entity_number_counters (ZN, '-')` ไม่แตะ — เลขท้ายเดินต่อจากเดิม
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
  'ชั้น 01–99 · GF/MZ/RF/B1–B9 หรือชั้นที่พิมพ์เอง (อังกฤษ/ตัวเลข 2–3 ตัว มีตัวอักษร เช่น LG P1 12A · mig 0384) — ไม่อยู่ในรหัส ZN แล้ว (lib/service/zoneCode.js)';

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

-- ── 3) รหัสโซนตัดท่อนชั้นออก ──────────────────────────────────────────────────
-- ⓐ ด่าน: ทุกแถวต้องเป็นรูปที่รู้จัก (มีชั้น หรือรูปใหม่อยู่แล้ว) — เจอรูปแปลก = หยุดทั้งใบ ไม่เดา
DO $$
DECLARE v_odd text;
BEGIN
  SELECT string_agg(code, ' · ' ORDER BY code) INTO v_odd
    FROM public.service_zones
   WHERE code IS NULL
      OR NOT (code ~ '^ZN-\d{4}-[0-9A-Z]{2,3}-\d{5}$' OR code ~ '^ZN-\d{4}-\d{5}$');
  IF v_odd IS NOT NULL THEN
    RAISE EXCEPTION 'มีรหัสโซนรูปที่ไม่รู้จัก: % — ตรวจแถวเหล่านี้ก่อน (ใบนี้ไม่เดาว่าควรเป็นอะไร)', v_odd;
  END IF;
END $$;

-- ⓑ ร่องรอยก่อนเขียนทับ (กู้คืนได้จาก audit_logs.before เท่านั้น)
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT 'migration-0384', 'ระบบ (mig 0384)', 'system', 'update', 'service_zone', z.id,
       'รหัสโซนตัดท่อนชั้นออก ' || z.code || ' → '
         || 'ZN-' || split_part(z.code, '-', 2) || '-' || split_part(z.code, '-', 4)
         || ' (มติผู้ใช้ 2026-09-24)',
       '["code"]'::jsonb, to_jsonb(z), now()
  FROM public.service_zones z
 WHERE z.code ~ '^ZN-\d{4}-[0-9A-Z]{2,3}-\d{5}$';

-- ⓒ เขียนรหัสใหม่ — ท่อนที่ 2 (เลขรันไซต์) + ท่อนที่ 4 (เลขรันโซน) · ชนกันเมื่อไร UNIQUE ทำให้ทั้งใบถอย
UPDATE public.service_zones
   SET code = 'ZN-' || split_part(code, '-', 2) || '-' || split_part(code, '-', 4),
       "updatedAt" = now()
 WHERE code ~ '^ZN-\d{4}-[0-9A-Z]{2,3}-\d{5}$';

-- ⓓ ยืนยัน: ต้องไม่เหลือรูปมีชั้นสักแถว
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.service_zones WHERE code !~ '^ZN-\d{4}-\d{5}$';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'ยังเหลือรหัสโซนที่ไม่ใช่รูป ZN-CCCC-DDDDD % แถว', v_left;
  END IF;
END $$;

COMMENT ON COLUMN public.service_zones.code IS
  'ZN-CCCC-DDDDD · CCCC = เลขรันของไซต์ (ท่อนท้ายรหัส ST) · DDDDD = เลขรันทั้งระบบ · ไม่มีชั้นในรหัสตั้งแต่ mig 0384 (มติ 2026-09-24)';

-- ⚠️ ให้ PostgREST เห็นคอลัมน์ใหม่ทันที — ไม่งั้นเส้นเขียนได้ PGRST204 จนกว่าแคชจะหมดเอง
NOTIFY pgrst, 'reload schema';

COMMIT;
