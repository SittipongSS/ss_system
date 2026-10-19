-- ============================================================
--  Migration 0411: พัฒนาสูตรส่งได้หลาย direction ต่อกลิ่น (ม-157 · IS-26100002)
--
--  ⭐ ที่มา: RD ส่งสูตรรอบแก้ของกลิ่นเดียวกันได้ทีละ 1 direction — direction ที่ 2 ไม่มีที่อยู่ในระบบ
--    (RQ-FD-26090194 · 19/10/2026) · สองด่านกันไว้: ทะเบียนสูตร (หมวด × กลิ่น ไม่เลิกใช้ได้ตัวเดียว)
--    กับแถวคำร้อง (แถวต้นทาง 1 แถวต่อคู่ต่อใบ)
--  ⭐ มติเจ้าของ (19/10): ทุกรอบส่งหลาย direction ได้ · สูตรที่ส่งเป็น "กำลังพัฒนา" จนลูกค้าคอนเฟิร์ม
--    (ตัวเดิมยังใช้งานอยู่ระหว่างรอ) · คอนเฟิร์มแล้วตัวที่ได้ = ใช้งาน · ตัวเดิม + direction อื่น = เลิกใช้
--    · direction อื่นที่ยังค้างปิดให้เอง ("ไม่ถูกเลือก")
--
--  ใบนี้ทำสามอย่าง (ไม่มี DML · ไม่แตะแถวเดิม):
--    1) `dept_request_items."directionOfItemId"` — แถว direction เพิ่มชี้แถวแรกของชุด (แถวที่ระบบมีอยู่แล้ว)
--       · NULL = แถวแรก/แถวปกติ (ทุกแถวเดิม) · FK ไม่ cascade: ลบแถวแรกที่ยังมี direction เพิ่มชี้อยู่ไม่ได้
--         (ด่านแอป `deleteRequestRowError` บอกเหตุก่อน) · ลบทั้งใบยังผ่าน — ลบพร้อมกันในคำสั่งเดียว
--    2) ดัชนีแถวคู่ซ้ำ (0356) ยกเว้นแถว direction เพิ่ม — มันใช้คู่เดียวกับแถวแรกโดยตั้งใจ
--    3) ดัชนีตัวตนสูตร (0207) ไม่นับสถานะ `developing` — direction ที่รอลูกค้าเลือกอยู่พร้อมกันหลายตัวได้
--       · ยังได้ตัวใช้งาน/ร่าง **ตัวเดียว**ต่อคู่เหมือนเดิม (QT · SO · สินค้า · ราคา FB ไม่สะเทือน)
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy โค้ด ม-157** — โค้ดใหม่สร้างสูตร developing
--    ของคู่ที่มีตัวใช้งานอยู่แล้ว (ดัชนีเดิมตีกลับ = ส่งรอบแก้ไม่ได้) และเขียนคอลัมน์ใหม่ตอนส่ง direction เพิ่ม
--  ⚠ รันก่อน deploy ได้อย่างปลอดภัย — โค้ดเก่าไม่เอ่ยชื่อคอลัมน์ใหม่ · ดัชนีสองตัวแค่หลวมขึ้น
--  ⚠ รันซ้ำได้ทั้งใบ (DROP แล้ว CREATE — `IF NOT EXISTS` ของดัชนีเทียบแค่ชื่อ บทเรียน 0181/0182)
--  ⚠ ถอย: ทำได้เฉพาะตอนที่ยังไม่มีคู่ไหนมี developing ซ้อนกับตัวอื่น (SELECT ท้ายไฟล์ข้อ ③ ต้องว่าง)
--    และยังไม่มีแถว direction เพิ่ม (ข้อ ② ต้องเป็น 0) · ไม่งั้นสร้างดัชนีเดิมกลับไม่ผ่าน
-- ============================================================

BEGIN;

-- ── 1) แถว direction เพิ่มชี้แถวแรกของชุด ────────────────────────────────────
ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "directionOfItemId" text
    REFERENCES public.dept_request_items(id);

COMMENT ON COLUMN public.dept_request_items."directionOfItemId" IS
  'แถว direction เพิ่มของพัฒนาสูตร ชี้แถวแรกของชุด (หมวด × กลิ่น × รอบเดียวกัน) · NULL = แถวแรก/แถวปกติ (0411 · ม-157)';

CREATE INDEX IF NOT EXISTS dept_request_items_direction_of_idx
  ON public.dept_request_items ("directionOfItemId")
  WHERE "directionOfItemId" IS NOT NULL;

-- ── 2) แถวคู่ซ้ำ: ยกเว้นแถว direction เพิ่ม ─────────────────────────────────
DROP INDEX IF EXISTS public.dept_request_items_product_pair_uk;
CREATE UNIQUE INDEX dept_request_items_product_pair_uk
  ON public.dept_request_items ("requestId", "categoryCode", "scentId")
  WHERE "lineKind" = 'product_dev' AND "derivedFromItemId" IS NULL AND "ackAt" IS NOT NULL
    AND "directionOfItemId" IS NULL;

-- ── 3) ตัวตนสูตร: ไม่นับสูตรที่กำลังพัฒนา ──────────────────────────────────
DROP INDEX IF EXISTS public.formulas_identity_uk;
CREATE UNIQUE INDEX formulas_identity_uk
  ON public.formulas ("categoryCode", "scentId")
  WHERE "categoryCode" IS NOT NULL AND "scentId" IS NOT NULL
    AND status NOT IN ('archived', 'developing');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ──────────────────────────────────────────────────────────
-- ① SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'dept_request_items' AND column_name = 'directionOfItemId';      -- 1 แถว
-- ② SELECT count(*) FROM public.dept_request_items WHERE "directionOfItemId" IS NOT NULL;  -- 0 ตอนเพิ่งรัน
-- ③ SELECT "categoryCode", "scentId", count(*) FROM public.formulas
--     WHERE status <> 'archived' AND "categoryCode" IS NOT NULL AND "scentId" IS NOT NULL
--     GROUP BY 1, 2 HAVING count(*) > 1;                                                   -- ว่างตอนเพิ่งรัน
-- ④ SELECT indexname, indexdef FROM pg_indexes
--     WHERE indexname IN ('dept_request_items_product_pair_uk', 'formulas_identity_uk');   -- 2 แถว เงื่อนไขใหม่
