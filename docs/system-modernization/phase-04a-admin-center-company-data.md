# Phase 4A — Admin Center and Versioned Company Data

สถานะ: เสร็จสมบูรณ์

เริ่ม: 19 กรกฎาคม 2026
เป้าหมาย: สร้างศูนย์รวมการตั้งค่าที่มี ownership ชัดเจน และจัดเก็บข้อมูลบริษัทแบบมีเวอร์ชันโดยไม่เปลี่ยนเอกสาร Production เดิม

## ขอบเขต

- ต่อยอดหน้า `/settings` เดิมเป็น Admin Center แบบ Navigation Card แบ่งหมวดชัดเจน
- เพิ่มหน้าจัดการข้อมูลบริษัทสำหรับผู้ดูแลระบบ
- เก็บข้อมูลบริษัทเป็น Draft, Published และ Archived
- Seed ข้อมูลบริษัทปัจจุบันจาก `webapp/src/lib/documentBrand.js` เป็น Published Version 1
- เก็บประวัติผู้สร้าง ผู้แก้ ผู้เผยแพร่ เวลา และหมายเหตุการเปลี่ยนแปลง
- ใช้ Drawer สำหรับดูรายละเอียดและแก้ไข Draft
- มีการยืนยันก่อน Publish และไม่มี Auto-save
- เตรียม server-side accessor สำหรับอ่าน Published version ใน Phase 7

## ข้อมูลที่จัดการในรอบแรก

- ชื่อนิติบุคคลภาษาไทยและอังกฤษ
- เลขประจำตัวผู้เสียภาษีและรหัสสาขา
- ที่อยู่จดทะเบียนภาษาไทยและอังกฤษ
- โทรศัพท์ อีเมล Line และเว็บไซต์
- หมายเหตุการเปลี่ยนแปลงของแต่ละเวอร์ชัน

โลโก้, Form code, Revision, Effective date และ localized document content ไม่ใช่ข้อมูลทั่วไปของบริษัทในเฟสนี้

## Version lifecycle

1. ระบบมี Company profile หลักหนึ่งรายการ
2. มี Draft ได้ครั้งละหนึ่งเวอร์ชัน
3. การแก้ไขเกิดกับ Draft เท่านั้น
4. การ Publish ทำใน transaction เดียว: archive Published เดิม, publish Draft และชี้ active version ใหม่
5. Published และ Archived ห้ามแก้ข้อมูลหรือถูกลบผ่าน UI/API
6. การแก้ครั้งถัดไปต้องสร้าง Draft ใหม่จาก Published ล่าสุด
7. ทุก write ตรวจ `updatedAt` เพื่อป้องกันการเขียนทับข้อมูลที่ถูกแก้จากอีกหน้าต่าง

## UX/UI

- Admin Center ใช้ Navigation Card ไม่ใช้ KPI layout
- หน้าข้อมูลบริษัทมี summary ของ Published version, action bar และ version history
- Desktop ใช้ตารางประวัติ; หน้าจอแคบต้องอ่านและใช้งานได้โดยไม่เกิด page-level horizontal overflow
- รายละเอียดหนึ่งเวอร์ชันเปิดใน Drawer
- Draft ใช้ฟอร์มเดียวสำหรับสร้างและแก้ไข
- มี Skeleton, Empty state, Error state, Toast และสถานะ Disabled ระหว่าง request
- ใช้ภาษาไทยเป็นหลัก, IBM Plex Sans Thai, CSS token และ shared component เดิม
- มี focus-visible, focus trap/restore ใน Drawer, Escape และ accessible name ของปุ่ม icon

## Permission ชั่วคราว

- View management history, create/edit Draft, Publish และ Archive: Admin ผ่าน `master:manage`
- ไม่สร้าง Role หรือ Capability ใหม่
- ไม่ขยายสิทธิ์ให้ AE Supervisor ในเฟสนี้
- Permission redesign และ UAT อยู่ Phase 8–9

API ต้องตรวจ session และ `master:manage` ใกล้ data source ทุก route; การซ่อนปุ่มใน UI ไม่ถือเป็น authorization

## Data/API ที่วางแผน

