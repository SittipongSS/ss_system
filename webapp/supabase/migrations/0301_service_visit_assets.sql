-- ============================================================
--  Migration 0301: ผลรายเครื่องของนัดหนึ่งใบ (F-4 · ปิดงานรายเครื่อง)
--
--  มติ docs/service-field-operations.md ข้อ 6-7 · จากใบส่งงานจริง 2 เคสที่สคีมาเดิม
--  รับไม่ได้:
--    · เปลี่ยนเครื่อง — "เครื่องชั้น 3 ชำรุด ทางทีมได้นำเครื่องมาเปลี่ยน" ⇒ ต้องเป็น
--      ตัวเก่า removedAt + ตัวใหม่ installedAt ไม่ใช่ข้อความในช่องหมายเหตุ
--      (ไม่งั้นทะเบียนเครื่องเพี้ยนตั้งแต่เดือนแรก)
--    · ทำไม่ครบ — เครื่อง 4 ตัวทำแล้ว Reed 6 ขวดยังไม่ได้ทำ ⇒ ปิด done ก็โกหก
--      ปิด unable ก็โกหก · สถานะของใบต้องสรุปจากลูก
--
--  ── ทำไมเป็นตารางใหม่ ไม่ใช่คอลัมน์ outcome บน service_visit_items ──────────
--  1. เครื่องที่ "ทำไม่ได้" ไม่มีของถูกใช้เลย ⇒ ไม่มีแถว item ให้เขียน และ label
--     ของ items เป็น NOT NULL ⇒ ต้องแต่งแถวผีที่จะไปปนในรายงาน "ของที่ใช้"
--  2. เครื่องหนึ่งใช้ของสองชนิด = สอง item ⇒ ได้ outcome สองค่าที่ขัดกันบนเครื่องเดียว
--     ตารางนี้ใส่ UNIQUE (visitId, assetId) ได้ = ตอบ "เครื่องนี้ในนัดนี้จบยังไง" ค่าเดียว
--  3. items เป็นตาราง append + delete (ไม่มี PATCH ไม่มี updatedAt) แต่ outcome ต้องแก้ได้
--  4. consumption ต้องเดินเส้นเดียว item → asset → zone · ถ้า outcome อยู่บน items
--     ทุก query รวมยอดต้องเติม WHERE outcome <> 'unable' และลืมที่ไหนที่หนึ่งเมื่อไร
--     ตัวเลข ml/เดือนที่เทียบกับ standardMlPerMonth จะเพี้ยนเงียบ ๆ
--  5. replacedByAssetId เป็นความสัมพันธ์ asset→asset ห้อยกับ "ขวดน้ำหอมที่เติม" ไม่ได้
--
--  ⚠️ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน รันก่อน deploy ได้
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_visit_assets (
  id              text PRIMARY KEY,
  -- CASCADE เหมือน items — ผลรายเครื่องไม่มีความหมายนอกนัด
  "visitId"       text NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  -- ⚠️ RESTRICT **ตรงข้ามกับ service_visit_items.assetId ที่เป็น SET NULL โดยตั้งใจ**:
  -- item ที่ assetId หลุดยังอ่านได้จาก label ที่เหลืออยู่ แต่ "ผลรายเครื่อง" ที่ไม่รู้ว่า
  -- เครื่องไหนคือแถวที่อ่านไม่ได้เลย ⇒ ลบเครื่องที่มีประวัติการเข้าไม่ได้
  "assetId"       text NOT NULL REFERENCES public.service_assets(id) ON DELETE RESTRICT,

  outcome         text NOT NULL CHECK (outcome IN (
    'done',      -- ทำเรียบร้อย
    'unable',    -- ทำไม่ได้ — บังคับเหตุผล
    'swapped'    -- เปลี่ยนเครื่อง — บังคับเหตุผล + ตัวแทน
  )),
  reason          text CHECK (reason IS NULL OR length(reason) <= 500),
  -- เครื่องที่เอามาแทน (ตัวเก่าถูกตั้ง removedAt · ตัวใหม่ installedAt ที่ route เดียวกัน)
  "replacedByAssetId" text REFERENCES public.service_assets(id) ON DELETE SET NULL,

  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),

  -- เครื่องหนึ่งในนัดหนึ่งจบได้แบบเดียว
  CONSTRAINT service_visit_assets_once UNIQUE ("visitId", "assetId"),
  -- "ทำไม่ได้" กับ "เปลี่ยนเครื่อง" ต้องอธิบายได้เสมอ — สองอย่างนี้คือสิ่งที่หัวหน้าต้องอ่าน
  CONSTRAINT service_visit_assets_needs_reason CHECK (
    outcome = 'done' OR (reason IS NOT NULL AND length(btrim(reason)) >= 5)
  ),
  -- เปลี่ยนเครื่องต้องบอกว่าเอาตัวไหนมาแทน ไม่งั้นทะเบียนขาดตอน
  CONSTRAINT service_visit_assets_swap_needs_target CHECK (
    outcome <> 'swapped' OR "replacedByAssetId" IS NOT NULL
  ),
  -- เปลี่ยนเป็นตัวเดิมไม่ใช่การเปลี่ยน
  CONSTRAINT service_visit_assets_swap_not_self CHECK (
    "replacedByAssetId" IS NULL OR "replacedByAssetId" <> "assetId"
  )
);

-- ⚠️ จงใจ **ไม่มี zoneId** — โซนมาจาก asset เสมอ (เส้นเดียว item/result → asset → zone)
-- ⚠️ จงใจ **ไม่มี productId / qty** — ปริมาณที่ใช้อยู่ที่ service_visit_items ที่เดียว
--    (เทสต์ยาม lib/service/serviceSchemaGuards.test.mjs คุมทั้งสองข้อ)

CREATE INDEX IF NOT EXISTS service_visit_assets_visit_idx
  ON public.service_visit_assets ("visitId");
-- หน้าอุปกรณ์รายตัวอ่านประวัติของเครื่องข้ามนัด
CREATE INDEX IF NOT EXISTS service_visit_assets_asset_idx
  ON public.service_visit_assets ("assetId", "createdAt" DESC);

ALTER TABLE public.service_visit_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_visit_assets FROM anon, authenticated;
GRANT  ALL ON TABLE public.service_visit_assets TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
