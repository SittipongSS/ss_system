-- ============================================================
--  Migration 0335: ประวัติการย้าย/เปลี่ยนสถานะของเครื่อง (ทะเบียนเครื่อง เฟส C)
--  ม็อก ~/ss-team/mockups/machine-registry จอ 06-07 · ต่อจาก mig 0332
--
--  ⭐ **ปัญหาที่ใบนี้แก้** — mig 0332 ทำให้ "ถอดจากหน้างาน" กลายเป็น *การย้ายไซต์*
--    และ "ส่งซ่อม/ปลดระวาง" เป็น *การเปลี่ยน status* ซึ่งทั้งคู่คือ **UPDATE ทับค่าเดิม**
--    ⇒ ไม่เหลือร่องรอยเลย · และ `installedAt`/`removedAt` มีคู่เดียวต่อเครื่อง
--      ⇒ เครื่องที่ย้ายรอบสองทับประวัติรอบแรกทิ้งเงียบ ๆ
--    คำถามที่ธุรกิจถามจริง ("กล่องใบนี้ผ่านอะไรมาบ้าง") จึงตอบไม่ได้
--
--  ⚠️ **ทำไมไม่ขัดกับ "ห้ามมีตาราง event ของอุปกรณ์"** (lib/service/assetHistory.js:7)
--    คอมเมนต์นั้นห้าม "ตารางที่ต้องเขียน **คู่ขนาน** กับสามตารางเดิม" เพราะของคู่ขนาน
--    จะไม่ตรงกับความจริงภายในเดือนเดียว · ใบนี้ทำตรงข้าม: ตารางนี้เป็น **ทางเขียนเดียว**
--    ของทุกคำสั่งย้าย/เปลี่ยนสถานะ แล้ว `siteId`/`status` บนตัวเครื่องกลายเป็น
--    **ภาพสรุปของแถวล่าสุด** ไม่ใช่แหล่งข้อมูลคู่แข่ง ⇒ ไม่มีทางเดินหนีกัน
--
--  ⚠️ ไม่ใช้ audit_logs แทน (ถึงจะมีข้อมูลอยู่แล้ว): อ่านได้เฉพาะ cap `audit:view`
--    ⇒ ช่างเห็นไทม์ไลน์ว่างครึ่งใบ · ไม่มีเส้นอ่านรายเครื่อง · และ
--    scripts/archive-audit-logs.mjs ลบแถวเก่าทิ้งเพื่อคืนพื้นที่ ⇒ ประวัติหายเป็นช่วง ๆ
--
--  ⚠ รันมือบน Supabase SQL Editor · **ตารางใหม่ล้วน รันก่อน deploy ได้เลย**
--    (โค้ดเก่าไม่รู้จักตารางนี้ · โค้ดใหม่ต้องมีตารางถึงจะบันทึกคำสั่งได้)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_asset_moves (
  id              text PRIMARY KEY,

  -- CASCADE — ประวัติการย้ายไม่มีความหมายถ้าเครื่องไม่อยู่แล้ว
  -- (ต่างจาก service_visit_assets ที่ RESTRICT เพราะมันคือ *ผลงาน* ของนัด ไม่ใช่ของเครื่อง)
  "assetId"       text NOT NULL REFERENCES public.service_assets(id) ON DELETE CASCADE,

  /* ชนิดของการเคลื่อนไหว — คำที่ผู้ใช้พูด ไม่ใช่ชื่อคอลัมน์ที่เปลี่ยน
     ⚠️ `install` กับ `transfer` เขียนคอลัมน์เดียวกันเป๊ะ แต่แยกกันเพราะ **คำถามที่ต้อง
        ตอบต่างกัน**: ติดตั้งจากคลังไม่ต้องบอกว่าทำไมถึงถอดจากที่เดิม ส่วนย้ายต้องบอก */
  kind            text NOT NULL CHECK (kind IN (
    'receive',      -- รับเครื่องเข้าคลัง (จุดเกิดของเครื่อง)
    'install',      -- คลัง → ไซต์ลูกค้า
    'transfer',     -- ไซต์ลูกค้า → ไซต์ลูกค้า
    'return',       -- ไซต์ลูกค้า → คลัง
    'repair',       -- ส่งไปซ่อม (ออกจากมือ)
    'repair_done',  -- ได้คืนจากซ่อม
    'condition',    -- แจ้งเปลี่ยนสภาพอย่างเดียว (ชำรุด/ซ่อมเองแล้ว) ไม่ได้ย้ายที่
    'retire'        -- ปลดระวาง
  )),

  -- วันที่เกิดเหตุจริง (ผู้ใช้กรอก) — คนละเรื่องกับ createdAt ที่เป็นเวลาที่กดบันทึก
  -- ⚠️ ช่างกรอกย้อนหลังเป็นเรื่องปกติ ⇒ เรียงไทม์ไลน์ด้วยช่องนี้ ไม่ใช่ createdAt
  "movedAt"       date NOT NULL,

  /* ที่มา/ปลายทาง — เก็บทั้งคู่เพื่อให้อ่านแถวเดียวจบ ไม่ต้องไล่ย้อนแถวก่อนหน้า
     ⚠️ SET NULL ไม่ใช่ CASCADE: ลบไซต์ทิ้งแล้วประวัติต้องยังอยู่ (แค่ไม่รู้ชื่อที่)
     ⚠️ เก็บ **ชื่อ ณ ตอนนั้น** ด้วย — ไซต์เปลี่ยนชื่อทีหลังแล้วประวัติต้องไม่เพี้ยน
        (กติกาเดียวกับ snapshot ชื่อลูกค้าบนเอกสาร) */
  "fromSiteId"    text REFERENCES public.service_sites(id) ON DELETE SET NULL,
  "fromSiteName"  text CHECK ("fromSiteName" IS NULL OR length("fromSiteName") <= 150),
  "fromZoneId"    text REFERENCES public.service_zones(id) ON DELETE SET NULL,
  "toSiteId"      text REFERENCES public.service_sites(id) ON DELETE SET NULL,
  "toSiteName"    text CHECK ("toSiteName" IS NULL OR length("toSiteName") <= 150),
  "toZoneId"      text REFERENCES public.service_zones(id) ON DELETE SET NULL,

  -- ค่าก่อน/หลังของสองแกน — ไทม์ไลน์ต้องบอกได้ว่า "จากอะไรเป็นอะไร" ไม่ใช่แค่ปลายทาง
  "statusBefore"    text, "statusAfter"    text,
  "conditionBefore" text, "conditionAfter" text,

  /* เหตุผล — บังคับเฉพาะคำสั่งที่ "ต้องอธิบายได้" (ดู CHECK ด้านล่าง)
     ⚠️ ไม่บังคับทุกชนิด — บังคับกับของที่ไม่มีอะไรให้อธิบายจะได้ข้อความขยะ
        แล้วช่องเหตุผลทั้งคอลัมน์ก็ถูกเมินไปด้วย */
  reason          text CHECK (reason IS NULL OR length(reason) <= 500),
  note            text CHECK (note IS NULL OR length(note) <= 1000),

  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_asset_moves_dates_sane CHECK (
    "movedAt" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
  ),

  /* 🔴 คำสั่งที่ "ต้องมีคนตอบได้ว่าทำไม" — ย้าย · ถอนกลับคลัง · ปลดระวาง
     สามอันนี้คือสิ่งที่หัวหน้าจะย้อนมาอ่าน และเป็นสามอันที่ถ้าไม่บังคับตอนนี้
     จะไม่มีใครกรอกเลย (บทเรียนจาก service_visit_assets_needs_reason ของ 0301) */
  CONSTRAINT service_asset_moves_needs_reason CHECK (
    kind NOT IN ('transfer', 'return', 'retire')
    OR (reason IS NOT NULL AND length(btrim(reason)) >= 3)
  ),

  -- ย้ายไปที่เดิมไม่ใช่การย้าย
  CONSTRAINT service_asset_moves_real_move CHECK (
    kind NOT IN ('install', 'transfer', 'return')
    OR "toSiteId" IS DISTINCT FROM "fromSiteId"
  )
);

