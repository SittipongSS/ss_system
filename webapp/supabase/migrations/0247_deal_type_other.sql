-- ============================================================
--  Migration 0247: ประเภทดีลค่าที่ 4 — 'OTHER' (อื่นๆ)  (มติผู้ใช้ 2026-08-13)
--
--  ⭐ ของเดิม (mig 0088) มี 3 ค่า SCENT / NPD / RE-ORDER ซึ่งทั้งสามเป็น
--  "เส้นทางผลิต" ที่ตรงกับ `projects.type` แบบ 1:1 และมีแม่แบบไทม์ไลน์ของตัวเอง
--  (`workflow_templates."templateKey"` — mig 0121) · งานขายที่ไม่เข้าสามข้อนั้น
--  วันนี้ถูกยัดเป็น NPD ทิ้งไว้ แล้วตัวเลขแยกตามประเภทก็เพี้ยนตาม
--
--  ⚠️ **'OTHER' เป็นประเภทฝั่งขายล้วน — ไม่ก่อตั้งโครงการ**
--  จึง **ไม่แตะ** สอง CHECK ที่เหลือโดยเจตนา:
--    · `projects_type_check`                  — โครงการยังมี 3 ชนิดเท่าเดิม
--    · `workflow_templates."templateKey"`     — ไม่มีแม่แบบไทม์ไลน์ของ 'OTHER'
--  ฝั่งโค้ดกันไว้ตรงกัน: สร้างโครงการ / ผูกโครงการเดิม / gen ไทม์ไลน์ ตอบ 400
--  พร้อมเหตุผล ไม่ใช่ปล่อยไปตายที่ "ไม่มี Workflow Template" ซึ่งอ่านไม่รู้เรื่อง
--  (ดู `PROJECT_TYPES` / `dealTypeFoundsProject` ใน src/lib/salesPlanning.js)
--
--  ℹ️ `commercial_presets."dealType"` ไม่ต้องแก้ — คอลัมน์นั้นถูกถอดไปแล้วใน mig 0149
--
--  ⚠ additive ล้วน (ขยายชุดค่าที่ยอมรับ) · รันซ้ำได้ · ไม่มี backfill เพราะไม่มี
--    ทางรู้ว่าดีล NPD ใบไหน "จริง ๆ แล้วเป็นอื่นๆ" — ให้ AE ย้ายเองทีละใบ
--  ⚠ รันมือบน Supabase SQL Editor
--  🛑 **ต้องรันก่อน deploy** — โค้ดใหม่ยิงค่า 'OTHER' เข้ามาได้ทันทีที่ขึ้น
-- ============================================================

BEGIN;

-- DROP แล้ว ADD ใหม่ (ADD CONSTRAINT ไม่มี IF NOT EXISTS) — ชื่อ constraint เดิมจาก 0088
ALTER TABLE public.sales_deals DROP CONSTRAINT IF EXISTS sales_deals_deal_type_check;
ALTER TABLE public.sales_deals
  ADD CONSTRAINT sales_deals_deal_type_check
  CHECK ("dealType" IN ('SCENT', 'NPD', 'RE-ORDER', 'OTHER'));

COMMIT;

NOTIFY pgrst, 'reload schema';
