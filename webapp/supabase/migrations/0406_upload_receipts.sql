-- ============================================================
--  Migration 0406: ทะเบียนใบรับการอัปโหลด (upload_receipts) — "ไฟล์ Drive ใบนี้ ใครอัปขึ้นมา เมื่อไร"
--  มติเจ้าของ 08/10/2569
--
--  🐞 ทำไมต้องมี: `driveFileId` ของไฟล์แนบ **มาจาก client** ตอนบันทึกแถว (POST /api/attachments) และตอนถอย
--     การอัป (DELETE /api/upload) — ไม่มีที่ไหนจดว่า id นั้นเป็นไฟล์ที่คนเรียก **อัปขึ้นมาเองจริง** ⇒ คนที่ล็อกอินแล้ว
--     ส่ง id ของไฟล์คนอื่น (สัญญาที่เซ็นแล้ว · บัตรประชาชนลูกค้า · โฟลเดอร์ลูกค้าทั้งโฟลเดอร์) มาได้ แล้ว
--     ① เปิดอ่านไฟล์นั้นผ่านแถวของตัวเอง ② ให้ระบบทิ้งไฟล์นั้นลงถังขยะ Drive ตอนลบแถว/ตอนถอยการอัป
--
--  ⭐ หนึ่งแถว = หนึ่งไฟล์ที่ server อัปขึ้น Drive เอง — เขียนจากสองจุดเท่านั้น: POST /api/upload/commit และ
--     ขา Drive ของ POST /api/upload · id มาจาก Drive (ไม่ใช่จากคำขอ) ⇒ คนเรียกออกใบรับให้ไฟล์ที่ตัวเองไม่ได้อัปไม่ได้
--  ⭐ "userId" เป็น text — id ผู้ใช้ทั้งระบบเป็น text (uuid ของ Supabase Auth เก็บเป็นตัวหนังสือ · บัญชีทดสอบในเครื่อง
--     คือ 'local-dev') · "entityType"/"entityId" คือค่าที่ client ส่งมาตอนอัป **ยังไม่ผ่านด่านสิทธิ์ใด** — จดไว้ดู
--     ย้อนหลังเท่านั้น ห้ามใช้เป็นหลักฐานว่าไฟล์เป็นของระเบียนไหน
--  ⭐ "claimedBy"/"claimedAt" — ปลายทางที่เอาไฟล์ไปเก็บแล้วประทับไว้ (เช่น 'attachments:<id แถว>') ⇒ ใบรับที่ถูก
--     ประทับแล้วใช้แนบซ้ำไม่ได้ และถอยการอัปไม่ได้ · ว่าง = ยังไม่มีปลายทางไหนรับไป
--  ⭐ ใบรับ **ไม่ถูกลบ** ในรอบนี้ (ราวหนึ่งแถวต่อการอัปหนึ่งครั้ง · อ่านด้วย primary key ทุกครั้ง) — อายุ 24 ชั่วโมง
--     ตัดสินตอนอ่านที่ lib/upload/receipts.js ไม่ใช่ด้วยการลบแถว · ดัชนี "createdAt" เตรียมไว้ให้งานเก็บกวาดภายหลัง
--  ⭐ ตารางฝั่ง server ล้วน — เปิด RLS โดย **ไม่มี policy** + ถอนสิทธิ์ PUBLIC/anon/authenticated ⇒ เข้าได้ทางเดียวคือ
--     service_role (เบราว์เซอร์อ่าน/ออกใบรับเองไม่ได้)
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ⚠ **รันก่อนเปิด PR ให้ CI เขียว / ก่อน merge / ก่อน deploy โค้ด** — ไฟล์นี้เข้ากันได้กับโค้ดที่ deploy อยู่
--     (โค้ดเก่าไม่แตะตารางนี้เลย) แต่กลับกันไม่ได้: โค้ดใหม่บนฐานที่ยังไม่มีตาราง = ออกใบรับไม่ได้ ⇒ แนบไฟล์
--     ตอบ 503 "ตรวจที่มาของไฟล์ไม่ได้" ทุกครั้ง · และ check:columns ใน CI เทียบกับฐานจริง ⇒ PR แดงจนกว่าจะรัน
--  ⚠ รันซ้ำได้ (IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS + ADD) — แถวเดิมอยู่ครบ
--  ⭐ ไม่มี backfill — ใบรับมีเฉพาะไฟล์ที่อัปหลัง deploy (แถว attachments เดิมไม่ถูกตรวจย้อนหลัง)
-- ============================================================

BEGIN;

