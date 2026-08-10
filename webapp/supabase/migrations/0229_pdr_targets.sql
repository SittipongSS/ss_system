-- ── 0229 · PDR 2.2/2.3 · ต้นทุนและราคาขาย "รายสินค้า" ไม่ใช่ตัวเลขเดียวทั้งใบ ──
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-10): "2.2 ขอเป็นปุ่มเพิ่มรายการ ดึงมาจากรายการประเภท
-- สินค้า (ดึงซ้ำได้) และมีสวิตช์เปิดปิด หัวน้ำหอม (F) / เนื้อสาร (FB) หากเปิด มีช่อง
-- ให้ใส่รายละเอียด และช่องใส่ราคา (บาท/Kg) · 2.3 ดึงรายการจำนวนเท่า 2.2 โดยมีช่อง
-- ให้กรอกราคา หน่วย บาท/ชิ้น"
--
-- ⚠️ **ทำไมเป็นตารางใหม่ ไม่ใช่คอลัมน์เพิ่มบน dept_requests**
-- ของเดิมคือ `pdrTargetCost` / `pdrTargetPrice` ตัวละ `numeric` **ตัวเดียวทั้งใบ** ⇒
-- ใบที่ขอ Room Spray + Reed Diffuser + Sachet พร้อมกัน (ซึ่งเป็นใบปกติ ไม่ใช่ใบพิเศษ)
-- กรอกได้แค่ราคาเดียว · จำนวนแถวไม่รู้ล่วงหน้าและซ้ำหมวดกันได้ ⇒ เป็นความสัมพันธ์
-- 1:N ตรง ๆ แพตเทิร์นเดียวกับ `dept_request_scents` (0213)
--
-- ⚠️ **ไม่ย้ายค่าเดิมมาลงตาราง** — `pdrTargetCost` ตัวเก่าไม่รู้ว่าเป็นของหมวดไหน
-- และเดาผิดแล้วผิดเงียบ ⇒ คอลัมน์เก่าอยู่ต่อในฐานะ *ข้อมูลเก่า* (ทะเบียนฝั่งโค้ด
-- ทำเครื่องหมาย `legacy` ให้แล้ว: ฟอร์มไม่เขียนลงอีก แต่จอสรุปกับกระดาษยังพิมพ์
-- ถ้าใบนั้นมีค่า) — กติกาเดียวกับ `pdrProductKind` ตอน 0227
--
-- ⚠️ **หมวดสินค้าเก็บเป็นรหัส ไม่ใช่ชื่อ** — ป้ายมาจากทะเบียนหมวดตอนแสดงผล
-- (แพตเทิร์น `pdrProductKinds` ของ 0227) · เก็บชื่อลงไปแล้วทะเบียนเปลี่ยนคำเมื่อไร
-- ใบเก่าจะค้างคำเดิมโดยไม่มีใครรู้
--
-- ⚠️ **ไม่มี UNIQUE (requestId, categoryCode)** โดยตั้งใจ — ผู้ใช้ขอ "ดึงซ้ำได้"
-- เพราะสินค้าหมวดเดียวกันขอหลายสเปกในใบเดียวเป็นเรื่องปกติ (Room Spray 50ml กับ
-- 100ml คนละต้นทุน) · ตัวแยกคือลำดับแถว ไม่ใช่หมวด
--
-- additive ล้วน รันซ้ำได้ · รันก่อน deploy ได้ (โค้ดเก่าไม่รู้จักตารางก็ทำงานเหมือนเดิม)

