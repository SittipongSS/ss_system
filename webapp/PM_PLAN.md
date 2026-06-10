# แพลน: พอร์ตระบบ Project Management (PM) เข้า ss-team

> เฟสถัดจาก [MASTER_DATA_PLAN.md](MASTER_DATA_PLAN.md) (เสร็จแล้ว) — พอร์ตระบบ PM
> จาก ss-cj (`D:\SS-CJ-ANG`) เข้ามาเป็นโมดูลใน ss-team โดยผูกกับ master data
> (customers/products/product_types) ที่เพิ่งสร้าง
>
> สโคป: **projects + tasks + timeline + ISO** (ตามที่ตกลง) — ตัด updates/comments/
> notifications/personal-tasks ออก
>
> สถานะ: รอรีวิว/ตัดสินใจจุดเปิด (ดูหัวข้อ 13)

---

## 1. เป้าหมาย & หลักการ

นำระบบจัดการโครงการของ ss-cj มาใช้ใน ss-team โดย **ไม่ลอกสถาปัตยกรรมเดิม**
แต่แปลงให้เข้ากับ ss-team:

- ดึงข้อมูลผ่าน **Next API routes (service_role)** ไม่ใช่ client-side supabase + RLS
- ผูกลูกค้า/สินค้าด้วย **FK จริง** กับ master data (ไม่ใช่ free-text แบบ ss-cj)
- ใช้ **permission/scope เดิม** ของ ss-team (team-scoped, SALES-only)

---

## 2. จุดตัดสินใจที่ล็อกแล้ว (เกี่ยวกับ PM)

| # | เรื่อง | ข้อสรุป |
|---|---|---|
| 1 | **คน/assignee** | ไม่มีตาราง people. assignee ของ step SA = auth user; step แผนกอื่น (RD/PC/PD/QC/WH/LG) = ป้าย role เฉยๆ ไม่ระบุชื่อคน |
| 2 | **scope** | team-scoped (ODM/KA/SV), supervisor เห็นหมด — ใช้ `viewScope`/`editScope` จาก [permissions.js](src/lib/permissions.js) |
| 3 | **สิทธิ์เข้าถึง** | เฉพาะ SALES (`ae_supervisor`/`senior_ae`/`ac`/`ae`) ไม่รวม `legal` |
| 4 | **link master** | `projects.customerId` FK → customers; (ตัวเลือก) `productId` FK → products |

---

## 3. ขอบเขต

### อยู่ในสโคป (พอร์ต)
- **ProjectsManager** — list/CRUD โปรเจกต์
- **TasksManager** — รายการ task ข้ามโปรเจกต์ (มุมมองของผู้รับผิดชอบ)
- **ProjectTimelineModal** — Gantt timeline + จุดเข้าเอกสาร ISO
- **ProjectDocumentView** — เอกสาร FM-SA Timeline (ISO) + พิมพ์
- utils: `ganttPrint`, `weekGrid`, `dateHelpers`, `MultiSelectDropdown`, `ConfirmDialog`

### นอกสโคป (ตัด)
- GlobalUpdatesFeed / project_updates / update_comments
- NotificationBell / notifications
- personal_tasks
- TeamTimeline (มุมมองรวมข้ามโปรเจกต์ — เพิ่มทีหลังได้)
- การผูกกับ production/PO (ตัด coupling — ดูหัวข้อ 9)
- ตาราง employees, holidays (ใช้ auth users + Thai-holiday fallback ในโค้ด)

---

## 4. สถาปัตยกรรม: PM อยู่ตรงไหน

```
src/app/api/pm/projects        ← route ใหม่ (CRUD projects)
src/app/api/pm/project-tasks   ← route ใหม่ (CRUD tasks)
src/lib/pm/                    ← (ตัวเลือก) logic คำนวณวัน/timeline ฝั่ง server
src/lib/master/                ← เรียก getCustomer/getProduct มาผูก FK
src/components/pm/             ← UI ที่พอร์ตมา
src/app/projects/              ← หน้า /projects (+ /projects/[id])
src/app/tasks/                 ← หน้า /tasks
src/app/pm-timeline/           ← (ถ้าแยกหน้า)
```

PM อ่าน master ผ่าน `lib/master/` (เช่น dropdown เลือกลูกค้าในฟอร์มโปรเจกต์)
และเก็บ snapshot ชื่อลูกค้าไว้เผื่อแสดงผล/ประวัติ

---

