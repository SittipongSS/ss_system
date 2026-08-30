-- ============================================================
--  Migration 0321: ถอนใบที่บัญชี "อนุมัติ" ไปแล้วทั้งที่ยังเก็บเงินไม่ครบ กลับเป็นรอปิดใบ
--                  (มติผู้ใช้ 2026-08-30 — สลับลำดับการอนุมัติ SO)
--
--  คำสั่งตั้งต้น: *"อยากลำดับ การอนุมัติ SO ใหม่ด้วย AE sup > การชำระ (ครบงวด) >
--  บัญชี อนุมัติใบ = ปิดใบ"* + *"ไม่มีตีกลับตอนท้ายแล้ว มี แค่ ตีกลับ ระหว่างงวด"*
--
--  ⭐ **สิ่งที่เปลี่ยนคือความหมายของการกดของบัญชี** — จาก "ตรวจใบ" (ทำเมื่อไรก็ได้
--  หลัง AE Sup อนุมัติ) เป็น **"ปิดใบ"** ซึ่งเป็นขั้นสุดท้ายของใบ ⇒ กดได้ต่อเมื่อ
--  ทุกงวดถูกบัญชีรับรองแล้ว (`sales_order_installments.status = 'confirmed'` ครบทุกแถว)
--
--  🔴 **ทำไมต้องมี migration** — ของเดิมสองแกนนี้ไม่มีอะไรเชื่อมกันเลย (ลำดับบนราง
--  ก้าวเป็นแค่การแสดงผล ไม่ใช่ด่าน) ⇒ บนฐานจริงจึงมีใบที่ `financeStatus='approved'`
--  ทั้งที่ยังไม่เก็บเงินสักงวด · **วัดสด 2026-08-30: 13 ใบจาก 35 ใบที่บัญชีอนุมัติแล้ว**
--  (SO-26080009/10/24/27/28/29/30/32/33/36/42/46/72) ซึ่งภายใต้กติกาใหม่คือ
--  "ปิดใบไปแล้วทั้งที่ยังไม่ได้เงิน" — สถานะที่เกิดขึ้นใหม่ไม่ได้อีกแล้ว
--  ⇒ ปล่อยไว้ = ใบพวกนี้จะโชว์ว่า "ปิดใบแล้ว" ตลอดไป และไม่มีใครถูกเตือนให้ตามเงิน
--
--  ⭐ **มติผู้ใช้: ถอนกลับเป็น pending ให้บัญชีกดใหม่** (ไม่ปล่อยค้าง ไม่ล้างทิ้ง)
--  ⇒ พอเก็บครบเมื่อไร ใบจะโผล่ในคิว "รอปิดใบ" ของบัญชีเองตามกติกาใหม่
--
--  ⚠️ **ลายเซ็นไม่ถูกลบ** — แถวใน `document_signature_evidence` และเอกสารที่ตรึงไว้
--  ตอนนั้นยังอยู่ครบ (นั่นคือหลักฐานว่าเคยมีการกดจริง ห้ามลบ) · ที่ล้างคือ *ตราบน
--  ใบ* ซึ่งจะถูกประทับใหม่ตอนบัญชีกดปิดใบจริง — และค่าเดิมทุกช่องถูกคัดลอกลง
--  `audit_logs.before` ก่อนล้าง (ระบบนี้ไม่มีถังขยะ · before คือทางกู้ทางเดียว)
--
--  ⚠️ **ไม่แตะ `status` และไม่แตะ Actual** — ใบยังอนุมัติแล้วเหมือนเดิม งานผลิต/ภาษี/
--  ยอดที่นับเข้าดีลเดินต่อตามปกติ (เหตุผลเดียวกับหัวไฟล์ 0250: `status='approved'`
--  เป็นตัวปลดล็อก 12 จุดทั่วระบบ)
--
--  ⚠️ ใบยอด ≤ 0 ไม่ถูกแตะ — ไม่มีเงินให้เก็บ จึง "ครบ" โดยปริยาย (`paymentNotRequired`)
--
--  🛑 **ต้องรันก่อน deploy** — โค้ดใหม่ปิดปุ่มของบัญชีจนกว่าจะเก็บครบ แต่ไม่มีอะไร
--  ไปแก้แถวเก่าให้ · รันหลัง deploy ก็ได้ผลเหมือนกัน เพียงแต่ระหว่างนั้นใบ 13 ใบ
--  จะยังโชว์ "ปิดใบแล้ว" ผิด ๆ อยู่
--  รันซ้ำได้ (idempotent) — รอบสองจะไม่เจอแถวที่เข้าเงื่อนไขแล้ว
-- ============================================================