CREATE TABLE IF NOT EXISTS public.dept_request_pdr_targets (
  id                text PRIMARY KEY,
  "requestId"       text NOT NULL REFERENCES public.dept_requests(id) ON DELETE CASCADE,
  "sortOrder"       integer NOT NULL DEFAULT 0,
  -- รหัสหมวดจากทะเบียนสินค้า — ที่มาคือหมวดที่ติ๊กไว้ในข้อ 1.11 ของใบเดียวกัน
  "categoryCode"    text NOT NULL CHECK (length(btrim("categoryCode")) BETWEEN 1 AND 40),
  -- 2.2 · หัวน้ำหอม (F) — สวิตช์ + รายละเอียด + ราคาต่อกิโล
  "fOn"             boolean NOT NULL DEFAULT false,
  "fNote"           text,
  "fPricePerKg"     numeric,
  -- 2.2 · เนื้อสาร (FB) — ชุดเดียวกัน เปิดพร้อมกันทั้งคู่ได้
  "fbOn"            boolean NOT NULL DEFAULT false,
  "fbNote"          text,
  "fbPricePerKg"    numeric,
  -- 2.3 · ราคาขายต่อชิ้นของสินค้าสำเร็จรูป — **ผูกกับแถว ไม่ใช่กับ F/FB**
  -- (มติผู้ใช้: "1 แถว = 1 ราคา/ชิ้น") เพราะชิ้นที่ขายมีชิ้นเดียว ไม่ได้แยกตามว่า
  -- ข้างในเป็นหัวน้ำหอมหรือเนื้อสาร
  "pricePerUnit"    numeric,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dept_request_pdr_targets_request_idx
  ON public.dept_request_pdr_targets ("requestId", "sortOrder");

-- ── ด่านของข้อมูล ───────────────────────────────────────────────────────
-- ⚠️ ราคาติดลบต้องไม่ลงฐาน — ด่านฝั่งโค้ด (`lib/requests/pdrTargets.js`) ตอบเป็น
-- ข้อความไทยก่อนถึงตรงนี้ · CHECK เป็นตาข่ายชั้นสุดท้ายสำหรับทางเข้าที่ยังไม่มี
-- (import ข้อมูลเก่า · แก้มือใน Studio)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_pdr_targets_amount_check'
  ) THEN
    ALTER TABLE public.dept_request_pdr_targets
      ADD CONSTRAINT dept_request_pdr_targets_amount_check CHECK (
        ("fPricePerKg"  IS NULL OR "fPricePerKg"  >= 0)
        AND ("fbPricePerKg" IS NULL OR "fbPricePerKg" >= 0)
        AND ("pricePerUnit" IS NULL OR "pricePerUnit" >= 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_pdr_targets_note_check'
  ) THEN
    ALTER TABLE public.dept_request_pdr_targets
      ADD CONSTRAINT dept_request_pdr_targets_note_check CHECK (
        ("fNote"  IS NULL OR char_length("fNote")  <= 500)
        AND ("fbNote" IS NULL OR char_length("fbNote") <= 500)
      );
  END IF;

  -- ⚠️ สวิตช์ปิด = ไม่มีทั้งรายละเอียดและราคา · ปล่อยให้ค้างได้เมื่อไร กระดาษจะพิมพ์
  -- ราคาของสิ่งที่ใบนี้ไม่ได้ขอ ซึ่งอ่านเหมือนขอจริง
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dept_request_pdr_targets_switch_check'
  ) THEN
    ALTER TABLE public.dept_request_pdr_targets
      ADD CONSTRAINT dept_request_pdr_targets_switch_check CHECK (
        ("fOn"  OR ("fNote"  IS NULL AND "fPricePerKg"  IS NULL))
        AND ("fbOn" OR ("fbNote" IS NULL AND "fbPricePerKg" IS NULL))
      );
  END IF;
END $$;

COMMENT ON TABLE public.dept_request_pdr_targets IS
  'PDR 2.2/2.3 — ต้นทุนเป้าหมาย (บาท/Kg แยก F/FB) และราคาขายเป้าหมาย (บาท/ชิ้น) รายสินค้า';

-- ── สิทธิ์ระดับตาราง — แพตเทิร์นเดียวกับ dept_request_scents (0213) ──────
-- ทั้งแอปอ่าน/เขียนผ่าน service role ซึ่ง bypass RLS อยู่แล้ว · เปิด RLS แบบไม่มี
-- policy = ปิดประตูให้ anon สนิทโดยแอปไม่กระทบ
ALTER TABLE public.dept_request_pdr_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dept_request_pdr_targets FROM anon, authenticated;
GRANT  ALL ON TABLE public.dept_request_pdr_targets TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.dept_request_pdr_targets;
