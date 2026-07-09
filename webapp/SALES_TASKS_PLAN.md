# แผนระบบมอบหมาย/ติดตามงาน (Sales Task Management)

> ปรับใช้จากเทมเพลต Google Sheets **"kinn Assignment Tracker [MASTER_DISTRIBUTION] V1.1"**
> แทนที่เมนู **"งานของฉัน"** (`/sa/tasks`) ในระบบบริหารงานขาย
> สถานะ: ✅ เฟส 1 ลงมือแล้ว (2026-07-09) — เหลือเฟส 2-4 | ⚠ ต้องรัน migration 0085 บน Supabase prod ก่อน merge

---

## 1. สิ่งที่เทมเพลตต้นแบบมี (สำรวจจากชีตจริง)

| แท็บ | เนื้อหา |
|---|---|
| **Assignment Tracker** | ตารางงานหลัก: วันที่เริ่มต้น, สิ่งที่ต้องทำ, โครงการ, หมวดหมู่, ผู้รับมอบหมาย, สถานะ, ความสำคัญ, สำคัญ?, ด่วน?, ระดับความยาก, กำหนดเสร็จ, เวลา, เหลือเวลา(วัน), วันที่เสร็จสิ้น, ความคืบหน้า%, รายละเอียด + การ์ดสรุป (งานทั้งหมด/เสร็จแล้ว/กำลังทำ/เลยกำหนด/กำหนดเสร็จวันนี้) + กราฟ (แบ่งตามความสำคัญ/สถานะ/ความคืบหน้าโครงการ/ผู้รับมอบหมาย) + แจ้งเตือนงานพรุ่งนี้ |
| **Set up** | Dropdown กลาง: โครงการ, หมวดหมู่งาน, ผู้รับมอบหมาย, สถานะ (เรียงลำดับ → แปลงเป็น % ความคืบหน้าอัตโนมัติ เช่น ยังไม่เริ่ม→กำลังทำ→ตรวจสอบ→แก้ไข→เสร็จแล้ว) |
| **Eisenhower Matrix** | จัดงานเข้า 4 ช่อง สำคัญ×เร่งด่วน (ทำทันที / วางแผน / มอบหมายต่อ / ตัดทิ้ง) กรองตามคน/โครงการ |
| **Smart Calendar** | ปฏิทินรายเดือน แสดงงานตามกำหนดเสร็จ |
| **Kanban Board** | คอลัมน์ตามสถานะ + กรองช่วงวันที่ |
| **Team KPI** | ผลการประเมินรายคน: ความคืบหน้า, งานทั้งหมด/เสร็จ, คะแนนงานเสร็จ, คะแนนส่งตรงเวลา, คะแนนระดับความยาก → **คะแนน KPI รวมถ่วงน้ำหนัก** (กำหนดน้ำหนักเองได้ รวม 100%) + กรองช่วงวันที่ |

## 2. โจทย์ของเรา

- จัดการงาน **รายบุคคล + รายทีม** ในระบบบริหารงานขาย
- **Senior AE** ติดตามงานของทีมตัวเอง / **Supervisor** ติดตามทุกทีม (ตาม data-scope เดิม)
- **วัดผลได้** (KPI รายคน/รายทีม)
- **เชื่อมกับโครงการ (deals)** ได้
- แทนที่เมนู "งานของฉัน" เดิมที่ `/sa/tasks`

## 3. ของเดิมที่ต่อยอดได้ (ไม่ต้องสร้างใหม่)

| ของเดิม | ใช้ทำอะไร |
|---|---|
| `personal_tasks` (mig 0019, 0026 เพิ่ม `assigneeId`) | ฐานตารางงาน — ขยายคอลัมน์แทนสร้างตารางใหม่ |
| `project_tasks` + `/api/pm/my-work` scope mine/team/all บังคับฝั่ง server ตาม role | กติกา scope สำเร็จรูป: AE=mine, Senior AE=team, Supervisor/admin=all |
| `lib/pm/derived.js` (`daysToDue`, `isUrgent`, `getComputedStatus`) | urgency/เลยกำหนด — single source เดิม |
| `KpiCard` + `ActionQueue` (Module Overview Pattern) | การ์ดสรุป + คิวงานด่วน |
| `useResponsiveView` | จอนอน→Table, จอตั้ง→List |
| กฎ no auto-save | ทุกฟอร์มมีปุ่ม "บันทึก" |

## 4. ดีไซน์ที่เสนอ

### 4.1 ข้อมูล — ขยาย `personal_tasks` (migration 0085, รันมือ)

