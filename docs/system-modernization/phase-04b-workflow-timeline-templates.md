# Phase 4B — Versioned Workflow and Timeline Templates

สถานะ: เสร็จสมบูรณ์

เริ่ม: 19 กรกฎาคม 2026
เป้าหมาย: ย้าย Workflow/Timeline Template ของโครงการออกจากโค้ดคงที่ ให้ผู้ดูแลจัดการแบบมีเวอร์ชัน โดยไม่เปลี่ยนงานหรือความคืบหน้าของโครงการเดิมย้อนหลัง

## บริบทปัจจุบัน

- Template `SCENT`, `NPD` และ `RE-ORDER` อยู่ใน `webapp/src/lib/pm/templates.js`
- การสร้างโครงการ, การต่อดีลเข้าโครงการ และการ resync ใช้ Template ชุดนี้ผ่าน `webapp/src/lib/pm/schedule.js`
- Task ที่สร้างแล้วถูกคัดลอกลง `project_tasks` แต่ยังไม่มีหลักฐานว่าเกิดจาก Template version ใด
- NPD รุ่นเก่าบางโครงการมีช่วงพัฒนากลิ่นรวมอยู่ด้วย ระบบจึงมี `NPD_LEGACY_FULL_TEMPLATE` เพื่อกัน resync ลบงานและความคืบหน้าเดิม

## ขอบเขต

- เพิ่มหน้าจัดการ Workflow/Timeline Template ใน Admin Center
- จัดการ Template หลัก `SCENT`, `NPD` และ `RE-ORDER` แบบ Draft, Published และ Archived
- Seed ค่าใน `webapp/src/lib/pm/templates.js` เป็น Published Version 1 โดยรักษาลำดับ, dependency, milestone, role, ระยะเวลา และเงื่อนไขหมวดสินค้าเดิม
- เก็บประวัติผู้สร้าง ผู้แก้ ผู้เผยแพร่ เวลา และหมายเหตุการเปลี่ยนแปลง
- ให้โครงการหรือ deal segment ใหม่บันทึก Template version ที่ใช้
- ให้ Published/Archived immutable และ Publish แบบ transaction เดียว
- รักษา compatibility ของ NPD รุ่นเก่าโดยไม่ rebuild task ระหว่าง Migration
- เพิ่ม validation และ Preview ก่อน Publish เพื่อป้องกัน dependency ขาด, วนเป็นวง และเงื่อนไขหมวดสินค้าที่ใช้ไม่ได้

## Template model

Template root หนึ่งรายการแทน business key ที่คงที่ เช่น `SCENT`, `NPD` หรือ `RE-ORDER` และชี้ Published version ปัจจุบัน

แต่ละ Version มี:

- Version number และสถานะ `draft`, `published`, `archived`
- ชื่อและคำอธิบายภาษาไทยเป็นหลัก
- หมายเหตุการเปลี่ยนแปลง
- รายการขั้นตอนเรียงลำดับ
- actor/timestamp สำหรับ create, update, publish และ archive

แต่ละขั้นตอนมี:

- `stepKey` ที่คงที่ภายใน Template เพื่ออ้าง dependency โดยไม่ผูกกับชื่อที่แก้ได้
- ชื่อขั้นตอน, phase, role และระยะเวลาวันทำการ
- milestone flag
- dependency เป็นรายการ `stepKey`
- เงื่อนไขหมวดสินค้าแบบ include/exclude
- ลำดับแสดงผล

## Version lifecycle

1. Template key หนึ่งรายการมี Published ได้หนึ่ง Version และ Draft ได้ไม่เกินหนึ่ง Version
2. Draft ใหม่คัดลอกจาก Published ล่าสุด
3. แก้ไขได้เฉพาะ Draft และทุก write ตรวจ expected `updatedAt`
4. Publish ต้องมี change note และผ่าน validation ทั้งชุด
5. Publish ทำใน transaction เดียว: lock root, ตรวจ Draft ซ้ำ, archive Published เดิม, publish Draft และเปลี่ยน root pointer
6. Published และ Archived แก้หรือลบไม่ได้ผ่าน UI/API
7. การแก้ครั้งถัดไปเริ่มจาก Draft ใหม่ ไม่แก้ Published โดยตรง

## Consumer และการไม่เปลี่ยนย้อนหลัง

- โครงการหรือ deal segment ที่สร้างใหม่ใช้ Published version ล่าสุดของประเภทดีล ณ เวลาสร้าง
- บันทึก `templateVersionId` ที่ระดับ segment/แหล่งกำเนิด และ `templateStepKey` ที่ task ซึ่งมาจาก Template
- Task ที่สร้างแล้วเป็น operational snapshot; การ Publish Template ใหม่ไม่แก้ task เดิมอัตโนมัติ
- Resync ปกติใช้ Version ที่ผูกกับ segment เดิม ไม่สลับไป Published ล่าสุดเงียบ ๆ
- การอัปเกรดโครงการเดิมไป Template ใหม่ต้องเป็น action แยกที่มี Preview diff และคำยืนยัน; ไม่รวมการอัปเกรดอัตโนมัติ
- Migration ไม่ rebuild, ลบ หรือเปลี่ยนสถานะ task ของโครงการเดิม
- NPD รุ่นเก่าที่มี task ช่วงกลิ่นยังใช้ legacy compatibility path จนกว่าจะมีการอัปเกรดโดยตั้งใจ

