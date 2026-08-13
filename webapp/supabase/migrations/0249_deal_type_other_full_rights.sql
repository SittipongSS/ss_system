-- ============================================================
--  Migration 0249: 'OTHER' (อื่นๆ) ได้สิทธิ์เท่าประเภทดีลอื่น  (มติผู้ใช้ 2026-08-13)
--
--  ⭐ กลับมติของ mig 0247 · ตอนนั้นตกลงกันว่า 'OTHER' เป็นประเภทฝั่งขายล้วน
--  ไม่ก่อตั้งโครงการ · มติใหม่: **ให้สิทธิ์เท่าอีกสามประเภท** ⇒ สร้างโครงการ /
--  ผูกโครงการเดิม / มีไทม์ไลน์ได้เหมือน SCENT / NPD / RE-ORDER
--
--  สามอย่างที่ต้องเปิดพร้อมกัน ไม่งั้นเปิดครึ่งเดียวแล้วพังคนละจุด:
--    1) `projects_type_check`              — โครงการเก็บ type='OTHER' ได้
--    2) `workflow_templates."templateKey"` — มีแม่แบบไทม์ไลน์ของ 'OTHER' ได้
--    3) แถวแม่แบบ + เวอร์ชันเผยแพร่ + ขั้นตอนจริง — ระบบเลือกแม่แบบจากประเภทดีล
--       **แม่แบบว่าง = กดสร้างโครงการแล้วเด้ง** ต้องมีอย่างน้อยหนึ่งขั้น
--
--  ขั้นตอนตั้งต้น 2 ขั้น: ใบเสนอราคา → ใบสั่งขาย (มติผู้ใช้ — "เอาแค่นี้ก่อน")
--  ตั้งใจให้น้อยแล้วไปเพิ่มเองที่ /settings/workflow-templates ดีกว่าก๊อป 20 ขั้น
--  ของ NPD มาแล้วต้องมาไล่ลบทีหลัง
--
--  ⚠️ `line` ของแม่แบบใบนี้เป็น 'PRODUCT' ตามอีกสามใบ (mig 0193 บังคับ NOT NULL
--  และวันนี้ยังไม่มีแม่แบบสายบริการสักใบ) · ตัวค้นแม่แบบตอน gen ยังใช้ templateKey
--  อย่างเดียว คอลัมน์นี้จึงยังไม่เปลี่ยนพฤติกรรมอะไร — รอ PK คู่ (line, templateKey)
--
--  🐞 **พ่วงแก้บั๊กที่บล็อกการแก้แม่แบบทุกใบ ไม่ใช่แค่ใบใหม่**
--  `create_workflow_template_draft` (mig 0121) INSERT เวอร์ชันร่างโดยไม่ใส่ `line`
--  แต่ mig 0193 ตั้ง `workflow_template_versions.line` เป็น NOT NULL **โดยไม่มี
--  DEFAULT** ⇒ กด "สร้างฉบับร่าง" ที่หน้าตั้งค่าแล้วตายที่
--      null value in column "line" violates not-null constraint
--  ใบนี้จึง CREATE OR REPLACE ให้ร่างสืบ `line` จากแม่แบบต้นสังกัด
--
--  ⚠ additive + idempotent · ไม่มี backfill (ดีล NPD เดิมไม่มีทางรู้ว่าใบไหน
--    "จริง ๆ แล้วเป็นอื่นๆ" — ให้ AE ย้ายเองทีละใบ เหมือนที่ mig 0247 ตั้งไว้)
--  ⚠ รันมือบน Supabase SQL Editor
--  🛑 **ต้องรันก่อน deploy** — โค้ดใหม่เลิกกัน 'OTHER' ทันทีที่ขึ้น
-- ============================================================

BEGIN;

-- ── 1) โครงการรับ type='OTHER' ──────────────────────────────────────────
-- ชื่อ constraint ตั้งไว้ตรง ๆ ตั้งแต่ mig 0088 (ดู projects_type_check ที่นั่น)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_type_check
  CHECK ("type" IN ('SCENT', 'NPD', 'RE-ORDER', 'OTHER'));

