-- ============================================================
--  Migration 0432: เหตุผลปิดแถวคำร้อง (declineReason) ยาวได้เท่าข้อความที่จอยอม — 4000 ตัวอักษร
--
--  🐞 อาการ (11/11/2026): บันทึกคำตอบลูกค้า "ไม่เอา" ในคำร้องพัฒนากลิ่น แล้วขึ้น error ดิบ
--     new row for relation "dept_request_items" violates check constraint
--     "material_price_ask_items_noQuoteReason_check"
--
--  ── ต้นเหตุ ──────────────────────────────────────────────────────────────
--   0158 สร้าง material_price_ask_items."noQuoteReason" พร้อม CHECK ระดับคอลัมน์ ≤ 500 ตัวอักษร
--   (Postgres ตั้งชื่ออัตโนมัติ material_price_ask_items_noQuoteReason_check)
--   0204 เปลี่ยนชื่อคอลัมน์เป็น "declineReason" และถอดเฉพาะ CHECK ที่อ่าน priceStatus —
--   ด่าน ≤ 500 ตัวนี้ไม่อ่าน priceStatus จึงรอดมา ติดชื่อเก่า และย้ายไปคุมคอลัมน์ใหม่เงียบ ๆ
--   แต่แอปเขียน declineReason ยาวกว่านั้นได้สองทาง (lib/requests/hops.js):
--     · ลูกค้า "ไม่เอา" — คัดลอกข้อความที่ลูกค้าบอก (outcomeNote ≤ 4000) มาเป็นเหตุผล
--     · ฝ่ายปฏิเสธแถวเอกสาร — เหตุผล ≤ 2000
--   ⇒ ข้อความเกิน 500 ตัว = บันทึกไม่ได้ทั้งแถว
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--   ถอดด่านชื่อเก่า แล้วตั้งด่านใหม่ชื่อตรงตัว ≤ 4000 (เท่า outcomeNote ที่มันคัดลอกมา)
--
--  ── ผลต่อข้อมูลเดิม ──────────────────────────────────────────────────────
--   ไม่มี — แถวเดิมทุกแถวผ่านด่าน ≤ 500 มาแล้ว จึงผ่าน ≤ 4000 แน่นอน · ไม่ backfill
--
--  ── ลำดับรันกับ deploy ────────────────────────────────────────────────────
--   รันก่อนหรือหลัง merge ก็ได้ — โค้ดไม่เปลี่ยนสิ่งที่เขียน ไฟล์นี้แค่ปลดด่านที่แคบเกิน
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้) · รันซ้ำได้ ไม่มีผล
--  ✅ รันบนฐานจริงแล้ว 11/11/2026 — เหลือ answer_evidence + decline_reason_length_check (<= 4000)
--     ด่านชื่อเก่า material_price_ask_items_noQuoteReason_check หายแล้ว
-- ============================================================

BEGIN;

ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS "material_price_ask_items_noQuoteReason_check";
ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_decline_reason_length_check;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_decline_reason_length_check
  CHECK ("declineReason" IS NULL OR length("declineReason") <= 4000);

COMMIT;

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.dept_request_items'::regclass
--    AND pg_get_constraintdef(oid) ILIKE '%declineReason%';
--   -- ต้องเห็น dept_request_items_decline_reason_length_check (<= 4000) + answer_evidence
--   -- และไม่มี material_price_ask_items_noQuoteReason_check แล้ว
--
-- ── ทางกลับ ─────────────────────────────────────────────────────────────
-- (ต้องไม่มีแถวที่ declineReason ยาวเกิน 500 ก่อน)
-- ALTER TABLE public.dept_request_items DROP CONSTRAINT IF EXISTS dept_request_items_decline_reason_length_check;
-- ALTER TABLE public.dept_request_items ADD CONSTRAINT "material_price_ask_items_noQuoteReason_check"
--   CHECK ("declineReason" IS NULL OR length("declineReason") <= 500);
