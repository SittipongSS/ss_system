-- ============================================================
--  Migration 0325: ถอนคำรับรองงวดของใบงานบริการที่ยังไม่มีช่วงครอบ
--                  (มติผู้ใช้ 2026-08-31)
--
--  คำสั่งตั้งต้น: *"ถ้าไม่กรอก ช่วงครอบ ก็จะรับรอง การจ่ายไม่ได้ · เอางี้ ย้อนการรับ
--  ของบัญชี เพื่อให้ใส่ช่วงครอบ ตามขั้น"*
--
--  ⭐ **ทำไมต้องถอน** — เจ้าของช่อง "ช่วงครอบบริการ" เปลี่ยนมือเป็นบัญชีทันทีที่รับรอง
--  (เพราะ `coversTo` ของงวดที่รับรองแล้วคือค่า "จ่ายถึง" ที่ด่านเข้าไซต์ใช้ตัดสิน)
--  ⇒ งวดที่ถูกรับรองไปทั้งที่ช่วงครอบว่าง กลายเป็นของที่ฝ่ายขายกรอกไม่ได้อีกเลย
--  ⇒ ถอนคำรับรอง → งวดกลับเป็น `reported` → ฝ่ายขายกรอกช่วงครอบ → บัญชีรับรองใหม่
--  (โค้ดใหม่กันไม่ให้เกิดซ้ำแล้ว: ใบงานบริการที่ไม่มีช่วงครอบ บัญชีกดรับรองไม่ได้)
--
--  ⚠️ **ถอยไป `reported` ไม่ใช่ `pending`** — คำแจ้งของฝ่ายขายและหลักฐานยังอยู่ครบ
--  สิ่งที่ถูกถอนคือ *คำรับรองของบัญชี* ไม่ใช่การแจ้งของ SA (ท่าเดียวกับปุ่ม
--  "ถอนคำรับรอง" ที่มีอยู่ในระบบ — ใบนี้แค่ทำแทนให้ทีเดียวหลายแถว)
--
--  🔴 **ต้องถอนสถานะบัญชีของใบด้วย** — วัดสด 31/08: ทั้ง 2 ใบที่เข้าเงื่อนไข
--  **บัญชีปิดใบไปแล้ว** (`financeStatus = 'approved'`) ⇒ ถอนคำรับรองงวดเฉย ๆ จะได้
--  "ใบที่ปิดแล้วแต่เก็บเงินไม่ครบ" ซึ่งเป็นสถานะที่ mig 0321 เพิ่งไล่ล้างไป 13 ใบ
--  และกติกาใหม่ (AE Sup → เก็บครบ → บัญชีปิดใบ) ไม่ให้เกิดอีก
--
--  ⚠️ ค่าเดิมทุกแถวถูกคัดลอกลง `audit_logs.before` ก่อนแก้ (ระบบนี้ไม่มีถังขยะ)
--  🛑 รันหลัง deploy ก็ได้ — ใบนี้ไม่ได้เปลี่ยนสคีมา แค่ย้ายสถานะข้อมูล
--  รันซ้ำได้ (idempotent) — รอบสองจะไม่เจอแถวที่เข้าเงื่อนไขแล้ว
-- ============================================================

BEGIN;

/* งวดเป้าหมาย: อยู่บนใบที่ "มีรอบบริการ" (ดีลสาย SERVICE **และ** มีบรรทัดหมวด 02-001
   อย่างน้อย 1 รายการ ⇒ ทั้งใบ) · บัญชีรับรองแล้ว · แต่ช่วงครอบยังไม่ครบสองด้าน
   ⚠️ รหัส FG จริงคือ `FG-AAAA-02-001-DDDDD` ⇒ จับที่ช่วงหมวดกลางรหัส
      **ห้ามใช้ `LIKE '02-001%'`** — รหัสไม่ได้ขึ้นต้นด้วยหมวด (บทเรียนจาก PR-A) */
