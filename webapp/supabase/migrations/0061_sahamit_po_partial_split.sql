-- 0061 — SAHAMIT แบ่งส่ง (partial delivery): สหมิตรเปิด PO ใบใหม่สำหรับยอดที่เหลือ
-- โดย PO ใบเดิมไม่ถูกแก้ (qty ยังเต็ม). กระทบยอดนับ "ยอดส่งจริง" ของ PO เดิม.
--   sahamit_po_lines.shippedQty  = ยอดส่งจริงของบรรทัด (null = ส่งเต็ม; recon ใช้ค่านี้ถ้าไม่ null)
--   sahamit_pos.splitFromPoId    = PO ยอดเหลือชี้กลับ PO แม่ (เมนู "รวมกลับ" ใช้จับคู่)
-- รันมือบน Supabase prod ก่อน deploy.

ALTER TABLE sahamit_po_lines ADD COLUMN IF NOT EXISTS "shippedQty" numeric;
ALTER TABLE sahamit_pos ADD COLUMN IF NOT EXISTS "splitFromPoId" text;

NOTIFY pgrst, 'reload schema';
