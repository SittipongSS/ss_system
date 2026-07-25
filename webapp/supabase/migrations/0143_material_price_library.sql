-- 0143 - ระบบขอราคาผลิต ฉบับ 3 (PR-A): คลังราคาวัสดุ + ใบขอราคาวัสดุ
--
-- แยกราคาวัสดุ (PM/RM) ออกจากราคาผลิต — มติ 2026-07-23 "มันคนละส่วนกัน":
-- ราคาวัสดุใช้ซ้ำได้ข้ามงาน มีอายุ จึงอยู่ในคลังกลาง ไม่ขังอยู่ในใบขอราคาผลิต
--
-- 3 ตาราง:
--   material_prices          "วัสดุ" หนึ่งตัวในคลัง (หัวเรื่อง ไม่มีตัวเลขราคา)
--   material_price_revisions ราคาจริงเป็นรุ่น — แก้ = ออก rev ใหม่ ของเก่าเป็น
--                            ประวัติ (ห้ามแก้/ลบ) ใบที่อ้าง rev เก่ายังชี้ rev เดิม
--   material_price_requests  ใบขอราคาวัสดุ MR-YYMMXXXX + บรรทัดคำถาม
--
-- คลังโตเองจากการถาม-ตอบ: RD/PC ตอบใบขอราคา = สร้าง/หา material_price + insert
-- revision ใหม่ ไม่มีใครต้องกรอกคลังมือ
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ────────────────────────────────────────────────────────────────────────────
-- 1) วัสดุในคลัง (หัวเรื่อง)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_prices (
  id              text PRIMARY KEY,
  kind            text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  -- ฝ่ายที่ดูแลราคาวัสดุนี้: RM→RD, PM→PC (ผูกกับ kind แบบเดียวกับแม่แบบ 0140)
  "sourceDept"    text NOT NULL CHECK ("sourceDept" IN ('RD', 'PC')),
  -- null = ราคากลาง (ใช้ได้ทุกลูกค้า); มีค่า = ราคาเฉพาะลูกค้ารายนี้ (ทับราคากลาง)
  "customerId"    text,
  "customerName"  text,
  "supplierNote"  text CHECK ("supplierNote" IS NULL OR length("supplierNote") <= 500),
  "isHidden"      boolean NOT NULL DEFAULT false,
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  -- หน่วยผูกกับ kind: RM คิด ฿/กก. (per_kg), PM คิด ฿/ชิ้น (per_piece)
  CONSTRAINT material_prices_source_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_FB') AND "sourceDept" = 'RD')
    OR (kind = 'PM' AND "sourceDept" = 'PC')
  )
);

