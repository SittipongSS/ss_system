-- 0099_chat_webhooks.sql
-- เฟส 2 ของ GOOGLE_CHAT_PLAN.md: ย้าย webhook URL ของ Google Chat จาก env
-- (CHAT_WEBHOOK_APPROVALS/SALES/PM) มาเก็บในตาราง ให้ supervisor แก้ได้เอง
-- ผ่านหน้า /database/chat-webhooks โดยไม่ต้อง redeploy.
--
-- ลำดับการอ่านของ lib/chat.js: มี row ของ key นั้น → ยึดตาราง (enabled=false = ปิดจริง)
-- ไม่มี row → fallback env เดิม (ระบบที่ตั้ง env ไว้แล้วทำงานต่อเนื่องไม่สะดุด)
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

create table if not exists chat_webhooks (
  key           text primary key,            -- 'approvals' | 'sales' | 'pm'
  url           text,                         -- webhook URL (https://chat.googleapis.com/...)
  label         text,                         -- ชื่อ space ที่คนอ่านเข้าใจ เช่น 'SS-อนุมัติ'
  enabled       boolean not null default true,
  "updatedBy"   text,
  "updatedByName" text,
  "updatedAt"   timestamptz default now()
);

-- RLS: เปิดไว้ ไม่มี policy (เข้าผ่าน service-role เท่านั้น เหมือนตารางอื่น)
alter table chat_webhooks enable row level security;

-- แจ้ง PostgREST ให้รีโหลด schema cache ทันที (กัน 404 table not found หลังรัน)
notify pgrst, 'reload schema';
