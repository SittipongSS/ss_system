# PM Command Center — Implementation Plan (ฉบับปรับปรุง)

แพลนนี้ต่อยอดจากบทวิเคราะห์ของ Codex (`outputs/pm-command-center-plan.md`) โดย **แก้จุดคลาดเคลื่อน
และอุดช่องโหว่** ที่เจอจากการตรวจกับโค้ดจริงใน repo นี้ เป้าหมายเดิมคงไว้: เปลี่ยน `/pm` ให้เป็น
"ศูนย์บัญชาการ" ที่เห็นงานเสี่ยง/ล่าช้า/ภาระงานทีม แล้วกดไปจัดการได้เร็ว

> สถานะ ground truth (ตรวจ 2026-06-26): route `/pm` **ยังไม่มี** มีแค่ `/pm/projects` กับ `/pm/tasks`;
> project-level computed status อยู่ที่ client `projects/page.js` เท่านั้น; `lib/pm/status.js` เป็น
> task-level (Pending↔In Progress) ล้วน; API `select('id, projectId, name, status, finishDate, stepOrder')`

---

## 0. หลักการที่ต่างจากแพลนเดิม (สำคัญสุด)

1. **Single source of truth สำหรับ "สถานะโครงการ"**
   ตอนนี้ logic นี้อยู่ที่เดียวคือ `getComputedStatus()` ใน `webapp/src/app/pm/projects/page.js:25`
   (`Dropped / On Hold / Completed / Delayed / New / On Track`). **ห้ามนิยามใหม่ใน command center**
   ให้ย้ายฟังก์ชันนี้ + `getProgress / getCurrentStep / getOverdueCount` ออกมาไว้ที่
   `webapp/src/lib/pm/commandCenter.js` แล้ว **แก้ `projects/page.js` ให้ import กลับมาใช้** เพื่อให้
   `/pm` กับ `/pm/projects` ใช้คำนิยามเดียวกัน 100%
   - หมายเหตุ: `lib/pm/status.js` (task-level auto-status) เป็นคนละชั้น **ไม่ต้องแตะ** — command center
     ใช้ผลลัพธ์ `task.status` ที่ persist แล้วเท่านั้น

2. **Next.js เวอร์ชันนี้ถูกดัดแปลง** — ก่อนสร้าง route ใหม่ ให้เปิดอ่าน `node_modules/next/dist/docs/`
   (ดู `webapp/AGENTS.md`) อย่าเดา API จาก Next.js มาตรฐาน

3. **เพิ่ม nav item เอง** — sidebar (`webapp/src/components/AppLayout.js:174-180`) ยังไม่มี `/pm`
   ต้องเพิ่ม item "ศูนย์บัญชาการ" ในกลุ่ม `system: 'pm'`

4. **ก่อน commit เคลียร์ข้อมูล demo/mock ออก** (ตามกติกาโปรเจกต์)

---

## 1. Scope

### In scope (PR แรก)
- ไฟล์ใหม่ `webapp/src/lib/pm/commandCenter.js` + test
- refactor `projects/page.js` ให้ import helper จากไฟล์ใหม่ (no behavior change)
- ขยาย task select ใน `webapp/src/app/api/pm/projects/route.js`
- หน้าใหม่ `webapp/src/app/pm/page.js` = PM Command Center
- nav item "ศูนย์บัญชาการ" ใน `AppLayout.js`
- KPI strip + Action Queue + Team Timeline (project-level) + milestone markers + compact project entry point

### Out of scope (เฟสถัดไป)
- quick segments (`ทีมฉัน` ฯลฯ), workload overview เชิงลึก (by department), timeline ลง task ย่อย
- `/api/pm/command-center` แยก, report/export, real-time
- ไม่แตะ `/pm/projects` (list/archive/pagination/CRUD), `/pm/projects/[id]`, permission logic
- ไม่แก้ lint หนี้เดิมนอกไฟล์ที่แตะ

---

## 2. งานแยกเป็นสเต็ป

### Step 1 — Baseline
```powershell
cd webapp
npm.cmd run test ; npm.cmd run build ; npm.cmd run lint
```
บันทึก lint error เดิม (โดยเฉพาะ `pm/projects/[id]/page.js`, `ProjectDocumentView.js`) ไว้เทียบ — งานนี้
ต้องไม่เพิ่ม error ใหม่ในไฟล์ที่เราแตะ

