-- ============================================================
--  Migration 0362: จุดติดตั้งที่ TS หาไม่เจอหน้างาน — ธงของ TS + ตราปิดจุดของฝ่ายขาย
--                  (มติผู้ใช้ 16/09/2026 ข้อ 23 ส่วน ข1 · บรีฟ §3B ข้อ 23.1/23.3
--                   · เหตุผลปิดจุดไม่บังคับ เคาะ 16/09/2026)
--
--  🐞 **จุดที่ไม่มีอยู่จริงค้างในคิว TS ตลอดกาล** — ใบสั่งขายย้อนหลัง (0360) พก `installationPoint`
--    เป็นข้อความตามชีต ซึ่งตรงกับหน้างานแค่ ~25% · บรรทัดที่ TS หาไม่เจอไม่มีทางออกเลย (คำตอบข้อ 3 ของ P1):
--    ค้างในแท็บ "รอตั้งไซต์/โซน" และนับบนป้ายเมนูไปเรื่อย ๆ · ทางออกที่มีเป็นแบบทั้งใบ (แอดมินลบ / AE Sup ยกเลิก)
--    ซึ่งฆ่ารอบบริการของจุดที่ TS หาเจอในใบเดียวกันไปด้วย
--  🐞 **ข้อเท็จจริงของ TS ไม่เคยเข้าระบบ** — วันนี้ TS บอกฝ่ายขายทาง LINE แล้วจบ ⇒ ไม่มีรายการให้ตาม
--    ไม่มีใครรู้ว่าสัญญาเก่าใบไหนผิดบ้าง และฝ่ายขายแก้เอกสารของตัวเองจากคำบอกเล่า
--
--  ⭐ กติกา
--  · **หนึ่งฝ่ายหนึ่งการกระทำ** — TS แจ้ง (ธง 5 ช่อง) · ฝ่ายขายตัดสิน (ตราปิด 4 ช่อง) · คนละชุดคอลัมน์
--    ไม่ทับกัน ⇒ อ่านจากแถวเดียวรู้ว่าตอนนี้ใครถือลูกอยู่
--  · **เฉพาะใบย้อนหลัง** — บรรทัดไม่มี origin ของตัวเอง ⇒ บังคับด้วย trigger ที่ไล่ขึ้นไปดูใบแม่
--    (CHECK ทำไม่ได้ เพราะมองข้ามตารางไม่เห็น) · ใบ pipeline ติดธงไม่ได้เลยแม้เรียกตรงผ่าน PostgREST
--  · **แจ้งได้เฉพาะจุดที่ยังไม่ผูกโซนเลย** (เคาะ 16/09) — มี service_zone_terms อยู่แล้วแม้แถวเดียว
--    แปลว่า TS หาเจอ ⇒ ปุ่มหาย · กันสภาพลักลั่น "ผูกไปครึ่งหนึ่งแล้วบอกไม่พบ" ที่ทำให้ยอด remaining ค้างครึ่ง ๆ
--    · ทางกลับก็กันด้วย: บรรทัดที่ติดธงอยู่ ผูกโซนใหม่ไม่ได้ (trigger บน service_zone_terms) ⇒ แข่งกันสองทางก็ไม่พัง
--  · **ปิดจุดได้เฉพาะจุดที่ติดธง** (CHECK) · ปิดแล้ว **ไม่แตะยอดใบและงวด** (ข้อ 23.1 — เงินย้อนหลังไม่เข้า Actual
--    อยู่แล้ว · การถอดบรรทัดออกจากใบ + คิดเงินหัวใบใหม่คือ ข2 ยังไม่ทำ)
--  · **แก้ชื่อจุดแล้วส่งกลับ TS** = ล้างธงทั้งชุดแล้วเขียน installationPoint ใหม่ — เป็นข้อยกเว้นเดียวของกติกา
--    "บรรทัดใบสั่งขายเป็นภาพนิ่ง" · ไฟล์นี้ไม่ต้องรู้เรื่องนั้น (ล้างธง = กลับไปสถานะว่าง ซึ่ง CHECK ยอมอยู่แล้ว)
--  · เหตุผลของ TS มี 4 รหัสตายตัว (ไม่มีค่าตั้งต้นบนจอ) · **หมายเหตุบังคับเฉพาะ 'other'** (ข้อ 23.3 —
--    ม็อกวาดบังคับทุกไทล์ ซึ่งขัดกับมติ · มติชนะ) · หมายเหตุตอนปิดจุดของฝ่ายขาย **ไม่บังคับ**
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) sales_order_lines: ธงของ TS 5 ช่อง + ตราปิดของฝ่ายขาย 4 ช่อง + CHECK ครบ-หรือ-ว่างทั้งชุดสองตัว
--  2) trigger กันติดธงผิดที่: ใบต้อง origin = 'historical' · บรรทัดต้องยังไม่มี service_zone_terms
--  3) trigger บน service_zone_terms: บรรทัดที่ติดธงค้างอยู่ ผูกโซนไม่ได้
--
--  ⛔ ไม่แตะ: sales_orders · sales_deals · ตัวคำนวณ Actual/รออนุมัติ · RPC ของ 0360 · สัญญา · งวดชำระ
--     · การถอดบรรทัดออกจากใบและการคิดเงินหัวใบใหม่ (ข2 — รอบหน้า)
--  ⛔ ไม่ backfill — ยังไม่มีใบย้อนหลังบนฐานจริงสักใบ (origin = 'historical' นับได้ 0 แถว ณ 16/09)
--     และคอลัมน์ใหม่ทุกช่องว่างได้ ⇒ บรรทัดเดิม 100% ผ่าน CHECK ทันที
--  ⛔ ทั้ง 9 คอลัมน์ **ไม่ถูกก๊อป** โดย create_sales_order_draft / revise_approved_sales_order_atomic
--     — สองตัวนั้นเขียนรายชื่อคอลัมน์ไว้ตรง ๆ ไม่ใช่ SELECT * ⇒ คอลัมน์ใหม่ไม่ไหลตามเอง และไม่ควรไหล:
--     ใบย้อนหลังออก Rev./คืนเป็นร่างไม่ได้อยู่แล้ว (CHECK sales_orders_origin_shape ของ 0360)
--  🔐 สิทธิ์: REVOKE จาก PUBLIC/anon/authenticated ทุกฟังก์ชันใหม่ (แพตเทิร์น 0336 · trigger function
--     ไม่ต้อง GRANT ให้ service_role — ตัว trigger เรียกเองในสิทธิ์ของเจ้าของตาราง)
--
--  🛑 **รันก่อน merge โค้ด JS ของ P2b** — โค้ด P2b select คอลัมน์ทั้ง 9 ในคิวงานเข้าใหม่ · ป้ายเมนู ·
--     ทะเบียนใบสั่งขาย และหน้าใบ · ขึ้นก่อนรัน = 42703 ⇒ /service/intake · ป้ายเมนูของ TS ·
--     ทะเบียน SO และหน้ารายละเอียด SO ตอบ 500 · CI check:columns แดงจนกว่าจะรัน (ด่านนั้นอ่านสคีมาจริง)
--     รันล่วงหน้านานเท่าไรก็ปลอดภัย: ทุกช่องว่างได้ ไม่มีตัวเขียนเดิมตัวไหนแตะคอลัมน์เหล่านี้
--  ⚠️ DDL — รันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ (ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT/TRIGGER IF EXISTS แล้วสร้างใหม่
--     ⇒ นิยามบนฐานตรงกับไฟล์เสมอ ไม่ใช่ข้ามเงียบเพราะชื่อซ้ำ · CREATE OR REPLACE FUNCTION)
--
--  ── ลองก่อนรันจริง (ไม่ทิ้งของ — บล็อกจบด้วย ROLLBACK) ──────────────────────────
--  ทางที่ 1 (ก่อนรันไฟล์นี้): คัดทั้งไฟล์ไปวาง แล้วแทน `COMMIT;` ท้ายข้อ 3 ด้วยบล็อก "ลองจริง" ข้างล่าง
--  ทางที่ 2 (หลังรันไฟล์นี้แล้ว): รันบล็อก "ลองจริง" ทั้งก้อน โดยนำหน้าด้วย BEGIN;
--  บล็อกนี้สร้างใบ pipeline ปลอมไม่ได้ (CHECK ของ 0360 บังคับ quotationId) ⇒ ใช้บรรทัดของใบ pipeline
--  ที่มีอยู่จริงแถวแรกมาทดสอบด่าน "เฉพาะใบย้อนหลัง" แล้ว ROLLBACK ทิ้ง
--
--   DO $$
--   DECLARE v_line text;
--   BEGIN
--     SELECT l.id INTO v_line FROM public.sales_order_lines l
--       JOIN public.sales_orders o ON o.id = l."salesOrderId" AND o.origin = 'pipeline' LIMIT 1;
--     BEGIN UPDATE public.sales_order_lines SET "siteNotFoundAt" = now(), "siteNotFoundById" = 'smoke',
--             "siteNotFoundByName" = 'smoke 0362', "siteNotFoundReason" = 'branch_closed' WHERE id = v_line;
--           RAISE EXCEPTION 'SMOKE FAIL 1'; EXCEPTION WHEN raise_exception THEN
--             IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 1: %', SQLERRM; END;
--     BEGIN UPDATE public.sales_order_lines SET "siteNotFoundAt" = now(), "siteNotFoundById" = 'smoke',
--             "siteNotFoundReason" = 'other' WHERE id = v_line;
--           RAISE EXCEPTION 'SMOKE FAIL 2'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok 2: %', SQLERRM;
--             WHEN raise_exception THEN IF SQLERRM LIKE 'SMOKE FAIL%' THEN RAISE; END IF; RAISE NOTICE 'ok 2: %', SQLERRM; END;
--     BEGIN UPDATE public.sales_order_lines SET "siteClosedAt" = now(), "siteClosedById" = 'smoke' WHERE id = v_line;
--           RAISE EXCEPTION 'SMOKE FAIL 3'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok 3: %', SQLERRM; END;
--   END $$;                                                          -- คาด NOTICE ok 1 · ok 2 · ok 3
--   ROLLBACK;
--
--  ── ตรวจหลังรัน ─────────────────────────────────────────────────────────────
--   SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
--     AND table_name = 'sales_order_lines' AND column_name IN ('siteNotFoundAt','siteNotFoundById',
--     'siteNotFoundByName','siteNotFoundReason','siteNotFoundNote','siteClosedAt','siteClosedById',
--     'siteClosedByName','siteClosedNote');                                                   -- คาด 9
--   SELECT conname FROM pg_constraint WHERE conname IN ('sales_order_lines_site_not_found_sane',
--     'sales_order_lines_site_closed_sane');                                                  -- คาด 2 แถว
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('sales_order_lines_site_flag_guard_trg',
--     'service_zone_terms_site_flag_guard_trg');                                              -- คาด 2 แถว
--   SELECT count(*) FROM public.sales_order_lines WHERE "siteNotFoundAt" IS NOT NULL;         -- คาด 0
--   SELECT r.role, has_function_privilege(r.role, f.sig, 'EXECUTE')
--     FROM (VALUES ('anon'), ('authenticated')) AS r(role),
--          (VALUES ('public.guard_sales_order_line_site_flags()'),
--                  ('public.guard_zone_term_site_not_found()')) AS f(sig);
--                                                     -- anon/authenticated = false ทั้ง 4
--   แล้วรัน `npm run check:columns` กับ `npm run check:rowcap` ในเครื่อง (ต้องเขียวก่อน merge คอมมิต JS)
-- ============================================================

