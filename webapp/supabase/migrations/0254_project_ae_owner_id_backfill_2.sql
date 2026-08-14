-- ============================================================
--  Migration 0254: เติม projects."aeOwnerId" ให้ใบที่เกิด **หลัง** mig 0190
--
--  0190 เพิ่มคอลัมน์ `aeOwnerId` แล้ว backfill จากชื่อไปรอบหนึ่ง — แต่ต้นเหตุที่ทำให้
--  ชื่อกับ id ไม่เดินคู่กันยังอยู่ต่อมาอีกพักหนึ่ง: ฟอร์มสร้างโครงการเขียน
--  `localStorage.userName` ซึ่งเป็น **ชื่อย่อ** ("Threerapong P.") ลงช่องผู้ดูแล แล้ว
--  `personIdByName` จับคู่ไม่ได้ ⇒ ใบที่เปิดหลัง 0190 เกิดมาพร้อม `aeOwnerId` ว่างอีกชุด
--
--  ตรวจ prod 2026-08-14 — 11 ใบ ทุกใบจับคู่ได้ **บัญชีเดียว** และทีมของแถวตรงกับ
--  ทีมของบัญชีนั้นอยู่แล้ว (ODM/SV) · `ownerId` ก็เป็นบัญชีเดียวกันอยู่แล้วเพราะคนเปิด
--  คือผู้ดูแลเอง ⇒ เหลือช่อง `aeOwnerId` ช่องเดียวที่ต้องเติม:
--      "Threerapong P." × 6 → Threerapong Phankam [ae/ODM]
--      "Kantima T."     × 3 → Kantima Thadatharakiat [ae/SV]
--      "Supisara S."    × 2 → Supisara Sangkaew [senior_ae/ODM]
--
--  ทำไมต้องเติม: `aeOwnerId` คือ **ตัวตน** ที่ระบบใช้ส่งแจ้งเตือนและตัดสินสิทธิ์
--  (lib/master/updateAccess.js ส่งตาม `aeOwnerId`/`acOwnerId` ไม่ใช่ชื่อ) ⇒ ใบที่ id ว่าง
--  ผู้ดูแลไม่ได้รับแจ้งเตือนของงานตัวเองเลย และธง "ฉันคือผู้ดูแล" ไม่ติด
--
--  ⚠ **กติกาจับคู่ = ชุดเดียวกับ 0190 ห้ามหลวมกว่านี้**: ชื่อตรงเป๊ะ หรือชื่อย่อรูป
--    "ชื่อ + อักษรแรกของนามสกุล." เท่านั้น · และอัปเดตเฉพาะแถวที่จับได้ **บัญชีเดียว**
--    (เดาผิดแล้วแจ้งเตือนไปผิดคน แย่กว่าไม่แจ้ง — เหตุผลเดิมของ 0190)
--  ⚠ แตะเฉพาะ `aeOwnerId` ที่ยังว่าง — ไม่ทับค่าที่คนแก้ไว้ทีหลัง · รันซ้ำได้
--  ⚠ **ไม่แตะชื่อ** `aeOwner` — ชื่อบนใบคือ snapshot สำหรับเอกสารที่พิมพ์ไปแล้ว
--    (ดูหัว 0190 · lib/personNameFanOut.js เขียนกฎนี้ไว้ตรง ๆ)
--  ⚠ ทางเกิดใหม่ปิดไปแล้วที่ POST /api/sa/projects (บังคับเลือกผู้ดูแลที่เป็นบัญชีจริง
--    — mig 0253 / lib/pm/projectOwner.js) ไฟล์นี้จึงเป็นการตามเก็บของเก่าครั้งสุดท้าย
-- ============================================================

DO $$
DECLARE
  filled    int;
  ambiguous int;
  left_over int;
BEGIN
  WITH acct AS (
    SELECT u.id::text AS uid, btrim(u.raw_user_meta_data->>'name') AS full_name
    FROM auth.users u
    WHERE coalesce(u.raw_app_meta_data->>'role', '') NOT IN ('', 'user')
      AND btrim(coalesce(u.raw_user_meta_data->>'name', '')) <> ''
      -- บัญชีที่ถูกระงับแล้วไม่ใช่ผู้ดูแลของงานที่ยังเดินอยู่ — ปล่อยให้คนมาเลือกใหม่
      AND NOT (u.banned_until IS NOT NULL AND u.banned_until > now())
  ),
  hit AS (
    SELECT p.id AS pid, a.uid
    FROM public.projects p
    JOIN acct a ON (
      a.full_name = btrim(p."aeOwner")
      OR (
        btrim(p."aeOwner") ~ '^[^ ]+ [A-Za-z]\.$'
        AND split_part(a.full_name, ' ', 1) = split_part(btrim(p."aeOwner"), ' ', 1)
        AND left(split_part(a.full_name, ' ', 2), 1) = left(split_part(btrim(p."aeOwner"), ' ', 2), 1)
      )
    )
    WHERE p."aeOwnerId" IS NULL AND btrim(coalesce(p."aeOwner", '')) <> ''
  ),
  uniq AS (
    SELECT pid, min(uid) AS uid FROM hit GROUP BY pid HAVING count(DISTINCT uid) = 1
  )
  UPDATE public.projects p SET "aeOwnerId" = uniq.uid
  FROM uniq WHERE p.id = uniq.pid;
  GET DIAGNOSTICS filled = ROW_COUNT;

  -- ชื่อที่ตรงได้หลายบัญชี — ต้องเลือกด้วยมือที่หน้าโครงการ (ระบบไม่เดาแทน)
  WITH acct AS (
    SELECT u.id::text AS uid, btrim(u.raw_user_meta_data->>'name') AS full_name
    FROM auth.users u
    WHERE coalesce(u.raw_app_meta_data->>'role', '') NOT IN ('', 'user')
      AND btrim(coalesce(u.raw_user_meta_data->>'name', '')) <> ''
  ),
  hit AS (
    SELECT p.id AS pid, a.uid
    FROM public.projects p
    JOIN acct a ON (
      a.full_name = btrim(p."aeOwner")
      OR (
        btrim(p."aeOwner") ~ '^[^ ]+ [A-Za-z]\.$'
        AND split_part(a.full_name, ' ', 1) = split_part(btrim(p."aeOwner"), ' ', 1)
        AND left(split_part(a.full_name, ' ', 2), 1) = left(split_part(btrim(p."aeOwner"), ' ', 2), 1)
      )
    )
    WHERE p."aeOwnerId" IS NULL AND btrim(coalesce(p."aeOwner", '')) <> ''
  )
  SELECT count(*) INTO ambiguous
    FROM (SELECT pid FROM hit GROUP BY pid HAVING count(DISTINCT uid) > 1) multi;

  SELECT count(*) INTO left_over FROM public.projects WHERE "aeOwnerId" IS NULL;

  RAISE NOTICE 'เติม aeOwnerId: % แถว · ชื่อกำกวมต้องเลือกเอง: % แถว · ยังว่างทั้งหมด: % แถว',
    filled, ambiguous, left_over;
END $$;

-- คิวรีตรวจหลังรัน (คัดลอกไปรันเองได้) — แถวที่เหลือคือใบที่ต้องเปิดหน้าโครงการ
-- แล้วเลือกผู้ดูแลด้วยมือ (ชื่อว่าง · ชื่อกำกวม · หรือเจ้าของชื่อปิดบัญชีไปแล้ว):
--   SELECT code, team, "aeOwner", "aeOwnerId" FROM projects
--    WHERE "aeOwnerId" IS NULL ORDER BY "createdAt" DESC;
