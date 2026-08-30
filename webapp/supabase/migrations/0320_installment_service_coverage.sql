-- ============================================================
--  Migration 0320: งวดชำระครอบ "ช่วงบริการ" ไหน — ฐานของค่า "จ่ายถึง"
--
--  ⭐ มติผู้ใช้ 2026-08-30 (docs/service-contract-phase-plan.md §0 ข้อ 1):
--     *"จ่ายก่อนบริการเสมอ ถ้าไม่จ่าย TS เอาลงคิวไม่ได้"*
--
--  เส้นบริการ (หมวด 02-001) ต้องตอบให้ได้ว่า **เงินที่รับมาแล้วครอบบริการถึงวันไหน**
--  แล้วเอาค่านั้นไปเป็นด่านข้อ 2 ของ `visitGate` (PR-C) — นัดที่วันเกินค่านี้ลงคิวไม่ได้
--
--      paidThrough(SO) = max("coversTo") ของงวดที่ status = 'confirmed'
--
--  ⚠️ **ผูกเป็นช่วงวันที่ ไม่ใช่เลขรอบบริการ** (มติเดียวกัน) — รอบเลื่อน/งด/แทรกได้
--  ตลอดอายุสัญญา ถ้าผูกว่า "งวดนี้ครอบรอบ 4–6" วันที่รอบขยับแล้วความจริงเพี้ยนทันที
--  โดยไม่มีใครรู้ · จอโชว์ "≈ รอบที่ n–m" ได้ แต่ **คำนวณสดจากรอบจริง** ไม่เก็บลงฐาน
--
--  ⚠️ **`reported` ไม่นับ — นับเมื่อ `confirmed` เท่านั้น** (กติกาเดิมของ 0245)
--  งวดที่ SA แจ้งว่าลูกค้าจ่ายแล้วแต่บัญชียังไม่รับรอง ไม่ขยับ "จ่ายถึง" แม้แต่วันเดียว
--
--  ⚠️ **nullable ทั้งคู่โดยเจตนา** — ใบสายสินค้าและใบเก่าทั้งหมดไม่มีค่านี้และไม่ต้องมี
--  · งวดที่ `confirmed` แต่ `coversTo` ว่าง = **ไม่นับเข้า "จ่ายถึง"** (จอเตือนให้ไปเติม)
--    ไม่ใช่ปล่อยผ่านเงียบ ๆ — ตัวตัดสินอยู่ `src/lib/sales/paymentCoverage.js` ที่เดียว
--
--  ⚠️ **ช่วงของแต่ละงวดซ้อนกันหรือเว้นช่องได้** ไม่มี EXCLUDE constraint โดยเจตนา —
--  แผนชำระของจริงในชีตทีมมี 29 รูปแบบพิมพ์มือ (มัดจำ + รายเดือน + ก้อนท้าย ปนกัน)
--  ⇒ จอเตือนเมื่อซ้อน/เว้น แต่ไม่บล็อก ไม่งั้นใบจริงบันทึกไม่ได้ทั้งใบ
--
--  🛑 **ต้องรันก่อน deploy โค้ด PR-A** — โค้ดใหม่ select/insert สองคอลัมน์นี้ ถ้าคอลัมน์
--  ยังไม่มี PostgREST จะตอบ 400 ทั้ง route งวดชำระ (แผงงวดบนหน้า SO และหน้า /finance ดับพร้อมกัน)
--  ส่วนโค้ดเวอร์ชันปัจจุบันไม่รู้จักสองคอลัมน์นี้ ⇒ **รันล่วงหน้าได้ทันที ไม่กระทบใคร**
--  ⚠️ รันมือบน Supabase SQL Editor · additive ล้วน · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

ALTER TABLE public.sales_order_installments
  ADD COLUMN IF NOT EXISTS "coversFrom" date,
  ADD COLUMN IF NOT EXISTS "coversTo"   date;

-- ช่วงต้องไม่กลับหัว + กันปีพิมพ์ผิดแบบที่เคยเจอบน prod (`formulaDate = '2202-08-06'`)
-- รวมสองเรื่องไว้ก้อนเดียวตามแพตเทิร์น `sales_order_installments_dates_sane` ของ 0245
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sales_order_installments'::regclass
      AND conname = 'sales_order_installments_covers_range'
  ) THEN
    ALTER TABLE public.sales_order_installments
      ADD CONSTRAINT sales_order_installments_covers_range CHECK (
        ("coversFrom" IS NULL OR "coversFrom" BETWEEN '2000-01-01' AND '2100-12-31')
        AND ("coversTo" IS NULL OR "coversTo" BETWEEN '2000-01-01' AND '2100-12-31')
        AND ("coversFrom" IS NULL OR "coversTo" IS NULL OR "coversFrom" <= "coversTo")
      );
  END IF;
END $$;

COMMENT ON COLUMN public.sales_order_installments."coversFrom" IS
  'วันแรกของช่วงบริการที่งวดนี้จ่ายค่าให้ (มติ 2026-08-30) — SA กรอก/กดแบ่งช่วงอัตโนมัติจากช่วงสัญญา';
COMMENT ON COLUMN public.sales_order_installments."coversTo" IS
  'วันสุดท้ายของช่วงบริการที่งวดนี้ครอบ — max ของงวดที่ confirmed คือค่า "จ่ายถึง" (paidThrough) ที่ด่านเข้าไซต์ใช้ตัดสิน';

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