BEGIN;

-- ── 1) sales_order_lines: ธงของ TS + ตราปิดของฝ่ายขาย ─────────────────────────
-- ⚠️ ต้องเป็นคำสั่ง ALTER TABLE เดียว นอก DO/EXECUTE — ยาม siteNotFoundMigration.test.mjs อ่านคอลัมน์
--    ของ sales_order_lines จากรูปประโยคนี้ แล้วบังคับให้ทุกคอลัมน์ถูกตัดสินว่าทางก๊อป Rev./ใบร่างพาไปหรือไม่
ALTER TABLE public.sales_order_lines ADD COLUMN IF NOT EXISTS "siteNotFoundAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "siteNotFoundById" text,
  ADD COLUMN IF NOT EXISTS "siteNotFoundByName" text,
  ADD COLUMN IF NOT EXISTS "siteNotFoundReason" text,
  ADD COLUMN IF NOT EXISTS "siteNotFoundNote" text,
  ADD COLUMN IF NOT EXISTS "siteClosedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "siteClosedById" text,
  ADD COLUMN IF NOT EXISTS "siteClosedByName" text,
  ADD COLUMN IF NOT EXISTS "siteClosedNote" text;

-- ธงของ TS: ว่างทั้งชุด หรือ มีเวลา + ผู้แจ้ง + รหัสเหตุผลใน 4 ตัว · หมายเหตุบังคับเฉพาะ 'other'
-- (ความยาวหมายเหตุ 1–500 เท่าเหตุผลยกเว้นด่านเงินของ 0360 ฝั่งบน — ฝั่งล่างไม่มีขั้นต่ำ 10
--  เพราะ "ไม่มีป้ายชื่อที่ประตู" เป็นคำตอบที่ครบแล้ว ไม่ควรถูกบังคับให้เขียนยาว)
ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_site_not_found_sane;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_site_not_found_sane CHECK (
    (
      "siteNotFoundAt" IS NULL AND "siteNotFoundById" IS NULL
      AND "siteNotFoundByName" IS NULL AND "siteNotFoundReason" IS NULL AND "siteNotFoundNote" IS NULL
    )
    OR (
      "siteNotFoundAt" IS NOT NULL AND "siteNotFoundById" IS NOT NULL
      AND "siteNotFoundReason" IN ('name_mismatch', 'branch_closed', 'customer_dropped', 'other')
      AND ("siteNotFoundNote" IS NULL OR length(btrim("siteNotFoundNote")) BETWEEN 1 AND 500)
      AND ("siteNotFoundReason" <> 'other' OR length(btrim(coalesce("siteNotFoundNote", ''))) BETWEEN 1 AND 500)
    )
  );

