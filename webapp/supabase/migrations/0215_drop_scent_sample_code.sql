-- ══════════════════════════════════════════════════════════════════════
--  0215: ถอด "รหัสตัวอย่าง" (scents."sampleCode") ออกจากทะเบียนกลิ่น
--
--  มติผู้ใช้ 2026-08-06: ไม่ใช้แล้ว — รหัสเดียวที่ทะเบียนถือคือ `scents.code`
--  (ตรงกับ ม-10 ใน docs/requests-rd-decision-log.md) · สายงานใหม่บันทึกการส่ง
--  ตัวอย่างผ่านคำร้อง (dept_request_scents / direction ของ 0213) ไม่ใช่ผ่านทะเบียน
--
--  ── 🔍 ตรวจของจริงก่อนรัน (2026-08-06) — ทิ้งได้ ไม่เสียข้อมูล ─────────
--  0206 เคยจงใจ **เก็บ** คอลัมน์นี้ไว้ ด้วยเหตุผลว่า sampleCode คือ "รหัสของ
--  ตัวอย่างที่ส่งออกไปจริง" ซึ่ง *คนละรหัส* กับ scents.code ⇒ ทิ้งแล้วสายที่โยง
--  กลับไปหาขวดที่ลูกค้าถืออยู่จะขาด
--
--  ⭐ ดึงของจริงมาดูทั้ง 29 แถวแล้ว (ขั้น 0 ข้างล่าง) พบว่า **sampleCode = code
--  ทุกแถว ไม่มีข้อยกเว้น** — PF1092501…PF1095401 · PF1190101-103 · PF4400101-103 ·
--  PF7670101-103 · PF8020101-103 ล้วนซ้ำกับ code ของกลิ่นตัวเดียวกันเป๊ะ
--  ⇒ สมมติฐานของ 0206 **ไม่ตรงกับข้อมูล** · คนกรอกใส่รหัสเดียวกันทั้งสองช่อง
--  ⇒ ทิ้งคอลัมน์นี้ = ไม่มีข้อมูลอะไรหายเลย สายไปหาขวดยังอยู่ครบที่ `code`
--
--  (ขั้น 0 คงไว้ให้รันซ้ำได้ เผื่อ prod มีแถวใหม่หลังวันที่ตรวจ — ถ้าผลออกมามี
--   แถวไหน sampleCode ≠ code ให้หยุด แล้วคุยก่อนว่าจะเก็บของนั้นไว้ยังไง)
--
--  ลำดับ deploy: รันได้ทั้งก่อนและหลัง deploy — โค้ดอ่านกลิ่นด้วย select('*')
--  และไม่มีที่ไหนเขียนค่านี้ (ตั้งแต่ 0206 มันเป็นช่องอ่านอย่างเดียวบนตาราง)
--  รันก่อน deploy = คอลัมน์ "รหัส" แค่ไม่มีบรรทัด "ตัวอย่าง …" ห้อยอยู่ ไม่พัง
--
--  ⚠ รันมือบน Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- ── 0) ด่านตรวจก่อนทิ้ง — ต้องได้ **0 แถว** ถึงจะรันต่อได้ ────────────────
-- แถวที่โผล่มาคือแถวที่ sampleCode ถือข้อมูลที่ code ไม่มี = ของที่จะหายจริง
-- (2026-08-06 รันแล้วได้ 0 แถว · ทั้ง 29 แถวซ้ำกับ code เป๊ะ)
-- SELECT id, code, name, "sampleCode", "sentAt"
--   FROM public.scents
--  WHERE NULLIF(btrim(COALESCE("sampleCode", '')), '') IS NOT NULL
--    AND btrim("sampleCode") IS DISTINCT FROM btrim(COALESCE(code, ''))
--  ORDER BY code;

BEGIN;

-- CHECK scents_sample_code_len (ตั้งใน 0206) ถูกลบไปพร้อมคอลัมน์เองโดยอัตโนมัติ
-- — เขียนบรรทัดนี้ไว้กันกรณีเคยรัน 0206 ครึ่งทางจนเหลือ constraint ลอย
ALTER TABLE public.scents
  DROP CONSTRAINT IF EXISTS scents_sample_code_len;

ALTER TABLE public.scents
  DROP COLUMN IF EXISTS "sampleCode";

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'scents'
--    AND column_name = 'sampleCode';                   -- ต้องได้ 0 แถว
--
-- ── Rollback ───────────────────────────────────────────────────────────
-- ALTER TABLE public.scents ADD COLUMN "sampleCode" text;
-- UPDATE public.scents SET "sampleCode" = code WHERE code IS NOT NULL;
-- ⇒ ได้ค่าเดิมคืน **ครบทุกแถว** เพราะของจริง sampleCode = code เสมอ (ดูหัวไฟล์)
