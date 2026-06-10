-- ============================================================
--  Migration 0010: PM — เชื่อมโปรเจกต์ ↔ สินค้า (many-to-many)
--  1 โปรเจกต์มีได้หลาย FG และ 1 FG ไปปรากฏในหลายโปรเจกต์ได้ (RE-ORDER ใช้ FG เดิม).
--    NPD       — เพิ่ม FG เข้าโปรเจกต์ทีหลังเมื่อ FG ถูกสร้างกลางทาง
--    RE-ORDER  — ผูก FG เดิมที่มีอยู่ได้ทันที
--  RLS เปิด ไม่มี policy. Additive + idempotent.
-- ============================================================

create table if not exists public.project_products (
  "id"        text primary key,                          -- 'PP-xxxxxx'
  "projectId" text not null references public.projects("id") on delete cascade,
  "productId" text not null references public.products("id") on delete cascade,
  "createdAt" timestamptz not null default now(),
  unique("projectId", "productId")
);

create index if not exists project_products_projectid_idx on public.project_products ("projectId");
create index if not exists project_products_productid_idx on public.project_products ("productId");

alter table public.project_products enable row level security;
