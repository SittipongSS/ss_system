-- ============================================================
--  Migration 0350: บรีฟกลิ่นมีเจ้าของ — แจกงานให้ผู้ปรุงทีละกลิ่น (มติผู้ใช้ 2026-09-08)
--
--  คำสั่งตั้งต้น: *"อยากทำ ตารางงาน perfumer"* → เลือกแบบ **แจกงานรายกลิ่น** ·
--  หัวหน้าแจก · perfumer ดูอย่างเดียว · และกติกาของเจ้าของกลิ่น (ถ้อยคำผู้ใช้):
--  *"PDR - Perfumer คนไหน ดูแล คนนั้นคือ เจ้าของกลิ่น ซึ่ง สามารถ เปลี่ยนได้
--  จนกว่า จะส่งกลิ่น"*
--
--  ⭐ **ทำไมต้องมีช่องนี้ทั้งที่มี `dept_requests."pdrSignPerfumer"` อยู่แล้ว**
--  ช่องผู้เซ็นบนหัวใบถูกเลือก **ครั้งเดียวทั้งใบ** ตอนกดรับเรื่อง (#1556) แล้วตอนส่งงาน
--  `createScent` วนทุกแถวด้วยค่าตัวเดียวกันหมด ⇒ ใบที่มีหลายกลิ่นแจกให้คนละคนปรุง
--  ทะเบียนจะบันทึกว่าคนเดียวปรุงทั้งใบ · วัดจาก production 2026-09-08: ใบพัฒนากลิ่น
--  ที่เปิดอยู่ 20 ใบมีบรีฟรวม 28 ก้อน (สูงสุด 4 ก้อนต่อใบ) แต่กรอกช่องผู้เซ็นไว้
--  แค่ 5 ใบจาก 92 ⇒ ทั้งคิวงานและทะเบียนตอบ "ใครปรุงกลิ่นนี้" ไม่ได้
--
--  ⭐ **นี่คือ "เจ้าของกลิ่น" ไม่ใช่ "ผู้รับผิดชอบใบ"** — คนละแกนกับ `assigneeId`
--  ของ `dept_requests` (mig 0230 · จัดคนระดับ *ใบ*) · ใบหนึ่งมีผู้รับผิดชอบคนเดียว
--  แต่มีเจ้าของกลิ่นได้เท่าจำนวนบรีฟ ⇒ ต้องอยู่บนแถวบรีฟ ไม่ใช่บนหัวใบ
--
--  ⭐ **ชื่อ + id คู่กัน แบบเดียวกับทั้งระบบ** (`ownerId`/`ownerName` ·
--  `acknowledgedById`/`acknowledgedByName` · `assigneeId`/`assigneeName`) —
--  ไม่มี FK เพราะผู้ใช้อยู่ใน Supabase Auth (`auth.users`) ไม่ใช่สคีมาเรา
--  ⚠️ **ต่างจาก `scents."perfumerName"` (mig 0333) ตรงที่ตัวนี้ "สด" ไม่ใช่ "แช่แข็ง"**
--  ของบนทะเบียนกลิ่นคือข้อเท็จจริงว่าใครปรุงกลิ่นนั้น ณ ตอนนั้น ห้ามเปลี่ยนตามบัญชี ·
--  ส่วนตัวนี้คือ **การมอบหมายงานที่ยังไม่จบ** ซึ่งเปลี่ยนมือได้จนกว่าจะส่งกลิ่น
--  ⇒ ตอนส่งงาน ชื่อจะถูก **ก๊อปไปแช่แข็ง** ที่ `scents."perfumerName"` (ถอยไปใช้
--  `pdrSignPerfumer` ของหัวใบเมื่อกลิ่นก้อนนั้นไม่ได้ถูกแจก) · หลังจากนั้นแก้ที่นี่
--  ไม่กระทบทะเบียนอีก ซึ่งเป็นเหตุผลที่ **จอปิดปุ่มแจกทันทีที่กลิ่นก้อนนั้นถูกส่ง**
--
--  ⚠️ **`assignedAt` บังคับเมื่อมีคนถือ** — กติกาเดียวกับ mig 0230: ถ้าเขียน id ลงไป
--  ได้โดยไม่มีตราเวลา คำถาม "กลิ่นก้อนนี้อยู่ในมือคนนี้มากี่วันแล้ว" จะตอบไม่ได้
--  ⇒ CHECK คุมไว้ที่ฐาน และฝั่งโค้ดคืนครบทุกช่องเสมอ (`briefPerfumerPatch`)
--
--  ⚠️ **ไม่ backfill โดยตั้งใจ** — ไม่มีแหล่งไหนบอกได้ว่าบรีฟเก่าใครปรุง · เดาจาก
--  `pdrSignPerfumer` ไม่ได้เพราะนั่นคือค่าระดับ *ใบ* ซึ่งเป็นสาเหตุของปัญหาตั้งแต่ต้น
--  (บทเรียนเดียวกับ mig 0333 ที่ปฏิเสธการ backfill จาก `ownerId`)
--
--  additive ล้วน · ไม่แตะข้อมูลเดิม · รันซ้ำได้
--  🛑 **ต้องรันก่อน deploy โค้ด** — `/api/rd/perfumer-board` ระบุคอลัมน์ใหม่ใน
--     `.select()` ⇒ PostgREST ตอบ 400 ทั้ง route จนกว่าจะรัน (และ CI บน main มีด่าน
--     `check:columns` ที่เทียบกับสคีมาจริงบน production ⇒ merge ก่อนรัน = main แดง
--     ซึ่งบล็อก deploy ทุกตัวต่อจากนั้น)
--  ⚠️ รันมือบน Supabase SQL Editor (DDL รันผ่าน PostgREST ไม่ได้)
--  ⚠️ รันซ้ำได้
-- ============================================================

BEGIN;

ALTER TABLE public.dept_request_scents
  ADD COLUMN IF NOT EXISTS "perfumerId"     text,
  ADD COLUMN IF NOT EXISTS "perfumerName"   text,
  ADD COLUMN IF NOT EXISTS "assignedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "assignedById"   text,
  ADD COLUMN IF NOT EXISTS "assignedByName" text;

-- ── ความยาวชื่อ — ต้องไม่หลวมกว่าที่ฝั่งโค้ดคุมไว้ (MAX_PERFUMER_NAME = 200) ──
-- ⚠️ หลวมกว่าเมื่อไร ผู้ใช้จะเจอ error ดิบของ Postgres แทนข้อความไทยของ handler
-- (บทเรียนเดียวกับ LIMITS ใน lib/requests/scentBriefs.js)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_scents_perfumer_name_len'
  ) THEN
    ALTER TABLE public.dept_request_scents
      ADD CONSTRAINT dept_request_scents_perfumer_name_len
      CHECK ("perfumerName" IS NULL OR length(btrim("perfumerName")) BETWEEN 1 AND 200);
  END IF;
