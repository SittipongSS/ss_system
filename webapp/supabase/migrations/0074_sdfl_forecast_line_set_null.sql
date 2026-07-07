-- ============================================================
--  Migration 0074: sales_deal_forecast_lines.forecastLineId → ON DELETE SET NULL
--  ปิดช่องโหว่: การ "แก้รอบ FC" (ลบ+สร้าง line ใหม่ทุกครั้ง) หรือ "ลบรอบ FC"
--  ทำให้ forecast_lines ถูกลบ → เดิม junction เป็น ON DELETE CASCADE จึงลบแถว
--  mapping ของดีลตามไปด้วย = ดีลหลุดการเชื่อมกับ FC เงียบ ๆ.
--
--  junction เก็บ snapshot fgCode/demandMonth/qtyAllocated ไว้แล้ว (settle/coverage
--  ใช้ค่าเหล่านี้ ไม่ได้พึ่ง forecast line จริง) → ให้ forecastLineId เป็น null ได้
--  + SET NULL เมื่อ line ต้นทางถูกลบ → ดีล + mapping รอด, เสียแค่ pointer.
--
--  ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (เหมือน 0005-0073).
-- ============================================================

ALTER TABLE public.sales_deal_forecast_lines
  ALTER COLUMN "forecastLineId" DROP NOT NULL;

-- ชื่อ constraint เดิมที่ Postgres ตั้งให้ตอน 0072 (inline references).
ALTER TABLE public.sales_deal_forecast_lines
  DROP CONSTRAINT IF EXISTS "sales_deal_forecast_lines_forecastLineId_fkey";

ALTER TABLE public.sales_deal_forecast_lines
  ADD CONSTRAINT sales_deal_forecast_lines_forecast_line_id_fkey
  FOREIGN KEY ("forecastLineId")
  REFERENCES public.sahamit_forecast_lines(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
