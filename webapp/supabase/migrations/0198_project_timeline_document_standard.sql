-- 0198 - เอกสารไทม์ไลน์โครงการ (FM-PD-05) เข้าระบบมาตรฐานเอกสาร
--
-- ⚠️ เดิมไฟล์นี้ชื่อ 0193 ซึ่งชนกับ 0193_workflow_template_line ที่เข้า main ก่อน
--    (PR #921) — check:migrations แตกเพราะเลขซ้ำ จึงเปลี่ยนเป็น 0198 ตอน rebase
--    เนื้อหา SQL ไม่เปลี่ยนเลย รวมถึงค่า actor 'migration-0193' ในแถวที่ seed ไว้ ซึ่ง
--    ตรงกับข้อมูลที่รันไปแล้วบนฐานจริง · ถ้าเคยรันในชื่อ 0193 แล้วไม่ต้องรันซ้ำ
--    (ทุกคำสั่งเป็น IF NOT EXISTS / ON CONFLICT DO NOTHING รันซ้ำก็ไม่เสียหาย)
--    ดูบทเรียนเลขซ้ำที่เคยทำให้ migration ตกค้างทั้งชุด (0076–0080) ใน memory migration-drift-guard
--
-- ก่อนหน้านี้ FM-PD-05 เป็นเอกสารพิมพ์ชนิดเดียวที่ยังอยู่นอกระบบควบคุม: รหัสแบบฟอร์ม
-- ฝังเป็นค่าคงที่ใน documentBrand.js (ganttPrint อ่านตรง ๆ) แก้จากหน้าตั้งค่าไม่ได้
-- และหัวใบไม่มี Rev/วันที่มีผลเหมือน QT/SO/ET
--
-- มติผู้ใช้ 2026-08-04:
--   · คุมจาก ตั้งค่า → มาตรฐานเอกสาร เหมือนอีกสามใบ
--   · หัวใบพิมพ์บรรทัดควบคุมเต็ม "FM-PD-05: Rev. No.00. 08/05/2568"
--   · วันที่มีผลตั้งต้นเท่ากับ FM-SA-01/FM-SA-03 (08/05/2568) แล้วแก้ต่อได้ผ่านร่าง→เผยแพร่
--   · Accent ต้องต่างจากอีกสามใบ (terracotta/steel/amber) → navy #1f3551
--   · เอกสารไทม์ไลน์ "ออกเลขจริง" ของตัวเอง: PT-YYMMXXXX-R
--
-- เลขที่เอกสารกับรหัสโครงการเป็นคนละตัว โดยตั้งใจ:
--   · projects.code = PJ-YYMMXXXX (mig 0096) คือรหัส "ตัวโครงการ" ใช้ทั้งระบบ
--   · projects."timelineDocNumber" = PT-YYMMXXXX-0 คือเลขที่ "เอกสารไทม์ไลน์"
--   หัวใบจึงมีสองรหัส: เลขที่เอกสาร (ควบคุม) และรหัสโครงการที่เอกสารนี้พูดถึง
--   เหมือนใบแจ้งชำระภาษีที่มีทั้ง taxNoticeNumber และเลขที่ใบยื่นต้นทาง (mig 0162)
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ── 1. มาตรฐานเอกสารชนิดใหม่ ────────────────────────────────────────────────
-- accentKey 'navy' อยู่ใน CHECK ตั้งแต่ mig 0154 แล้ว จึงไม่ต้องแก้ constraint

INSERT INTO public.document_standards ("documentKey")
VALUES ('projectTimeline')
ON CONFLICT ("documentKey") DO NOTHING;

INSERT INTO public.document_standard_versions (
  id, "documentKey", "versionNumber", status,
  "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
VALUES (
  'document-standard-project-timeline-v1', 'projectTimeline', 1, 'published',
  'เอกสารไทม์ไลน์โครงการ', 'PROJECT TIMELINE',
  'FM-PD-05', '00', DATE '2025-05-08', 'navy',
  'PT-{YY}{MM}{RUNNING:4}-{REVISION}',
  'นำ FM-PD-05 เข้าระบบเอกสารควบคุม (เดิมเป็นค่าคงที่ใน documentBrand.js)',
  'migration-0193', 'Migration 0193', 'system',
  'migration-0193', 'Migration 0193', 'system',
  'migration-0193', 'Migration 0193', 'system', now()
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.document_standards
SET "publishedVersionId" = 'document-standard-project-timeline-v1',
    "updatedAt" = now()
WHERE "documentKey" = 'projectTimeline'
  AND "publishedVersionId" IS NULL;

-- ── 2. เลขที่เอกสารไทม์ไลน์บนโครงการ ─────────────────────────────────────────
-- เก็บทั้ง "เลขฐาน" และ "เลขที่ตอนออก (Rev 0)" ด้วยเหตุผลเดียวกับใบเสนอราคา
-- (quotations.baseNumber + quoteNumber): Rev ของไทม์ไลน์เดินอยู่บนแถวโครงการเดิม
-- (projects."currentRev" — mig 0040) ไม่ได้แตกแถวใหม่เหมือน QT ตอนพิมพ์จึงต้องต่อ
-- เลข Rev ปัจจุบันเข้ากับเลขฐาน โดยใช้ "ตัวคั่นของใบตัวเอง" ที่อ่านย้อนจากเลขที่ตอนออก
-- (revisionSeparatorOf) ไม่ใช่ตัวคั่นของรูปแบบปัจจุบันที่อาจถูกแก้ไปแล้ว

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS "timelineDocBase" text,
  ADD COLUMN IF NOT EXISTS "timelineDocNumber" text,
  ADD COLUMN IF NOT EXISTS "timelineStandardVersionId" text
    REFERENCES public.document_standard_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "timelineStandardSnapshot" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS projects_timeline_doc_number_key
  ON public.projects ("timelineDocNumber")
  WHERE "timelineDocNumber" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_timeline_number_counters (
  month text PRIMARY KEY,
  "lastNo" integer NOT NULL DEFAULT 0 CHECK ("lastNo" >= 0)
);

ALTER TABLE public.project_timeline_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_timeline_number_counters FROM anon, authenticated;
GRANT ALL ON TABLE public.project_timeline_number_counters TO service_role;

-- ── 3. Backfill โครงการเดิม ─────────────────────────────────────────────────
-- ให้เลขแบบกำหนดผลได้ (เรียงตามเวลาสร้างในเดือนนั้น) เหมือนที่ mig 0162 ทำกับใบยื่น
-- ภาษี · ใช้รูปแบบตั้งต้นตรง ๆ เพราะ ณ จุดนี้มาตรฐานเพิ่งถูก seed ยังไม่มีใครแก้

WITH numbered AS (
  SELECT
    id,
    to_char(timezone('Asia/Bangkok', COALESCE("createdAt", now())), 'YYMM') AS month,
    row_number() OVER (
      PARTITION BY to_char(timezone('Asia/Bangkok', COALESCE("createdAt", now())), 'YYMM')
      ORDER BY COALESCE("createdAt", now()), id
    ) AS running_no
  FROM public.projects
  WHERE "timelineDocNumber" IS NULL
)
UPDATE public.projects AS p
SET "timelineDocBase" = 'PT-' || n.month || lpad(n.running_no::text, 4, '0'),
    "timelineDocNumber" = 'PT-' || n.month || lpad(n.running_no::text, 4, '0') || '-0',
    "timelineStandardVersionId" = 'document-standard-project-timeline-v1',
    "timelineStandardSnapshot" = (
      SELECT to_jsonb(v) FROM public.document_standard_versions v
      WHERE v.id = 'document-standard-project-timeline-v1'
    )
FROM numbered AS n
WHERE p.id = n.id;

-- ตัวนับต้องเริ่มต่อจากเลขที่ backfill ไปแล้ว ไม่งั้นโครงการถัดไปจะชน unique index
INSERT INTO public.project_timeline_number_counters (month, "lastNo")
SELECT
  substring("timelineDocNumber" FROM '^PT-([0-9]{4})'),
  max(substring("timelineDocNumber" FROM '^PT-[0-9]{4}([0-9]{4})-0$')::integer)
FROM public.projects
WHERE "timelineDocNumber" ~ '^PT-[0-9]{8}-0$'
GROUP BY 1
ON CONFLICT (month) DO UPDATE
SET "lastNo" = GREATEST(public.project_timeline_number_counters."lastNo", EXCLUDED."lastNo");

-- ── 4. ออกเลขให้โครงการใหม่อัตโนมัติ ────────────────────────────────────────
-- ทำที่ trigger ไม่ใช่ฝั่งแอป เพราะโครงการถูกสร้างจากสามทาง (/api/sa/projects,
-- ดีล→โครงการ, PO สหมิตร→โครงการ) การออกเลขที่ต้องเหมือนกันทุกทางและอยู่ในทรานแซกชัน
-- เดียวกับ INSERT — แบบเดียวกับ orders_assign_excise_tax_notice_identity (mig 0162)

CREATE OR REPLACE FUNCTION public.assign_project_timeline_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_standard public.document_standard_versions%ROWTYPE;
  v_local_time timestamptz;
  v_month text;
  v_pattern text;
  v_head text;
  v_width integer;
  v_running integer;
BEGIN
  IF NEW."timelineDocNumber" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.* INTO v_standard
  FROM public.document_standards AS s
  JOIN public.document_standard_versions AS v
    ON v.id = s."publishedVersionId"
  WHERE s."documentKey" = 'projectTimeline'
    AND v.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_timeline_standard_missing';
  END IF;

  v_local_time := timezone('Asia/Bangkok', COALESCE(NEW."createdAt", now()));
  v_month := to_char(v_local_time, 'YYMM');
  v_pattern := COALESCE(
    NULLIF(btrim(v_standard."numberingPattern"), ''),
    'PT-{YY}{MM}{RUNNING:4}-{REVISION}'
  );
  v_width := COALESCE((substring(v_pattern FROM '\{RUNNING:(\d)\}'))::integer, 4);

  INSERT INTO public.project_timeline_number_counters AS c (month, "lastNo")
  VALUES (v_month, 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running;

  IF v_running > power(10, v_width)::integer - 1 THEN
    RAISE EXCEPTION 'project_timeline_monthly_sequence_exhausted';
  END IF;

  -- ส่วนหน้า {REVISION} = เลขฐาน (พร้อมตัวคั่น) — ตรรกะเดียวกับ documentNumberParts
  -- ฝั่ง JS · รูปแบบที่ไม่มี {REVISION} (เผยแพร่ไว้ก่อนกฎใหม่ แก้ย้อนหลังไม่ได้) ให้ทั้ง
  -- ก้อนเป็นเลขฐานแล้วต่อ '-0' ตามรูปแบบเดิมของระบบ
  IF position('{REVISION}' IN v_pattern) > 0 THEN
    v_head := split_part(v_pattern, '{REVISION}', 1);
  ELSE
    v_head := v_pattern || '-';
  END IF;

  v_head := replace(v_head, '{YYYY}', to_char(v_local_time, 'YYYY'));
  v_head := replace(v_head, '{YY}', to_char(v_local_time, 'YY'));
  v_head := replace(v_head, '{MM}', to_char(v_local_time, 'MM'));
  v_head := replace(v_head, '{DD}', to_char(v_local_time, 'DD'));
  v_head := replace(v_head, '{RUNNING:3}', lpad(v_running::text, 3, '0'));
  v_head := replace(v_head, '{RUNNING:4}', lpad(v_running::text, 4, '0'));
  v_head := replace(v_head, '{RUNNING:5}', lpad(v_running::text, 5, '0'));

  NEW."timelineDocBase" := regexp_replace(v_head, '[-._/]+$', '');
  NEW."timelineDocNumber" := v_head || '0';
  NEW."timelineStandardVersionId" := v_standard.id;
  NEW."timelineStandardSnapshot" := to_jsonb(v_standard);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_assign_timeline_identity ON public.projects;
CREATE TRIGGER projects_assign_timeline_identity
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.assign_project_timeline_identity();

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- 1) ถอด trigger ก่อน (projects_assign_timeline_identity) โครงการใหม่จะไม่มีเลขที่
--    เอกสาร แต่ ganttPrint ตกไปใช้รหัสโครงการเหมือนเดิมได้ทันที
-- 2) คอลัมน์ timeline* และตัวนับให้คงไว้ถ้ามีเอกสารพิมพ์ออกไปแล้ว — เลขที่บนใบที่
--    ลูกค้า/ฝ่ายผลิตถืออยู่ต้องตามกลับมาที่แถวเดิมได้
-- 3) มาตรฐาน projectTimeline ปิดการใช้งานได้ด้วยการถอดคีย์ฝั่งแอป โดยไม่ลบ
--    version history (เหมือน rollback ของ mig 0123)
