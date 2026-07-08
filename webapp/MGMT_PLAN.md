# แผน: โมดูล "งานบริหาร" (Management / Executive Office)

สถานะ: **ออกแบบ (แก้ตามแอปจริงแล้ว)** · ร่าง 2 · 2026-07-01
เจ้าของ requirement: ผู้ใช้ (admin) · เข้าถึงได้เฉพาะ **admin + ฝ่ายเลขา (secretary)**

> ต้นแบบ = Google Apps Script **"Scent & Sense — แผนติดตามงาน"** (data อยู่บน Google
> Sheet). ร่างนี้ปรับ data model + หน้า ให้ **ตรงกับแอปจริง** หลังเปิดดูครบทุกหน้า
> (Overview / รายการงาน / Gantt / การประชุม / Rock & Improve / Update Log / ถังขยะ).
> เป้าหมาย = พอร์ตแอปนี้เข้ามาเป็นโมดูลใน ss_system (Supabase + Next) ไม่ใช่ต่อ Sheet.

---

## A. สรุปแอปต้นแบบ (ground truth จากของจริง)

หลักการเด่น 3 อย่างที่คุมทั้งแอป:
1. **Scope ด้วยปี (พ.ศ.)** — มี dropdown "ปี 2569" + ปุ่ม "+" เพิ่มปี; ข้อมูลทุกหน้ากรองตามปี
2. **จัดตาม "แผนก" (business department)** — HR / MAR / AC / MN / Factory / Plan / QC …
   (คนละชุดกับ department ฝั่งสิทธิ์ AD/SA/LG/PC/PD/WH/RD/QC — เป็น taxonomy ของโมดูลนี้เอง, เพิ่มได้)
3. **แก้ inline ในตาราง** ("คลิกช่องในตารางเพื่อแก้ไขได้ทันที") + soft-delete ลงถังขยะ

### หน้าและเนื้อหาจริง
| หน้า | เนื้อหา (ของจริง) |
|---|---|
| **ภาพรวม** (Overview) | ตัวเลือกปี · KPI 5 ใบ (ทั้งหมด / เสร็จ+% / กำลังดำเนิน / ยังไม่เริ่ม / งานด่วน) · บาร์ "ความคืบหน้าตามแผนก" (เสร็จ/ทั้งหมด ต่อแผนก) · โดนัท "สัดส่วนสถานะ" (เสร็จ/กำลังทำ/รอเริ่ม/ยกเลิก) · ตาราง "งานด่วน — ยังไม่เสร็จ" |
| **รายการงาน** (Tasks) | ตัวกรอง: ค้นหา / แผนก / สถานะ / ลำดับ / วันเริ่ม≥ / วันสิ้นสุด≤ / ล้าง · ตาราง inline-edit: #, รายการ, แผนก, ผู้รับผิดชอบ, วันเริ่ม, วันสิ้นสุด, สถานะ, ลำดับ, หมายเหตุ, จัดการ(กาง/ลบ) · โมดัลรายละเอียด: ฟิลด์ + **ไฟล์แนบ (อัปโหลด)** + **Drive Link** + **ประวัติการแก้ไข** |
| **Gantt Chart** | ไทม์ไลน์งานตามวันเริ่ม–วันสิ้นสุด (ยังไม่ได้เปิดดูละเอียด) |
| **การประชุม** (Meetings) | การ์ด: วันที่·ช่วงเวลา, หัวข้อ, แผนก, ผู้รับผิดชอบ, **flag ติดตามต่อ/ไม่ติดตาม**, สรุป · โมดัล: วันที่ / เวลา(ข้อความ) / แผนก / ผู้รับผิดชอบ / ติดตามต่อ / สรุปการประชุม + ไฟล์แนบ + Drive Link + ประวัติ |
| **Rock & Improve** | ตาราง **รายแผนก**: แผนก \| **สิ่งที่ดีขึ้น** (ข้อความ) \| **ROCK — เป้าหมายต่อไป** (รายการ goals หลายข้อ เพิ่ม/ลบได้) \| ลบ · ปุ่ม "เพิ่มแผนก" |
| **Update Log** | changelog การพัฒนาเว็บ (แท็ก ปรับดีไซน์/เพิ่มใหม่/แก้ไขบัค) — **ระบบภายใน ไม่ใช่ข้อมูลผู้ใช้** |
| **ถังขยะ** (Trash) | รายการที่ลบ (soft-delete) กู้คืนได้ |

**สถานะงาน (4):** เสร็จสมบูรณ์ · กำลังดำเนิน · รอเริ่ม · ยกเลิก
**ลำดับ (2):** ปกติ · ด่วน (badge แดง ⚠)
**ผู้รับผิดชอบ** = ชื่ออิสระ (เช่น Kamonvon, Sakolrat) — ไม่ผูก user account