```sql
-- 0085_sales_task_management.sql
alter table personal_tasks add column if not exists "assignedBy"  text;          -- ใครมอบหมาย (user id)
alter table personal_tasks add column if not exists "startDate"   text;          -- 'YYYY-MM-DD'
alter table personal_tasks add column if not exists category      text;          -- หมวดหมู่งาน
alter table personal_tasks add column if not exists important     boolean default false;  -- สำคัญ?
alter table personal_tasks add column if not exists urgent        boolean default false;  -- ด่วน?
alter table personal_tasks add column if not exists difficulty    smallint default 2;     -- 1 ง่าย / 2 กลาง / 3 ยาก
alter table personal_tasks add column if not exists "completedAt" text;          -- วันเสร็จจริง (เซ็ตตอน status→Completed)
alter table personal_tasks add column if not exists "dealId"      text;          -- เชื่อมดีล (nullable, คู่กับ projectId เดิม)
create index if not exists personal_tasks_assignedby_idx on personal_tasks ("assignedBy");
create index if not exists personal_tasks_deal_idx on personal_tasks ("dealId");
```

จุดตัดสินใจที่ล็อกไว้ในดีไซน์นี้:
- **ขยาย `personal_tasks` ไม่สร้างตารางใหม่** — my-work API เดิมใช้ต่อได้ทันที ไม่ต้อง migrate ข้อมูล
- **สถานะคง 3 ค่า** (Pending / In Progress / Completed) ก่อน — % ความคืบหน้าอนุมานจากสถานะ (0/50/100) แบบเดียวกับตรรกะเทมเพลต แต่ไม่เพิ่มสถานะ "ตรวจสอบ/แก้ไข" จนกว่าจะใช้จริง (เพิ่มทีหลังได้ไม่พังโครง)
- **สำคัญ?/ด่วน? เป็น boolean แยก** → Eisenhower Matrix อนุมานได้ตรง ๆ ไม่ต้องมีฟิลด์ "ความสำคัญ" ซ้ำอีกชั้น (เทมเพลตมีทั้งคู่ ซ้ำซ้อน)
- **ระดับความยาก 3 ระดับพอ** (เทมเพลตมี 5 — ละเอียดเกินการใช้งานจริง) ใช้เป็นตัวถ่วงน้ำหนัก KPI
- **เชื่อมได้ทั้ง `dealId` และ `projectId`** — ดีลคือแม่ (Sales⊃PM) แต่งานปฏิบัติการบางงานผูกโปรเจกต์ตรง ๆ สะดวกกว่า
- **หมวดหมู่งาน**: ค่าคงที่ในโค้ดก่อน (เช่น ติดต่อลูกค้า / เอกสาร-ใบเสนอราคา / ตามออเดอร์ / ประชุม / อื่นๆ) — ยังไม่ทำหน้า setup แยก จนกว่าจะมีเคสต้องเพิ่มเอง

### 4.2 สิทธิ์การมอบหมาย (ตาม hierarchy เดิม)

| Role | สร้าง/มอบหมายให้ | เห็น scope |
|---|---|---|
| AC / AE | ตัวเอง (+ AC ในทีมสำหรับ AE) | mine |
| Senior AE | ทุกคนในทีมตัวเอง | mine + team |
| Supervisor / admin | ทุกคนทุกทีม | mine + team + all |

- แก้/ลบงาน: เจ้าของงาน, ผู้มอบหมาย, และหัวหน้าตามสายบังคับบัญชา
- งานส่วนตัวที่ไม่ผูกดีล/โปรเจกต์ของคนอื่น **ไม่หลุด** เข้า scope team/all — คงพฤติกรรม my-work เดิม **ยกเว้น** งานที่ถูก "มอบหมาย" (มี `assignedBy` ≠ owner) ให้หัวหน้าที่อยู่ในสายเห็นเสมอ ไม่งั้น Senior ติดตามงานที่ตัวเองสั่งไม่ได้

### 4.3 หน้า UI — `/sa/tasks` ใหม่ (แทนที่หน้าเดิมทั้งหน้า)

โครงหน้าเดียว + view switcher (ตาม Module Overview Pattern):

1. **แดชบอร์ด (แถบบน, ทุก view)** — KpiCard: งานทั้งหมด / กำลังทำ / เสร็จแล้ว / เลยกำหนด / ครบกำหนดวันนี้-พรุ่งนี้ + แถบกรอง: scope (ของฉัน/ทีม/ทั้งหมด ตาม role), คน, ทีม, ดีล/โปรเจกต์, หมวดหมู่, ช่วงวันที่
2. **View: รายการ** (default) — ตาราง/การ์ด responsive: งาน, ผู้รับ, ดีล/โปรเจกต์, หมวด, สำคัญ/ด่วน (ชิป), ยาก, กำหนดเสร็จ + เหลือกี่วัน (ใช้ `daysToDue`), สถานะ (StatusSelect), inline แก้ไขแบบ draft + ปุ่มบันทึก
3. **View: บอร์ด (Kanban)** — 3 คอลัมน์ตามสถานะ, การ์ดลากไม่ทำเฟสแรก (คลิกเปลี่ยนสถานะแทน — ง่ายกว่าและใช้บนมือถือได้)
4. **View: ปฏิทิน** — รายเดือน จุดสี = งานตามกำหนดเสร็จ คลิกวันเห็นรายการ
5. **View: เมทริกซ์** — Eisenhower 4 ช่องจาก important×urgent (ช่อง "มอบหมายต่อ" มีปุ่มเปลี่ยนผู้รับ)
6. **หน้า KPI ทีม** — `/sa/tasks/kpi` (เห็นเฉพาะ Senior AE ขึ้นไป): ตารางรายคน (งานทั้งหมด, เสร็จ, % เสร็จ, % ส่งตรงเวลา `completedAt ≤ dueDate`, คะแนนความยากถ่วง) → **คะแนนรวม = 40% เสร็จ + 40% ตรงเวลา + 20% ความยาก** (ค่าคงที่ v1, ทำหน้าตั้งน้ำหนักทีหลังถ้าต้องใช้) + กรองช่วงเวลา/ทีม; Supervisor เห็นทุกทีม + แถวสรุปรายทีม

