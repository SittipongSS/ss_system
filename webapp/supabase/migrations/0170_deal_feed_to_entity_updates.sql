-- 0170 - ย้ายฟีดความเคลื่อนไหวของดีลมาเธรดกลาง (entity_updates, mig 0163)
--
-- ⚠️ ไฟล์นี้เคยชื่อ `0169_deal_feed_to_entity_updates.sql` — ชนกับ
--    `0169_sales_order_reissue_after_cancel.sql` ที่ merge เข้ามาก่อน (โหมดพังประจำ:
--    สอง PR แยกกิ่งจากจุดเดียวกันแล้วต่างคนต่างจองเลขถัดไป — ครั้งที่ 3 แล้ว)
--    ขยับเลขตัวที่ merge ทีหลังตามกฎเดิม · **ไม่ต้องรันซ้ำถ้ารันในชื่อเดิมไปแล้ว**
--    และถึงรันซ้ำก็ปลอดภัย: idempotent ทั้งไฟล์ (`WHERE NOT EXISTS`) และไม่มี DDL เลย
--
-- ขั้น 3b ของ docs/entity-updates-plan.md — ชุดที่ 3 ที่ย้ายมา (ต่อจากงานของฉัน 0163
-- และเคสขอราคา/ใบ CR ที่เกิดบนของกลางตั้งแต่ต้น)
--
-- ⭐ นับบน prod ก่อนเขียน (กฎของแผน §15 ห้ามเดา): `sales_deal_activities` = **0 แถว**
-- ทั้งที่มีดีล 144 ใบ — ช่องโพสต์เปิดอยู่แต่ไม่มีใครใช้เลย · การย้ายรอบนี้จึงแทบไม่มี
-- ความเสี่ยงด้านข้อมูล แต่ยังเขียน backfill ไว้ครบเพราะ:
--   1) dev/staging มีแถวได้
--   2) ถ้ามีคนโพสต์ระหว่างรอ deploy ต้องไม่หาย
--   3) รันซ้ำได้ (WHERE NOT EXISTS + คง id เดิม) → ปลอดภัยต่อการรันสองครั้ง
--
-- ตารางเก่า **ไม่ถูกลบใน migration นี้** — ค้างไว้เป็นตาข่ายกันตกจนกว่าจะย้ายครบทุกชุด
-- แล้วลบพร้อมกันทีเดียวที่ขั้นสุดท้ายของแผน
--
-- ⚠ รันมือบน Supabase SQL Editor

BEGIN;

-- ── แมป kind ───────────────────────────────────────────────────────────
-- ชื่อ kind ตรงกันทั้งชุด (note/call/meeting/email/next_step) จึงยกมาตรง ๆ ไม่ต้องแปลง
-- ฝั่งโค้ดประกาศชุดเดียวกันไว้ที่ UPDATE_KINDS.deal (lib/master/updateTypes.js) และ
-- ทั้งห้าตัวเป็น authorable = คนเลือกเองได้ตอนโพสต์ (เหมือนของเดิม)
--
-- ── คอลัมน์ที่ไม่มีที่อยู่ตรง ๆ ย้ายลง meta ─────────────────────────────
--   "dueDate"     → meta.dueDate      (ชนิด next_step กรอกได้ — ธง due ในทะเบียนโค้ด)
--   "activityAt"  → meta.activityAt   (เวลานัดจริง, mig 0091)
--   "meetingMode" → meta.meetingMode  (onsite_customer_visit/onsite_at_office/online)
--
-- ⚠️ activityAt/meetingMode เขียนได้แต่ทาง API เท่านั้น — ไม่มีหน้าจอไหนส่งค่ามาเลย
-- (กล่องโพสต์บนหน้าดีลส่งแค่ kind/body/dueDate/attachments) จึงยังเป็นคอลัมน์เปล่า
-- ที่ mig 0091 เตรียมไว้สำหรับปฏิทินนัดในอนาคต · ย้ายลง meta ไว้ให้ครบ ไม่ทิ้ง
-- แต่ก็ไม่สร้าง UI ให้ในรอบนี้ (ไม่มีข้อมูลจริงให้แสดง)
INSERT INTO public.entity_updates
  (id, "entityType", "entityId", kind, body, meta, attachments,
   "authorId", "authorName", "createdAt")
SELECT
  a.id,
  'deal',
  a."dealId",
  a.kind,
  -- body ของเดิมเป็น NOT NULL แต่เป็นสตริงว่างได้ (โพสต์รูปล้วน) — ว่างให้เป็น NULL
  -- ให้ตรงกับความหมายของตารางกลาง ที่ CHECK ยอมได้เพราะ kind ไม่เคยเป็น 'comment'
  nullif(btrim(a.body), ''),
  -- ใส่เฉพาะคีย์ที่มีค่าจริง (ไม่เก็บ null ค้างใน jsonb ให้คนอ่านเข้าใจผิดว่าเคยตั้ง)
  coalesce(
    (SELECT jsonb_object_agg(k, v)
       FROM jsonb_each(jsonb_build_object(
         'dueDate',     to_jsonb(a."dueDate"),
         'activityAt',  to_jsonb(a."activityAt"),
         'meetingMode', to_jsonb(a."meetingMode")
       )) AS kv(k, v)
      WHERE v IS NOT NULL AND v <> 'null'::jsonb),
    '{}'::jsonb
  ),
  coalesce(a.attachments, '[]'::jsonb),
  a."createdBy",
  a."createdByName",
  a."createdAt"
FROM public.sales_deal_activities a
WHERE NOT EXISTS (
  SELECT 1 FROM public.entity_updates e WHERE e.id = a.id
);

COMMIT;

-- ตรวจหลังรัน: สองเลขต้องเท่ากัน (ถ้าไม่เท่า อย่าลบตารางเก่าเด็ดขาด)
--   SELECT count(*) FROM sales_deal_activities;
--   SELECT count(*) FROM entity_updates WHERE "entityType" = 'deal';

NOTIFY pgrst, 'reload schema';
