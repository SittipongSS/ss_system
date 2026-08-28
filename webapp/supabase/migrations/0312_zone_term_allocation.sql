-- ── จัดสรรบรรทัดขายลงหลายโซนได้ (มติผู้ใช้ 2026-08-29) ─────────────────────
--
-- > *"ไม่ต้องนับบรรทัดแล้ว นับแค่จำนวน FG พอ เพื่อให้ทาง TS จัดสรร ส่งโซนเอง"*
--
-- ⭐ **ที่มา**: "บรรทัด" เป็นรูปร่างของ **เอกสารขาย** (ฝ่ายขายแยกบรรทัดตามราคา/
--    ส่วนลด) ไม่ใช่รูปร่างของ **งาน** · ของจริงในคิววันนี้: SO-26080077-0 มี
--    **10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย** ⇒ บังคับให้ TS ไล่จับคู่
--    ทีละบรรทัดคือให้เขาทำงานตามรูปร่างของเอกสารคนอื่น
--
-- ของเดิม: `salesOrderLineId` เป็น **UNIQUE** ⇒ 1 บรรทัด ผูกได้ **โซนเดียวตลอดกาล**
--   บรรทัด "13 แพ็ค" จึงลงได้แค่โซนเดียว ทั้งที่ของจริงกระจายไปหลายโซน
-- ของใหม่: 1 บรรทัด → **หลายโซน** โซนละกี่หน่วยก็ได้ · `packageQty` เปลี่ยนความหมาย
--   จาก "จำนวนทั้งบรรทัด (snapshot)" เป็น **"จำนวนที่จัดสรรลงโซนนี้"**
--
-- ⚠️ **ผลรวมห้ามเกินจำนวนในบรรทัด** — ด่านนี้อยู่ที่ API (ต้องอ่าน sales_order_lines
--    ซึ่ง CHECK ระดับแถวมองไม่เห็น) · ที่นี่กันได้แค่ "โซนเดิมซ้ำในบรรทัดเดียว"
--
-- ⚠️ ข้อมูลเดิมไม่ต้องแปลง: ทุกแถวที่มีอยู่คือ "จัดสรรทั้งบรรทัดลงโซนเดียว"
--    ซึ่งเป็นกรณีเฉพาะของกติกาใหม่อยู่แล้ว

BEGIN;

-- 1) ปลด UNIQUE เดิมของบรรทัด — ชื่อ constraint มาจาก `UNIQUE` inline ของ mig 0297
--    (PostgreSQL ตั้งชื่อ <table>_<column>_key) · เผื่อกรณีถูกตั้งชื่ออื่นไว้ด้วย
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'service_zone_terms'
    AND con.contype = 'u'
    AND con.conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'salesOrderLineId'
    )]::smallint[]
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.service_zone_terms DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

-- 2) กันจัดสรรบรรทัดเดิมลงโซนเดิมซ้ำเป็นสองแถว — ต้องรวมเป็นแถวเดียวแล้วบวกจำนวน
--    (ไม่งั้นยอดรวมของโซนถูก แต่ประวัติอ่านไม่รู้เรื่องว่าทำไมมีสองรอบซ้อนกัน)
CREATE UNIQUE INDEX IF NOT EXISTS service_zone_terms_line_zone_uk
  ON public.service_zone_terms ("salesOrderLineId", "zoneId");

-- 3) จำนวนที่จัดสรรต้องเป็นบวกเสมอ — 0 หรือติดลบไม่ใช่การจัดสรร แต่คือการไม่ผูก
--    (ของเดิมยอมให้ NULL เพราะเป็น snapshot ที่บรรทัดอาจไม่มีจำนวน · ตอนนี้ค่านี้
--    คือ "แบ่งไปกี่หน่วย" ⇒ NULL ยังยอมได้สำหรับแถวเก่า แต่ค่าที่ใส่ต้อง > 0)
ALTER TABLE public.service_zone_terms
  DROP CONSTRAINT IF EXISTS service_zone_terms_alloc_positive;
ALTER TABLE public.service_zone_terms
  ADD CONSTRAINT service_zone_terms_alloc_positive
  CHECK ("packageQty" IS NULL OR "packageQty" > 0);

COMMENT ON COLUMN public.service_zone_terms."packageQty" IS
  'จำนวนที่จัดสรรจากบรรทัดขายลงโซนนี้ (mig 0312) — ผลรวมทุกโซนของบรรทัดเดียวกันห้ามเกิน sales_order_lines.qty · ด่านอยู่ที่ API';

COMMIT;

NOTIFY pgrst, 'reload schema';
