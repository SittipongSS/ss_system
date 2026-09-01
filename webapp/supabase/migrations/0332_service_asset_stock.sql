-- ============================================================
--  Migration 0332: ที่อยู่ของเครื่องที่ยังไม่ได้ติดตั้ง (ทะเบียนเครื่อง เฟส A)
--  ม็อก ~/ss-team/mockups/machine-registry · มติผู้ใช้ 2026-09-01 ข้อ 2 และ 3
--
--  ⭐ ที่มา: ชีต Stock-Machine.xlsx มีเครื่อง 1,239 ตัว — **343 ตัวอยู่ในคลัง**
--    (Brand="ออฟฟิศ") ซึ่งระบบวันนี้เก็บไม่ได้เลย เพราะ `service_assets."siteId"`
--    เป็น NOT NULL และ 0187 เขียนเหตุผลไว้ว่า "เครื่องไม่มีความหมายนอกไซต์"
--    ⇒ โมเดลเดิมคือ **ทะเบียนเครื่อง ณ จุดติดตั้ง** ไม่ใช่ **คลังเครื่อง**
--
--  ⭐ ทางที่เลือก (มติข้อ 2 · ทาง ข): **คลังเป็นไซต์จริงหนึ่งใบ** ไม่ใช่ปล่อย siteId ว่าง
--    เหตุผลที่ไม่เลือก "siteId เป็น NULL ได้":
--      · API ของเครื่องทั้งหมดอยู่ใต้ /api/service/sites/[id]/assets/ ⇒ เครื่องที่ไม่มี
--        ไซต์ **ไม่มี URL อยู่จริงในระบบ** ต้องออก route ชุดที่สองทั้งชุด
--      · "ตั้งใจเก็บเข้าคลัง" กับ "บั๊กลืมเซ็ต siteId" หน้าตาเหมือนกันเป๊ะระดับแถว
--    ⇒ ใบนี้ **ไม่แตะรูปทรงแถวเครื่องเลย** — route/URL/FK/หน้ารายละเอียดเดิมใช้ได้หมด
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy** (โค้ดใหม่อ่าน `kind`
--    ของไซต์และ `condition` ของเครื่อง — ไม่มีคอลัมน์ = ทุกหน้าที่แตะเครื่องพัง)
-- ============================================================

BEGIN;

-- ── 1) ประเภทของไซต์ — แยก "คลังของเรา" ออกจาก "ไซต์ลูกค้า" ────────────────
--
-- 🔴 **ห้ามแยกด้วย `customerId`/`arCode`** — บริษัทตัวเอง (AR-000) มีไซต์จริงที่มี
--   เครื่องตั้งใช้งานอยู่ด้วย (`ST-0000-01-BKK-1001` Scent and Sense Office)
--   ถ้าแยกด้วยเจ้าของ เครื่องที่ออฟฟิศตัวเองจะถูกนับเป็นสต๊อกทันที
-- ⚠️ ค่าตั้งต้น 'customer' ⇒ ไซต์เดิมทุกใบยังเป็นไซต์ลูกค้าเหมือนเดิม ไม่ต้อง backfill
ALTER TABLE public.service_sites
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'customer';

ALTER TABLE public.service_sites DROP CONSTRAINT IF EXISTS service_sites_kind_check;
ALTER TABLE public.service_sites
  ADD CONSTRAINT service_sites_kind_check CHECK (kind IN ('customer', 'warehouse'));

COMMENT ON COLUMN public.service_sites.kind IS
  'customer = ไซต์ลูกค้า · warehouse = คลังเครื่องของเรา (mig 0332) — ตัวแยกกองสต๊อก '
  'ห้ามใช้ customerId/arCode แยกแทน: บริษัทตัวเองมีไซต์ลูกค้าจริงด้วย';

-- ── 2) สถานะเครื่อง: เพิ่ม in_stock · removed เปลี่ยนความหมาย ───────────────
--
-- ⭐ พอคลังเป็นไซต์ **"ถอดจากหน้างาน" ไม่ใช่สถานะอีกต่อไป** มันคือการย้ายไซต์
--   (ลูกค้า → คลัง) ⇒ "อยู่ที่ไหน" ตอบด้วย `siteId` ช่องเดียว ไม่มีสองแหล่งขัดกัน
--   `removed` จึงเหลือความหมายเดียว: **ปลดระวาง** (เลิกใช้ถาวร)
-- ⚠️ ตารางมี 0 แถวบนคลาวด์ ⇒ ไม่มีข้อมูลเก่าที่ต้องแปลความหมาย
ALTER TABLE public.service_assets DROP CONSTRAINT IF EXISTS service_assets_status_check;
ALTER TABLE public.service_assets
  ADD CONSTRAINT service_assets_status_check
  CHECK (status IN ('active', 'in_stock', 'repair', 'removed'));

