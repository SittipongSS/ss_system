-- ใบแจ้งชำระค่าภาษีสรรพสามิตต้องอ้างอิง "โครงการ" และ "โครงการย่อย (ดีล)" เหมือน
-- ใบเสนอราคา/ใบสั่งขาย (มติผู้ใช้ 2026-08-05)
--
-- ทำไมต้องตรึงลงใบ ไม่ใช่ join ตอนพิมพ์ — กติกาเดียวกับ mig 0167 ที่ตรึงเลขผู้เสียภาษี
-- กับที่อยู่ลูกค้าลงใบ: ชื่อโครงการ/ดีลเปลี่ยนได้ทีหลัง ถ้าอ่านสดทุกครั้ง ใบเก่าที่เคย
-- ส่งลูกค้าไปแล้วจะพิมพ์ซ้ำออกมาไม่เหมือนเดิม · และใบยื่นที่สร้างมือ (ไม่ผ่าน Sale Order)
-- ไม่มีทางถอยไปหาโครงการได้เลย จึงต้องเป็นค่าที่เขียนลงแถวตั้งแต่ตอนสร้าง
--
-- เก็บเป็นข้อความสำเร็จรูป ("รหัส · ชื่อ") ไม่ใช่ FK เพราะเป็นค่าที่ "พิมพ์ลงกระดาษ"
-- ไม่ใช่ความสัมพันธ์ที่ต้องใช้ query ต่อ — แบบเดียวกับ customerAddress/customerTaxId
alter table public.orders
  add column if not exists "projectRef" text,
  add column if not exists "dealRef" text;

-- เติมย้อนหลังให้ใบที่สร้างผ่าน Sale Order (ใบที่สร้างมือไม่มีต้นทางให้ถอย ปล่อยว่าง)
-- concat_ws ข้ามค่า null ให้เอง แต่ไม่ข้ามสตริงว่าง จึง nullif ก่อน
update public.orders o
set "projectRef" = nullif(concat_ws(' · ', nullif(p.code, ''), nullif(p.name, '')), ''),
    "dealRef"    = nullif(concat_ws(' · ', nullif(d."dealType", ''), nullif(d.title, '')), '')
from public.sales_orders so
  left join public.projects p on p.id = so."projectId"
  left join public.sales_deals d on d.id = so."dealId"
where o."salesOrderId" = so.id
  and o."projectRef" is null
  and o."dealRef" is null;
