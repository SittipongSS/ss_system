-- ============================================================
--  Migration 0264: มูลค่าคาดการณ์ของดีลแตกเป็นรายหมวดสินค้า (มติผู้ใช้ 2026-08-17)
--
--  คำสั่งตั้งต้น: *"การสร้างดีล อยากเปลี่ยนมูลค่าคาดการณ์ โดยหมวดสินค้าเลือกหลาย
--  รายการได้ และใส่จำนวน และราคาต่อหน่วยคาดการณ์ มูลค่ารวมก็ให้คิดอัตโนมัติ"*
--
--  เดิมดีลมีหมวดสินค้าเดียว (`categoryCode` — mig 0094) และยอดเดียวที่พิมพ์มือ
--  (`projectValue`) ⇒ ดีลที่ขายหลายหมวดพร้อมกันต้องรวมหัวเป็นเลขก้อนเดียว
--  แล้วไม่มีใครรู้ว่ายอดนั้นมาจากอะไร
--
--  ⚠️ **ทำไมเป็นตารางแถว ไม่ใช่ jsonb ในแถวดีล**: หน้ารายงาน/แดชบอร์ดต้องรวมยอด
--  คาดการณ์ตามหมวดข้ามดีลได้ (คำถามจริงของฝ่ายขาย) — jsonb ต้องแตกก้อนทุกครั้ง
--  และ CHECK ระดับคอลัมน์ (จำนวน>0 · ราคา≥0 · รหัสหมวดถูกฟอร์แมต) เขียนไม่ได้
--
--  ⭐ **ยอดรวมยังอยู่ที่ `sales_deals."projectValue"` เหมือนเดิม** — ทั้งระบบ (FC ·
--  แดชบอร์ด · ความแม่นยำ FC vs Actual) อ่านคอลัมน์นั้นอยู่ ห้ามย้าย ⇒ ตารางนี้เป็น
--  "ที่มาของยอด" และ API เป็นคนคิดผลรวมเขียนกลับลง projectValue ทุกครั้งที่บันทึก
--  (มติผู้ใช้: ช่องมูลค่ารวม **ล็อก** พิมพ์ทับเองไม่ได้ — คิดจากแถวเท่านั้น)
--
--  ⭐ `sales_deals."categoryCode"` ยังอยู่และยังเป็นหมวด "ของดีล" ที่ใช้กรองขั้นตอน
--  ของ Workflow Template (`categoryOnly` / `categoryExclude` / flag:excise) —
--  ตัว template เลือกจาก **ประเภทดีล** ไม่ใช่หมวด (lib/sales/dealTimelineGen.js)
--  กติกาใหม่: หมวดของดีล = หมวดของแถวแรก (API sync ให้เอง ไม่ใช่ช่องแยกในฟอร์ม)
--
--  ดีลเก่าที่ยังไม่มีแถว = ยอดเดิมใน projectValue ใช้ได้ต่อไป (ไม่ backfill —
--  qty/ราคาต่อหน่วยของอดีตไม่มีใครรู้ ปั้นตัวเลขให้ = โกหกข้อมูล)
--
--  🛑 **ต้องรันก่อน deploy โค้ด** — ตารางใหม่ล้วน โค้ดปัจจุบันไม่รู้จัก รันล่วงหน้าได้
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_deal_value_items (
  id              text PRIMARY KEY,
  -- CASCADE: แถวเป็นส่วนประกอบของยอดดีล ไม่มีความหมายเมื่อดีลหายไป
  -- (ต่างจาก sales_order_installments ที่เป็นเงินจริง — ตรงนี้เป็นแค่ประมาณการ)
  "dealId"        text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  seq             integer NOT NULL CHECK (seq >= 1),

  -- หมวดสินค้า MM-TTT (ทะเบียน product_types) — ฟอร์แมตคุมที่ DB, "หมวดมีจริง/
  -- ยังไม่พักใช้" คุมที่ API (activeProductTypeError) เหมือนช่องหมวดเดิมของดีล
  "categoryCode"  text NOT NULL CHECK ("categoryCode" ~ '^\d{2}-\d{3}$'),

  -- จำนวน > 0 เสมอ: แถวที่จำนวนเป็นศูนย์ไม่เพิ่มยอด และไม่ใช่การตัดสินใจของใคร
  qty             numeric NOT NULL CHECK (qty > 0),
  unit            text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 20),
  -- ราคาต่อหน่วย "คาดการณ์" — 0 ได้ (ของแถม/ยังไม่เคาะราคา) แต่ติดลบไม่ได้
  "unitPrice"     numeric NOT NULL CHECK ("unitPrice" >= 0),
  -- ยอดของแถว = qty × unitPrice คิดที่ API แล้วเก็บไว้ (ไม่ใช่ generated column:
  -- ผลรวมของดีลต้องเท่ากับผลบวกของสิ่งที่บันทึกไว้จริง ไม่ใช่ค่าที่คิดใหม่คนละที่)
  amount          numeric NOT NULL CHECK (amount >= 0),

  note            text CHECK (note IS NULL OR length(note) <= 500),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- คำถามเดียวที่ถามตารางนี้: "แถวของดีลใบนี้ เรียงตามลำดับ"
CREATE INDEX IF NOT EXISTS sales_deal_value_items_deal_idx
  ON public.sales_deal_value_items ("dealId", seq);

-- รายงาน "ยอดคาดการณ์แยกตามหมวด" ข้ามดีล — เหตุผลที่เลือกตารางแทน jsonb
CREATE INDEX IF NOT EXISTS sales_deal_value_items_category_idx
  ON public.sales_deal_value_items ("categoryCode");

-- บันทึกซ้ำ/สองแท็บพร้อมกันต้องไม่ได้ลำดับซ้ำในใบเดียว
CREATE UNIQUE INDEX IF NOT EXISTS sales_deal_value_items_seq_uk
  ON public.sales_deal_value_items ("dealId", seq);

ALTER TABLE public.sales_deal_value_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_deal_value_items FROM anon, authenticated;
GRANT  ALL ON TABLE public.sales_deal_value_items TO service_role;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
