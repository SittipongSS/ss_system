-- ============================================================
--  Migration 0011: Add quantity columns to project_products
--  เก็บข้อมูล ปริมาณการสั่งซื้อ (orderQty) และ ปริมาณการผลิต (productionQty) 
--  แยกย่อยตามแต่ละ FG ในโปรเจกต์
-- ============================================================

alter table public.project_products add column if not exists "orderQty" text;
alter table public.project_products add column if not exists "productionQty" text;
