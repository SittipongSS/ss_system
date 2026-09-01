-- ============================================================
--  Migration 0331: เลขไทม์ไลน์โครงการ (PT) ขยายเลขรันเป็น 5 หลัก
--  (มติผู้ใช้ 2026-09-01 — ต่อจาก 0330 ที่ย้าย PT มาตัดรอบรายปี)
--
--  ⭐ **ความกว้างของ PT ไม่ได้อยู่ในโค้ด** — มันมาจาก `numberingPattern` ของ
--     "มาตรฐานเอกสาร" ที่เผยแพร่อยู่ (`{RUNNING:4}` → `{RUNNING:5}`) ⇒ ใบนี้จึงไม่ใช่
--     migration ที่แก้ schema แต่เป็นการ **เผยแพร่มาตรฐานเอกสารเวอร์ชันใหม่** แทนคน
--     กดจากหน้าตั้งค่า · ผลลัพธ์เหมือนกดเองทุกประการเพราะเรียก RPC ตัวเดียวกับที่หน้าเว็บใช้
--     (`create_document_standard_draft` → แก้ร่าง → `publish_document_standard_draft_atomic`)
--
--  ⚠️ **ทำไมต้องผ่าน RPC ไม่ UPDATE ทับแถวที่เผยแพร่อยู่** — trigger
--     `document_standard_versions_guard` (0123) บล็อกการแก้ payload ของแถวที่ไม่ใช่ร่าง
--     และประวัติเวอร์ชันคือหลักฐานของระบบคุณภาพ · การแก้ทับ = เอกสารที่พิมพ์ไปแล้ว
--     อ้างเวอร์ชันที่เนื้อในเปลี่ยนไปแล้วโดยไม่มีร่องรอย
--
--  ⚠️ **ไม่แตะ `revision` ของแบบฟอร์ม** (Rev. No. บนหัวกระดาษ) — นั่นเป็นเลขควบคุม
--     เอกสารของฝ่ายเอกสาร ไม่ใช่ของที่ migration ควรตั้งให้เอง · ถ้ารอบนี้ต้องนับเป็น
--     Rev. ใหม่ ให้คนที่ดูแลเอกสารกดแก้จากหน้าตั้งค่าอีกที
--
--  ⚠️ **ใบนี้ยกเลิกเองไม่ได้ถ้ามีร่างค้างอยู่** — ร่างค้าง = มีคนกำลังแก้มาตรฐานตัวนี้อยู่
--     ยัดร่างของเราทับ = งานเขาหาย ⇒ โยน exception ให้ไปจบร่างนั้นก่อน
--
--  🔢 เลขที่จะออกหลังจากนี้: ตัวนับปี `'26'` = 181 (0330 seed ไว้) ⇒ ใบถัดไป
--     `PT-260900182-0` · **ไม่ชนกับชุด 4 หลักเดิม** เพราะคนละความยาว = คนละสตริง
--
--  ⚠ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลโครงการเดิมแม้แต่แถวเดียว · รันซ้ำได้
--
--  🔍 ตรวจหลังรัน (ต้องได้ `{RUNNING:5}` และมีเวอร์ชัน published ใบเดียว):
--     SELECT v."versionNumber", v.status, v."numberingPattern"
--       FROM document_standard_versions v
--      WHERE v."documentKey" = 'projectTimeline' ORDER BY v."versionNumber";
-- ============================================================

BEGIN;

DO $pt$
DECLARE
  v_key     text := 'projectTimeline';
  v_pattern text := 'PT-{YY}{MM}{RUNNING:5}-{REVISION}';
  v_current text;
  v_draft   jsonb;
  v_id      text;
  v_updated timestamptz;
BEGIN
  -- รันซ้ำได้: เผยแพร่เป็น 5 หลักไปแล้วก็ไม่ต้องออกเวอร์ชันใหม่ให้ประวัติรก
  SELECT v."numberingPattern" INTO v_current
  FROM public.document_standards s
  JOIN public.document_standard_versions v ON v.id = s."publishedVersionId"
  WHERE s."documentKey" = v_key;

  IF v_current = v_pattern THEN
    RAISE NOTICE 'รูปแบบเลขไทม์ไลน์เป็น 5 หลักอยู่แล้ว — ข้ามใบนี้';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_standard_versions
    WHERE "documentKey" = v_key AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'project_timeline_draft_exists: มีฉบับร่างของมาตรฐานไทม์ไลน์ค้างอยู่ — เผยแพร่หรือยกเลิกร่างนั้นจากหน้าตั้งค่าก่อน แล้วค่อยรันใบนี้';
  END IF;

  v_draft := public.create_document_standard_draft(
    v_key, 'document-standard-projectTimeline-mig0331',
    'migration-0331', 'Migration 0331', 'admin'
  );
  v_id := v_draft->>'id';

  -- ร่างถูกก๊อปมาจากเวอร์ชันที่เผยแพร่ทั้งใบ (0123) ⇒ แก้เฉพาะสองช่องนี้
  -- `changeNote` เป็นของบังคับตอนเผยแพร่ (RPC โยน document_standard_change_note_required)
  UPDATE public.document_standard_versions
  SET "numberingPattern" = v_pattern,
      "changeNote" = 'ขยายเลขรันเป็น 5 หลักให้เท่ากับรหัสโครงการ (มติผู้ใช้ 2026-09-01 · ต่อจาก mig 0330 ที่ย้ายมาตัดรอบรายปี)',
      "updatedAt" = now()
  WHERE id = v_id
  RETURNING "updatedAt" INTO v_updated;

  PERFORM public.publish_document_standard_draft_atomic(
    v_id, v_updated, 'migration-0331', 'Migration 0331', 'admin'
  );

  RAISE NOTICE 'เผยแพร่รูปแบบเลขไทม์ไลน์ใหม่แล้ว: % (ใบถัดไปจะเป็น 5 หลัก)', v_pattern;
END
$pt$;

COMMIT;

NOTIFY pgrst, 'reload schema';