CREATE TEMP TABLE _uncofirm_targets ON COMMIT DROP AS
SELECT i.*
FROM public.sales_order_installments i
JOIN public.sales_orders o  ON o.id = i."salesOrderId"
JOIN public.sales_deals  d  ON d.id = o."dealId"
WHERE i.status = 'confirmed'
  AND (i."coversFrom" IS NULL OR i."coversTo" IS NULL)
  AND d.line = 'SERVICE'
  AND EXISTS (
    SELECT 1 FROM public.sales_order_lines l
    WHERE l."salesOrderId" = o.id AND l."fgCode" LIKE '%-02-001-%'
  );

-- ร่องรอยก่อนแก้ (งวด)
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT
  'migration-0325', 'ระบบ (mig 0325)', 'system', 'update', 'salesOrderInstallment', t.id,
  'ถอนคำรับรองงวด — ใบงานบริการต้องมีช่วงครอบก่อนรับรอง (มติ 2026-08-31)',
  '["status","confirmedById","confirmedByName","confirmedAt","note"]'::jsonb,
  to_jsonb(t), now()
FROM _uncofirm_targets t;

UPDATE public.sales_order_installments i SET
  status = 'reported',
  "confirmedById" = NULL, "confirmedByName" = NULL, "confirmedAt" = NULL,
  note = 'ถอนคำรับรอง (ระบบ): ใบงานบริการต้องระบุช่วงครอบบริการของงวดก่อนจึงจะรับรองได้',
  "updatedAt" = now()
FROM _uncofirm_targets t
WHERE i.id = t.id;

/* ── ถอนสถานะบัญชีของใบที่กระทบ ─────────────────────────────────────────
   ใบที่ปิดไปแล้วแต่ตอนนี้เก็บไม่ครบ ต้องกลับเป็น "รอปิดใบ" ไม่งั้นจะเป็นสถานะ
   ที่เกิดขึ้นใหม่ไม่ได้อีกแล้วภายใต้กติกา AE Sup → เก็บครบ → บัญชีปิดใบ */
CREATE TEMP TABLE _reopen_orders ON COMMIT DROP AS
SELECT o.*
FROM public.sales_orders o
WHERE o."financeStatus" = 'approved'
  AND o.id IN (SELECT DISTINCT "salesOrderId" FROM _uncofirm_targets);

INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT
  'migration-0325', 'ระบบ (mig 0325)', 'system', 'update', 'salesOrder', r.id,
  'ถอนสถานะบัญชีของ ' || r."orderNumber" || ' กลับเป็นรอปิดใบ — งวดถูกถอนคำรับรองเพื่อกรอกช่วงครอบ',
  '["financeStatus","financeApprovedBy","financeApprovedByName","financeApprovedAt","financeSignatureEvidenceId"]'::jsonb,
  to_jsonb(r), now()
FROM _reopen_orders r;

UPDATE public.sales_orders o SET
  "financeStatus" = 'pending',
  "financeApprovedBy" = NULL, "financeApprovedByName" = NULL, "financeApprovedAt" = NULL,
  "financeSignatureEvidenceId" = NULL,
  "updatedAt" = now()
FROM _reopen_orders r
WHERE o.id = r.id;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน (ต้องได้ 0 ทั้งคู่):
--   SELECT count(*) FROM public.sales_order_installments i
--     JOIN public.sales_orders o ON o.id = i."salesOrderId"
--     JOIN public.sales_deals d ON d.id = o."dealId"
--    WHERE i.status = 'confirmed' AND (i."coversFrom" IS NULL OR i."coversTo" IS NULL)
--      AND d.line = 'SERVICE'
--      AND EXISTS (SELECT 1 FROM public.sales_order_lines l
--                   WHERE l."salesOrderId" = o.id AND l."fgCode" LIKE '%-02-001-%');
--   SELECT count(*) FROM public.sales_orders o
--    WHERE o."financeStatus" = 'approved' AND coalesce(o."totalAmount",0) > 0
--      AND EXISTS (SELECT 1 FROM public.sales_order_installments j
--                   WHERE j."salesOrderId" = o.id AND j.status IS DISTINCT FROM 'confirmed');
--
-- Rollback guidance: ค่าเดิมทุกแถวอยู่ครบใน
--   SELECT before FROM public.audit_logs WHERE "actorId" = 'migration-0325';
