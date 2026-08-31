-- ============================================================
--  Migration 0327 (M4 ของเฟสสัญญาบริการ): ทะเบียนติดตามการต่อสัญญา
--                                          (แผน docs/service-contract-phase-plan.md §PR-E)
--
--  ⭐ **ตารางนี้เก็บ "ผลการติดตาม" ไม่ใช่ "ใครใกล้หมดอายุ"**
--    รายชื่อไซต์ที่ใกล้หมดคำนวณสดจาก `service_zone_terms."endDate"` ทุกครั้งที่เปิดหน้า
--    ⇒ ไม่มีสถานะ "ใกล้หมดอายุ" เก็บในฐานให้เน่า (กติกาเดียวกับ termIsActive และ
--    serviceStatus ที่ห้ามเก็บ Expired) · แถวที่นี่เกิดเมื่อ **มีคนลงมือติดตาม** เท่านั้น
--
--  ⚠️ **หนึ่งไซต์มีเรื่องที่เปิดค้างได้ทีละเรื่อง** (unique index บน status='following')
--    ไซต์เดียวมีหลายโซน/หลายรอบที่ทยอยหมด แต่การติดตามลูกค้าเป็นเรื่องเดียว —
--    เปิดสองเรื่องพร้อมกัน = สองคนโทรหาลูกค้ารายเดียวกันคนละครั้ง
--
--  ⚠️ **`declineReason` บังคับเมื่อไม่ต่อ** (CHECK ≥ 10 ตัวอักษร) — "ไม่ต่อ" เป็นข้อมูล
--    ที่ทีมขายต้องอ่านย้อนได้ว่าเพราะอะไร ไม่ใช่แค่ปิดเรื่องให้หายจากจอ
--
--  ⚠️ `renewedSalesOrderId` เป็น **ผลลัพธ์** ไม่ใช่เงื่อนไข — เก็บตอนใบสั่งขายใบใหม่เกิด
--    (ON DELETE SET NULL: ใบถูกลบ/ยกเลิก ประวัติการติดตามยังต้องอยู่)
--
--  ⚠ รันมือบน Supabase SQL Editor · **ตารางใหม่ล้วน ไม่แตะข้อมูลเดิม** รันซ้ำได้
--    ⇒ รันก่อน deploy ได้เลย และต้องรันก่อนใช้งานหน้า /sa/renewals
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_renewal_followups (
  id                    text PRIMARY KEY,
  -- RESTRICT: ประวัติการติดตามคือของมีค่า — ลบไซต์ที่มีเรื่องติดตามไม่ได้
  -- (กติกาเดียวกับ service_zones/service_zone_terms ใน 0297)
  "siteId"              text NOT NULL REFERENCES public.service_sites(id) ON DELETE RESTRICT,
  -- คนที่รับผิดชอบตามเรื่อง (ฝั่งขาย) — ไม่ใช่ผู้ดูแลไซต์ซึ่งเป็นฝ่ายบริการ
  "ownerId"             text,
  "ownerName"           text,

  /* ⭐ **วันหมดที่เรื่องนี้ครอบ** — หนึ่งเรื่องคุมการต่อของ "รอบที่หมดวันนี้" หนึ่งครั้ง
     🔴 ถ้าไม่มีคอลัมน์นี้ ระบบจะตอบไม่ได้ว่า "ไซต์นี้ปิดเรื่องไปแล้ว" หมายถึงรอบไหน
        ⇒ ปีหน้ารอบใหม่หมดอีกครั้ง ไซต์จะเงียบหายจากทะเบียนตลอดกาลเพราะเคยปิดไปแล้ว
        (หรือถ้ากลับกัน: โผล่ซ้ำทุกวันทั้งที่ปิดไปแล้ว) · เก็บวันไว้จึงตอบได้ทั้งสองทาง
     ⚠️ ค่านี้คือ **วันหมดที่เร็วที่สุดของไซต์ ณ ตอนเปิดเรื่อง** — ตัวเดียวกับที่ทะเบียน
        ใช้เรียง (lib/service/renewals.js) */
  "coveredEndDate"      date NOT NULL,

  -- following = ยังตามอยู่ · renewed = ต่อแล้ว · declined = ลูกค้าไม่ต่อ
  -- ⚠️ ไม่มีสถานะ "หมดอายุ" — วันหมดคำนวณสดจาก term ไม่ใช่สถานะของเรื่อง
  status                text NOT NULL DEFAULT 'following'
                          CHECK (status IN ('following', 'renewed', 'declined')),

  "lastContactOn"       date,
  "nextContactOn"       date,
  "resultNote"          text CHECK ("resultNote" IS NULL OR length("resultNote") <= 2000),

  -- ต่อสัญญาแล้วได้ใบใหม่ใบไหน (ผลลัพธ์ · ไม่ใช่เงื่อนไข)
  "renewedSalesOrderId" text REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  "declineReason"       text CHECK ("declineReason" IS NULL OR length("declineReason") <= 2000),

  "openedAt"            timestamptz NOT NULL DEFAULT now(),
  "closedAt"            timestamptz,

  "createdById"         text, "createdByName" text,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),

  -- "ไม่ต่อ" ต้องบอกเหตุผลเสมอ (มติแผน §PR-E) — ปิดเรื่องเปล่า ๆ = ข้อมูลที่ทีมขาย
  -- เอาไปใช้ต่อไม่ได้ · btrim กันช่องว่างล้วนผ่านด่าน
  CONSTRAINT service_renewal_followups_decline_reason CHECK (
    status <> 'declined'
    OR ("declineReason" IS NOT NULL AND length(btrim("declineReason")) >= 10)
  ),
  -- วันที่ต้องอยู่ในช่วงที่เป็นไปได้ (แพตเทิร์นเดียวกับ service_plans/0188)
  CONSTRAINT service_renewal_followups_dates_sane CHECK (
    ("lastContactOn" IS NULL OR "lastContactOn" BETWEEN '2000-01-01' AND '2100-12-31')
    AND ("nextContactOn" IS NULL OR "nextContactOn" BETWEEN '2000-01-01' AND '2100-12-31')
  ),
  -- ปิดเรื่องแล้วต้องมีวันปิด และเรื่องที่ยังตามอยู่ต้องไม่มี (สองอย่างนี้เพี้ยนกันบ่อย
  -- เวลามีคนอัปเดตสถานะโดยลืมแตะ closedAt)
  CONSTRAINT service_renewal_followups_closed_at CHECK (
    (status = 'following' AND "closedAt" IS NULL)
    OR (status <> 'following' AND "closedAt" IS NOT NULL)
  )
);

