-- ============================================================
--  Migration 0223: ระบบแจ้งปัญหาระบบ (system issue reporting)
--  แผน docs/system-issue-reporting-plan.md §6
--
--  ⚠️ **เขียนไว้เป็น 0219 ตอนแรก และ "รันไปแล้วบนฐานจริง" ในชื่อนั้น (2026-08-07)**
--  ระหว่างทำงาน สาย RD merge เข้า main ก่อนและกินเลข 0219–0222 ไป ตามกติกาโปรเจกต์
--  ไฟล์ที่มาทีหลังจึงเลื่อนเลขเป็น 0223 · **เนื้อ SQL ไม่เปลี่ยนแม้แต่บรรทัดเดียว**
--  ⇒ ฐานที่รัน 0219 เวอร์ชันนี้ไปแล้ว **ไม่ต้องรันซ้ำ** และไม่มีอะไรต้องแก้ตามหลัง
--
--  ⭐ ที่มา: ผู้ใช้ที่เจอบั๊กไม่มีทางส่งเรื่องถึงคนดูแลระบบเลย นอกจากเดินไปบอก
--  หรือทักไลน์ ซึ่งไม่มีสถานะ ไม่มีเลขที่ และไม่มีใครรู้ว่าแก้แล้วหรือยัง
--
--  ⚠️ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน ไม่แตะของเดิม รันก่อน deploy ได้เลย
--
--  ⚠️ **ไม่มี trigger คุมการเปลี่ยนสถานะ** (ต่างจาก guard_dept_request ของ 0173)
--  โดยเจตนา — กติกาที่นี่เป็นเรื่อง "แถวนี้สอดคล้องในตัวเองไหม" ซึ่ง CHECK ตอบได้ครบ
--  ส่วนลำดับขั้น (pending → acknowledged → resolved → closed) บังคับที่ชั้น API
--  พร้อมเทสต์ · trigger เพิ่มของที่ต้องคอยดูแลให้ตรงกันโดยไม่ได้อะไรเพิ่ม
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_issues (
  id            text PRIMARY KEY,
  code          text UNIQUE,               -- IS-YYMMXXXX (next_entity_number scope 'IS')

  kind          text NOT NULL DEFAULT 'bug'
                  CHECK (kind IN ('bug', 'request', 'question')),
  -- ⭐ ผลกระทบต่อ "การทำงาน" ไม่ใช่ "ความด่วน" — ถามว่างานหยุดไหมเป็นข้อเท็จจริง
  -- ที่ตรวจสอบได้ ส่วนถามความด่วนจะได้ "ด่วนมาก" ทุกใบจนเรียงลำดับไม่ได้
  impact        text NOT NULL DEFAULT 'workaround'
                  CHECK (impact IN ('blocked', 'workaround', 'minor')),

  title         text CHECK (title IS NULL OR length(title) <= 200),
  detail        text NOT NULL CHECK (length(detail) BETWEEN 1 AND 5000),

  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'acknowledged', 'resolved', 'closed', 'rejected')),

  -- ── ผู้แจ้ง (snapshot เสมอ — คนลาออกแล้วเรื่องต้องอ่านย้อนได้) ──
  "reportedById"   text NOT NULL,
  "reportedByName" text,
  "reporterRole"       text,
  "reporterDepartment" text,
  "reporterTeam"       text,

  -- ── ผู้รับผิดชอบ (แอดมิน) ──
  "assigneeId"     text,
  "assigneeName"   text,

  -- ── บริบทที่เก็บอัตโนมัติตอนกดส่ง ──
  "pageUrl"     text CHECK ("pageUrl" IS NULL OR length("pageUrl") <= 500),
  "userAgent"   text CHECK ("userAgent" IS NULL OR length("userAgent") <= 500),
  -- stack จาก error boundary — มีเฉพาะเรื่องที่เปิดจากหน้าที่พังจริง
  "errorStack"  text CHECK ("errorStack" IS NULL OR length("errorStack") <= 8000),

  -- ── เวลาของแต่ละขั้น ──
  "acknowledgedAt" timestamptz,
  "resolvedAt"     timestamptz,
  "closedAt"       timestamptz,
  -- ⚠️ ปิดเองเพราะผู้แจ้งเงียบ 7 วัน ≠ ผู้แจ้งยืนยันว่าหาย — ต้องแยกออกจากกัน
  -- ให้อ่านย้อนได้ ไม่งั้นสถิติ "แก้แล้วหายจริง" จะโป่งด้วยเรื่องที่ไม่มีใครยืนยัน
  "autoClosed"     boolean NOT NULL DEFAULT false,
  "rejectReason"   text CHECK ("rejectReason" IS NULL OR length("rejectReason") <= 1000),

  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),

  -- ปฏิเสธแล้วต้องบอกเหตุผลเสมอ — "ไม่ทำ" เฉย ๆ ทำให้ผู้แจ้งไม่รู้ว่าควรทำอะไรต่อ
  CONSTRAINT system_issues_reject_needs_reason CHECK (
    status <> 'rejected' OR ("rejectReason" IS NOT NULL AND length(btrim("rejectReason")) > 0)
  ),
  -- รับเรื่องแล้วต้องมีเจ้าภาพ ไม่งั้นเรื่องค้างในสถานะ "กำลังแก้" โดยไม่มีใครแก้
  CONSTRAINT system_issues_ack_needs_assignee CHECK (
    status NOT IN ('acknowledged', 'resolved') OR "assigneeId" IS NOT NULL
  ),
  -- เวลาต้องเดินตามลำดับขั้น — แถวที่ resolvedAt มาก่อน acknowledgedAt อ่านย้อนไม่ได้
  CONSTRAINT system_issues_time_order CHECK (
    ("resolvedAt" IS NULL OR "acknowledgedAt" IS NOT NULL)
    AND ("resolvedAt" IS NULL OR "acknowledgedAt" IS NULL OR "resolvedAt" >= "acknowledgedAt")
    AND ("closedAt"  IS NULL OR "closedAt" >= "createdAt")
  ),
  -- ปิด/ปฏิเสธเท่านั้นที่มี closedAt · และปิดแล้วต้องมี closedAt เสมอ
  CONSTRAINT system_issues_closed_at_matches_status CHECK (
    (status IN ('closed', 'rejected')) = ("closedAt" IS NOT NULL)
  ),
  -- autoClosed ใช้ได้เฉพาะกับเรื่องที่ปิดจริง
  CONSTRAINT system_issues_autoclose_only_closed CHECK (
    "autoClosed" = false OR status = 'closed'
  )
);

