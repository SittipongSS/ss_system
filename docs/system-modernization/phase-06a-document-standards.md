# Phase 6A — Versioned Document Standards

สถานะ: รอ real-data Preview UAT

เริ่ม: 20 กรกฎาคม 2026
เป้าหมาย: สร้างมาตรฐานเอกสารที่แก้ไขได้แบบควบคุมเวอร์ชัน และทำให้ศูนย์ตั้งค่าเข้าถึงได้จากปุ่มส่วนกลางโดยไม่ผูกกับระบบธุรกิจใด

## ขอบเขตที่ยืนยัน

- เพิ่มเมนูอิสระ `ตั้งค่า > มาตรฐานเอกสาร`
- แก้ route gate ของ `/settings` ให้ผู้ใช้ที่ล็อกอินเปิดศูนย์ตั้งค่าได้ แล้วกรองการ์ด/หน้าลูกตามสิทธิ์จริง
- ให้ Admin และ AE Supervisor จัดการมาตรฐานเอกสารได้ผ่าน permission helper เฉพาะ โดยไม่ขยาย `master:manage`
- เก็บมาตรฐานเอกสารเป็น Draft, Published และ Archived พร้อม immutable history
- เริ่มต้นด้วย Quotation `FM-SA-01` และ Sale Order `FM-SA-03`
- จัดการชื่อเอกสารไทย/อังกฤษ, Form code, Revision, Effective date, Accent และรูปแบบเลขที่เอกสาร
- รูปแบบเลขที่ใช้ token ที่ระบบอนุญาตเท่านั้น และยังไม่เปลี่ยนตัวออกเลข Production
- ใช้ Drawer เดียวสำหรับดูและแก้ Draft, ไม่มี Auto-save และยืนยันก่อน Publish/Archive
- เก็บ actor snapshot, optimistic concurrency และ central audit สำหรับทุก write

## ลำดับเฟสที่ยืนยัน

1. Phase 6A สร้าง controlled form version และแก้เส้นทาง Settings
2. Phase 5B ผูก signature evidence กับ approval โดยอ้างอิง controlled form version จาก Phase 6A
3. Phase 6B สร้าง Quotation visual/master template จากทิศทางที่ผู้ใช้เลือก
4. Phase 7 เชื่อม Document Engine, immutable issued snapshot และ Commercial Preset

ลำดับนี้ไม่ตัด Phase 5B ออก แต่ย้าย Phase 6A ซึ่งเป็น dependency ของ controlled metadata มาทำก่อน เพื่อลดการสร้างหลักฐานลายเซ็นบนค่าคงที่ที่ต้องรื้อภายหลัง

## Document standard fields

- Stable document key: `quotation`, `salesOrder`
- ชื่อภาษาไทยและภาษาอังกฤษ
- Form code เช่น `FM-SA-01`
- Revision เช่น `00`
- Effective date แบบวันที่สากลในฐานข้อมูล
- Controlled form line แสดงตรงตามมาตรฐาน `FM-SA-01: Rev. No.00 08/05/2568` โดยรักษา `:`, `.`, `-` และช่องว่างตามรูปแบบ
- Accent preset: Terracotta, Teal, Amber, Green หรือ Navy
- Numbering pattern แบบ guarded token เช่น `QT-{YY}{MM}{RUNNING:4}-{REVISION}`
- Change note บังคับก่อน Publish

## Version lifecycle

1. เอกสารหนึ่งชนิดมี Published ได้หนึ่งเวอร์ชันและ Draft ได้หนึ่งเวอร์ชัน
2. สร้าง Draft จาก Published ล่าสุดเท่านั้น
3. แก้ไขได้เฉพาะ Draft และทุก save ตรวจ `updatedAt`
4. Publish ทำแบบ atomic: archive Published เดิม, publish Draft และเปลี่ยน active pointer
5. Published/Archived แก้ payload หรือลบไม่ได้
6. เอกสารที่ออกจริงใน Phase 7 ต้อง pin version ID และ snapshot metadata เดิม

## Permission ชั่วคราว

- View management history, create/edit Draft, Publish และ Archive: Admin + AE Supervisor
- `/settings` เปิดสำหรับผู้ใช้ที่ล็อกอินทุก role เพราะมีการตั้งค่าที่อ่านได้ทั่วไป เช่นวันหยุด
- หน้าลูกและ API ยังคงตรวจ permission ใกล้ data source; การเห็นปุ่มหรือการ์ดไม่ใช่ authorization
- Company Data และ Workflow Template ยังคง permission เดิม
- Permission redesign เต็มรูปแบบอยู่ Phase 8–9

## Data/API ที่วางแผน

- `document_standards` — root ต่อ document key และ active published pointer
- `document_standard_versions` — immutable version history
- `GET /api/document-standards` — Published, Draft และ history ของทุก document key
- `POST /api/document-standards/[key]/draft` — สร้าง Draft จาก Published ล่าสุด
- `PATCH /api/document-standards/draft/[id]` — บันทึก Draft
- `POST /api/document-standards/draft/[id]/publish` — Publish แบบ atomic
- `POST /api/document-standards/draft/[id]/archive` — Archive Draft