-- ⭐ หนึ่งไซต์ = เปิดค้างได้ทีละเรื่อง · เรื่องที่ปิดแล้วมีกี่รอบก็ได้ (ประวัติการต่อสัญญา)
CREATE UNIQUE INDEX IF NOT EXISTS service_renewal_followups_open_uk
  ON public.service_renewal_followups ("siteId") WHERE status = 'following';

-- ทะเบียนเปิดมาต้องเรียง "ต้องติดต่อวันไหน" ได้ทันที
CREATE INDEX IF NOT EXISTS service_renewal_followups_next_idx
  ON public.service_renewal_followups ("nextContactOn") WHERE status = 'following';
CREATE INDEX IF NOT EXISTS service_renewal_followups_site_idx
  ON public.service_renewal_followups ("siteId", "openedAt" DESC);

COMMENT ON TABLE public.service_renewal_followups IS
  'ผลการติดตามต่อสัญญาบริการรายไซต์ (mig 0327) — รายชื่อ "ใกล้หมดอายุ" คำนวณสดจาก service_zone_terms."endDate" ไม่เก็บที่นี่';

-- สิทธิ์: แพตเทิร์นเดียวกับ 0297 — เข้าถึงผ่าน service_role เท่านั้น
-- (ระบบไม่มี RLS policy · ด่านสิทธิ์อยู่ในโค้ดล้วน — ดู docs ผลตรวจ 2026-08)
ALTER TABLE public.service_renewal_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_renewal_followups FROM anon, authenticated;
GRANT  ALL ON TABLE public.service_renewal_followups TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน:
--   SELECT count(*) FROM public.service_renewal_followups;                      -- ควรได้ 0
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'service_renewal_followups' AND column_name = 'coveredEndDate';  -- ควรได้ 1 แถว
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'service_renewal_followups';                             -- ควรได้ 4 แถว (pkey + 3)
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.service_renewal_followups'::regclass
--      AND contype = 'c';                                                       -- ควรเห็น decline_reason · dates_sane · closed_at · status
--
-- Rollback guidance:
--   DROP TABLE public.service_renewal_followups;   -- ตารางใหม่ล้วน ไม่มีข้อมูลเดิมพ่วง
