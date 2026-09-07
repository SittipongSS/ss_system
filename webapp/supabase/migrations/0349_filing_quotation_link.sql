-- ── ใบยื่นภาษีผูกใบเสนอราคาต้นทางด้วย FK ไม่ใช่ข้อความ ────────────────────────
--
-- ⭐ มติผู้ใช้ 2026-09-07: "ใบยื่นภาษี ต้องเอาต้นแบบมาจาก QT" — ต้นทางยังเป็น
-- **ใบสั่งขายที่อนุมัติแล้ว** เหมือนเดิม แต่ต้องผูก **ใบเสนอราคาที่เกี่ยวข้อง** เข้ามาด้วย
--
-- ปัญหาเดิม: ตัวเชื่อมเดียวระหว่างใบยื่นกับ QT คือคอลัมน์ข้อความ `quotationRef`
-- (ไม่มี FK ไม่มี index) ที่ `PATCH /api/orders/[id]` เปิดให้ฝ่ายขายพิมพ์แก้เองได้
-- ทั้งที่ค่านั้นทำงานเชิงโครงสร้างเต็มตัว — เป็นคีย์กันซ้ำ เป็นป้ายบนเอกสารพิมพ์
-- (lib/tax/billPrint.js) และเป็นคอลัมน์เรียงตั้งต้นของตารางใบยื่น
-- ⇒ ระบบ "รู้" ว่าใบยื่นมาจาก QT ใบไหนไม่ได้เลย นอกจากเชื่อสตริง
--
-- ⚠️ **ไม่ใส่ unique index บน `quotationId` โดยตั้งใจ** — กฎ "1 ใบเสนอราคา = 1 ใบยื่น"
-- บังคับผ่านสายอยู่แล้ว: `orders_sales_order_unique_idx` (mig 0160) + `sales_orders."quotationId"`
-- ที่เป็น UNIQUE (mig 0107) · การใส่ซ้ำที่นี่จะไปสะดุดเรื่อง Rev. ของใบเสนอราคา
-- (วัด 7/09: 60 กลุ่ม `baseNumber` มีมากกว่าหนึ่ง revision · 4 SO ชี้ revision ที่ไม่ใช่
-- ตัวล่าสุดของกลุ่มตัวเอง) โดยไม่ได้ความปลอดภัยเพิ่มแม้แต่ข้อเดียว
--
-- ON DELETE RESTRICT เหมือน `salesOrderId` — ใบยื่นเป็นเอกสารภาษี ลบต้นทางทิ้งโดยที่
-- ใบยื่นยังอยู่ไม่ได้

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "quotationId" text REFERENCES public.quotations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS orders_quotation_idx
  ON public.orders ("quotationId")
  WHERE "quotationId" IS NOT NULL;

-- backfill ใบเดิม — เดินตามสายที่มีอยู่แล้ว (ใบยื่น → SO → QT) ไม่เดาจากสตริง
-- `quotationRef` ซึ่งพิมพ์แก้เองได้ · ใบที่ไม่มี `salesOrderId` (พิมพ์มือยุคก่อน) ปล่อย
-- ให้เป็น NULL ตามเดิม — ไม่มีทางรู้ว่าหมายถึง QT ใบไหนจริง
UPDATE public.orders o
   SET "quotationId" = so."quotationId"
  FROM public.sales_orders so
 WHERE o."salesOrderId" = so.id
   AND o."quotationId" IS NULL
   AND so."quotationId" IS NOT NULL;
