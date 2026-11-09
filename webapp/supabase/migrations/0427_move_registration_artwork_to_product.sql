-- ============================================================
--  Migration 0427: ย้ายฉลากที่แนบไว้ที่ทะเบียนสรรพสามิต ไปเป็น Artwork ของสินค้า (ศูนย์กลางเอกสารของสินค้า งวด P1)
--
--  ⭐ มติเจ้าของ 09/11/2026: ไฟล์ที่เป็นของตัวสินค้าเก็บที่สินค้า · ทะเบียนชี้มา (ดูหัว 0426)
--
--  ── ทำอะไร (DML ล้วน · ทรานแซกชันเดียว) ──────────────────────────────────────────────────
--   แถว attachments ที่ entityType = 'registration' · docType = 'label_artwork' · ทะเบียนมี productId
--   ⓐ audit_logs.before ของทุกแถวที่จะย้าย + ทะเบียนที่จะได้ตัวชี้ (actorId 'migration-0427')
--   ⓑ ทะเบียนที่ยื่นแล้ว (pending_legal · approved · rejected) ได้ "labelArtworkIds" = id ของไฟล์ที่เคยแนบ
--      (ไฟล์ที่ RA ตรวจ/อนุมัติไปแล้วคือไฟล์ชุดนี้ — ตรึงไว้เหมือนตอนยื่นจริง) · ร่าง (draft) ไม่ได้ตัวชี้ — ใช้ Artwork ปัจจุบันสด ๆ
--   ⓒ ย้ายแถว: entityType → 'product' · entityId → productId ของทะเบียน · docType → 'artwork'
--      + metadata.movedFromRegistrationId (ไม่แตะไฟล์บน Drive — แถวเดิม ไฟล์เดิม ไม่คัดลอก)
--      · แถวที่ **ซ้ำกับ Artwork ที่สินค้ามีอยู่แล้ว** ถูกประทับปลดระวาง (metadata.retiredAt) ด้วย —
--        ทะเบียนยังเปิดไฟล์ที่ยื่นได้ แต่หน้าสินค้าไม่โชว์ไฟล์เดียวกันสองใบ · "ซ้ำ" =
--        (1) สำเนาจากปุ่ม "ใช้ไฟล์นี้ยื่น" (metadata.sourceAttachmentId ชี้ Artwork ของสินค้าตัวเดียวกัน) หรือ
--        (2) ชื่อไฟล์ + ขนาดตรงกับ Artwork ของสินค้าตัวเดียวกัน
--   ⓓ ยืนยัน: ไม่เหลือฉลากที่ทะเบียน (ของทะเบียนที่มีสินค้า) และทะเบียนที่ยื่นแล้วที่เคยมีฉลากได้ตัวชี้ครบ
--
--  ── สภาพ prod ตอนเขียน (09/11/2026) ────────────────────────────────────────────────────────
--   65 แถว (สำเนาจากปุ่ม 5 · ชื่อ+ขนาดซ้ำ 5 · ที่เหลือ 55) · ทะเบียน 54 ใบ · ไม่มีสินค้าที่มีทะเบียนเกินหนึ่งใบ
--
--  ── ลำดับรันกับ deploy ────────────────────────────────────────────────────────────────────
--   **รันหลัง 0426 และหลัง deploy โค้ดงวด P1** — โค้ดเก่าอ่านฉลากจากทะเบียน (ย้ายก่อน deploy = แผงทะเบียนของรุ่นเก่า
--   ขึ้น "ขาด ฉลาก" และหน้า RA ไม่เห็นไฟล์) · โค้ด P1 อ่านได้ทั้งสองที่ (ไฟล์ที่ทะเบียนนับเป็นของเดิม) จึงรันเมื่อไรก็ได้หลัง deploy
--
--  ── ทางกลับ (ต่อแถว · จาก audit_logs ของ actorId 'migration-0427') ───────────────────────────
--   UPDATE attachments SET "entityType" = 'registration', "entityId" = before->>'entityId', "docType" = 'label_artwork',
--     metadata = before->'metadata' … · UPDATE excise_registrations SET "labelArtworkIds" = '{}' …
--  รันซ้ำได้ (รอบสองเจอ 0 แถว)
-- ============================================================

BEGIN;

-- ⓐ ร่องรอยก่อนแก้ — ไฟล์ที่จะย้าย
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT 'migration-0427', 'ระบบ (mig 0427)', 'system', 'update', 'attachment', a.id::text,
       'ย้ายฉลากจากทะเบียน ' || a."entityId" || ' ไปเป็น Artwork ของสินค้า ' || r."productId"
         || ' (ศูนย์กลางเอกสารของสินค้า · มติเจ้าของ 09/11/2026)',
       '["entityType","entityId","docType","metadata"]'::jsonb, to_jsonb(a), now()
  FROM public.attachments a
  JOIN public.excise_registrations r ON r.id = a."entityId"
 WHERE a."entityType" = 'registration' AND a."docType" = 'label_artwork' AND r."productId" IS NOT NULL;

