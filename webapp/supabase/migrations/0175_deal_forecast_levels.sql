-- ============================================================
--  Migration 0175: % โอกาสปิด (FC) ใช้ระดับที่เลือกได้จริง + ปลดระวางคอลัมน์ depositPaid
--
--  ── 1) FC ตั้งต้นต้องเป็นค่าที่ "เลือกได้จริง" ─────────────────────────────
--  ค่าตั้งต้นตามขั้นทั้งฝั่ง JS และ deal_probability_for_stage() (0170) เป็นเลขอิสระ
--  10/30/55/65/75/90 ที่ไม่มีอยู่ในดรอปดาวน์เลยสักตัว แล้วไปพึ่ง snapForecastLevel
--  ปัดตอนแสดงผล → ค่าที่เก็บกับค่าที่คนเห็นเป็นคนละตัว เช่น ดีลที่ถอยออกจาก Won ได้ 90
--  แต่จอโชว์ 100%
--
--  เกณฑ์ 3 ระดับที่เลือกได้ (มติผู้ใช้ 2026-07-29) วัดจาก **หลักฐานที่ได้จากลูกค้า**:
--     80% = มี FC / ชำระค่า Scent Design
--     50% = ออกใบเสนอราคาแล้ว
--     20% = นัด Meeting แล้ว
--  100% ถูก **ถอดออกจากดรอปดาวน์** — เป็นค่าที่ระบบตั้งเองตอนปิด Won เท่านั้น (เหมือน
--  lost=0) เดิมเลือกได้ จึงมีดีลตั้ง 100% ทั้งที่ยังไม่มีใบเสนอราคาสักใบ แล้วไปกองอยู่ถัง
--  "ปิดได้แล้ว" บนแดชบอร์ด อ่านแล้วเหมือนเงินก้อนนั้นปิดแน่แล้ว
--
--  ⭐ prod 2026-07-29: sales_deals 132 แถว probability = 20:3 · 50:46 · 80:64 · 100:19
--     ค่าตั้งต้นเดิมไม่เคยถูกใช้จริง (ฟอร์มมี default ของตัวเองที่ 50)
--     19 แถวที่เป็น 100 **ไม่มีแถวไหน Won เลย** (prod ยังไม่มีดีล won สักใบ) → ดูข้อ 3
--
--  ── 2) depositPaid = คอลัมน์ที่ไม่มีทางเป็น true ได้อีกแล้ว ────────────────
--  ช่องติ๊ก "ได้รับมัดจำแล้ว" ถูกถอดออกจากฟอร์มดีลไปแล้ว (เหลือแต่คอมเมนต์เล่าประวัติ
--  ใน DealFormFields.js) และผู้อ่านคนสุดท้ายฝั่ง DB คือ accept_quotation_atomic เวอร์ชัน
--  0098 ซึ่งถูกแทนที่ตั้งแต่ 0101/0102 (เวอร์ชันปัจจุบันตั้ง stage='won', probability=100
--  ตรง ๆ ไม่แตะคอลัมน์นี้)
--
--  ⭐ prod ยืนยัน 2026-07-29 สองชั้น:
--     (1) depositPaid = true → 0 จาก 132 แถว
--     (2) ยิง accept_quotation_atomic ด้วย evidence ว่าง → ได้ quotation_evidence_type_invalid
--         = ด่านแรกของนิยาม 0102 ⇒ prod รันเวอร์ชันที่ไม่อ่าน depositPaid แล้วแน่นอน
--
--  ⚠️ ลำดับสำคัญ: ต้อง deploy โค้ดที่เลิกเขียนคอลัมน์นี้ (คอมมิตเดียวกัน) ก่อน/พร้อมรัน
--     ไฟล์นี้ — INSERT เก่าที่ยังส่ง "depositPaid": false มาจะพังทันทีที่คอลัมน์หายไป
--
--  Idempotent — รันซ้ำได้ (UPDATE ข้อ 3 มีเงื่อนไขที่เป็นเท็จทันทีหลังรันรอบแรก)
-- ============================================================