-- ตราปิดจุดของฝ่ายขาย: ว่างทั้งชุด หรือ มีเวลา + ผู้ตัดสิน **และต้องมีธงของ TS อยู่ก่อน**
-- (ปิดจุดที่ไม่มีใครแจ้ง = ฝ่ายขายตัดจุดของตัวเองเงียบ ๆ ซึ่งไม่ใช่เส้นทางของมติข้อ 23)
ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_site_closed_sane;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_site_closed_sane CHECK (
    (
      "siteClosedAt" IS NULL AND "siteClosedById" IS NULL
      AND "siteClosedByName" IS NULL AND "siteClosedNote" IS NULL
    )
    OR (
      "siteClosedAt" IS NOT NULL AND "siteClosedById" IS NOT NULL
      AND "siteNotFoundAt" IS NOT NULL
      AND ("siteClosedNote" IS NULL OR length(btrim("siteClosedNote")) BETWEEN 1 AND 500)
    )
  );

COMMENT ON COLUMN public.sales_order_lines."siteNotFoundAt" IS
  'เวลาที่ TS แจ้งว่าไม่พบจุดติดตั้งนี้หน้างาน — ว่าง = ยังไม่มีใครแจ้ง (มติข้อ 23 · mig 0362)';
COMMENT ON COLUMN public.sales_order_lines."siteNotFoundReason" IS
  'รหัสเหตุผลของ TS: name_mismatch | branch_closed | customer_dropped | other — หมายเหตุบังคับเฉพาะ other (มติข้อ 23.3 · mig 0362)';