- `organization_settings` — root record และ active published pointer
- `organization_setting_versions` — immutable version history
- `GET /api/organization-settings` — Published, Draft และประวัติสำหรับหน้า Admin
- `POST /api/organization-settings/draft` — สร้าง Draft จาก Published ล่าสุด
- `PATCH /api/organization-settings/draft/[id]` — บันทึก Draft พร้อม optimistic concurrency
- `POST /api/organization-settings/draft/[id]/publish` — Publish แบบ atomic
- `POST /api/organization-settings/draft/[id]/archive` — Archive Draft ที่ไม่ใช้

Browser ไม่มีสิทธิ์เข้าตารางโดยตรง; Route handlers ใช้ service role หลังตรวจ permission แล้ว

## Audit

- สร้าง Draft: `create / organization_settings_version`
- บันทึก Draft: `update / organization_settings_version`
- Publish: `publish / organization_settings_version`
- Archive Draft: `archive / organization_settings_version`
- Audit เก็บ actor snapshot, before/after, version number และหมายเหตุการเปลี่ยนแปลง
- Version table เป็นหลักฐานถาวร; ห้าม hard delete ผ่าน API

## Migration และ Rollback

- Migration ที่วางแผน: `0120_organization_settings.sql`
- Seed Published Version 1 ด้วยค่าปัจจุบันเพื่อให้ deployment มี active version ทันที
- เปิด RLS และ revoke `anon`/`authenticated`; service role เท่านั้นที่เข้าถึงตาราง
- Rollback ระดับแอป: ถอดเมนู/API และคงตารางกับประวัติไว้
- ไม่ drop version history หลังเริ่มใช้งานโดยไม่มีการอนุมัติการลบหลักฐาน
- เอกสาร Production ยังคงอ่านค่าคงที่เดิม จึง rollback UI/API ได้โดยไม่กระทบการพิมพ์

## ไม่รวมใน Phase 4A

- Workflow/Timeline Template management และ `webapp/src/lib/pm/templates.js` — Phase 4B
- Electronic signature — Phase 5
- Document Design System, Quotation master template และ PDF — Phase 6–7
- การเปลี่ยน Quote, Sales Order, Tax bill หรือ Project Timeline ให้ดึงข้อมูลบริษัทจากฐานข้อมูล — Phase 7
- Logo asset lifecycle และการเปลี่ยนโลโก้ Production
- Form code, Revision และ Effective date ซึ่งเป็น controlled document metadata
- Permission redesign — Phase 8–9

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยันขอบเขตก่อนแก้ไฟล์
- [x] สร้าง branch จาก `origin/main` ล่าสุดและไม่แตะ `.agents/`
- [x] บันทึก Phase document และ Decision log ก่อน implementation
- [x] Migration ordering/integrity check และ rollback notes ผ่าน
- [x] ผู้ใช้รัน Migration 0120 บน Supabase environment แล้ว
- [x] Unit tests สำหรับ normalization และ validation ผ่าน
- [x] Admin API GET/create/update/archive, no-write-on-invalid และ stale update ผ่าน Preview UAT
- [x] Atomic Publish success ผ่าน Preview UAT
- [x] Authorization guard และขอบเขต capability คงเดิม; ย้าย full role-matrix regression ไป Phase 8–9
- [x] Admin Center/Company Data UI ผ่าน Desktop/Mobile และ Light/Dark
- [x] Keyboard, focus trap/restore, Escape, loading, empty, error และ confirm states ผ่าน
- [x] ESLint, automated tests และ production build ผ่าน
- [x] Permission action inventory ได้รับการทบทวนและ roadmap อัปเดต
- [x] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ Draft PR

## Validation log — 19 กรกฎาคม 2026