-- ── 1) แหล่งเดียวของ map ขั้น → % โอกาสปิด (แทนที่นิยามจาก 0170) ───────────
-- ต้องตรงกับ DEFAULT_PROBABILITY_BY_STAGE ใน src/lib/salesPlanning.js เป๊ะ ๆ
-- แก้ที่ไหนต้องแก้อีกที่เสมอ (มีเทสต์ฝั่ง JS อ่านไฟล์นี้มาเทียบให้แล้ว)
--
-- ผู้เรียกทั้งสาม (cancel_sales_order_with_reversal_atomic 0116 · unaccept_quotation_atomic
-- 0138 · revert_deal_out_of_won 0168 — ยุบมาเรียกฟังก์ชันกลางแล้วที่ 0170) ไม่ต้องแก้ซ้ำ
-- เพราะเรียกผ่านชื่อนี้อยู่แล้ว เปลี่ยนที่นี่ที่เดียวมีผลครบทั้งสามทันที
CREATE OR REPLACE FUNCTION public.deal_probability_for_stage(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_stage
    -- ยังไม่ออกใบเสนอราคา = ต่ำสุดที่เลือกได้ (20 · นัด Meeting แล้ว)
    WHEN 'lead'              THEN 20
    WHEN 'qualified'         THEN 20
    WHEN 'timeline_proposed' THEN 20
    WHEN 'quotation'         THEN 50   -- ออกใบเสนอราคาแล้ว
    -- รอยืนยัน / รอมัดจำ = สูงสุดของดีลที่ยังไม่ Won (100 ตั้งได้เฉพาะตอนปิด Won)
    WHEN 'awaiting_confirm'  THEN 80
    WHEN 'deposit_pending'   THEN 80
    WHEN 'won'               THEN 100
    WHEN 'in_project'        THEN 100
    WHEN 'lost'              THEN 0
    -- ค่าที่ไม่รู้จัก = ค่าตั้งต้นต่ำสุด (ตรงกับ `?? 20` ของ toProbability ฝั่ง JS).
    -- ผู้เรียกทั้งสามกรอง v_target_stage ผ่าน whitelist มาก่อนแล้ว จึงไม่ควรถึงบรรทัดนี้
    ELSE 20
  END;
$$;

REVOKE ALL ON FUNCTION public.deal_probability_for_stage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deal_probability_for_stage(text) TO authenticated, service_role;

-- ── 2) ปลดระวางคอลัมน์ depositPaid ────────────────────────────────────────
ALTER TABLE public.sales_deals DROP COLUMN IF EXISTS "depositPaid";

-- ── 3) ดีลที่ยังไม่ Won แต่ค้าง 100% → ลงมาที่ 80 ─────────────────────────
-- 100 ไม่ใช่ตัวเลือกอีกแล้ว ถ้าปล่อยค้างไว้ ค่าที่เก็บ (100) กับค่าที่คนเห็น (snap เป็น 80)
-- จะเป็นคนละตัว และใครเปิดฟอร์มแก้ดีลแล้วกดบันทึกจะเปลี่ยนเป็น 80 เงียบ ๆ อยู่ดี
-- — เท่ากับความเพี้ยนเดียวกับที่ข้อ 1 เพิ่งแก้ไป จึงเก็บกวาดให้ตรงกันทีเดียว
--
-- ⭐ prod 2026-07-29: เข้าเงื่อนไขนี้ 19 แถว (lead 5 · timeline_proposed 1 · quotation 2
--    · awaiting_confirm 2 · deposit_pending 9) — ทั้งหมดเป็นดีลที่ยังไม่ปิดการขาย
-- ดีล won/in_project ไม่ถูกแตะ: 100 ของพวกนั้นคือค่าที่ระบบตั้งให้ตอนปิด Won ซึ่งถูกแล้ว
UPDATE public.sales_deals
   SET probability = 80
 WHERE probability = 100
   AND stage NOT IN ('won', 'in_project');

-- Rollback:
-- 1) CREATE OR REPLACE deal_probability_for_stage ด้วยนิยามเดิมจาก 0170
--    (lead 10 · qualified 30 · timeline_proposed 55 · quotation 65 · awaiting_confirm 75
--     · deposit_pending 90 · won/in_project 100 · lost 0 · ELSE 10)
-- 2) ALTER TABLE public.sales_deals
--      ADD COLUMN IF NOT EXISTS "depositPaid" boolean NOT NULL DEFAULT false;
--    (ค่าเดิมทั้งหมดเป็น false อยู่แล้ว — คืนคอลัมน์ = คืนสภาพครบ ไม่มีข้อมูลสูญ)
-- 3) ข้อ 3 ย้อนอัตโนมัติไม่ได้: 80 ที่มาจาก 100 แยกไม่ออกจาก 80 ที่ผู้ใช้ตั้งเอง
--    ถ้าต้องย้อนจริง ใช้ audit_logs / backup ก่อนรัน — หรือให้เจ้าของดีลตั้งค่าใหม่เอง
--    (19 แถวที่กระทบ ดูรายการในบันทึก PR)

NOTIFY pgrst, 'reload schema';
