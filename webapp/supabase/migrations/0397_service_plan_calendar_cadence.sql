-- ============================================================
--  Migration 0397: รอบบริการตามปฏิทิน — "ทุกเดือน วันที่ 22" / "ทุกสัปดาห์ วันพุธ" นอกจาก "ทุก N วัน"
--                  (มติเจ้าของ 29/09 + คำตอบ 4 ข้อ · แผน mockups/so-service-lines/IMPL_PLAN_C2.md §5)
--
--  🐞 ของเดิม: service_plans มีแค่ "everyDays" (ทุก N วัน) — "ทุกเดือน" ในฟอร์มคือ 30 วัน ⇒ สัญญา 12 เดือนได้ 13 นัด
--     บางเดือนได้สองนัด และวันที่ของเดือนไหลไปเรื่อย ๆ (22 → 17 ภายในปีเดียว) ทั้งที่ตารางช่างจริงนัด "วันที่ 17 ของเดือน"
--  ⭐ ของใหม่: รอบมีชนิด ("cadenceKind") + ช่องของชนิดนั้น · ทุกช่องนัดคิดจากวันเริ่มรอบ ไม่ใช่จากนัดก่อนหน้า (ไม่ไหล)
--     · นัดที่ระบบสร้างจำ "ช่องของรอบ" ไว้ ("planSlotDate") ⇒ ย้ายวันนัดแล้วบันทึกรอบซ้ำ ไม่ได้นัดซ้อนกลับมาที่วันเดิม
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านก่อนรัน: ต้องมี service_plans / service_visits (0188)
--  §1 service_plans + 5 ช่อง:
--       "cadenceKind"        text NOT NULL DEFAULT 'days'   — 'days' | 'weekly' | 'monthly'
--       "cadenceEvery"       integer                        — ทุกกี่สัปดาห์ (1–52) / ทุกกี่เดือน (1–12)
--       "cadenceWeekday"     integer                        — 0 = อาทิตย์ … 6 = เสาร์ (เลขเดียวกับ service_sites."accessDays")
--       "cadenceMonthDay"    integer                        — 1–31 · 31 = สิ้นเดือน (เดือนที่สั้นกว่าใช้วันสุดท้ายของเดือน)
--       "cadenceMonthDayTo"  integer                        — วันสุดท้ายของช่วงวัน ("วันที่ 1–5") · ว่าง = วันเดียว
--     · "everyDays" ว่างได้ (รอบตามปฏิทินไม่มีค่านี้) — CHECK 1–365 เดิมของ 0188 ยังอยู่ (ค่าว่างผ่าน)
--     · CHECK service_plans_cadence_shape: ชนิดไหนใช้ช่องไหน ช่องที่ไม่ใช้ต้องว่าง
--       ⚠️ เขียนเป็น CASE + IS NOT NULL ทุกช่องบังคับ — CHECK ผ่านเมื่อผลเป็น NULL ⇒ เงื่อนไขแบบ `x BETWEEN 1 AND 365`
--          เฉย ๆ ปล่อยแถวที่ x ว่างผ่าน (ฮาร์เนส M-5 พิสูจน์ทั้งสองแบบ)
--  §2 service_visits + "planSlotDate" date (ช่องของรอบที่นัดใบนี้เกิดมาแทน · ว่าง = นัดที่คนสร้างเอง/นัดก่อนไฟล์นี้)
--     + index (planId, planSlotDate) เฉพาะแถวที่มีรอบ
--     · **ไม่ unique โดยตั้งใจ** — กติกา "2 SO = 2 รอบ" กันซ้ำรายรอบในโค้ด และนัดที่คนผูกรอบเองไม่มีช่อง
--     · **ไม่มี CHECK ผูกกับ "planId"** — ลบรอบแล้ว FK ตั้ง "planId" เป็น NULL (0188) แถวต้องอยู่ต่อได้
--
--  ⛔ ไม่แตะ: ฟังก์ชันทุกตัว (ไฟล์นี้ไม่สร้างและไม่แก้ฟังก์ชัน — ไม่มีตัวไหนอ่าน "everyDays": ตัวย้ายรอบของ 0392 กับตัวตรวจ
--     ของ 0396 อ่านแค่ id / "siteId" / "salesOrderId" / "isActive") · ข้อมูลทุกแถว (ไม่มี UPDATE/INSERT/DELETE)
--  ⛔ ไม่ backfill — 01/10 service_plans = 0 แถว · service_visits ที่มี "planId" = 0 แถว · แถวที่มีอยู่ (ถ้ามี) ได้ 'days' จากค่าตั้งต้น
--
--  ── คอลัมน์ใหม่ ─────────────────────────────────────────────────────────────────────────
--   service_plans."cadenceKind" / "cadenceEvery" / "cadenceWeekday" / "cadenceMonthDay" / "cadenceMonthDayTo"
--   service_visits."planSlotDate"
--
--  ── ลำดับ deploy ────────────────────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่องเขียว (test · TZ=UTC test · build · gates) · ฮาร์เนส PGlite harness-0397 ผ่านสองรอบผลเหมือนกัน
--   1) ตรวจเลข migration อีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0397 (0398 มีงานอื่นจองแล้ว)
--   2) เจ้าของรันไฟล์นี้ที่ SQL Editor **ก่อน** deploy แล้วรัน SELECT ตรวจข้างล่าง
--      (เติมอย่างเดียว · โค้ดรุ่นที่รันอยู่เขียนแถว 'days' ต่อได้เพราะค่าตั้งต้น ⇒ ไม่ต้อง freeze)
--      ⚠️ ห้าม deploy ก่อนรัน — โค้ดรุ่นใหม่เขียนช่องใหม่ทุกครั้งที่บันทึกรอบ = 500 ทั้งเส้นตั้งรอบ
--   3) เจ้าของเพิ่มวันหยุดปี 2027 ที่ ตั้งค่า → วันหยุด **ก่อน deploy / ก่อน TS ตั้งรอบใบแรก**
--      (ตาราง holidays ยังไม่มีปี 2027 — นัดปีนั้นเลื่อนหนีได้แค่เสาร์–อาทิตย์ · ตั้งแต่ 3 ต.ค. ระยะเติมนัด 90 วันไปถึง 1 ม.ค. 2027)
--      ⚠️ นัดที่สร้างไปแล้วถือช่องของรอบอยู่ ระบบไม่ย้ายให้เมื่อวันหยุดถูกคีย์ทีหลัง — คีย์ช้า = ต้องย้ายนัดเองที่หน้าจัดคิว
--         (กดบันทึกรอบอีกครั้ง toast จะบอกรหัสนัดที่ตรงวันหยุด)
--   4) CI rerun → merge → Deploy to production → curl /api/version ตรง sha
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: plan_cols = 5 · every_days_nullable = YES · shape_check = 1 · slot_col = 1 · slot_idx = 1 · bad_shape = 0
--        plans = 0 · calendar_plans = 0 (ยังไม่มีใครตั้งรอบ · มากกว่า 0 = มีคนตั้งรอบหลัง 01/10 ไม่ใช่ข้อผิดพลาด)
--
--   SELECT
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_plans'
--      AND column_name IN ('cadenceKind', 'cadenceEvery', 'cadenceWeekday', 'cadenceMonthDay', 'cadenceMonthDayTo')) AS plan_cols,
--    (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_plans'
--      AND column_name = 'everyDays') AS every_days_nullable,
--    (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.service_plans'::regclass
--      AND conname = 'service_plans_cadence_shape') AS shape_check,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_visits'
--      AND column_name = 'planSlotDate') AS slot_col,
--    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'service_visits_plan_slot_idx') AS slot_idx,
--    (SELECT count(*) FROM public.service_plans WHERE "cadenceKind" = 'days' AND "everyDays" IS NULL) AS bad_shape,
--    (SELECT count(*) FROM public.service_plans) AS plans,
--    (SELECT count(*) FROM public.service_plans WHERE "cadenceKind" <> 'days') AS calendar_plans;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยโค้ดก่อนเสมอ (โค้ดรุ่นใหม่เขียนช่องใหม่ — ลบช่องใต้โค้ดที่รันอยู่ = 500) แล้วค่อยรัน:
--      -- รอบตามปฏิทินไม่มี "everyDays" ⇒ ต้องไม่เหลือก่อนใส่ NOT NULL กลับ (แปลงเป็น 'days' หรือปิด/ลบที่หน้าไซต์ก่อน)
--      SELECT id, "siteId", "cadenceKind" FROM public.service_plans WHERE "cadenceKind" <> 'days';   -- ต้องได้ 0 แถว
--      ALTER TABLE public.service_plans DROP CONSTRAINT IF EXISTS service_plans_cadence_shape;
--      ALTER TABLE public.service_plans ALTER COLUMN "everyDays" SET NOT NULL;
--      ALTER TABLE public.service_plans DROP COLUMN "cadenceKind", DROP COLUMN "cadenceEvery", DROP COLUMN "cadenceWeekday",
--        DROP COLUMN "cadenceMonthDay", DROP COLUMN "cadenceMonthDayTo";
--      DROP INDEX IF EXISTS public.service_visits_plan_slot_idx;
--      ALTER TABLE public.service_visits DROP COLUMN "planSlotDate";
--      NOTIFY pgrst, 'reload schema';
--   ผลของการถอย: นัดที่สร้างไปแล้วอยู่ครบ (เสียแค่ช่องของรอบ ⇒ กลับไปกันซ้ำด้วยวันนัดแบบเดิม)
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP NOT NULL · DROP CONSTRAINT IF EXISTS แล้วสร้างใหม่ · CREATE INDEX IF NOT EXISTS
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0397 (นอก repo · mockups/so-service-lines/pglite-harness) — 0188 จากไฟล์จริง
--     แล้วรันไฟล์นี้สองรอบ · บล็อกถอยกลับข้างบนลองจริงแล้ว
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน ──────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.service_plans') IS NULL OR to_regclass('public.service_visits') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'service_plans' AND column_name = 'everyDays')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'service_visits' AND column_name = 'planId') THEN
    RAISE EXCEPTION 'mig_0397_needs_0188 — ต้องมี service_plans / service_visits ของ 0188 ก่อน';
  END IF;