-- คิวแอดมินเปิดหน้าแล้วกรองตามสถานะเสมอ เรียงใหม่สุดก่อน
CREATE INDEX IF NOT EXISTS system_issues_status_created_idx
  ON public.system_issues (status, "createdAt" DESC);
-- "เรื่องของฉัน" ของผู้ใช้ทั่วไป
CREATE INDEX IF NOT EXISTS system_issues_reporter_idx
  ON public.system_issues ("reportedById", "createdAt" DESC);
-- "ที่ฉันรับผิดชอบ"
CREATE INDEX IF NOT EXISTS system_issues_assignee_idx
  ON public.system_issues ("assigneeId") WHERE "assigneeId" IS NOT NULL;
-- cron ปิดอัตโนมัติ กวาดเฉพาะเรื่องที่รอผู้แจ้งยืนยันอยู่
CREATE INDEX IF NOT EXISTS system_issues_awaiting_confirm_idx
  ON public.system_issues ("resolvedAt") WHERE status = 'resolved';
-- ชี้เรื่องซ้ำจากหน้าเดียวกันตอนผู้ใช้กำลังพิมพ์ + การ์ด "เรื่องอื่นจากหน้านี้"
CREATE INDEX IF NOT EXISTS system_issues_page_idx
  ON public.system_issues ("pageUrl", "createdAt" DESC) WHERE "pageUrl" IS NOT NULL;

ALTER TABLE public.system_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_issues FROM anon, authenticated;
GRANT  ALL ON TABLE public.system_issues TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.system_issues;                      -- ต้องได้ 0
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.system_issues'::regclass AND contype = 'c';
--   ต้องได้ 14 แถว = 5 constraint ที่ตั้งชื่อไว้ + 9 CHECK ที่ติดมากับคอลัมน์
--   (kind · impact · title · detail · status · pageUrl · userAgent · errorStack · rejectReason)
-- รันจริงเมื่อ 2026-08-07 — ได้ 14 ตามคาด

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.system_issues;
-- DELETE FROM public.entity_number_counters WHERE scope = 'IS';
-- NOTIFY pgrst, 'reload schema';