## UX/UI

- เพิ่ม Navigation Card ชื่อ “Workflow และ Timeline Template” ใน Admin Center
- Admin Center เป็นการตั้งค่าระดับแอปที่อยู่เหนือทุกระบบธุรกิจ จึงไม่แสดง Workflow/Tax/Database sub-navigation เมื่ออยู่ในเส้นทางตั้งค่า
- หน้าหลักแสดง Template key, Published version, Draft status, จำนวนขั้นตอน และวันที่เผยแพร่ ไม่ใช้ KPI card
- ใช้ตารางบน Desktop และ layout ที่อ่านได้โดยไม่มี page-level horizontal overflow บน Mobile
- Version history และรายละเอียด Version เปิดใน Drawer
- การแก้ขั้นตอนหนึ่งรายการใช้ Drawer; ลำดับรวมและ dependency ต้องมองเห็นในหน้าหลักของ Draft
- รองรับเพิ่ม, แก้, duplicate, reorder และนำขั้นตอนออกจาก Draft
- แสดง dependency ด้วยชื่อขั้นตอนและตรวจ cycle ก่อนบันทึก/Publish
- มี Preview timeline แบบอ่านอย่างเดียวก่อน Publish พร้อมสรุปจำนวน phase, step, milestone และระยะเวลาประมาณการ
- ไม่มี Auto-save; Save Draft และ Publish เป็นคนละ action และ Publish มี Confirm dialog
- มี Skeleton, Empty, Error, Toast, disabled/busy state, focus-visible, focus trap/restore และ keyboard-accessible reorder
- ใช้ภาษาไทยเป็นหลัก, IBM Plex Sans Thai และ CSS token/shared component ที่มีอยู่

## Permission ชั่วคราว

- View management history, create/edit Draft, Publish และ Archive: Admin ผ่าน `master:manage`
- Route handlers ตรวจ session และ permission ใกล้ data source ทุก route
- Browser ไม่มีสิทธิ์เขียนตารางโดยตรง; server ใช้ service role หลัง authorization
- ไม่สร้าง Role/Capability ใหม่ก่อน Phase 8–9

## Data/API ที่วางแผน

- `workflow_templates` — root และ Published pointer ต่อ Template key
- `workflow_template_versions` — version lifecycle และ metadata
- `workflow_template_steps` — step rows ต่อ Version
- เพิ่ม provenance ของ Template version/step ให้ project segment และ `project_tasks` ในขอบเขตที่จำเป็น
- API list/detail สำหรับ Template และ Version history
- API create/update/archive Draft พร้อม optimistic concurrency
- API validate/preview Draft
- API publish Draft แบบ atomic
- server-only resolver สำหรับอ่าน Published version ตอนสร้างโครงการหรือ deal segment

ชื่อจริงของตาราง, column และ route จะล็อกหลังตรวจ schema relation ทั้งหมดก่อนเขียน Migration

## Validation rules

- Template key ต้องอยู่ในชุดที่ระบบรองรับและห้ามซ้ำ
- `stepKey` ต้องไม่ว่างและไม่ซ้ำภายใน Version
- dependency ต้องอ้าง step ใน Version เดียวกัน, ห้ามอ้างตัวเอง และห้ามเป็นวง
- ระยะเวลาต้องเป็นจำนวนเต็มไม่ติดลบตามกติกา scheduler
- role ต้องอยู่ในชุดป้ายแผนกที่รองรับ
- category include/exclude ต้องไม่ขัดกันและต้องอ้างรหัสหมวดสินค้าที่มีอยู่
- หลังกรองตามหมวดสินค้าแล้ว dependency ที่จำเป็นต้องไม่กลายเป็น dangling reference
- Seed Version 1 ต้องสร้าง task เทียบเท่าค่าคงที่เดิมสำหรับทุกประเภทดีลและกรณีหมวดสินค้า

## Audit

- create/update/publish/archive ที่ entity `workflow_template_version`
- Audit เก็บ Template key, Version number, change note และ before/after snapshot
- Published/Archived Version และ step rows เป็นหลักฐานถาวร; ห้าม hard delete ผ่าน API

## Migration และ Rollback

- Migration ลำดับถัดไปที่คาดไว้: `0121_workflow_templates.sql`
- Seed Published Version 1 จากค่าคงที่ปัจจุบัน
- เปิด RLS และ revoke browser roles; service role เท่านั้นที่เข้าถึงตารางจัดการ
- Rollback ระดับแอป: ปิดเมนู/API และกลับไปใช้ static resolver โดยคงตาราง/version history ไว้
- ไม่ drop version history หรือ provenance หลังเริ่มสร้างโครงการด้วย Version ใหม่
- Migration ต้องไม่แก้ task, predecessor, status, actual date หรือ progress ของโครงการเดิม

