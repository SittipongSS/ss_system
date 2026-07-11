-- 0091 - โมดูลลีด (Sales Revamp เฟส C).
-- Marketing กรอกลีดรายวัน → Supervisor คัดกรองส่งทีม (SLA 1 วันทำการ) → Senior กระจาย
-- AE ติดต่อกลับ (SLA 1 วันทำการ) → นัดประชุม → เปิดลูกค้า/โครงการ. ทุก transition
-- เก็บ timestamp เพื่อคำนวณ KPI/SLA อัตโนมัติ (ไม่กรอกมือ). ดู SALES_REVAMP_PLAN §2.1/§3.

CREATE TABLE IF NOT EXISTS public.sales_leads (
  id text PRIMARY KEY,
  channel text NOT NULL
    CHECK (channel IN ('chatcone_line','chatcone_meta','chatcone_tiktok','chatcone_ig','phone','walkin','website')),
  "channelGroup" text NOT NULL
    CHECK ("channelGroup" IN ('online','onsite','website')),
  "contactName" text NOT NULL,
  company text,
  email text,
  "contactChannel" text,
  phone text,
  "serviceInterest" text NOT NULL DEFAULT 'other'
    CHECK ("serviceInterest" IN ('diffuser','workshop','product','other')),
  "serviceDetail" text,
  budget numeric CHECK (budget IS NULL OR budget >= 0),
  details text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','screened','assigned','contacted','meeting','qualified','disqualified')),
  team text,
  "assigneeId" text,
  "assigneeName" text,
  "disqualifiedReason" text,
  "customerId" text REFERENCES public.customers(id) ON DELETE SET NULL,
  "projectId" text REFERENCES public.projects(id) ON DELETE SET NULL,
  -- timestamp ต่อ transition — แหล่งคำนวณ SLA (วันทำการ ผ่านตาราง holidays)
  "screenedAt" timestamptz,
  "assignedAt" timestamptz,
  "firstContactAt" timestamptz,
  "meetingAt" timestamptz,
  "closedAt" timestamptz,           -- qualified/disqualified
  "createdBy" text,
  "createdByName" text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_leads_status_idx ON public.sales_leads (status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS sales_leads_team_idx ON public.sales_leads (team, status);
CREATE INDEX IF NOT EXISTS sales_leads_assignee_idx ON public.sales_leads ("assigneeId");
CREATE INDEX IF NOT EXISTS sales_leads_channel_idx ON public.sales_leads (channel);
CREATE INDEX IF NOT EXISTS sales_leads_created_by_idx ON public.sales_leads ("createdBy", "createdAt" DESC);

-- ทุก transition + ตีกลับ (ใคร เมื่อไหร่ จากไหนไปไหน เหตุผล) — แหล่ง audit/KPI ของลีด
CREATE TABLE IF NOT EXISTS public.lead_events (
  id text PRIMARY KEY,
  "leadId" text NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('create','screen','assign','contact','meeting','qualify','disqualify','bounce','update')),
  "fromStatus" text,
  "toStatus" text,
  team text,
  "assigneeId" text,
  "assigneeName" text,
  reason text,
  "meetingMode" text CHECK ("meetingMode" IS NULL OR "meetingMode" IN ('onsite_customer_visit','onsite_at_office','online')),
  "eventAt" timestamptz,            -- เวลานัด/เวลาเกิดเหตุการณ์จริง (แยกจาก createdAt เวลาบันทึก)
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON public.lead_events ("leadId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS lead_events_kind_idx ON public.lead_events (kind, "createdAt" DESC);

-- มติผู้ใช้: อัปเดต/นัดประชุมบันทึกแยกต่อดีล → รวมที่โครงการ; เวลานัดจริง + รูปแบบนัด
-- (ลูกค้ามา/ออกไปหา/online) — ฐานข้อมูลปฏิทินนัดในอนาคต (view จาก activityAt)
ALTER TABLE public.sales_deal_activities
  ADD COLUMN IF NOT EXISTS "activityAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "meetingMode" text
    CHECK ("meetingMode" IS NULL OR "meetingMode" IN ('onsite_customer_visit','onsite_at_office','online'));

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
