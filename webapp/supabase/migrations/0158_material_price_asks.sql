-- ============================================================
--  Migration 0158: เคสขอราคาวัสดุ (PM- / RM-) + ถอนใบขอราคาวัสดุ MR ทิ้ง
--  แผนฉบับ 5 ข้อ 3 — docs/costing-request-plan.md (PR #726)
--
--  ของเดิม (0143) ทำ "ใบขอราคาวัสดุ MR-" เป็นเอกสารคู่ขนานกับใบขอราคาผลิต
--  ตัวเชื่อมระหว่างสองใบจึงเหลือแค่ข้อความชื่อวัสดุ → ตอบใบทีไรก็เกิดวัสดุตัวใหม่,
--  ราคาทับรายลูกค้าไม่ทำงาน (ฟอร์มไม่เคยส่ง customerId), และไม่มีคิวให้ RD/PC เห็น
--
--  ของใหม่: **เคส** ที่ผูกวัสดุในทะเบียน (0157) ด้วย id เสมอ และมีของที่ของเดิมไม่มี
--    · เลขที่แยกตามฝ่าย PM-YYMMXXXX (→PC) / RM-YYMMXXXX (→RD) ออกตอนกดส่ง
--    · สเปกละเอียดต่อรายการ + แนบรูปได้ (entity 'material_ask_item' — โค้ดล้วน
--      ไม่ต้อง migration เพราะ attachments เป็น polymorphic ไม่มี CHECK entityType)
--    · **ชั้นจำนวนที่ขอ** (1000/3000/5000…) ผู้ขอระบุเองอิสระ ไม่มีชุดตายตัว
--    · ขั้น "รับเรื่อง" (acknowledged) ให้ผู้ขอเห็นว่า RD/PC เปิดเคสแล้ว
--    · ปิดเคสแบบ **ไม่มีราคา** ได้ (no_quote + เหตุผล) — ของทำไม่ได้/เลิกผลิต
--      ไม่งั้นเคสพวกนี้ค้าง open ตลอดไป
--
--  ⚠ ต้องรัน 0157 ก่อน (ตารางนี้อ้าง material_prices / material_price_revisions)
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-2
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) หัวเคส
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_asks (
  id                 text PRIMARY KEY,
  "docNo"            text UNIQUE,                     -- PM-YYMMXXXX / RM-YYMMXXXX
  -- ฝ่ายผู้ตอบ = ตัวกำหนด scope ของเลขที่ (ดูเลขแล้วรู้ทันทีว่าเป็นงานฝ่ายไหน)
  dept               text NOT NULL CHECK (dept IN ('RD', 'PC')),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN (
                       'draft',        -- ร่าง ยังไม่ส่ง (ยังไม่กินเลข)
                       'pending',      -- ส่งแล้ว รอฝ่ายเจ้าของรับเรื่อง
                       'acknowledged', -- RD/PC กดรับเรื่องแล้ว กำลังหาราคา
                       'answered',     -- ตอบครบทุกรายการ (มีราคา หรือ ตอบไม่ได้)
                       'closed',       -- ปิดเคส
                       'cancelled')),  -- ผู้ขอยกเลิก
  "customerId"       text, "customerName" text,       -- มีค่า = ขอราคาเฉพาะลูกค้ารายนี้
  -- RM: สินค้า/สูตรที่ลูกค้าคอนเฟิร์ม (snapshot — สูตรเปลี่ยนทีหลังเคสเก่าไม่เพี้ยน)
  "productId"        text, "productName" text,
  "formulaCode"      text, "formulaName" text, "formulaDate" date,
  -- ถามจากในใบขอราคาผลิต (null = ถามลอย ๆ จากทะเบียน)
  -- SET NULL: ลบใบ CR แล้วเคสยังอยู่เป็นหลักฐานและตอบได้ ไม่ค้างเป็นงานผี
  "costingRequestId" text REFERENCES public.costing_requests(id) ON DELETE SET NULL,
  "requestedById"    text NOT NULL, "requestedByName" text, team text,
  note               text CHECK (note IS NULL OR length(note) <= 2000),
  "submittedAt"      timestamptz,
  "acknowledgedById" text, "acknowledgedByName" text, "acknowledgedAt" timestamptz,
  "answeredAt"       timestamptz,
  "closedById"       text, "closedByName" text, "closedAt" timestamptz,
  "cancelReason"     text CHECK ("cancelReason" IS NULL OR length("cancelReason") <= 500),
  "cancelledAt"      timestamptz,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'cancelled'    OR "cancelledAt"    IS NOT NULL),
  CHECK (status <> 'acknowledged' OR "acknowledgedAt" IS NOT NULL),
  CHECK (status <> 'closed'       OR "closedAt"       IS NOT NULL),
  -- เลขออกตอนส่ง: ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง (บทเรียนใบขอราคาผลิต PR3a)
  CHECK (status IN ('draft', 'cancelled') OR "docNo" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS material_price_asks_queue_idx
  ON public.material_price_asks (dept, status, "submittedAt" DESC);
CREATE INDEX IF NOT EXISTS material_price_asks_owner_idx
  ON public.material_price_asks ("requestedById");
CREATE INDEX IF NOT EXISTS material_price_asks_costing_idx
  ON public.material_price_asks ("costingRequestId");

-- ────────────────────────────────────────────────────────────────────────────
-- 2) รายการในเคส — 1 เคส = หลายรายการ (ขวด + ฝา + กล่อง ของงานเดียวกัน)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_ask_items (
  id                   text PRIMARY KEY,
  "askId"              text NOT NULL REFERENCES public.material_price_asks(id) ON DELETE CASCADE,
  "sortOrder"          integer NOT NULL DEFAULT 0,
  kind                 text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  -- ⚠ ผูกทะเบียนเสมอ (NOT NULL): ของใหม่ = API สร้างวัสดุ "ร่าง" ให้ก่อนแล้วผูก
  -- นี่คือจุดที่ปิดบั๊ก "ตอบใบทีไรก็เกิดวัสดุตัวใหม่" ที่รากของมัน
  "materialId"         text NOT NULL REFERENCES public.material_prices(id) ON DELETE RESTRICT,
  label                text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200), -- snapshot
  -- สเปกเป็นข้อความยาวช่องเดียว ยังไม่แตกคอลัมน์ — PM มีทั้งขวด/ฝา/กล่อง/ฉลาก
  -- โครงคนละแบบ ล็อกคอลัมน์ตอนนี้จะกรอกไม่ลงตัวสักอย่าง (มติ 2026-07-26)
  spec                 text CHECK (spec IS NULL OR length(spec) <= 2000),
  -- ผูกกลับบรรทัดในใบขอราคาผลิตเพื่อเติมราคาให้อัตโนมัติเมื่อตอบ
  "componentId"        text REFERENCES public.costing_item_components(id) ON DELETE SET NULL,
  "priceStatus"        text NOT NULL DEFAULT 'pending'
                       CHECK ("priceStatus" IN ('pending', 'quoted', 'no_quote')),
  "noQuoteReason"      text CHECK ("noQuoteReason" IS NULL OR length("noQuoteReason") <= 500),
  "answeredRevisionId" text REFERENCES public.material_price_revisions(id),
  "answeredById"       text, "answeredByName" text, "answeredAt" timestamptz,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  CHECK ("priceStatus" <> 'quoted'   OR "answeredRevisionId" IS NOT NULL),
  CHECK ("priceStatus" <> 'no_quote' OR "noQuoteReason"      IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS material_price_ask_items_ask_idx
  ON public.material_price_ask_items ("askId", "sortOrder");
CREATE INDEX IF NOT EXISTS material_price_ask_items_queue_idx
  ON public.material_price_ask_items ("priceStatus");
CREATE INDEX IF NOT EXISTS material_price_ask_items_material_idx
  ON public.material_price_ask_items ("materialId");
CREATE INDEX IF NOT EXISTS material_price_ask_items_component_idx
  ON public.material_price_ask_items ("componentId");

-- ────────────────────────────────────────────────────────────────────────────
-- 3) ชั้นจำนวนที่ "ขอ" — ผู้ขอระบุเองอิสระ ไม่มีชุดตายตัว (มติ 2026-07-26)
--    ไม่มีแถวเลย = ขอราคาเดียวไม่แบ่งชั้น (เคส RM ต่อ กก. ตามปกติ)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_ask_tiers (
  id          text PRIMARY KEY,
  "askItemId" text NOT NULL REFERENCES public.material_price_ask_items(id) ON DELETE CASCADE,
  qty         numeric NOT NULL CHECK (qty > 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("askItemId", qty)
);

-- ⚠ material_price_revisions."sourceAskItemId" (เพิ่มไว้ใน 0157) **ตั้งใจไม่ใส่ FK**
--   เพราะ rev เป็น immutable — guard ห้าม UPDATE ทุกกรณี ถ้าใส่ FK ON DELETE SET NULL
--   การลบเคสจะสั่ง UPDATE rev แล้วชน guard ทันที = ลบเคสไม่ได้เลย
--   (แพตเทิร์น logical link เดียวกับ inquiries 0104 / sourceRequestId เดิม)

-- ────────────────────────────────────────────────────────────────────────────
-- 4) เคสที่ส่งแล้วเป็นหลักฐาน ลบไม่ได้ (แพตเทิร์น 0143/0147)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_material_price_ask()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'material_price_ask_delete_forbidden';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'material_price_ask_doc_no_immutable';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'material_price_ask_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS material_price_asks_guard ON public.material_price_asks;
CREATE TRIGGER material_price_asks_guard
BEFORE UPDATE OR DELETE ON public.material_price_asks
FOR EACH ROW EXECUTE FUNCTION public.guard_material_price_ask();

