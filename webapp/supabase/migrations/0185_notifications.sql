-- ============================================================
--  Migration 0185: notifications — แจ้งเตือน "รายคน" ในแอป
--
--  ที่มา (มติผู้ใช้ 2026-07-28 ข้อ 14–15): ระบบ**ไม่มีแจ้งเตือนในแอปเลย** มีแต่
--  Chat webhook ที่ยิงเข้า**ห้องรวมของฝ่าย** (8 space ใน lib/chat.js) ซึ่ง
--    · บอกไม่ได้ว่า "ใคร" ต้องทำ (ทุกคนในห้องเห็นข้อความเดียวกัน)
--    · ไม่รู้ว่าใครอ่านแล้ว
--    · ไม่ได้อยู่ในแอป — ต้องสลับไป Chat แล้วกดลิงก์กลับเข้ามา
--  ⇒ ตอนนี้มี 8 entity ที่ใช้เธรดกลาง (mig 0163 → 0184) โพสต์แล้ว **ไม่มีใครรู้ว่า
--    มีของใหม่** จนกว่าจะเผลอเปิดหน้านั้นเจอเอง · ตารางนี้ปิดช่องว่างนั้น
--
--  ⚠ Chat webhook **ไม่ถูกแทนที่** — ยังรับงาน "งานใหม่เข้าคิวฝ่าย" ซึ่งเป็นคนละ
--    หน้าที่: webhook = ประกาศให้ฝ่าย · notifications = งานของ *คุณ* คนเดียว
--
--  ── ออกแบบ (มติ 14) ────────────────────────────────────────────────────
--  · fan-out **1 ผู้รับ = 1 แถว** (ไม่ใช่ 1 เหตุการณ์ + ตารางผู้อ่าน) — ตัวนับ
--    "ยังไม่อ่าน" กลายเป็น count ธรรมดา ไม่ต้อง join และลบทิ้งรายคนได้
--  · ⚠ **ห้ามใช้ "ทุกคนในฝ่าย" เป็นผู้รับ** — ซ้ำกับ webhook แล้วกล่องจะตายใน
--    1 สัปดาห์ (คนเลิกอ่านเพราะ 90% ไม่เกี่ยวกับตัวเอง) · กฎผู้รับอยู่ที่เดียว
--    ใน `UPDATE_ENTITIES[...].recipients` (lib/master/updateAccess.js)
--  · (มติ 15) ตัวนับยังไม่อ่าน = `readAt IS NULL` ของตารางเดียวกัน ไม่มีกลไกแยก ·
--    **ตั้งใจไม่ทำ watermark ต่อเธรดต่อคนแบบ Slack** (เส้นคั่น "ข้อความใหม่")
--    แพงและได้เพิ่มน้อย → เปิดเธรด = mark read ทั้ง entity ก้อนเดียว
--
--  ⚠ ไม่มี FK ไป entity_updates/users โดยเจตนา — ตรงกับความสัมพันธ์อื่นในระบบนี้
--    ([[no-real-fk-constraints]]) และผู้ใช้อยู่ใน Supabase Auth ไม่ใช่ public.users
--    ลบเธรด/ลบ entity → ผู้เรียกเก็บกวาดเอง (purgeNotifications คู่กับ purgeUpdates)
--
--  additive ล้วน รันซ้ำได้ · ตารางใหม่ทั้งก้อน = **รันก่อน deploy ได้เลย**
--  (ยังไม่รัน = กระดิ่งขึ้น 0 ตลอด แต่ไม่มีอะไรพัง — API จับ error แล้วตอบว่าง)
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id            text PRIMARY KEY,
  -- ผู้รับ = auth user id (app_metadata อยู่ที่ Supabase Auth ไม่มี public.users)
  "userId"      text NOT NULL,
  -- เธรด/เอกสารต้นทาง — ชุดค่าเดียวกับ entity_updates."entityType"
  -- (ทะเบียนอยู่ในโค้ด: lib/master/updateAccess.js · ไม่ใส่ CHECK เพราะเพิ่ม entity
  --  ใหม่จะต้องออก migration ทุกครั้ง — แพตเทิร์นเดียวกับ entity_updates)
  "entityType"  text NOT NULL,
  "entityId"    text NOT NULL,
  -- แถวใน entity_updates ที่ทำให้เกิดแจ้งเตือนนี้ (null = แจ้งเตือนที่ไม่ได้มาจากเธรด)
  "updateId"    text,
  kind          text NOT NULL DEFAULT 'thread_update',
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  body          text CHECK (body IS NULL OR length(body) <= 500),
  -- ที่จะกดไป (path ภายในแอป) — เก็บไว้ตอนสร้างเพราะหน้ากล่องแจ้งเตือนไม่ควรต้อง
  -- รู้จัก routing ของทุกโมดูล
  href          text,
  "actorName"   text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "readAt"      timestamptz
);

-- กันแจ้งเตือนซ้ำเมื่อ fan-out ถูกเรียกซ้ำ (retry/รันซ้ำ) — คนเดียวกัน + เหตุการณ์
-- เดียวกัน = แถวเดียวเท่านั้น
--
-- 🪤 **ห้ามทำเป็น partial index (`WHERE "updateId" IS NOT NULL`)** ทั้งที่ดูสมเหตุผล:
-- fan-out ใช้ `upsert(..., { onConflict: 'userId,updateId' })` ซึ่งกลายเป็น
-- `ON CONFLICT ("userId","updateId") DO NOTHING` — PostgreSQL จะ**เลือก partial
-- unique index มาเป็น arbiter ไม่ได้** ถ้าคำสั่งไม่มี WHERE ที่ครอบ predicate ของ
-- index (และ PostgREST ไม่มีทางส่ง WHERE นั้นมา) → ทุกครั้งที่ fan-out จะได้
-- "no unique or exclusive constraint matching the ON CONFLICT specification"
-- แล้วแจ้งเตือน **ไม่ถูกเขียนเลยสักแถว** โดยเงียบ (ตัวเรียกกลืน error เป็น log)
--
-- ไม่ต้อง partial อยู่แล้ว: Postgres ถือว่า NULL ไม่ซ้ำกับ NULL → แถวที่
-- `updateId IS NULL` (แจ้งเตือนที่ไม่ได้มาจากเธรด) ยังมีได้หลายแถวต่อคนตามเดิม
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_update_uk
  ON public.notifications ("userId", "updateId");

-- ตัวนับ "ยังไม่อ่าน" ของกระดิ่ง — partial index อ่านเฉพาะแถวที่ยังไม่อ่าน
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications ("userId") WHERE "readAt" IS NULL;
-- รายการในกล่อง (ใหม่ก่อน)
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications ("userId", "createdAt" DESC);
-- เปิดเธรด = mark read ทั้ง entity ก้อนเดียว (มติ 15)
CREATE INDEX IF NOT EXISTS notifications_thread_idx
  ON public.notifications ("entityType", "entityId");

-- RLS: ปิดทางตรงทั้งหมด เข้าถึงผ่าน service_role ของ API เท่านั้น (กติกาเดิมทั้งระบบ)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
GRANT  ALL ON TABLE public.notifications TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
--   SELECT to_regclass('public.notifications');            -- ต้องไม่เป็น NULL
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='notifications' ORDER BY 1;
--   -- ต้องได้ 5 แถว: pkey + notifications_thread_idx + notifications_unread_idx
--   --                + notifications_user_created_idx + notifications_user_update_uk
--
-- Rollback: DROP TABLE public.notifications;  (ไม่มีใครอ้างถึง — ไม่มี FK)
