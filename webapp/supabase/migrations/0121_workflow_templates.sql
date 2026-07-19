-- 0121 - Phase 4B: versioned Workflow/Timeline templates.
--
-- Published/Archived versions are immutable. New PM task segments pin the
-- exact version + stable step key used to generate them; existing tasks remain
-- NULL and keep the legacy compatibility path without a destructive backfill.

CREATE TABLE IF NOT EXISTS public.workflow_templates (
  "templateKey"        text PRIMARY KEY CHECK ("templateKey" IN ('SCENT', 'NPD', 'RE-ORDER')),
  "publishedVersionId" text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_template_versions (
  id                    text PRIMARY KEY,
  "templateKey"         text NOT NULL REFERENCES public.workflow_templates("templateKey") ON DELETE RESTRICT,
  "baseVersionId"       text REFERENCES public.workflow_template_versions(id) ON DELETE RESTRICT,
  "versionNumber"       integer NOT NULL CHECK ("versionNumber" > 0),
  status                text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  "nameTh"              text NOT NULL CHECK (length(btrim("nameTh")) BETWEEN 1 AND 120),
  description           text CHECK (description IS NULL OR length(description) <= 500),
  "changeNote"          text CHECK ("changeNote" IS NULL OR length("changeNote") <= 500),
  "createdById"         text NOT NULL,
  "createdByName"       text,
  "createdByRole"       text,
  "updatedById"         text NOT NULL,
  "updatedByName"       text,
  "updatedByRole"       text,
  "publishedById"       text,
  "publishedByName"     text,
  "publishedByRole"     text,
  "archivedById"        text,
  "archivedByName"      text,
  "archivedByRole"      text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  "publishedAt"         timestamptz,
  "archivedAt"          timestamptz,
  UNIQUE ("templateKey", "versionNumber"),
  CHECK (status <> 'draft' OR ("publishedAt" IS NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'published' OR ("publishedAt" IS NOT NULL AND "archivedAt" IS NULL)),
  CHECK (status <> 'archived' OR "archivedAt" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.workflow_template_steps (
  id                     text PRIMARY KEY,
  "versionId"            text NOT NULL REFERENCES public.workflow_template_versions(id) ON DELETE RESTRICT,
  "stepKey"              text NOT NULL CHECK ("stepKey" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  "stepOrder"            integer NOT NULL CHECK ("stepOrder" >= 0),
  name                    text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  role                    text NOT NULL CHECK (role IN ('SA', 'RD', 'PC', 'PD', 'QC', 'LG', 'WH', 'ALL')),
  "durationDays"          integer NOT NULL DEFAULT 1 CHECK ("durationDays" BETWEEN 0 AND 365),
  phase                   text CHECK (phase IS NULL OR length(phase) <= 120),
  "isMilestone"           boolean NOT NULL DEFAULT false,
  "dependencyMode"        text NOT NULL DEFAULT 'sequential' CHECK ("dependencyMode" IN ('sequential', 'root', 'custom')),
  "dependsOnStepKeys"     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("dependsOnStepKeys") = 'array'),
  "categoryOnly"          text CHECK ("categoryOnly" IS NULL OR length("categoryOnly") <= 20),
  "categoryExclude"       text CHECK ("categoryExclude" IS NULL OR length("categoryExclude") <= 20),
  "createdAt"             timestamptz NOT NULL DEFAULT now(),
  "updatedAt"             timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("versionId", "stepKey"),
  UNIQUE ("versionId", "stepOrder"),
  CHECK ("categoryOnly" IS NULL OR "categoryExclude" IS NULL OR "categoryOnly" <> "categoryExclude"),
  CHECK ("dependencyMode" = 'custom' OR "dependsOnStepKeys" = '[]'::jsonb),
  CHECK ("dependencyMode" <> 'custom' OR jsonb_array_length("dependsOnStepKeys") > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_templates_published_version_fk'
  ) THEN
    ALTER TABLE public.workflow_templates
      ADD CONSTRAINT workflow_templates_published_version_fk
      FOREIGN KEY ("publishedVersionId") REFERENCES public.workflow_template_versions(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_template_versions_one_draft_idx
  ON public.workflow_template_versions ("templateKey") WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS workflow_template_versions_one_published_idx
  ON public.workflow_template_versions ("templateKey") WHERE status = 'published';
CREATE INDEX IF NOT EXISTS workflow_template_versions_history_idx
  ON public.workflow_template_versions ("templateKey", "versionNumber" DESC);
CREATE INDEX IF NOT EXISTS workflow_template_steps_version_order_idx
  ON public.workflow_template_steps ("versionId", "stepOrder");

INSERT INTO public.workflow_templates ("templateKey")
VALUES ('SCENT'), ('NPD'), ('RE-ORDER')
ON CONFLICT ("templateKey") DO NOTHING;

INSERT INTO public.workflow_template_versions (
  id, "templateKey", "versionNumber", status, "nameTh", description, "changeNote",
  "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
VALUES
  ('workflow-scent-v1', 'SCENT', 1, 'published', 'งานพัฒนากลิ่น', 'กระบวนการขายและออกแบบกลิ่น', 'นำเข้าจากค่าเริ่มต้นของระบบก่อน Phase 4B', 'migration-0121', 'Migration 0121', 'system', 'migration-0121', 'Migration 0121', 'system', 'migration-0121', 'Migration 0121', 'system', now()),
  ('workflow-npd-v1', 'NPD', 1, 'published', 'งานพัฒนาสินค้า', 'ตั้งแต่ Mock-up ถึงส่งมอบสินค้า', 'นำเข้าจากค่าเริ่มต้นของระบบก่อน Phase 4B', 'migration-0121', 'Migration 0121', 'system', 'migration-0121', 'Migration 0121', 'system', 'migration-0121', 'Migration 0121', 'system', now()),
  ('workflow-reorder-v1', 'RE-ORDER', 1, 'published', 'งานสั่งผลิตซ้ำ', 'เตรียมการผลิตจนถึงส่งมอบสินค้าสั่งซ้ำ', 'นำเข้าจากค่าเริ่มต้นของระบบก่อน Phase 4B', 'migration-0121', 'Migration 0121', 'system', 'migration-0121', 'Migration 0121', 'system', 'migration-0121', 'Migration 0121', 'system', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_template_steps (
  id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase,
  "isMilestone", "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude"
)
VALUES
('workflow-scent-v1-scent-01', 'workflow-scent-v1', 'scent-01', 0, 'ประชุมลูกค้า', 'SA', 3, 'กระบวนการขายและบริการ', false, 'root', '[]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-02', 'workflow-scent-v1', 'scent-02', 1, 'ใบเสนอราคาออกแบบกลิ่น', 'SA', 1, 'กระบวนการขายและบริการ', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-03', 'workflow-scent-v1', 'scent-03', 2, 'สัญญาออกแบบกลิ่น', 'SA', 1, 'กระบวนการขายและบริการ', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-04', 'workflow-scent-v1', 'scent-04', 3, 'ใบสั่งขายออกแบบกลิ่น', 'SA', 1, 'กระบวนการขายและบริการ', false, 'custom', '["scent-03"]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-05', 'workflow-scent-v1', 'scent-05', 4, 'กรอกแบบฟอร์ม (PDR)', 'SA', 1, 'กระบวนการขายและบริการ', false, 'custom', '["scent-03"]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-06', 'workflow-scent-v1', 'scent-06', 5, 'ออกแบบกลิ่น', 'RD', 20, 'พัฒนาสูตร / ออกแบบกลิ่น', false, 'custom', '["scent-04","scent-05"]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-07', 'workflow-scent-v1', 'scent-07', 6, 'ส่งกลิ่น ครั้งที่ 1', 'RD', 3, 'พัฒนาสูตร / ออกแบบกลิ่น', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-scent-v1-scent-08', 'workflow-scent-v1', 'scent-08', 7, 'Feedback/Confirm กลิ่น ครั้งที่ 1', 'SA', 3, 'พัฒนาสูตร / ออกแบบกลิ่น', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-15', 'workflow-npd-v1', 'npd-15', 0, 'ขึ้น Mock-up สินค้า', 'RD', 10, 'ขึ้นต้นแบบ (Mock-up)', false, 'root', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-16', 'workflow-npd-v1', 'npd-16', 1, 'ส่ง Mock-up ครั้งที่ 1', 'RD', 3, 'ขึ้นต้นแบบ (Mock-up)', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-17', 'workflow-npd-v1', 'npd-17', 2, 'Feedback/Confirm Mock-up ครั้งที่ 1', 'SA', 3, 'ขึ้นต้นแบบ (Mock-up)', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-25', 'workflow-npd-v1', 'npd-25', 3, 'หาบรรจุภัณฑ์ที่ลูกค้าต้องการ', 'PC', 30, 'เตรียมการผลิต', false, 'root', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-26', 'workflow-npd-v1', 'npd-26', 4, 'ใบเสนอราคาผลิต', 'SA', 1, 'เตรียมการผลิต', false, 'custom', '["npd-17"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-27', 'workflow-npd-v1', 'npd-27', 5, 'สัญญาจ้างผลิต', 'SA', 2, 'เตรียมการผลิต', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-28', 'workflow-npd-v1', 'npd-28', 6, 'ใบสั่งขายผลิต', 'SA', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-29', 'workflow-npd-v1', 'npd-29', 7, 'FM-SA-04 เอกสารระบุรายละเอียดผลิตภัณฑ์', 'SA', 1, 'เตรียมการผลิต', false, 'custom', '["npd-28"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-30', 'workflow-npd-v1', 'npd-30', 8, 'FM-SA-07 ใบรายงานติดตามคำสั่งซื้อ', 'SA', 1, 'เตรียมการผลิต', false, 'custom', '["npd-28"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-31', 'workflow-npd-v1', 'npd-31', 9, 'ขึ้นทะเบียนสรรพสามิต [Optional]', 'LG', 7, 'เตรียมการผลิต', true, 'custom', '["npd-29","npd-30"]'::jsonb, '01-002', NULL),
('workflow-npd-v1-npd-32', 'workflow-npd-v1', 'npd-32', 10, 'ส่ง Check list Planner', 'SA', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-33', 'workflow-npd-v1', 'npd-33', 11, 'นัดประชุมระหว่างแผนก', 'ALL', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-34', 'workflow-npd-v1', 'npd-34', 12, 'ส่งเรื่องให้ RD ลง BOM / PC ตั้ง Code', 'PD', 1, 'ผลิต — New Product', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-35', 'workflow-npd-v1', 'npd-35', 13, 'ลง BOM ใน Express', 'RD', 3, 'ผลิต — New Product', false, 'custom', '["npd-34"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-36', 'workflow-npd-v1', 'npd-36', 14, 'ตั้ง Code', 'PC', 2, 'ผลิต — New Product', false, 'custom', '["npd-34"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-37', 'workflow-npd-v1', 'npd-37', 15, 'ทำเอกสาร PR', 'PD', 2, 'ผลิต — New Product', false, 'custom', '["npd-35","npd-36"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-38', 'workflow-npd-v1', 'npd-38', 16, 'สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด', 'PC', 45, 'ผลิต — New Product', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-39', 'workflow-npd-v1', 'npd-39', 17, 'QC สินค้า (ขาเข้า)', 'QC', 3, 'QC / ผลิตสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-40', 'workflow-npd-v1', 'npd-40', 18, 'เบิกของเข้าไลน์ผลิต', 'PD', 7, 'QC / ผลิตสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-41', 'workflow-npd-v1', 'npd-41', 19, 'ผลิตสินค้า', 'PD', 3, 'QC / ผลิตสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-42', 'workflow-npd-v1', 'npd-42', 20, 'ส่งมอบของให้คลัง', 'PD', 1, 'QC / ผลิตสินค้า', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-43', 'workflow-npd-v1', 'npd-43', 21, 'วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต [Optional]', 'SA', 7, 'ส่งมอบสินค้า', false, 'custom', '["npd-42"]'::jsonb, '01-002', NULL),
('workflow-npd-v1-npd-44', 'workflow-npd-v1', 'npd-44', 22, 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)', 'SA', 1, 'ส่งมอบสินค้า', false, 'custom', '["npd-42"]'::jsonb, NULL, '01-002'),
('workflow-npd-v1-npd-45', 'workflow-npd-v1', 'npd-45', 23, 'รับชำระเงิน / ยืนยันการโอน', 'SA', 1, 'ส่งมอบสินค้า', true, 'custom', '["npd-43","npd-44"]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-46', 'workflow-npd-v1', 'npd-46', 24, 'ทำใบส่งของ (QD)', 'WH', 1, 'ส่งมอบสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-npd-v1-npd-47', 'workflow-npd-v1', 'npd-47', 25, 'จัดส่งสินค้า', 'WH', 1, 'ส่งมอบสินค้า', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-01', 'workflow-reorder-v1', 'reorder-01', 0, 'ใบเสนอราคาผลิต', 'SA', 1, 'เตรียมการผลิต', false, 'root', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-02', 'workflow-reorder-v1', 'reorder-02', 1, 'สัญญาจ้างผลิต', 'SA', 2, 'เตรียมการผลิต', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-03', 'workflow-reorder-v1', 'reorder-03', 2, 'ใบสั่งขายผลิต', 'SA', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-04', 'workflow-reorder-v1', 'reorder-04', 3, 'FM-SA-04 เอกสารระบุรายละเอียดผลิตภัณฑ์', 'SA', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-05', 'workflow-reorder-v1', 'reorder-05', 4, 'FM-SA-07 ใบรายงานติดตามคำสั่งซื้อ', 'SA', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-07', 'workflow-reorder-v1', 'reorder-07', 5, 'ส่ง Check list Planner', 'SA', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-08', 'workflow-reorder-v1', 'reorder-08', 6, 'นัดประชุมระหว่างแผนก', 'ALL', 1, 'เตรียมการผลิต', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-09', 'workflow-reorder-v1', 'reorder-09', 7, 'Planner Check วัตถุดิบ', 'PD', 2, 'ผลิต — Re-order', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-10', 'workflow-reorder-v1', 'reorder-10', 8, 'ทำเอกสาร PR', 'PD', 2, 'ผลิต — Re-order', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-11', 'workflow-reorder-v1', 'reorder-11', 9, 'สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด', 'PC', 45, 'ผลิต — Re-order', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-12', 'workflow-reorder-v1', 'reorder-12', 10, 'QC สินค้า (ขาเข้า)', 'QC', 3, 'QC / ผลิตสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-13', 'workflow-reorder-v1', 'reorder-13', 11, 'เบิกของเข้าไลน์ผลิต', 'PD', 7, 'QC / ผลิตสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-14', 'workflow-reorder-v1', 'reorder-14', 12, 'ผลิตสินค้า', 'PD', 3, 'QC / ผลิตสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-15', 'workflow-reorder-v1', 'reorder-15', 13, 'ส่งมอบของให้คลัง', 'PD', 1, 'QC / ผลิตสินค้า', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-16', 'workflow-reorder-v1', 'reorder-16', 14, 'วางบิลสินค้าก่อนส่ง + ค่าสรรพสามิต [Optional]', 'SA', 7, 'ส่งมอบสินค้า', false, 'sequential', '[]'::jsonb, '01-002', NULL),
('workflow-reorder-v1-reorder-17', 'workflow-reorder-v1', 'reorder-17', 15, 'วางบิลสินค้าก่อนส่ง (ไม่มีสรรพสามิต)', 'SA', 1, 'ส่งมอบสินค้า', false, 'sequential', '[]'::jsonb, NULL, '01-002'),
('workflow-reorder-v1-reorder-18', 'workflow-reorder-v1', 'reorder-18', 16, 'รับชำระเงิน / ยืนยันการโอน', 'SA', 1, 'ส่งมอบสินค้า', true, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-19', 'workflow-reorder-v1', 'reorder-19', 17, 'ทำใบส่งของ (QD)', 'WH', 1, 'ส่งมอบสินค้า', false, 'sequential', '[]'::jsonb, NULL, NULL),
('workflow-reorder-v1-reorder-20', 'workflow-reorder-v1', 'reorder-20', 18, 'จัดส่งสินค้า', 'WH', 1, 'ส่งมอบสินค้า', true, 'sequential', '[]'::jsonb, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

UPDATE public.workflow_templates
SET "publishedVersionId" = CASE "templateKey"
  WHEN 'SCENT' THEN 'workflow-scent-v1'
  WHEN 'NPD' THEN 'workflow-npd-v1'
  WHEN 'RE-ORDER' THEN 'workflow-reorder-v1'
END, "updatedAt" = now()
WHERE "publishedVersionId" IS NULL;

CREATE OR REPLACE FUNCTION public.guard_workflow_template_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'workflow_template_version_delete_forbidden'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."templateKey" IS DISTINCT FROM OLD."templateKey"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'workflow_template_version_identity_immutable';
  END IF;
  IF OLD.status = 'archived' THEN RAISE EXCEPTION 'workflow_template_version_archived_immutable'; END IF;
  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'workflow_template_version_published_immutable';
  END IF;
  IF NEW.status <> 'draft' AND (
    NEW."nameTh" IS DISTINCT FROM OLD."nameTh"
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN RAISE EXCEPTION 'workflow_template_version_transition_payload_changed'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_template_versions_guard ON public.workflow_template_versions;
CREATE TRIGGER workflow_template_versions_guard
BEFORE UPDATE OR DELETE ON public.workflow_template_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_workflow_template_version();

CREATE OR REPLACE FUNCTION public.guard_workflow_template_step()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_version_id text; v_status text;
BEGIN
  v_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."versionId" ELSE NEW."versionId" END;
  SELECT status INTO v_status FROM public.workflow_template_versions WHERE id = v_version_id;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'workflow_template_steps_immutable'; END IF;
  IF TG_OP = 'UPDATE' AND NEW."versionId" IS DISTINCT FROM OLD."versionId" THEN
    RAISE EXCEPTION 'workflow_template_step_version_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS workflow_template_steps_guard ON public.workflow_template_steps;
CREATE TRIGGER workflow_template_steps_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.workflow_template_steps
FOR EACH ROW EXECUTE FUNCTION public.guard_workflow_template_step();

CREATE OR REPLACE FUNCTION public.create_workflow_template_draft(
  p_template_key text, p_draft_id text, p_actor_id text, p_actor_name text, p_actor_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_root public.workflow_templates%ROWTYPE; v_published public.workflow_template_versions%ROWTYPE;
  v_draft public.workflow_template_versions%ROWTYPE; v_next integer; v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN RAISE EXCEPTION 'workflow_template_actor_required'; END IF;
  SELECT * INTO v_root FROM public.workflow_templates WHERE "templateKey" = p_template_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_template_versions WHERE "templateKey" = p_template_key AND status = 'draft') THEN
    RAISE EXCEPTION 'workflow_template_draft_exists';
  END IF;
  SELECT * INTO v_published FROM public.workflow_template_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_published_missing'; END IF;
  SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
  FROM public.workflow_template_versions WHERE "templateKey" = p_template_key;
  INSERT INTO public.workflow_template_versions (
    id, "templateKey", "baseVersionId", "versionNumber", status, "nameTh", description, "changeNote",
    "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_draft_id, p_template_key, v_published.id, v_next, 'draft', v_published."nameTh", v_published.description, NULL,
    p_actor_id, p_actor_name, p_actor_role, p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;
  INSERT INTO public.workflow_template_steps (
    id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase, "isMilestone",
    "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude", "createdAt", "updatedAt"
  ) SELECT
    p_draft_id || '-' || "stepKey", p_draft_id, "stepKey", "stepOrder", name, role, "durationDays", phase,
    "isMilestone", "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude", v_now, v_now
  FROM public.workflow_template_steps WHERE "versionId" = v_published.id ORDER BY "stepOrder";
  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_workflow_template_draft(
  p_version_id text, p_expected_updated_at timestamptz, p_name_th text, p_description text,
  p_change_note text, p_steps jsonb, p_actor_id text, p_actor_name text, p_actor_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_draft public.workflow_template_versions%ROWTYPE; v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.workflow_template_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'workflow_template_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_template_draft_stale'; END IF;
  IF jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'workflow_template_steps_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_steps) s GROUP BY s->>'stepKey' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'workflow_template_step_key_duplicate'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_steps) s
    WHERE NULLIF(btrim(s->>'stepKey'), '') IS NULL OR NULLIF(btrim(s->>'name'), '') IS NULL
      OR (s->>'dependencyMode') NOT IN ('sequential', 'root', 'custom')
      OR (s->>'role') NOT IN ('SA', 'RD', 'PC', 'PD', 'QC', 'LG', 'WH', 'ALL')
  ) THEN RAISE EXCEPTION 'workflow_template_steps_invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_steps) s,
      jsonb_array_elements_text(COALESCE(s->'dependsOnStepKeys', '[]'::jsonb)) dependency
    WHERE s->>'dependencyMode' = 'custom'
      AND (dependency = s->>'stepKey' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_steps) candidate WHERE candidate->>'stepKey' = dependency
      ))
  ) THEN RAISE EXCEPTION 'workflow_template_dependency_invalid'; END IF;

  DELETE FROM public.workflow_template_steps WHERE "versionId" = p_version_id;
  INSERT INTO public.workflow_template_steps (
    id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase, "isMilestone",
    "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude", "createdAt", "updatedAt"
  ) SELECT
    p_version_id || '-' || (s.value->>'stepKey'), p_version_id, s.value->>'stepKey', s.ordinality - 1,
    s.value->>'name', s.value->>'role', (s.value->>'durationDays')::integer, NULLIF(s.value->>'phase', ''),
    COALESCE((s.value->>'isMilestone')::boolean, false), s.value->>'dependencyMode',
    CASE WHEN s.value->>'dependencyMode' = 'custom' THEN COALESCE(s.value->'dependsOnStepKeys', '[]'::jsonb) ELSE '[]'::jsonb END,
    NULLIF(s.value->>'categoryOnly', ''), NULLIF(s.value->>'categoryExclude', ''), v_now, v_now
  FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS s(value, ordinality);

  UPDATE public.workflow_template_versions SET
    "nameTh" = btrim(p_name_th), description = NULLIF(btrim(COALESCE(p_description, '')), ''),
    "changeNote" = NULLIF(btrim(COALESCE(p_change_note, '')), ''), "updatedById" = p_actor_id,
    "updatedByName" = p_actor_name, "updatedByRole" = p_actor_role, "updatedAt" = v_now
  WHERE id = p_version_id RETURNING * INTO v_draft;
  RETURN to_jsonb(v_draft);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_workflow_template_draft_atomic(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_root public.workflow_templates%ROWTYPE; v_draft public.workflow_template_versions%ROWTYPE;
  v_published public.workflow_template_versions%ROWTYPE; v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.workflow_template_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_version_not_found'; END IF;
  SELECT * INTO v_root FROM public.workflow_templates WHERE "templateKey" = v_draft."templateKey" FOR UPDATE;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'workflow_template_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_template_draft_stale'; END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN RAISE EXCEPTION 'workflow_template_change_note_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workflow_template_steps WHERE "versionId" = v_draft.id) THEN
    RAISE EXCEPTION 'workflow_template_steps_invalid';
  END IF;
  SELECT * INTO v_published FROM public.workflow_template_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_published_missing'; END IF;
  UPDATE public.workflow_template_versions SET status = 'archived', "archivedById" = p_actor_id,
    "archivedByName" = p_actor_name, "archivedByRole" = p_actor_role, "archivedAt" = v_now, "updatedAt" = v_now
  WHERE id = v_published.id RETURNING * INTO v_published;
  UPDATE public.workflow_template_versions SET status = 'published', "publishedById" = p_actor_id,
    "publishedByName" = p_actor_name, "publishedByRole" = p_actor_role, "publishedAt" = v_now,
    "updatedById" = p_actor_id, "updatedByName" = p_actor_name, "updatedByRole" = p_actor_role, "updatedAt" = v_now
  WHERE id = v_draft.id RETURNING * INTO v_draft;
  UPDATE public.workflow_templates SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE "templateKey" = v_draft."templateKey";
  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_workflow_template_draft_atomic(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_draft public.workflow_template_versions%ROWTYPE; v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.workflow_template_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'workflow_template_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_template_draft_stale'; END IF;
  UPDATE public.workflow_template_versions SET status = 'archived', "archivedById" = p_actor_id,
    "archivedByName" = p_actor_name, "archivedByRole" = p_actor_role, "archivedAt" = v_now, "updatedAt" = v_now
  WHERE id = p_version_id RETURNING * INTO v_draft;
  RETURN to_jsonb(v_draft);
END;
$$;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS "workflowTemplateVersionId" text,
  ADD COLUMN IF NOT EXISTS "workflowTemplateStepKey" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_workflow_template_provenance_pair_check') THEN
    ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_workflow_template_provenance_pair_check
      CHECK (
        ("workflowTemplateVersionId" IS NULL AND "workflowTemplateStepKey" IS NULL)
        OR ("workflowTemplateVersionId" IS NOT NULL AND "workflowTemplateStepKey" IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_workflow_template_step_fk') THEN
    ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_workflow_template_step_fk
      FOREIGN KEY ("workflowTemplateVersionId", "workflowTemplateStepKey")
      REFERENCES public.workflow_template_steps("versionId", "stepKey") ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS project_tasks_workflow_template_version_idx
  ON public.project_tasks ("workflowTemplateVersionId") WHERE "workflowTemplateVersionId" IS NOT NULL;

-- Keep provenance when restoring PM document snapshots created after Phase 4B.
CREATE OR REPLACE FUNCTION public.pm_restore_snapshot(p_project_id text, p_snapshot_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE v_tasks jsonb; v_deleted int; v_overwritten int; v_recreated int; v_total int;
BEGIN
  SELECT snapshot -> 'tasks' INTO v_tasks FROM public.project_doc_revisions
  WHERE id = p_snapshot_id AND "projectId" = p_project_id;
  IF v_tasks IS NULL OR jsonb_typeof(v_tasks) <> 'array' THEN
    RAISE EXCEPTION 'snapshot_not_found' USING errcode = 'P0002';
  END IF;
  v_total := jsonb_array_length(v_tasks);
  SELECT count(*) INTO v_deleted FROM public.project_tasks pt WHERE pt."projectId" = p_project_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_tasks) e WHERE e->>'id' = pt.id);
  SELECT count(*) INTO v_overwritten FROM public.project_tasks pt WHERE pt."projectId" = p_project_id
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_tasks) e WHERE e->>'id' = pt.id);
  v_recreated := v_total - v_overwritten;
  DELETE FROM public.project_tasks WHERE "projectId" = p_project_id;
  INSERT INTO public.project_tasks (
    "id", "projectId", "stepOrder", "name", "role", "assignee", "assigneeId", "phase", "isMilestone",
    "durationDays", "startDate", "finishDate", "actualFinishDate", "status", "predecessors", "cellsOverride",
    "note", "showNoteInPrint", "origin", "userEdited", "dueDate", "startLocked",
    "workflowTemplateVersionId", "workflowTemplateStepKey", "updatedAt"
  ) SELECT
    t->>'id', p_project_id, COALESCE((t->>'stepOrder')::int, 0), COALESCE(t->>'name', ''),
    COALESCE(t->>'role', 'SA'), t->>'assignee', t->>'assigneeId', t->>'phase',
    COALESCE((t->>'isMilestone')::boolean, false), COALESCE((t->>'durationDays')::int, 1),
    NULLIF(t->>'startDate', '')::date, NULLIF(t->>'finishDate', '')::date,
    NULLIF(t->>'actualFinishDate', '')::date, COALESCE(t->>'status', 'Pending'),
    COALESCE(t->'predecessors', '[]'::jsonb), t->'cellsOverride', COALESCE(t->>'note', ''),
    COALESCE((t->>'showNoteInPrint')::boolean, false), COALESCE(t->>'origin', 'template'),
    COALESCE((t->>'userEdited')::boolean, false), NULLIF(t->>'dueDate', '')::date,
    COALESCE((t->>'startLocked')::boolean, false), NULLIF(t->>'workflowTemplateVersionId', ''),
    NULLIF(t->>'workflowTemplateStepKey', ''), now()
  FROM jsonb_array_elements(v_tasks) t;
  RETURN json_build_object('restored', true, 'deleted', v_deleted, 'recreated', v_recreated, 'overwritten', v_overwritten);
END;
$$;

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workflow_templates, public.workflow_template_versions, public.workflow_template_steps FROM anon, authenticated;
GRANT ALL ON TABLE public.workflow_templates, public.workflow_template_versions, public.workflow_template_steps TO service_role;
REVOKE ALL ON FUNCTION public.create_workflow_template_draft(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_workflow_template_draft(text, timestamptz, text, text, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_workflow_template_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_workflow_template_draft_atomic(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workflow_template_draft(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_workflow_template_draft(text, timestamptz, text, text, text, jsonb, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_workflow_template_draft_atomic(text, timestamptz, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_workflow_template_draft_atomic(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) Remove Phase 4B consumers/UI first and return to static templates.js.
-- 2) Keep version/provenance tables after real projects use a version.
-- 3) Existing pre-0121 tasks remain NULL and are never rebuilt by this migration.

NOTIFY pgrst, 'reload schema';
