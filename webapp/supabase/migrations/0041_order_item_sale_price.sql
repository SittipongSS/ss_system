-- ============================================================
--  Migration 0041: order_items เก็บราคาขาย/ฐานภาษี + อัตราต่อหน่วย (snapshot)
--  เดิมเก็บแต่ยอดภาษีรวมต่อบรรทัด → audit ย้อนกลับไม่ได้ (ไม่รู้ฐานภาษี/อัตรา).
--  เพิ่ม 3 คอลัมน์ snapshot ณ เวลาออกออเดอร์ เพื่อรายงาน/ตรวจสอบ:
--    - salePrice          ราคาขาย/ฐานภาษี ต่อหน่วย
--    - exciseRatePerUnit  อัตราภาษีสรรพสามิต ต่อหน่วย
--    - localTaxRatePerUnit อัตราภาษีท้องถิ่น ต่อหน่วย
--  ไม่เปลี่ยนสูตรภาษี (ยอดภาษียังมาจาก registration เหมือนเดิม). nullable ล้วน —
--  แถวเก่าไม่กระทบ. additive + idempotent. ⚠ รันมือบน Supabase (เหมือน 0005-0040).
-- ============================================================

alter table public.order_items
  add column if not exists "salePrice"            numeric,
  add column if not exists "exciseRatePerUnit"    numeric,
  add column if not exists "localTaxRatePerUnit"  numeric;

-- Backfill อัตราต่อหน่วยจาก registration (snapshot อัตราตอนยื่น) ให้แถวเก่าที่ยังว่าง.
-- ห่อด้วย DO/EXECUTE + exception handler เพื่อข้ามอัตโนมัติถ้า schema ไม่ตรง.
do $$
begin
  execute $q$
    update public.order_items oi
    set "exciseRatePerUnit"   = r."exciseTax",
        "localTaxRatePerUnit" = r."localTax"
    from public.excise_registrations r
    where oi."registrationId" = r."id"
      and oi."exciseRatePerUnit" is null
  $q$;
exception
  when undefined_column or undefined_table then
    raise notice 'ข้าม backfill order_items rate (schema ไม่ตรง): %', sqlerrm;
end $$;
