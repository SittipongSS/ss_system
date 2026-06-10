-- ============================================================
--  Migration 0008: PM — ตาราง projects
--  ระบบจัดการโครงการ (พอร์ตจาก ss-cj) — ใช้เฉพาะฝ่าย SALES, team-scoped.
--  ผูกลูกค้าด้วย FK กับ master (customers). สินค้าผูกแบบ many-to-many ผ่าน
--  project_products (migration 0010) เพราะ 1 โปรเจกต์มีได้หลาย FG.
--  รวม ISO (FM-SA Timeline) header/footer fields ไว้ในตารางตั้งแต่แรก.
--  RLS เปิด ไม่มี policy (เข้าผ่าน API service_role). Additive + idempotent.
-- ============================================================

create table if not exists public.projects (
  "id"                  text primary key,               -- 'PRJ-xxxxxx'
  "code"                text not null,
  "name"                text not null,
  "customerId"          text references public.customers("id") on delete set null,  -- FK master
  "customerName"        text,                            -- snapshot
  -- หมายเหตุ: 1 โปรเจกต์มีได้หลาย FG → ผูกสินค้าผ่านตาราง project_products (0010)
  "type"                text not null default 'NPD' check ("type" in ('NPD','RE-ORDER')),
  "urgency"             text not null default 'Do Now' check ("urgency" in ('Do Now','Schedule','Delegate')),
  "aeOwner"             text default '',
  "acOwner"             text default '',
  "status"              text not null default 'New'
                          check ("status" in ('New','In Progress','Completed','On Hold','Dropped')),
  "startDate"           date,
  "dueDate"             date,
  "productMainCategory" text default '',                 -- จาก product_types (จัดหมวดรวม)
  "productSubCategory"  text default '',
  -- ISO (FM-SA Timeline document) header/footer
  "docNumber"           text default '',
  "productName"         text default '',
  "productCode"         text default '',
  "orderQty"            text default '',
  "productionQty"       text default '',
  "aeSupervisor"        text default '',
  "keyAccountExec"      text default '',
  "customerEmail"       text default '',
  "preparedBy"          text default '',
  "reviewedBy"          text default '',
  -- scope (เหมือน orders/customers) + เวลา
  "team"                text,                            -- ODM | KA | SV
  "ownerId"             uuid,                            -- auth user เจ้าของ (สำหรับ 'own' scope)
  "metadata"            jsonb not null default '{}'::jsonb,
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);

create index if not exists projects_customerid_idx on public.projects ("customerId");
create index if not exists projects_team_idx        on public.projects ("team");
create index if not exists projects_status_idx      on public.projects ("status");

alter table public.projects enable row level security;
