-- ══════════════════════════════════════════════════════════════════════
--  0209: ตีกลับคำร้อง (P3a)
--
--  ⚠️ เขียนครั้งแรกเป็น 0208 แล้วเลื่อนเลข — `0208_orders_project_deal_ref.sql`
--  ของอีกสายงาน merge เข้า main ก่อน · **ยังไม่เคยรันบน prod ในชื่อเดิม**
--  (เลขชนแบบนี้เกิดครั้งที่ 5 แล้วในโปรเจกต์นี้ — กฎคือไฟล์ที่มาทีหลังเป็นฝ่ายเลื่อน)
--
--  ── ที่มา ───────────────────────────────────────────────────────────
--  ฝ่ายที่รับเรื่องต้องส่งคืนผู้ยื่นได้เมื่อข้อมูลไม่ครบ — วันนี้ทำได้อย่างเดียวคือ
--  "ยกเลิกคำร้อง" ซึ่งเป็นทางตัน (trigger ทำให้ใบ cancelled เปลี่ยนสถานะไม่ได้ตลอด
--  กาล) ⇒ ผู้ขอต้องเปิดใบใหม่และเสียเลขที่เดิมไป
--
--  ⭐ **ตีกลับ = `pending → draft` ไม่ใช่สถานะใหม่**
--     · ร่างคือสถานะที่ผู้ขอแก้แล้วส่งซ้ำได้อยู่แล้ว — ไม่ต้องเขียนเส้นทางใหม่
--     · trigger `guard_dept_request` ทำให้ `docNo` แก้ไม่ได้อยู่แล้ว ⇒ **เลขที่ไม่
--       เปลี่ยน** ตรงกับที่ต้องการพอดี (คำร้องใบเดิม ไม่ใช่ใบใหม่)
--     · ไม่ชนข้อห้าม cancelled เพราะไม่ได้แตะสถานะนั้น
--
--  คำศัพท์ที่ล็อกไว้: **ตีกลับ** = ผู้รับเรื่องส่งคืนผู้ยื่น · **ดึงกลับ** = ผู้ยื่น
--  เอาใบที่ยังไม่มีใครรับคืนเอง · ห้ามใช้ "ถอน/ถอด"
--
--  ⚠ รันมือบน Supabase SQL Editor · ไม่มีข้อมูลเดิมให้ backfill (คอลัมน์ใหม่ล้วน)
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "bounceReason" text,
  ADD COLUMN IF NOT EXISTS "bouncedAt"    timestamptz,
  ADD COLUMN IF NOT EXISTS "bouncedById"  text,
  ADD COLUMN IF NOT EXISTS "bouncedByName" text;

-- เหตุผลบังคับตอนตีกลับ — ด่านจริงอยู่ที่แอป (ได้ข้อความไทย) ส่วนนี่คือตาข่าย
-- ⚠️ ไม่ใช่ CHECK ที่ผูกกับ status เพราะค่าพวกนี้ **ค้างอยู่หลังผู้ขอส่งซ้ำ**
-- โดยตั้งใจ: มันคือประวัติว่าใบนี้เคยถูกตีกลับ ไม่ใช่สถานะปัจจุบัน
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_bounce_reason_len;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_bounce_reason_len
  CHECK ("bounceReason" IS NULL OR length(btrim("bounceReason")) BETWEEN 1 AND 2000);

-- ตีกลับแล้วต้องรู้ว่าใครตีและเมื่อไร — มีเหตุผลแต่ไม่มีวันที่ = วัดไม่ได้ว่าใบนี้
-- ค้างอยู่ที่ผู้ขอมานานแค่ไหน (ตัวเลขที่คิวต้องใช้ตอน P6)
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_bounce_evidence;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_bounce_evidence
  CHECK ("bounceReason" IS NULL OR "bouncedAt" IS NOT NULL);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'dept_requests' AND column_name LIKE 'bounce%';   -- ต้องได้ 4 แถว
--
-- ── Rollback ───────────────────────────────────────────────────────────
-- ALTER TABLE public.dept_requests
--   DROP COLUMN IF EXISTS "bounceReason", DROP COLUMN IF EXISTS "bouncedAt",
--   DROP COLUMN IF EXISTS "bouncedById",  DROP COLUMN IF EXISTS "bouncedByName";
