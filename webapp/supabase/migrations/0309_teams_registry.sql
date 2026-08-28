-- ============================================================
--  Migration 0309: ทะเบียนทีม + ทีมปฏิบัติงาน (docs/team-management-plan.md)
--
--  ⚠️ **ใบนี้เคยชื่อ 0308 และถูกรันจริงบน Supabase ไปแล้ว 2026-08-28 ตอนใช้เลขนั้น**
--  เปลี่ยนเลขเพราะอีกเซสชันใช้ 0308 ไปแล้ว (0308_workflow_step_role_lg_to_ra) และ
--  ใบนั้น merge เข้า main ก่อน — เลขซ้ำสองใบคือสิ่งที่ check:migrations ห้ามไว้
--  เนื้อในไม่เปลี่ยน และ idempotent อยู่แล้ว (CREATE TABLE IF NOT EXISTS + ON CONFLICT)
--
--  ⭐ **มติผู้ใช้ 2026-08-28**: *"อยากย้ายการจัดทีมออกมาเป็นของแต่ละระบบแทน ให้
--  Supervisor/หัวหน้า/ผู้ช่วย ตั้งเองได้ไม่ต้องรอแอดมิน และแยกเฉพาะฝ่ายได้ด้วย"*
--  + *"TS ก็มีแยกทีม"* — ฝ่ายช่างแบ่งทีมกันจริงในหน้างาน
--
--  ── ทำไมต้องมีตาราง ──────────────────────────────────────────────────────
--  วันนี้ "ทีม" ไม่ใช่ข้อมูล เป็นค่าคงที่ 3 ตัวในโค้ด (`TEAMS = ['ODM','KA','SV']`)
--  ⇒ "สร้างทีมเองได้" เป็นไปไม่ได้เลยจนกว่าจะยกขึ้นเป็นทะเบียน
--
--  ── สองแกนที่แยกกันโดยเจตนา (plan §2) ────────────────────────────────────
--  · kind='sales' — ทีมขาย: ผูก **สิทธิ์และยอด** · สมาชิกยังอยู่ที่
--    `auth.users.app_metadata.team/teams` เหมือนเดิม **ห้ามย้ายมาตารางนี้**
--    (ทุกด่านสิทธิ์อ่าน app_metadata แบบ sync ตอน render — ย้ายมา DB = ทุกการเช็ค
--     สิทธิ์ต้องยิงฐาน และ ADR 0015 ทั้งฉบับตั้งอยู่บนของเดิม)
--  · kind='crew'  — ทีมปฏิบัติงาน: **ไม่แตะสิทธิ์เลย** ใช้จัดคนอย่างเดียว
--    ⇒ ฝ่าย TS มีทีมได้โดยไม่ต้องให้ช่างถือ role ฝ่ายขาย ซึ่งจะลากสิทธิ์เห็นดีล/
--    ใบเสนอราคา/มูลค่าทั้งทีมมาด้วย (มติ 2026-07-31 ที่ห้ามไว้)
--
--  ⚠️ **ปิดทีม ไม่ใช่ลบทีม** — รหัสทีมถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19 ตาราง
--  และอยู่ในกุญแจของ unique index 3 ตัว · ลบแถวทะเบียนแล้วป้ายในรายงานย้อนหลัง
--  กลายเป็นรหัสดิบทันที ⇒ มีแค่ `isActive`
--
--  ⚠️ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน + backfill 3 ทีมเดิม รันก่อน deploy ได้
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.teams (
  code         text PRIMARY KEY,
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  -- ฝ่ายเจ้าของทีม — ตัวเดียวกับ app_metadata.department (SA · TS · PD …)
  -- ⚠️ ไม่มี FK เพราะทะเบียนฝ่ายอยู่ในโค้ด (permissions.DEPARTMENTS) ไม่ใช่ตาราง
  department   text NOT NULL CHECK (length(btrim(department)) BETWEEN 1 AND 20),
  -- แกนตาม plan §2 — ห้ามเพิ่มค่าที่สามโดยไม่ตอบก่อนว่ามันผูกสิทธิ์หรือไม่
  kind         text NOT NULL CHECK (kind IN ('sales', 'crew')),
  "leadId"     text,
  "leadName"   text,
  "isActive"   boolean NOT NULL DEFAULT true,
  "sortOrder"  integer NOT NULL DEFAULT 100,
  note         text CHECK (note IS NULL OR length(note) <= 500),
  "createdById" text, "createdByName" text,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- ชื่อทีมซ้ำในฝ่ายเดียว = คนละทีมที่คนอ่านแยกไม่ออก
CREATE UNIQUE INDEX IF NOT EXISTS teams_dept_name_uk
  ON public.teams (department, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS teams_dept_idx ON public.teams (department, "sortOrder");

/* ── สมาชิกทีมปฏิบัติงาน ──────────────────────────────────────────────────
   ⚠️ **ใช้กับ kind='crew' เท่านั้น** — ทีมขายอ่านสมาชิกจาก app_metadata
   ถ้าเก็บสมาชิกทีมขายที่นี่ด้วย จะได้ทะเบียนสองเล่มที่ไม่ตรงกันภายในเดือนเดียว
   (ด่านสิทธิ์อ่านเล่มหนึ่ง หน้าจัดทีมอ่านอีกเล่มหนึ่ง) */
CREATE TABLE IF NOT EXISTS public.team_members (
  "teamCode"   text NOT NULL REFERENCES public.teams(code) ON DELETE RESTRICT,
  "userId"     text NOT NULL,
  "userName"   text,
  "joinedAt"   date,
  "addedById"  text, "addedByName" text,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("teamCode", "userId")
);

/* คนหนึ่งอยู่ทีมปฏิบัติงานได้ทีมเดียวต่อฝ่าย — ต่างจากทีมขายที่อยู่ได้หลายทีม
   (ทีมขาย = ขอบเขตการเห็นข้อมูล ซ้อนกันได้ · ทีมช่าง = คนไปทำงานอยู่กลุ่มไหน
   วันนี้ ซ้อนไม่ได้) · บังคับที่ API เพราะต้อง join หา department ของทีม */
CREATE INDEX IF NOT EXISTS team_members_user_idx ON public.team_members ("userId");

-- ── backfill 3 ทีมขายเดิมให้ตรงกับ TEAMS ในโค้ดเป๊ะ ────────────────────
-- ⚠️ ลำดับต้องตรงกับ `TEAMS` (permissions.js) ไม่ใช่ `SALES_TEAMS`/`TEAM_ORDER`
--    ที่เรียงคนละแบบ — งวดถัดไปจะยุบสามชุดนั้นมาอ่านทะเบียนนี้แทน
INSERT INTO public.teams (code, name, department, kind, "sortOrder", note)
VALUES
  ('ODM', 'New ODM',     'SA', 'sales', 10, 'ย้ายมาจากค่าคงที่ TEAMS ในโค้ด (mig 0308)'),
  ('KA',  'Key Account', 'SA', 'sales', 20, 'ย้ายมาจากค่าคงที่ TEAMS ในโค้ด (mig 0308)'),
  ('SV',  'Services',    'SA', 'sales', 30, 'ย้ายมาจากค่าคงที่ TEAMS ในโค้ด (mig 0308)')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.teams IS
  'ทะเบียนทีม — kind=sales ผูกสิทธิ์/ยอด (สมาชิกอยู่ที่ app_metadata) · kind=crew จัดคนอย่างเดียว ไม่แตะสิทธิ์';
COMMENT ON COLUMN public.teams."isActive" IS
  'ปิดทีม ไม่ใช่ลบ — รหัสทีมถูกก๊อปเป็นข้อความลง 19 ตารางและอยู่ในกุญแจ unique index จึงลบไม่ได้';

ALTER TABLE public.teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teams, public.team_members FROM anon, authenticated;
GRANT  ALL ON TABLE public.teams, public.team_members TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
