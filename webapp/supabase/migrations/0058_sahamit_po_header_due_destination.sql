-- 0058 — SAHAMIT: ย้าย "กำหนดรับของ (dueDate)" + "สถานที่ส่ง (destination)"
-- มาเป็นระดับหัว PO (ทั้ง PO ใช้ค่าเดียวกัน). เดิมเก็บรายบรรทัดใน sahamit_po_lines;
-- ตอนสร้าง PO จะเขียนค่าหัวลงทุกบรรทัดด้วย (denormalize) เพื่อให้กระทบยอด/วัสดุ
-- ที่อ่าน deliveryMonth/destination รายบรรทัดทำงานได้เหมือนเดิม.
-- รันมือบน Supabase prod ก่อน deploy.

ALTER TABLE sahamit_pos ADD COLUMN IF NOT EXISTS "dueDate" date;
ALTER TABLE sahamit_pos ADD COLUMN IF NOT EXISTS destination text;

-- backfill ค่าหัวจากบรรทัดเดิม (ถ้าทุกบรรทัดตรงกัน) เพื่อ PO เก่าไม่ว่าง
UPDATE sahamit_pos p SET "dueDate" = sub.due
FROM (
  SELECT "poId", MIN("dueDate") AS due
  FROM sahamit_po_lines
  WHERE "dueDate" IS NOT NULL
  GROUP BY "poId"
  HAVING COUNT(DISTINCT "dueDate") = 1
) sub
WHERE p.id = sub."poId" AND p."dueDate" IS NULL;

UPDATE sahamit_pos p SET destination = sub.dest
FROM (
  SELECT "poId", MIN(destination) AS dest
  FROM sahamit_po_lines
  WHERE destination IS NOT NULL
  GROUP BY "poId"
  HAVING COUNT(DISTINCT destination) = 1
) sub
WHERE p.id = sub."poId" AND p.destination IS NULL;

NOTIFY pgrst, 'reload schema';