- `npm run check:migrations` ผ่าน: 120 migration files, latest `0120`
- Automated tests ผ่าน 354/354
- Targeted ESLint ผ่านโดยไม่มี warning/error จากไฟล์ Phase 4A
- Full ESLint ผ่านโดยไม่มี error; พบ warning เดิม 9 รายการในไฟล์นอกขอบเขต
- Production build ผ่านด้วย Next.js 16.2.7 และ compile route/page ใหม่ครบ
- Visual QA ผ่านที่ Desktop 1440×900 และ Mobile 390×844
- ตรวจ Dark/Light, table-to-card responsive, Drawer full-width บน Mobile และไม่มี page-level horizontal overflow
- ตรวจ focus trap ด้วย Shift+Tab, Escape ปิด Drawer, focus คืนปุ่มต้นทาง และ Publish confirm dialog
- Browser console ของหน้า Phase 4A ไม่มี error/warning
- Visual QA ใช้ mock company history เฉพาะ local development และถอด test shim ออกจาก working tree แล้ว
- ผู้ใช้ยืนยันว่ารัน Migration 0120 แล้วเมื่อ 19 กรกฎาคม 2026
- เพิ่ม `npm run verify:organization-settings` สำหรับตรวจ seed pointer, one Published/one Draft, RLS, invalid/stale no-write, Draft create/archive และ immutable history; โหมดเขียนต้องระบุ `--write` โดยตั้งใจ
- Production session ยืนยันบัญชี Admin ได้ แต่ `/settings/company` ยังเป็น 404 ตามคาด เพราะ source ของ Phase 4A ยังไม่ถูก deploy
- Local development ไม่มี Supabase environment และ Vercel ไม่อนุญาตให้ดึงค่าที่ตั้งเป็น Sensitive ออกมารันภายนอก deployment; ไม่ได้เปิดเผยค่า secret และลบ environment ชั่วคราวแล้ว
- Draft PR #552 ผ่าน GitHub CI และ Vercel Preview หลัง rebase กับ `origin/main`
- Preview UAT ด้วยบัญชี Admin ยืนยัน Published Version 1 จาก Migration 0120 และสร้าง Draft Version 2 จาก Published ปัจจุบันได้
- Invalid tax ID ถูกปฏิเสธและไม่บันทึก; valid Draft บันทึกหมายเหตุ UAT ได้โดย Published Version 1 ไม่เปลี่ยน
- เปิด Draft เดียวกันสองแท็บเพื่อทดสอบ optimistic concurrency: การบันทึกจากแท็บเก่าถูกปฏิเสธพร้อมข้อความให้โหลดข้อมูลล่าสุด และค่า stale ไม่ถูกเขียนทับ
- Archive Draft Version 2 ผ่าน Confirm dialog แล้ว; หน้าหลักกลับมาไม่มี Draft, Version 2 เป็น Archived และ Published ยังคงเป็น Version 1
- Audit log มีหลักฐาน create/update/archive พร้อม actor, version และ before/after snapshot ครบ; Draft เก็บค่าบริษัทเดิมและหมายเหตุ UAT โดยไม่มีค่า stale
- Preview Company Data และ Audit console ไม่มี error/warning ระหว่าง UAT
- สร้าง Draft Version 3 จาก Published Version 1, บันทึกหมายเหตุ `Phase 4A UAT — atomic Publish validation` และ Publish สำเร็จ
- หลัง Publish ระบบแสดง Version 3 เป็น Published และ Version 1 เป็น Archived โดยค่าข้อมูลบริษัททุกช่องคงเดิม; ไม่มี Draft ค้างอยู่
- Audit log มีหลักฐาน create/update/publish ของ Version 3 พร้อม actor, version, change note และ Published snapshot ครบ

## Production closeout — 19 กรกฎาคม 2026

- PR #552 ถูก Merge แล้ว และ GitHub CI/Vercel ผ่าน
- Production smoke test ด้วยบัญชี Admin เปิด `/settings/company` สำเร็จและแสดง Published Version 3 โดยไม่มี Draft ค้าง
- Version 1–3, สถานะ Published/Archived, actor, เวลา และ change note แสดงครบ; browser console ไม่มี warning/error
- ไม่ทำ lifecycle mutation ซ้ำระหว่าง closeout เพื่อไม่สร้างข้อมูลทดสอบเพิ่มเติมใน Production
- การทดสอบ role matrix ด้วย permission model ใหม่รวมไว้ใน Phase 8–9; Phase 4A ไม่ได้ขยาย capability เดิม
- ผู้ใช้ยืนยันการส่งมอบด้วยการ Merge PR และอนุมัติให้ปิด Phase 4

## Known risks

- เอกสารเดิมมีข้อมูลบริษัท hard-code หลายจุด การย้าย consumer ต้องทำพร้อม immutable document snapshot ใน Phase 7
- Central audit helper เป็น best-effort; version table และ transaction publish จึงต้องเป็นหลักฐานหลักแม้ audit insert ภายนอกล้มเหลว
- การเปิดแก้ Published โดยตรงจะทำลาย reprint evidence จึงต้องบังคับ transition ที่ฐานข้อมูลและ API
- การ Publish พร้อมกันต้อง serialize ที่ root record และตรวจ Draft/Published อีกครั้งใน transaction
