-- ============================================================
--  Migration 0017: order_items อ้าง excise_registration
--  บรรทัดสินค้าในใบสั่งซื้อ = "ทะเบียนภาษีที่อนุมัติแล้วของลูกค้านั้น".
--  เพิ่ม "registrationId" (FK) + คง "productId" เป็น snapshot แสดงผล.
--  Backfill: จับคู่ order_items เดิม กับ registration ด้วย (productId + ลูกค้าของออเดอร์).
--  Additive + idempotent.
-- ============================================================

-- logical FK -> excise_registrations.id (ไม่ผูก constraint จริง ตามคอนเวนชันโปรเจกต์)
alter table public.order_items
  add column if not exists "registrationId" text;

create index if not exists order_items_registration_idx
  on public.order_items ("registrationId");

-- Backfill: order → customerId; หา registration ของ (สินค้าเดิม + ลูกค้าออเดอร์).
-- ห่อด้วย DO/EXECUTE + exception handler เพื่อข้ามอัตโนมัติถ้า schema ไม่ตรง.
do $$
begin
  execute $q$
    update public.order_items oi
    set "registrationId" = r."id"
    from public.orders o, public.excise_registrations r
    where oi."orderId" = o."id"
      and r."productId" = oi."productId"
      and r."customerId" is not distinct from o."customerId"
      and oi."registrationId" is null
  $q$;
exception
  when undefined_column or undefined_table then
    raise notice 'ข้าม backfill order_items.registrationId (schema ไม่ตรง): %', sqlerrm;
end $$;