BEGIN;

-- แถวที่ต้องถอน: บัญชีอนุมัติแล้ว · ยอดมากกว่า 0 · แต่ยังมีงวดที่ไม่ใช่ confirmed
-- (หรือไม่มีงวดเลย ซึ่งแปลว่ายังไม่มีใครเริ่มติดตามการชำระด้วยซ้ำ)
CREATE TEMP TABLE _finance_rollback ON COMMIT DROP AS
SELECT o.*
FROM public.sales_orders o
WHERE o."financeStatus" = 'approved'
  AND coalesce(o."totalAmount", 0) > 0
  AND (
    -- ไม่มีงวดเลย = ยังไม่มีใครเริ่มติดตามการชำระ (ไม่ใช่ "จ่ายครบ")
    NOT EXISTS (SELECT 1 FROM public.sales_order_installments i WHERE i."salesOrderId" = o.id)
    -- หรือมีอย่างน้อยหนึ่งงวดที่บัญชียังไม่รับรอง (pending / reported / rejected)
    OR EXISTS (
      SELECT 1 FROM public.sales_order_installments i
      WHERE i."salesOrderId" = o.id AND i.status IS DISTINCT FROM 'confirmed'
    )
  );

-- บันทึกค่าก่อนล้างลงสมุดกลาง — กู้คืนได้ทีละใบจาก before ถ้าตัดสินใจใหม่
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary,
   "changedKeys", before, "createdAt")
SELECT
  'migration-0321', 'ระบบ (mig 0321)', 'system', 'update', 'salesOrder', r.id,
  'ถอนสถานะบัญชีของ ' || r."orderNumber" || ' กลับเป็นรอปิดใบ — ยังเก็บเงินไม่ครบทุกงวด (มติ 2026-08-30)',
  '["financeStatus","financeApprovedBy","financeApprovedByName","financeApprovedAt","financeSignatureEvidenceId"]'::jsonb,
  to_jsonb(r), now()
FROM _finance_rollback r;

UPDATE public.sales_orders o SET
  "financeStatus" = 'pending',
  "financeApprovedBy" = NULL,
  "financeApprovedByName" = NULL,
  "financeApprovedAt" = NULL,
  "financeSignatureEvidenceId" = NULL,
  -- ⚠️ `financeNote` เก็บไว้ตามเดิม — เป็นข้อสังเกตของบัญชีต่อ *ตัวใบ* ซึ่งยังจริงอยู่
  "updatedAt" = now()
FROM _finance_rollback r
WHERE o.id = r.id;

COMMIT;

-- ตรวจหลังรัน (ต้องได้ 0 ทั้งคู่):
--   SELECT count(*) FROM public.sales_orders o
--    WHERE o."financeStatus" = 'approved' AND coalesce(o."totalAmount",0) > 0
--      AND EXISTS (SELECT 1 FROM public.sales_order_installments j
--                   WHERE j."salesOrderId" = o.id AND j.status IS DISTINCT FROM 'confirmed');
--   SELECT count(*) FROM public.sales_orders
--    WHERE "financeStatus" = 'approved' AND "financeApprovedAt" IS NULL;
--
-- Rollback guidance: ไม่มีคำสั่งย้อนอัตโนมัติ — ค่าเดิมของทุกใบอยู่ครบใน
--   SELECT before FROM public.audit_logs WHERE "actorId" = 'migration-0321';
-- เขียนกลับทีละใบจาก jsonb ก้อนนั้นได้ (id ตรงกับ "entityId")
