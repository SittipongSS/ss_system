-- ============================================================
--  Migration 0047: orders.taxInvoiceNumber — เลขที่ใบกำกับภาษี
--  บังคับกรอกตอน LG "เริ่มยื่น" (received → filing) และโชว์ในรายงานการยื่น.
--  1 ใบกำกับ ต่อ 1 ใบเสนอราคา → เก็บที่ระดับ order header (1:1 กับ quotationRef).
--  เพิ่มคอลัมน์เดียว nullable. additive + idempotent. ⚠ รันมือบน Supabase.
-- ============================================================

alter table public.orders
  add column if not exists "taxInvoiceNumber" text;