COMMENT ON COLUMN public.service_assets.status IS
  'active=ใช้งาน · in_stock=อยู่ในคลัง · repair=ส่งซ่อม · removed=ปลดระวาง (mig 0332) '
  'ป้ายไทยอยู่ที่ lib/service/sites.js — เพิ่มค่าใหม่ต้องแก้ CHECK ใบนี้ด้วยเสมอ';

-- ── 3) สภาพเครื่อง — แกนที่สอง แยกจาก "อยู่ขั้นไหน" ────────────────────────
--
-- ⭐ ชีตเองแยกไว้สองคอลัมน์อยู่แล้ว (`สถานะ` ปกติ/ชำรุด กับ `การใช้งาน` ใช้/ไม่ใช้)
--   และสองอย่างนี้ตัดกันได้จริง: **เครื่องเสียขณะยังตั้งอยู่หน้างาน** เป็นเรื่องที่
--   แกนเดียวเล่าไม่ได้ — ต้องเลือกระหว่าง active กับ broken แล้วอีกความจริงหายไป
--   และตัวนับ "เครื่องที่ใช้งานอยู่" ของไซต์จะกระโดดทันทีที่มีคนแจ้งว่าเสีย
--   ทั้งที่เครื่องยังอยู่ที่เดิมและยังไม่มีใครไปเก็บ
-- ⚠️ ซื่อสัตย์: ในชีตวันนี้ยังมี **0 แถว** ที่เป็น active+broken (ชำรุดทั้ง 40 ตัว
--   อยู่ที่ออฟฟิศหมด) ⇒ แกนที่สองคือประกันราคาถูกสำหรับวันที่มีคนแจ้งเครื่องหน้างานเสีย
ALTER TABLE public.service_assets
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'ok';

ALTER TABLE public.service_assets DROP CONSTRAINT IF EXISTS service_assets_condition_check;
ALTER TABLE public.service_assets
  ADD CONSTRAINT service_assets_condition_check CHECK (condition IN ('ok', 'broken'));

COMMENT ON COLUMN public.service_assets.condition IS
  'สภาพตัวเครื่อง ok/broken — คนละแกนกับ status ที่บอกว่าอยู่ขั้นไหน (mig 0332) '
  'เครื่องเสียแต่ยังตั้งอยู่หน้างาน = active + broken';

-- ── 4) วันที่รับเครื่องเข้าคลัง ────────────────────────────────────────────
--
-- ⚠️ **คนละช่องกับ `installedAt`** — ชีตมีทั้ง "วันที่นำเข้า" (ได้เครื่องมา) และ
--   "วันที่เริ่มใช้งาน" (เอาไปติดตั้ง) ซึ่งต่างกันเป็นปีในหลายแถว
--   เครื่องในคลังมีวันแรกแต่ไม่มีวันสอง ⇒ ยัดรวมช่องเดียวคืออายุใช้งานที่โกหก
ALTER TABLE public.service_assets
  ADD COLUMN IF NOT EXISTS "receivedAt" date;

