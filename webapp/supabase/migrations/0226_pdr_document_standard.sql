-- 0226 - แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (FM-RD-01) เข้าระบบมาตรฐานเอกสาร
--
-- 🐞 ปัญหาที่แก้: DOCUMENT_STANDARD_KEYS เพิ่มคีย์ 'pdr' (หน้าตั้งค่ามีแท็บแล้ว)
--    แต่ไม่มี migration seed แถวตั้งต้นใน document_standards เหมือนที่ 0162 ทำให้
--    exciseTaxNotice และ 0198 ทำให้ projectTimeline ⇒ หน้า ตั้งค่า → มาตรฐานเอกสาร
--    โยน root_missing ("ไม่พบข้อมูลตั้งต้นของ pdr") ทั้งหน้าใช้ไม่ได้
--
-- ⚠️ เลขไฟล์ข้าม 0225 โดยตั้งใจ — 0225_request_quotation_ref.sql ถูกใช้แล้วบน main
--    (บทเรียนเลขชนจาก 0198 ที่เคยต้อง rename ตอน rebase)
--
-- ค่าตั้งต้นตรงกับกระดาษจริง (docs/FM-RD-01-pdr-form-rev02.pdf) และค่าสำรองใน
-- documentBrand.js: FM-RD-01 · Rev.02 · มีผล 06/02/2569 (= 2026-02-06)
--
-- ⚠️ **PDR ไม่ออกเลขที่เอกสารของตัวเอง** — ช่อง "Document No." บนกระดาษใช้เลขที่
--    คำร้อง (SB-…) ที่ออกแล้วตอนกดส่ง ⇒ ไม่มีตัวนับ/trigger เหมือน 0198 ส่วนที่ 2-4
--    รูปแบบเลขที่ใส่ไว้เพราะ validator ของทะเบียนมาตรฐานบังคับให้มีเท่านั้น
--
-- accentKey 'terracotta' ตามที่ renderPdrDocument ใช้อยู่จริง (อยู่ใน CHECK ตั้งแต่แรก)
--
-- ⚠ DML ล้วน (INSERT/UPDATE) — รันผ่าน Supabase SQL Editor หรือ service role ก็ได้
--   รันซ้ำไม่เสียหาย (ON CONFLICT DO NOTHING / UPDATE เฉพาะตอนยังว่าง)
--
-- 🐞 **ฐานที่ถูก seed ผ่าน UI มาก่อนแล้ว** (สร้างร่างจากหน้าตั้งค่า → เผยแพร่) จะได้ id
--    เป็น `document-standard-pdr-<uuid>` ตามที่ `createDocumentStandardDraft` ออกให้
--    ⇒ `ON CONFLICT (id) DO NOTHING` **กันไม่ได้** เพราะคนละ id · ผลคือมีแถว
--    `status = 'published'` ของ `pdr` **สองแถว** แล้ว `publishedNumberingPattern`
--    กับ route พิมพ์เอกสารที่ใช้ `.eq('status','published').maybeSingle()` จะ error
--    แล้วตกไปใช้ค่าสำรองเงียบ ๆ
--    ⇒ ด่านจริงคือ `WHERE NOT EXISTS (… ของ pdr …)` ไม่ใช่การชน id

INSERT INTO public.document_standards ("documentKey")
VALUES ('pdr')
ON CONFLICT ("documentKey") DO NOTHING;

INSERT INTO public.document_standard_versions (
  id, "documentKey", "versionNumber", status,
  "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
SELECT
  'document-standard-pdr-v1', 'pdr', 1, 'published',
  'แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์', 'PRODUCT DEVELOPMENT REQUEST (PDR)',
  'FM-RD-01', '02', DATE '2026-02-06', 'terracotta',
  'PDR-{YY}{MM}{RUNNING:4}-{REVISION}',
  'นำ FM-RD-01 Rev.02 เข้าระบบเอกสารควบคุม (เดิมเป็นค่าสำรองใน documentBrand.js)',
  'migration-0226', 'Migration 0226', 'system',
  'migration-0226', 'Migration 0226', 'system',
  'migration-0226', 'Migration 0226', 'system', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_standard_versions WHERE "documentKey" = 'pdr'
);

-- ⚠️ **อ่าน id ของแถวที่เผยแพร่จริง ไม่ hardcode `document-standard-pdr-v1`** —
-- ฐานที่ seed ผ่าน UI มาก่อนได้ id เป็น UUID การชี้ตายตัวจะชี้ไปแถวที่ไม่มีอยู่
-- แล้ว publishedVersionId กลายเป็น FK ที่ไม่มีปลายทาง (หรือ error ที่ REFERENCES)
UPDATE public.document_standards
SET "publishedVersionId" = (
      SELECT id FROM public.document_standard_versions
      WHERE "documentKey" = 'pdr' AND status = 'published'
      ORDER BY "versionNumber" DESC LIMIT 1
    ),
    "updatedAt" = now()
WHERE "documentKey" = 'pdr'
  AND "publishedVersionId" IS NULL;

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- 1) ถอดคีย์ 'pdr' ออกจาก DOCUMENT_STANDARD_KEYS ฝั่งแอป — แท็บหายทันที
--    เอกสาร PDR ยังพิมพ์ได้เพราะ resolveDocumentForm ตกไปใช้ค่าสำรอง documentBrand.js
-- 2) แถว seed คงไว้ได้ (ไม่มีใครอ่านเมื่อคีย์ถูกถอด) หรือลบด้วย:
--    UPDATE public.document_standards SET "publishedVersionId" = NULL WHERE "documentKey" = 'pdr';
--    DELETE FROM public.document_standard_versions WHERE "documentKey" = 'pdr';
--    DELETE FROM public.document_standards WHERE "documentKey" = 'pdr';
