-- ============================================================
--  Migration 0201: ย้ายเหตุการณ์ "ดึงกลับ / กู้คืนร่าง" ของ QT/SO ขึ้นเธรดดีล
--
--  บริบท: ใบเสนอราคา/ใบสั่งขายไม่มีเธรดของตัวเองแล้ว (มติผู้ใช้ 2026-08-04) —
--  เหตุการณ์ของใบลงเธรดของดีลแม่ที่เดียว · เหตุการณ์เกือบทุกตัวมีเงาบนดีลอยู่แล้ว
--  ตั้งแต่ mig 0169 **ยกเว้น `withdraw` (ดึงกลับ) กับ `restore` (กู้คืนร่าง)**
--  ซึ่งเดิมตั้งใจไม่ส่งขึ้นดีล เพราะถือเป็นการบ้านภายในของคนทำใบ และยังอ่านได้ใน
--  เธรดของใบ
--
--  ⇒ พอเธรดของใบหายไป แถวเก่าพวกนั้นกลายเป็น **ข้อมูลที่ไม่มีใครมองเห็นอีกเลย**
--  ทั้งที่เป็นเหตุผลที่คนกรอกมือ (ณ วันตรวจ: QT ดึงกลับ 3 ครั้ง) — ไฟล์นี้ก๊อป
--  ขึ้นเธรดดีลด้วยรูปแบบเดียวกับที่โค้ดใหม่เขียน
--
--  ⚠ **ไม่ลบแถวเดิมของใบ** — เก็บไว้เป็นต้นฉบับ (มองไม่เห็นบนจอแต่ไม่ได้หาย)
--     ถ้าจะลบทีหลัง ให้ลบหลังยืนยันว่าแถวใหม่ครบแล้วเท่านั้น
--  ⚠ รันซ้ำได้: กันซ้ำด้วย meta->>'migratedFrom' ซึ่งชี้ id ของแถวต้นทาง
--  ⚠ รันมือบน Supabase SQL Editor
-- ============================================================

BEGIN;

-- ── ใบเสนอราคา ───────────────────────────────────────────────────────────
INSERT INTO public.entity_updates
  (id, "entityType", "entityId", kind, body, meta, attachments,
   "authorId", "authorName", "authorDept", "createdAt")
SELECT
  'EUP-' || gen_random_uuid(),
  'deal',
  q."dealId",
  'doc_withdraw',
  -- รูปแบบเดียวกับ dealDocumentUpdate: "<ใบ> <เลขที่> ถูกดึงกลับมาแก้ไข — <เหตุผล>"
  'ใบเสนอราคา ' || COALESCE(q."quoteNumber", e."entityId") || ' ถูกดึงกลับมาแก้ไข'
    || COALESCE(SUBSTRING(e.body FROM ' — .*$'), ' — ไม่ระบุเหตุผล'),
  jsonb_build_object(
    'docType', 'quotation', 'docId', e."entityId",
    'docNumber', q."quoteNumber", 'action', 'withdraw',
    'migratedFrom', e.id
  ),
  '[]'::jsonb,
  e."authorId", e."authorName", e."authorDept", e."createdAt"
FROM public.entity_updates e
JOIN public.quotations q ON q.id = e."entityId"
WHERE e."entityType" = 'quotation'
  AND e.kind = 'withdraw'
  AND e."deletedAt" IS NULL
  AND q."dealId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.entity_updates d
     WHERE d."entityType" = 'deal' AND d.meta->>'migratedFrom' = e.id
  );

-- ── ใบสั่งขาย (withdraw + restore ใช้ชนิดเดียวกันบนดีล) ──────────────────
INSERT INTO public.entity_updates
  (id, "entityType", "entityId", kind, body, meta, attachments,
   "authorId", "authorName", "authorDept", "createdAt")
SELECT
  'EUP-' || gen_random_uuid(),
  'deal',
  s."dealId",
  'doc_withdraw',
  'ใบสั่งขาย ' || COALESCE(s."orderNumber", e."entityId")
    || CASE WHEN e.kind = 'restore' THEN ' ถูกกู้คืนกลับเป็นร่าง'
            ELSE ' ถูกดึงกลับมาแก้ไข' || COALESCE(SUBSTRING(e.body FROM ' — .*$'), ' — ไม่ระบุเหตุผล')
       END,
  jsonb_build_object(
    'docType', 'sales_order', 'docId', e."entityId",
    'docNumber', s."orderNumber", 'action', e.kind,
    'migratedFrom', e.id
  ),
  '[]'::jsonb,
  e."authorId", e."authorName", e."authorDept", e."createdAt"
FROM public.entity_updates e
JOIN public.sales_orders s ON s.id = e."entityId"
WHERE e."entityType" = 'sales_order'
  AND e.kind IN ('withdraw', 'restore')
  AND e."deletedAt" IS NULL
  AND s."dealId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.entity_updates d
     WHERE d."entityType" = 'deal' AND d.meta->>'migratedFrom' = e.id
  );

COMMIT;

-- ตรวจหลังรัน — แถวที่ย้ายขึ้นมาแล้ว (ควรได้เท่าจำนวน withdraw/restore ของใบ):
--   SELECT "entityId" AS deal, kind, body, "createdAt"
--     FROM entity_updates
--    WHERE meta ? 'migratedFrom' ORDER BY "createdAt";