ALTER TABLE public.service_assets DROP CONSTRAINT IF EXISTS service_assets_received_sane;
ALTER TABLE public.service_assets
  ADD CONSTRAINT service_assets_received_sane
  CHECK ("receivedAt" IS NULL OR "receivedAt" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');

COMMENT ON COLUMN public.service_assets."receivedAt" IS
  'วันที่รับเครื่องเข้าคลัง (ชีต: "วันที่นำเข้า") — คนละเรื่องกับ installedAt ที่เป็นวันเอาไปติดตั้ง';

-- ── 5) กฎที่ห้ามขัดกัน — สถานะกับที่อยู่ต้องเล่าเรื่องเดียวกัน ─────────────
--
-- ⭐ `in_stock` แปลว่า "อยู่ในคลัง" **โดยนิยาม** ⇒ ผูกกับไซต์ลูกค้าไม่ได้
--   แต่ CHECK ระดับแถวมองข้ามตารางไม่ได้ (ต้องรู้ `kind` ของไซต์) ⇒ ใช้ trigger
-- ⚠️ ทำเป็น trigger ไม่ใช่ FK เพราะกฎนี้ขึ้นกับ **ค่าในอีกตาราง** ที่เปลี่ยนได้
CREATE OR REPLACE FUNCTION public.service_assets_stock_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_kind text;
BEGIN
  SELECT kind INTO v_kind FROM public.service_sites WHERE id = NEW."siteId";
  IF v_kind IS NULL THEN
    RETURN NEW;  -- ไม่มีไซต์ให้ตรวจ (FK จะเป็นคนตีกลับเอง)
  END IF;

  IF NEW.status = 'in_stock' AND v_kind <> 'warehouse' THEN
    RAISE EXCEPTION 'เครื่องสถานะ "อยู่ในคลัง" ต้องอยู่ที่ไซต์ประเภทคลัง (kind=warehouse) — ไซต์ % เป็นไซต์ลูกค้า', NEW."siteId";
  END IF;

  IF NEW.status = 'active' AND v_kind = 'warehouse' THEN
    RAISE EXCEPTION 'เครื่องที่อยู่ในคลังใช้สถานะ "ใช้งาน" ไม่ได้ — ต้องติดตั้งเข้าไซต์ลูกค้าก่อน';
  END IF;

  -- โซนอยู่ใต้ไซต์เสมอ — ย้ายข้ามไซต์แล้วลืมล้างโซน = เครื่องชี้โซนของไซต์อื่น
  IF NEW."zoneId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_zones z
     WHERE z.id = NEW."zoneId" AND z."siteId" = NEW."siteId"
  ) THEN
    RAISE EXCEPTION 'โซน % ไม่ได้อยู่ในไซต์ % — ย้ายเครื่องข้ามไซต์ต้องล้างหรือเลือกโซนใหม่', NEW."zoneId", NEW."siteId";
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS service_assets_stock_guard_trg ON public.service_assets;
CREATE TRIGGER service_assets_stock_guard_trg
  BEFORE INSERT OR UPDATE OF status, "siteId", "zoneId" ON public.service_assets
  FOR EACH ROW EXECUTE FUNCTION public.service_assets_stock_guard();

-- ── 6) ลบไซต์แล้วเครื่องต้องไม่หายไปด้วย ───────────────────────────────────
--
-- 🔴 **ขนาดระเบิดเปลี่ยนไป** — 0187 เลือก CASCADE เพราะ "เครื่องไม่มีความหมายนอกไซต์"
--   ซึ่งใบนี้ยกเลิกไปแล้ว · พอคลังเป็นไซต์ `DELETE` แถวเดียว = เครื่องหาย 343 ตัว
--   พร้อมประวัติ โดยด่านที่กันอยู่วันนี้เป็น**โค้ดล้วน** (sites/[id]/route.js)
-- ⚠️ RESTRICT ไม่ใช่ SET NULL — `siteId` ยัง NOT NULL อยู่ (นั่นคือหัวใจของทางที่เลือก)
--   ⇒ ลบไซต์ที่ยังมีเครื่องต้องล้มดัง ๆ ให้คนไปย้ายเครื่องออกก่อน
ALTER TABLE public.service_assets DROP CONSTRAINT IF EXISTS "service_assets_siteId_fkey";
ALTER TABLE public.service_assets
  ADD CONSTRAINT "service_assets_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES public.service_sites(id) ON DELETE RESTRICT;

-- ── 7) ทะเบียนคลังต้องอ่านเร็ว ─────────────────────────────────────────────
-- index เดิม (siteId, label) ใช้กับการค้นข้ามไซต์ไม่ได้ — ทะเบียนเครื่องรวมค้นด้วย
-- รหัส/รุ่น/สถานะเป็นหลัก
CREATE INDEX IF NOT EXISTS service_assets_registry_idx
  ON public.service_assets (status, model);
CREATE INDEX IF NOT EXISTS service_sites_kind_idx
  ON public.service_sites (kind) WHERE kind <> 'customer';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  ⚠️ หลังรันใบนี้แล้ว **ยังไม่มีคลัง** — ไซต์คลังสร้างผ่านหน้าจอ/สคริปต์ต่างหาก
--     (ตั้งใจ: migration สคีมาไม่ควรผูกกับแถวข้อมูลของ production · ถ้า seed ใน
--      migration แล้วฐาน dev ที่ไม่มี AR-000 จะล้มทั้งใบ)
--     สร้างด้วย POST /api/service/sites { customerId: <AR-000>, kind: 'warehouse',
--     name: 'คลังเครื่อง', provinceCode: '10' } ⇒ ได้รหัส ST-0000-01-BKK-xxxx
-- ============================================================