END
$pre$;

-- ── §1 service_plans: ชนิดของรอบ + ช่องของแต่ละชนิด ─────────────────────────────────
ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS "cadenceKind"       text    NOT NULL DEFAULT 'days',
  ADD COLUMN IF NOT EXISTS "cadenceEvery"      integer,
  ADD COLUMN IF NOT EXISTS "cadenceWeekday"    integer,
  ADD COLUMN IF NOT EXISTS "cadenceMonthDay"   integer,
  ADD COLUMN IF NOT EXISTS "cadenceMonthDayTo" integer;

-- รอบตามปฏิทินไม่มี "ทุก N วัน" · CHECK 1–365 ของ 0188 (ระดับคอลัมน์) ยังบังคับเมื่อมีค่า
ALTER TABLE public.service_plans ALTER COLUMN "everyDays" DROP NOT NULL;

ALTER TABLE public.service_plans DROP CONSTRAINT IF EXISTS service_plans_cadence_shape;
ALTER TABLE public.service_plans ADD CONSTRAINT service_plans_cadence_shape CHECK (
  CASE "cadenceKind"
    WHEN 'days' THEN
          "everyDays" IS NOT NULL AND "everyDays" BETWEEN 1 AND 365
      AND "cadenceEvery" IS NULL AND "cadenceWeekday" IS NULL
      AND "cadenceMonthDay" IS NULL AND "cadenceMonthDayTo" IS NULL
    WHEN 'weekly' THEN
          "everyDays" IS NULL
      AND "cadenceEvery" IS NOT NULL AND "cadenceEvery" BETWEEN 1 AND 52
      AND "cadenceWeekday" IS NOT NULL AND "cadenceWeekday" BETWEEN 0 AND 6
      AND "cadenceMonthDay" IS NULL AND "cadenceMonthDayTo" IS NULL
    WHEN 'monthly' THEN
          "everyDays" IS NULL
      AND "cadenceEvery" IS NOT NULL AND "cadenceEvery" BETWEEN 1 AND 12
      AND "cadenceMonthDay" IS NOT NULL AND "cadenceMonthDay" BETWEEN 1 AND 31
      AND "cadenceWeekday" IS NULL
      AND ("cadenceMonthDayTo" IS NULL
           OR ("cadenceMonthDayTo" > "cadenceMonthDay" AND "cadenceMonthDayTo" <= 31))
    ELSE false
  END
);

