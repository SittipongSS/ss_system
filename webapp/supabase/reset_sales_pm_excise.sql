-- ============================================================================
-- RESET: ล้างข้อมูล ขาย + โครงการ PM + สรรพสามิต ให้เหลือ 0
-- ----------------------------------------------------------------------------
-- ลบ (ตาม list ด้านล่างเป๊ะ ๆ):
--   • ขาย pipeline: ลีด, ดีล, ใบเสนอราคา, Sale Order, สอบถาม RD, forecast review
--   • ประวัติยอด (sales_history)
--   • โครงการ PM: projects, project_tasks, project_products, doc revisions, shipment prep
--   • สรรพสามิต/ภาษี: excise_registrations, orders, order_items
-- เก็บ (ไม่แตะ):
--   • เป้า (sales_targets)
--   • งาน /sa/tasks (personal_tasks) + งานบริหาร (mgmt_tasks)
--   • ลูกค้า (customers) + สินค้า (products) + วันหยุด (holidays)
--   • สหมิตร (sahamit_*) — ไม่ได้ล้าง (แต่ลิงก์ที่ชี้ดีล/โครงการที่ถูกลบจะค้าง)
--
-- วิธี: ปิด FK trigger ชั่วคราว (session_replication_role=replica) ในทรานแซกชัน
--   → ลบได้ทุกลำดับ ไม่ติด FK RESTRICT และไม่ cascade เกิน list. เปิดคืนก่อน COMMIT.
--   ต้องรันด้วยสิทธิ์ owner (Supabase SQL Editor = postgres — ผ่าน; local psql superuser).
-- ⚠️ ลบถาวร กู้ไม่ได้ — snapshot/backup ก่อนรันบน production
-- ============================================================================

-- ── (ทางเลือก) ดูจำนวนก่อนลบ ───────────────────────────────────────────────
-- SELECT 'leads' t, count(*) c FROM public.sales_leads
-- UNION ALL SELECT 'deals', count(*) FROM public.sales_deals
-- UNION ALL SELECT 'quotations', count(*) FROM public.quotations
-- UNION ALL SELECT 'sales_orders', count(*) FROM public.sales_orders
-- UNION ALL SELECT 'inquiries', count(*) FROM public.inquiries
-- UNION ALL SELECT 'sales_history', count(*) FROM public.sales_history
-- UNION ALL SELECT 'projects', count(*) FROM public.projects
-- UNION ALL SELECT 'project_tasks', count(*) FROM public.project_tasks
-- UNION ALL SELECT 'excise_registrations', count(*) FROM public.excise_registrations
-- UNION ALL SELECT 'orders(tax)', count(*) FROM public.orders
-- UNION ALL SELECT '== KEEP targets', count(*) FROM public.sales_targets
-- UNION ALL SELECT '== KEEP personal_tasks', count(*) FROM public.personal_tasks
-- UNION ALL SELECT '== KEEP sahamit_pos', count(*) FROM public.sahamit_pos;

BEGIN;

-- ปิด FK trigger ชั่วคราว (เฉพาะ session นี้) — ลบตาม list ได้ทุกลำดับ ไม่ error
SET session_replication_role = replica;

-- ── ขาย pipeline ────────────────────────────────────────────────────────
DELETE FROM public.inquiry_messages;
DELETE FROM public.inquiries;
DELETE FROM public.sales_order_lines;
DELETE FROM public.sales_orders;
DELETE FROM public.quotation_lines;
DELETE FROM public.quotations;
DELETE FROM public.sales_deal_forecast_lines;
DELETE FROM public.sales_deal_forecasts;
DELETE FROM public.sales_deal_stage_history;
DELETE FROM public.sales_deal_activities;
DELETE FROM public.sales_deal_documents;
DELETE FROM public.sales_forecast_reviews;
DELETE FROM public.lead_events;
DELETE FROM public.sales_leads;
DELETE FROM public.sales_deals;
DELETE FROM public.sales_history;

-- ── สรรพสามิต / ภาษี ──────────────────────────────────────────────────────
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.excise_registrations;

-- ── โครงการ PM ────────────────────────────────────────────────────────────
DELETE FROM public.shipment_prep_lines;
DELETE FROM public.shipment_prep;
DELETE FROM public.project_doc_revisions;
DELETE FROM public.project_products;
DELETE FROM public.project_tasks;
DELETE FROM public.projects;

-- เปิด FK trigger คืน (สำคัญ — ห้ามลืม ไม่งั้น session ถัดไปข้าม FK)
SET session_replication_role = DEFAULT;

COMMIT;

-- ── ตรวจหลังลบ — กลุ่มลบต้องได้ 0, KEEP คงเดิม ────────────────────────────
-- SELECT 'leads' t, count(*) c FROM public.sales_leads
-- UNION ALL SELECT 'deals', count(*) FROM public.sales_deals
-- UNION ALL SELECT 'quotations', count(*) FROM public.quotations
-- UNION ALL SELECT 'sales_orders', count(*) FROM public.sales_orders
-- UNION ALL SELECT 'inquiries', count(*) FROM public.inquiries
-- UNION ALL SELECT 'sales_history', count(*) FROM public.sales_history
-- UNION ALL SELECT 'projects', count(*) FROM public.projects
-- UNION ALL SELECT 'excise_registrations', count(*) FROM public.excise_registrations
-- UNION ALL SELECT 'orders(tax)', count(*) FROM public.orders
-- UNION ALL SELECT '== KEEP targets', count(*) FROM public.sales_targets
-- UNION ALL SELECT '== KEEP personal_tasks', count(*) FROM public.personal_tasks;