## 5. ฐานข้อมูล (Migrations)

ต่อจาก `0007` → เริ่ม `0008`. คอนเวนชัน ss-team: **camelCase ในเครื่องหมายคำพูด**
(ดูจุดตัดสินใจเปิด 13.1 — naming) ทุกไฟล์ additive + idempotent

### 5.1 `migrations/0008_pm_projects.sql`
```sql
create table if not exists public.projects (
  "id"                  text primary key,               -- 'PRJ-xxxxxx'
  "code"                text not null,
  "name"                text not null,
  "customerId"          text references public.customers("id") on delete set null,  -- FK master
  "customerName"        text,                            -- snapshot
  -- หมายเหตุ: 1 โปรเจกต์มีได้หลาย FG → ผูกสินค้าผ่านตาราง project_products (5.3)
  --           ไม่เก็บ productId เดี่ยวบน projects
  "type"                text not null default 'NPD',      -- NPD | RE-ORDER
  "urgency"             text not null default 'Do Now',   -- Do Now | Schedule | Delegate
  "aeOwner"             text,
  "acOwner"             text,
  "status"              text not null default 'New',      -- New|In Progress|Completed|On Hold|Dropped
  "startDate"           date,
  "dueDate"             date,
  "productMainCategory" text default '',                  -- จาก product_types
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
  "team"                text,
  "ownerId"             uuid,
  "metadata"            jsonb not null default '{}'::jsonb,
  "createdAt"           timestamptz not null default now(),
  "updatedAt"           timestamptz not null default now()
);
create index if not exists projects_customerid_idx on public.projects ("customerId");
create index if not exists projects_team_idx        on public.projects ("team");
alter table public.projects enable row level security;
```

### 5.2 `migrations/0009_pm_project_tasks.sql`
```sql
create table if not exists public.project_tasks (
  "id"               text primary key,
  "projectId"        text not null references public.projects("id") on delete cascade,
  "stepOrder"        int not null default 0,
  "name"             text not null default '',
  "role"             text not null default 'SA',     -- SA|RD|PC|PD|QC|LG|WH|ALL (ป้ายแผนก)
  "assignee"         text,                            -- ชื่อ auth user (เฉพาะ SA) หรือ null
  "phase"            text,
  "durationDays"     int not null default 1,
  "startDate"        date,
  "finishDate"       date,
  "actualFinishDate" date,
  "status"           text not null default 'Pending', -- Pending|In Progress|Completed
  "predecessors"     jsonb default '[]'::jsonb,       -- task id ที่ต้องเสร็จก่อน
  "cellsOverride"    jsonb,                            -- override กริดสัปดาห์ ISO (null=auto)
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);
create index if not exists project_tasks_projectid_idx on public.project_tasks ("projectId");
create index if not exists project_tasks_status_idx     on public.project_tasks ("status");
alter table public.project_tasks enable row level security;
```

> รวมฟีเจอร์ที่ ss-cj แยกเป็นหลาย migration (predecessors, phase, iso-fields, role)
> ไว้ในนิยามตารางเดียวตั้งแต่แรก

### 5.3 `migrations/0010_pm_project_products.sql` — เชื่อมโปรเจกต์ ↔ สินค้า (many-to-many)
1 โปรเจกต์มีได้หลาย FG และ 1 FG ไปปรากฏในหลายโปรเจกต์ได้ (เช่น RE-ORDER ใช้ FG เดิม)
→ ใช้ตารางเชื่อม
```sql
create table if not exists public.project_products (
  "id"        text primary key,                -- 'PP-xxxxxx'
  "projectId" text not null references public.projects("id") on delete cascade,
  "productId" text not null references public.products("id") on delete cascade,
  "createdAt" timestamptz not null default now(),
  unique("projectId", "productId")
);
create index if not exists project_products_projectid_idx on public.project_products ("projectId");
create index if not exists project_products_productid_idx on public.project_products ("productId");
alter table public.project_products enable row level security;
```
- **NPD:** ตอนเริ่มยังไม่มีสินค้า → เพิ่ม FG เข้าโปรเจกต์ทีหลังเมื่อ FG ถูกสร้าง
- **RE-ORDER:** ผูก FG เดิมที่มีอยู่ได้ทันที
- คง `productMainCategory`/`productSubCategory` บน projects ไว้สำหรับจัดหมวดรวม + ช่วง NPD ที่ยังไม่มี FG

---

## 6. API Routes (ใหม่)

