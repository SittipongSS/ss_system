-- ============================================================
--  Migration 0300: สถานะนัด 4 → 8 ค่า + เวลาที่ประทับจริง (F-3)
--
--  มติ docs/service-field-operations.md ข้อ 4-6:
--    scheduled ─[เริ่มงาน]─▶ in_progress ─[ปิดงาน]─▶ done
--                                │                 ├─▶ partial (ทำไม่ครบ)
--                                └─────────────────┴─▶ unable  (ไปแล้วทำไม่ได้ · บังคับเหตุผล)
--    ❌ ไม่เอา "ออกเดินทาง / ถึงไซต์" — ต้องกดตอนขับรถ ไม่ปลอดภัยและลืมแน่
--
--  + `draft` เป็นสถานะเริ่มต้นของด่านเข้าไซต์ (มติผู้ใช้ 2026-08-28: TS ไม่ใช่ต้นทาง
--    ของงาน · ร่างไม่ขึ้นตาราง ไม่นับภาระ ไม่โผล่ในงานวันนี้ของช่าง จนผ่านด่าน)
--    ⚠️ ใบนี้เพิ่มแค่ **ค่า** ให้ CHECK รับได้ · ตัวด่านและ UI ยังไม่ทำในรอบนี้
--    DEFAULT จึงยัง `scheduled` — ตัวคุมจริงคือ `normalizeVisitInput` ฝั่งโค้ด
--
--  ⚠️ รันมือบน Supabase SQL Editor · **รันก่อน deploy ได้** (ขยาย CHECK อย่างเดียว
--    ไม่มีแถวไหนใช้ค่าใหม่จนกว่าโค้ดจะขึ้น) · idempotent ทุกคำสั่ง
-- ============================================================

BEGIN;

-- ── สถานะ 8 ค่า ────────────────────────────────────────────────────────
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_status_check;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_status_check CHECK (status IN (
    'draft',        -- สร้างไว้แล้วแต่ยังไม่ผ่านด่าน — ไม่ขึ้นตาราง ไม่นับภาระ
    'scheduled',    -- เข้าคิวจริง ขึ้นตาราง
    'in_progress',  -- ช่างกด "เริ่มงาน" แล้ว (เวลาเริ่มถูกประทับที่ server)
    'done',         -- ปิดครบ
    'partial',      -- ไปแล้ว ทำได้บางส่วน
    'unable',       -- ไปแล้ว ทำไม่ได้เลย — บังคับเหตุผล
    'rescheduled',
    'cancelled'
  ));

-- ── ไปถึงไซต์แล้วต้องรู้ว่าวันไหน ─────────────────────────────────────
-- 🐞 ของเดิมบังคับ actualDate เฉพาะ `done` ⇒ `partial`/`unable` จะบันทึกได้โดยไม่มี
-- วันที่เข้าจริง ทั้งที่ช่างไปถึงไซต์แล้ว · ผลลูกโซ่: `nextAfterDone` ตกไปใช้วันที่นัด
-- (รอบถัดไปเร็วกว่าที่ควร) และ `siteScheduleContext` อ่านวันเติมล่าสุดได้ null
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_done_needs_actual_date;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_done_needs_actual_date CHECK (
    status NOT IN ('done', 'partial', 'unable') OR "actualDate" IS NOT NULL
  );

-- ── ทำไม่ได้ต้องบอกเหตุผล ─────────────────────────────────────────────
-- ปิดงานว่า "ไปแล้วทำไม่ได้" โดยไม่บอกเหตุ = ใบที่ตอบลูกค้าไม่ได้และตามต่อไม่ถูก
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS "unableReason" text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_visits_unable_needs_reason') THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_unable_needs_reason CHECK (
        status <> 'unable' OR (
          "unableReason" IS NOT NULL AND length(btrim("unableReason")) >= 10
        )
      );
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_visits_unable_reason_len') THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_unable_reason_len CHECK (
        "unableReason" IS NULL OR length("unableReason") <= 500
      );
  END IF;
END $$;

-- ── เวลาเริ่ม-จบ: ประทับที่ server แล้ว "แก้ย้อนหลังได้แต่ต้องเห็นว่าแก้" ──
-- มติข้อ 5 · ปุ่ม "เริ่มงาน" ไม่ได้เพิ่มข้อมูลใหม่ มันทำให้ช่องที่มีอยู่แล้วเชื่อถือได้
-- (วันนี้ช่างกรอกทีเดียวตอนปิดงาน = เลขที่พิมพ์ย้อนหลัง ไม่ใช่เวลาจริง)
-- ⚠️ เวลาเก็บเป็น `time` เวลาไทยล้วนตามการตัดสินใจของ 0187/0188 — ห้ามเปลี่ยนเป็น
--    timestamptz · ฝั่งโค้ดต้องประทับด้วย businessDate()/businessTimeKey() เท่านั้น
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS "actualTimeEdited" boolean NOT NULL DEFAULT false;

-- 🐞 ของเดิมบังคับ actualStartTime < actualEndTime (เข้ม) ⇒ งานที่เริ่มและจบใน
-- นาทีเดียวกัน (เปลี่ยนก้าน reed จุดเดียว · เข้าไปดูแล้วออก) จะบันทึกไม่ได้เลย
-- เมื่อเวลามาจากการประทับจริง ไม่ใช่ตัวเลขที่คนพิมพ์ให้ห่างกันเอง ⇒ ผ่อนเป็น <=
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_actual_time_window;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_actual_time_window CHECK (
    "actualStartTime" IS NULL OR "actualEndTime" IS NULL
    OR "actualStartTime" <= "actualEndTime"
  );

COMMENT ON COLUMN public.service_visits."actualTimeEdited" IS
  'true = มีคนแก้เวลาเข้าจริงย้อนหลังหลังจากระบบประทับให้ (มติ 2026-08-02 ข้อ 5) · ไม่ backfill — เริ่มนับจากตอนนี้';
COMMENT ON COLUMN public.service_visits."unableReason" IS
  'เหตุผลที่ไปแล้วทำไม่ได้ — บังคับเมื่อ status = unable (≥10 ตัวอักษร)';

COMMIT;

NOTIFY pgrst, 'reload schema';