-- ⓐ ร่องรอยก่อนแก้ — ทะเบียนที่จะได้ตัวชี้
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT 'migration-0427', 'ระบบ (mig 0427)', 'system', 'update', 'registration', r.id,
       'ทะเบียน ' || COALESCE(r."fgCode", r.id) || ' ชี้ไปที่ Artwork ของสินค้าที่ยื่นไปแล้ว (ย้ายจากไฟล์แนบของทะเบียน)',
       '["labelArtworkIds"]'::jsonb, to_jsonb(r), now()
  FROM public.excise_registrations r
 WHERE r.status IN ('pending_legal', 'approved', 'rejected') AND r."productId" IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.attachments a
                WHERE a."entityType" = 'registration' AND a."docType" = 'label_artwork' AND a."entityId" = r.id);

-- ⓑ ตัวชี้ของทะเบียนที่ยื่นแล้ว — รวมกับค่าที่มีอยู่ (รันซ้ำไม่เพิ่มซ้ำ)
UPDATE public.excise_registrations r
   SET "labelArtworkIds" = ARRAY(
         SELECT DISTINCT x FROM unnest(r."labelArtworkIds" || moved.ids) AS x ORDER BY x)
  FROM (
    SELECT a."entityId" AS reg_id, array_agg(a.id::text ORDER BY a."createdAt", a.id) AS ids
      FROM public.attachments a
     WHERE a."entityType" = 'registration' AND a."docType" = 'label_artwork'
     GROUP BY a."entityId"
  ) moved
 WHERE r.id = moved.reg_id
   AND r.status IN ('pending_legal', 'approved', 'rejected') AND r."productId" IS NOT NULL;

-- ⓒ ย้ายแถวไปเป็นของสินค้า (+ ปลดระวางตัวที่ซ้ำกับ Artwork ที่สินค้ามีอยู่แล้ว)
UPDATE public.attachments a
   SET "entityType" = 'product',
       "entityId"   = r."productId",
       "docType"    = 'artwork',
       metadata     = COALESCE(a.metadata, '{}'::jsonb)
         || jsonb_build_object('movedFromRegistrationId', r.id, 'movedAt', now())
         || CASE WHEN (
                 EXISTS (SELECT 1 FROM public.attachments s
                          WHERE s.id::text = COALESCE(a.metadata, '{}'::jsonb)->>'sourceAttachmentId'
                            AND s."entityType" = 'product' AND s."entityId" = r."productId" AND s."docType" = 'artwork')
              OR EXISTS (SELECT 1 FROM public.attachments s
                          WHERE s."entityType" = 'product' AND s."entityId" = r."productId" AND s."docType" = 'artwork'
                            AND s."fileName" = a."fileName" AND s."sizeBytes" IS NOT DISTINCT FROM a."sizeBytes")
            )
            THEN jsonb_build_object('retiredAt', now(), 'retiredBy', 'migration-0427',
                                    'retiredByName', 'ระบบ (mig 0427 · ไฟล์ซ้ำกับ Artwork ที่สินค้ามีอยู่แล้ว)')
            ELSE '{}'::jsonb END
  FROM public.excise_registrations r
 WHERE r.id = a."entityId"
   AND a."entityType" = 'registration' AND a."docType" = 'label_artwork' AND r."productId" IS NOT NULL;

-- ⓓ ยืนยัน
DO $$
DECLARE v_left int; v_unlinked int;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.attachments a JOIN public.excise_registrations r ON r.id = a."entityId"
   WHERE a."entityType" = 'registration' AND a."docType" = 'label_artwork' AND r."productId" IS NOT NULL;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'mig 0427: ยังเหลือฉลากที่ทะเบียน % แถว', v_left;
  END IF;
  -- ทุกไฟล์ที่ย้ายมาจากทะเบียนที่ยื่นแล้ว ต้องอยู่ในตัวชี้ของทะเบียนนั้น
  SELECT count(*) INTO v_unlinked
    FROM public.attachments a JOIN public.excise_registrations r ON r.id = a.metadata->>'movedFromRegistrationId'
   WHERE a."entityType" = 'product' AND a."docType" = 'artwork'
     AND r.status IN ('pending_legal', 'approved', 'rejected')
     AND NOT (a.id::text = ANY (r."labelArtworkIds"));
  IF v_unlinked > 0 THEN
    RAISE EXCEPTION 'mig 0427: มีไฟล์ที่ย้ายแล้วแต่ทะเบียนไม่ได้ชี้ % แถว', v_unlinked;
  END IF;
END $$;

COMMIT;

-- เช็กผล (ค่าที่คาดจากข้อมูล 09/11: left_at_registration = 0 · moved_rows = 65 · linked_registrations = 54 · retired_duplicates = 10)
SELECT
  (SELECT count(*) FROM public.attachments WHERE "entityType" = 'registration' AND "docType" = 'label_artwork') AS left_at_registration,
  (SELECT count(*) FROM public.attachments WHERE metadata ? 'movedFromRegistrationId') AS moved_rows,
  (SELECT count(*) FROM public.excise_registrations WHERE cardinality("labelArtworkIds") > 0) AS linked_registrations,
  (SELECT count(*) FROM public.attachments WHERE metadata ? 'movedFromRegistrationId' AND metadata ? 'retiredAt') AS retired_duplicates;