ทุก route ใช้ `getSupabaseAdmin()` + `getCurrentUser()` + เช็ค scope ด้วย
`viewScope/editScope/inScope` เดิม และ cap `pm:view`/`pm:edit`

| Route | Method | หน้าที่ |
|---|---|---|
| `/api/pm/projects` | GET | list (team-scoped); POST สร้าง (gen template tasks) |
| `/api/pm/projects/[id]` | GET/PATCH/DELETE | รายเดียว + แก้/ลบ (ตรวจ inScope) |
| `/api/pm/project-tasks` | GET | list tasks (filter projectId / assignee); POST |
| `/api/pm/project-tasks/[id]` | PATCH/DELETE | แก้สถานะ/วันที่/ลบ |
| `/api/pm/projects/[id]/products` | GET/POST/DELETE | list/ผูก/ถอด FG ของโปรเจกต์ (project_products) |

GET `/api/pm/projects/[id]` คืนโปรเจกต์พร้อม `products` (join จาก project_products → products master)

**ตอน POST project:** ฝั่ง server gen task จาก template (NPD/RE-ORDER) — ย้าย
template constant + logic คำนวณวัน (addBusinessDays) จาก ss-cj `ProjectContext`
มาไว้ใน `src/lib/pm/templates.js` + `src/lib/pm/schedule.js`

---

## 7. Data Layer — เขียน ProjectContext ใหม่ (งานหลัก)

ss-cj `ProjectContext.jsx` (1044 บรรทัด, ~40 จุดเรียก supabase ตรง) → เขียนใหม่เป็น
**client context ที่ fetch ผ่าน API routes** + เก็บ logic คำนวณ timeline ฝั่ง client

- โหลด: `GET /api/pm/projects` + `/api/pm/project-tasks` (แทน supabase.from)
- mutation: POST/PATCH/DELETE ผ่าน routes
- คง "shape" ของ object ที่ส่งให้ UI ให้เหมือนเดิม → ลดการแก้ component
- logic วันทำการ/dependency/auto-schedule ย้ายมา `src/lib/pm/` ใช้ร่วม client+server

---

## 8. UI ที่ต้องพอร์ต

| ไฟล์ ss-cj | → ss-team | งานแปลง |
|---|---|---|
| ProjectsManager.jsx (580) | components/pm/ProjectsManager.js | เปลี่ยน data source → context ใหม่; customer dropdown ใช้ master |
| TasksManager.jsx (450) | components/pm/TasksManager.js | เปลี่ยน data source |
| ProjectTimelineModal.jsx (1208) | components/pm/ProjectTimelineModal.js | **ตัด tracking coupling** (หัวข้อ 9) |
| ProjectDocumentView.jsx (418) | components/pm/ProjectDocumentView.js | พอร์ตตรง (ใช้ ganttPrint/weekGrid) |
| utils/{ganttPrint,weekGrid,dateHelpers}.js | src/lib/pm/ หรือ src/utils/ | พอร์ตตรง |
| common/MultiSelectDropdown, ui/ConfirmDialog | components/pm/ | พอร์ตตรง |

หน้า route: `src/app/projects/page.js`, `src/app/projects/[id]/page.js`, `src/app/tasks/page.js`

---

## 9. ตัด coupling กับระบบ Production/PO

[ProjectTimelineModal.jsx:145](../../SS-CJ-ANG/src/components/ProjectTimelineModal.jsx) ใช้
`useTracking()` → `{ pos, productionTracking, products, createProductionOrders }` (13 จุด)
ซึ่งเป็นโมดูล PO/ผลิตที่ **ไม่ได้พอร์ต**

**แผน:** ตัดฟีเจอร์ "สร้าง PO จาก timeline" + แถบข้อมูลการผลิตออก ให้ timeline ทำงาน
เดี่ยวๆ (Gantt + ISO doc ไม่กระทบ). ส่วน `products` ที่ใช้แสดง → ดึงจาก master แทน

---

## 10. Permissions

แก้ [permissions.js](src/lib/permissions.js):
- เพิ่ม cap **`pm:view`** / **`pm:edit`**
- map: `ae_supervisor`/`senior_ae`/`ac`/`ae` ได้ทั้งคู่ (edit ตาม editScope), `legal` = ไม่มี
- scope: ใช้ `viewScope`/`editScope`/`inScope` เดิม (projects มี `team`/`ownerId`)
- proxy.js: เพิ่ม gate `/api/pm/*` → write ต้อง `pm:edit`