### Step 2 — สร้าง `lib/pm/commandCenter.js` (ย้าย logic ออกจาก page.js)
ย้าย (ตัด-แปะ ไม่แก้ logic) จาก `projects/page.js`:
- `getComputedStatus(project)` — ตามนิยามเดิมเป๊ะ (`projects/page.js:25-40`)
- `getProgress(project)` (`:46`)
- `getCurrentStep(project)` (`:51`)
- `getOverdueCount(project)` (`:56`)

แล้วเพิ่ม builder ใหม่ (รับ `today` เป็น arg เพื่อ test ได้):
```js
export function getDueSoonProjects(projects, days = 7, today = new Date()) {}
export function buildPmKpis(projects, today = new Date()) {}      // active / delayed / dueSoon / inProgressTasks / completed
export function buildPmActionQueue(projects, today = new Date()) {} // overdue-task | due-soon-task | delayed-project | on-hold-project
export function buildOwnerWorkload(projects, today = new Date()) {} // by project.aeOwner
export function buildTeamTimeline(projects, today = new Date()) {}  // group by team, active only
export function getProjectTimelineRange(project) {}                 // start=startDate||earliest task ; end=latest finishDate
export function getProjectMilestones(project, today = new Date()) {}// task.isMilestone === true
```

Action queue item + priority (ตามแพลนเดิม):
```js
{ id, kind, priority, projectId, projectCode, projectName, customerName,
  taskId, taskName, dueDate, daysDelta, owner, status }
// 1 overdue task | 1 project delayed | 2 due≤3d | 3 due≤7d | 3 on hold
// sort: priority asc → date asc → createdAt desc ; แสดง 8–12 แถว
```
Active project (สำหรับ timeline/queue) = computed status ไม่ใช่ `Completed/Dropped/On Hold`

**แล้วแก้ `projects/page.js`** ลบ local copy ของ 4 ฟังก์ชัน เปลี่ยนเป็น
`import { getComputedStatus, getProgress, getCurrentStep, getOverdueCount } from "@/lib/pm/commandCenter"`
— build + test ต้องผ่านเหมือนเดิม (พิสูจน์ว่า refactor ไม่เปลี่ยน behavior)

### Step 3 — test `lib/pm/commandCenter.test.mjs`
- overdue task → queue priority 1
- due soon ≤7d → queue
- completed task ไม่เข้า overdue
- dropped/completed/on-hold project ไม่อยู่ใน active KPI/timeline
- owner workload นับ in-progress/overdue ถูก
- timeline ตัด completed/dropped/on-hold ออก default
- milestone ใช้เฉพาะ `isMilestone === true`
- overdue milestone ถูก highlight แดง
- **regression**: `getComputedStatus` คืนค่าตรงกับชุด fixture จากพฤติกรรมเดิม

### Step 4 — ขยาย API task summary
`webapp/src/app/api/pm/projects/route.js:34` เปลี่ยนเป็น:
```js
.select('id, projectId, name, status, startDate, finishDate, durationDays, stepOrder, role, isMilestone, assignee, assigneeId')
```
ยัง lightweight (`role/isMilestone/durationDays` มีจริงใน `templates.js`/columns) — **ก่อนใช้ ยืนยันว่า
คอลัมน์เหล่านี้มีในตาราง `project_tasks` จริง** (เช็ก insert ใน POST route / migration) ถ้าคอลัมน์ไหน
ไม่มีให้ตัดออกจาก select ไม่งั้น query error
Acceptance: หน้าเดิม render ได้, build/test ผ่าน

### Step 5 — หน้า `/pm` + KPI + Action Queue
สร้าง `webapp/src/app/pm/page.js` (`"use client"`):
```js
const projects = ... // fetch /api/pm/projects (reuse apiCache pattern จาก projects/page.js)
const kpis        = useMemo(() => buildPmKpis(projects), [projects]);
const actionQueue = useMemo(() => buildPmActionQueue(projects), [projects]);
const ownerLoad   = useMemo(() => buildOwnerWorkload(projects), [projects]);
const timeline    = useMemo(() => buildTeamTimeline(projects), [projects]);
```
- ใช้ class กลางที่มีอยู่: `glass-panel / premium-table / status-pill / toolbar / ui-badge / chip / progress`
  (ดู memory: shared-ui-layer) — ห้ามประดิษฐ์ component สไตล์ใหม่