COMMENT ON COLUMN public.service_plans."cadenceKind" IS
  'ชนิดของรอบ (mig 0397): days = ทุก N วัน ("everyDays") · weekly = ทุก N สัปดาห์ วันเดิมของสัปดาห์ · monthly = ทุก N เดือน วันที่เดิมของเดือน';
COMMENT ON COLUMN public.service_plans."cadenceEvery" IS
  'ทุกกี่สัปดาห์ (weekly 1–52) / ทุกกี่เดือน (monthly 1–12) · ว่างเมื่อเป็น days (mig 0397)';
COMMENT ON COLUMN public.service_plans."cadenceWeekday" IS
  'วันของสัปดาห์ของรอบ weekly: 0 = อาทิตย์ … 6 = เสาร์ (mig 0397)';
COMMENT ON COLUMN public.service_plans."cadenceMonthDay" IS
  'วันที่ของเดือนของรอบ monthly: 1–31 · 31 = สิ้นเดือน · เดือนที่ไม่มีวันที่นี้ใช้วันสุดท้ายของเดือน (mig 0397)';
COMMENT ON COLUMN public.service_plans."cadenceMonthDayTo" IS
  'วันสุดท้ายของช่วงวันของรอบ monthly ("วันที่ 1–5") — ระบบนัดวันทำการแรกในช่วง · ว่าง = วันเดียว (mig 0397)';

-- ── §2 service_visits: ช่องของรอบที่นัดใบนี้เกิดมาแทน ───────────────────────────────
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS "planSlotDate" date;

COMMENT ON COLUMN public.service_visits."planSlotDate" IS
  'วันตามรอบ (ก่อนเลื่อนหนีวันหยุด) ที่นัดใบนี้เกิดมาแทน — ตัวเติมนัดกันซ้ำด้วยค่านี้ ไม่ใช่ด้วยวันนัด '
  '⇒ ย้ายวันนัดแล้วไม่ถูกสร้างซ้ำ · ว่าง = นัดที่คนสร้างเอง หรือนัดก่อน mig 0397';

CREATE INDEX IF NOT EXISTS service_visits_plan_slot_idx
  ON public.service_visits ("planId", "planSlotDate") WHERE "planId" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
