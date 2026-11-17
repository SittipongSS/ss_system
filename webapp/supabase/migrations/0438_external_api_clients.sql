-- 0438 — API อ่าน SO ให้ระบบอื่นของบริษัท (`/api/ext/v1`) — ฐานข้อมูล
--
--  แผน: docs/so-external-api-plan.md · มติเจ้าของ 8 ข้อ (11/11/2026)
--  สร้าง:
--    1. `api_clients`            — คีย์ของระบบปลายทาง (เก็บแค่ sha256 ของ secret · ไม่เก็บตัวจริง)
--    2. `sales_orders."changeSeq"` + `"changedAt"` — เลขลำดับการเปลี่ยนสำหรับดึงเฉพาะที่เปลี่ยน
--         trigger `BEFORE INSERT OR UPDATE` เขียนเองทุกครั้ง · **ไม่แตะ `updatedAt`** (หลายจุดใช้เป็น CAS กันเขียนชน)
--    3. `sales_orders_deleted`   — ร่องรอยใบที่ถูกลบจริง (แอดมินลบได้ · ลบดีล = SO cascade) ให้ปลายทางรู้ว่าต้องหยุดงาน
--    4. `api_client_calls`       — ประวัติการเรียกทุกครั้ง (มติ 5 · ล้างแถวเกิน 90 วันที่ cron รายวัน)
--
--  ⚠️ ลำดับในไฟล์สำคัญ: เพิ่มคอลัมน์ → backfill แถวเดิมเรียงตาม `updatedAt` → setval → **สร้าง trigger ทีหลังสุด**
--     (สร้างก่อน backfill = trigger แจกเลขทับโดยไม่เรียงตามเวลา)
--  ⚠️ backfill SET แค่ `changeSeq`/`changedAt` ⇒ trigger UPDATE เดิมบน `sales_orders` ไม่ทำงานสักตัว
--     (ทุกตัวผูก `UPDATE OF <คอลัมน์อื่น>` — ตรวจทุก migration ถึง 0437 เมื่อ 17/11/2026) · Actual/ลายเซ็น/สรรพสามิตไม่ขยับ
--     · ไม่มี trigger ตัวไหนเทียบทั้งแถว ⇒ คอลัมน์ใหม่ไม่ชนด่านเดิม
--  ⚠️ ทั้งสามตารางใหม่: เปิด RLS ไม่มี policy + REVOKE จาก anon/authenticated ชัด ๆ (default privileges ของ supabase_admin ยังเปิด)
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน merge** — ด่าน CI `check:columns` อ่านสคีมาจริง (คอลัมน์/ตารางใหม่ต้องมีก่อน)
--     · รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม (ไม่มีใครอ่านคอลัมน์ใหม่ · trigger ใหม่แค่เติมเลข)
--  ✅ รันซ้ำได้ (IF NOT EXISTS · backfill เฉพาะแถวที่ยังว่าง · DROP TRIGGER IF EXISTS)

BEGIN;

-- ── 1. คีย์ของระบบปลายทาง ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_clients (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  "keyId"     text NOT NULL UNIQUE CHECK ("keyId" ~ '^[a-z0-9]{8}$'),
  "keyHash"   text NOT NULL CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  scopes      text[] NOT NULL DEFAULT ARRAY['so:read']::text[],
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" text,
  "revokedAt" timestamptz,
  "revokedBy" text,
  "lastUsedAt" timestamptz
);

-- ── 2. เลขลำดับการเปลี่ยนของ SO ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.sales_orders_change_seq;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "changeSeq" bigint,
  ADD COLUMN IF NOT EXISTS "changedAt" timestamptz;

-- backfill แถวเดิม (เฉพาะที่ยังว่าง) เรียงตามเวลาแก้ล่าสุด แล้วต่อเลขจากค่าสูงสุดที่มีอยู่
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY "updatedAt" NULLS FIRST, id) AS rn
    FROM public.sales_orders
   WHERE "changeSeq" IS NULL
), base AS (
  SELECT COALESCE(max("changeSeq"), 0) AS b FROM public.sales_orders
)
UPDATE public.sales_orders o
   SET "changeSeq" = base.b + ordered.rn,
       "changedAt" = COALESCE(o."updatedAt", o."createdAt", now())
  FROM ordered, base
 WHERE o.id = ordered.id;

