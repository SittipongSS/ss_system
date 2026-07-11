-- 0089 - หลายดีลต่อ 1 โครงการ (Sales Revamp เฟส B).
-- ดรอป unique 1:1 (0064) — ดีล NPD ก่อตั้งโครงการ, ดีลถัดไป (RE-ORDER/อื่น) ผูกเข้า
-- โครงการเดิมผ่าน link-project. plain index sales_deals_project_id_idx มีอยู่แล้ว (0064).
-- ⚠ ลำดับ: รันคู่กับ deploy โค้ดเฟส B (ฝั่ง PM อ่านดีลเป็น list แล้ว) — ห้ามรันทิ้งไว้
--   กับโค้ดเก่าที่ยังสร้างดีลที่สองได้เอง (ตอนนี้ยังไม่มีทางสร้าง จึงปลอดภัย).
-- ดูแผน: webapp/DEAL_PROJECT_RESTRUCTURE_PLAN.md §3.

DROP INDEX IF EXISTS public.sales_deals_project_id_uidx;

NOTIFY pgrst, 'reload schema';
