-- 0087_personal_tasks_proxy_worker.sql
-- ระบบ "ดึงงานมาทำแทน" (Proxy Work v2): เพื่อนร่วมทีมรับงานของคนอื่นมาทำได้เอง
-- โดยเจ้าของ/ผู้รับมอบหมายไม่ต้องเปลี่ยน assigneeId. คนที่ดึงไปทำ (proxyBy) จะได้
-- เครดิต KPI แทนผู้รับผิดชอบเดิม (kpiCreditId = proxyBy || assigneeId || ownerId).
--   • ต่างจาก updatedBy (mig 0086) ที่เป็นแค่ "คนแก้ล่าสุด" — proxyBy = ตั้งใจรับงานมาทำ
--   • ปรับสถานะได้เฉพาะ owner/assignee/proxyBy/หัวหน้า (ต้องดึงมาทำแทนก่อนถึงปรับได้)
-- ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (DDL ผ่าน service-role ไม่ได้ — เหมือน 0085/0086).

alter table personal_tasks add column if not exists "proxyBy" text;   -- user id ของผู้ดึงงานมาทำแทน (nullable)

create index if not exists personal_tasks_proxyby_idx on personal_tasks ("proxyBy");
