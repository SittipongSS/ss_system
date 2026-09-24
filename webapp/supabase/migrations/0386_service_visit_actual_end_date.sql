-- ============================================================
--  Migration 0386: ปิดงาน/ส่งงานข้ามวันได้ — เก็บ "วันที่เสร็จจริง" เมื่อไม่ใช่วันเดียวกับวันที่เข้า
--  (มติเจ้าของ 24/09/2026 ข้อ 4 · ใช้กับนัดทุกชนิด ไม่ใช่แค่นัดประเมิน)
--
--  🐞 ต้นเรื่อง: ตารางเก็บวัน/เวลาเข้าจริงแยกกัน (`actualDate` + `actualStartTime`/`actualEndTime`
--     เวลาไทยล้วน · 0187/0188) และ CHECK `service_visits_actual_time_window` (0300) เทียบ **เวลาอย่างเดียว**
--     ⇒ เริ่มงาน 24/09 14:00 แล้วกด "ส่งงาน"/"ปิดงาน" 25/09 09:00 = 14:00 > 09:00 ⇒ ฐานตีกลับ
--       (`violates check constraint "service_visits_actual_time_window"` ขึ้นจอเป็นอังกฤษดิบ 500)
--     ⇒ เริ่ม 24/09 09:00 จบ 25/09 10:00 ผ่าน แต่บันทึกเป็นงาน 1 ชั่วโมงแทน 25 ชั่วโมงเงียบ ๆ
--     พิสูจน์ด้วย PGlite (บล็อก CHECK ของ 0300 ตัวจริง + ตัวประทับเวลาของ route) ก่อนเขียนไฟล์นี้
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  ① เพิ่ม `"actualEndDate" date` — **NULL = เสร็จวันเดียวกับ actualDate** (แถวเดิมทุกแถวเป็นแบบนี้
--     อยู่แล้ว ⇒ ไม่ต้อง backfill) · มีค่า = วันหลัง actualDate เสมอ
--  ② CHECK ใหม่ `service_visits_actual_end_date_after` — มีวันเสร็จต้องมีวันเข้า และต้องหลังวันเข้า
--     (วันเดียวกันต้องเก็บเป็น NULL — มีสองแบบให้แทนค่าเดียวกัน = สองตัวเลขที่ไม่มีใครรู้ว่าอันไหนจริง)
--  ③ สร้าง `service_visits_actual_time_window` ใหม่ — เทียบเวลาเฉพาะตอนเสร็จวันเดียวกัน
--     (actualEndDate IS NULL) · เสร็จวันหลังแล้วเวลาจบเช้ากว่าเวลาเริ่มได้ถูกต้อง
--  ⛔ ไม่แตะแถวข้อมูล · ไม่แตะ CHECK ตัวอื่น
--
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · CHECK ② ถูกข้ามเมื่อมีแล้ว · CHECK ③ DROP IF EXISTS แล้วสร้างใหม่
--  ✅ แถวเดิมผ่านทั้งสอง CHECK (actualEndDate เป็น NULL ทุกแถว ⇒ ③ เท่ากับของ 0300 ทุกประการ)
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · **โค้ดขึ้นก่อนได้**: route ใส่ `actualEndDate` เฉพาะเมื่อแถวที่
--     อ่านมามีคอลัมน์นี้แล้ว ⇒ ก่อนรัน ปิดงานวันเดียวกันทำงานเหมือนเดิม ข้ามวันยังพังเหมือนเดิมจนกว่าจะรัน
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: สองแถว · end_date_after มี "actualEndDate" > "actualDate" · time_window มี "actualEndDate" IS NOT NULL
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.service_visits'::regclass
--      AND conname IN ('service_visits_actual_end_date_after', 'service_visits_actual_time_window');
-- ============================================================

BEGIN;

ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS "actualEndDate" date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.service_visits'::regclass
       AND conname = 'service_visits_actual_end_date_after'
  ) THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_actual_end_date_after CHECK (
        "actualEndDate" IS NULL
        OR ("actualDate" IS NOT NULL
            AND "actualEndDate" > "actualDate"
            AND "actualEndDate" <= '2100-12-31')
      );
  END IF;
END $$;

-- เทียบเวลาเฉพาะตอนเสร็จวันเดียวกัน — เสร็จวันหลัง (actualEndDate > actualDate) เวลาจบเช้ากว่าได้
ALTER TABLE public.service_visits DROP CONSTRAINT IF EXISTS service_visits_actual_time_window;
ALTER TABLE public.service_visits
  ADD CONSTRAINT service_visits_actual_time_window CHECK (
    "actualStartTime" IS NULL OR "actualEndTime" IS NULL
    OR "actualEndDate" IS NOT NULL
    OR "actualStartTime" <= "actualEndTime"
  );

COMMENT ON COLUMN public.service_visits."actualEndDate" IS
  'วันที่เสร็จจริง เมื่อเสร็จคนละวันกับ actualDate (ปิดงาน/ส่งงานข้ามวัน · mig 0386) · NULL = เสร็จวันเดียวกัน';

COMMIT;

NOTIFY pgrst, 'reload schema';
