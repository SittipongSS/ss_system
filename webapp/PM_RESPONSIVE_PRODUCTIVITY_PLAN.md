# PM Responsive View + Productivity — Implementation Plan (ฉบับปรับใช้)

ต่อยอดจากบทวิเคราะห์ Codex (`outputs/pm-responsive-productivity-plan.md`) โดยตรวจกับโค้ดจริง
(2026-06-30) แล้ว **แก้ premise ที่ผิด + เรียงลำดับตาม dependency จริง + ผูกกับแพลนที่มีอยู่**
(`webapp/PM_COMMAND_CENTER_PLAN.md`). เป้าหมายเดิมคงไว้: PM ทุกหน้ารายการมี responsive table/card
มาตรฐานเดียว + ยกระดับ Extra Work/To-do/Updates เป็น productivity workflow

---

## 0. ground truth ที่ต่างจากแพลน Codex (ต้องอ่านก่อน)

| Codex อ้าง | จริง | ผลต่อแผน |
|---|---|---|
| `0049_audit_logs.sql` มีแล้ว | **ไม่มี** (สูงสุด 0048) | ต้องสร้าง audit infra ก่อน |
| `lib/audit.js` `recordAudit()` มีแล้ว | **ไม่มีในโค้ดเลย** | Phase audit = สร้างใหม่ ไม่ใช่ "เติม" |
| `personal_tasks` พร้อม kind/priority/... | มีแค่ field พื้นฐาน (0019/0026) | migration ใหม่จำเป็นจริง ✓ |
| useResponsiveView / ViewSwitcher / DataList | มีจริงทั้งหมด | ใช้ต่อได้ ✓ |
| `pmTaskEditTier` | มีจริง (`permissions.js:305`) | ใช้ต่อได้ ✓ |

กติกาบังคับของโปรเจกต์นี้:
- **DDL รันมือบน Supabase SQL Editor** (service-role/PostgREST รัน DDL ไม่ได้ — ดูคอมเมนต์ 0019)
- **เลข migration ถัดไป = 0049+** ระวังชนตอน merge (memory: deploy-workflow) → จองเลขตอนใกล้ merge
- **single source of truth สถานะโครงการ**: `getComputedStatus` ย้ายไป `lib/pm/commandCenter.js` แล้ว
  (ตาม PM_COMMAND_CENTER_PLAN) — หน้าใหม่ทุกหน้า import จากที่นั่น ห้ามนิยามซ้ำ
- **Next.js ดัดแปลง** (AGENTS.md): อ่าน `node_modules/next/dist/docs/` ก่อนสร้าง route/API ใหม่
- **shared UI มีอยู่แล้ว**: ใช้ `segmented`/`ViewSwitcher`/`glass-panel`/`premium-table`/`status-pill`/
  `progress`/`chip` (memory: shared-ui-layer) — อย่าสร้าง pattern ใหม่
- ก่อน commit เคลียร์ข้อมูล demo/mock

---

## 1. นิยามชนิดงาน (UI/API/DB ต้องตรงกัน)

| ประเภท | code/API | UI ไทย | ตาราง | เข้า Gantt | scope |
|---|---|---|---|---|---|
| Project Task | `project_task` | ขั้นตอนหลัก | `project_tasks` | ใช่ | ตามทีม/pmTaskEditTier |
| Project Extra | `project_extra` | งานเพิ่มเติม | `personal_tasks` + `kind` | ไม่ | owner+assignee+project team |
| Personal Task | `personal_task` | งานส่วนตัว | `personal_tasks` (`kind=personal`) | ไม่ | owner เท่านั้น |

`personal_tasks` ทำหน้าที่เก็บทั้ง personal + extra แยกด้วย `kind` (มี `projectId` nullable + `assigneeId`
อยู่แล้ว) — **จุดเสี่ยง scope**: ต้องกัน personal (projectId=null) ไม่หลุดไป team/all (Phase 8)

---

## 2. Responsive standard (มาตรฐานทุกหน้า list)

```js
const [view, setView, isPortrait] = useResponsiveView({ portrait: "list", landscape: "table" });
```
- **ใช้ key "list" (ไม่ใช่ "cards")** ให้ตรงกับ `VIEW_META` ใน ViewSwitcher + My Work เดิม
  (ถ้าต้องการ card styling ให้ render เป็นการ์ดภายใต้ mode "list" — ไม่เพิ่ม key ใหม่)
- search/filter/sort ทำงานเหมือนกันทั้ง 2 view; empty/loading สอดคล้อง; click behavior เดียวกัน
- Gantt/document = view เฉพาะ ไม่ต้องมี table fallback; Updates = feed default (+log mode ภายหลัง)