- KPI strip → alert strip → action queue (row layout + icon `AlertTriangle/Clock/FolderKanban`)
- คลิกแถว: `router.push(\`/pm/projects/${item.projectCode || item.projectId}\`)`
- สีตามความหมาย: green=on track/done, red=overdue/delayed, amber=due soon/on hold, accent=active/new
- empty: "ไม่มีงานเร่งด่วน"

### Step 6 — nav item
`AppLayout.js` กลุ่ม `system: 'pm'` (`:176`) เพิ่ม **ก่อน** "โครงการ":
```js
{ href: '/pm', name: 'ศูนย์บัญชาการ', icon: LayoutDashboard, cap: 'pm:view', match: (p) => p === '/pm' },
```
(`LayoutDashboard` import อยู่แล้ว) — ระวัง `match` ของ "โครงการ" เดิมเป็น `p === '/pm/projects'`
อยู่แล้ว จึงไม่ชนกับ `/pm`

### Step 7 — Team Timeline + milestones (project-level)
- group ตาม `project.team` → 1 project = 1 horizontal bar
- range จาก `getProjectTimelineRange`; today line ตามวันจริง; window 8–12 สัปดาห์/auto-fit
- milestone marker = task `isMilestone`, position `finishDate||startDate`, สี completed/overdue/dueSoon/future
- due marker = `project.dueDate` (style ต่างจาก milestone; เลยกำหนด+ยังไม่เสร็จ = แดง)
- คลิก bar/marker → project detail; tooltip: ชื่อ / code · name / วันที่ / role / status
- ไม่ใช้ chart library; responsive = horizontal scroll, ตรึง code+name ซ้าย
- **default ไม่โชว์ completed/dropped/on-hold** (On Hold เปิดด้วย toggle ภายหลัง)
- ⚠️ overlap: เดิมเคยวางไว้ว่า combined-Gantt เป็น "หน้าแยก (ยังไม่ทำ)" — แพลนนี้ให้ `/pm` เป็น
  บ้านของ combined timeline แทน เพื่อไม่ทำซ้ำสองที่

### Step 8 — compact project entry point
section "โครงการที่กำลังติดตาม": active/risk ≤ 5–8 แถว + ปุ่มไป `/pm/projects` และ `/pm/tasks`
ไม่มี edit/delete/pagination ใน `/pm` (อยู่ที่ `/pm/projects` ตามเดิม)

### Step 9 — Verify
```powershell
cd webapp ; npm.cmd run test ; npm.cmd run build ; npm.cmd run lint
```
Manual: `/pm` โหลด/empty/active/overdue/completed ครบเคส; คลิก queue เปิด detail ถูก;
`/pm/projects` archive+paginate ยังทำงาน; nav highlight ถูก system; timeline โชว์เฉพาะ active;
milestone/due/today line ไม่ทับกันจนอ่านไม่ออก

---

## 3. Acceptance Criteria
- มี `/pm` (KPI + action queue + team timeline + milestone + owner workload + compact entry point)
- `getComputedStatus` มีแหล่งเดียว และ `/pm` กับ `/pm/projects` ให้ผลตรงกัน
- `/pm/projects` + CRUD + search/filter/sort/pagination/archive เดิมไม่พัง
- nav มี "ศูนย์บัญชาการ" และ active state ถูก
- `npm.cmd run test` + `npm.cmd run build` ผ่าน; lint ไม่เพิ่ม error ในไฟล์ที่แตะ
- เคลียร์ข้อมูล demo/mock ก่อน commit

## 4. ความเสี่ยง
1. `page.js` บวม → แยก section เป็น component ย่อยใน `components/pm/`
2. client aggregation ช้าเมื่อ projects เยอะ (API `select('*')`+attach อยู่แล้ว) → ค่อยย้าย endpoint แยก
3. คอลัมน์ task ใน select อาจไม่มีจริงบางตัว → verify ก่อน ไม่งั้น query error
4. refactor status helper เสี่ยง behavior เปลี่ยน → กันด้วย regression test (Step 3)
5. ไม่แตะ permission logic

## 5. PR แรก (ให้เล็กพอ review)
1. `lib/pm/commandCenter.js` + test  2. refactor `projects/page.js` ให้ import
3. ขยาย API select  4. `app/pm/page.js` (KPI + action queue)
5. Team Timeline + milestone  6. compact entry point  7. nav item
8. คง `/pm/projects` เดิม

เฟสถัดไป: quick segments (`ทีมฉัน` ใช้ `useTeam()`), department workload (มี `role` แล้ว),
timeline ลง task ย่อย, polish responsive, report page
