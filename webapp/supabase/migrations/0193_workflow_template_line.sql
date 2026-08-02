-- ============================================================
--  Migration 0193: workflow_templates.line / workflow_template_versions.line
--  แผน docs/business-line-level-and-handoff.md §1 · L-2b ใบที่ 1 จาก 2
--
--  ⭐ ปลายทาง: แม่แบบไทม์ไลน์ถูกเลือกด้วยคู่ **(project.line, deal.type)**
--  วันนี้ `workflow_templates."templateKey"` เป็น PK ค่าเดียว ⇒ มี 'NPD' ได้ใบเดียว
--  ทั้งระบบ · จะมี NPD ของสายสินค้ากับ NPD ของสายบริการพร้อมกันไม่ได้
--
--  ⚠️ **ใบนี้เตรียมคอลัมน์อย่างเดียว ยังไม่แตะ PK/FK** — ตั้งใจแยกเป็นสองใบ
--  เพราะการย้าย PK ต้องรื้อ FK ของ versions + UNIQUE + 3 partial index + RPC 4 ตัว
--  (create/publish/discard/archive draft) + trigger guard · รันใบนี้แล้วยืนยัน
--  backfill บน prod ก่อน แล้วค่อยรันใบโครงสร้าง (0194) จะกลับตัวได้ถ้าพลาด
--
--  ⚠️ **NOT NULL ที่นี่ ต่างจาก `projects.line` (0191) ที่ปล่อย NULL ได้ — ตั้งใจ**
--    · projects: NULL = "คนยังไม่ตัดสิน" เป็นสถานะที่ถูกต้อง มีตัวนับมาทวง
--    · templates: NULL = "แม่แบบที่ไม่มีทางถูกค้นเจอด้วย (line, type)" = ไร้ประโยชน์
--    และของเดิมมีแค่ 3 แถว (SCENT/NPD/RE-ORDER) ซึ่งเป็นสายสินค้าทั้งหมดชัดเจน
--
--  ⚠ additive ล้วน · รันซ้ำได้ · ไม่กระทบ 123 project_tasks ที่ปักหมุดไว้แล้ว
--    เพราะ task ปักที่ `workflowTemplateVersionId` (id ของ version) ไม่ใช่ templateKey
-- ============================================================

BEGIN;

-- ── 1) เพิ่มคอลัมน์ (ยังปล่อย NULL เพื่อให้ backfill ทำงานได้) ────────────
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS line text;
ALTER TABLE public.workflow_template_versions
  ADD COLUMN IF NOT EXISTS line text;