> ⚠ **แก้ premise เดิม:** "Rock & Improve" **ไม่ใช่** EOS Rocks+Issues (มี owner/quarter/
> status) อย่างที่ร่างแรกเดา — ของจริงคือ **บอร์ดรายแผนก** = "สิ่งที่ดีขึ้น" (สะท้อนผล) +
> "เป้าหมายต่อไป" (รายการ). เรียบง่ายกว่ามาก. การประชุมก็ไม่มี attendees array/มติแยก —
> มีแค่ สรุป + flag ติดตามต่อ.

---

## B. การตัดสินใจหลัก

| หัวข้อ | ค่าที่เลือก | หมายเหตุ |
|---|---|---|
| การเข้าถึง | เพิ่ม role `secretary` + ฝ่าย `SEC` + admin | ผู้ใช้ยืนยัน |
| ไฟล์ & เอกสาร | **2 ประเภท:** (1) อัปไฟล์ static ขึ้น Drive (2) **ผูก/สร้าง Google Doc·Sheet** (เอกสารมีชีวิต แก้ในที่) — ดู §F | ผู้ใช้: docs/sheets ต้องแก้ต่อได้ อัปไฟล์ทับกันวุ่นเวอร์ชัน |
| ปฏิทิน | **เพิ่มหน้า Calendar ผูกวันหยุด** (reuse holidays 0018) แสดงประชุม + งาน | ผู้ใช้ขอ — ช่วยทั้งประชุม/งาน/ติดตาม |
| สิทธิ์เอกสาร Google | **ทำทั้งสอง**: admin/เลขาเป็นสมาชิก Shared Drive + แอป grant สิทธิ์รายไฟล์ให้อีเมลผู้ใช้ | ผู้ใช้เลือก — กันเคสคนนอก Shared Drive |
| Data scope | company-wide (ไม่ผูก team ODM/KA/SV) | งานบริหารข้ามทีม |
| มิติข้อมูล | **แผนก** (หลัก) + **กรองตามปีจากวันที่จริง** | ดู §L#1 — ไม่ partition ปีแบบต้นแบบ |
| แผนก (taxonomy) | **master list ใหม่ของโมดูล** (เพิ่ม/แก้ได้) | ไม่ reuse DEPARTMENTS ฝั่งสิทธิ์ (คนละชุด: HR/MAR/AC/MN/Factory/Plan/QC) |
| ผู้รับผิดชอบ | **ผูก user จริง** (assigneeId) + snapshot ชื่อ + fallback ชื่ออิสระ | §L#2 — ตามแบบ PM (`assignable-users`) |
| การแก้ไข | **โมดัล + ยืนยัน + audit** (ไม่ autosave เงียบ) · quick-toggle เฉพาะ chip สถานะ/ลำดับ | §L#3 — ตาม [[pm-task-draft-confirm]] |
| ลบ | soft-delete + audit before-image (กู้ผ่านถังขยะ/audit) | §L#4 — mgmt ไม่มี FK ปลายน้ำ |
| Naming | key = `mgmt`, route `/mgmt`, label "งานบริหาร" | เปลี่ยนได้ |
| ปี (Rock&Improve) | เก็บ **ค.ศ. (int)**, แสดง พ.ศ. | เลี่ยง off-by-543; แปลงที่ lib/format.js |

---

## C. ที่ยืนในสถาปัตยกรรม (ระบบที่ 5)

- **System key** `mgmt` · **Route** `/mgmt` · **API** `/api/mgmt` · **Caps** `mgmt:view`/`mgmt:edit` (admin + secretary)
- เพิ่มการ์ดบน `/home` + กลุ่ม sidebar `system:'mgmt'` (โผล่เฉพาะ `mgmt:view`)
- **หัวโมดูลร่วม** (`app/mgmt/layout.js`): ตัวกรอง**ปี** + badge **% เสร็จ (live)** + ปุ่ม **"+ เพิ่ม"
  แบบ context-aware** (อยู่หน้า tasks→เพิ่มงาน, หน้า meetings→เพิ่มประชุม ฯลฯ) — ไม่ใช่ปุ่มรวมปุ่มเดียว

### การจัดเมนู sidebar (จัดกลุ่มแบบ ss_system) — 5 เมนูหลัก + utility
| กลุ่ม | เมนู | path | หมายเหตุ |
|---|---|---|---|
| **ภาพรวม** | Overview | `/mgmt` | landing = command center |
| **ติดตามงาน** | รายการงาน | `/mgmt/tasks` | ตาราง + drawer (ไฟล์/ประวัติ) |
| | ปฏิทิน | `/mgmt/calendar` | **cross-entity**: ประชุม+งาน+วันหยุด |
| **ประชุม & เป้าหมาย** | การประชุม | `/mgmt/meetings` | การ์ด + flag ติดตามต่อ |
| | Rock & Improve | `/mgmt/rocks` | บอร์ดรายแผนก |
| *(ล่างสุด/utility)* | ถังขยะ | `/mgmt/trash` | กู้คืน soft-delete |

