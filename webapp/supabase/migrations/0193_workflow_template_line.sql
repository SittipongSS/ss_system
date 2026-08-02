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
UPDATE public.workflow_templates          SET line = 'PRODUCT' WHERE line IS NULL;
UPDATE public.workflow_template_versions  SET line = 'PRODUCT' WHERE line IS NULL;

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

COMMENT ON COLUMN public.workflow_templates.line IS
  'สายธุรกิจของแม่แบบ PRODUCT|SERVICE — คู่กับ templateKey จะกลายเป็น PK ใน 0194';
COMMENT ON COLUMN public.workflow_template_versions.line IS
  'สำเนาสายธุรกิจของแม่แบบต้นสังกัด — ต้องตรงกับ workflow_templates.line เสมอ (FK คู่ใน 0194)';

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