COMMENT ON COLUMN public.sales_order_lines."siteClosedAt" IS
  'เวลาที่ฝ่ายขายตัดสิน "ปิดจุดนี้ ไม่ต้องผูก (เก็บยอด)" — จุดนี้ไม่กลับเข้าคิว TS อีก · ยอดใบและงวดไม่ถูกแตะ (มติข้อ 23.1 · mig 0362)';

-- ── 2) ธงติดได้เฉพาะบรรทัดของใบย้อนหลังที่ยังไม่ผูกโซนเลย ─────────────────────
CREATE OR REPLACE FUNCTION public.guard_sales_order_line_site_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- ตรวจเฉพาะ "ตอนติดธงใหม่" — ล้างธง (แก้ชื่อส่งกลับ) และการแก้ช่องอื่นของแถวที่ติดธงอยู่แล้ว ผ่านได้เสมอ
  IF NEW."siteNotFoundAt" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."siteNotFoundAt" IS NULL) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sales_orders so
       WHERE so.id = NEW."salesOrderId" AND so.origin = 'historical'
    ) THEN
      RAISE EXCEPTION 'site_not_found_historical_only: %', NEW.id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.service_zone_terms t WHERE t."salesOrderLineId" = NEW.id
    ) THEN
      RAISE EXCEPTION 'site_not_found_line_allocated: %', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sales_order_line_site_flags() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_order_lines_site_flag_guard_trg ON public.sales_order_lines;
