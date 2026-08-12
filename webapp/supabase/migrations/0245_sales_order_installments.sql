-- ============================================================
--  Migration 0245: งวดชำระของใบสั่งขาย — SA แจ้ง บัญชีคอนเฟิร์ม (มติผู้ใช้ 2026-08-13)
--
--  คำสั่งตั้งต้น: *"SO ต้องเอาเรื่องการชำระมาด้วย เรามีการทำงวดชำระไว้ด้วยนิ จาก QT
--  ก็ดึงมาใช้ เพื่อเป็นการติดตามว่าชำระครบยัง · ลำดับก็คือ SA ส่งเรื่อง จบที่บัญชีตรวจสอบ"*
--
--  ⭐ **สายงานยกมาจากมติ 2026-08-01** (`docs/service-business-system-plan.md` §5)
--  ที่ตัดสินไว้แล้วว่า *"SA ต้องกดว่าลูกค้าจ่ายแล้ว บัญชีต้องคอนเฟิร์ม"*:
--
--      pending ──[SA/AC กด "ลูกค้าจ่ายแล้ว" + แนบหลักฐาน]──> reported
--                    ↑                                        │
--                    └──────[บัญชีตีกลับ + เหตุผล]────────────┤
--                                                             ↓
--                                           [บัญชีคอนเฟิร์ม] confirmed
--
--  ⚠️ **`reported` ไม่นับว่าชำระแล้ว — นับเมื่อ `confirmed` เท่านั้น**
--  ไม่งั้น SA แจ้งเองนับเอง = เท่ากับไม่มีด่าน (กติกาเดียวกับที่แผนนั้นห้าม reported ปลดด่าน)
--
--  ⚠️ **ไม่ยัดเข้า `sales_orders.status`** — เป็นคนละแกนกับสายอนุมัติ และเดินพร้อมกันได้
--  (งวด 1 confirmed ขณะงวด 2 ยัง pending) ⇒ ต้องเป็นแถวต่องวด ไม่ใช่ jsonb ก้อนเดียว
--  เพราะแต่ละงวดมีสถานะ ผู้กด เวลา และไฟล์หลักฐานของตัวเอง
--
--  ที่มาของยอด: snapshot จาก `quotations.paymentPlan` ตอน **อนุมัติใบ** ไม่ใช่ตอนสร้างร่าง
--  (ยอดยังเปลี่ยนได้จนกว่าจะอนุมัติ · สร้างก่อนแล้วยอดต่องวดจะผิดเงียบ ๆ)
--  `type:'full'` = **หนึ่งงวด 100%** ไม่ใช่ศูนย์งวด — ไม่งั้นใบจ่ายครั้งเดียวไม่มีอะไรให้ติดตาม
--
--  🛑 **ต้องรันก่อน deploy โค้ด** — ตารางใหม่ล้วน โค้ดเวอร์ชันปัจจุบันไม่รู้จัก จึงรัน
--  ล่วงหน้าได้ทันทีโดยไม่กระทบใคร
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_order_installments (
  id                text PRIMARY KEY,
  -- CASCADE: ใบถูกบังคับลบพร้อมหลักฐาน (mig 0152) แล้วงวดต้องไปด้วย ไม่เหลือแถวกำพร้า
  -- ⚠️ พรีวิวก่อนบังคับลบต้องนับแถวนี้ด้วย — งวดที่ confirmed แล้วคือเงินที่รับมาจริง
  --    คนกดต้องเห็นก่อนว่าจะทำลายอะไร (route DELETE ?dryRun=1)
  "salesOrderId"    text NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  seq               integer NOT NULL CHECK (seq >= 1),

  -- ── snapshot จาก QT ตอนอนุมัติ — ห้ามแก้ทีหลัง (ยอดต้องตรงกับใบที่เซ็นไปแล้ว) ──
  label             text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  percent           numeric NOT NULL CHECK (percent >= 0 AND percent <= 100),
  amount            numeric NOT NULL CHECK (amount >= 0),

  -- ── กรอกที่ SO ── QT เก็บแค่ % กับชื่องวด ไม่มีวัน (มติผู้ใช้: SA กรอกเองทีละงวด)
  -- ของจริงมีงวดที่ผูกกับเหตุการณ์ ("หลังติดตั้ง") ไม่ใช่ผูกกับวัน จึงคำนวณให้ไม่ได้
  "dueDate"         date,

  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'reported', 'confirmed', 'rejected')),

  -- ── SA / AC แจ้ง ──
  "reportedById"    text,
  "reportedByName"  text,   -- snapshot "ใครกด ณ ตอนนั้น" ห้ามซิงก์ตามบัญชีผู้ใช้ทีหลัง
  "reportedAt"      timestamptz,
  "paidOn"          date,   -- วันที่ลูกค้าจ่ายจริง (ไม่ใช่วันที่กดแจ้ง)
  evidence          jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── ฝ่ายบัญชี (department FN) ตัดสิน ──
  "confirmedById"   text,
  "confirmedByName" text,
  "confirmedAt"     timestamptz,
  "rejectedById"    text,
  "rejectedByName"  text,
  "rejectedAt"      timestamptz,
  "rejectedReason"  text CHECK ("rejectedReason" IS NULL OR length("rejectedReason") <= 500),

  note              text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"     text,
  "createdByName"   text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),

  -- กันปีพิมพ์ผิดแบบที่เจอมาแล้วบน prod (`formulaDate = '2202-08-06'`)
  CONSTRAINT sales_order_installments_dates_sane CHECK (
    ("dueDate" IS NULL OR "dueDate" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("paidOn" IS NULL OR "paidOn" BETWEEN '2000-01-01' AND '2100-12-31')
  ),

  -- ⭐ สถานะกับหลักฐานต้องไปด้วยกัน **ที่ระดับ DB** ไม่ใช่พึ่งว่า API จะกรอกครบ
  -- เคสที่กันจริง: แถว confirmed ที่ไม่มีใครแจ้ง = ไม่มีร่องรอยว่าเงินมาจากไหน
  CONSTRAINT sales_order_installments_state_sane CHECK (
    (status <> 'reported'  OR "reportedAt" IS NOT NULL)
    AND (status <> 'confirmed' OR ("confirmedAt" IS NOT NULL AND "reportedAt" IS NOT NULL))
    AND (status <> 'rejected'  OR ("rejectedAt" IS NOT NULL
                                   AND length(btrim(coalesce("rejectedReason", ''))) >= 10))
  ),

  -- หลักฐานต้องเป็น array เสมอ — jsonb object หลุดเข้ามาแล้ว .map() ฝั่งหน้าเว็บพังทั้งการ์ด
  CONSTRAINT sales_order_installments_evidence_array CHECK (jsonb_typeof(evidence) = 'array')
);

-- งวดของใบหนึ่ง เรียงตามลำดับ = คำถามเดียวที่หน้า SO ถาม
CREATE INDEX IF NOT EXISTS sales_order_installments_order_idx
  ON public.sales_order_installments ("salesOrderId", seq);

-- คิวของฝ่ายบัญชี: "มีอะไรรอคอนเฟิร์มบ้าง" ข้ามทุกใบ
CREATE INDEX IF NOT EXISTS sales_order_installments_reported_idx
  ON public.sales_order_installments ("dueDate")
  WHERE status = 'reported';

-- ⚠ กดปุ่ม "เริ่มติดตามการชำระ" ซ้ำต้องไม่ได้งวดซ้ำ — idempotent ที่ระดับ DB
--   ไม่ใช่พึ่งว่า client จะไม่กดสองครั้ง (บทเรียนเดียวกับ material_deliveries 0176)
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_installments_seq_uk
  ON public.sales_order_installments ("salesOrderId", seq);

ALTER TABLE public.sales_order_installments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_order_installments FROM anon, authenticated;
GRANT  ALL ON TABLE public.sales_order_installments TO service_role;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
