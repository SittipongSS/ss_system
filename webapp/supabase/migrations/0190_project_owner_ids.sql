-- ============================================================
--  Migration 0190: projects."aeOwnerId" / "acOwnerId" — ตัวตนของผู้ดูแลโครงการ
--
--  ที่มา: `aeOwner`/`acOwner` เก็บเป็น **ชื่อคน** มาแต่ไหนแต่ไร ซึ่งใช้ได้ดีตอน
--  พิมพ์ลงเอกสาร แต่ใช้เป็น "ตัวตน" ไม่ได้ — พอเธรดโครงการ (PR #863) ต้องรู้ว่า
--  จะแจ้งเตือน *ใคร* มันต้องเปิดสมุดรายชื่อมาเดาจากชื่อ แล้วเดาไม่ออกเป็นส่วนใหญ่:
--
--    ตรวจ prod 2026-08-01 — โครงการ 11 ใบ · จับคู่ชื่อกับบัญชีได้แค่ 3 ใบ
--      "Threerapong P."     (6 ใบ) ✗  บัญชีจริงชื่อ "Threerapong Phankam"
--      "Kantima T."         (2 ใบ) ✗  บัญชีจริงชื่อ "Kantima Thadatharakiat"
--      "Sittipong Kaenthaw" (2 ใบ) ✓
--      "Sunichacha Roitiean"(1 ใบ) ✓
--    ⇒ 8/11 = 73% ไม่มีทางได้รับแจ้งเตือนเลย และเงียบโดยไม่มีอะไรฟ้อง
--
--  ⚠ **เพิ่มคอลัมน์ ไม่ใช่แทนที่** — `aeOwner`/`acOwner` ยังอยู่และยังเป็นของจริง
--  สำหรับเอกสารที่พิมพ์ออกไป (ganttPrint · dealTimelineDocument ·
--  ProjectDocumentView · issuedQuotationSnapshot) ซึ่งต้องเป็นชื่อ **ณ เวลาที่ออก
--  เอกสาร** ถ้าเปลี่ยนไป render จาก id ชื่อบนเอกสารเก่าจะขยับตามคนเปลี่ยนชื่อ/ลาออก
--  แพตเทิร์นเดียวกับ sales_deals ที่เก็บทั้ง `ownerId` และ `ownerName` (snapshot)
--
--  ⚠ ไม่มี FK ไป auth.users ตามธรรมเนียมของสคีมานี้ (ผู้ใช้อยู่ใน Supabase Auth
--    ไม่ใช่ public.users) — บัญชีถูกลบแล้ว id ค้างได้ ผู้อ่านต้องทนค่าที่จับคู่ไม่เจอ
--
--  additive ล้วน รันซ้ำได้ · **รันก่อน deploy ได้เลย** (โค้ดเก่าไม่รู้จักคอลัมน์นี้
--  ก็ทำงานเหมือนเดิมทุกอย่าง)
-- ============================================================

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "aeOwnerId" text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "acOwnerId" text;

COMMENT ON COLUMN public.projects."aeOwnerId" IS
  'บัญชีผู้ใช้ของผู้ดูแล (AE) — ตัวตนจริงสำหรับแจ้งเตือน/สิทธิ์ · ชื่อบนเอกสารใช้ aeOwner';
COMMENT ON COLUMN public.projects."acOwnerId" IS
  'บัญชีผู้ใช้ของผู้ประสานงาน (AC) — ตัวตนจริงสำหรับแจ้งเตือน/สิทธิ์ · ชื่อบนเอกสารใช้ acOwner';

-- ── backfill จากชื่อที่มีอยู่ ────────────────────────────────────────────
--  จับคู่สองแบบ แล้ว **อัปเดตเฉพาะแถวที่จับได้บัญชีเดียวเท่านั้น**:
--    1) ชื่อตรงกันเป๊ะ                       "Sittipong Kaenthaw"
--    2) ชื่อย่อ "ชื่อต้น + อักษรแรกนามสกุล."  "Threerapong P." → "Threerapong Phankam"
--  ชื่อที่ตรงได้หลายบัญชี = ปล่อยว่างไว้ (เดาผิดแล้วแจ้งเตือนไปผิดคนแย่กว่าไม่แจ้ง)
--
--  ⚠ ใช้กับแถวที่ยังว่างเท่านั้น — รันซ้ำจะไม่ทับค่าที่คนแก้ไว้ทีหลัง
DO $$
DECLARE
  ae_filled int;
  ac_filled int;
  ae_left   int;
  ac_left   int;
BEGIN
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
  ),
  uniq AS (
    SELECT pid, min(uid) AS uid FROM hit GROUP BY pid HAVING count(DISTINCT uid) = 1
  )
  UPDATE public.projects p SET "aeOwnerId" = uniq.uid
  FROM uniq WHERE p.id = uniq.pid;
  GET DIAGNOSTICS ae_filled = ROW_COUNT;

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
      a.full_name = btrim(p."acOwner")
      OR (
        btrim(p."acOwner") ~ '^[^ ]+ [A-Za-z]\.$'
        AND split_part(a.full_name, ' ', 1) = split_part(btrim(p."acOwner"), ' ', 1)
        AND left(split_part(a.full_name, ' ', 2), 1) = left(split_part(btrim(p."acOwner"), ' ', 2), 1)
      )
    )
    WHERE p."acOwnerId" IS NULL AND btrim(coalesce(p."acOwner", '')) <> ''
  ),
  uniq AS (
    SELECT pid, min(uid) AS uid FROM hit GROUP BY pid HAVING count(DISTINCT uid) = 1
  )
  UPDATE public.projects p SET "acOwnerId" = uniq.uid
  FROM uniq WHERE p.id = uniq.pid;
  GET DIAGNOSTICS ac_filled = ROW_COUNT;

  SELECT count(*) INTO ae_left FROM public.projects
   WHERE btrim(coalesce("aeOwner", '')) <> '' AND "aeOwnerId" IS NULL;
  SELECT count(*) INTO ac_left FROM public.projects
   WHERE btrim(coalesce("acOwner", '')) <> '' AND "acOwnerId" IS NULL;

  -- ไม่ raise exception: ชื่อที่จับคู่ไม่ได้ = คนลาออก/พิมพ์เอง ซึ่งเป็นเรื่องปกติ
  -- และไม่ควรบล็อกการรัน — แค่ต้องรู้ตัวเลขว่าเหลือเท่าไรให้ตามเก็บด้วยมือ
  RAISE NOTICE 'backfill aeOwnerId: % แถว (เหลือจับคู่ไม่ได้ %)', ae_filled, ae_left;
  RAISE NOTICE 'backfill acOwnerId: % แถว (เหลือจับคู่ไม่ได้ %)', ac_filled, ac_left;
END $$;

-- คิวรีตรวจหลังรัน (คัดลอกไปรันเองได้):
--   SELECT code, "aeOwner", "aeOwnerId", "acOwner", "acOwnerId" FROM projects ORDER BY "createdAt" DESC;
