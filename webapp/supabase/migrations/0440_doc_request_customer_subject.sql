-- ============================================================
--  Migration 0440: คำร้องขอเอกสาร (DC) — ที่อยู่ลูกค้าของใบ + กลิ่น/สูตรของบรรทัด MSDS (ม-167 · มติเจ้าของ 25/11/2026)
--
--  ⭐ มติเจ้าของ 25/11 (ถามทีละข้อ · docs/requests-rd-decision-log.md §38):
--     · IFRA / MSDS ต้องโชว์ข้อมูลลูกค้า ชื่อ · ที่อยู่ · เบอร์ ทั้งไทยและอังกฤษ — **ผู้ขอเลือกที่อยู่** 1 ที่อยู่ต่อใบ
--     · MSDS ตาม FG + ต้องมีชื่อกลิ่น (หมวด 02-020) หรือสูตร (หมวดอื่น) — FG ยังไม่ผูก = **ผู้ขอเลือกในบรรทัด**
--       ไม่มีในทะเบียน = **พิมพ์ชื่อแทน** · ไม่เขียนกลับ FG (หน้าสินค้าขึ้นคำแนะนำให้กดยื่นขออนุมัติเอง)
--  🐞 ที่มา (prod 25/11): FG 12 ตัวที่เคยขอ MSDS ไม่ผูกสูตร/กลิ่นเลย · ลูกค้าในใบ DC 22 ราย มีชื่อ/ที่อยู่อังกฤษ 7
--     · ฝ่ายขายพิมพ์ชื่อ/ที่อยู่อังกฤษ + ชื่อกลิ่นลงช่องรายละเอียดเองให้ RD ก๊อป
--
--  ── ทำอะไร ───────────────────────────────────────────────────────────────────────────────
--   1) dept_requests."customerAddressId" text — id ของแถวใน customers.addresses (jsonb) ที่ใบเลือก · ว่าง = ที่อยู่ออกเอกสารหลัก
--      · ไม่มี FK (ที่อยู่อยู่ใน jsonb) — server ตรวจว่าเป็นของลูกค้าของใบตอนบันทึก · ที่อยู่ถูกลบทีหลัง = จอตกไปที่อยู่หลัก + บอก
--   2) dept_request_items."formulaId" text → formulas(id) ON DELETE SET NULL — สูตรที่ผู้ขอเลือกให้บรรทัด MSDS ของ FG ที่ยังไม่ผูกสูตร
--      · หมวด 02-020 ใช้คอลัมน์ "scentId" เดิมของบรรทัด (ไม่ต้องเพิ่ม)
--   3) dept_request_items."typedSubjectName" text (≤ 200) — ชื่อกลิ่น/สูตรที่พิมพ์เอง เมื่อทะเบียนยังไม่มีตัวให้เลือก
--
--  ── ผลต่อข้อมูลเดิม ───────────────────────────────────────────────────────────────────────────
--   ไม่มี — แถวเดิมเป็น NULL ทั้งหมด (ไม่ backfill · บรรทัดเก่าไม่ถูกบังคับย้อนหลัง)
--   · ลำดับรันกับ deploy: **รันไฟล์นี้ก่อน deploy** — โค้ดใหม่เขียน/อ่านคอลัมน์ทั้งสาม (ก่อนรัน = เปิด/แก้คำร้องขอเอกสารไม่ผ่าน)
--     โค้ดเก่าบนฐานใหม่ไม่กระทบ (ไม่อ่านคอลัมน์ใหม่ · CHECK dept_request_items_shape ไม่เกี่ยว)
--
--  ── ทางกลับ ────────────────────────────────────────────────────────────────────────────────
--   ALTER TABLE public.dept_request_items DROP COLUMN IF EXISTS "typedSubjectName", DROP COLUMN IF EXISTS "formulaId";
--   ALTER TABLE public.dept_requests DROP COLUMN IF EXISTS "customerAddressId";
--   ⚠️ ใบที่เลือกที่อยู่/สูตร/ชื่อไว้แล้วเสียค่าที่เลือก (กลับไปใช้ที่อยู่หลัก · บรรทัด MSDS ไม่มีกลิ่น/สูตร)
--  รันซ้ำได้
-- ============================================================

ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "customerAddressId" text;

ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "formulaId" text,
  ADD COLUMN IF NOT EXISTS "typedSubjectName" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_items_formula_fkey'
  ) THEN
    ALTER TABLE public.dept_request_items
      ADD CONSTRAINT dept_request_items_formula_fkey
      FOREIGN KEY ("formulaId") REFERENCES public.formulas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_items_typed_subject_len'
  ) THEN
    ALTER TABLE public.dept_request_items
      ADD CONSTRAINT dept_request_items_typed_subject_len
      CHECK ("typedSubjectName" IS NULL OR length("typedSubjectName") <= 200);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dept_request_items_formula_idx
  ON public.dept_request_items ("formulaId") WHERE "formulaId" IS NOT NULL;

COMMENT ON COLUMN public.dept_requests."customerAddressId" IS
  'ที่อยู่ลูกค้าที่ใบขอเอกสาร (IFRA / MSDS) เลือก — id ของแถวใน customers.addresses · ว่าง = ที่อยู่ออกเอกสารหลัก (mig 0440 · ม-167)';
COMMENT ON COLUMN public.dept_request_items."formulaId" IS
  'สูตรที่ผู้ขอเลือกให้บรรทัด MSDS ของ FG ที่ยังไม่ผูกสูตร — ไม่เขียนกลับ FG (mig 0440 · ม-167)';
COMMENT ON COLUMN public.dept_request_items."typedSubjectName" IS
  'ชื่อกลิ่น/สูตรที่ผู้ขอพิมพ์เองให้บรรทัด MSDS เมื่อทะเบียนยังไม่มีตัวให้เลือก (mig 0440 · ม-167)';

NOTIFY pgrst, 'reload schema';
