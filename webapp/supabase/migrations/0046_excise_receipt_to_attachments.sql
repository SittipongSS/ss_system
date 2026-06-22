-- ============================================================
--  Migration 0046: ย้ายไฟล์ใบเสร็จสรรพสามิตจากคอลัมน์ orders.exciseReceiptFileUrl
--  ไปอยู่ในตาราง attachments (order/tax_receipt) แล้วลบคอลัมน์เดิมทิ้ง.
--  ต่อเนื่องจากการ migrate FileTaxDialog (Option C — รวมแหล่งเดียว).
--  ปลอดภัยรันซ้ำได้: backfill ข้ามแถวที่แนบไปแล้ว (not exists), drop = if exists.
--  ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (DDL ผ่าน service-role ไม่ได้).
-- ============================================================

-- 1) backfill: order ที่เคยเก็บไฟล์ใบเสร็จเป็นคอลัมน์ → สร้าง attachment row.
--    metadata ดึงจากคอลัมน์ชำระภาษีที่มีอยู่ (เลขใบเสร็จ/วันที่/ยอด).
insert into public.attachments
  ("entityType", "entityId", "docType", "fileUrl", "fileName", "uploadedByName", metadata)
select
  'order',
  o.id::text,
  'tax_receipt',
  o."exciseReceiptFileUrl",
  'ใบเสร็จสรรพสามิต',
  'นำเข้าจากระบบเดิม',
  jsonb_strip_nulls(jsonb_build_object(
    'referenceNo', o."exciseReceiptNumber",
    'paidDate',    o."taxPaidDate",
    'amount',      o."exciseTaxPaidAmount"
  ))
from public.orders o
where o."exciseReceiptFileUrl" is not null
  and o."exciseReceiptFileUrl" <> ''
  and not exists (
    select 1 from public.attachments a
    where a."entityType" = 'order'
      and a."entityId" = o.id::text
      and a."fileUrl" = o."exciseReceiptFileUrl"
  );

-- 2) ลบคอลัมน์เดิม (ไฟล์ทุกใบย้ายเข้า attachments แล้ว).
alter table public.orders drop column if exists "exciseReceiptFileUrl";
