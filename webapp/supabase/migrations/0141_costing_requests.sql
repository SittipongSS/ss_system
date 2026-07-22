-- 0141 - ระบบขอราคาต้นทุน (Costing Request) PR3a: ตัวใบขอราคา
--
-- โครง 4 ชั้น: ใบ → สินค้าในใบ → บรรทัดต้นทุนของสินค้า → ชั้นจำนวน+ราคาที่อนุมัติ
--
--   costing_requests          ใบหนึ่งใบผูกดีลหนึ่งดีล (บังคับ) — ขอราคา = มียอด
--                             อนาคต ต้องมีดีลรองรับเสมอ
--   costing_request_items     สินค้าแต่ละตัวในใบ. **อนุมัติรายสินค้า** (มติ
--                             2026-07-22) จึงเก็บสถานะอนุมัติที่ระดับนี้
--   costing_item_components   บรรทัดต้นทุน — กางจากแม่แบบ (0140) ครั้งเดียวตอน
--                             เลือกประเภทสินค้า แล้วเป็น **สำเนาของใบนี้เอง**
--                             แม่แบบเปลี่ยนทีหลังไม่กระทบใบที่กางไปแล้ว
--   costing_item_tiers        ชั้นจำนวน (500/1000/3000…) + ราคาผลิตที่อนุมัติ
--
-- สิ่งที่ตั้งใจ "ไม่เก็บ" เพราะคำนวณตอนอ่านได้ และเก็บไว้จะเพี้ยนจากของจริง:
--   • ธง isMoq ของชั้นจำนวน  → เทียบ qty กับ costing_requests.moq ตอนอ่าน
--   • ตัวนับอนุมัติแล้ว x/y   → นับจาก costing_request_items ตอนอ่าน
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ────────────────────────────────────────────────────────────────────────────
-- 1) ใบขอราคา
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.costing_requests (
  id                text PRIMARY KEY,
  "docNo"           text UNIQUE,              -- CR-YYMMXXXX (next_entity_number scope 'CR')
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft',        -- ร่าง ยังไม่ส่งขอราคา
                      'pricing',      -- ส่งขอราคาแล้ว รอ RD/PC เติมราคา
                      'assembling',   -- ราคาครบ ฝ่ายขายกำลังประกอบต้นทุน
                      'pending_exec', -- ส่งผู้บริหาร รออนุมัติ
                      'returned',     -- ผู้บริหารตีกลับบางรายการให้แก้
                      'approved',     -- อนุมัติครบทุกรายการ
                      'linked',       -- ป้อนต้นทุนกลับ FG / ผูกใบเสนอราคาแล้ว
                      'cancelled')),  -- ยกเลิกใบ (เช่น ดีลหลุด)
  -- logical link แบบเดียวกับ inquiries (mig 0104) — ไม่บังคับ FK ข้ามโมดูล
  "dealId"          text NOT NULL,
  "projectId"       text,
  "customerId"      text,
  "customerName"    text,                     -- snapshot: ลูกค้าเปลี่ยนชื่อแล้วใบเก่าไม่เพี้ยน
  team              text,
  "requestedById"   text NOT NULL,
  "requestedByName" text,
  -- ปริมาณสั่งขั้นต่ำของใบนี้ ปกติ 1000 แต่ปรับได้ต่อใบ; ชั้นจำนวนที่ตรงค่านี้
  -- คือ "ชั้น MOQ" (คำนวณตอนอ่าน ไม่เก็บธง)
  moq               numeric NOT NULL DEFAULT 1000 CHECK (moq > 0),
  note              text CHECK (note IS NULL OR length(note) <= 2000),
  "cancelReason"    text CHECK ("cancelReason" IS NULL OR length("cancelReason") <= 500),
  "submittedAt"     timestamptz,              -- ครั้งแรกที่ส่งขอราคา
  "approvedAt"      timestamptz,              -- ครบทุกรายการเมื่อไหร่
  "cancelledAt"     timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'cancelled' OR "cancelledAt" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS costing_requests_deal_idx ON public.costing_requests ("dealId");
