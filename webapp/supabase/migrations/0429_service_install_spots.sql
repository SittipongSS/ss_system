-- ============================================================
--  Migration 0429: ขั้นเข้าติดตั้ง — จุดติดตั้งรายเครื่อง (ชื่อจุด + รูป) + หมายเหตุโซน (PR-5a)
--
--  ⭐ มติเจ้าของ 09/11/2026 (ม็อก C2 `CrewInstallZone` · canvas SyaNH4AYeBfnkP9EVFCwaz · แผน ~/ss-team/mockups/service-install/PLAN.md):
--     หน้าโซนของช่าง = รายการจุด · หนึ่งจุดต่อหนึ่งเครื่องที่ TS วางไว้ (`service_visit_planned_assets`)
--     · "ติดตั้งแล้ว" ต้องมี **รูป + ชื่อจุดที่ติดจริง** · "ติดไม่ได้" ต้องมีเหตุ (เครื่องกลับคลัง)
--     · หมายเหตุโซน ไม่บังคับ (เช่น ลูกค้าขอย้ายจุดจากที่วางไว้)
--
--  ⭐ ผลรายเครื่อง (ติดตั้งแล้ว/ติดไม่ได้ + เหตุ) **ไม่อยู่ที่นี่** — อยู่ `service_visit_assets` ตารางเดิมของผลรายเครื่อง
--     (outcome 'done' | 'unable' + reason) ⇒ ขั้นของคำขอ ("ติดตั้งแล้ว" = นัดปิดแล้วมีเครื่องผล done) อ่านที่เดิม ไม่ต้องแก้
--     ไฟล์นี้เก็บแค่สิ่งที่ตารางนั้นไม่มีที่ใส่: ชื่อจุด + รูปของจุด (ต่อแถวเครื่องที่วาง) · หมายเหตุโซน (ต่อแถวโซนของนัด)
--  ⭐ ตอนส่งงาน ชื่อจุดถูกคัดลอกลง `service_assets.spot` (ทะเบียนเครื่องรู้ว่าติดตรงไหน) พร้อมคำสั่งย้าย 'install' ขึ้นโซน
--     ⇒ ที่นี่คือ "ร่องรอยของนัด" (ช่างกรอกอะไร เมื่อไร ใคร) ส่วนทะเบียนคือ "ตอนนี้เครื่องอยู่ไหน"
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--   1) service_visit_planned_assets + "spotName" (≤150 = เพดานเดียวกับ service_assets.spot) · "photoUrl" · "photoName"
--      · ร่องรอยคนบันทึก "savedAt" / "savedById" / "savedByName"
--   2) service_visit_zones + "note" (≤1000)
--
--  ── ผลต่อข้อมูลเดิม ──────────────────────────────────────────────────────
--   ไม่มี — คอลัมน์ใหม่ว่างทุกแถว · ไม่ backfill · โค้ดก่อน PR-5a ไม่อ่าน/เขียนคอลัมน์นี้
--   · ลำดับรันกับ deploy: **รันไฟล์นี้ก่อน merge PR-5a** (API ใหม่เขียนคอลัมน์เหล่านี้ · ทั้งเส้นอยู่หลังสวิตช์ SERVICE_INSTALL_STEP)
--
--  ── ทางกลับ ─────────────────────────────────────────────────────────────
--   ALTER TABLE public.service_visit_planned_assets DROP COLUMN IF EXISTS "spotName", DROP COLUMN IF EXISTS "photoUrl",
--     DROP COLUMN IF EXISTS "photoName", DROP COLUMN IF EXISTS "savedAt", DROP COLUMN IF EXISTS "savedById",
--     DROP COLUMN IF EXISTS "savedByName";
--   ALTER TABLE public.service_visit_zones DROP COLUMN IF EXISTS "note";
--   ⚠️ ชื่อจุด/รูปที่ช่างบันทึกไว้หายถาวร (ชื่อจุดของเครื่องที่ส่งงานแล้วยังอยู่ที่ service_assets.spot)
--  ✅ รันซ้ำได้ (IF NOT EXISTS · DROP CONSTRAINT IF EXISTS ก่อน ADD)
--  ── เช็กหลังรัน (วางต่อท้ายใน SQL Editor) ───────────────────────────────────
--   select
--     (select count(*) from information_schema.columns where table_schema='public' and table_name='service_visit_planned_assets'
--        and column_name in ('spotName','photoUrl','photoName','savedAt','savedById','savedByName')) as planned_cols_6,
--     (select count(*) from information_schema.columns where table_schema='public' and table_name='service_visit_zones'
--        and column_name = 'note') as zone_note_1;
-- ============================================================

BEGIN;

-- ── 1) จุดติดตั้งรายเครื่อง ─────────────────────────────────────────────────
ALTER TABLE public.service_visit_planned_assets
  ADD COLUMN IF NOT EXISTS "spotName"    text,
  ADD COLUMN IF NOT EXISTS "photoUrl"    text,
  ADD COLUMN IF NOT EXISTS "photoName"   text,
  ADD COLUMN IF NOT EXISTS "savedAt"     timestamptz,
  ADD COLUMN IF NOT EXISTS "savedById"   text,
  ADD COLUMN IF NOT EXISTS "savedByName" text;

ALTER TABLE public.service_visit_planned_assets DROP CONSTRAINT IF EXISTS service_visit_planned_assets_spot_name;
ALTER TABLE public.service_visit_planned_assets ADD CONSTRAINT service_visit_planned_assets_spot_name
  CHECK ("spotName" IS NULL OR length(btrim("spotName")) BETWEEN 1 AND 150);
ALTER TABLE public.service_visit_planned_assets DROP CONSTRAINT IF EXISTS service_visit_planned_assets_photo;
ALTER TABLE public.service_visit_planned_assets ADD CONSTRAINT service_visit_planned_assets_photo
  CHECK (("photoUrl" IS NULL OR length("photoUrl") BETWEEN 1 AND 2000) AND ("photoName" IS NULL OR length("photoName") <= 255));

COMMENT ON COLUMN public.service_visit_planned_assets."spotName" IS
  'ชื่อจุดที่ช่างติดจริง (mig 0429 · ม็อก C2) — ตอนส่งงานคัดลอกลง service_assets.spot · ผลรายเครื่องอยู่ service_visit_assets';
COMMENT ON COLUMN public.service_visit_planned_assets."photoUrl" IS
  'รูปของจุดติดตั้ง (mig 0429) — "ติดตั้งแล้ว" ต้องมีรูป + ชื่อจุด (API ตรวจ)';

-- ── 2) หมายเหตุโซน ─────────────────────────────────────────────────────────
ALTER TABLE public.service_visit_zones ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE public.service_visit_zones DROP CONSTRAINT IF EXISTS service_visit_zones_note_len;
ALTER TABLE public.service_visit_zones ADD CONSTRAINT service_visit_zones_note_len
  CHECK ("note" IS NULL OR length("note") <= 1000);
COMMENT ON COLUMN public.service_visit_zones."note" IS
  'หมายเหตุโซนของนัดติดตั้ง (mig 0429 · ไม่บังคับ) — เช่น ลูกค้าขอย้ายจุดจากที่วางไว้';

COMMIT;