SELECT setval('public.sales_orders_change_seq',
              GREATEST((SELECT COALESCE(max("changeSeq"), 0) FROM public.sales_orders), 1));

CREATE INDEX IF NOT EXISTS sales_orders_change_seq_idx ON public.sales_orders ("changeSeq");

-- ── 3. ร่องรอยใบที่ถูกลบ ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_orders_deleted (
  "changeSeq"   bigint PRIMARY KEY,
  "orderNumber" text NOT NULL,
  "baseNumber"  text,
  "revisionNo"  integer,
  status        text NOT NULL,
  "deletedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_orders_deleted_order_number_idx ON public.sales_orders_deleted ("orderNumber");

-- ── 4. ประวัติการเรียก ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_client_calls (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "clientId"   text REFERENCES public.api_clients(id) ON DELETE SET NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  method       text NOT NULL,
  path         text NOT NULL,
  query        text,
  status       integer NOT NULL,
  "rowCount"   integer,
  "durationMs" integer,
  ip           text
);
CREATE INDEX IF NOT EXISTS api_client_calls_client_at_idx ON public.api_client_calls ("clientId", at DESC);
CREATE INDEX IF NOT EXISTS api_client_calls_at_idx ON public.api_client_calls (at);

-- ── สิทธิ์ของตารางใหม่ ──────────────────────────────────────────────────────
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders_deleted ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_client_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.sales_orders_deleted FROM anon, authenticated;
REVOKE ALL ON TABLE public.api_client_calls FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.sales_orders_change_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.api_clients TO service_role;
GRANT ALL ON TABLE public.sales_orders_deleted TO service_role;
GRANT ALL ON TABLE public.api_client_calls TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sales_orders_change_seq TO service_role;

-- ── trigger (สร้างหลัง backfill เสมอ) ───────────────────────────────────────
-- ทุก INSERT/UPDATE ได้เลขใหม่ · `changedAt` = เวลาเริ่มทรานแซกชัน (route ไม่ส่งแถวที่ใหม่กว่า 60 วินาที
-- เพื่อกันแถวที่ได้เลขก่อนแต่ commit ทีหลังถูกข้าม)
CREATE OR REPLACE FUNCTION public.sales_orders_stamp_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW."changeSeq" := nextval('public.sales_orders_change_seq');
  NEW."changedAt" := now();
  RETURN NEW;
END;
$$;

-- ใบที่ถูกลบ: เก็บเฉพาะ SO ปกติ (pipeline) ในสถานะที่ API ส่งออก — ใบร่าง/รออนุมัติปลายทางไม่เคยเห็น
CREATE OR REPLACE FUNCTION public.sales_orders_record_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.origin = 'pipeline' AND OLD.status IN ('approved', 'approval_revoked', 'revised', 'cancelled') THEN
    INSERT INTO public.sales_orders_deleted ("changeSeq", "orderNumber", "baseNumber", "revisionNo", status)
    VALUES (nextval('public.sales_orders_change_seq'), OLD."orderNumber", OLD."baseNumber", OLD."revisionNo", OLD.status);
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_orders_stamp_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_orders_record_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_orders_stamp_change_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_stamp_change_trg
BEFORE INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sales_orders_stamp_change();

DROP TRIGGER IF EXISTS sales_orders_record_delete_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_record_delete_trg
AFTER DELETE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sales_orders_record_delete();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: tables = 3 · seq_null = 0 · triggers = 2 · seq_ok = true ──
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN ('api_clients', 'sales_orders_deleted', 'api_client_calls')) AS tables,
  (SELECT count(*) FROM public.sales_orders WHERE "changeSeq" IS NULL OR "changedAt" IS NULL) AS seq_null,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.sales_orders'::regclass
     AND tgname IN ('sales_orders_stamp_change_trg', 'sales_orders_record_delete_trg')) AS triggers,
  (SELECT last_value >= (SELECT max("changeSeq") FROM public.sales_orders)
     FROM public.sales_orders_change_seq) AS seq_ok;