---

## 11. เมนู Sidebar

[AppLayout.js](src/components/AppLayout.js) — เพิ่มกลุ่มเมนูใหม่ "โครงการ (PM)" แสดงเฉพาะ
role ที่มี `pm:view`:
- `/projects` — โครงการ (icon: FolderKanban)
- `/tasks` — งานของฉัน (icon: ListTodo)

---

## 12. Styling

ss-cj มี CSS ของตัวเอง (timeline/ISO grid มี style เยอะ), ss-team ใช้ Tailwind v4 +
CSS variables. **แนะนำ:** ลาก CSS ที่เกี่ยวกับ PM/timeline/ISO มาเป็นไฟล์ scoped
(`src/app/pm.css` หรือ globals) ก่อน — แปลงเป็น Tailwind ทีหลังถ้าต้องการ (timeline
grid แปลงยาก ลากมาตรงๆ คุ้มกว่า)

---

## 13. จุดตัดสินใจที่ต้องเคลียร์ก่อนลงมือ

### ~~13.1 Naming คอลัมน์ PM~~ — ตัดสินแล้ว
✅ **camelCase** ตามคอนเวนชัน ss-team (projectId, stepOrder, …) — ทั้ง repo สไตล์เดียว.
field refs ในโค้ดที่พอร์ตมาจะถูกแก้ให้ตรงตอนพอร์ต (API เป็น boundary)

### ~~13.2 โปรเจกต์ผูกสินค้าหลักไหม~~ — ตัดสินแล้ว
✅ **1 โปรเจกต์มีได้หลาย FG** → ใช้ตารางเชื่อม `project_products` (many-to-many, ดู 5.3).
FG เดิมใช้ซ้ำข้ามโปรเจกต์ได้ (RE-ORDER). คง category fields บน projects ไว้ด้วย.

### ~~13.3 หน้า detail โปรเจกต์~~ — ตัดสินแล้ว
✅ ทำเป็น **หน้าเต็ม `/projects/[id]`** (Next routing + แชร์ลิงก์ได้) ไม่ใช่ modal

---

## 14. ลำดับการลงมือ (Checklist)

```
[ ] 1.  migrations 0008 (projects) + 0009 (project_tasks) + 0010 (project_products) → รันบน Supabase
[ ] 2.  src/lib/pm/templates.js (NPD/RE-ORDER template) + schedule.js (วันทำการ/dependency)
[ ] 3.  src/lib/pm/dateHelpers, weekGrid, ganttPrint (พอร์ต utils)
[ ] 4.  API routes /api/pm/projects (+[id], +[id]/products) + project-tasks (+[id])
[ ] 5.  เพิ่ม cap pm:view/pm:edit + gate /api/pm/* ใน proxy
[ ] 6.  เขียน ProjectContext ใหม่ (fetch ผ่าน routes)
[ ] 7.  พอร์ต ProjectsManager (+ customer dropdown จาก master)
[ ] 8.  พอร์ต TasksManager
[ ] 9.  พอร์ต ProjectTimelineModal (ตัด tracking coupling)
[ ] 10. พอร์ต ProjectDocumentView (ISO + print)
[ ] 11. หน้า /projects, /projects/[id] (เต็ม), /tasks + เมนู sidebar + UI ผูก FG หลายตัว
[ ] 12. ลาก CSS PM/timeline/ISO
[ ] 13. ทดสอบ: สร้างโปรเจกต์→gen tasks→ผูกหลาย FG→timeline→พิมพ์ ISO; ตรวจ scope ราย team
```

---

## 15. ความเสี่ยง & ประมาณการ

| ความเสี่ยง | การกัน |
|---|---|
| เขียน ProjectContext ใหม่ (ก้อนใหญ่) | คง object shape เดิมให้ UI; ทยอย route ทีละตัว |
| ตัด tracking coupling พลาด | แยกเป็นขั้นชัด (ขั้น 9) + ทดสอบ timeline เดี่ยว |
| field naming snake↔camel | API เป็น boundary แปลงครั้งเดียว |
| logic วันทำการ/dependency คลาด | ย้ายมา lib/pm รวมที่เดียว + unit test ค่าตัวอย่าง |

**ประมาณการ:** ~3–4 วันทำงานสำหรับเวอร์ชันใช้งานได้ (projects + tasks + timeline + ISO print)
แกนงานหนักสุด = data layer (ขั้น 6) + timeline modal (ขั้น 9)
