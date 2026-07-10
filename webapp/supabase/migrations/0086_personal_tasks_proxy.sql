-- 0086_personal_tasks_proxy.sql
-- เพิ่มคอลัมน์ updatedBy เพื่อบันทึกการทำแทน (Proxy Work) เช่น หัวหน้า/แอดมินแก้ไขสถานะงานแทนลูกทีม
-- คะแนน KPI จะยังคงตกเป็นของผู้รับผิดชอบงาน (assigneeId หรือ ownerId) ตามเดิม

alter table personal_tasks add column if not exists "updatedBy" text;

create index if not exists personal_tasks_updatedby_idx on personal_tasks ("updatedBy");
