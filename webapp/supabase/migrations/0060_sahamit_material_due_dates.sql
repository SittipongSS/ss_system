-- 0060 — SAHAMIT วัสดุ: เพิ่ม "กำหนดถึง" ของ PM/RM (วันคาดว่าจะมาถึง).
-- โมเดลใหม่: แต่ละบรรทัดมี กำหนดถึง PM/RM + สถานะ "มาแล้ว" (ใช้ pmArrivedAt/
-- rmArrivedAt เดิม: non-null = มาแล้ว). เลิกใช้ pmInStock / rmOrderedAt (คงคอลัมน์ไว้เฉยๆ).
-- สถานะบรรทัด PO: produced / delivered / closed เก็บใน sahamit_po_lines.status (text
-- เดิม ไม่ต้อง migration). "พร้อมผลิต" คิดจาก PM+RM มาแล้วจริง (ไม่ใช่แค่กำหนดถึง).
-- รันมือบน Supabase prod ก่อน deploy.

ALTER TABLE sahamit_material_tracking ADD COLUMN IF NOT EXISTS "pmDueDate" date;
ALTER TABLE sahamit_material_tracking ADD COLUMN IF NOT EXISTS "rmDueDate" date;

NOTIFY pgrst, 'reload schema';