### เลย์เอาต์แต่ละหน้า (แนะนำ)
- **Overview** — แถว KPI 5 ใบ → 2 คอลัมน์ (บาร์ความคืบหน้ารายแผนก \| โดนัทสัดส่วนสถานะ) → ตารางงานด่วน
- **รายการงาน** — toolbar กรอง (ค้นหา/แผนก/สถานะ/ลำดับ/ช่วงวันที่) → ตาราง (จอกว้าง) / การ์ด (จอแคบ)
  ผ่าน `useResponsiveView` → คลิกแถวเปิด drawer (ฟิลด์ + ไฟล์แนบ + ประวัติ)
- **ปฏิทิน** — เดือน/สัปดาห์: วันหยุดแรเงา + ประชุม (chip ตาม `meetingDate`) + งาน (chip/บาร์ตาม
  `startDate`–`dueDate`) + กรองแผนก; คลิกวัน→รายการของวันนั้น + quick-add. จอแคบ→agenda list
- **การประชุม** — card grid + flag ติดตามต่อ → คลิกเปิด drawer (สรุป + ไฟล์ + ปุ่มสร้างงานติดตาม)
- **Rock & Improve** — ตารางรายแผนก (แผนก \| สิ่งที่ดีขึ้น \| เป้าหมายต่อไป) — ตามต้นแบบ

**Reuse UI:** คลาสกลาง globals.css (toolbar/segmented/ui-badge/chip/progress/--ctl-h),
`components/ui/*`, `Modal`, `AttachmentsPanel` (อัปไฟล์ขึ้น Drive), `KpiCard`/`StatusBadge`
(จาก excise), `useResponsiveView`/`usePagination`/`useSortableTable`, **Calendar/วันหยุด reuse
`lib/master/holidays` (holidaySet) + `lib/pm/dateHelpers`/`weekGrid`** (มีอยู่แล้ว).
**ไม่มี Update Log** (changelog dev — ใช้ audit/commit แทน).

> **ปรับจากร่างก่อน (การจัดหน้า):** (1) **ตัด Gantt ออกจาก v1** — งานบริหารเป็น to-do
> ตามกำหนดส่ง ไม่ใช่งานมี dependency แบบ PM; **Calendar ครอบประโยชน์แล้ว** และ cross-entity
> กว่า. เก็บ Gantt ไว้เพิ่มทีหลังถ้าจำเป็น (reuse `lib/pm/ganttPrint` ได้). (2) จัดเมนูเป็น **กลุ่ม**
> (ไม่เรียงเรียบ 7 อัน) ให้เลขาสแกนง่าย. (3) ปุ่มเพิ่มเป็น **context-aware** แทนปุ่มรวม.

---

## D. Role/ฝ่าย ใหม่ — `lib/permissions.js`

```
DEPARTMENTS += 'SEC'; DEPARTMENT_LABELS.SEC='SEC'; DEPARTMENT_NAMES_TH.SEC='ฝ่ายเลขานุการ'
DEPARTMENT_ROLES.SEC=['secretary']; ROLE_DEFAULT_DEPARTMENT.secretary='SEC'
ROLES += 'secretary'; ROLE_LABELS.secretary='เลขานุการ (Secretary)'
SUPERUSER_CAPS += 'mgmt:view','mgmt:edit'      // admin ได้อยู่แล้ว
ROLE_CAPS.secretary = ['mgmt:view','mgmt:edit'] // เข้าเฉพาะโมดูลนี้
export function canAccessMgmt(role){ return can(role,'mgmt:view'); }
```
- `secretary` ไม่อยู่ใน TEAM_ROLES → ห้ามมี team; scope โมดูล = ทั้งบริษัท (gate ที่ cap พอ)
- อัปเดต `permissions.test.mjs`
- **⚠ แผนก "SEC" (ฝ่ายสิทธิ์) ≠ แผนกใน Rock&Improve/tasks** (HR/MAR/…) — คนละ taxonomy อย่าปน

---

## E. Data model — migrations 0057+ (รันมือ · ยืนยันเลขล่าสุด 0056 ก่อน)

camelCase ในเครื่องหมายคำพูด · additive/idempotent · `year` = ค.ศ. (int) · soft-delete ด้วย `deletedAt`

### 0057 — `mgmt_departments` (taxonomy แผนกของโมดูล — "เพิ่มแผนก")
```sql
create table if not exists public.mgmt_departments (
  code       text primary key,          -- 'HR','MAR','AC','MN','Factory','Plan','QC',...
  label      text not null,
  color      text,                        -- badge color (จับคู่สีเหมือนต้นแบบ)
  "sortOrder" int default 0,
  active     boolean default true
);
alter table public.mgmt_departments enable row level security;
```

