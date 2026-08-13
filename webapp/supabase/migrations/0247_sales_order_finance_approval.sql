-- ============================================================
--  Migration 0247: ขั้นบัญชีตรวจใบสั่งขาย หลัง AE Supervisor อนุมัติ (มติผู้ใช้ 2026-08-13)
--
--  คำสั่งตั้งต้น: *"ต้องเพิ่มขั้นตอนใน SO ให้บัญชีอนุมัติใบด้วยหลัง AE Sup อนุมัติ"*
--
--  ⭐ **เป็นคนละแกนกับ `status` ไม่ใช่สถานะกลางทาง** (มติผู้ใช้ตอนถามตรง ๆ:
--  *"ยอด Actual เข้าตอน AE Sup อนุมัติ — บัญชีเป็นด่านคนละแกน"*)
--
--  🔴 เหตุผลที่ห้ามยัดเป็นสถานะกลาง — ตรวจแล้ว `status = 'approved'` เป็นตัวปลดล็อก
--  **12 จุดทั่วระบบ** ไม่ใช่แค่ป้าย: trigger นับ Actual เข้าดีล (0107:126) · เปิดคำร้อง
--  พัฒนากลิ่น · งานผลิตงอกอัตโนมัติ · สร้างใบยื่นสรรพสามิต · คิว handoff ฝ่ายกฎหมาย ·
--  ลายน้ำบนเอกสารพิมพ์ · การสร้างงวดชำระ (0245)
--  ⇒ แทรกสถานะกลางเมื่อไร ของทั้ง 12 อย่างจะหยุดรอบัญชีไปด้วยทั้งหมด ซึ่งไม่ใช่สิ่งที่ขอ
--
--  สายของแกนนี้:
--      (ใบยังไม่อนุมัติ) = NULL ยังไม่ถึงคิวบัญชี
--        │  [AE Sup อนุมัติ ⇒ status='approved']
--        ▼
--      pending ──[บัญชีอนุมัติ]──> approved ■
--        ▲            │
--        │            └──[บัญชีตีกลับ + เหตุผล]──> rejected
--        └──────[AE Sup ส่งตรวจใหม่]────────────────┘
--
--  ⚠️ **ตีกลับไม่ถอน Actual** — ยอดอยู่บนแกน `status` ซึ่งบัญชีไม่แตะ (มติข้อ 1)
--  ตีกลับ = ส่งกลับไปให้ AE Supervisor ดูใหม่ ไม่ใช่ถอยเอกสาร
--
--  สิ่งที่บัญชีตรวจ (มติผู้ใช้): ข้อมูลลูกค้า/ที่อยู่ออกบิล/เลขผู้เสียภาษี · เงื่อนไขการชำระ
--  งวด กำหนดชำระ · ยอดเงิน/ส่วนลด/VAT · เครดิตและวงเงินของลูกค้า
--  ⚠️ ต่างจาก "คอนเฟิร์มงวดชำระ" (0245) ซึ่งตอบว่า *เงินงวดนี้เข้าจริงไหม* — คนละคำถาม
--  แม้จะเป็นฝ่ายเดียวกันกด · อันนี้ตรวจ **ตัวเอกสาร** ครั้งเดียว อันนั้นตรวจ **เงินรายงวด**
--
--  🛑 รันล่วงหน้าได้ทันที — คอลัมน์ใหม่เป็น NULL ได้ทั้งหมด โค้ดเก่าไม่รู้จักและไม่แตะ
--  ⚠️ **ไม่ backfill** — ใบที่อนุมัติไปแล้วก่อนใบนี้จะได้ `financeStatus = NULL`
--  แปลว่า "ออกก่อนมีขั้นบัญชี" ไม่ใช่ "รอบัญชี" · ตั้งเป็น pending ย้อนหลังเมื่อไร
--  บัญชีจะเปิดมาเจอคิวค้างทั้งกองที่ไม่มีใครตั้งใจสร้าง
-- ============================================================

BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "financeStatus"        text,
  ADD COLUMN IF NOT EXISTS "financeApprovedBy"    text,
  ADD COLUMN IF NOT EXISTS "financeApprovedByName" text,
  ADD COLUMN IF NOT EXISTS "financeApprovedAt"    timestamptz,
  ADD COLUMN IF NOT EXISTS "financeRejectedBy"    text,
  ADD COLUMN IF NOT EXISTS "financeRejectedByName" text,
  ADD COLUMN IF NOT EXISTS "financeRejectedAt"    timestamptz,
  ADD COLUMN IF NOT EXISTS "financeRejectReason"  text,
  ADD COLUMN IF NOT EXISTS "financeNote"          text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_finance_status') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_finance_status
      CHECK ("financeStatus" IS NULL OR "financeStatus" IN ('pending', 'approved', 'rejected'));
  END IF;

  -- ⭐ สถานะกับหลักฐานต้องไปด้วยกัน **ที่ระดับ DB** ไม่ใช่พึ่งว่า API จะกรอกครบ
  -- เคสที่กันจริง: แถว approved ที่ไม่มีใครเซ็น = ไม่รู้ว่าใครรับผิดชอบการอนุมัตินั้น
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_finance_state_sane') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_finance_state_sane
      CHECK (
        ("financeStatus" IS DISTINCT FROM 'approved' OR "financeApprovedAt" IS NOT NULL)
        AND ("financeStatus" IS DISTINCT FROM 'rejected'
             OR ("financeRejectedAt" IS NOT NULL
                 AND length(btrim(coalesce("financeRejectReason", ''))) >= 10))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_finance_note_len') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_finance_note_len
      CHECK (
        ("financeRejectReason" IS NULL OR length("financeRejectReason") <= 500)
        AND ("financeNote" IS NULL OR length("financeNote") <= 1000)
      );
  END IF;
END $$;

-- คิวของฝ่ายบัญชี: "มีใบไหนรอตรวจบ้าง" — partial index เพราะถามแค่สถานะเดียว
CREATE INDEX IF NOT EXISTS sales_orders_finance_pending_idx
  ON public.sales_orders ("orderDate")
  WHERE "financeStatus" = 'pending';

COMMENT ON COLUMN public.sales_orders."financeStatus" IS
  'ขั้นบัญชีตรวจ (0247) — NULL = ยังไม่ถึงคิว/ออกก่อนมีขั้นนี้ · คนละแกนกับ status ไม่แตะ Actual';

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