-- ── 2) backfill: ของเดิมทั้งหมดเป็นสายสินค้า ────────────────────────────
-- ⚠️ ระบุค่าตรง ๆ เพราะ**รู้จริง** ไม่ใช่ค่าตั้งต้นของคอลัมน์ — SCENT/NPD/RE-ORDER
-- ทั้งสามเป็นเส้นทางที่จบเมื่อของออกจากบริษัท (มติ #868) · แม่แบบสายบริการยัง
-- ไม่มีสักใบ จะมาใน L-2b ใบถัดไป
--
-- 🔴 **รอบแรกใบนี้ล้มตรงนี้บน prod** (2026-08-02):
--      ERROR P0001: workflow_template_version_published_immutable
--    `guard_workflow_template_version()` บล็อก UPDATE **ทุกชนิด** บนแถวที่ไม่ใช่
--    draft — ไม่ได้ดูว่าแก้คอลัมน์ไหน:
--      · status='archived'  → archived_immutable
--      · status='published' → published_immutable
--    prod มี 6 แถว = published 3 + archived 3 ⇒ **ไม่มีแถวไหน update ได้เลย**
--
--    ⇒ ปิด trigger เฉพาะช่วง backfill แล้วเปิดคืนทันที · ทั้งหมดอยู่ใน
--      BEGIN…COMMIT เดียวกัน และ DDL ใน Postgres เป็น transactional
--      ⇒ ถ้าใบนี้ล้มกลางคัน trigger จะกลับมาเปิดเองพร้อม rollback
--    ⚠️ ตารางแม่ `workflow_templates` **ไม่มี trigger** จึง update ตรง ๆ ได้
UPDATE public.workflow_templates SET line = 'PRODUCT' WHERE line IS NULL;

ALTER TABLE public.workflow_template_versions DISABLE TRIGGER workflow_template_versions_guard;
UPDATE public.workflow_template_versions SET line = 'PRODUCT' WHERE line IS NULL;
ALTER TABLE public.workflow_template_versions ENABLE TRIGGER workflow_template_versions_guard;

-- ── 3) ปิดประตู: ห้าม NULL และห้ามค่านอกชุด ─────────────────────────────
ALTER TABLE public.workflow_templates          ALTER COLUMN line SET NOT NULL;
ALTER TABLE public.workflow_template_versions  ALTER COLUMN line SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.workflow_templates'::regclass
                   AND conname = 'workflow_templates_line_check') THEN
    ALTER TABLE public.workflow_templates
      ADD CONSTRAINT workflow_templates_line_check
      CHECK (line IN ('PRODUCT', 'SERVICE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.workflow_template_versions'::regclass
                   AND conname = 'workflow_template_versions_line_check') THEN
    ALTER TABLE public.workflow_template_versions
      ADD CONSTRAINT workflow_template_versions_line_check
      CHECK (line IN ('PRODUCT', 'SERVICE'));
  END IF;
END $$;

-- ── 4) guard: `line` ของเวอร์ชันห้ามเปลี่ยนหลังจากนี้ ───────────────────
-- เวอร์ชันเป็นของแม่แบบใบไหน = ตัวตน ไม่ใช่เนื้อหา · ปล่อยให้แก้ได้เมื่อไหร่
-- เวอร์ชันจะหลุดไปอยู่คนละสายกับแม่แบบต้นสังกัดโดยไม่มีอะไรฟ้อง
--
-- ⚠️ **คัดนิยามล่าสุดมาทั้งดวงจาก 0136:197** แล้วเพิ่มเงื่อนไขเดียว — ตรวจแล้วว่า
--   ไม่มีใบไหนหลัง 0136 แก้ฟังก์ชันนี้ · ห้ามเขียนใหม่จากความจำ ไม่งั้นด่านอื่น
--   (archived/published/hide_active/transition_payload) จะหายไปเงียบ ๆ
CREATE OR REPLACE FUNCTION public.guard_workflow_template_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'workflow_template_version_delete_forbidden';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."templateKey" IS DISTINCT FROM OLD."templateKey"
     -- ⭐ บรรทัดเดียวที่ต่างจาก 0136: สายธุรกิจเป็นส่วนหนึ่งของตัวตน (mig 0193)
     OR NEW.line IS DISTINCT FROM OLD.line
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
  IF OLD.status = 'published' AND NEW.status = 'archived' AND EXISTS (
    SELECT 1 FROM public.workflow_templates WHERE "publishedVersionId" = OLD.id
  ) THEN
    RAISE EXCEPTION 'workflow_template_version_hide_active_forbidden';
  END IF;
  IF NEW.status <> 'draft' AND (
    NEW."nameTh" IS DISTINCT FROM OLD."nameTh"
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN RAISE EXCEPTION 'workflow_template_version_transition_payload_changed'; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.workflow_templates.line IS
  'สายธุรกิจของแม่แบบ PRODUCT|SERVICE — คู่กับ templateKey จะกลายเป็น PK ใน 0194';
COMMENT ON COLUMN public.workflow_template_versions.line IS
  'สำเนาสายธุรกิจของแม่แบบต้นสังกัด — ต้องตรงกับ workflow_templates.line เสมอ (FK คู่ใน 0194)';

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