-- admin force-delete (flag local ต่อ transaction — แพตเทิร์น 0147)
CREATE OR REPLACE FUNCTION public.force_delete_material_ask(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.force_delete', '1', true);
  DELETE FROM public.material_price_asks WHERE id = p_id;   -- ลูก cascade
END;
$$;
REVOKE ALL ON FUNCTION public.force_delete_material_ask(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_material_ask(text) TO service_role;

ALTER TABLE public.material_price_asks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_ask_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_ask_tiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_price_asks, public.material_price_ask_items,
                    public.material_price_ask_tiers FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_price_asks, public.material_price_ask_items,
                    public.material_price_ask_tiers TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) ถอนใบขอราคาวัสดุ MR ทั้งชุด
--    prod ยังไม่มีข้อมูลจริง (ยืนยัน 2026-07-26) จึง drop ตรงได้ ไม่ต้องย้ายข้อมูล
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER  IF EXISTS material_price_requests_guard ON public.material_price_requests;
DROP FUNCTION IF EXISTS public.guard_material_price_request();
DROP FUNCTION IF EXISTS public.force_delete_material_request(text);
DROP TABLE    IF EXISTS public.material_price_request_items;   -- ลูกก่อน (FK)
DROP TABLE    IF EXISTS public.material_price_requests;
-- ⚠️ ตั้งแต่ mig 0241 มี trigger กันลบแถวเคาน์เตอร์ (เลขที่ออกแล้วห้ามถูกออกซ้ำ)
-- การล้าง scope ที่เลิกใช้ทั้งตัวชอบธรรม แต่ต้องประกาศเจตนาก่อน — ใบนี้จึงยังรันซ้ำได้
SET LOCAL app.entity_counter_unlock = 'on';
DELETE FROM public.entity_number_counters WHERE scope = 'MR';
RESET app.entity_counter_unlock;

-- ตัวชี้ค้างที่ไม่มี FK (ตั้งใจ loose ตอน 0143) — ล้างกันงงตอนไล่ข้อมูลย้อนหลัง
UPDATE public.material_price_revisions SET "sourceRequestId" = NULL
 WHERE "sourceRequestId" IS NOT NULL;

-- scope 'PM'/'RM' ไม่ต้อง seed — next_entity_number (0096) INSERT … ON CONFLICT
-- สร้างแถวให้เองครั้งแรกที่เรียก

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- 1) ใบ MR กู้ไม่ได้ (drop จริง) — ถ้าต้องถอย ให้รัน 0143 ส่วนที่ 3 ซ้ำเพื่อสร้าง
--    ตารางเปล่ากลับมา (ข้อมูลเดิมไม่มีอยู่แล้วบน prod)
-- 2) เคส: DROP TRIGGER material_price_asks_guard → DROP TABLE material_price_ask_tiers,
--    material_price_ask_items, material_price_asks → DROP FUNCTION guard_material_price_ask,
--    force_delete_material_ask → DELETE FROM entity_number_counters WHERE scope IN ('PM','RM')
