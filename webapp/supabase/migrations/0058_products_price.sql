-- ============================================================
--  Migration 0058: products.price — ราคาต่อหน่วยมาตรฐานต่อ SKU
--  ใช้คิดมูลค่า FC/PO ในรายงานสหมิตร (มูลค่า = qty × products.price)
--  แบบเดียวกับ ss-cj ที่ใช้ products.price. ปัจจุบัน ss-team ไม่เก็บราคาใน
--  products/sahamit_po_lines เลย — ราคาเดียวที่มีคือ order_items.salePrice
--  (snapshot ต่อบรรทัดออเดอร์สรรพสามิต).
--
--  Backfill: ตั้งค่า price = salePrice ล่าสุดต่อ productId (จากออเดอร์ที่
--  ใหม่สุดที่มี salePrice) เป็นค่าเริ่มต้น — "ใช้ราคาที่ผูกอยู่แล้ว".
--  แก้ราคาภายหลังได้ที่ master product. nullable — SKU ที่ไม่เคยขายยังเป็น null.
--
--  additive + idempotent. ⚠ รันมือบน Supabase SQL Editor ก่อน deploy.
-- ============================================================

alter table public.products
  add column if not exists price numeric;

-- Backfill จาก order_items.salePrice ล่าสุดต่อสินค้า (best-effort; ห่อ exception
-- เผื่อ schema ไม่ตรง เช่น orders ไม่มี createdAt).
do $$
begin
  execute $q$
    update public.products p
    set price = sub."salePrice"
    from (
      select distinct on (oi."productId") oi."productId", oi."salePrice"
      from public.order_items oi
      join public.orders o on o."id" = oi."orderId"
      where oi."salePrice" is not null
      order by oi."productId", o."createdAt" desc nulls last
    ) sub
    where p."id" = sub."productId" and p.price is null
  $q$;
exception
  when undefined_column or undefined_table then
    raise notice 'ข้าม backfill products.price (schema ไม่ตรง): %', sqlerrm;
end $$;
