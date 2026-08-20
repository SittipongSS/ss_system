-- ============================================================
--  Migration 0276: แม่แบบไทม์ไลน์ของ **สายบริการ**
--
--  ⭐ มติผู้ใช้ 2026-08-20: แม่แบบไทม์ไลน์ = คู่ (สายธุรกิจ, ประเภทดีล)
--  ดีลถือสายของตัวเองแล้วตั้งแต่ mig 0275 · ใบนี้เปิดแม่แบบอีกฝั่งของคู่ให้มีจริง
--
--  ⭐ **SCENT เดินเหมือนกันทั้งสองสาย** ⇒ ไม่ทำสองใบให้ต้องมาไล่แก้ให้ตรงกัน
--  แถว 'SCENT' เดิมเปลี่ยนป้ายสายเป็น 'BOTH' = "ใบนี้ใช้ร่วมทั้งสองสาย"
--  ⇒ ของใหม่มีแค่ 3 ใบ: SERVICE-NPD · SERVICE-RE-ORDER · SERVICE-OTHER
--
--  ⚠️ **คีย์เข้ารหัสคู่ไว้ในตัวเอง (`SERVICE-NPD`) ไม่ได้ย้าย PK เป็นสองคอลัมน์**
--  0193 เคยจดไว้ว่าจะย้าย PK เป็นคู่ (line, templateKey) แต่นั่นต้องรื้อ FK ของ
--  versions + UNIQUE + partial index 3 ตัว + RPC 4 ตัว + trigger guard บนตารางที่มี
--  ของจริงเดินอยู่ · การเข้ารหัสในคีย์ให้ผลเดียวกันที่ชั้นค้นหา โดยไม่แตะโครงสร้าง
--  ⇒ `line` ยังเป็น **ป้ายบอกสาย** ของแถว (PRODUCT | SERVICE | BOTH) ไม่ใช่กุญแจ
--  ตัวแปลคู่→คีย์อยู่ที่ `workflowTemplateKeyFor()` (lib/workflowTemplates.js) ที่เดียว
--
--  ── เนื้อขั้นตอนตั้งต้น: **ก๊อปจากใบสายสินค้าคู่กันมาทั้งชุด** (มติผู้ใช้)
--  แล้วไปแก้ต่อเองที่ /settings/workflow-templates (กด "สร้างฉบับร่าง" → แก้ → เผยแพร่)
--  ⚠️ ก๊อปมาเป็นเวอร์ชัน **published** ไม่ใช่ draft — ตั้งใจ: แม่แบบที่มีแต่ร่าง
--  ไม่มีเวอร์ชันเผยแพร่ ⇒ (ก) ดีลสายบริการ gen ไทม์ไลน์ไม่ได้เลย และ (ข) RPC
--  `create_workflow_template_draft` ต้องการเวอร์ชันเผยแพร่เป็นฐาน จะเด้ง
--  `workflow_template_published_missing` = แก้ที่หน้าตั้งค่าก็ไม่ได้ ตันทั้งสองทาง
--
--  ⚠ รันมือบน Supabase SQL Editor · additive ล้วน · รันซ้ำได้ (idempotent)
--  🛑 **ต้องรันก่อน deploy** — หน้า /settings/workflow-templates โหลดแถวของทุกคีย์
--     ใน WORKFLOW_TEMPLATE_KEYS ถ้าไม่มีแถวจะตายที่ 'ไม่พบข้อมูลตั้งต้นของ …'
-- ============================================================

BEGIN;

-- ── 1) คีย์ใหม่ 3 ตัวเข้า CHECK ─────────────────────────────────────────
-- ชื่อ constraint ตั้งไว้ตรง ๆ ตั้งแต่ mig 0249 (ก่อนหน้านั้น Postgres ตั้งเอง)
DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.workflow_templates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%SCENT%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.workflow_templates DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.workflow_templates
  ADD CONSTRAINT workflow_templates_template_key_check
  CHECK ("templateKey" IN (
    'SCENT', 'NPD', 'RE-ORDER', 'OTHER',
    'SERVICE-NPD', 'SERVICE-RE-ORDER', 'SERVICE-OTHER'
  ));

-- ── 2) ป้ายสายรับค่า 'BOTH' ─────────────────────────────────────────────
ALTER TABLE public.workflow_templates          DROP CONSTRAINT IF EXISTS workflow_templates_line_check;
ALTER TABLE public.workflow_template_versions  DROP CONSTRAINT IF EXISTS workflow_template_versions_line_check;
ALTER TABLE public.workflow_templates
  ADD CONSTRAINT workflow_templates_line_check
  CHECK (line IN ('PRODUCT', 'SERVICE', 'BOTH'));
ALTER TABLE public.workflow_template_versions
  ADD CONSTRAINT workflow_template_versions_line_check
  CHECK (line IN ('PRODUCT', 'SERVICE', 'BOTH'));

