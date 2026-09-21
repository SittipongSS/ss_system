-- ============================================================
--  Migration 0369: ใบสเปคสินค้า FM-SA-04 — ยุบด่านอนุมัติเหลือขั้นเดียว
--
--  ⭐ มติผู้ใช้ 2026-09-21: "ใบ 04 อยากให้ใช้ลำดับ ร่าง · บันทึก · ยื่น · อนุมัติ
--     และลบได้ เหมือนลำดับใบเสนอราคา"
--     ⇒ เส้นของใบเสนอราคาคือ เปิดร่าง → ผู้จัดทำยื่นอนุมัติ → อนุมัติ (สามขั้น)
--       ส่วน 0364 ทำ FM-SA-04 เป็นสี่ขั้น (ร่าง → AE ตรวจ → AE Sup อนุมัติ → อนุมัติแล้ว)
--     ⇒ ขั้น "AE ตรวจ" หายไป เหลือ `pending` ขั้นเดียวที่รออยู่ที่ AE Supervisor
--
--  ⚠️ **แถวที่ค้างอยู่สองสถานะเดิมต้องย้ายมา `pending` ก่อนเปลี่ยน CHECK** ไม่ใช่หลัง —
--     ไม่งั้น ALTER ... ADD CONSTRAINT ล้มทั้งใบเพราะแถวเดิมไม่ผ่านเงื่อนไขใหม่
--
--  ⚠️ **คอลัมน์ `reviewedAt/reviewedBy/reviewedByName` ไม่ถูกลบ** — ฉบับที่เดินด่านเก่า
--     ผ่านขั้น AE ตรวจจริง ชื่อคนตรวจกับเวลาเป็นประวัติที่เกิดขึ้นแล้ว ลบทิ้งคือลบหลักฐาน
--     ⇒ เก็บไว้อ่าน แต่ **เลิกเขียนของใหม่** (โค้ดฝั่งแอปไม่แตะอีก)
--
--  ⚠️ unique index ของ "ฉบับที่ยังไม่จบมีได้ทีละหนึ่ง" ต้องสร้างใหม่ เพราะ WHERE ของมัน
--     อ้างชื่อสถานะเดิมตรง ๆ · ปล่อยไว้เท่ากับด่านนั้นหายไปเงียบ ๆ (ฉบับค้างสองใบพร้อมกัน)
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy** · รันซ้ำได้
-- ============================================================

BEGIN;

-- ── ① ย้ายแถวเดิมมาสถานะเดียว ────────────────────────────────────────────
-- ฉบับที่รออยู่ที่ AE หรือที่ AE Sup = "ยื่นอนุมัติแล้ว" ทั้งคู่ในเส้นใหม่
UPDATE public.product_spec_revisions
   SET status = 'pending', "updatedAt" = now()
 WHERE status IN ('pending_ae', 'pending_ae_supervisor');

-- ── ② CHECK ชุดใหม่ ──────────────────────────────────────────────────────
ALTER TABLE public.product_spec_revisions
  DROP CONSTRAINT IF EXISTS product_spec_revisions_status_check;

ALTER TABLE public.product_spec_revisions
  ADD CONSTRAINT product_spec_revisions_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'superseded'));

-- ── ③ ฉบับที่ยังไม่จบมีได้ทีละหนึ่งต่อสินค้า (ชื่อสถานะใหม่) ──────────────
DROP INDEX IF EXISTS product_spec_revisions_open_uidx;
CREATE UNIQUE INDEX product_spec_revisions_open_uidx
  ON public.product_spec_revisions ("specId")
  WHERE status IN ('draft', 'pending');

-- ── ④ บันทึกกติกาไว้ที่ตัวคอลัมน์ ────────────────────────────────────────
COMMENT ON COLUMN public.product_spec_revisions.status IS
  'draft → pending (ยื่นอนุมัติ) → approved · rejected = ตีกลับให้แก้ · superseded = ถูกแทนด้วยฉบับใหม่ (0369 ยุบขั้น AE ตรวจออก)';

COMMENT ON COLUMN public.product_spec_revisions."reviewedAt" IS
  'ประวัติของเส้นเดิม (0364) ที่มีขั้น AE ตรวจ — 0369 เลิกเขียนค่าใหม่ เก็บไว้อ่านฉบับเก่าเท่านั้น';

COMMIT;