CREATE TRIGGER sales_order_lines_site_flag_guard_trg
BEFORE INSERT OR UPDATE OF "siteNotFoundAt" ON public.sales_order_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_line_site_flags();

-- ── 3) บรรทัดที่ติดธงค้างอยู่ ผูกโซนไม่ได้ ────────────────────────────────────
-- 🪤 ด่านของข้อ 2 อ่าน service_zone_terms ตอนติดธง · ด่านนี้อ่านธงตอนผูกโซน ⇒ TS สองคนกดพร้อมกัน
--    คนหลังชนเสมอ ไม่ว่าจะกดทางไหนก่อน (คิวและยอด remaining จึงไม่มีทางค้างครึ่ง ๆ)
CREATE OR REPLACE FUNCTION public.guard_zone_term_site_not_found()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."salesOrderLineId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_order_lines l
     WHERE l.id = NEW."salesOrderLineId" AND l."siteNotFoundAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'zone_term_line_site_not_found: %', NEW."salesOrderLineId";
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_zone_term_site_not_found() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS service_zone_terms_site_flag_guard_trg ON public.service_zone_terms;
CREATE TRIGGER service_zone_terms_site_flag_guard_trg
BEFORE INSERT OR UPDATE OF "salesOrderLineId" ON public.service_zone_terms
FOR EACH ROW EXECUTE FUNCTION public.guard_zone_term_site_not_found();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ถอยกลับ (ใช้ได้เฉพาะตอนยังไม่มีแถวที่ "siteNotFoundAt" ไม่ว่าง) ───────────────
--   DROP TRIGGER service_zone_terms_site_flag_guard_trg ON public.service_zone_terms;
--   DROP TRIGGER sales_order_lines_site_flag_guard_trg ON public.sales_order_lines;
--   DROP FUNCTION public.guard_zone_term_site_not_found();
--   DROP FUNCTION public.guard_sales_order_line_site_flags();
--   ALTER TABLE public.sales_order_lines
--     DROP CONSTRAINT sales_order_lines_site_closed_sane,
--     DROP CONSTRAINT sales_order_lines_site_not_found_sane,
--     DROP COLUMN "siteNotFoundAt", DROP COLUMN "siteNotFoundById", DROP COLUMN "siteNotFoundByName",
--     DROP COLUMN "siteNotFoundReason", DROP COLUMN "siteNotFoundNote",
--     DROP COLUMN "siteClosedAt", DROP COLUMN "siteClosedById", DROP COLUMN "siteClosedByName",
--     DROP COLUMN "siteClosedNote";