### 0058 — `mgmt_tasks` (รายการงาน)
```sql
create table if not exists public.mgmt_tasks (
  id            text primary key,           -- 'MT-######'
  title         text not null,              -- "รายการ"
  "deptCode"    text,                        -- → mgmt_departments.code
  "assigneeId"  text, "assigneeName" text,    -- ผูก user (nullable) + snapshot ชื่อ (fallback ชื่ออิสระ)
  "startDate"   date, "dueDate" date,        -- ปีมาจาก dueDate (กรอง ไม่ partition — §L#1)
  status        text not null default 'todo', -- todo(รอเริ่ม)|in_progress(กำลังดำเนิน)|done(เสร็จสมบูรณ์)|cancelled(ยกเลิก)
  priority      text not null default 'normal', -- normal(ปกติ)|urgent(ด่วน)
  notes         text,                         -- "หมายเหตุ"
  "createdBy" text, "createdByName" text,
  "createdAt" timestamptz default now(), "updatedAt" timestamptz default now(),
  "deletedAt" timestamptz                     -- soft-delete → ถังขยะ
);
create index if not exists mgmt_tasks_due_idx on public.mgmt_tasks ("dueDate") where "deletedAt" is null;
alter table public.mgmt_tasks enable row level security;
```

### 0059 — `mgmt_meetings` (การประชุม)
```sql
create table if not exists public.mgmt_meetings (
  id            text primary key,           -- 'MG-######'
  title         text not null,
  "meetingDate" date not null,               -- ปีมาจาก meetingDate (กรอง — §L#1)
  "timeText"    text,                         -- ช่วงเวลาแบบข้อความ "9.30–11.00"
  "deptCode"    text,
  "assigneeId"  text, "assigneeName" text,
  "followUp"    text default 'none',           -- none(ไม่ติดตาม)|follow(ติดตามต่อ)
  summary       text,                          -- "สรุปการประชุม"
  "createdBy" text, "createdByName" text,
  "createdAt" timestamptz default now(), "updatedAt" timestamptz default now(),
  "deletedAt" timestamptz
);
create index if not exists mgmt_meetings_date_idx on public.mgmt_meetings ("meetingDate" desc) where "deletedAt" is null;
alter table public.mgmt_meetings enable row level security;
```

### 0060 — `mgmt_rock_improve` (Rock & Improve — 1 แถว/แผนก/ปี)
```sql
create table if not exists public.mgmt_rock_improve (
  id          text primary key,             -- 'RI-######'
  year        int not null,
  "deptCode"  text not null,
  improved    text,                           -- "สิ่งที่ดีขึ้น" (สะท้อนผล)
  goals       jsonb default '[]'::jsonb,       -- v1: ["เป้าหมาย 1","เป้าหมาย 2",...] (ข้อความ ตามต้นแบบ)
                                               -- later: ยกเป็น [{text,status,done}] เมื่อทำ "ติดตามผล" เชิงลึก (§K#13, เก็บไว้ท้ายๆ)
  "createdBy" text, "createdByName" text,
  "createdAt" timestamptz default now(), "updatedAt" timestamptz default now(),
  "deletedAt" timestamptz,
  unique (year, "deptCode")
);
alter table public.mgmt_rock_improve enable row level security;
```

### 0061 — `mgmt_updates` (ประวัติการแก้ไข / feed — polymorphic)
```sql
create table if not exists public.mgmt_updates (
  id           uuid primary key default gen_random_uuid(),
  "entityType" text not null,               -- 'task'|'meeting'|'rock'
  "entityId"   text not null,
  kind         text not null default 'edit', -- edit|status|comment|file|link
  body         text,
  meta         jsonb default '{}'::jsonb,     -- {field,from,to}
  "authorId" text, "authorName" text,
  "createdAt"  timestamptz default now()
);
create index if not exists mgmt_updates_entity_idx on public.mgmt_updates ("entityType","entityId","createdAt" desc);
alter table public.mgmt_updates enable row level security;
```

> **ไฟล์แนบ:** ใช้ `attachments` (0028) — entityType `mgmt_task`/`mgmt_meeting` — **2 ประเภทผ่าน
> `metadata.kind`** (ดู §F): `file` (อัป static) / `gdoc`·`gsheet` (Google Workspace มีชีวิต).
> คอลัมน์ที่มีอยู่พอ: `fileUrl`=webViewLink, `driveFileId`=Google file id, `metadata.kind`.
> การประชุมแนบได้หลายไฟล์ (บางครั้งไม่แนบก็ได้). **ปี** = ค.ศ. ใน DB. **FK** logical id [[no-real-fk-constraints]].

---

## F. ไฟล์ & เอกสาร — ต่อ `lib/drive.js` (2 ประเภท)

โฟลเดอร์รวม "งานบริหาร" บน Shared Drive → subfolder `การประชุม/` + `งานติดตาม/`.
เพิ่ม `ensureMgmtEntityFolder(entityType, entity)` + สาขาใน `resolveFolderForEntity`
สำหรับ `mgmt_task|mgmt_meeting` (ไม่ nest ใต้ลูกค้า/สินค้า).

