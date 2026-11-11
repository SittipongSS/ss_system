-- ============================================================
--  Migration 0433: ชุดของขวัญ — แถวในชุดไม่บังคับสูตร + เก็บวิธีแจ้งราคาขายปลีกทุกชุด
--
--  ⭐ มติเจ้าของ 11/11/2026 (รอบสองของฟอร์มสินค้า · docs/product-form-rework.md R1–R4):
--     R2 "สูตรเกี่ยวข้องกับแค่การลง BOM" ⇒ แถวในชุดบังคับแค่หมวด + จำนวนชิ้น · สูตรไม่บังคับตอนบันทึก
--        ไปบังคับตอนส่งลง BOM (ทุกแถวต้องมีสูตร) · สรรพสามิตดูจากหมวดของแถวอยู่แล้ว (G1) ไม่ต้องรอสูตร
--     R3 ชุดของขวัญทุกชุด (มีน้ำหอมหรือไม่ก็ตาม) เลือก "รวมชุด / รายชิ้น" ได้ — "มันก็มีหลายสินค้าในนั้น"
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--   1) product_formulas."formulaId" ว่างได้ (เดิม NOT NULL · 0403)
--      · UNIQUE ("productId", "formulaId") คงเดิม — NULL หลายแถวในชุดเดียวไม่ชนกัน (NULLS DISTINCT ค่าตั้งต้น)
--      · FK → formulas ON DELETE CASCADE คงเดิม · RPC replace_product_formulas ไม่ต้องแก้ (ส่ง null ผ่านได้อยู่แล้ว)
--   2) products."giftSetPriceMode" ('set' | 'pieces' | ว่าง) = วิธีแจ้งราคาที่ฝ่ายขายเลือก — **ทุกชุด**
--      · "exciseTaxBase" (0430/0431) ยังเป็นค่าฝั่งภาษีที่แอปคิดให้: ชุดที่เสียภาษี = โหมดนี้ หรือ 'unchosen' · ไม่เสีย = ว่าง
--        (เดิมชุดที่ไม่เสียภาษีถูกล้างค่าทิ้งตอนบันทึก ⇒ เลือกรายชิ้นไว้ก็หาย)
--
--  ── ผลต่อข้อมูลเดิม ──────────────────────────────────────────────────────
--   ณ 11/11 ไม่มีสินค้าตัวไหนถือ "exciseTaxBase" (ตรวจแล้วว่าง) · แถวสูตรเดิม 7 แถว (2 ชุด) มีสูตรครบทุกแถว
--   ⭐ backfill ชุดที่มีราคาขายปลีกทั้งชุดอยู่แล้วแต่ไม่มีโหมด ⇒ 'set' (ณ 11/11 มีตัวเดียว: FG-518-01-037-1900 · 990 บาท ·
--      น้ำหอมล้วน 5 สูตร · เสียภาษี) — ตัวนี้คิดภาษีจากราคาทั้งชุดมาตลอด (โหมดว่าง = ใช้ราคาของสินค้า)
--      ไม่ backfill = เปิดแก้แล้วกดบันทึกครั้งหน้า จอเห็น "ยังไม่เลือก" ⇒ บันทึกเป็น 'unchosen' ⇒ ภาษีกลายเป็น 0 เงียบ ๆ
--      (R1 เลิกบังคับเลือกตอนบันทึกแล้ว ไม่มีด่านตีกลับให้เห็น)
--
--  ── ลำดับรันกับ deploy ────────────────────────────────────────────────────
--   **รันไฟล์นี้ก่อน merge** — โค้ดใหม่อ่าน/เขียน "giftSetPriceMode" ทุกครั้งที่เปิด/บันทึกสินค้าหมวด 01-037
--   และส่งแถวที่ยังไม่เลือกสูตร (formulaId ว่าง) ซึ่ง NOT NULL เดิมปฏิเสธ
--   · โค้ดที่ขึ้นอยู่ตอนนี้ (#2037) ไม่รู้จักคอลัมน์ใหม่และส่งสูตรครบทุกแถวเสมอ ⇒ รันก่อนได้ ไม่กระทบ
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ✅ รันบนฐานจริงแล้ว 11/11/2026 (formulaId ว่างได้ · CHECK set/pieces · FG-518-01-037-1900 = set/set ภาษีเดิม 81.42/ชุด) — รันซ้ำได้ ไม่มีผล
-- ============================================================

BEGIN;

ALTER TABLE public.product_formulas ALTER COLUMN "formulaId" DROP NOT NULL;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "giftSetPriceMode" text;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_gift_set_price_mode_ck;
ALTER TABLE public.products
  ADD CONSTRAINT products_gift_set_price_mode_ck
  CHECK ("giftSetPriceMode" IS NULL OR "giftSetPriceMode" IN ('set', 'pieces'));

UPDATE public.products
   SET "giftSetPriceMode" = "exciseTaxBase"
 WHERE "exciseTaxBase" IN ('set', 'pieces') AND "giftSetPriceMode" IS NULL;

-- ชุดที่มีราคาทั้งชุดแต่ไม่มีโหมด = รวมชุด (คิดภาษีจากราคานี้มาตลอด) — ดูหัวไฟล์
UPDATE public.products
   SET "giftSetPriceMode" = 'set',
       "exciseTaxBase" = CASE WHEN "isExciseTaxable" AND "exciseTaxBase" IS NULL THEN 'set' ELSE "exciseTaxBase" END
 WHERE "categoryCode" = '01-037' AND "giftSetPriceMode" IS NULL AND "retailPriceIncVat" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT
--   (SELECT is_nullable FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'product_formulas' AND column_name = 'formulaId') AS formula_nullable,  -- YES
--   (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'products_gift_set_price_mode_ck') AS mode_check,  -- 'set', 'pieces'
--   (SELECT string_agg("fgCode" || ' ' || "giftSetPriceMode" || '/' || coalesce("exciseTaxBase", '-'), ', ')
--      FROM public.products WHERE "giftSetPriceMode" IS NOT NULL) AS with_mode;                                          -- FG-518-01-037-1900 set/set
