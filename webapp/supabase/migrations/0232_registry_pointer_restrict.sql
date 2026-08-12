-- ── ปิดรูรั่ว "ลบทะเบียนแล้วลิงก์หายเงียบ" (R-5 ของ request-hub-rebuild-plan) ──
--
-- 🐞 **พิสูจน์แล้วจาก audit log บน prod** (บันทึกไว้ใน `docs/request-hub-rebuild-plan.md`
-- §1) — ลบกลิ่น/สูตรออกจากทะเบียนแล้ว pointer บนคำร้องและบนทะเบียนราคาถูกเซ็ตเป็น
-- NULL **เงียบ ๆ**: ไม่มี error ไม่มี warning · audit log ที่เขียนว่า "ผูกกลิ่นในทะเบียน"
-- กลายเป็นคำโกหกทันที และไม่มีทางต่อกลับได้เพราะไม่มีที่ไหนเก็บว่าเคยชี้ไปตัวไหน
--
-- ⭐ **RESTRICT ไม่ใช่ CASCADE** — ของที่อ้างอยู่คือ *หลักฐาน* ไม่ใช่ *ของลูก*:
-- คำร้องที่ปิดไปแล้วบอกว่าราคานั้นของกลิ่นไหน · ทะเบียนราคาไม่มีความหมายถ้าไม่รู้ว่า
-- ราคาของอะไร ⇒ ต้องกันไม่ให้ลบ แล้วบอกเหตุผล ไม่ใช่ลบตามให้
--
-- ⚠️ **`products` คง `SET NULL` ตามมติในแผน** — สินค้ามีตัวตนของตัวเอง (รหัส FG ·
-- ชื่อ · ลูกค้า) กลิ่น/สูตรของมันเปลี่ยนได้ตามรอบผลิต ⇒ ชี้ไปที่ว่างยังอ่านออก
--
-- ⚠️ **ผู้ดูแลระบบยังลบได้** — แต่ต้องผ่านทาง break-glass ที่ **ปลดการเชื่อมโยงเอง
-- ก่อนลบ** (`lib/forceDelete.js` + route ของกลิ่น/สูตร) ⇒ สิ่งที่เคยเกิดเงียบ ๆ
-- กลายเป็นสิ่งที่ต้องกดยืนยันหลังเห็นรายการว่าจะปลดอะไรบ้าง
-- (มาตรฐานเดียวกับ `admin-force-delete-standard` · แพตเทิร์นเดียวกับ mig 0210)
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)
--
-- 🪤 **ไฟล์นี้เคยชื่อ 0231 แล้วชนกับ `0231_product_formula_one_to_one.sql` (#1158)
-- ที่เข้า main ก่อน** — เปลี่ยนเป็น 0232 ได้เพราะสาขานี้ยังไม่ merge (ต่างจากเคส 0230
-- ที่เข้า main ทั้งคู่แล้วจึงต้องขึ้นทะเบียนเป็นข้อยกเว้น) · **เนื้อ SQL ไม่เปลี่ยน**
-- และรันบน production ไปแล้วเมื่อ 2026-08-12 ⇒ ชื่อไฟล์เป็นเรื่องของ git ล้วน
-- ⚠️ ก่อนจองเลข ให้ `git fetch` แล้วดู `ls supabase/migrations | tail` ของ **main**
-- ไม่ใช่ของเวิร์กทรีตัวเอง — สาขาอื่นที่ยังไม่ merge มองไม่เห็นจากที่นี่

BEGIN;

-- ── 1) คำร้อง: กลิ่น/สูตรที่ใบนี้อ้างถึง ─────────────────────────────────
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS "dept_requests_scentId_fkey",
  DROP CONSTRAINT IF EXISTS "dept_requests_formulaId_fkey";

ALTER TABLE public.dept_requests
  ADD CONSTRAINT "dept_requests_scentId_fkey"
    FOREIGN KEY ("scentId") REFERENCES public.scents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT "dept_requests_formulaId_fkey"
    FOREIGN KEY ("formulaId") REFERENCES public.formulas(id) ON DELETE RESTRICT;

-- ── 2) บรรทัดคำร้อง: กลิ่นที่ขอ + ของที่ RD ผลิตออกมาจริง ────────────────
--
-- ⚠️ `producedScentId`/`producedFormulaId` **สำคัญกว่าตัวที่ขอ** — มันคือสายพันธุ์
-- ของงาน (ม-89): "ใบนี้ส่งกลิ่นตัวไหนออกไป" · แผน R-5 เขียนก่อน mig 0204 จึงไม่ได้
-- พูดถึงสองช่องนี้ แต่มันเป็นรูเดียวกันและรั่วแรงกว่า
ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS "dept_request_items_scentId_fkey",
  DROP CONSTRAINT IF EXISTS "dept_request_items_producedScentId_fkey",
  DROP CONSTRAINT IF EXISTS "dept_request_items_producedFormulaId_fkey";

ALTER TABLE public.dept_request_items
  ADD CONSTRAINT "dept_request_items_scentId_fkey"
    FOREIGN KEY ("scentId") REFERENCES public.scents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT "dept_request_items_producedScentId_fkey"
    FOREIGN KEY ("producedScentId") REFERENCES public.scents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT "dept_request_items_producedFormulaId_fkey"
    FOREIGN KEY ("producedFormulaId") REFERENCES public.formulas(id) ON DELETE RESTRICT;

-- ── 3) ทะเบียนราคา: F ผูกกลิ่น · FB ผูกสูตร ──────────────────────────────
ALTER TABLE public.material_prices
  DROP CONSTRAINT IF EXISTS "material_prices_scentId_fkey",
  DROP CONSTRAINT IF EXISTS "material_prices_formulaId_fkey";

ALTER TABLE public.material_prices
  ADD CONSTRAINT "material_prices_scentId_fkey"
    FOREIGN KEY ("scentId") REFERENCES public.scents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT "material_prices_formulaId_fkey"
    FOREIGN KEY ("formulaId") REFERENCES public.formulas(id) ON DELETE RESTRICT;

-- ⚠️ **ที่จงใจไม่แตะในไฟล์นี้**
--   · `products.scentId/formulaId`        → คง SET NULL (มติในแผน — ดูหัวไฟล์)
--   · `formulas.scentId`                  → คง SET NULL · สูตรมีตัวตนของตัวเอง
--   · `scent_lineage."derivedFromScentId"` (0205) → คง SET NULL · บรรพบุรุษที่ถูกลบ
--     แปลว่า "ไม่รู้ที่มา" ซึ่งเป็นความจริง ไม่ใช่ข้อมูลหาย
--   · `material_prices_identity_uk` ยังยึด `formulaCode` (text) → หนี้ที่ค้างจาก
--     PR-5 ของแผนเดิม ยังไม่รวมร่างกับ pointer (0171:145 เขียนเตือนไว้เอง)

COMMIT;
