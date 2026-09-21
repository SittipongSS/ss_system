-- ============================================================
--  Migration 0368: ใบประเมินพื้นที่มีสองวัน — วันเข้าพื้นที่ · วันส่งผล
--
--  ⭐ ที่มา (มติผู้ใช้ 2026-09-21): ใบประเมินหนึ่งใบมีสองเหตุการณ์ที่คนละวันกันเสมอ
--     — วันที่ TS เข้าไปวัดพื้นที่ กับวันที่ TS ส่งตัวเลขกลับมาให้ฝ่ายขาย
--     ของเดิม (mig 0314) มีวันเดียว ⇒ SA ที่ต้องเสนอราคาวันจันทร์อ่านใบไม่ออกว่า
--     "12/09" คือวันที่ช่างไปถึงหน้างาน หรือวันที่ตัวเองจะได้ตัวเลข
--
--  🔴 **คอลัมน์เดิมไม่เปลี่ยนความหมาย** — `requestedDueDate`/`committedDueDate`
--     ยังคงเป็น **วันเข้าพื้นที่** ตามป้ายที่ mig 0314 ตั้งไว้ และยังเป็นตัวที่ระบบ
--     ใช้นับ "เลยกำหนด" กับโชว์ในคิวรวมของทุกหัวข้อ · ใบเก่าที่กรอกไปแล้วจึงอ่าน
--     ได้เหมือนเดิมทุกใบ ไม่มีตัวเลขไหนถูกตีความใหม่เงียบ ๆ
--     ⇒ ของใหม่คือ **วันส่งผล** ซึ่งระบบยังไม่เคยมีที่เก็บ
--
--  ⚠️ additive ล้วน — รันก่อน deploy ได้ · ใบเก่าทุกใบได้ NULL (ยังไม่เคยถาม)
-- ============================================================

BEGIN;

-- ── วันส่งผล: ฝั่งผู้ขอ + ฝั่งฝ่ายที่รับปาก ────────────────────────────
-- ⚠️ **คู่กันเสมอสองคอลัมน์ ไม่ใช่ช่องเดียว** — แพตเทิร์นเดียวกับ
--    requestedDueDate ↔ committedDueDate: วันที่ผู้ขอ *อยากได้* กับวันที่ฝ่าย
--    *รับปาก* เป็นคนละตัวเลขและคนละเจ้าของ · ยุบเป็นช่องเดียวเมื่อไร คำสัญญาของ
--    TS จะทับความคาดหวังของ SA แล้วไม่มีใครรู้ว่าเคยขอไว้วันไหน
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "requestedResultDate" date,
  ADD COLUMN IF NOT EXISTS "committedResultDate" date;

COMMENT ON COLUMN public.dept_requests."requestedResultDate" IS
  'วันที่ผู้ขอต้องการได้ผลประเมิน (หัวข้อ site_survey) — คนละวันกับ requestedDueDate ซึ่งคือวันที่อยากให้เข้าพื้นที่';
COMMENT ON COLUMN public.dept_requests."committedResultDate" IS
  'วันที่ฝ่าย TS รับปากว่าจะส่งผล (หัวข้อ site_survey) — คนละวันกับ committedDueDate ซึ่งคือวันนัดเข้าพื้นที่';

-- 🔴 **ส่งผลก่อนวันที่ไปวัดไม่ได้** — ด่านจริงอยู่ที่ API (ข้อความไทย) · ตัวนี้เป็น
--    ยามชั้นล่างกันข้อมูลที่ยิงเข้ามาทางอื่น · NULL ผ่านทั้งคู่เพราะใบเก่าไม่มีค่า
--    และร่างที่ยังกรอกไม่จบก็ยังไม่มี
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_result_after_visit_check;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_result_after_visit_check CHECK (
    "committedResultDate" IS NULL
    OR "committedDueDate" IS NULL
    OR "committedResultDate" >= "committedDueDate"
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
