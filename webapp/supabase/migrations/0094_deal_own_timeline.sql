-- 0094 - ดีลถือไทม์ไลน์ของตัวเอง (Deal-centric DL1)
-- มติผู้ใช้: ดีลมี 4 การ์ดของตัวเอง (งาน/ไทม์ไลน์/ใบเสนอราคา/ความเคลื่อนไหว)
-- เก็บข้อมูลแยกจากโครงการ — ไทม์ไลน์เกิดที่ดีลตั้งแต่ยังไม่มีโครงการ
-- (project_tasks.projectId ว่างได้) แล้วค่อย "ถูกโครงการรับเลี้ยง" ตอนผูก
-- (UPDATE projectId → Gantt โครงการ merge เห็นทันที ไม่ต้อง gen ใหม่)

-- task ลอยของดีล: projectId ว่างได้ (เดิม NOT NULL + FK cascade — FK คงไว้)
ALTER TABLE public.project_tasks ALTER COLUMN "projectId" DROP NOT NULL;

-- หมวดสินค้าบนดีล (รูปแบบ 'MM-TTT' เช่น 01-002) — ใช้เลือก template ตามหมวด
-- ตอน gen ไทม์ไลน์ (ขั้นสรรพสามิตแสดงเฉพาะ 01-002 ตาม categoryOnly เดิม)
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS "categoryCode" text;

NOTIFY pgrst, 'reload schema';
