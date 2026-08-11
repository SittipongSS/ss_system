-- ── ผู้รับผิดชอบรายคนของคำร้อง (มติผู้ใช้ 2026-08-12) ─────────────────────
--
-- ⭐ **"ใครถือใบนี้" ต้องแยกจาก "ใครกดรับเรื่อง"** — ตาราง "งานค้างรายคน" (ม-107)
-- ใช้ `acknowledgedById` เป็นตัวชี้ว่างานอยู่ที่ใคร ซึ่งพอในวันแรกแต่ผิดทันทีที่
-- หัวหน้ากดรับแทนทีมทั้งกอง: ทั้งฝ่ายจะขึ้นชื่อหัวหน้าคนเดียว แล้วตารางนั้นก็
-- เลิกมีประโยชน์ · การรับเรื่อง = "ฝ่ายรับงานแล้ว" (คำสัญญาต่อผู้ขอ) ส่วนการมอบหมาย
-- = "คนนี้ลงมือ" (การจัดคนในฝ่าย) สองเรื่องนี้เกิดคนละเวลาและเปลี่ยนคนละเหตุผล
--
-- ⚠️ **ไม่มี NOT NULL และไม่มีค่าตั้งต้น** — ใบเก่าทุกใบจึงยังอ่านได้เหมือนเดิม
-- และโค้ดต้องถอยไปใช้ `acknowledgedById` เองเมื่อยังไม่มีใครถูกมอบหมาย
-- (`requestAssignee()` ใน lib/requests/assign.js เป็นที่เดียวที่ตัดสินเรื่องนี้)
--
-- ⚠️ **เก็บทั้ง id และชื่อ** ตามแบบเดียวกับ `acknowledgedBy*`/`closedBy*` ในตารางนี้ —
-- id ใช้จับคู่/กรอง ส่วนชื่อเป็น snapshot ให้ใบเก่ายังอ่านออกแม้คนนั้นลาออกไปแล้ว
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "assigneeId"     text,
  ADD COLUMN IF NOT EXISTS "assigneeName"   text,
  ADD COLUMN IF NOT EXISTS "assignedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "assignedById"   text,
  ADD COLUMN IF NOT EXISTS "assignedByName" text;

-- ชื่อยาวเกินจอ = ข้อมูลผิด ไม่ใช่ชื่อคน (กติกาเดียวกับช่องชื่ออื่นในตารางนี้)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_requests_assignee_name_len'
  ) THEN
    ALTER TABLE public.dept_requests
      ADD CONSTRAINT dept_requests_assignee_name_len
      CHECK ("assigneeName" IS NULL OR length("assigneeName") <= 200);
  END IF;
END $$;

-- ⚠️ มอบหมายแล้วต้องมีเวลากำกับเสมอ — ไม่งั้นตอบไม่ได้ว่า "ค้างที่คนนี้มากี่วัน"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_requests_assigned_at_required'
  ) THEN
    ALTER TABLE public.dept_requests
      ADD CONSTRAINT dept_requests_assigned_at_required
      CHECK ("assigneeId" IS NULL OR "assignedAt" IS NOT NULL);
  END IF;
END $$;

-- คิวรายคนของฝ่าย: "งานที่มอบให้คนนี้ ยังไม่จบ" — ดัชนีตรงกับที่ตารางงานค้างถาม
CREATE INDEX IF NOT EXISTS dept_requests_assignee_idx
  ON public.dept_requests (dept, "assigneeId", status);