CREATE INDEX IF NOT EXISTS material_prices_kind_idx ON public.material_prices (kind, "isHidden");
CREATE INDEX IF NOT EXISTS material_prices_customer_idx ON public.material_prices ("customerId");
-- ค้นชื่อวัสดุ (เซล/RD/PC พิมพ์คำในชื่อ)
CREATE INDEX IF NOT EXISTS material_prices_label_idx ON public.material_prices (lower(label));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) รุ่นราคา (immutable) — ราคาจริงอยู่ที่นี่
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_revisions (
  id              text PRIMARY KEY,
  "materialId"    text NOT NULL REFERENCES public.material_prices(id) ON DELETE CASCADE,
  "revisionNo"    integer NOT NULL CHECK ("revisionNo" > 0),
  "unitBasis"     text NOT NULL CHECK ("unitBasis" IN ('per_kg', 'per_piece')),
  "pricePerKg"    numeric CHECK ("pricePerKg" IS NULL OR "pricePerKg" >= 0),
  "pricePerUnit"  numeric CHECK ("pricePerUnit" IS NULL OR "pricePerUnit" >= 0),
  "quotedById"    text, "quotedByName" text,
  "quotedAt"      timestamptz NOT NULL DEFAULT now(),
  -- อายุราคา: เกินวันนี้ = ต้องขอยืนยันก่อนใช้ในใบขอราคาผลิต. null = ใช้ default
  -- ฝั่งแอป (90 วันจาก quotedAt) — ไม่ hardcode ใน DB เพื่อให้ปรับ default ได้
  "validUntil"    date,
  -- ที่มาของ rev นี้: ใบขอราคาวัสดุ / null = PC-RD แก้เอง หรือยืนยันจากใบผลิต
  "sourceRequestId" text,
  note            text CHECK (note IS NULL OR length(note) <= 500),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("materialId", "revisionNo"),
  -- ราคาลงช่องที่ตรงหน่วย (แพตเทิร์น 0141) — ต้องมีราคาจริงเสมอ
  CONSTRAINT material_price_revisions_price_matches_basis CHECK (
    ("unitBasis" = 'per_kg' AND "pricePerUnit" IS NULL AND "pricePerKg" IS NOT NULL)
    OR ("unitBasis" = 'per_piece' AND "pricePerKg" IS NULL AND "pricePerUnit" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS material_price_revisions_material_idx
  ON public.material_price_revisions ("materialId", "revisionNo" DESC);

-- rev เป็นหลักฐาน — แก้/ลบไม่ได้ (ต้องการเปลี่ยนราคา = ออก rev ใหม่)
CREATE OR REPLACE FUNCTION public.guard_material_price_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'material_price_revision_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'material_price_revision_immutable';
END;
$$;
DROP TRIGGER IF EXISTS material_price_revisions_guard ON public.material_price_revisions;
CREATE TRIGGER material_price_revisions_guard
BEFORE UPDATE OR DELETE ON public.material_price_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_material_price_revision();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) ใบขอราคาวัสดุ + บรรทัดคำถาม
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_requests (
  id              text PRIMARY KEY,
  "docNo"         text UNIQUE,              -- MR-YYMMXXXX (next_entity_number 'MR')
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending', 'answered', 'cancelled')),
  "customerId"    text, "customerName" text, -- ถ้าถามราคาเฉพาะลูกค้า (optional)
  "requestedById" text NOT NULL, "requestedByName" text,
  team            text,
  note            text CHECK (note IS NULL OR length(note) <= 2000),
  "cancelReason"  text CHECK ("cancelReason" IS NULL OR length("cancelReason") <= 500),
  "submittedAt"   timestamptz,
  "cancelledAt"   timestamptz,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'cancelled' OR "cancelledAt" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS material_price_requests_status_idx
  ON public.material_price_requests (status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS material_price_requests_owner_idx
  ON public.material_price_requests ("requestedById");

CREATE TABLE IF NOT EXISTS public.material_price_request_items (
  id              text PRIMARY KEY,
  "requestId"     text NOT NULL REFERENCES public.material_price_requests(id) ON DELETE CASCADE,
  "sortOrder"     integer NOT NULL DEFAULT 0,
  kind            text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  "sourceDept"    text NOT NULL CHECK ("sourceDept" IN ('RD', 'PC')),
  -- ผูกวัสดุ/รุ่นที่ตอบกลับ (null จนกว่าจะตอบ)
  "materialId"        text,
  "answeredRevisionId" text,
  "priceStatus"   text NOT NULL DEFAULT 'pending' CHECK ("priceStatus" IN ('pending', 'quoted')),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_price_request_items_source_matches_kind CHECK (
    (kind IN ('RM_F', 'RM_FB') AND "sourceDept" = 'RD')
    OR (kind = 'PM' AND "sourceDept" = 'PC')
  )
);
CREATE INDEX IF NOT EXISTS material_price_request_items_request_idx
  ON public.material_price_request_items ("requestId", "sortOrder");
-- คิว RD/PC: บรรทัดฝ่ายฉันที่ยังไม่ตอบ
CREATE INDEX IF NOT EXISTS material_price_request_items_queue_idx
  ON public.material_price_request_items ("sourceDept", "priceStatus");

-- ใบที่ส่งออกแล้วเป็นหลักฐาน ลบไม่ได้ (ร่างที่ยังไม่ส่งลบได้ — แพตเทิร์น 0141)
CREATE OR REPLACE FUNCTION public.guard_material_price_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'material_price_request_delete_forbidden';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'material_price_request_doc_no_immutable';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'material_price_request_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS material_price_requests_guard ON public.material_price_requests;
CREATE TRIGGER material_price_requests_guard
BEFORE UPDATE OR DELETE ON public.material_price_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_material_price_request();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RLS + grants
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_request_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.material_prices FROM anon, authenticated;
REVOKE ALL ON TABLE public.material_price_revisions FROM anon, authenticated;
REVOKE ALL ON TABLE public.material_price_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.material_price_request_items FROM anon, authenticated;
GRANT ALL ON TABLE public.material_prices TO service_role;
GRANT ALL ON TABLE public.material_price_revisions TO service_role;
GRANT ALL ON TABLE public.material_price_requests TO service_role;
GRANT ALL ON TABLE public.material_price_request_items TO service_role;

-- Rollback guidance:
-- 1) ยังไม่มีใบขอราคาผลิตมาอ้างคลังในเฟสนี้ (PR-B ยังไม่ขึ้น) — ถอนได้ด้วย DROP
--    TABLE ทั้ง 4 (DROP TRIGGER/FUNCTION ก่อน เพราะ guard บล็อก)
-- 2) หลัง PR-B ขึ้น (ใบผลิตอ้าง materialRevisionId) ห้าม DROP — เป็นที่มาของราคา
-- 3) ปิดฟีเจอร์ชั่วคราว = ถอดสิทธิ์/เมนู ฝั่งแอป ไม่ต้องแตะ schema

NOTIFY pgrst, 'reload schema';
