-- ============================================================
--  Migration 0431: ชุดของขวัญที่มีน้ำหอม — ฝ่ายขายเลือกวิธีแจ้งราคาขายปลีกเอง (รวมชุด / รายชิ้น)
--
--  ⭐ มติเจ้าของ 11/11/2026 หลัง #2034 (แผนรื้อสรรพสามิต หมวด 14 · G5):
--     "เรื่องราคาขายปลีก ต้องเลือกได้ ว่าจะแจ้งรายชิ้น หรือรวมชุด" · ค่าตั้งต้นเมื่อยังไม่เลือก = "ต้องถามก่อนเสมอ"
--     ⇒ เลิกเลือกอัตโนมัติตามแบบชุด (เดิม 0430: ล้วน = ราคาทั้งชุด · คละ = รายชิ้น)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--   products."exciseTaxBase" รับเพิ่มสองค่า (เดิม 0430 รับแค่ว่าง | 'pieces'):
--     ว่าง       = สินค้าทั่วไป / ชุดที่ไม่มีของเสียภาษี — คิดจากราคาขายปลีกของสินค้า (เหมือนเดิม)
--     'set'      = ชุดของขวัญ แจ้งราคารวมชุด — คิดจากราคาขายปลีกของสินค้า (ราคาทั้งชุด)
--     'pieces'   = ชุดของขวัญ แจ้งราคารายชิ้น — คิดจาก "exciseBasePriceIncVat" (เหมือนเดิม)
--     'unchosen' = ชุดของขวัญที่มีของเสียภาษี แต่ฝ่ายขายยังไม่เลือก — ไม่มีฐานภาษี (ภาษี 0 · ยื่นทะเบียนไม่ได้)
--   แอปเขียนคอลัมน์นี้ตอนบันทึกสินค้าเท่านั้น (POST/PATCH /api/products · lib/excise/productExcise.js)
--
--  ── ผลต่อข้อมูลเดิม ──────────────────────────────────────────────────────
--   ไม่มี — ณ 11/11 ไม่มีสินค้าตัวไหนถือค่าในคอลัมน์นี้ (ตรวจแล้วว่าง) · ไม่ backfill
--
--  ── ลำดับรันกับ deploy ────────────────────────────────────────────────────
--   **รันไฟล์นี้ก่อน merge** — โค้ดใหม่เขียน 'set' / 'unchosen' ซึ่ง CHECK เดิมปฏิเสธ (บันทึกชุดของขวัญจะพัง)
--   · โค้ดที่ขึ้นอยู่ตอนนี้ (#2034) เขียนแค่ว่าง | 'pieces' ⇒ รันก่อนได้ ไม่กระทบ
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ✅ รันบนฐานจริงแล้ว 11/11/2026 (CHECK รับ set · pieces · unchosen) — รันซ้ำได้ ไม่มีผล
-- ============================================================

BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_excise_tax_base_ck;
ALTER TABLE public.products
  ADD CONSTRAINT products_excise_tax_base_ck
  CHECK ("exciseTaxBase" IS NULL OR "exciseTaxBase" IN ('set', 'pieces', 'unchosen'));

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'products_excise_tax_base_ck';
--   -- ต้องเห็น 'set', 'pieces', 'unchosen'
--
-- ── ทางกลับ ─────────────────────────────────────────────────────────────
-- (ต้องไม่มีแถวถือ 'set' / 'unchosen' ก่อน)
-- ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_excise_tax_base_ck;
-- ALTER TABLE public.products ADD CONSTRAINT products_excise_tax_base_ck
--   CHECK ("exciseTaxBase" IS NULL OR "exciseTaxBase" = 'pieces');
