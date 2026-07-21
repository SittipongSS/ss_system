-- 0131 - มติ 2026-07-20: ช่องติ๊กกำกับดูแลบนหมวดสินค้า (product_types)
--
-- 1) "เสียภาษีสรรพสามิต" (isExcise) — ขับตรรกะภาษีจริงทั้งระบบ แทนการ hardcode
--    รหัส '01-002' ที่กระจายตามโค้ด. seed ให้หมวด 01-002 (น้ำหอมฉีดผิวกาย) = true
--    เพื่อคงพฤติกรรมเดิมไว้ทุกจุด.
-- 2) "ต้องจดแจ้ง อย." (requiresFdaNotice) — เฟสแรกใช้แค่ป้าย + เตือนตอนสร้างสินค้า
--    (ยังไม่ผูกไทม์ไลน์/เอกสาร — รอออกแบบ workflow อย.)

ALTER TABLE public.product_types
  ADD COLUMN IF NOT EXISTS "isExcise" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiresFdaNotice" boolean NOT NULL DEFAULT false;

UPDATE public.product_types
SET "isExcise" = true
WHERE "mainCategoryCode" = '01' AND "typeCode" = '002' AND "isExcise" = false;

-- ── Workflow template: ขั้นสรรพสามิตยึด flag แทนรหัสหมวดตายตัว ──────────────
-- ขั้นตอนใน template ที่เคยผูก categoryOnly/categoryExclude = '01-002' เปลี่ยนเป็น
-- token 'flag:excise' (= หมวดที่ติ๊ก isExcise). version ที่เผยแพร่แล้วเป็น immutable
-- จึงออก "version ใหม่" (คัดลอกขั้นตอนจาก version ที่เผยแพร่อยู่แล้วแทนที่ rule)
-- แล้วเผยแพร่แทน — ห้ามแก้ version เดิม. โครงการเก่าที่ pin version เดิมยังใช้
-- rule '01-002' แบบ literal ต่อไปได้ (ตัว matcher ในแอปรองรับทั้งสองแบบ).
DO $$
DECLARE
  tk text;
  v_root public.workflow_templates%ROWTYPE;
  v_pub public.workflow_template_versions%ROWTYPE;
  v_next integer;
  v_new_id text;
  v_now timestamptz := now();
BEGIN
  -- guard trigger บล็อกการ insert step ให้ version ที่ไม่ใช่ draft และการสลับสถานะ
  -- version — ปิดชั่วคราวเฉพาะใน migration นี้ (system operation แบบเดียวกับ 0121
  -- ที่ seed ข้อมูลก่อนสร้าง trigger). ทั้ง block อยู่ใน transaction เดียว:
  -- ถ้าพลาดตรงไหน rollback ทั้งหมดรวมถึงการปิด trigger ด้วย.
  ALTER TABLE public.workflow_template_versions DISABLE TRIGGER workflow_template_versions_guard;
  ALTER TABLE public.workflow_template_steps DISABLE TRIGGER workflow_template_steps_guard;

  FOREACH tk IN ARRAY ARRAY['NPD', 'RE-ORDER'] LOOP
    SELECT * INTO v_root FROM public.workflow_templates WHERE "templateKey" = tk FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    SELECT * INTO v_pub FROM public.workflow_template_versions
    WHERE id = v_root."publishedVersionId" AND status = 'published';
    CONTINUE WHEN NOT FOUND;
    -- ข้ามถ้า version ที่เผยแพร่อยู่ไม่มี rule '01-002' เหลือแล้ว (เช่น รัน migration ซ้ำ
    -- หรือผู้ใช้แก้เป็น token เองไปก่อน)
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.workflow_template_steps
      WHERE "versionId" = v_pub.id AND ("categoryOnly" = '01-002' OR "categoryExclude" = '01-002')
    );

    SELECT COALESCE(max("versionNumber"), 0) + 1 INTO v_next
    FROM public.workflow_template_versions WHERE "templateKey" = tk;
    v_new_id := 'workflow-' || lower(replace(tk, '-', '')) || '-v' || v_next;

    UPDATE public.workflow_template_versions SET
      status = 'archived', "archivedById" = 'migration-0131', "archivedByName" = 'Migration 0131',
      "archivedByRole" = 'system', "archivedAt" = v_now, "updatedAt" = v_now
    WHERE id = v_pub.id;

    INSERT INTO public.workflow_template_versions (
      id, "templateKey", "baseVersionId", "versionNumber", status, "nameTh", description, "changeNote",
      "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole",
      "publishedById", "publishedByName", "publishedByRole", "createdAt", "updatedAt", "publishedAt"
    ) VALUES (
      v_new_id, tk, v_pub.id, v_next, 'published', v_pub."nameTh", v_pub.description,
      'มติ 2026-07-20: ขั้นสรรพสามิตยึดช่องติ๊ก "เสียภาษีสรรพสามิต" ของหมวดสินค้า (flag:excise) แทนรหัส 01-002',
      'migration-0131', 'Migration 0131', 'system', 'migration-0131', 'Migration 0131', 'system',
      'migration-0131', 'Migration 0131', 'system', v_now, v_now, v_now
    );

    INSERT INTO public.workflow_template_steps (
      id, "versionId", "stepKey", "stepOrder", name, role, "durationDays", phase, "isMilestone",
      "dependencyMode", "dependsOnStepKeys", "categoryOnly", "categoryExclude", "createdAt", "updatedAt"
    )
    SELECT
      v_new_id || '-' || "stepKey", v_new_id, "stepKey", "stepOrder", name, role, "durationDays", phase,
      "isMilestone", "dependencyMode", "dependsOnStepKeys",
      CASE WHEN "categoryOnly" = '01-002' THEN 'flag:excise' ELSE "categoryOnly" END,
      CASE WHEN "categoryExclude" = '01-002' THEN 'flag:excise' ELSE "categoryExclude" END,
      v_now, v_now
    FROM public.workflow_template_steps
    WHERE "versionId" = v_pub.id
    ORDER BY "stepOrder";

    UPDATE public.workflow_templates
    SET "publishedVersionId" = v_new_id, "updatedAt" = v_now
    WHERE "templateKey" = tk;
  END LOOP;

  ALTER TABLE public.workflow_template_versions ENABLE TRIGGER workflow_template_versions_guard;
  ALTER TABLE public.workflow_template_steps ENABLE TRIGGER workflow_template_steps_guard;
END;
$$;

-- หมายเหตุ: ฉบับร่าง (draft) ที่ค้างอยู่ก่อน migration ยังถือ rule '01-002' แบบเดิม —
-- matcher ฝั่งแอปยังเทียบ literal ได้ จึงไม่พัง แต่ถ้าต้องการให้ขั้นสรรพสามิตตามหมวด
-- ที่ติ๊กใหม่ ให้แก้ rule ในฉบับร่างเป็น flag:excise ก่อนเผยแพร่.

NOTIFY pgrst, 'reload schema';
