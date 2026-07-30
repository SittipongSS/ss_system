-- ============================================================
--  Migration 0185: ทะเบียนไซต์บริการ + เครื่องกระจายกลิ่น (S-1)
--  แผน docs/service-production-scheduling-plan.md §4.2
--
--  ของเดิม: **ไม่มีที่เก็บเลย** — ทีม SV (Services) ขายระบบกระจายกลิ่นได้ แต่พอ
--  ปิดการขายแล้วไม่มีตารางไหนรู้ว่าไปติดตั้งที่ไหน เครื่องอะไร ใช้กลิ่นไหน
--  ต้องกลับไปเติมเมื่อไหร่ · `customers` มีที่อยู่ **ช่องเดียว** → ลูกค้าที่มี 12 สาขา
--  เก็บไม่ได้ตั้งแต่ต้น (ไซต์บริการเป็นคนละหน่วยกับ "ลูกค้า" อย่างสิ้นเชิง)
--
--  ⚠ เลข 0185 มาก่อน production_jobs ที่แผนเดิมจองไว้ — ผู้ใช้สั่งให้ทำสายบริการก่อน
--    (มติ 2026-07-30) เลข migration เป็นลำดับ "การรัน" ไม่ใช่ลำดับความสำคัญ
--
--  ⚠ รันมือบน Supabase SQL Editor · **ตารางใหม่ล้วน รันก่อน deploy ได้เลย**
-- ============================================================

BEGIN;

-- ── ไซต์บริการ = จุดติดตั้งหนึ่งจุด (ลูกค้า 1 ราย มีได้หลายจุด) ──────────
CREATE TABLE IF NOT EXISTS public.service_sites (
  id              text PRIMARY KEY,
  code            text UNIQUE,                    -- SS-YYMMXXXX (next_entity_number scope 'SS')
  -- RESTRICT ไม่ใช่ CASCADE: ลบลูกค้าที่ยังมีเครื่องติดตั้งอยู่หน้างานไม่ได้
  -- (ของจริงยังอยู่ที่ไซต์ ข้อมูลหายแต่เครื่องไม่หาย)
  "customerId"    text NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  "customerName"  text,                           -- snapshot ตอนสร้าง
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  zone            text CHECK (zone IS NULL OR length(zone) <= 50),   -- จัดรอบวิ่ง 'BKK-E'
  address         text CHECK (address IS NULL OR length(address) <= 500),
  "mapUrl"        text CHECK ("mapUrl" IS NULL OR length("mapUrl") <= 500),
  "contactName"   text CHECK ("contactName" IS NULL OR length("contactName") <= 100),
  "contactPhone"  text CHECK ("contactPhone" IS NULL OR length("contactPhone") <= 50),

  -- ── ช่วงเวลาที่ไซต์ "ยอมให้เข้า" (มติผู้ใช้ 2026-07-30) ──
  -- ⚠️ คนละเรื่องกับเวลานัด: อันนี้เป็นข้อจำกัดถาวรของไซต์ (ห้างเปิด 10:00 ·
  --    โรงงานพัก 12:00-13:00) กรอกครั้งเดียวใช้ตลอด · เวลานัดอยู่ที่ service_visits
  -- ⚠️ ใช้ `time` ไม่ใช่ `timestamptz` — งานนี้เป็นเวลาไทยล้วน เก็บ date+time
  --    แยกกันปลอดภัยกว่าของที่แปลงโซนแล้วเลื่อนวันเงียบ ๆ
  "accessFrom"    time,
  "accessTo"      time,
  -- วันที่เข้าได้ = เลขวันในสัปดาห์แบบ JS (0=อาทิตย์ … 6=เสาร์) · [] = ไม่จำกัดวัน
  "accessDays"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "accessNote"    text CHECK ("accessNote" IS NULL OR length("accessNote") <= 1000),

  "isActive"      boolean NOT NULL DEFAULT true,
  "ownerId"       text, "ownerName" text,          -- ผู้ดูแลไซต์ (SV/TS)
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_sites_access_window CHECK (
    "accessFrom" IS NULL OR "accessTo" IS NULL OR "accessFrom" < "accessTo"
  ),
  CONSTRAINT service_sites_access_days_array CHECK (
    jsonb_typeof("accessDays") = 'array'
  )
);

CREATE INDEX IF NOT EXISTS service_sites_customer_idx
  ON public.service_sites ("customerId", name);
CREATE INDEX IF NOT EXISTS service_sites_zone_idx
  ON public.service_sites (zone) WHERE "isActive";

-- ── เครื่องกระจายกลิ่นในไซต์ ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_assets (
  id              text PRIMARY KEY,
  -- CASCADE: เครื่องไม่มีความหมายนอกไซต์ (ต่างจากไซต์ที่ไม่มีความหมายนอกลูกค้า
  -- แต่ต้องกันการลบเพราะของจริงยังอยู่)
  "siteId"        text NOT NULL REFERENCES public.service_sites(id) ON DELETE CASCADE,
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 150),
  model           text CHECK (model IS NULL OR length(model) <= 100),
  serial          text CHECK (serial IS NULL OR length(serial) <= 100),
  -- กลิ่นที่เติมอยู่ · SET NULL: ลบสินค้าแล้วเครื่องต้องอยู่ต่อ
  "productId"     text REFERENCES public.products(id) ON DELETE SET NULL,
  "productName"   text,                            -- snapshot
  "scentId"       text,                            -- ทะเบียนกลิ่น (logical link)
  -- ใช้ประเมินว่าน้ำหอมจะหมดวันไหน → เตือนถ้าไม่มีนัดก่อนหน้านั้น (refillDue)
  "bottleMl"      numeric CHECK ("bottleMl" IS NULL OR "bottleMl" > 0),
  "mlPerDay"      numeric CHECK ("mlPerDay" IS NULL OR "mlPerDay" > 0),
  "installedAt"   date,
  "removedAt"     date,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'repair', 'removed')),
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),

  -- กันปีพิมพ์ผิดแบบที่เจอมาแล้วบน prod (`formulaDate = '2202-08-06'`)
  CONSTRAINT service_assets_dates_sane CHECK (
    ("installedAt" IS NULL OR "installedAt" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("removedAt" IS NULL OR "removedAt" BETWEEN '2000-01-01' AND '2100-12-31')
  ),
  -- ถอดก่อนติดตั้งเป็นไปไม่ได้
  CONSTRAINT service_assets_removed_after_installed CHECK (
    "installedAt" IS NULL OR "removedAt" IS NULL OR "removedAt" >= "installedAt"
  )
);

CREATE INDEX IF NOT EXISTS service_assets_site_idx
  ON public.service_assets ("siteId", label);
-- serial ห้ามซ้ำทั้งระบบ **เฉพาะที่กรอกจริง** — เครื่องเดียวโผล่สองไซต์แปลว่าลืม
-- ย้ายทะเบียนตอนถอดไปติดที่ใหม่ ซึ่งทำให้ประวัติการเข้าบริการแยกร่างเงียบ ๆ
CREATE UNIQUE INDEX IF NOT EXISTS service_assets_serial_uk
  ON public.service_assets (lower(btrim(serial)))
  WHERE serial IS NOT NULL AND btrim(serial) <> '';

ALTER TABLE public.service_sites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_sites, public.service_assets FROM anon, authenticated;
GRANT  ALL ON TABLE public.service_sites, public.service_assets TO service_role;

COMMIT;

-- PostgREST cache ค้างชื่อ/คอลัมน์เก่าได้ — สั่ง reload ท้ายทุกใบ
NOTIFY pgrst, 'reload schema';
