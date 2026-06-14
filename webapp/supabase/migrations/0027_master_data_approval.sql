-- ============================================================
--  Migration 0027: master-data approval workflow (customers + products)
--  AE / AC สร้างลูกค้า-สินค้าได้ แต่ต้องรออนุมัติจาก Senior AE ขึ้นไป.
--  approvalStatus: 'pending' | 'approved' | 'rejected'.
--  ข้อมูลเดิม default 'approved' — ใช้งานได้ปกติ ไม่ต้องรออนุมัติย้อนหลัง.
--  รายการ pending จะถูกซ่อนจากการใช้งานปลายทาง (ออเดอร์/ขึ้นทะเบียน/PM) —
--  GET ปกติคืนเฉพาะ approved, หน้าจัดการเรียกด้วย ?manage=1 จึงเห็นทุกสถานะ.
--  additive ล้วน, รันซ้ำได้ (if not exists). camelCase ในเครื่องหมายคำพูด.
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005-0026).
-- ============================================================

alter table public.customers add column if not exists "approvalStatus"   text default 'approved';
alter table public.customers add column if not exists "submittedBy"       text;
alter table public.customers add column if not exists "submittedByName"   text;
alter table public.customers add column if not exists "approvedBy"        text;
alter table public.customers add column if not exists "approvedByName"    text;
alter table public.customers add column if not exists "approvedAt"        timestamptz;
alter table public.customers add column if not exists "rejectionReason"   text;

alter table public.products  add column if not exists "approvalStatus"   text default 'approved';
alter table public.products  add column if not exists "submittedBy"       text;
alter table public.products  add column if not exists "submittedByName"   text;
alter table public.products  add column if not exists "approvedBy"        text;
alter table public.products  add column if not exists "approvedByName"    text;
alter table public.products  add column if not exists "approvedAt"        timestamptz;
alter table public.products  add column if not exists "rejectionReason"   text;

-- เผื่อรันบนตารางที่มีข้อมูลอยู่แล้ว: เติม approved ให้แถวที่ยังว่าง.
update public.customers set "approvalStatus" = 'approved' where "approvalStatus" is null;
update public.products  set "approvalStatus" = 'approved' where "approvalStatus" is null;

create index if not exists customers_approval_idx on public.customers ("approvalStatus");
create index if not exists products_approval_idx  on public.products  ("approvalStatus");
