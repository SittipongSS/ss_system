-- ── 0216 · ประตูหัวหน้าฝ่ายขาย (AE Sup) ─────────────────────────────────
-- (เขียนไว้เป็น 0215 ตอนแรก — ชนกับ 0215_drop_scent_sample_code ที่ merge ก่อน
--  ตามกติกาโปรเจกต์ ไฟล์ที่มาทีหลังเลื่อนเลข · ยังไม่เคยรัน จึงไม่มีผลกระทบ)
--
-- ⭐ สายพัฒนากลิ่นตามที่ผู้ใช้ระบุ (2026-08-06):
--     AE/AC เปิด → ส่ง → RD รับเรื่อง → **AE Sup ยืนยัน** → RD ลงมือ
--
-- ⚠️ ประตูอยู่ **หลัง** RD รับเรื่อง ไม่ใช่ก่อนส่ง — หัวหน้าต้องเห็นวันกำหนดส่งจริงของ
-- RD ก่อนตัดสิน · ยืนยันก่อนรับเรื่องคือยืนยันบนข้อมูลที่ยังไม่มี
--
-- ⚠️ **ไม่เพิ่มค่าสถานะใหม่** — ชุดเดิม 6 ค่าพอ · ขั้น "รอ AE Sup ยืนยัน" เป็นของ
-- **derive** จากการที่ `acknowledgedAt` มีแล้วแต่ `approvedAt` ยังว่าง ⇒ ไม่มีสถานะ
-- ที่ต้องดูแลเพิ่ม และไม่ชน trigger `guard_dept_request` ที่คุมการเปลี่ยนสถานะอยู่
--
-- ⚠️ **ไม่ต้องมีคอลัมน์เหตุผลใหม่** — ไม่ยืนยัน = ตีกลับ ซึ่งใช้ `bounceReason` /
-- `bouncedAt` / `bouncedById` ของ 0209 ที่มีอยู่แล้ว (กลไกเดียวกันเป๊ะ: คืนใบเป็นร่าง
-- พร้อมเหตุผล เลขที่คงเดิม) · เพิ่มคอลัมน์ที่สองสำหรับเรื่องเดียวกันคือของที่ต้อง
-- คอยดูแลให้ตรงกันโดยไม่ได้อะไรเพิ่ม

ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "approvedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "approvedById"   text,
  ADD COLUMN IF NOT EXISTS "approvedByName" text;

-- ยืนยันได้ก็ต่อเมื่อรับเรื่องแล้ว — กันแถวที่ approved มาก่อน acknowledged ซึ่งอ่าน
-- ย้อนไม่ได้ว่าหัวหน้าเห็นวันกำหนดส่งตอนไหน
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_approval_order_check;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_approval_order_check CHECK (
    "approvedAt" IS NULL OR "acknowledgedAt" IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS dept_requests_awaiting_approval_idx
  ON public.dept_requests ("approvedAt") WHERE "approvedAt" IS NULL;

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- ALTER TABLE public.dept_requests
--   DROP CONSTRAINT IF EXISTS dept_requests_approval_order_check,
--   DROP COLUMN IF EXISTS "approvedAt",
--   DROP COLUMN IF EXISTS "approvedById",
--   DROP COLUMN IF EXISTS "approvedByName";
