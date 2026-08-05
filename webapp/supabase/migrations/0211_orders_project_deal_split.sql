-- ใบแจ้งชำระค่าภาษีสรรพสามิตต้องอ้างอิงโครงการด้วยคำและโครงสร้างเดียวกับใบเสนอราคา /
-- ใบสั่งขาย / ไทม์ไลน์ (มติผู้ใช้ 2026-08-05):
--   เลขที่โครงการ = รหัส PJ ของโครงการแม่
--   โครงการ       = ชื่อดีล   (ลูกค้ามองงานที่สั่งเป็น "โครงการ" ของตัวเอง)
--   ประเภทโครงการ = ประเภทดีล
--
-- mig 0208 ตรึงไว้เป็นข้อความสำเร็จรูป 2 ค่า ("รหัส · ชื่อ" กับ "ประเภท · ชื่อดีล") ซึ่งพอ
-- ต้องแยกเป็น 3 แถวแล้วใช้ไม่ได้ — ตัดสตริงกลับด้วย ' · ' ไม่ปลอดภัย เพราะชื่อโครงการ/ดีล
-- มีจุดคั่นแบบนั้นเองได้ และค่าที่ไม่มีรหัสจะเหลือแค่ชื่อโดยไม่มีตัวคั่นให้แยก
--
-- เหตุผลที่ยังตรึงลงใบเหมือนเดิม (กติกา mig 0167): ชื่อโครงการ/ดีลเปลี่ยนได้ทีหลัง ถ้า
-- อ่านสดตอนพิมพ์ ใบเก่าที่ส่งลูกค้าไปแล้วจะพิมพ์ซ้ำออกมาไม่เหมือนเดิม
alter table public.orders
  add column if not exists "projectCode" text,
  add column if not exists "dealTitle" text,
  add column if not exists "dealType" text;

-- เติมย้อนหลังจากต้นทางเดิม (ใบที่สร้างผ่าน Sale Order) — ชุดแถวเดียวกับที่ 0208 เติมไว้
-- และ 0208 เพิ่งเติมจากข้อมูลสดชุดนี้ ค่าที่ได้จึงตรงกับที่ตรึงไว้แล้ว
-- ใบที่สร้างมือไม่มีต้นทางให้ถอย ปล่อยว่าง (เหมือน 0208)
update public.orders o
set "projectCode" = nullif(p.code, ''),
    "dealTitle"   = nullif(d.title, ''),
    "dealType"    = nullif(d."dealType", '')
from public.sales_orders so
  left join public.projects p on p.id = so."projectId"
  left join public.sales_deals d on d.id = so."dealId"
where o."salesOrderId" = so.id
  and o."projectCode" is null
  and o."dealTitle" is null
  and o."dealType" is null;

-- คอลัมน์ "projectRef" / "dealRef" จาก mig 0208 ไม่มีใครอ่านแล้วหลังจากนี้ แต่ยังไม่ลบ
-- ในไฟล์นี้ — ปล่อยไว้ให้ย้อนกลับได้ถ้าค่าที่เติมใหม่ผิด ค่อยลบทีหลังเมื่อมั่นใจแล้ว:
--   alter table public.orders drop column "projectRef", drop column "dealRef";
