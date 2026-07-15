-- 0104 - ระบบสอบถาม–ตอบกลับ (Inquiry) ฝ่ายขาย ↔ ฝ่ายที่ถูกถาม (เริ่มที่ RD)
--   ดีไซน์: "เก็บแยก โชว์รวม" — เธรดถาม-ตอบมีสถานะ/SLA ของตัวเอง (ตารางนี้)
--   แล้วค่อย merge เหตุการณ์เข้าฟีดความเคลื่อนไหวของดีลตอนอ่าน (ไม่เขียนซ้ำ).
--   รหัส IQ-YYMMXXXX ออกเลขผ่าน next_entity_number (mig 0096) scope 'IQ'.
-- ⚠ รันมือบน Supabase SQL Editor (เหมือน migration อื่น) ก่อน deploy.

CREATE TABLE IF NOT EXISTS public.inquiries (
  id            text PRIMARY KEY,
  code          text UNIQUE,                    -- IQ-YYMMXXXX
  title         text NOT NULL,
  "targetDept"  text NOT NULL DEFAULT 'RD',     -- ฝ่ายที่ถูกถาม (โค้ดฝ่าย เช่น RD)
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'answered', 'closed')),
  urgent        boolean NOT NULL DEFAULT false,
  -- ลิงก์บริบท (logical link แบบเดียวกับ personal_tasks — ไม่บังคับ FK)
  "dealId"      text,
  "projectId"   text,
  "customerId"  text,
  -- ฝั่งผู้ถาม (ฝ่ายขาย) — team ใช้ scope การมองเห็นฝั่งขาย (own/team/all)
  "requesterId"   text NOT NULL,
  "requesterName" text,
  team          text,
  -- ฝั่งผู้ตอบ: คนในฝ่ายที่กด "รับเรื่อง" (null = ยังไม่มีใครรับ ทั้งฝ่ายเห็นในคิว)
  "assigneeId"    text,
  "assigneeName"  text,
  -- SLA ตอบกลับ: default +3 วันทำการจากวันสร้าง (คำนวณฝั่งแอปด้วยปฏิทินวันหยุดจริง)
  "dueDate"     date,
  "answeredAt"  timestamptz,                    -- ตอบครั้งแรก — เส้นวัด SLA
  "closedAt"    timestamptz,
  "closedBy"    text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiries_dept_status_idx ON public.inquiries ("targetDept", status);
CREATE INDEX IF NOT EXISTS inquiries_deal_idx ON public.inquiries ("dealId");
CREATE INDEX IF NOT EXISTS inquiries_team_idx ON public.inquiries (team);
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- เธรดข้อความในเรื่องสอบถาม (แพตเทิร์นเดียวกับ mgmt_updates + แนบไฟล์แบบ
-- sales_deal_activities: jsonb ตัวชี้ไฟล์ที่อัปผ่าน /api/upload แล้ว)
CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id           text PRIMARY KEY,
  "inquiryId"  text NOT NULL,
  kind         text NOT NULL DEFAULT 'comment'
               CHECK (kind IN ('comment', 'status')),  -- status = เหตุการณ์ระบบ (รับเรื่อง/ปิด/เปิดใหม่)
  body         text,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "authorId"   text,
  "authorName" text,
  "authorDept" text,                             -- ฝ่ายของผู้เขียน — ใช้แยกฝั่งถาม/ฝั่งตอบตอนแสดงผล
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiry_messages_inquiry_idx
  ON public.inquiry_messages ("inquiryId", "createdAt");
ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;

-- ปุ่ม "สร้างงานจากคำถาม": งานฝั่ง RD พกลิงก์ย้อนกลับไปเรื่องสอบถามต้นทาง
ALTER TABLE public.personal_tasks ADD COLUMN IF NOT EXISTS "inquiryId" text;

NOTIFY pgrst, 'reload schema';