-- ── 2) แม่แบบไทม์ไลน์รับ templateKey='OTHER' ────────────────────────────
-- ⚠️ CHECK ตัวนี้เขียนติดกับคอลัมน์ใน CREATE TABLE (mig 0121) ชื่อจึงถูก Postgres
-- ตั้งให้เอง — ค้นจาก pg_constraint แทนการเดาชื่อ (เคยเดาแล้วพลาดมาแล้ว)
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
  CHECK ("templateKey" IN ('SCENT', 'NPD', 'RE-ORDER', 'OTHER'));

-- ── 3) แม่แบบของ 'OTHER' พร้อมใช้ตั้งแต่รันเสร็จ ────────────────────────
INSERT INTO public.workflow_templates ("templateKey", line)
VALUES ('OTHER', 'PRODUCT')
ON CONFLICT ("templateKey") DO NOTHING;

-- เวอร์ชัน 1 เผยแพร่เลย — ปล่อยเป็นร่างไว้ = สร้างโครงการยังไม่ได้อยู่ดี
-- (versions guard เป็น BEFORE UPDATE OR DELETE เท่านั้น INSERT จึงผ่านตรง ๆ)
INSERT INTO public.workflow_template_versions (
  id, "templateKey", line, "versionNumber", status, "nameTh", description, "changeNote",
  "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
VALUES (
  'workflow-other-v1', 'OTHER', 'PRODUCT', 1, 'published', 'งานอื่นๆ',
  'ขั้นตอนตั้งต้นของงานขายที่ไม่เข้าสามประเภทหลัก — เพิ่มขั้นเองได้ที่หน้าตั้งค่า',
  'ตั้งต้น 2 ขั้นตามมติผู้ใช้ 2026-08-13',
  'migration-0249', 'Migration 0249', 'system',
  'migration-0249', 'Migration 0249', 'system',
  'migration-0249', 'Migration 0249', 'system', now()
)
ON CONFLICT (id) DO NOTHING;

/* ⚠️ ต่างจาก versions: `workflow_template_steps_guard` เป็น BEFORE **INSERT** OR
   UPDATE OR DELETE และปฏิเสธทุกแถวที่เวอร์ชันแม่ไม่ใช่ 'draft'
   (workflow_template_steps_immutable) ⇒ ใส่ขั้นเข้าเวอร์ชันที่เผยแพร่แล้วไม่ได้
   ปิดทริกเกอร์ชั่วคราวในทรานแซกชันเดียวกัน — precedent เดียวกับ mig 0131/0193 */
ALTER TABLE public.workflow_template_steps DISABLE TRIGGER workflow_template_steps_guard;

INSERT INTO public.workflow_template_steps (
  id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase,
  "isMilestone", "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude"
)
VALUES
  ('workflow-other-v1-other-01', 'workflow-other-v1', 'other-01', 0, 'ใบเสนอราคา', 'SA', 1, 'กระบวนการขายและบริการ', false, 'root', '[]'::jsonb, NULL, NULL),
  ('workflow-other-v1-other-02', 'workflow-other-v1', 'other-02', 1, 'ใบสั่งขาย', 'SA', 1, 'กระบวนการขายและบริการ', true, 'sequential', '[]'::jsonb, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.workflow_template_steps ENABLE TRIGGER workflow_template_steps_guard;

-- ชี้เวอร์ชันเผยแพร่ปัจจุบันของแม่แบบ (FK → workflow_template_versions.id)
UPDATE public.workflow_templates
  SET "publishedVersionId" = 'workflow-other-v1', "updatedAt" = now()
  WHERE "templateKey" = 'OTHER' AND "publishedVersionId" IS NULL;

-- ── 4) 🐞 ร่างใหม่ต้องสืบ `line` จากแม่แบบต้นสังกัด ─────────────────────
-- เหมือน mig 0121 ทุกบรรทัด ต่างแค่เพิ่ม line เข้า INSERT (ดูหัวไฟล์)
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
    id, "templateKey", line, "baseVersionId", "versionNumber", status, "nameTh", description, "changeNote",
    "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_draft_id, p_template_key, v_root.line, v_published.id, v_next, 'draft', v_published."nameTh", v_published.description, NULL,
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

COMMIT;

NOTIFY pgrst, 'reload schema';