/* ไทม์ไลน์ของเครื่องหนึ่งตัว = คำถามเดียวที่ตารางนี้ตอบ ⇒ index ตรงรูปนั้น
   ⚠️ `id` ปิดท้าย — ย้ายสองครั้งในวันเดียวกันมีจริง (ถอนตอนเช้า ติดตั้งตอนบ่าย)
      ถ้าเรียงด้วย movedAt อย่างเดียว ลำดับจะสลับไปมาระหว่างการโหลด */
CREATE INDEX IF NOT EXISTS service_asset_moves_asset_idx
  ON public.service_asset_moves ("assetId", "movedAt" DESC, id DESC);

-- "เครื่องอะไรเข้า-ออกไซต์นี้บ้าง" — คำถามของหน้าไซต์ (เฟสถัดไป)
CREATE INDEX IF NOT EXISTS service_asset_moves_site_idx
  ON public.service_asset_moves ("toSiteId", "movedAt" DESC);

COMMENT ON TABLE public.service_asset_moves IS
  'ประวัติการย้าย/เปลี่ยนสถานะของเครื่อง (mig 0335) — **ทางเขียนเดียว** ของคำสั่งเฟส C '
  'service_assets.siteId/status เป็นภาพสรุปของแถวล่าสุด ไม่ใช่แหล่งข้อมูลคู่แข่ง';
COMMENT ON COLUMN public.service_asset_moves."movedAt" IS
  'วันที่เกิดเหตุจริง (ผู้ใช้กรอก · กรอกย้อนหลังได้) — ไทม์ไลน์เรียงด้วยช่องนี้ ไม่ใช่ createdAt';

-- RLS เปิดแต่ไม่มี policy + REVOKE — แพตเทิร์นเดียวกับทุกตารางในโมดูล (สิทธิ์อยู่ในโค้ด)
ALTER TABLE public.service_asset_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_asset_moves FROM anon, authenticated;
GRANT ALL ON public.service_asset_moves TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
