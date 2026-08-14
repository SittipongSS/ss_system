-- ============================================================
--  Migration 0256: projects."aeSupervisorId" — ตัวตนของผู้ตรวจสอบ
--                  + ปลดระวาง "keyAccountExec"
--
--  โครงการมีคนสามฝ่าย (ต่างจากดีลที่มีเจ้าของคนเดียว): ผู้ดูแล (AE) · ผู้ประสานงาน (AC)
--  · ผู้ตรวจสอบ (AE Supervisor) — สองฝ่ายแรกมีคู่ ชื่อ+id แล้ว (mig 0190) แต่ฝ่ายที่สาม
--  ยังเป็น `text` เปล่า ๆ ตั้งแต่ mig 0008 ⇒
--    · หัวหน้าที่ถูกระบุบนหัวโครงการ **ไม่เคยได้รับแจ้งเตือน** เลยสักครั้ง
--      (lib/master/updateAccess.js ส่งตาม id เท่านั้น ซึ่งช่องนี้ไม่มี)
--    · เปลี่ยนชื่อบัญชีแล้วชื่อบนใบค้างเป็นชื่อเก่า
--    · ถามว่า "โครงการที่ฉันต้องตรวจมีอะไรบ้าง" ไม่ได้ เพราะไม่มี id ให้กรอง
--
--  ⚠ **เพิ่มคอลัมน์ ไม่ใช่แทนที่** — `aeSupervisor` (ชื่อ) ยังเป็นของจริงสำหรับเอกสาร:
--    หน้าออกใบเสนอราคาอ่าน `project.aeSupervisor` มาตั้งต้นช่องผู้ตรวจสอบบนใบ
--    (src/app/sales-planning/quotations/new/page.js) แพตเทิร์นเดียวกับ mig 0190
--  ⚠ ไม่มี FK ไป auth.users ตามธรรมเนียมของสคีมานี้
--
--  ── keyAccountExec ────────────────────────────────────────────────────────
--  ตรวจ 2026-08-14: คอลัมน์นี้ถูก **เขียนอย่างเดียว** (3 route เขียน '' หรือชื่อคนกด)
--  ไม่มีจอ เอกสาร หรือ query ไหนอ่านเลยสักที่ · ค่าที่ไม่มีใครอ่านคือค่าที่ไม่มีใคร
--  ดูแลให้ถูก แล้ววันหนึ่งจะมีคนหยิบไปใช้โดยเชื่อว่ามันเป็นของจริง ⇒ ตัดทิ้ง
--  (โค้ดที่เขียนถูกถอดออกในคอมมิตเดียวกัน — รัน migration นี้หลัง deploy ก็ได้
--   เพราะไม่มีใครอ่าน แต่ **ห้ามรันก่อน deploy** ไม่งั้น route เก่าที่ยังเขียนอยู่จะ
--   insert พัง: PostgREST ปฏิเสธทั้งก้อนเมื่อ body มีคอลัมน์ที่ไม่มีจริง)
--
--  additive + drop · รันซ้ำได้
-- ============================================================

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "aeSupervisorId" text;

COMMENT ON COLUMN public.projects."aeSupervisorId" IS
  'บัญชีผู้ใช้ของผู้ตรวจสอบ (AE Supervisor) — ตัวตนจริงสำหรับแจ้งเตือน/กรองงาน · ชื่อบนเอกสารใช้ aeSupervisor';

-- ── backfill จากชื่อที่มีอยู่ ────────────────────────────────────────────
--  กติกาจับคู่ชุดเดียวกับ 0190/0254/0255: ชื่อตรงเป๊ะ หรือชื่อย่อ "ชื่อ + อักษรแรก
--  นามสกุล." · อัปเดตเฉพาะแถวที่จับได้ **บัญชีเดียว** และบัญชีนั้นต้องเป็น
--  `ae_supervisor` จริง (ชื่อที่ตรงกับคนตำแหน่งอื่น = คนละคนกับผู้ตรวจสอบ)
DO $$
DECLARE
  filled  int;
  unmatched int;
BEGIN
  WITH acct AS (
    SELECT u.id::text AS uid, btrim(u.raw_user_meta_data->>'name') AS full_name
    FROM auth.users u
    WHERE coalesce(u.raw_app_meta_data->>'role', '') = 'ae_supervisor'
      AND btrim(coalesce(u.raw_user_meta_data->>'name', '')) <> ''
      AND NOT (u.banned_until IS NOT NULL AND u.banned_until > now())
  ),
  hit AS (
    SELECT p.id AS pid, a.uid
    FROM public.projects p
    JOIN acct a ON (
      a.full_name = btrim(p."aeSupervisor")
      OR (
        btrim(p."aeSupervisor") ~ '^[^ ]+ [A-Za-z]\.$'
        AND split_part(a.full_name, ' ', 1) = split_part(btrim(p."aeSupervisor"), ' ', 1)
        AND left(split_part(a.full_name, ' ', 2), 1) = left(split_part(btrim(p."aeSupervisor"), ' ', 2), 1)
      )
    )
    WHERE p."aeSupervisorId" IS NULL AND btrim(coalesce(p."aeSupervisor", '')) <> ''
  ),
  uniq AS (
    SELECT pid, min(uid) AS uid FROM hit GROUP BY pid HAVING count(DISTINCT uid) = 1
  )
  UPDATE public.projects p SET "aeSupervisorId" = uniq.uid
  FROM uniq WHERE p.id = uniq.pid;
  GET DIAGNOSTICS filled = ROW_COUNT;

  SELECT count(*) INTO unmatched FROM public.projects
   WHERE btrim(coalesce("aeSupervisor", '')) <> '' AND "aeSupervisorId" IS NULL;

  RAISE NOTICE 'เติม aeSupervisorId: % แถว · มีชื่อแต่จับคู่บัญชีไม่ได้: % แถว', filled, unmatched;
END $$;

-- ── ปลดระวางคอลัมน์ที่ไม่มีใครอ่าน ───────────────────────────────────────
ALTER TABLE public.projects DROP COLUMN IF EXISTS "keyAccountExec";

-- คิวรีตรวจหลังรัน (คัดลอกไปรันเองได้):
--   SELECT code, "aeSupervisor", "aeSupervisorId" FROM projects
--    WHERE btrim(coalesce("aeSupervisor", '')) <> '' ORDER BY "createdAt" DESC;