Browser ไม่มีสิทธิ์เข้าตารางโดยตรง; route handler ใช้ service role หลังตรวจ session และ role แล้ว

## UX/UI

- การ์ด `มาตรฐานเอกสาร` อยู่ใน Settings hub ส่วนกลาง ไม่อยู่ใต้ระบบขาย
- หน้า management มีตัวเลือกชนิดเอกสาร, Published summary, Draft action และ Version history
- รายละเอียด/แก้ไขเปิดใน Drawer และใช้ฟอร์มชุดเดียวกัน
- มี Skeleton, Empty, Error, Toast, confirm dialog และ disabled state
- รองรับ Desktop/Mobile, Light/Dark, keyboard, focus trap/restore และ screen reader
- ใช้ IBM Plex Sans Thai และ CSS token/class เดิมของระบบ
- Accent preview เป็นตัวอย่างเอกสาร ไม่เปลี่ยนสี theme ของหน้าเว็บ

## Migration และ Rollback

- Migration: `0123_document_standards.sql`
- Seed Quotation และ Sale Order จากค่าปัจจุบันใน `documentBrand.js` เป็น Published Version 1
- เปิด RLS, revoke `anon`/`authenticated` และให้ service role เท่านั้น
- Rollback ระดับแอป: ถอดเมนู/API โดยคง version history ไว้
- Production Print ยังอ่านค่าคงที่เดิม จึงไม่มีผลย้อนหลังและ rollback ได้โดยไม่เปลี่ยนเอกสารที่ใช้งานอยู่

## ไม่รวมใน Phase 6A

- เปลี่ยน Production Quotation/Sale Order Print ให้ดึงค่า Published แบบสด
- เปลี่ยน RPC ออกเลข `QT-YYMMXXXX-R` หรือ `SO-YYMMXXXX-R`
- วางภาพลายเซ็นลง Print/PDF หรือสร้าง Signature Evidence — Phase 5B/6B/7
- Commercial Preset แยกทีม/ประเภทดีล/ประเภทบริการ — Phase 7
- Issued PDF storage, immutable document snapshot และ Document Engine — Phase 7
- Sale Order visual redesign และ Permission redesign เต็มรูปแบบ

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยัน scope และลำดับ 6A → 5B → 6B ก่อนแก้ไฟล์
- [x] Sync `main`, สร้าง branch ใหม่ และไม่แก้/stage/delete `.agents/`
- [x] จัดทำ Phase document และ Decision log ก่อน implementation
- [ ] Migration integrity, constraints, RLS, RPC และ rollback notes ผ่าน
- [x] Normalization/validation, permission และ route regression tests ผ่าน
- [ ] Draft create/save/archive, stale/no-write และ atomic Publish ผ่าน Preview UAT
- [x] Settings link/gate ผ่าน Desktop/Mobile และ role ที่เกี่ยวข้อง
- [x] UI ผ่าน Desktop/Mobile, Light/Dark, keyboard และ accessibility
- [x] Automated tests, targeted ESLint และ production build ผ่าน
- [x] Permission action inventory, roadmap และ validation log อัปเดต
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ PR

### Validation log — 20 กรกฎาคม 2026

- `npm run check:migrations` ผ่าน: 123 migrations และไฟล์ล่าสุดคือ `0123_document_standards.sql`
- ผู้ใช้ยืนยันว่ารัน Migration 0123 แล้ว; local QA runtime ของ Codex ไม่มี Supabase service-role environment จึงยังไม่ได้อ่าน seed หรือทดสอบ RPC กับฐานจริง
- Targeted tests ผ่าน 36/36 และ full regression ผ่าน 398/398
- Targeted ESLint และ Next.js 16.2.7 production build ผ่าน รวมหน้า/API ของ Document Standards ครบ
- Chrome QA ด้วย AE Supervisor ผ่าน Desktop Light/Dark, Settings link/back link, document tabs, Draft Drawer, Escape/focus restore และ console ไม่มี error/warning
- Responsive QA ที่ viewport mobile ผ่าน: ตารางเปลี่ยนเป็นการ์ด, Drawer เต็มความกว้าง และ document/body ไม่มี horizontal overflow
- Follow-up รูปแบบ controlled form line ผ่าน targeted tests 19/19 และ production build: `FM-SA-01: Rev. No.00 08/05/2568` ไม่มีจุดหลังเลข Revision
- QA รอบนี้ไม่เขียนข้อมูลจริง; Preview UAT สำหรับ create/save/archive/stale/publish ยังเป็น release gate โดยผู้ใช้ยืนยันว่ารัน Migration 0123 แล้ว

## Known risks

- การนำ Published version ไปใช้กับเอกสารเก่าแบบสดจะทำลาย reprint evidence จึงห้ามเชื่อม Production consumer ก่อน Phase 7 snapshot
- รูปแบบเลขที่ที่แก้ได้อาจสร้างเลขซ้ำหรือข้ามลำดับ จึงจำกัดเป็น guarded token และยังไม่เปลี่ยน number generator ในเฟสนี้
- Phase 5B ต้องอ้างอิง version ID แบบ immutable และห้าม backfill หลักฐานให้ approval เดิม
- Central audit เป็น best-effort; version table และ atomic RPC เป็นหลักฐาน lifecycle หลัก
