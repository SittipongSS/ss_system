-- ============================================================
--  Migration 0372: ชนิดราคาวัตถุดิบ "B" (เบส) — RM_B
--
--  ⚠️ **เคยเป็นเลข 0370 แล้ว 0371** — รันบน prod แล้ว 2026-09-22 ในชื่อ 0370_material_kind_base.sql (ยืนยัน 7 CHECK ครบ)
--     ชนกับ 0370_product_spec_document_model.sql (#1764) แล้ว 0371_lead_events_link_deal_kinds.sql (#1767) ที่ merge ก่อน
--     ⇒ ย้ายเลขตอน rebase สองรอบ · **ไม่ต้องรันซ้ำ**
--     (รันซ้ำได้ไม่พัง: DROP/ADD ชุดเดิม · UPDATE ระบุ id + ชนิดเดิม = 0 แถว)
--
--  ⭐ มติผู้ใช้ 2026-09-22 (ม-148):
--     *"F คือกลิ่น(หัวน้ำหอม) / B คือเบส / FB คือ เบสที่ใส่กลิ่น"*
--     *"ตอนใส่ราคา ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB เลยก็ดีนะ ยกเว้น กลิ่น(หัวน้ำหอม)ที่ใส่ได้แค่ F"*
--     ⇒ ระบบมีแค่ RM_F (หัวน้ำหอม · ผูกกลิ่น) กับ RM_FB (ผูกสูตร) · ต้องมีชนิดที่สาม RM_B (เบสล้วน · ผูกสูตร)
--
--  ① เพิ่ม RM_B ในทุก CHECK ที่ลิสต์ชนิดวัตถุดิบ (ชุดเดียวกับ MATERIAL_KINDS / COST_LINE_KINDS ในโค้ด):
--     material_prices · product_type_cost_lines · costing_item_components · material_deliveries
--     ⚠️ CHECK เดิมเป็นแบบ inline (ชื่อโดยปริยาย) — **ห้ามเดาชื่อ** ค้นจากนิยามแล้ว DROP ตัวที่เจอ (แพตเทิร์น 0207)
--     ⚠️ material_deliveries ต้องรวมด้วย — จอของเข้า (DeliveriesPanel) เลือกชนิดจาก MATERIAL_KINDS ⇒ ไม่รวม = เลือก B แล้ว 500
--  ② แม่แบบต้นทุน seed 01-006 เรียกบรรทัด "เนื้อสาร (Base)" ว่า RM_FB ซึ่งตามนิยามผู้ใช้คือ **B**
--     (แม่แบบบวก F 20 g + FB 80 g = นับกลิ่นซ้ำ) · วัด prod 2026-09-22: บรรทัด RM_FB ในแม่แบบมีตัวนี้ตัวเดียว
--     · ใบขอราคาผลิตยังไม่มีสักใบ (costing_item_components = 0 แถว) ⇒ ไม่มีสำเนาเก่าต้องตาม
--     ⚠️ ระบุด้วย id + ชนิดเดิม — รันซ้ำ/แม่แบบถูกแก้ไปแล้ว = 0 แถว ไม่ทับของที่คนตั้งใจเปลี่ยน
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy** (ไม่งั้นใส่ราคา B = 23514) · รันซ้ำได้
--
--  ── Rollback (เมื่อยังไม่มีแถว RM_B) ─────────────────────────────────────────
--  UPDATE public.product_type_cost_lines SET kind = 'RM_FB' WHERE id = 'PTCL-seed-01-006-2' AND kind = 'RM_B';
--  แล้วสร้าง CHECK กลับเป็นชุด ('RM_F','RM_FB',…) ด้วยบล็อกเดียวกับข้างล่าง
-- ============================================================

BEGIN;

-- ── ① ถอด CHECK เดิมที่ลิสต์ชนิดวัตถุดิบ (ทุกตัวที่นิยามมี 'RM_FB') ────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
      FROM pg_constraint
     WHERE contype = 'c'
       AND conrelid IN (
         'public.material_prices'::regclass,
         'public.product_type_cost_lines'::regclass,
         'public.costing_item_components'::regclass,
         'public.material_deliveries'::regclass
       )
       AND pg_get_constraintdef(oid) LIKE '%RM_FB%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

-- ── ใส่ชุดใหม่ (มีชื่อชัด ⇒ ครั้งหน้าไม่ต้องค้นจากนิยาม) ─────────────────────────
ALTER TABLE public.material_prices
  ADD CONSTRAINT material_prices_kind_check
    CHECK (kind IN ('RM_F', 'RM_B', 'RM_FB', 'PM')),
  ADD CONSTRAINT material_prices_source_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_B', 'RM_FB') AND "sourceDept" = 'RD')
    OR (kind = 'PM' AND "sourceDept" = 'PC')
  );

ALTER TABLE public.product_type_cost_lines
  ADD CONSTRAINT product_type_cost_lines_kind_check
    CHECK (kind IN ('RM_F', 'RM_B', 'RM_FB', 'PM', 'labor')),
  ADD CONSTRAINT product_type_cost_lines_basis_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_B', 'RM_FB') AND "unitBasis" = 'per_kg')
    OR (kind IN ('PM', 'labor') AND "unitBasis" = 'per_piece')
  );

ALTER TABLE public.costing_item_components
  ADD CONSTRAINT costing_item_components_kind_check
    CHECK (kind IN ('RM_F', 'RM_B', 'RM_FB', 'PM', 'labor')),
  ADD CONSTRAINT costing_item_components_basis_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_B', 'RM_FB') AND "unitBasis" = 'per_kg')
    OR (kind IN ('PM', 'labor') AND "unitBasis" = 'per_piece')
  );

ALTER TABLE public.material_deliveries
  ADD CONSTRAINT material_deliveries_kind_check
    CHECK (kind IN ('RM_F', 'RM_B', 'RM_FB', 'PM'));

-- ── ② แม่แบบต้นทุน 01-006: "เนื้อสาร (Base)" = B ไม่ใช่ FB ─────────────────────────
UPDATE public.product_type_cost_lines
   SET kind = 'RM_B'
 WHERE id = 'PTCL-seed-01-006-2' AND kind = 'RM_FB';

COMMIT;

-- ── ตรวจหลังรัน ──────────────────────────────────────────────────────────────
-- SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE contype = 'c' AND pg_get_constraintdef(oid) LIKE '%RM_B''%';            -- ต้องได้ 7 แถว
-- SELECT id, kind, label FROM public.product_type_cost_lines WHERE id = 'PTCL-seed-01-006-2';  -- RM_B
