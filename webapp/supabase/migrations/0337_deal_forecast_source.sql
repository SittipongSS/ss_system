-- ============================================================
--  Migration 0337: FC ของดีลเดินตามใบเสนอราคาที่อนุมัติแล้ว
--  (มติผู้ใช้ 2026-09-02)
--
--  เดิม `sales_deals."projectValue"` มีที่มาเดียว — ยอดที่ AE กรอกเอง (ผลบวกแถว
--  มูลค่ารายหมวด mig 0264/0265) และเปลี่ยนเป็นยอดใบเสนอราคาก็ต่อเมื่อปิด Won แล้ว
--  เท่านั้น (`accept_quotation_atomic` เขียน `wonValue`) ⇒ ช่วงกลางของดีล คือช่วงที่
--  มีใบเสนอราคาจริงอยู่ในมือแล้วแต่ยังไม่ปิด FC ยังเป็นตัวเลขที่เดาไว้ตั้งแต่ต้น
--
--  หลังไมเกรชันนี้ FC มี **ที่มา** เป็นข้อมูล ไม่ใช่ตัวเลขลอย:
--    forecastSource='manual'    → projectValue = forecastManualValue (ยอดที่ AE กรอก)
--    forecastSource='quotation' → projectValue = ยอด "ก่อน VAT" ของใบที่ชี้อยู่
--                                 (totalAmount - vatAmount ให้เข้าคู่กับ wonValue/Actual)
--
--  ⭐ **`forecastManualValue` คือหัวใจของไมเกรชันนี้** — ยอดที่ AE กรอกถูกเก็บแยก
--     ถาวร ไม่ถูกใบเสนอราคาทับ · ถ้าไม่มีคอลัมน์นี้ ระบบจะ (1) ถอยกลับไป manual ไม่ได้
--     เมื่อใบถูกลบ และ (2) ตอบคำถาม "AE เดาแม่นแค่ไหน" ไม่ได้อีกเลย เพราะยอดที่เดาไว้
--     ถูกยอดเอกสารเขียนทับไปแล้ว
--
--  ⚠️ **ไม่ backfill `forecastSource`** (มติผู้ใช้ 2026-09-02) — วัดของจริงก่อนตัดสิน:
--     ดีลที่ยังเปิด 232 ใบ · 50 ใบมีใบอนุมัติฉบับเดียว ซึ่งถ้าย้าย FC ตามใบทันที
--     ยอดรวมจะกระโดด 11,787,687 → 18,562,464 (+6,774,777 · SV +4.65M · ตุลาคม +4.98M)
--     และ 6 ใบใน 23 ใบนั้น FC จะ **ลดลง** — เคสจริงที่แย่ที่สุดคือ ODM_NOURA_EDP 30 ml
--     FC 250,000 แต่ใบเดียวที่อนุมัติคือใบตัวอย่าง 500 บาท ⇒ ปล่อยอัตโนมัติ = ทุบ FC
--     ทิ้งเงียบ ๆ · ดีลเก่าทุกใบจึงอยู่ที่ 'manual' ด้วยยอดเดิม แล้วให้ AE กดรับทีละใบ
--     จากคิว "FC ไม่ตรงใบเสนอราคา"
--
--  ⚠️ **ไม่แตะ `accept_quotation_atomic` (0284) · `sync_sales_order_actual` (0279) ·
--     trigger 0110** — ดีลที่ปิด Won แล้ว FC แช่แข็ง ตัว resolver ฝั่ง JS คืน no-op
--     เอง จึงไม่ต้องรื้อ RPC 176 บรรทัดที่ถือ approval fingerprint ไว้
--
--  ⚠️ trigger ตัวเดียวในไฟล์นี้เป็น **BEFORE DELETE บน quotations** เท่านั้น และเขียน
--     เฉพาะ 4 คอลัมน์ของ sales_deals (projectValue · forecastSource ·
--     forecastQuotationId · updatedAt) — **ห้ามให้มันแตะ metadata / stage / wonValue
--     เด็ดขาด** เพราะ `sales_deals_enforce_so_actual_trg` (0110) เป็น BEFORE UPDATE OF
--     stage/"wonValue"/metadata ที่มีตัวทำงานแบบไม่มีเงื่อนไข ⇒ แตะเมื่อไร ดีลย้ายระบบ
--     (`metadata.actualSource='legacy'`) จะถูกตีตราใหม่เป็น 'sale_order' แล้ว wonValue
--     ถูกล้างเป็น 0 ถาวร
-- ============================================================

BEGIN;

ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "forecastManualValue" numeric NOT NULL DEFAULT 0
    CHECK ("forecastManualValue" >= 0),
  ADD COLUMN IF NOT EXISTS "forecastSource" text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "forecastQuotationId" text,
  ADD COLUMN IF NOT EXISTS "forecastPinnedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "forecastPinnedBy" text;

