-- 0420 — (เดิมเลข 0419 · ชนกับ 0419_product_bom_handoff ซึ่งรันบน prod ไปก่อนแล้ว 03/11 จึงเลื่อน) "ไม่เรียกเก็บในระบบ" เหตุใหม่: จ่ายกรมสรรพสามิตไปแล้วก่อนเปิดระบบ (แผนรื้อสรรพสามิต หมวด 12.10 · มติเจ้าของ 03/11 V16–V18)
--
--  SO ลูกค้าบางใบ RA ยื่นและชำระภาษีกับกรมไปแล้วก่อนระบบใบค่าสรรพสามิตเปิด (03/11/2026) — ไม่ต้องออกใบค่าสรรพสามิต
--  และไม่ต้องเข้าคิวยื่นของ RA อีก ⇒ SA ติ๊กบนหน้า SO (V16) · กรอกเหตุผลอย่างเดียว เลขอ้างอิงไม่บังคับ (V17) ·
--  ใช้ได้เฉพาะ SO ที่อนุมัติก่อน 03/11 ตามเวลาไทย (V18 — กันกดผิดกับใบใหม่ · ด่านในแอปตัวเดียวกันอยู่ที่ exciseNotBilledBlocker)
--
--  เปลี่ยน CHECK `sales_orders_excise_not_billed_shape` (0414): เติมชนิด 'paid_before_launch' + ชนิดนี้ต้อง "approvedAt" < 2026-11-03 00:00 น. ไทย
--  ⚠️ ชนิดอื่นเงื่อนไขเดิมทุกตัวอักษร · ไม่แตะ RPC (0415/0418 ปฏิเสธรับใบค่าสรรพสามิตเมื่อ SO มีคำตัดสินใด ๆ อยู่แล้ว)
--
--  🛑 รันไฟล์นี้ก่อน merge PR ของงานนี้ — โค้ดชุดนั้นเขียนชนิดใหม่ · รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม (ไม่เคยเขียนชนิดนี้)
--  ✅ รันซ้ำได้ (DROP IF EXISTS แล้วสร้างใหม่)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: chk = 1 · has_kind = true · bad_rows = 0 ──
--   SELECT
--    (SELECT count(*) FROM pg_constraint WHERE convalidated AND conname = 'sales_orders_excise_not_billed_shape') AS chk,
--    (SELECT strpos(pg_get_constraintdef(oid), 'paid_before_launch') > 0 FROM pg_constraint
--      WHERE conname = 'sales_orders_excise_not_billed_shape') AS has_kind,
--    (SELECT count(*) FROM public.sales_orders WHERE "exciseNotBilledKind" = 'paid_before_launch'
--      AND ("approvedAt" IS NULL OR "approvedAt" >= '2026-11-03 00:00:00+07')) AS bad_rows;
--
--  ── ถอยกลับ (ใช้ได้ตราบที่ไม่มีแถวชนิดนี้) ─────────────────────────────────────────────
--   BEGIN;
--   DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.sales_orders WHERE "exciseNotBilledKind" = 'paid_before_launch')
--     THEN RAISE EXCEPTION 'paid_before_launch rows exist'; END IF; END $$;
--   -- แล้วรันส่วน CHECK ของ 0414 ซ้ำ (ชนิด 'collected_outside', 'included_in_price', 'not_liable')
--   COMMIT;

BEGIN;

ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_excise_not_billed_shape;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_excise_not_billed_shape CHECK (
    (
      "exciseNotBilledKind" IS NULL AND "exciseNotBilledReason" IS NULL AND "exciseNotBilledRef" IS NULL
      AND "exciseNotBilledAt" IS NULL AND "exciseNotBilledById" IS NULL AND "exciseNotBilledByName" IS NULL
    )
    OR (
      origin = 'pipeline'
      AND "exciseNotBilledKind" IN ('collected_outside', 'included_in_price', 'not_liable', 'paid_before_launch')
      AND char_length(btrim("exciseNotBilledReason")) BETWEEN 10 AND 500
      AND ("exciseNotBilledRef" IS NULL OR char_length("exciseNotBilledRef") <= 100)
      AND "exciseNotBilledAt" IS NOT NULL
      AND "exciseNotBilledById" IS NOT NULL
      -- V18: จ่ายกรมไปแล้วก่อนเปิดระบบ = เฉพาะใบที่อนุมัติก่อนวันเปิดระบบ (03/11/2026 เวลาไทย)
      AND ("exciseNotBilledKind" <> 'paid_before_launch'
           OR ("approvedAt" IS NOT NULL AND "approvedAt" < '2026-11-03 00:00:00+07'))
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