CREATE INDEX IF NOT EXISTS costing_requests_status_idx ON public.costing_requests (status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS costing_requests_team_idx ON public.costing_requests (team);
CREATE INDEX IF NOT EXISTS costing_requests_owner_idx ON public.costing_requests ("requestedById");

-- ────────────────────────────────────────────────────────────────────────────
-- 2) สินค้าในใบ — หน่วยของการอนุมัติ
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.costing_request_items (
  id                    text PRIMARY KEY,
  "requestId"           text NOT NULL REFERENCES public.costing_requests(id) ON DELETE CASCADE,
  "sortOrder"           integer NOT NULL DEFAULT 0,
  "productId"           text,                 -- null ได้: ยังไม่ขึ้นทะเบียน FG ตอนขอราคา
  "categoryCode"        text NOT NULL CHECK ("categoryCode" ~ '^\d{2}-\d{3}$'),
  "templateId"          text,                 -- soft ref → product_type_cost_templates (0140)
                                              -- เก็บไว้ตามรอยว่าบรรทัดกางมาจากแม่แบบใบไหน
  "productLabel"        text NOT NULL CHECK (length(btrim("productLabel")) BETWEEN 1 AND 300),
  "fragranceName"       text,
  "approvalStatus"      text NOT NULL DEFAULT 'pending'
                        CHECK ("approvalStatus" IN ('pending', 'approved', 'returned')),
  "returnReason"        text CHECK ("returnReason" IS NULL OR length("returnReason") <= 500),
  "approvedById"        text,
  "approvedByName"      text,
  "approvedAt"          timestamptz,
  "approvalSignatureId" text,                 -- ลายเซ็นอิเล็กทรอนิกส์ (mig 0122)
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  -- อนุมัติแล้วต้องมีทั้งคนอนุมัติและเวลา (หลักฐานครบหรือไม่มีเลย)
  CHECK ("approvalStatus" <> 'approved' OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)),
  CHECK ("approvalStatus" <> 'returned' OR NULLIF(btrim(COALESCE("returnReason", '')), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS costing_request_items_request_idx
  ON public.costing_request_items ("requestId", "sortOrder");

-- ────────────────────────────────────────────────────────────────────────────
-- 3) บรรทัดต้นทุน — สำเนาจากแม่แบบ + ช่องราคาที่ RD/PC มาเติม
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.costing_item_components (
  id              text PRIMARY KEY,
  "itemId"        text NOT NULL REFERENCES public.costing_request_items(id) ON DELETE CASCADE,
  "sortOrder"     integer NOT NULL DEFAULT 0,
  kind            text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM', 'labor')),
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  "unitBasis"     text NOT NULL CHECK ("unitBasis" IN ('per_kg', 'per_piece')),
  "gramsPerUnit"  numeric CHECK ("gramsPerUnit" IS NULL OR "gramsPerUnit" > 0),
  -- ฝ่ายที่ต้องตอบราคาบรรทัดนี้ — null = ค่าดำเนินการ คิดภายใน ไม่ต้องถามใคร
  "sourceDept"    text CHECK ("sourceDept" IS NULL OR "sourceDept" IN ('RD', 'PC')),
  "pricePerKg"    numeric CHECK ("pricePerKg" IS NULL OR "pricePerKg" >= 0),
  "pricePerUnit"  numeric CHECK ("pricePerUnit" IS NULL OR "pricePerUnit" >= 0),
  "priceStatus"   text NOT NULL DEFAULT 'pending' CHECK ("priceStatus" IN ('pending', 'quoted')),
  "quotedById"    text,
  "quotedByName"  text,
  "quotedAt"      timestamptz,
  required        boolean NOT NULL DEFAULT true,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  -- หน่วยผูกกับชนิดเหมือนแม่แบบ (0140) — สูตรแปลง ฿/กก. → ฿/ชิ้น พึ่งค่านี้
  CONSTRAINT costing_item_components_basis_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_FB') AND "unitBasis" = 'per_kg')
    OR (kind IN ('PM', 'labor') AND "unitBasis" = 'per_piece')
  ),
  CONSTRAINT costing_item_components_grams_only_per_kg CHECK (
    "unitBasis" = 'per_kg' OR "gramsPerUnit" IS NULL
  ),
  -- ราคาต้องอยู่ในช่องที่ตรงกับหน่วยของบรรทัด ไม่ใช่กรอกมั่วช่องไหนก็ได้
  CONSTRAINT costing_item_components_price_matches_basis CHECK (
    ("unitBasis" = 'per_kg' AND "pricePerUnit" IS NULL)
    OR ("unitBasis" = 'per_piece' AND "pricePerKg" IS NULL)
  ),
  -- ตอบราคาแล้วต้องมีทั้งราคา ผู้ตอบ และเวลา
  CONSTRAINT costing_item_components_quote_complete CHECK (
    "priceStatus" <> 'quoted'
    OR (COALESCE("pricePerKg", "pricePerUnit") IS NOT NULL
        AND "quotedById" IS NOT NULL AND "quotedAt" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS costing_item_components_item_idx
  ON public.costing_item_components ("itemId", "sortOrder");
-- คิวของ RD/PC: "บรรทัดฝ่ายฉันที่ยังไม่ตอบ"
CREATE INDEX IF NOT EXISTS costing_item_components_queue_idx
  ON public.costing_item_components ("sourceDept", "priceStatus");

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ชั้นจำนวน + ราคาผลิตที่ผู้บริหารอนุมัติ
-- ────────────────────────────────────────────────────────────────────────────
-- อนุมัติคนเดียวจบ ไม่มีอนุมัติซ้อน (มติ 2026-07-22) → ราคาช่องเดียวพอ
-- ผู้อนุมัติ/เวลา/ลายเซ็น เก็บที่ระดับ item เพราะอนุมัติทั้งสินค้าในครั้งเดียว
CREATE TABLE IF NOT EXISTS public.costing_item_tiers (
  id                  text PRIMARY KEY,
  "itemId"            text NOT NULL REFERENCES public.costing_request_items(id) ON DELETE CASCADE,
  qty                 numeric NOT NULL CHECK (qty > 0),
  "approvedUnitPrice" numeric CHECK ("approvedUnitPrice" IS NULL OR "approvedUnitPrice" >= 0),
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("itemId", qty)
);

CREATE INDEX IF NOT EXISTS costing_item_tiers_item_idx
  ON public.costing_item_tiers ("itemId", qty);

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Guard: ใบที่ส่งออกไปแล้วเป็นหลักฐาน ลบไม่ได้
-- ────────────────────────────────────────────────────────────────────────────
-- ร่างที่ยังไม่เคยส่งขอราคาไม่ใช่หลักฐาน — ทิ้งได้ (แนวเดียวกับ Decision 0012
-- rev 2 "ยกเลิกร่าง = ลบจริง"). พอส่งออกไปแล้วมีฝ่ายอื่นเห็น/ตอบราคา = ต้องเหลือ
-- ร่องรอย ใช้สถานะ cancelled แทนการลบ
CREATE OR REPLACE FUNCTION public.guard_costing_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'costing_request_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'costing_request_identity_immutable';
  END IF;

  -- เลขที่เอกสารออกครั้งเดียวตอนส่งขอราคา แล้วห้ามเปลี่ยน/ถอน
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'costing_request_doc_no_immutable';
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'costing_request_cancelled_immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS costing_requests_guard ON public.costing_requests;
CREATE TRIGGER costing_requests_guard
BEFORE UPDATE OR DELETE ON public.costing_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_costing_request();

-- ────────────────────────────────────────────────────────────────────────────
-- 6) RLS + grants (เข้าผ่าน API service_role เหมือนตารางอื่นทั้งระบบ)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.costing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costing_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costing_item_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costing_item_tiers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.costing_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.costing_request_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.costing_item_components FROM anon, authenticated;
REVOKE ALL ON TABLE public.costing_item_tiers FROM anon, authenticated;
GRANT ALL ON TABLE public.costing_requests TO service_role;
GRANT ALL ON TABLE public.costing_request_items TO service_role;
GRANT ALL ON TABLE public.costing_item_components TO service_role;
GRANT ALL ON TABLE public.costing_item_tiers TO service_role;

-- Rollback guidance:
-- 1) ยังไม่มีข้อมูลจริงตอน deploy ครั้งแรก — ถอนได้ด้วย DROP TABLE ทั้ง 4 (ต้อง
--    DROP TRIGGER/FUNCTION guard ก่อน เพราะ guard บล็อก DELETE)
-- 2) หลังผู้ใช้เริ่มส่งขอราคาจริงห้าม DROP — ราคาที่ RD/PC ตอบและที่ผู้บริหาร
--    อนุมัติเป็นหลักฐานตั้งราคา
-- 3) ปิดฟีเจอร์ชั่วคราว = ถอดสิทธิ์ costing:* ออกจาก role ฝั่งแอป ไม่ต้องแตะ schema

NOTIFY pgrst, 'reload schema';