-- ด่านแยกคำสั่งเพราะ ADD COLUMN IF NOT EXISTS พา CONSTRAINT มาด้วยไม่ได้เมื่อรันซ้ำ
DO $$
BEGIN
  /* 🔥 เดิมตรงนี้ผูก FK `forecastQuotationId` → quotations(id) ON DELETE SET NULL
     **ถอดออกแล้ว** เพราะทำ production พังทันทีที่ขึ้น (2026-09-02): sales_deals กับ
     quotations กลายเป็นมี FK หากันสองเส้น ⇒ PostgREST เลือกทางเชื่อมไม่ได้ ทุก
     `select('*, deal:sales_deals(*)')` ตอบ "Could not embed because more than one
     relationship was found" ⇒ ทะเบียนใบเสนอราคาว่าง · loadScoped ล้ม · ป้ายเมนูหาย
     ฐานที่รัน 0337 ไปแล้วถอน FK ด้วย **mig 0339** · เหตุผลเต็มอยู่ในไฟล์นั้น
     ความสอดคล้องของตัวชี้ดูแลด้วย trigger ข้างล่าง + CHECK คู่กัน ซึ่งครอบเส้นลบอยู่แล้ว */

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_deals_forecast_source_check'
  ) THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_forecast_source_check
      CHECK ("forecastSource" IN ('manual', 'quotation'));
  END IF;

  /* ตัวชี้กับที่มาต้องมาคู่กันเสมอ — สถานะ ('quotation', NULL) คือ FC ที่อ้างว่ามาจาก
     เอกสารแต่ชี้ไม่ถูกว่าใบไหน อ่านยังไงก็ผิด ⇒ ทำให้เขียนลงฐานไม่ได้ตั้งแต่แรก
     เส้น ON DELETE SET NULL ไม่ชนกฎนี้ เพราะ trigger BEFORE DELETE ข้างล่าง
     ล้างทั้งคู่พร้อมกันไปก่อนแล้ว RI action จึงไม่เจอแถวให้แก้ */
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_deals_forecast_pointer_check'
  ) THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_forecast_pointer_check
      CHECK (("forecastSource" = 'quotation') = ("forecastQuotationId" IS NOT NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.sales_deals."forecastManualValue" IS
  'ยอดคาดการณ์ที่ AE กรอกเอง (ผลบวกแถวมูลค่ารายหมวด) — เก็บถาวร ใบเสนอราคาไม่ทับ · เป็นค่าที่ FC ถอยกลับไปใช้เมื่อออกจากขั้น quotation';
COMMENT ON COLUMN public.sales_deals."forecastSource" IS
  'ที่มาของ projectValue: manual = forecastManualValue · quotation = ยอดก่อน VAT ของ forecastQuotationId';
COMMENT ON COLUMN public.sales_deals."forecastQuotationId" IS
  'ใบเสนอราคาที่ FC เดินตามอยู่ (ฉบับแก้ล่าสุดของเลขที่นั้น) — NULL เสมอเมื่อ forecastSource=manual';
COMMENT ON COLUMN public.sales_deals."forecastPinnedAt" IS
  'เวลาที่คนปักที่มาของ FC ไว้เอง — ปักแล้วระบบจะไม่เลื่อนที่มาให้อัตโนมัติอีก (ยังเดินตาม Rev. ของใบที่ปักไว้)';

CREATE INDEX IF NOT EXISTS sales_deals_forecast_quotation_idx
  ON public.sales_deals ("forecastQuotationId")
  WHERE "forecastQuotationId" IS NOT NULL;

/* backfill เดียวในไฟล์นี้ — ย้ายยอดที่มีอยู่แล้วไปเก็บในช่องของมันเอง
   **ไม่มีตัวเลขไหนบนจอเปลี่ยน**: projectValue คงเดิมทุกแถว forecastSource ยังเป็น
   'manual' ตาม DEFAULT ⇒ FC บริษัท/ทีม/รายคน/รายเดือน เท่าเดิมเป๊ะในวันที่ deploy */
UPDATE public.sales_deals
   SET "forecastManualValue" = COALESCE("projectValue", 0)
 WHERE "forecastManualValue" = 0
   AND COALESCE("projectValue", 0) <> 0;

/* ── ลบใบที่ FC เดินตามอยู่ = ถอย FC กลับไปยอดที่ AE กรอก ────────────────────
 *
 * ทำที่ฐาน ไม่ใช่ที่ route เพราะ PostgREST ไม่มีทรานแซกชันข้ามคำสั่ง — ถ้าปล่อยให้
 * ชั้น API ล้างตัวชี้เอง จังหวะที่ลบใบสำเร็จแล้ว route ตายก่อน จะได้ดีลที่ชี้ใบที่
 * ไม่มีอยู่จริง (บาดแผลเดิมของระบบนี้: mig 0168 — ใบที่ถูก force delete ทิ้งดีลค้าง
 * ที่ Won โดยชี้แถวที่ตายแล้ว)
 *
 * ⚠️ เขียนแค่ 4 คอลัมน์นี้เท่านั้น ห้ามเติม metadata/stage/wonValue (เหตุผลบนหัวไฟล์)
 * ⚠️ ไม่ไต่ขึ้นใบอื่นให้ที่นี่ — SQL ตัวนี้ไม่รู้กติกา eligible/baseNumber/Rev. ซึ่งอยู่
 *    ฝั่ง JS ที่เดียว (lib/sales/forecastSource.js) · route ที่ลบจะเรียก resolver ต่อเอง
 *    ถอยเป็น manual ก่อนเสมอจึงเป็นสถานะที่ปลอดภัยที่สุดถ้า route ตายกลางทาง
 */
CREATE OR REPLACE FUNCTION public.demote_deal_forecast_on_quotation_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sales_deals
     SET "projectValue"        = COALESCE("forecastManualValue", 0),
         "forecastSource"      = 'manual',
         "forecastQuotationId" = NULL,
         "updatedAt"           = now()
   WHERE "forecastQuotationId" = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS quotations_demote_deal_forecast_trg ON public.quotations;
CREATE TRIGGER quotations_demote_deal_forecast_trg
  BEFORE DELETE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.demote_deal_forecast_on_quotation_delete();

COMMIT;

NOTIFY pgrst, 'reload schema';
