-- 0136 - Decision 0012 (แก้ไขครั้งที่ 2): settings lifecycle — discard draft + hide semantics.
--
-- ครอบ 4 surface ควบคุม: organization_settings (0120), workflow_templates (0121),
-- document_standards (0123), commercial_presets (0128) ให้พฤติกรรมตรงกัน:
--
--   1. "ยกเลิกร่าง" = DELETE จริง (discard_*_draft) — ร่างที่ไม่เคยเผยแพร่ไม่ใช่
--      หลักฐาน; หลักฐานเดียวที่เหลือคือ audit log ฝั่ง API. guard trigger เปิดช่อง
--      DELETE เฉพาะแถว status = 'draft' เท่านั้น. ฟังก์ชัน archive_*_draft_atomic
--      เดิมถูกถอดออก (ห้ามมีเส้นทาง archive ร่างอีก).
--   2. เวอร์ชันที่เผยแพร่แล้วลบไม่ได้ — ถูกแทนที่แล้วจึง "ซ่อน" (= archived เดิม:
--      แถว immutable, พ้นสถานะใช้งาน). แถว published/archived เดิมไม่ถูกแตะ.
--   3. ห้ามซ่อนเวอร์ชันที่ root ยังชี้เป็น active: guard trigger บล็อก
--      published -> archived ขณะ root."publishedVersionId" ยังชี้แถวนั้น
--      (*_hide_active_forbidden). publish_*_atomic จึงถูกเรียงลำดับใหม่ให้ปลด
--      pointer ของ root ก่อนซ่อนเวอร์ชันเดิม — ระบบมี active เสมอในทุกเส้นทาง.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) organization_settings (mig 0120)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_organization_setting_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Decision 0012 rev 2: ร่างที่ยังไม่เผยแพร่ยกเลิก (ลบจริง) ได้; สถานะอื่นห้ามลบ
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'organization_setting_version_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'organization_setting_version_identity_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'organization_setting_version_archived_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'organization_setting_version_published_immutable';
  END IF;

  -- ซ่อนได้ต่อเมื่อ root เลิกชี้แถวนี้แล้ว (มีเวอร์ชันใหม่แทน) — ระบบต้องมี active เสมอ
  IF OLD.status = 'published' AND NEW.status = 'archived' AND EXISTS (
    SELECT 1 FROM public.organization_settings WHERE "publishedVersionId" = OLD.id
  ) THEN
    RAISE EXCEPTION 'organization_setting_version_hide_active_forbidden';
  END IF;

  IF NEW.status <> 'draft' AND (
    NEW."legalNameTh" IS DISTINCT FROM OLD."legalNameTh"
    OR NEW."legalNameEn" IS DISTINCT FROM OLD."legalNameEn"
    OR NEW."taxId" IS DISTINCT FROM OLD."taxId"
    OR NEW."branchCode" IS DISTINCT FROM OLD."branchCode"
    OR NEW."registeredAddressTh" IS DISTINCT FROM OLD."registeredAddressTh"
    OR NEW."registeredAddressEn" IS DISTINCT FROM OLD."registeredAddressEn"
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW."lineId" IS DISTINCT FROM OLD."lineId"
    OR NEW.website IS DISTINCT FROM OLD.website
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'organization_setting_version_transition_payload_changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_organization_settings_draft_atomic(
  p_version_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.organization_settings%ROWTYPE;
  v_draft public.organization_setting_versions%ROWTYPE;
  v_published public.organization_setting_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_root FROM public.organization_settings WHERE id = 'primary' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_root_missing'; END IF;

  SELECT * INTO v_draft
  FROM public.organization_setting_versions
  WHERE id = p_version_id AND "organizationId" = v_root.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'organization_settings_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'organization_settings_draft_stale';
  END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN
    RAISE EXCEPTION 'organization_settings_change_note_required';
  END IF;

  SELECT * INTO v_published
  FROM public.organization_setting_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_published_missing'; END IF;

  -- ปลด pointer ก่อน จึงซ่อนเวอร์ชันเดิมได้ (guard บล็อกการซ่อนแถวที่ root ยังชี้)
  UPDATE public.organization_settings
  SET "publishedVersionId" = NULL, "updatedAt" = v_now
  WHERE id = v_root.id;

  UPDATE public.organization_setting_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedAt" = v_now
  WHERE id = v_published.id
  RETURNING * INTO v_published;

  UPDATE public.organization_setting_versions
  SET status = 'published',
      "publishedById" = p_actor_id,
      "publishedByName" = p_actor_name,
      "publishedByRole" = p_actor_role,
      "publishedAt" = v_now,
      "updatedById" = p_actor_id,
      "updatedByName" = p_actor_name,
      "updatedByRole" = p_actor_role,
      "updatedAt" = v_now
  WHERE id = v_draft.id
  RETURNING * INTO v_draft;

  UPDATE public.organization_settings
  SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE id = v_root.id;

  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_organization_settings_draft(
  p_version_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_draft public.organization_setting_versions%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'organization_settings_actor_required';
  END IF;

  PERFORM 1 FROM public.organization_settings WHERE id = 'primary' FOR UPDATE;

  SELECT * INTO v_draft
  FROM public.organization_setting_versions
  WHERE id = p_version_id AND "organizationId" = 'primary'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_settings_version_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'organization_settings_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'organization_settings_draft_stale';
  END IF;

  DELETE FROM public.organization_setting_versions WHERE id = v_draft.id;

  RETURN to_jsonb(v_draft);
END;
$$;

DROP FUNCTION IF EXISTS public.archive_organization_settings_draft_atomic(text, timestamptz, text, text, text);

REVOKE ALL ON FUNCTION public.discard_organization_settings_draft(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_organization_settings_draft(text, timestamptz, text, text, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) workflow_templates (mig 0121)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_workflow_template_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'workflow_template_version_delete_forbidden';
  END IF;
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

  -- ปลด pointer ก่อน จึงซ่อนเวอร์ชันเดิมได้ (guard บล็อกการซ่อนแถวที่ root ยังชี้)
  UPDATE public.workflow_templates SET "publishedVersionId" = NULL, "updatedAt" = v_now
  WHERE "templateKey" = v_root."templateKey";

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

CREATE OR REPLACE FUNCTION public.discard_workflow_template_draft(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_draft public.workflow_template_versions%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN RAISE EXCEPTION 'workflow_template_actor_required'; END IF;
  SELECT * INTO v_draft FROM public.workflow_template_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workflow_template_version_not_found'; END IF;
  PERFORM 1 FROM public.workflow_templates WHERE "templateKey" = v_draft."templateKey" FOR UPDATE;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'workflow_template_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'workflow_template_draft_stale'; END IF;

  -- ขั้นตอนของร่างต้องลบก่อน (FK RESTRICT); steps guard ยอมให้ลบเมื่อเวอร์ชันเป็น draft
  DELETE FROM public.workflow_template_steps WHERE "versionId" = v_draft.id;
  DELETE FROM public.workflow_template_versions WHERE id = v_draft.id;

  RETURN to_jsonb(v_draft);
END;
$$;

DROP FUNCTION IF EXISTS public.archive_workflow_template_draft_atomic(text, timestamptz, text, text, text);

REVOKE ALL ON FUNCTION public.discard_workflow_template_draft(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_workflow_template_draft(text, timestamptz, text, text, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) document_standards (mig 0123)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_document_standard_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'document_standard_version_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."documentKey" IS DISTINCT FROM OLD."documentKey"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'document_standard_version_identity_immutable';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'document_standard_version_archived_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'document_standard_version_published_immutable';
  END IF;

  IF OLD.status = 'published' AND NEW.status = 'archived' AND EXISTS (
    SELECT 1 FROM public.document_standards WHERE "publishedVersionId" = OLD.id
  ) THEN
    RAISE EXCEPTION 'document_standard_version_hide_active_forbidden';
  END IF;

  IF NEW.status <> 'draft' AND (
    NEW."titleTh" IS DISTINCT FROM OLD."titleTh"
    OR NEW."titleEn" IS DISTINCT FROM OLD."titleEn"
    OR NEW."formCode" IS DISTINCT FROM OLD."formCode"
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW."effectiveDate" IS DISTINCT FROM OLD."effectiveDate"
    OR NEW."accentKey" IS DISTINCT FROM OLD."accentKey"
    OR NEW."numberingPattern" IS DISTINCT FROM OLD."numberingPattern"
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'document_standard_version_transition_payload_changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_document_standard_draft_atomic(
  p_version_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.document_standards%ROWTYPE;
  v_draft public.document_standard_versions%ROWTYPE;
  v_published public.document_standard_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft
  FROM public.document_standard_versions
  WHERE id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_version_not_found'; END IF;

  SELECT * INTO v_root
  FROM public.document_standards
  WHERE "documentKey" = v_draft."documentKey"
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_not_found'; END IF;

  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'document_standard_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'document_standard_draft_stale';
  END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN
    RAISE EXCEPTION 'document_standard_change_note_required';
  END IF;

  SELECT * INTO v_published
  FROM public.document_standard_versions
  WHERE id = v_root."publishedVersionId" AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_published_missing'; END IF;

  -- ปลด pointer ก่อน จึงซ่อนเวอร์ชันเดิมได้ (guard บล็อกการซ่อนแถวที่ root ยังชี้)
  UPDATE public.document_standards
  SET "publishedVersionId" = NULL, "updatedAt" = v_now
  WHERE "documentKey" = v_root."documentKey";

  UPDATE public.document_standard_versions
  SET status = 'archived',
      "archivedById" = p_actor_id,
      "archivedByName" = p_actor_name,
      "archivedByRole" = p_actor_role,
      "archivedAt" = v_now,
      "updatedAt" = v_now
  WHERE id = v_published.id
  RETURNING * INTO v_published;

  UPDATE public.document_standard_versions
  SET status = 'published',
      "publishedById" = p_actor_id,
      "publishedByName" = p_actor_name,
      "publishedByRole" = p_actor_role,
      "publishedAt" = v_now,
      "updatedById" = p_actor_id,
      "updatedByName" = p_actor_name,
      "updatedByRole" = p_actor_role,
      "updatedAt" = v_now
  WHERE id = v_draft.id
  RETURNING * INTO v_draft;

  UPDATE public.document_standards
  SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now
  WHERE "documentKey" = v_root."documentKey";

  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', to_jsonb(v_published));
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_document_standard_draft(
  p_version_id text,
  p_expected_updated_at timestamptz,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_draft public.document_standard_versions%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'document_standard_actor_required';
  END IF;

  SELECT * INTO v_draft
  FROM public.document_standard_versions
  WHERE id = p_version_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_standard_version_not_found'; END IF;
  PERFORM 1 FROM public.document_standards WHERE "documentKey" = v_draft."documentKey" FOR UPDATE;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'document_standard_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'document_standard_draft_stale';
  END IF;

  DELETE FROM public.document_standard_versions WHERE id = v_draft.id;

  RETURN to_jsonb(v_draft);
END;
$$;

DROP FUNCTION IF EXISTS public.archive_document_standard_draft_atomic(text, timestamptz, text, text, text);

REVOKE ALL ON FUNCTION public.discard_document_standard_draft(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_document_standard_draft(text, timestamptz, text, text, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) commercial_presets (mig 0128)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_commercial_preset_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Preset ที่ไม่เหลือเวอร์ชันใด ๆ (ร่างแรกถูกยกเลิก) ไม่ใช่หลักฐาน — ลบ root ตามได้
    IF NOT EXISTS (SELECT 1 FROM public.commercial_preset_versions WHERE "presetId" = OLD.id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'commercial_preset_delete_forbidden';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."presetKey" IS DISTINCT FROM OLD."presetKey"
     OR NEW."documentKey" IS DISTINCT FROM OLD."documentKey"
     OR NEW."teamKey" IS DISTINCT FROM OLD."teamKey"
     OR NEW."dealType" IS DISTINCT FROM OLD."dealType"
     OR NEW."serviceType" IS DISTINCT FROM OLD."serviceType"
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW."legacyTemplateId" IS DISTINCT FROM OLD."legacyTemplateId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'commercial_preset_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commercial_preset_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'commercial_preset_version_delete_forbidden';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."presetId" IS DISTINCT FROM OLD."presetId"
     OR NEW."baseVersionId" IS DISTINCT FROM OLD."baseVersionId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'commercial_preset_version_identity_immutable';
  END IF;
  IF OLD.status = 'archived' THEN RAISE EXCEPTION 'commercial_preset_version_archived_immutable'; END IF;
  IF OLD.status = 'published' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'commercial_preset_version_published_immutable';
  END IF;
  IF OLD.status = 'published' AND NEW.status = 'archived' AND EXISTS (
    SELECT 1 FROM public.commercial_presets WHERE "publishedVersionId" = OLD.id
  ) THEN
    RAISE EXCEPTION 'commercial_preset_version_hide_active_forbidden';
  END IF;
  IF NEW.status <> 'draft' AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW."paymentMethod" IS DISTINCT FROM OLD."paymentMethod"
    OR NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms"
    OR NEW.remarks IS DISTINCT FROM OLD.remarks
    OR NEW.installments IS DISTINCT FROM OLD.installments
    OR NEW."changeNote" IS DISTINCT FROM OLD."changeNote"
  ) THEN
    RAISE EXCEPTION 'commercial_preset_version_transition_payload_changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_commercial_preset_draft_atomic(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.commercial_presets%ROWTYPE;
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_published public.commercial_preset_versions%ROWTYPE;
  v_archived jsonb := NULL;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_draft FROM public.commercial_preset_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_version_not_found'; END IF;
  SELECT * INTO v_root FROM public.commercial_presets WHERE id = v_draft."presetId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'commercial_preset_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'commercial_preset_draft_stale'; END IF;
  IF NULLIF(btrim(COALESCE(v_draft."changeNote", '')), '') IS NULL THEN RAISE EXCEPTION 'commercial_preset_change_note_required'; END IF;

  IF v_root."publishedVersionId" IS NOT NULL THEN
    SELECT * INTO v_published FROM public.commercial_preset_versions
    WHERE id = v_root."publishedVersionId" AND status = 'published' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_published_missing'; END IF;

    -- ปลด pointer ก่อน จึงซ่อนเวอร์ชันเดิมได้ (guard บล็อกการซ่อนแถวที่ root ยังชี้)
    UPDATE public.commercial_presets SET "publishedVersionId" = NULL, "updatedAt" = v_now WHERE id = v_root.id;

    UPDATE public.commercial_preset_versions
    SET status = 'archived', "archivedById" = p_actor_id, "archivedByName" = p_actor_name,
        "archivedByRole" = p_actor_role, "archivedAt" = v_now, "updatedAt" = v_now
    WHERE id = v_published.id RETURNING * INTO v_published;
    v_archived := to_jsonb(v_published);
  END IF;

  UPDATE public.commercial_preset_versions
  SET status = 'published', "publishedById" = p_actor_id, "publishedByName" = p_actor_name,
      "publishedByRole" = p_actor_role, "publishedAt" = v_now,
      "updatedById" = p_actor_id, "updatedByName" = p_actor_name, "updatedByRole" = p_actor_role, "updatedAt" = v_now
  WHERE id = v_draft.id RETURNING * INTO v_draft;
  UPDATE public.commercial_presets SET "publishedVersionId" = v_draft.id, "updatedAt" = v_now WHERE id = v_root.id;
  RETURN jsonb_build_object('published', to_jsonb(v_draft), 'archived', v_archived);
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_commercial_preset_draft(
  p_version_id text, p_expected_updated_at timestamptz, p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.commercial_presets%ROWTYPE;
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_preset_deleted boolean := false;
BEGIN
  IF NULLIF(btrim(p_actor_id), '') IS NULL THEN RAISE EXCEPTION 'commercial_preset_actor_required'; END IF;
  SELECT * INTO v_draft FROM public.commercial_preset_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_version_not_found'; END IF;
  SELECT * INTO v_root FROM public.commercial_presets WHERE id = v_draft."presetId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial_preset_not_found'; END IF;
  IF v_draft.status <> 'draft' THEN RAISE EXCEPTION 'commercial_preset_version_not_draft'; END IF;
  IF v_draft."updatedAt" IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'commercial_preset_draft_stale'; END IF;

  DELETE FROM public.commercial_preset_versions WHERE id = v_draft.id;

  -- Preset ใหม่ที่ยกเลิกร่างแรกทิ้ง: ไม่เหลือเวอร์ชันและไม่เคยเผยแพร่ — ลบ root
  -- ตามไปด้วย ไม่ทิ้ง preset เปล่าให้ค้างในรายการ
  IF v_root."publishedVersionId" IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.commercial_preset_versions WHERE "presetId" = v_root.id
  ) THEN
    DELETE FROM public.commercial_presets WHERE id = v_root.id;
    v_preset_deleted := true;
  END IF;

  RETURN jsonb_build_object('discarded', to_jsonb(v_draft), 'presetDeleted', v_preset_deleted);
END;
$$;

DROP FUNCTION IF EXISTS public.archive_commercial_preset_draft_atomic(text, timestamptz, text, text, text);

REVOKE ALL ON FUNCTION public.discard_commercial_preset_draft(text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_commercial_preset_draft(text, timestamptz, text, text, text) TO service_role;

-- Rollback guidance:
-- 1) แถว published/archived เดิมไม่ถูกแตะโดย migration นี้ — เปลี่ยนเฉพาะพฤติกรรม
--    action ต่อจากนี้ (discard ลบเฉพาะร่างที่สร้างและยกเลิกหลังจากนี้).
-- 2) ย้อนกลับ = restore guard/publish functions จาก mig 0120/0121/0123/0128 และ
--    สร้าง archive_*_draft_atomic เดิมกลับ; ร่างที่ถูก discard ไปแล้วกู้ไม่ได้
--    (มีหลักฐานใน audit_logs ฝั่ง API).
-- 3) การซ่อน (archive) เวอร์ชันที่เผยแพร่ยังเกิดผ่าน publish ทดแทนเท่านั้น —
--    ไม่มี function ซ่อนตรง และ guard บล็อกการซ่อนแถวที่ root ยังชี้เป็น active.

NOTIFY pgrst, 'reload schema';
