-- ============================================================
--  Migration 0373: แชร์กลิ่น/สูตรให้ลูกค้ารายอื่น (ม-150)
--
--  ⭐ มติผู้ใช้ 2026-09-22: *"อยากให้กลิ่นกับสูตรสามารถผูกได้มากกว่า 1"* → ผูกได้หลายลูกค้า
--     เลือก "แชร์ให้ลูกค้าอื่นได้" (ไม่ใช่กลิ่นกลาง · ไม่ใช่แค่ลูกค้าในเครือ) ·
--     ลูกค้าที่ได้รับแชร์ "ใช้ได้เหมือนเป็นของตัวเอง" · แชร์สูตรได้ด้วย · RD เท่านั้นที่แชร์/เลิกแชร์
--
--  ⚠️ **แก้มติ 9 บางส่วน** — กลิ่น/สูตรยังมีเจ้าของรายเดียวเหมือนเดิม (`scents.customerId` NOT NULL
--     อยู่ในคีย์ตัวตน `scents_identity_uk` · `formulas.customerId`) · ตารางนี้แค่เพิ่ม "ลูกค้าที่ใช้ร่วม"
--     ⇒ ไม่แตะตัวตน ไม่ย้ายเจ้าของ · ราคา F/B/FB ยังเป็นของกลิ่น/สูตรตัวเดียว (ทุกลูกค้าเห็นราคาเดียวกัน)
--
--  ⚠️ ไม่มี FK ไป `customers` — แพตเทิร์นเดียวกับ `scents.customerId` (mig 0171) · ด่านลบลูกค้า
--     นับแถวในสองตารางนี้เอง (`lib/master/entityReferences.js`)
--  ⚠️ ลบกลิ่น/สูตร = ลบแถวแชร์ตาม (CASCADE) — แชร์เป็นของประกอบ ไม่ใช่การอ้างอิงที่ต้องกันลบ
--
--  ⭐ **1 สูตรผูกได้หลาย FG** (มติผู้ใช้ 2026-09-22 ต่อจากเรื่องแชร์: *"1 สูตร ผูกได้หลาย FG"*) — ถอด
--     `products_formula_uk` (mig 0231 · 1 สูตร : 1 FG) · ลูกค้าที่ได้รับแชร์สูตรทำ FG ของตัวเองจากสูตรเดิมได้
--     (ตัวตนสูตร = หมวด × กลิ่น ⇒ สร้างสูตรซ้ำคู่เดิมไม่ได้ ทางเดียวคือหลาย FG ชี้สูตรเดียว)
--     · index ธรรมดา `products_formula_idx` (0171) ยังอยู่ — query "FG ไหนใช้สูตรนี้" ไม่ช้าลง
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy** — โค้ดใหม่อ่านสองตารางนี้ทุกครั้งที่โหลด
--     ทะเบียนกลิ่น/สูตร (ไม่มีตาราง = ทะเบียนกลิ่น/สูตรเปิดไม่ขึ้น) · รันซ้ำได้ (IF NOT EXISTS)
--
--  ── Rollback ─────────────────────────────────────────────────────────────
--  DROP TABLE IF EXISTS public.formula_customer_shares;
--  DROP TABLE IF EXISTS public.scent_customer_shares;
--  CREATE UNIQUE INDEX products_formula_uk ON public.products ("formulaId") WHERE "formulaId" IS NOT NULL;
--    (สร้างกลับได้เฉพาะเมื่อยังไม่มีสูตรที่ถูกหลาย FG ถือ — ตรวจด้วย GROUP BY "formulaId" HAVING count(*) > 1 ก่อน)
--  (ต้อง revert โค้ดก่อน — ไม่งั้นทะเบียนกลิ่น/สูตรเปิดไม่ขึ้น)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.scent_customer_shares (
  "scentId"       text NOT NULL REFERENCES public.scents(id) ON DELETE CASCADE,
  "customerId"    text NOT NULL CHECK (length(btrim("customerId")) > 0),
  "customerName"  text,                               -- snapshot ตอนแชร์ (derive จากทะเบียนลูกค้า)
  "createdById"   text,
  "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("scentId", "customerId")
);
CREATE INDEX IF NOT EXISTS scent_customer_shares_customer_idx
  ON public.scent_customer_shares ("customerId");

CREATE TABLE IF NOT EXISTS public.formula_customer_shares (
  "formulaId"     text NOT NULL REFERENCES public.formulas(id) ON DELETE CASCADE,
  "customerId"    text NOT NULL CHECK (length(btrim("customerId")) > 0),
  "customerName"  text,
  "createdById"   text,
  "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("formulaId", "customerId")
);
CREATE INDEX IF NOT EXISTS formula_customer_shares_customer_idx
  ON public.formula_customer_shares ("customerId");

-- 1 สูตรผูกได้หลาย FG — ถอด unique ของ 0231 (ดูหัวไฟล์)
DROP INDEX IF EXISTS public.products_formula_uk;

-- RLS (แพตเทิร์นเดิมทั้งระบบ: ปิดหมด เปิดเฉพาะ service_role — ดู 0171)
ALTER TABLE public.scent_customer_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formula_customer_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scent_customer_shares, public.formula_customer_shares
  FROM anon, authenticated;
GRANT  ALL ON TABLE public.scent_customer_shares, public.formula_customer_shares
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
