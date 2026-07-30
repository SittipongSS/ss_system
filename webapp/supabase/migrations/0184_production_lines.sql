-- ============================================================
--  Migration 0184: ไลน์ผลิต + กำลังผลิตรายวัน (PR-1)
--  แผน docs/service-production-scheduling-plan.md §3.2
--
--  ของเดิม: **โรงงานไม่มีตัวตนในระบบเลย** — ขั้น "ผลิตสินค้า 3 วัน" ในแม่แบบ
--  ไทม์ไลน์ (lib/pm/templates.js step 41 / re-order 14) เป็นแค่แท่งบน Gantt
--  ที่ไม่ผูกกับไลน์ไหน → SO 4 ใบที่ขั้นผลิตทับสัปดาห์เดียวกันจะเขียวหมดทั้ง 4 ใบ
--  ทั้งที่โรงงานทำได้ใบเดียว (แผนโกหกเงียบ ๆ)
--
--  ใบนี้ลงแค่ "กำลัง" (capacity) — ตัวงานผลิต (production_jobs) อยู่ใน 0185
--
--  ⚠ รันมือบน Supabase SQL Editor · **ตารางใหม่ล้วน รันก่อน deploy ได้เลย**
-- ============================================================

BEGIN;

-- ── ไลน์ผลิต — ข้อมูลหลัก แก้ไม่บ่อย ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_lines (
  id                text PRIMARY KEY,
  -- รหัสที่คนโรงงานเรียกกันจริง ('MIX-01') ไม่ใช่เลขรัน — ตั้งเอง
  code              text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 30),
  name              text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  kind              text NOT NULL DEFAULT 'other'
                      CHECK (kind IN ('mix', 'fill', 'pack', 'other')),
  -- กำลังผลิตต่อ "วันทำการ" (เสาร์-อาทิตย์/วันหยุดไม่นับ — ตัวคำนวณข้ามให้เอง)
  -- NULL = ยังไม่ระบุกำลัง → ตัวเตือนเกินกำลังจะเงียบสำหรับไลน์นี้ (ไม่เดาแทน)
  "capacityPerDay"  numeric CHECK ("capacityPerDay" IS NULL OR "capacityPerDay" > 0),
  -- หน่วยของกำลัง = หน่วยของงานที่จองไลน์นี้ (มติ §10.1: งาน 1 ใบจองไลน์เดียว)
  unit              text CHECK (unit IS NULL OR length(unit) <= 30),
  "isActive"        boolean NOT NULL DEFAULT true,
  "sortOrder"       integer NOT NULL DEFAULT 0,
  note              text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"     text, "createdByName" text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

-- รหัสไลน์ห้ามซ้ำ — เทียบแบบไม่สนตัวพิมพ์ ('mix-01' กับ 'MIX-01' คือไลน์เดียวกัน
-- ในหัวคนโรงงาน แต่เป็นคนละแถวถ้าเทียบดิบ แล้วโหลดจะถูกนับแยกกันเงียบ ๆ)
CREATE UNIQUE INDEX IF NOT EXISTS production_lines_code_uk
  ON public.production_lines (lower(btrim(code)));
CREATE INDEX IF NOT EXISTS production_lines_active_idx
  ON public.production_lines ("sortOrder", code) WHERE "isActive";

-- ── วันที่ไลน์ทำงานไม่ปกติ ─────────────────────────────────────────────
-- ซ่อมบำรุง / เพิ่มกะ / ปิดไลน์เฉพาะกิจ — override กำลังเป็นรายวัน
-- ⚠️ 0 = ปิดไลน์วันนั้น ซึ่ง **ต่างจาก NULL** ('ไม่ระบุ') อย่างสิ้นเชิง จึงบังคับ NOT NULL
--    (บทเรียนต้นทุน: 0 ที่แปลว่า "ไม่รู้" อ่านเป็น "ฟรี" มาแล้ว)
CREATE TABLE IF NOT EXISTS public.production_capacity_days (
  id                text PRIMARY KEY,
  "lineId"          text NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  date              date NOT NULL,
  "capacityPerDay"  numeric NOT NULL CHECK ("capacityPerDay" >= 0),
  reason            text CHECK (reason IS NULL OR length(reason) <= 200),
  "createdById"     text, "createdByName" text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  -- กันปีพิมพ์ผิดแบบที่เจอมาแล้วบน prod (`formulaDate = '2202-08-06'`)
  CONSTRAINT production_capacity_days_date_sane
    CHECK (date BETWEEN '2000-01-01' AND '2100-12-31')
);

-- หนึ่งไลน์มีค่า override ได้วันละค่าเดียว — ไม่งั้นคำถาม "วันนี้กำลังเท่าไร"
-- มีสองคำตอบ แล้วตัวเตือนเกินกำลังจะเลือกไม่ถูก
CREATE UNIQUE INDEX IF NOT EXISTS production_capacity_days_line_date_uk
  ON public.production_capacity_days ("lineId", date);
CREATE INDEX IF NOT EXISTS production_capacity_days_date_idx
  ON public.production_capacity_days (date);

ALTER TABLE public.production_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_capacity_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.production_lines,         public.production_capacity_days FROM anon, authenticated;
GRANT  ALL ON TABLE public.production_lines,         public.production_capacity_days TO service_role;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