**ประเภท 1 — ไฟล์ static** (`metadata.kind='file'`)
- อัปผ่านท่อเดิม `/api/upload` → `uploadFile` (private) → ดาวน์โหลดผ่าน proxy `/file` (stream + เช็คสิทธิ์)
- เหมาะกับ PDF/รูป/ไฟล์แนบที่ไม่แก้แล้ว

**ประเภท 2 — Google Doc/Sheet** (`metadata.kind='gdoc'|'gsheet'`) — *เอกสารมีชีวิต, แก้กันข้างนอก*

> **โมเดล (ผู้ใช้ยืนยัน):** ไฟล์ Doc/Sheet ถูก**แก้โดยคนอื่นที่ไม่ใช่ user ระบบนี้** ผ่าน Google
> โดยตรง (ภายนอก). ระบบนี้ (admin+เลขาเท่านั้น) **แค่ผูกลิงก์เพื่อติดตาม/ดู/แก้** — **ไม่จัดการสิทธิ์
> ให้คนนอก** (แชร์ไฟล์/โฟลเดอร์ให้ทีมงานทำใน Google Workspace เอง). ⇒ use case หลัก = **ผูกลิงก์
> ไฟล์ที่มีอยู่**; "สร้างใหม่" เป็นตัวช่วยเสริม.

- **ผูกที่มีอยู่ (หลัก):** วาง Drive URL → แยก fileId → `drive.files.get` เอา name/mimeType → บันทึกแถว
  attachment (fileUrl=webViewLink, driveFileId=fileId, kind ตาม mimeType). **ระบบไม่แตะ permission ของไฟล์**
- **สร้างใหม่ในแอป (เสริม):** ปุ่ม "สร้าง Doc/Sheet" → `drive.files.create` mimeType
  `application/vnd.google-apps.document`|`.spreadsheet` ใน**โฟลเดอร์ของงานนั้น** → คืน webViewLink → บันทึกแถว
  (แชร์ให้ทีมที่จะแก้ = ทำใน Google ภายหลัง / หรือไฟล์อยู่ใน Shared Drive ที่ทีมเป็นสมาชิกอยู่แล้ว)
- **เปิด = ลิงก์ตรง (webViewLink) ในแท็บใหม่** ไม่ผ่าน proxy (Google editor ใช้ session Google ของผู้เปิด);
  แก้สดใน Google ไม่ต้องอัปทับ → หมดปัญหาเวอร์ชัน
- ต้องเพิ่มใน `lib/drive.js`: `createGoogleFile(folderId, name, type)` + `getFileMeta(fileId)` + `parseDriveId(url)`

**สิทธิ์ (ขอบเขตระบบ = แค่ admin/เลขา):** ให้ admin+เลขาเปิดไฟล์ได้ → เป็น **สมาชิก Shared Drive
"งานบริหาร"** (baseline) + ตอนสร้างจากแอป grant อีเมลผู้ใช้เป็น writer. **สิทธิ์ผู้แก้ภายนอก = อยู่นอก
ระบบ** (Google Workspace) — ระบบไม่ยุ่ง.

⚠ ยัง **ต้อง verify Drive runtime บน Vercel ก่อน** [[drive-storage-plan]] (Phase 1+2 โค้ดเสร็จ ยังไม่เทส) — โมดูลนี้พึ่ง Drive หนักขึ้น (สร้างไฟล์ native + อ่าน metadata)

---

## G. API `/api/mgmt/*` (pattern `withUser` + `ok`/`fail`)

ทุก handler guard `can(user.role,'mgmt:view'|'mgmt:edit')` → ไม่ผ่านคืน `forbidden()`.
เขียนสำเร็จ → `recordAudit()` (entityType `mgmt_*`) **และ** append `mgmt_updates` (ประวัติการแก้ไข).

| route | method | หน้าที่ |
|---|---|---|
| `/api/mgmt/tasks` `/[id]` | GET/POST · GET/PATCH/DELETE | list (filter year/dept/status/priority/date/ค้นหา) · CRUD · DELETE = soft (set deletedAt) |
| `/api/mgmt/meetings` `/[id]` | GET/POST · GET/PATCH/DELETE | การประชุม (filter ปี) |
| `/api/mgmt/rocks` `/[id]` | GET/POST · GET/PATCH/DELETE | rock&improve ราย dept/ปี (goals แก้เป็น array) |
| `/api/mgmt/departments` `/[code]` | GET/POST · PATCH/DELETE | taxonomy แผนก ("เพิ่มแผนก") |
| `/api/mgmt/docs` | POST | ผูก Google Doc/Sheet (จาก URL) หรือ **สร้างใหม่** ในโฟลเดอร์ entity → บันทึก attachment + (option) grant สิทธิ์อีเมลผู้ใช้ |
| `/api/mgmt/updates` | GET/POST | ประวัติ/feed ต่อ entity |
| `/api/mgmt/overview` | GET | KPI + progress-by-dept + status-donut + งานด่วน (กรอง `?year=`) |

