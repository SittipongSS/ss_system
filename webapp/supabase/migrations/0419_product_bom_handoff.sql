-- 0419 — ส่ง FG ให้ RD ลง BOM (ใน Express): สถานะ BOM อยู่บนแถวสินค้า (มติเจ้าของ 03/11/2026 · docs/fg-bom-handoff-plan.md)
--
--  ⭐ ขั้นของ RD = **คอลัมน์บนสินค้าเดิม ไม่ใช่เอกสารใหม่** (กฎสามชั้น · docs/module-ownership-rule.md)
--     BOM ลงในโปรแกรม Express (นอกระบบ) — ระบบนี้ติดตามแค่ "ส่งแล้วหรือยัง · RD ลงเสร็จหรือยัง"
--
--  สถานะ (`bomStatus`):
--    NULL         = ยังไม่ส่ง (FG เก่าทุกตัวเริ่มที่นี่ · ไม่ backfill — มติข้อ 8)
--    queued       = ส่งแล้ว รอ RD รับเรื่อง (SA ดึงกลับได้)
--    in_progress  = RD รับเรื่องแล้ว กำลังลง
--    returned     = RD ตีกลับพร้อมเหตุผล — SA แก้แล้วส่งใหม่
--    done         = ลง BOM ใน Express เสร็จ (รหัส BOM ไม่บังคับ)
--  ⚠️ ทางเดินสถานะ + ด่าน + ช่องที่ล็อก อยู่ในแอปที่ `src/lib/master/productBom.js` ที่เดียว ·
--     ที่นี่กันแค่ค่าที่ไม่มีในทะเบียน
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน merge** — โค้ดชุดนี้เลือกคอลัมน์เหล่านี้ทุกครั้งที่อ่านคิว RD
--     รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม (ไม่มีใครอ่าน/เขียนคอลัมน์ใหม่)
--  ✅ รันซ้ำได้ (IF NOT EXISTS)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: cols = 17 · status_check = 1 · idx = 1 · not_null_rows = 0 ──
--   SELECT
--    (SELECT count(*) FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'products' AND column_name LIKE 'bom%') AS cols,
--    (SELECT count(*) FROM pg_constraint WHERE conname = 'products_bom_status_check') AS status_check,
--    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'products_bom_status_idx') AS idx,
--    (SELECT count(*) FROM public.products WHERE "bomStatus" IS NOT NULL) AS not_null_rows;
--
--  ── ถอยกลับ (ใช้ได้ตราบที่ยังไม่มีใครส่ง — ถอยหลังมีการส่งแล้ว = ประวัติ BOM หายทั้งชุด เหลือแค่เธรด/audit) ──
--   BEGIN;
--   DROP INDEX IF EXISTS public.products_bom_status_idx;
--   ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_bom_status_check;
--   ALTER TABLE public.products
--     DROP COLUMN IF EXISTS "bomStatus", DROP COLUMN IF EXISTS "bomRound",
--     DROP COLUMN IF EXISTS "bomSentAt", DROP COLUMN IF EXISTS "bomSentBy", DROP COLUMN IF EXISTS "bomSentByName",
--     DROP COLUMN IF EXISTS "bomAcceptedAt", DROP COLUMN IF EXISTS "bomAcceptedBy", DROP COLUMN IF EXISTS "bomAcceptedByName",
--     DROP COLUMN IF EXISTS "bomReturnedAt", DROP COLUMN IF EXISTS "bomReturnedByName", DROP COLUMN IF EXISTS "bomReturnReason",
--     DROP COLUMN IF EXISTS "bomDoneAt", DROP COLUMN IF EXISTS "bomDoneBy", DROP COLUMN IF EXISTS "bomDoneByName",
--     DROP COLUMN IF EXISTS "bomCode", DROP COLUMN IF EXISTS "bomNote", DROP COLUMN IF EXISTS "bomUpdatedAt";
--   COMMIT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "bomStatus" text,
  -- ส่งมาแล้วกี่รอบ (ส่งใหม่หลังตีกลับ = รอบถัดไป) — คิว RD บอกได้ว่าเป็นของที่เคยตีกลับ
  ADD COLUMN IF NOT EXISTS "bomRound" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bomSentAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "bomSentBy" text,
  ADD COLUMN IF NOT EXISTS "bomSentByName" text,
  ADD COLUMN IF NOT EXISTS "bomAcceptedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "bomAcceptedBy" text,
  ADD COLUMN IF NOT EXISTS "bomAcceptedByName" text,
  ADD COLUMN IF NOT EXISTS "bomReturnedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "bomReturnedByName" text,
  ADD COLUMN IF NOT EXISTS "bomReturnReason" text,
  ADD COLUMN IF NOT EXISTS "bomDoneAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "bomDoneBy" text,
  ADD COLUMN IF NOT EXISTS "bomDoneByName" text,
  -- รหัส/เลข BOM ใน Express — ไม่บังคับ (มติข้อ 7) · ไม่ unique: เลขมาจากระบบนอก
  ADD COLUMN IF NOT EXISTS "bomCode" text,
  ADD COLUMN IF NOT EXISTS "bomNote" text,
  -- เวลาที่สถานะ BOM ขยับล่าสุด — แยกจาก `updatedAt` ของสินค้า (ปุ่ม BOM ไม่ใช่การแก้สินค้า)
  ADD COLUMN IF NOT EXISTS "bomUpdatedAt" timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_bom_status_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_bom_status_check
      CHECK ("bomStatus" IS NULL OR "bomStatus" IN ('queued', 'in_progress', 'returned', 'done'));
  END IF;
END $$;

-- คิว RD + ป้ายนับบนเมนูอ่านเฉพาะแถวที่ส่งแล้ว — FG ส่วนใหญ่เป็น NULL ตลอดกาล
CREATE INDEX IF NOT EXISTS products_bom_status_idx
  ON public.products ("bomStatus") WHERE "bomStatus" IS NOT NULL;
