-- 0115 - เหตุผลยกเลิก SO แบบมาตรฐาน (มติผู้ใช้ 2026-07-18).
-- เดิมยกเลิกเก็บเฉพาะ cancelReason (ข้อความอิสระ) — เพิ่มรหัสเหตุผลแบบมีโครงสร้าง
-- เพื่อรายงาน/แยกว่าเป็นเคสฝั่งลูกค้า (ดีลอาจต้องย้อน) หรือแก้เอกสาร/ข้อมูลพลาด.
-- cancelReason (หมายเหตุ) ยังใช้คู่กันได้ตามเดิม (nullable).

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "cancelReasonCode" text
    CHECK ("cancelReasonCode" IS NULL OR "cancelReasonCode" IN (
      'customer_cancelled', 'customer_no_payment', 'switched_option',
      'wrong_document', 'reissue_correction', 'duplicate_test', 'other'
    ));

NOTIFY pgrst, 'reload schema';