-- ── 3) SCENT = ใบที่สองสายใช้ร่วมกัน ────────────────────────────────────
-- ⚠️ `guard_workflow_template_version()` บล็อก UPDATE ทุกชนิดบนแถวที่ไม่ใช่ draft
-- (ไม่ได้ดูว่าแก้คอลัมน์ไหน) ⇒ ปิดทริกเกอร์เฉพาะช่วงนี้ แล้วเปิดคืนในทรานแซกชัน
-- เดียวกัน — precedent เดียวกับ mig 0193/0249
UPDATE public.workflow_templates SET line = 'BOTH' WHERE "templateKey" = 'SCENT';

ALTER TABLE public.workflow_template_versions DISABLE TRIGGER workflow_template_versions_guard;
UPDATE public.workflow_template_versions SET line = 'BOTH' WHERE "templateKey" = 'SCENT';
ALTER TABLE public.workflow_template_versions ENABLE TRIGGER workflow_template_versions_guard;

-- ── 4) แม่แบบสายบริการ 3 ใบ + เวอร์ชัน 1 ที่ก๊อปมาจากใบสายสินค้าคู่กัน ──
ALTER TABLE public.workflow_template_steps DISABLE TRIGGER workflow_template_steps_guard;

DO $$
DECLARE
  v_pair       record;
  v_source     public.workflow_template_versions%ROWTYPE;
  v_version_id text;
BEGIN
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('SERVICE-NPD',      'NPD',      'workflow-service-npd-v1',      'งานพัฒนาสินค้า · สายบริการ'),
      ('SERVICE-RE-ORDER', 'RE-ORDER', 'workflow-service-re-order-v1', 'งานสั่งผลิตซ้ำ · สายบริการ'),
      ('SERVICE-OTHER',    'OTHER',    'workflow-service-other-v1',    'งานอื่นๆ · สายบริการ')
    ) AS t("targetKey", "sourceKey", "versionId", "nameTh")
  LOOP
    v_version_id := v_pair."versionId";

    -- ใบต้นทาง = เวอร์ชันที่เผยแพร่อยู่ของสายสินค้า · ไม่มี = หยุดพร้อมบอกสาเหตุ
    -- (ก๊อปจากที่ไม่มีอยู่จริงแล้วได้แม่แบบเปล่า = ดีลสายบริการ gen ไม่ได้เงียบ ๆ)
    SELECT v.* INTO v_source
    FROM public.workflow_template_versions v
    JOIN public.workflow_templates r ON r."publishedVersionId" = v.id
    WHERE r."templateKey" = v_pair."sourceKey";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ไม่พบเวอร์ชันเผยแพร่ของแม่แบบ % — ก๊อปไปเป็นสายบริการไม่ได้', v_pair."sourceKey";
    END IF;

    INSERT INTO public.workflow_templates ("templateKey", line)
    VALUES (v_pair."targetKey", 'SERVICE')
    ON CONFLICT ("templateKey") DO NOTHING;

    INSERT INTO public.workflow_template_versions (
      id, "templateKey", line, "versionNumber", status, "nameTh", description, "changeNote",
      "createdById", "createdByName", "createdByRole",
      "updatedById", "updatedByName", "updatedByRole",
      "publishedById", "publishedByName", "publishedByRole", "publishedAt"
    )
    VALUES (
      v_version_id, v_pair."targetKey", 'SERVICE', 1, 'published', v_pair."nameTh",
      'ก๊อปขั้นตอนมาจากแม่แบบสายสินค้าเป็นจุดตั้งต้น — แก้ให้เป็นเส้นทางของงานบริการได้ที่หน้าตั้งค่า',
      'ตั้งต้นจาก ' || v_pair."sourceKey" || ' ตามมติผู้ใช้ 2026-08-20',
      'migration-0276', 'Migration 0276', 'system',
      'migration-0276', 'Migration 0276', 'system',
      'migration-0276', 'Migration 0276', 'system', now()
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.workflow_template_steps (
      id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase,
      "isMilestone", "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude"
    )
    SELECT
      v_version_id || '-' || s."stepKey", v_version_id, s."stepKey", s."stepOrder", s.name, s.role,
      s."durationDays", s.phase, s."isMilestone", s."dependencyMode", s."dependsOnStepKeys",
      s."categoryOnly", s."categoryExclude"
    FROM public.workflow_template_steps s
    WHERE s."versionId" = v_source.id
    ORDER BY s."stepOrder"
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.workflow_templates
       SET "publishedVersionId" = v_version_id, "updatedAt" = now()
     WHERE "templateKey" = v_pair."targetKey" AND "publishedVersionId" IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.workflow_template_steps ENABLE TRIGGER workflow_template_steps_guard;

COMMIT;

NOTIFY pgrst, 'reload schema';