---

## 3. ลำดับงาน (เรียงใหม่ตาม dependency + แยกเป็น PR ย่อย)

### PR-A · ResponsiveDataList กลาง  (ฐานของทุก Phase)
- สร้าง `webapp/src/components/ui/ResponsiveDataList.js` อิง `components/excise/DataList.js`
- props: rows/columns/rowKey/onRowClick/card(renderer)/pageSize/initialSort/empty/emptyIcon/viewModes/showViewSwitcher
- รองรับ table+card+pagination+sort+empty ผ่าน `useResponsiveView`
- **Acceptance**: แทน DataList ในหน้า Tax ได้โดย behavior ไม่เปลี่ยน (regression Tax ก่อน), landscape=table, portrait=card
- ⚠ ถ้าเสี่ยงกระทบ Tax มาก ให้ทำ ResponsiveDataList เป็นไฟล์ใหม่ก่อน ยังไม่แทน DataList เดิม — ค่อย migrate Tax ทีหลัง

### PR-B · Projects List มี table + card
- `webapp/src/app/pm/projects/page.js`: คง column เดิม (code/name/customer/type/category/owner/progress/step/due/status/actions)
- card view: code/name/customer/status pill/progress/done-total/step/due/overdue/owner/type badge/action ตามสิทธิ์
- ใช้ `useResponsiveView({ portrait:"list", landscape:"table" })` + ViewSwitcher
- helper สถานะ import จาก `lib/pm/commandCenter.js` (ห้าม copy)
- **Acceptance**: default landscape=table / portrait=card; filter/search/sort ครบ 2 view; click card → detail; edit/delete เท่าเดิม

### PR-C · migration `personal_tasks` (kind/priority/completedAt/blockedReason)  ← จองเลข 0049+ ตอน merge
```sql
alter table public.personal_tasks
  add column if not exists "kind" text not null default 'personal',
  add column if not exists "priority" text not null default 'normal',
  add column if not exists "completedAt" timestamptz,
  add column if not exists "createdByName" text,
  add column if not exists "assigneeName" text,
  add column if not exists "blockedReason" text;
create index if not exists personal_tasks_kind_idx on public.personal_tasks ("kind");
create index if not exists personal_tasks_priority_idx on public.personal_tasks ("priority");
create index if not exists personal_tasks_completed_idx on public.personal_tasks ("completedAt");
```
- status รองรับ: Pending / In Progress / Waiting / Blocked / Completed / Cancelled
- priority: low / normal / high / urgent ; kind: personal / project_extra / follow_up / blocker
- **รันมือบน Supabase ก่อน deploy** + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow schema cache)

### PR-D · API personal-tasks รองรับ field/status ใหม่
- `api/pm/personal-tasks/route.js` + `[id]/route.js`: รับ/validate kind/priority/blockedReason;
  set `completedAt` ตอน status→Completed, clear เมื่อ reopen
- **scope guard ที่นี่เลย** (Phase 8): personal (projectId=null) → owner เท่านั้น; project_extra → owner+assignee+project team

### PR-E · Extra Work เป็น first-class table/card ใน Project Detail + My Work
- `pm/projects/[id]/page.js`: ใน table view → Extra Work เป็น table section แยกล่าง Main Tasks;
  ใน list view → cards แยกหัวกลุ่ม (fields: status/priority/title/assignee/due/note preview/quick actions Done-Edit-Delete)
- `pm/tasks/page.js`: ใช้ ResponsiveDataList เดียวกัน
- **Acceptance**: Extra Work ไม่เป็น view เดียวอีก; Waiting/Blocked ใช้ได้; completedAt set/clear ถูก

### PR-F · My Work เป็น productivity dashboard
- `pm/tasks/page.js` + `api/pm/my-work/route.js`
- type badge ทุก row/card: ขั้นตอนหลัก / งานเพิ่มเติม / งานส่วนตัว
- segmented: All/Today/Overdue/This week/Waiting/Blocked/No due date/Completed + type filter
- table columns: Type/Status/Priority/Task/Project/Customer/Assignee/Due/Action; list group: Overdue→Today→This week→Waiting-Blocked→No due→Completed
- **Acceptance**: extra ที่ assign ให้ฉันเห็นใน My Work; personal คนอื่นไม่หลุด; quick action เปลี่ยนสถานะได้ทั้ง project task + extra