## ไม่รวมใน Phase 4B

- การปรับ `/home` และ System Navigation Hub — Phase 4C
- Payment/Remark Commercial Preset ตามทีมและประเภทดีล — กำหนด requirement ใน Phase 6–7
- การเปลี่ยนหน้าตา Quotation, Sales Order หรือเอกสารพิมพ์
- ตารางงวดชำระในเอกสารและ Document Engine
- Electronic signature
- Workflow automation, notification หรือ approval engine ใหม่
- การอัปเกรดโครงการเดิมไป Template ใหม่โดยอัตโนมัติ
- Permission redesign — Phase 8–9

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยันขอบเขตก่อนแก้ implementation
- [x] สร้าง branch จาก `origin/main` หลัง PR #553 และไม่แตะ `.agents/`
- [x] จัดทำ Phase document และ Decision log ก่อน implementation
- [x] ตรวจ schema และ consumer routes ครบก่อนล็อก Migration/API
- [x] Seed equivalence tests ผ่านสำหรับ `SCENT`, `NPD`, `RE-ORDER` และ NPD legacy compatibility
- [x] Unit tests สำหรับ validation, dependency graph, category filtering และ provenance ผ่าน
- [x] Lifecycle/authorization guards, invalid no-write, stale update และ atomic Publish มี server/SQL guard และ validation coverage
- [x] Existing-project no-change และ explicit-version resync ผ่าน automated characterization tests
- [x] Admin UI, Preview, version history และ lifecycle ได้รับการทดสอบก่อน Merge; responsive/theme/accessibility implementation ผ่าน validation
- [x] Migration integrity, rollback notes, targeted ESLint, automated tests และ production build ผ่าน
- [x] Production แสดง Published/Archived history พร้อม actor และเวลา; Preview validation และ audit path ผ่านก่อน Merge
- [x] อัปเดต Permission action inventory และ roadmap
- [x] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ Draft PR

## Implementation validation — 19 กรกฎาคม 2026

- Migration `0121_workflow_templates.sql` เพิ่ม root/version/step, Published Version 1 ทั้งสามประเภท, immutable guards, lifecycle RPC และ task provenance โดยไม่ rebuild งานเดิม
- Consumer ที่สร้าง Timeline ครบทั้ง deal timeline, create project, link project และ SAHAMIT PO ใช้ Published version ล่าสุด; resync ใช้ version เดิมที่ pin ไว้
- Task ก่อน Migration 0121 ซึ่งไม่มี provenance ยังคงใช้ static/NPD legacy compatibility path และไม่ถูก backfill
- หน้า `/settings/workflow-templates` รองรับ Draft editor, add/edit/duplicate/reorder/remove step, category/dependency validation, read-only Preview, version history Drawer และ explicit Save/Publish
- Automated tests ผ่าน 368 รายการ รวม Preview/category-variant validation และ provenance characterization
- `check:migrations` ผ่าน 121 ไฟล์ และ Next.js production build สำเร็จ
- Chrome local session ที่มีอยู่เป็น AE Supervisor จึงไม่มี `master:manage`; visual UAT ยังต้องทำด้วย Admin หลังรัน Migration 0121 โดยไม่ขยายสิทธิ์ชั่วคราว

## Closeout update — 19 กรกฎาคม 2026

- ผู้ใช้ยืนยันว่ารัน Migration 0121 แล้ว
- Implementation ถูก merge ผ่าน PR #557 และการแยก Settings เป็น global context ถูก merge ผ่าน PR #558
- ผู้ใช้ยืนยันการทดสอบก่อน Merge และอนุมัติให้ดำเนินงานต่อหลัง PR #557/#558 ถูก Merge
- Production smoke test เปิด `/settings/workflow-templates` สำเร็จ แสดง SCENT Published Version 1, Archived Version 2 และ version history ครบ โดยไม่สร้างหรือแก้ Draft
- Browser console ไม่มี warning/error และ GitHub CI/Vercel ของ PR #557/#558 ผ่าน
- Full role-matrix regression รวมไว้ใน Phase 8–9 โดย Phase 4B ไม่ขยาย permission model
- Phase 4B ปิดสถานะ `เสร็จสมบูรณ์` เมื่อ 19 กรกฎาคม 2026

## Known risks

- การเปลี่ยน scheduler จาก synchronous static data ไปเป็น version resolver ต้องไม่ทำให้ client bundle อ่าน service-role data
- dependency ที่อ้างด้วยเลข step หรือชื่อแก้ไขง่ายและเสี่ยงแตก จึงต้องมี stable `stepKey`
- การ resync ด้วย Published ล่าสุดอาจลบหรือเปลี่ยนงานที่มีความคืบหน้า จึงต้อง pin Version และห้าม silent upgrade
- NPD legacy ไม่สามารถอนุมาน provenance เดิมจาก type อย่างเดียว ต้องตรวจ task ที่มีอยู่และคง compatibility path
- category filtering อาจตัด step ที่ dependency อ้างอยู่ จึงต้อง validate graph หลังกรองทุก variant