END $$;

-- ── มีคนถือ = ต้องมีตราเวลาเสมอ (กติกาเดียวกับ mig 0230) ────────────────────
-- ⚠️ ครอบทั้ง id และชื่อ — กลิ่นเก่าที่กรอกชื่อคนไม่มีบัญชีก็ยังต้องมีวันที่แจก
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_scents_assigned_at_required'
  ) THEN
    ALTER TABLE public.dept_request_scents
      ADD CONSTRAINT dept_request_scents_assigned_at_required
      CHECK (("perfumerId" IS NULL AND "perfumerName" IS NULL) OR "assignedAt" IS NOT NULL);
  END IF;
END $$;

/* ── ดัชนีของคำถามเดียวที่ตารางนี้ยังตอบไม่ได้: "กลิ่นของคนนี้มีอะไรบ้าง" ──────
   ⚠️ ดัชนีเดิมมีตัวเดียว (`requestId`, `sortOrder`) ⇒ การกรองรายคนเป็น seq scan
   บนตารางที่โตตามธุรกรรมไปเรื่อย ๆ
   ⚠️ partial — แถวที่ยังไม่ถูกแจกเป็นส่วนใหญ่และไม่มีใครค้นด้วย NULL */
DROP INDEX IF EXISTS dept_request_scents_perfumer_idx;
CREATE INDEX dept_request_scents_perfumer_idx
  ON public.dept_request_scents ("perfumerId")
  WHERE "perfumerId" IS NOT NULL;

COMMENT ON COLUMN public.dept_request_scents."perfumerId" IS
  'mig 0350 · id ผู้ใช้ของเจ้าของกลิ่นก้อนนี้ — ตัวที่ใช้กรอง/นับงานรายคน';
COMMENT ON COLUMN public.dept_request_scents."perfumerName" IS
  'mig 0350 · ชื่อเจ้าของกลิ่น ณ ตอนแจก — เปลี่ยนมือได้จนกว่าจะส่งกลิ่น แล้วถูกก๊อปไปแช่แข็งที่ scents."perfumerName"';
COMMENT ON COLUMN public.dept_request_scents."assignedAt" IS
  'mig 0350 · เวลาที่แจกงานครั้งล่าสุด — บังคับมีเมื่อมีคนถือ (CHECK) เพื่อตอบว่าอยู่ในมือคนนี้มากี่วัน';
COMMENT ON COLUMN public.dept_request_scents."assignedById" IS
  'mig 0350 · id ของหัวหน้าที่กดแจก';
COMMENT ON COLUMN public.dept_request_scents."assignedByName" IS
  'mig 0350 · ชื่อหัวหน้าที่กดแจก ณ ตอนนั้น';

COMMIT;

NOTIFY pgrst, 'reload schema';