- id gen: helper `lib/mgmt/` (mirror `generateProjectCode`) prefix `MT/MG/RI-`
- ไฟล์/ลิงก์: ใช้ `/api/upload` + `/api/master/attachments` เดิม (entityType `mgmt_*`)
- **ผู้รับผิดชอบ (dropdown):** reuse `/api/pm/assignable-users` (มีอยู่แล้ว คืน id/name/role/team) — เพิ่มการ gate ให้ `mgmt:view` เรียกได้ด้วย (ปัจจุบัน gate แค่ `pm:view`)
- **ปี:** ไม่มี route แยก — filter จาก `dueDate`/`meetingDate`; dropdown ปีคำนวณจากช่วงข้อมูลที่มี

---

## H. proxy.js — เปิดทางให้ secretary (ADMIN_LOCKDOWN=true อยู่)

1. `OPEN_PAGES += '/mgmt'`
2. `OPEN_WRITE_APIS += '/api/mgmt'`
3. `apiWriteAllowed`: `if (path.startsWith('/api/mgmt')) return can(role,'mgmt:edit');`
4. เกต `/api/attachments`: เพิ่ม `|| can(role,'mgmt:edit')`
5. handler `/api/master/attachments`: entityType ขึ้นต้น `mgmt_` → เช็ค `mgmt cap` (ไม่มี parent customer/product)

---

## I. Touch-points

