-- ============================================================
--  Migration 0324: ผูกสัญญาบริการเข้ากับใบสั่งขาย (มติผู้ใช้ 2026-08-31)
--
--  ⭐ **แหล่งความจริงอยู่ที่ "ใบ" ไม่ใช่ที่ "รอบขายของโซน"**
--
--  🔴 แผนเดิม (docs/service-contract-phase-plan.md PR-B) บอกให้เขียนลง
--  `service_zone_terms.serviceContractId` ที่เตรียมไว้ตั้งแต่ mig 0297 — แต่พอ
--  ลงมือจริงถึงเห็นว่า **term เกิดตอน TS จัดสรรบรรทัดลงโซนเท่านั้น**
--  (`/api/service/intake/bind`) และวันนี้ทั้งระบบมี **0 แถว**
--  ⇒ SA ที่อยากผูกสัญญา *ก่อน* TS จัดสรร (ซึ่งเป็นลำดับธรรมชาติ — สัญญามาก่อนงาน)
--    **ไม่มีที่ให้เขียนเลย**
--
--  ⇒ มติผู้ใช้: เก็บที่ใบ · term อ่านสัญญาจากใบแม่สด ๆ **ไม่ก๊อป**
--    · SA ผูกได้ทันทีไม่ต้องรอ TS
--    · จัดสรรเพิ่มทีหลังกี่รอบก็ได้ ไม่มี term ไหนตกสัญญา (ไม่มีใครต้องจำไปเติม)
--    · แก้สัญญาทีหลังก็ไม่มีสำเนาค้าง (บทเรียนเดียวกับชื่อลูกค้าที่ก๊อปไว้ 5 ตาราง)
--
--  ⚠️ **`service_zone_terms.serviceContractId` กลายเป็นของไม่ได้ใช้** — ไม่ถอดทิ้ง
--  เพราะการ DROP COLUMN ถอยกลับไม่ได้ และคอลัมน์ว่างไม่ได้ทำอะไรเสียหาย ·
--  ใส่คอมเมนต์กำกับไว้แทน เพื่อให้คนที่มาอ่านทีหลังไม่เขียนลงไปโดยเข้าใจผิด
--
--  ⚠️ ON DELETE SET NULL: ลบสัญญาแล้วใบยังอยู่ (ใบสั่งขายไม่ได้ขึ้นกับสัญญา) —
--  ต่างจาก `dealId` ที่เป็น RESTRICT · แต่ของจริงสัญญาที่ออกเลขแล้วลบไม่ได้อยู่แล้ว
--
--  🛑 **ต้องรันก่อน deploy** — `master_row_assignments` ทิ้งคีย์ที่ยังไม่มีคอลัมน์
--  เงียบ ๆ ไม่ error ⇒ deploy ก่อนรัน = กดผูกสัญญาแล้วขึ้นว่าสำเร็จ แต่ค่าไม่ลง
--  รันซ้ำได้ (idempotent)
-- ============================================================

BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "serviceContractId" text
  REFERENCES public.sales_contracts(id) ON DELETE SET NULL;

-- ใช้ตอบ "สัญญาฉบับนี้ถูกใช้กับใบไหนบ้าง" (ทะเบียนต่อสัญญาของ PR-E จะถามทางนี้)
CREATE INDEX IF NOT EXISTS sales_orders_service_contract_idx
  ON public.sales_orders ("serviceContractId")
  WHERE "serviceContractId" IS NOT NULL;

COMMENT ON COLUMN public.sales_orders."serviceContractId" IS
  'สัญญาบริการที่ครอบใบนี้ (มติผู้ใช้ 2026-08-31) — แหล่งความจริงที่เดียว · รอบขายของโซนอ่านผ่านใบแม่ ไม่เก็บสำเนา';

COMMENT ON COLUMN public.service_zone_terms."serviceContractId" IS
  'เลิกใช้ 2026-08-31 — สัญญาย้ายไปอยู่ที่ sales_orders."serviceContractId" (แหล่งความจริงที่เดียว) · ห้ามเขียนลงคอลัมน์นี้';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน:
--   SELECT count(*) FROM public.sales_orders WHERE "serviceContractId" IS NOT NULL;  -- ควรได้ 0
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'sales_orders' AND column_name = 'serviceContractId';        -- ควรได้ 1 แถว
--
-- Rollback guidance:
--   DROP INDEX IF EXISTS sales_orders_service_contract_idx;
--   ALTER TABLE public.sales_orders DROP COLUMN "serviceContractId";
--   ⚠️ ใบที่ผูกสัญญาไปแล้วจะขาดการเชื่อม — ตรวจ count ข้างบนก่อนถอย
