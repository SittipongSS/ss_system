-- ============================================================
--  Migration 0174: ปลดระวางระบบสอบถาม (inquiries) — งานย้ายไป dept_requests แล้ว
--  PR-2b ของ docs/cross-department-requests-plan.md (ชั้น B)
--
--  0173 ยกเคสขอราคาขึ้นเป็น "คำร้องข้ามฝ่าย" ที่รับได้ทุกชนิด รวมถึงงานที่ระบบ
--  สอบถามเคยรับ (สอบถามข้อมูล / ขอเอกสาร) แล้ว · ไฟล์นี้เก็บกวาดของเดิมทิ้ง
--
--  ⚠️ ทำไมไม่ DROP ไปพร้อม 0173: ตารางกับโค้ดต้องตายพร้อมกัน — ถ้า DROP ตอนนั้น
--  หน้า /sa/inquiries + API + แท็บบนหน้าดีล (ที่ยังอยู่ครบ) จะพังทันทีที่รัน
--  migration ก่อนโค้ดชุดถัดไปจะ deploy ด้วยซ้ำ · รอบนี้ลบโค้ดในคอมมิตเดียวกันแล้ว
--
--  ⭐ prod ยืนยันซ้ำ 2026-07-28: inquiries = 0 แถว · inquiry_messages = 0 แถว
--     (ช่องเปิดมาตั้งแต่ mig 0104 แต่ไม่เคยมีใครใช้เลย) → ไม่ต้อง backfill
--
--  ⚠ รันมือบน Supabase SQL Editor · รัน **หลัง** deploy โค้ด PR-2b
--    (โค้ดเก่าที่ยังรันอยู่จะอ่านตารางนี้ ถ้า DROP ก่อน deploy หน้าสอบถามจะพัง —
--     แต่ deploy แล้วเมนู/หน้าหายไปก่อน ตารางค้างอยู่เฉย ๆ ไม่กระทบใคร)
-- ============================================================

BEGIN;

-- ── ด่านกันลบข้อมูลจริง ─────────────────────────────────────────────────
-- ถ้าวันที่รันจริงมีคนใช้ไปแล้ว ต้องหยุดและย้ายเข้า dept_requests ก่อน
-- ไม่ใช่ลบทิ้งเงียบ ๆ (ข้อความในเธรดคือบทสนทนากับฝ่ายอื่น กู้ไม่ได้)
DO $$
DECLARE n_inq integer; n_msg integer;
BEGIN
  IF to_regclass('public.inquiries') IS NULL THEN
    RAISE NOTICE 'inquiries ถูกลบไปแล้ว — ข้ามไฟล์นี้ได้';
    RETURN;
  END IF;
  SELECT count(*) INTO n_inq FROM public.inquiries;
  SELECT count(*) INTO n_msg FROM public.inquiry_messages;
  IF n_inq > 0 OR n_msg > 0 THEN
    RAISE EXCEPTION
      E'หยุด: ระบบสอบถามมีข้อมูลแล้ว (inquiries=% แถว, inquiry_messages=% แถว)\n'
      'ต้องย้ายเข้า dept_requests ก่อนลบ — ดู docs/cross-department-requests-plan.md',
      n_inq, n_msg;
  END IF;
END $$;

-- ── ลบตาราง (ลูกก่อนเสมอ) ───────────────────────────────────────────────
-- ⚠️ ห่อ IF EXISTS ทุกคำสั่งให้รันซ้ำได้ — บทเรียนจาก 0173 ที่ ALTER ... RENAME
-- ไม่มี IF EXISTS ในตัว รันรอบสองแล้ว error ทั้งที่รอบแรกสำเร็จ (ผู้ใช้ตกใจฟรี)
DROP TABLE IF EXISTS public.inquiry_messages;
DROP TABLE IF EXISTS public.inquiries;

-- เลขที่ IQ- เลิกใช้แล้ว — ตัวนับที่ค้างอยู่ไม่มีใครอ่านอีก
DELETE FROM public.entity_number_counters WHERE scope = 'IQ';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT to_regclass('public.inquiries') AS "ต้องเป็น null",
--        to_regclass('public.dept_requests') AS "ต้องไม่ null";
-- SELECT count(*) FROM entity_number_counters WHERE scope = 'IQ';   -- ต้องได้ 0
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- สร้างตารางคืนจาก mig 0104 ได้ตรง ๆ (ไม่มีข้อมูลให้กู้ — ยืนยันแล้วว่า 0 แถว)
-- แต่ต้อง revert โค้ดด้วย เพราะ PR-2b ลบหน้า/API/lib ของระบบสอบถามทิ้งทั้งชุด
