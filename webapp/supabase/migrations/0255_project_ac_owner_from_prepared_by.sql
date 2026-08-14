-- ============================================================
--  Migration 0255: ย้าย "ผู้ประสานงาน (AC)" จาก preparedBy → acOwner/acOwnerId
--
--  ที่มา: ช่อง "ผู้ประสานงานโครงการ (AC)" บนฟอร์มโครงการเคยเขียนลง `preparedBy`
--  ซึ่งเป็นคอลัมน์ **"ผู้จัดทำ"** ของหัวเอกสาร ISO — ไม่ใช่ `acOwner`/`acOwnerId`
--  ที่ปลายทางจริงอ่าน ⇒ ช่อง "ผู้ประสานงาน" บนใบ PDR (lib/requests/pdrFields.js
--  → coordinator) ว่างตลอดกาลทั้งบนจอและบนกระดาษ และ AC ไม่เคยได้รับแจ้งเตือน
--  ความเคลื่อนไหวของโครงการที่ตัวเองประสาน (lib/master/updateAccess.js)
--  ฝั่งโค้ดต่อสายถูกแล้ว — ไฟล์นี้ตามเก็บของที่กรอกไปก่อนหน้านั้น
--
--  ตรวจ prod 2026-08-14 — 90 ใบมีชื่อใน `preparedBy` และ `acOwner` ว่างทั้งหมด:
--      Aphinya Prachuabsuk      34 ใบ  [ac]
--      Chalita Sriwareerat      20 ใบ  [ac]
--      Chidchanok Onanong       19 ใบ  [ac]
--      Patinya Poonsittichokchai 10 ใบ [ac]
--      Panuwat Hongloylom        4 ใบ  [ac]
--      "Patinya P."              2 ใบ  (ชื่อย่อของบัญชี [ac] ข้างบน)
--      Kantima Thadatharakiat    1 ใบ  [ae] ← **ชื่อผู้สร้าง ไม่ใช่การเลือก AC**
--  ⇒ ย้าย 89 ใบ · ใบของ AE ถูกกรองออกด้วยเงื่อนไข role เอง ไม่ต้องระบุรายตัว
--
--  ⚠ **ย้ายเฉพาะชื่อที่เป็นบัญชี role `ac` จริง** — คนที่ preparedBy เป็นชื่อ AE/แอดมิน
--    คือค่า default ที่ server เติมให้ตอนสร้าง (ผู้จัดทำ = ผู้สร้าง) ไม่ใช่ผู้ประสานงาน
--  ⚠ จับคู่ชื่อด้วยกติกาชุดเดียวกับ 0190/0254 (ตรงเป๊ะ หรือ "ชื่อ + อักษรแรกนามสกุล.")
--    และอัปเดตเฉพาะแถวที่จับได้ **บัญชีเดียว**
--  ⚠ **ไม่ล้าง `preparedBy`** — เป็นช่องที่พิมพ์ลงหัวเอกสารไปแล้ว และสำหรับใบเหล่านี้
--    AC ก็คือคนที่จัดทำเอกสารจริง · ล้างทิ้ง = หัวเอกสารเก่า 89 ใบว่างเปล่า ซึ่งแย่กว่า
--    ความไม่สม่ำเสมอที่เหลืออยู่ (ใบใหม่ preparedBy = ผู้สร้าง)
--  ⚠ เขียน **ชื่อเต็มจากบัญชี** ลง `acOwner` (ไม่ใช่ชื่อย่อที่ค้างใน preparedBy) —
--    ช่องนี้ยังว่างอยู่ จึงไม่ใช่การทับ snapshot ของเอกสารที่พิมพ์ไปแล้ว
--
--  รันซ้ำได้ (แตะเฉพาะแถวที่ `acOwnerId` ยังว่าง) · ไม่แตะโครงสร้าง
-- ============================================================

DO $$
DECLARE
  moved      int;
  cross_team int;
  skipped    int;
BEGIN
  WITH acct AS (
    SELECT u.id::text AS uid,
           btrim(u.raw_user_meta_data->>'name') AS full_name,
           nullif(btrim(coalesce(u.raw_app_meta_data->>'team', '')), '') AS team
    FROM auth.users u
    WHERE coalesce(u.raw_app_meta_data->>'role', '') = 'ac'   -- ⭐ เฉพาะผู้ประสานงานจริง
      AND btrim(coalesce(u.raw_user_meta_data->>'name', '')) <> ''
      AND NOT (u.banned_until IS NOT NULL AND u.banned_until > now())
  ),
  hit AS (
    SELECT p.id AS pid, a.uid, a.full_name
    FROM public.projects p
    JOIN acct a ON (
      a.full_name = btrim(p."preparedBy")
      OR (
        btrim(p."preparedBy") ~ '^[^ ]+ [A-Za-z]\.$'
        AND split_part(a.full_name, ' ', 1) = split_part(btrim(p."preparedBy"), ' ', 1)
        AND left(split_part(a.full_name, ' ', 2), 1) = left(split_part(btrim(p."preparedBy"), ' ', 2), 1)
      )
    )
    WHERE p."acOwnerId" IS NULL
      AND btrim(coalesce(p."acOwner", '')) = ''
      AND btrim(coalesce(p."preparedBy", '')) <> ''
  ),
  uniq AS (
    SELECT pid, min(uid) AS uid, min(full_name) AS full_name
    FROM hit GROUP BY pid HAVING count(DISTINCT uid) = 1
  )
  UPDATE public.projects p
     SET "acOwnerId" = uniq.uid,
         "acOwner"   = uniq.full_name
    FROM uniq WHERE p.id = uniq.pid;
  GET DIAGNOSTICS moved = ROW_COUNT;

  -- ผู้ประสานงานที่ทีมไม่ตรงกับทีมของงาน — ย้ายให้แล้ว (ของจริงคือเขาประสานงานใบนั้น)
  -- แต่ฟอร์มจะไม่ยอมให้ **เลือกใหม่** ข้ามทีม (resolveProjectAcOwner) จึงต้องรู้ตัวเลข
  SELECT count(*) INTO cross_team
    FROM public.projects p
    JOIN auth.users u ON u.id::text = p."acOwnerId"
   WHERE p.team IS NOT NULL
     AND nullif(btrim(coalesce(u.raw_app_meta_data->>'team', '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(u.raw_app_meta_data->>'team', '')), '') <> p.team;

  -- ใบที่มีชื่อใน preparedBy แต่ไม่ใช่บัญชี AC = ชื่อผู้สร้าง ปล่อยไว้ตามเดิม
  SELECT count(*) INTO skipped
    FROM public.projects p
   WHERE p."acOwnerId" IS NULL
     AND btrim(coalesce(p."preparedBy", '')) <> '';

  RAISE NOTICE 'ย้ายผู้ประสานงาน: % ใบ · ในนั้นทีมไม่ตรงกับงาน: % ใบ · ไม่ย้าย (ไม่ใช่บัญชี AC): % ใบ',
    moved, cross_team, skipped;
END $$;

-- คิวรีตรวจหลังรัน (คัดลอกไปรันเองได้):
--   SELECT "acOwner", count(*) FROM projects
--    WHERE "acOwnerId" IS NOT NULL GROUP BY "acOwner" ORDER BY count(*) DESC;