### PR-G · Project To-do section/tab
- `pm/projects/[id]/page.js`: โครง `Overview | Plan | To-do | Updates | Rev/Gantt` (อย่างน้อย section tab-ready)
- To-do แสดงเฉพาะ extra/follow_up/blocker ของ project นี้; ไม่รวม project tasks หลัก/personal ที่ไม่ผูก project
- actions: Add/Edit/Delete/Assign/priority/status/Waiting/Blocked/Completed
- creation flow (Phase 9): kind ตั้งตาม entry point อัตโนมัติ (Project Detail→project_extra; My Work ไม่เลือก project→personal; update/blocker→follow_up/blocker) — ไม่เลือก project ห้าม assign คนอื่น

### PR-H · Audit infra (สร้างใหม่ทั้งหมด — เดิมไม่มี)  ← จองเลขถัดไป
> Codex เข้าใจผิดว่ามีแล้ว จริงๆ ต้องสร้างตาม design ที่ตกลงไว้ (memory: audit-log-design —
> supervisor-only `/audit` UI, full before/after, time filter)
1. migration `audit_logs` (รันมือ)
2. `webapp/src/lib/audit.js` → `recordAudit({ actor, action, entityType, entityId, before, after, summary })`
   — เขียน log fail **ห้ามทำ action หลักพัง** (try/catch, log only)
3. เติม recordAudit ใน PM routes: projects, projects/[id], project-tasks(+[id]+reorder),
   personal-tasks(+[id]), revisions, restore, products
   - entityType: pm_project / pm_project_task / pm_project_extra / pm_personal_task / pm_project_revision / pm_project_product
4. (ตาม design) หน้า `/audit` supervisor-only — ทำแยกได้ภายหลัง

### PR-I · Activity / Updates timeline
- migration `project_updates` (id/projectId FK cascade/kind/body/createdBy/createdByName/createdAt + index + RLS) — รันมือ
  - kinds: note/decision/blocker/customer_feedback/internal/follow_up
- API: `GET /projects/[id]/activity` (รวม audit_logs + project_doc_revisions + project_updates),
  `POST/PATCH/DELETE /projects/[id]/updates/[updateId]`
  - response item: {id, source(audit|revision|update), type, actorName, title, detail, createdAt, meta}
- UI: portrait=feed/list, landscape=feed (+log/table ภายหลัง)
- **ขึ้นกับ PR-H** (ต้องมี audit_logs ก่อน activity ถึงรวมได้)

### PR-J · Future (ยังไม่ทำ แต่ออกแบบไม่ให้ตัน)
- lastActivityAt/unread (`project_activity_reads`), reminder (`remindAt`/notification), bulk actions
  (⚠ bulk due date ของ Project Tasks กระทบ schedule — แยกจาก Extra Work)

---

## 4. ความเชื่อมกับ PM_COMMAND_CENTER_PLAN
- ทั้งสองแผนใช้ `lib/pm/commandCenter.js` เป็นแหล่งสถานะเดียว — ทำ Command Center plan (commandCenter.js
  + refactor projects/page.js) **ก่อนหรือพร้อม PR-B** จะได้ไม่ refactor ซ้ำ
- ResponsiveDataList (PR-A) ใช้ได้ทั้ง Projects List, My Work, และ compact entry point ของ /pm
- Updates/Activity (PR-I) เป็นแหล่งข้อมูลให้ KPI/alert ของ /pm ในอนาคต

## 5. ลำดับแนะนำ (รวม dependency)
1. (จาก Command Center plan) commandCenter.js + refactor status helpers
2. PR-A ResponsiveDataList → 3. PR-B Projects List → 4. PR-C migration → 5. PR-D API
6. PR-E Extra Work → 7. PR-F My Work → 8. PR-G To-do
9. PR-H Audit infra → 10. PR-I Activity/Updates → 11. PR-J future

## 6. Testing (ย่อ)
- responsive: ทุกหน้า landscape=table / portrait=card; พลิกจอ reset ตาม orientation
- extra work: สร้างจาก detail (project_extra) / My Work ไม่เลือก project (personal) / เลือก project; assign กติกาถูก; Waiting/Blocked; completedAt set/clear
- scope: personal คนอื่นไม่หลุด team/all; team lead เห็น extra ในทีม; assignee เห็นงานตัวเอง
- activity: create/update/delete extra + เปลี่ยน status task + ออก Rev + human note → เห็นใน Updates; log fail ไม่ทำ action พัง

## 7. Definition of Done
- ไม่มี list สำคัญใน PM ที่ table-only ไม่มี card fallback
- Project List/Detail/My Work ใช้ responsive standard เดียว + สถานะจากแหล่งเดียว
- Extra Work มี table+card + status/priority ใช้งานจริง; personal/extra แยกชัดใน UI+scope
- audit infra ถูกสร้าง (ของใหม่) และ activity/updates ต่อยอดได้
- ไม่มี personal task หลุด scope team/all
