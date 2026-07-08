-- 0082 — เลิกใช้ stage 'in_project' (แผน merge เฟส 4).
-- โมเดลใหม่: 'won' คือสถานะปิดสุดท้ายเสมอ; การมี/ผูก PM project เป็นมิติงานผลิตแยก
-- ไม่ใช่สถานะดีล. winStageForProject() คืน 'won' อยู่แล้ว จึงไม่มีการสร้าง in_project
-- ใหม่ — เหลือแต่ข้อมูลเก่า. แปลงเป็น 'won' แล้วตัดออกจาก CHECK.

-- 1) แปลงข้อมูลเก่า in_project → won (ค่าอื่นคงเดิม)
UPDATE public.sales_deals SET stage = 'won' WHERE stage = 'in_project';

-- 2) ตัด 'in_project' ออกจาก CHECK constraint
ALTER TABLE public.sales_deals
  DROP CONSTRAINT IF EXISTS sales_deals_stage_check;

ALTER TABLE public.sales_deals
  ADD CONSTRAINT sales_deals_stage_check
  CHECK (stage IN (
    'lead',
    'qualified',
    'quotation',
    'timeline_proposed',
    'awaiting_confirm',
    'deposit_pending',
    'won',
    'lost'
  ));

NOTIFY pgrst, 'reload schema';
