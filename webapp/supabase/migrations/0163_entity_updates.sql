-- 0163 - เธรดอัปเดตของกลาง (entity_updates) — PR 1 ของ docs/entity-updates-plan.md
--
-- ระบบมีเธรด "ความเคลื่อนไหว" อยู่แล้ว 4 ชุด ต่างคนต่างทำ (sales_deal_activities 0063,
-- mgmt_updates 0080, inquiry_messages 0104, personal_task_updates 0113) ต่างกันจริงแค่
-- ชุด kind / ไฟล์แนบ / ความสามารถแก้-ลบ ที่เหลือเป็นโครงเดียวกันที่เขียนซ้ำสี่รอบ
-- ตารางนี้คือของกลางที่ทั้งสี่ (+ entity ใหม่) จะย้ายมาอยู่ทีละชุด
--
-- คนละหน้าที่กับ audit log และต้องอยู่คู่กัน:
--   audit   = ใครแก้อะไรเมื่อไร (หัวหน้าอ่านย้อนหลัง) — ลบไม่ได้เด็ดขาด
--   updates = เกิดอะไรขึ้น/ติดอะไร (ทุกคนที่เกี่ยวข้องอ่านระหว่างทำงาน) — เจ้าของลบของตัวเองได้
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

BEGIN;

CREATE TABLE IF NOT EXISTS public.entity_updates (
  id            text PRIMARY KEY,
  -- polymorphic แบบเดียวกับ attachments (0028) / mgmt_updates (0080):
  -- ไม่มี FK โดยเจตนา — entity อยู่คนละโมดูล ผู้ลบต้องเก็บกวาดเอง (purgeUpdates)
  "entityType"  text NOT NULL,
  "entityId"    text NOT NULL,
  -- ไม่มี CHECK: ชุด kind เป็นของแต่ละ entity ประกาศในโค้ด (lib/master/updateTypes.js)
  -- แพตเทิร์นเดียวกับ attachmentTypes/materialTypes — เพิ่มชนิดใหม่ = แก้โค้ดล้วน
  kind          text NOT NULL DEFAULT 'comment',
  body          text CHECK (body IS NULL OR length(body) <= 4000),
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {field,from,to} · {dueDate}
  -- ref ไฟล์ที่อัปผ่าน /api/upload แล้ว (แพตเทิร์นเดียวกับ sales_deal_activities 0083):
  -- รูปในข้อความเป็นของ "ข้อความนั้น" คนละความหมายกับไฟล์แนบของ entity (ตาราง attachments)
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb,
  "authorId"    text,
  "authorName"  text,
  "authorDept"  text,                                  -- ใช้แยกฝั่งถาม/ตอบในเธรดสองฝ่าย
  "editedAt"    timestamptz,
  "acknowledgedBy" text, "acknowledgedAt" timestamptz,
  -- soft delete: ข้อความที่คนอื่นอ่านไปแล้วเป็นหลักฐาน ลบจริงไม่ได้
  "deletedBy"   text, "deletedAt" timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  -- โพสต์เปล่าไม่มีความหมาย: ต้องมีข้อความ หรือไฟล์ หรือเป็นเหตุการณ์ระบบ
  CONSTRAINT entity_updates_not_empty CHECK (
    body IS NOT NULL OR jsonb_array_length(attachments) > 0 OR kind <> 'comment'
  )
);

CREATE INDEX IF NOT EXISTS entity_updates_entity_idx
  ON public.entity_updates ("entityType", "entityId", "createdAt" DESC);
-- ฟีดรวมข้ามโมดูล (my-dashboard / RD dashboard) — ของเดิมต้องยิงหลายตารางแล้วเย็บเอง
CREATE INDEX IF NOT EXISTS entity_updates_recent_idx
  ON public.entity_updates ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS entity_updates_author_idx
  ON public.entity_updates ("authorId", "createdAt" DESC);

ALTER TABLE public.entity_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.entity_updates FROM anon, authenticated;
GRANT  ALL ON TABLE public.entity_updates TO service_role;

-- ── ย้ายเธรด "งานของฉัน" (personal_task_updates, 0113) มาเป็นชุดแรก ──────────
-- คง id เดิม → รันซ้ำไม่เกิดแถวซ้ำ และตามรอยกลับตารางเก่าได้
-- ตารางเก่า **ไม่ถูกลบใน migration นี้** — ค้างไว้เป็นตาข่ายกันตกจนกว่าจะย้ายครบทุกชุด
INSERT INTO public.entity_updates
  (id, "entityType", "entityId", kind, body, meta, "authorId", "authorName", "createdAt")
SELECT
  u.id, 'personal_task', u."taskId", u.kind, u.body,
  COALESCE(u.meta, '{}'::jsonb),
  u."authorId", u."authorName", u."createdAt"
FROM public.personal_task_updates u
WHERE NOT EXISTS (SELECT 1 FROM public.entity_updates e WHERE e.id = u.id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน (ต้องเท่ากันทั้งสองคู่) ─────────────────────────────────────
-- SELECT (SELECT count(*) FROM personal_task_updates) AS เก่า,
--        (SELECT count(*) FROM entity_updates WHERE "entityType" = 'personal_task') AS ใหม่;
-- SELECT (SELECT count(DISTINCT "taskId")   FROM personal_task_updates) AS งานเก่า,
--        (SELECT count(DISTINCT "entityId") FROM entity_updates
--          WHERE "entityType" = 'personal_task') AS งานใหม่;
--
-- Rollback:
-- 1) revert โค้ด → หน้างานกลับไปอ่าน personal_task_updates ที่ยังครบทุกแถว
-- 2) อัปเดตที่โพสต์ระหว่างใช้ของกลาง copy กลับก่อน revert:
--    INSERT INTO personal_task_updates
--      (id,"taskId",kind,body,meta,"authorId","authorName","createdAt")
--    SELECT id,"entityId",kind,body,meta,"authorId","authorName","createdAt"
--    FROM entity_updates e WHERE e."entityType" = 'personal_task'
--      AND NOT EXISTS (SELECT 1 FROM personal_task_updates p WHERE p.id = e.id);
--    (ไฟล์แนบที่เพิ่งเปิดใช้จะหาย — ตารางเก่าไม่มีคอลัมน์นั้น ยอมรับได้ตอน rollback)
-- 3) DROP TABLE public.entity_updates;