| # | ไฟล์ | ทำอะไร |
|---|---|---|
| 1 | `lib/permissions.js` (+test) | role/ฝ่าย/caps/canAccessMgmt (§D) |
| 2 | migrations 0057–0061 | 5 ตาราง (§E) รันมือ + seed `mgmt_departments` (HR/MAR/AC/MN/Factory/Plan/QC) |
| 3 | `components/AppLayout.js` | system 'mgmt' + sidebar + badge role ใหม่ |
| 4 | `app/home/page.js` | การ์ด "งานบริหาร" (canAccessMgmt) + wideCols |
| 5 | `app/mgmt/**` (ใหม่) | **6 หน้า** (§C: Overview/tasks/calendar/meetings/rocks/trash — ตัด Gantt) + หัวโมดูล (layout) |
| 6 | `app/api/mgmt/**` (ใหม่) | routes §G |
| 7 | `lib/mgmt/**` (ใหม่) | repo/code-gen/status+progress helper/year util |
| 8 | `components/mgmt/**` (ใหม่) | TaskTable/TaskDrawer/MeetingCard+Form/RockImproveTable/OverviewCards/Trash/CalendarView/**DocsPanel** (แนบไฟล์+ผูก/สร้าง Doc·Sheet) |
| 9 | `lib/drive.js` | resolveFolderForEntity + ensureMgmt*Folder + **createGoogleFile / getFileMeta / parseDriveId / (option) grantPermission** (§F) |
| 10 | `app/api/master/attachments/route.js` | อนุญาต entityType `mgmt_*` ตาม mgmt cap; รองรับ `metadata.kind` (file/gdoc/gsheet) → เปิด native ด้วย webViewLink ไม่ผ่าน proxy |
| 11 | `proxy.js` | §H |
| 12 | `lib/format.js` | helper แปลงปี ค.ศ.↔พ.ศ. (ถ้ายังไม่มี) |
| 13 | `app/api/pm/assignable-users/route.js` | เปิด gate ให้ `mgmt:view` เรียกได้ (ปัจจุบัน pm:view) |
| 14 | Calendar reuse | `lib/master/holidays` (holidaySet) + GET `/api/holidays` (proxy เปิด GET อยู่แล้ว) — ไม่มีตารางใหม่ |
| 15 | `app/mgmt/layout.js` (ใหม่) | หัวโมดูลร่วม: ตัวกรองปี (context) + ปุ่ม "เพิ่มรายการ" + badge "% เสร็จ (live)" — ใช้ทุกหน้าใน /mgmt |

---

## J. เฟส

**เฟส 0** — permissions (#1) + migrations 0057–0061 + seed departments (#2) + user เลขาทดสอบ
**เฟส 1 (แกน: req #1–5)** — API tasks+updates+departments+overview (#6,#7) + proxy (#11) + **อัปไฟล์ static** ขึ้น Drive (#9,#10,#13) + หน้า Overview + รายการงาน (drawer ไฟล์/ประวัติ) + แถบปี (#3,#4,#5,#8)
**เฟส 2 (req #6 + ปฏิทิน + เอกสารมีชีวิต)** — การประชุม (การ์ด+โมดัล+ติดตามต่อ→เชื่อมงาน) + **Google Doc/Sheet ผูก/สร้าง** (DocsPanel + `/api/mgmt/docs` + createGoogleFile + สิทธิ์ §F) + **Calendar ผูกวันหยุด** (#14)
> Gantt = **ตัดจาก v1** (Calendar ครอบแล้ว) — เพิ่มทีหลังถ้าจำเป็น (reuse `lib/pm/ganttPrint`)
**เฟส 3 (req #7)** — Rock & Improve (ตารางรายแผนก + goals add/remove) + ถังขยะ (กู้คืน) + Overview เต็ม (donut/บาร์รายแผนก)

---

## L. คำแนะนำ: ปรับต้นแบบให้เข้ากับ ss_system (Apps Script เป็นแค่ตัวลองทำ)

ต้นแบบทำหลายอย่างด้วยวิธีของ Apps Script/Sheet ซึ่ง ss_system มี convention อยู่แล้ว —
แนะนำ **ยึด pattern ของ ss_system** (ได้ audit/สิทธิ์/ความสม่ำเสมอฟรี) แทนการลอกพฤติกรรม:

1. **ปี: กรอง ไม่ partition.** ต้นแบบมี "เพิ่มปี" + สลับชุดข้อมูลราย พ.ศ. → ไม่ต้องมีตาราง
   ปี/ปุ่มเพิ่มปี. เก็บ **วันที่จริง** (dueDate/meetingDate) แล้วให้ dropdown ปีเป็น **ตัวกรอง**
   (แบบเดียวกับรายงาน excise ที่กรองช่วงวันที่). ค.ศ. ใน DB, แสดง พ.ศ. ที่ `lib/format.js`.
   *ข้อดี:* งานข้ามปีไม่หาย, ไม่ต้องก็อปข้อมูลข้ามปี, สอดคล้องทั้งเว็บ.

2. **ผู้รับผิดชอบ: ผูก user จริง.** ต้นแบบใช้ชื่ออิสระ (Kamonvon). แนะนำ dropdown จาก
   `/api/pm/assignable-users` (id+ชื่อ) เก็บ `assigneeId` + snapshot ชื่อ — ได้ความรับผิดชอบ/
   avatar/ต่อยอด "งานของฉัน" ได้เหมือน PM. ยัง **เผื่อชื่ออิสระ** ไว้เคสคนนอกระบบ.

3. **แก้ไข: โมดัล + ยืนยัน + audit** (ไม่ autosave เงียบทุก cell). ss_system ย้าย PM ไปเป็น
   draft-confirm แล้ว [[pm-task-draft-confirm]] + ทุก write ลง `recordAudit`. คง **quick-toggle**
   เฉพาะ chip เบาๆ (สถานะ/ลำดับ) ที่ risk ต่ำ; ที่เหลือแก้ผ่านโมดัล. คุม race + validate ที่ handler.

4. **ลบ: soft-delete + audit before-image.** mgmt ไม่มี record ปลายน้ำอ้าง (ต่างจาก
   customer/registration ใน [[no-real-fk-constraints]]) → soft-delete (`deletedAt`) + เก็บ before
   ใน `audit_logs` พอ; "ถังขยะ" = view ของแถวที่ soft-delete แล้วกู้คืน. ใช้แนวทาง `lib/deletion.js`
   (คืนข้อความบล็อกถ้ามีอ้าง) แม้ mgmt จะแทบไม่มีเคสบล็อก — เพื่อความสม่ำเสมอ.

5. **แผนก: เป็น master data.** ทำ `mgmt_departments` แบบ master list (จัดการโดย `mgmt:edit`)
   เลียนแบบ pattern `product-types` — seed ค่าจริง (HR/MAR/AC/MN/Factory/Plan/QC) + สี badge.
   **แยกจาก DEPARTMENTS ฝ่ายสิทธิ์** ชัดเจน (คนละความหมาย).

6. **ไม่พอร์ต "Update Log".** เป็น changelog ของ dev → ใช้ git history + `audit_logs` ของเราแทน.

7. **ไฟล์ = 2 ประเภท (static อัป + Google Doc/Sheet มีชีวิต).** ไม่ใช่แปะลิงก์มั่วแบบต้นแบบ,
   แต่ก็ไม่ใช่อัปอย่างเดียว: static → อัป Drive+proxy; Docs/Sheets → ผูก/สร้างในโฟลเดอร์งาน
   เปิดแก้สดใน Google (หมดปัญหาเวอร์ชัน). ต้องทำ **DocsPanel ใหม่** (AttachmentsPanel เดิม upload-only) + `metadata.kind`.

8. **UI: reuse ให้มากที่สุด.** KPI/donut → `components/excise/KpiCard`; ตาราง responsive →
   `useResponsiveView`+`useSortableTable`; ไฟล์แนบ → `AttachmentsPanel`; Gantt →
   `lib/pm/ganttPrint`+`schedule`; **ปฏิทิน/วันหยุด → `lib/master/holidays`+`lib/pm/dateHelpers`**;
   toolbar/segmented/badge/progress → คลาสกลาง globals.css [[shared-ui-layer]]. คงสี/ธีม ss_system
   (ไม่ยกธีม navy ของต้นแบบมา).

> **คงไว้จากต้นแบบ** เพราะเข้ากับงานเลขาดี: มุมมองจัดตามแผนก, KPI+โดนัทสถานะ, การ์ดประชุม +
> flag "ติดตามต่อ", บอร์ด Rock & Improve รายแผนก, ไฟล์แนบ (อัปขึ้น Drive).
> **เพิ่มจากต้นแบบ** ตามที่ผู้ใช้ขอ: **หน้า Calendar ผูกวันหยุด** (ประชุม+งาน) — ช่วยวางแผน
> ประชุม/งาน/ติดตามได้เห็นภาพรวมกว่า Gantt เดี่ยวๆ.

---

## K. ค้างตรวจ / ความเสี่ยง

1. **Gantt ตัดจาก v1** — Calendar ครอบประโยชน์แล้ว; ถ้าภายหลังอยากได้ timeline แบบ bar ค่อย reuse `lib/pm/ganttPrint`+`schedule`
2. **แผนก (taxonomy)** — ต้นแบบมี "เพิ่มแผนก" = แก้ได้เอง → ทำเป็น master list (#2); seed ค่าเริ่มจากของจริง
3. **ปี พ.ศ./ค.ศ.** — เก็บ ค.ศ. แปลงตอนแสดง กัน off-by-543
4. **Drive runtime ยังไม่ verify** [[drive-storage-plan]] — โมดูลพึ่ง Drive; ยืนยัน STORAGE_BACKEND=drive ก่อน
5. **ADMIN_LOCKDOWN** — ลืมเปิด `/mgmt` = เลขาโดนเด้ง /home
6. **badge/enum ที่ hardcode role** — ไล่เพิ่ม `secretary` ทุกที่
7. **inline-edit** — ตารางงานแก้ในช่องทันที (autosave) → PATCH ต่อ cell + append ประวัติ; ระวัง race/validation
8. **soft-delete + ถังขยะ** — ทุก list ต้อง filter `deletedAt is null`; ถังขยะ = กู้คืน (set null)
9. **เลข migration ชนตอน merge** · **เคลียร์ demo data ก่อน deploy** [[clear-demo-data-before-deploy]] · **commit/push เมื่อ verify** [[commit-push-without-asking]] · migration prod ก่อน deploy [[deploy-workflow]]
10. **ไม่พอร์ต Update Log** — เป็น changelog dev; ใช้ audit/commit ของเราแทน
11. **Calendar** — reuse `holidays` (0018) + `lib/master/holidays`; overlay ประชุม (`meetingDate`) + งาน (`startDate`–`dueDate`). GET `/api/holidays` proxy เปิด GET ให้ทุก user อยู่แล้ว (OPEN_READ_APIS). ยืนยัน `lib/pm/weekGrid`/`dateHelpers` reuse ได้ หรือทำ grid เอง
12. **Google Doc/Sheet — สิทธิ์เปิด native** ต่างจาก proxy: เปิดด้วยบัญชี Workspace ผู้ใช้ → **ทำทั้งคู่** (สมาชิก Shared Drive + grant รายไฟล์ให้อีเมล — ต้องรู้อีเมล Workspace ผู้ใช้จาก session). ต้องทำ **DocsPanel ใหม่** (AttachmentsPanel เดิม upload-only ล้วน). `createGoogleFile` เพิ่มภาระ Drive API → ยิ่งต้อง verify runtime ก่อน

## ⟢ จุดที่ต้องยืนยันก่อนลงมือ (ทบทวนรอบนี้)

13. **Rock "ติดตามผล" เชิงลึก — เก็บไว้ท้ายๆ (ผู้ใช้ตัดสิน).** v1 ใช้ goals เป็นข้อความตามต้นแบบ.
    ค่อยยกเป็น `{text,status,done}` (ติ๊กรายข้อ) หรือ progress%/on-track ทีหลัง — ยังไม่ทำเฟสแรก.
14. **ข้อมูลเดิม: เริ่มใหม่สะอาด (ผู้ใช้ตัดสิน).** ไม่ import จาก Google Sheet — เริ่มกรอกใหม่ในระบบ.
    (ตัดงาน import script + การ map คอลัมน์ Sheet ออกจากขอบเขต)
15. **Meeting "ติดตามต่อ" → งาน:** ทำ **ปุ่ม "สร้างงานติดตาม"** บนการประชุม → สร้าง mgmt_task
    ผูก `meetingId` อัตโนมัติ (ผมใช้แนวนี้ เว้นแต่จะบอกเปลี่ยน).

---

ขอบเขตรวม: **5 migration + ~6 ไฟล์แก้ + ~22 ไฟล์ใหม่** (6 หน้า + หัวโมดูล layout + ~7 API group + lib/mgmt + components/mgmt)