-- ── ① ตาราง ────────────────────────────────────────────────────────────────
-- ⚠️ primary key = id ไฟล์บน Drive: การอัปหนึ่งครั้งได้ไฟล์ใหม่หนึ่งใบเสมอ ⇒ id ซ้ำ (23505) = ผิดปกติ ต้องเป็น error
--    ห้ามเปลี่ยนเป็น upsert (จะเขียนทับชื่อผู้อัปของใบรับเดิม)
CREATE TABLE IF NOT EXISTS public.upload_receipts (
  "driveFileId" text PRIMARY KEY,
  "userId"      text NOT NULL,
  "entityType"  text,
  "entityId"    text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "claimedBy"   text,
  "claimedAt"   timestamptz
);

-- ตารางที่ถูกสร้างไว้ก่อนด้วยร่างรุ่นแรก (ยังไม่มีสองช่องประทับ) — เติมให้ครบ
ALTER TABLE public.upload_receipts
  ADD COLUMN IF NOT EXISTS "claimedBy" text,
  ADD COLUMN IF NOT EXISTS "claimedAt" timestamptz;

-- ── ② รูปร่างของค่า ─────────────────────────────────────────────────────────
-- รูปเดียวกับ `DRIVE_FILE_ID_PATTERN` ของ lib/upload/receipts.js (เทสต์เทียบตัวหนังสือให้) — `,` `)` `.` ช่องว่าง
-- ต้องไม่มีทางลงตาราง เพราะค่านี้ถูกต่อเข้าตัวกรองของ PostgREST ที่ปลายทางอื่น
-- ⚠️ ตั้งชื่อ constraint เอง + DROP/ADD — CHECK ที่ประกาศในบรรทัด CREATE TABLE IF NOT EXISTS จะไม่ซ่อมตารางที่มีอยู่แล้ว
ALTER TABLE public.upload_receipts DROP CONSTRAINT IF EXISTS upload_receipts_file_id_check;
ALTER TABLE public.upload_receipts
  ADD CONSTRAINT upload_receipts_file_id_check
  CHECK ("driveFileId" ~ '^[A-Za-z0-9_-]{1,200}$');

ALTER TABLE public.upload_receipts DROP CONSTRAINT IF EXISTS upload_receipts_user_check;
ALTER TABLE public.upload_receipts
  ADD CONSTRAINT upload_receipts_user_check
  CHECK (length("userId") BETWEEN 1 AND 200);

-- ── ③ ดัชนี ─────────────────────────────────────────────────────────────────
-- ทุกจุดอ่านวันนี้ใช้ primary key · ดัชนีนี้ไว้ให้งานเก็บกวาดใบรับเก่า (ยังไม่มี — ดูหัวไฟล์)
CREATE INDEX IF NOT EXISTS upload_receipts_created_idx
  ON public.upload_receipts ("createdAt");

COMMENT ON TABLE public.upload_receipts IS
  'ใบรับการอัปโหลด: ใคร (userId) อัปไฟล์ Drive ใบไหนเมื่อไร และปลายทางไหนรับไปแล้ว (claimedBy) — เขียนโดย /api/upload และ /api/upload/commit เท่านั้น (0406)';

-- ── ④ สิทธิ์ ────────────────────────────────────────────────────────────────
ALTER TABLE public.upload_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.upload_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.upload_receipts TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'upload_receipts';                       -- 7
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.upload_receipts'::regclass
--    AND conname IN ('upload_receipts_file_id_check', 'upload_receipts_user_check');       -- 2 แถว
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.upload_receipts'::regclass;      -- true
-- SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'upload_receipts';   -- 0
-- SELECT has_table_privilege('anon', 'public.upload_receipts', 'SELECT'),
--        has_table_privilege('authenticated', 'public.upload_receipts', 'INSERT'),
--        has_table_privilege('service_role', 'public.upload_receipts', 'INSERT');          -- f · f · t
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- ⚠️ ถอยโค้ดก่อนเสมอ — โค้ดใหม่บนฐานที่ไม่มีตารางนี้ = แนบไฟล์ตอบ 503 ทุกครั้ง
--    (สวิตช์ UPLOAD_RECEIPT_MODE=observe:<วันที่> ผ่อนได้เฉพาะด่านใบรับตอนแนบ และต้อง redeploy)
-- ⚠️ ใบรับทั้งหมด **หายถาวร** — ไฟล์ที่อัปแล้วยังไม่ได้แนบต้องอัปใหม่ (ตัวไฟล์บน Drive และแถว attachments ไม่ถูกแตะ)
-- DROP TABLE IF EXISTS public.upload_receipts;
-- NOTIFY pgrst, 'reload schema';