### 4.4 การเชื่อมกับดีล/โปรเจกต์

- ฟอร์มงานเลือก "ผูกกับ: ดีล | โปรเจกต์ | ไม่ผูก" — โชว์รหัส+ชื่อ ลิงก์คลิกไปหน้า detail
- หน้า deal detail (`/sa/deals/[id]`) เพิ่มแท็บ/section "งาน" แสดงงานที่ผูกดีลนั้น + ปุ่มเพิ่มงานจากในดีล (เฟส 2)
- `project_tasks` (งานขั้นตอนที่ระบบ gen จาก timeline โปรเจกต์) **ไม่แสดง** ในหน้านี้แล้ว (ตัดสินใจ 2026-07-09) — หน้า "งาน" เป็นระบบมอบหมายงานล้วน ๆ จาก personal_tasks เหมือน kinn Assignment Tracker. งานขั้นตอนโปรเจกต์ดู/แก้ที่หน้า timeline ของโปรเจกต์โดยตรง. งานที่อยาก track ใน "งาน" ให้สร้าง personal task แล้วผูกโปรเจกต์/ดีลเอง

### 4.5 API

- ขยาย `GET /api/pm/my-work` → เพิ่ม filter (คน/หมวด/ช่วงวันที่/ดีล) + คืน field ใหม่ (เส้นทางเดิม ชื่อเดิม — หน้าที่อื่นเรียกอยู่ไม่พัง)
- `POST/PATCH/DELETE /api/pm/personal-tasks` เดิม: เพิ่ม validation สิทธิ์มอบหมายตาม 4.2 + เซ็ต `completedAt` อัตโนมัติเมื่อเปลี่ยนเป็น Completed + `recordAudit`
- ใหม่ `GET /api/sales-planning/task-kpi?from&to&team` — คำนวณ KPI ฝั่ง server ตาม scope

## 5. เฟสการทำงาน

| เฟส | เนื้อหา | หมายเหตุ |
|---|---|---|
| **1** ✅ | mig 0085 + ขยาย API (`my-work` team/all เห็นงานมอบหมาย + resolve deals; `personal-tasks` POST/PATCH สิทธิ์มอบหมายตามลำดับชั้น `canAssignTask` + completedAt อัตโนมัติ + audit) + หน้า `/sa/tasks` (เปลี่ยนหัวเป็น "งาน", แดชบอร์ด, ฟอร์มใหม่: วันเริ่ม/หมวด/สำคัญ-ด่วน/ยาก/เชื่อมดีล-โปรเจกต์/มอบหมาย, การ์ดโชว์ meta) | ✅ ลงมือแล้ว — build+lint ผ่าน. `lib/pm/tasks.js`, `lib/usersRepo.js`. **หน้ารื้อเป็นรายการเดียว (flat) — ตัด project_tasks ออกทั้งหมด**, list/table view, กรองหมวด/ผู้รับ/สถานะ |
| **2** 🔶 | ✅ Kanban + ปฏิทิน + Eisenhower (เพิ่มเป็น view mode ใน ViewSwitcher: list/table/board/calendar/matrix) · ⏳ section งานในหน้า deal detail (ยังไม่ทำ) | view เสริม ไม่มี migration — ทำงานบนรายการที่กรองอยู่แล้ว |
| **3** | หน้า KPI ทีม `/sa/tasks/kpi` + คะแนนถ่วงน้ำหนัก | วัดผล |
| **4 (option)** | สถานะเพิ่ม (ตรวจสอบ/แก้ไข), หน้าตั้งน้ำหนัก KPI, รวม `project_tasks` เข้า KPI, แจ้งเตือนงานพรุ่งนี้ | ทำเมื่อใช้จริงแล้วต้องการ |

## 6. สิ่งที่จงใจตัดออกจากเทมเพลต

- **ฟิลด์ "เวลา" (ชั่วโมง) + "ความสำคัญ" (ระดับ)** — ซ้ำกับ สำคัญ?/ด่วน? และไม่มีใครกรอกจริง
- **หน้า Set up dropdown** — ผู้รับมอบหมายดึงจาก users จริง, ดีล/โปรเจกต์ดึงจากตารางจริง, หมวด/สถานะเป็นค่าคงที่ในโค้ด
- **แจ้งเตือนในชีต** — เฟสแรกใช้การ์ด "ครบกำหนดวันนี้-พรุ่งนี้" บนแดชบอร์ดแทน
