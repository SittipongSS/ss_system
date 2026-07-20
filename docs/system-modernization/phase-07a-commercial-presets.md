# Phase 7A — Versioned Commercial Presets

สถานะ: รอตรวจ

เริ่ม: 20 กรกฎาคม 2026

บันทึกสถานะ 20 กรกฎาคม 2026: โค้ด Merge เข้า main แล้วผ่าน PR #582
(commit `609ed9fd`, merge `ad5434f2`) ครบทั้ง mig 0128, resolver, Admin UI
และ API; ยังค้างการยืนยันรัน Migration 0128 บนฐานข้อมูลจริง, UAT ตาม
Definition of Done ด้านล่าง และการเสียบ resolver เข้ากับ consumer จริง
ซึ่งเป็นขอบเขตของ Phase 7C

เป้าหมาย: สร้างแหล่งตั้งค่ากลางแบบมีเวอร์ชันสำหรับวิธีชำระเงิน เงื่อนไขการชำระ หมายเหตุ และงวดชำระของเอกสาร โดยแยกตามชนิดเอกสาร ทีม ประเภทดีล และประเภทบริการ พร้อม fallback ที่แน่นอน โดยยังไม่เปลี่ยน Production Print หรือข้อมูลใบเสนอราคาเดิมใน Phase นี้

## บริบทปัจจุบัน

- `quote_note_templates` เก็บข้อความหมายเหตุแยกด้วย field `serviceType` แต่ชื่อนี้ถูกใช้ปะปนทั้งค่าทั่วไปและประเภทดีล
- ใบเสนอราคาแต่ละใบเก็บ `paymentTerms`, `notes` และ `paymentPlan` ของตัวเองอยู่แล้ว แต่ยังไม่มี Preset กลางที่มี lifecycle และประวัติเวอร์ชัน
- `paymentPlan` รองรับแบบเต็มจำนวนและแบ่ง 2–6 งวด พร้อมชื่อ เปอร์เซ็นต์ หมายเหตุ และยอดเงิน แต่ยังไม่มี trigger/due rule ที่เป็นโครงสร้างกลาง
- Phase 6B ส่งมอบ Quotation Master Preview แล้ว ส่วน `quotePrint.js` และ `salesOrderPrint.js` ยังเป็น Production authority
- Decision 0004 กำหนดให้ Commercial Preset แยกจาก Workflow/Timeline Operational Template และเอกสารที่ออกจริงต้อง snapshot เนื้อหาและเวอร์ชันในเฟสถัดไป

## ขอบเขตที่ยืนยันแล้ว

- เพิ่ม Commercial Preset root และ Version lifecycle แบบ `draft`, `published`, `archived`
- Preset รองรับ scope ตาม `documentKey`, ทีม, ประเภทดีล และประเภทบริการ โดย scope ที่ไม่กำหนดใช้ค่า `null` อย่างชัดเจน
- เก็บวิธีชำระเงิน เงื่อนไขการชำระ หมายเหตุ และรายการงวดชำระ
- งวดชำระแต่ละแถวเก็บชื่อ เปอร์เซ็นต์ trigger/due rule และหมายเหตุ โดยผลรวมเปอร์เซ็นต์ต้องเท่ากับ 100 เมื่อมีรายการ
- มี resolver ฝั่ง server ที่เลือก Published Version ตามลำดับ exact match → team default → general และตัดสินผลแบบ deterministic
- เพิ่มหน้าจัดการใน Settings สำหรับดู Preset, Draft, Published, Version history, Preview, Publish และ Archive
- ใช้ Drawer สำหรับรายละเอียด Version และการแก้รายการงวดชำระ
- Seed ข้อมูลจาก `quote_note_templates` แบบไม่ลบหรือแก้แถวเดิม และไม่เปลี่ยน consumer เดิม
- เก็บ actor, เวลา, change note และ Audit สำหรับ create/update/publish/archive
- ใช้ Admin และ AE Supervisor เป็น temporary management gate จนถึง Permission Phase 8–9

## Preset model

Preset root หนึ่งรายการแทน scope key ที่คงที่และชี้ Published Version ปัจจุบัน โดย scope ประกอบด้วย:

- `documentKey` — Phase 7A รองรับ `quotation` ก่อน แต่ model ไม่ผูกกับ Quotation อย่างเดียว
- `teamKey` — ไม่กำหนดหมายถึงใช้ได้ทุกทีม
- `dealType` — ไม่กำหนดหมายถึงค่า default ของ scope นั้น
- `serviceType` — optional จนกว่าจะมีแหล่งข้อมูลประเภทบริการที่เป็น authority ชัดเจน

แต่ละ Version มี:

- Version number และสถานะ `draft`, `published`, `archived`
- วิธีชำระเงินและเงื่อนไขการชำระ
- หมายเหตุภาษาไทยเป็นหลัก
- รายการงวดชำระแบบเรียงลำดับ
- change note และ actor/timestamp สำหรับ create, update, publish และ archive

## Version lifecycle

1. Preset root หนึ่งรายการมี Published ได้หนึ่ง Version และ Draft ได้ไม่เกินหนึ่ง Version
2. Draft ใหม่คัดลอกจาก Published ล่าสุด หรือเริ่มว่างเมื่อยังไม่มี Published
3. แก้ไขได้เฉพาะ Draft และทุก write ตรวจ expected `updatedAt`
4. Publish ต้องมี change note และผ่าน validation ทั้งชุด
5. Publish ทำใน transaction เดียว: lock root, ตรวจ Draft, archive Published เดิม, publish Draft และเปลี่ยน root pointer
6. Published และ Archived immutable และห้าม hard delete ผ่าน UI/API
7. การแก้ครั้งถัดไปเริ่มจาก Draft ใหม่ ไม่แก้ Published โดยตรง

## Resolver และ fallback

- Resolver รับ `documentKey` พร้อม context ที่มี team/deal/service เท่าที่ระบบรู้จริง
- ลำดับหลักคือ exact scope → team default → document general
- Candidate ที่ specific เท่ากันให้ team default มาก่อน deal/service default แล้วจึงเรียงด้วย `priority` และ `presetKey` เพื่อให้ผลคงที่และไม่ขึ้นกับลำดับแถวจากฐานข้อมูล
- ถ้าไม่พบ Published Preset ให้คืนผลว่าไม่พบ ไม่เดาหรือสร้างค่าเงียบ ๆ
- Phase 7A ทดสอบ resolver แต่ยังไม่เสียบ resolver เข้ากับการสร้าง Quotation Production

## Legacy migration

- Migration ที่วางแผน: `0128_commercial_presets.sql`
- คงตารางและแถว `quote_note_templates` เดิมทั้งหมด
- ค่า `general` seed เป็น general Preset
- ค่า `SCENT`, `NPD`, `RE-ORDER` seed เป็น deal-type Preset
- ค่าอื่น seed เป็น optional service-type Preset เพื่อรักษาความหมายเดิมโดยไม่สมมติข้อมูลเพิ่ม
- คัดลอกทุก Legacy Template เป็น Preset แยก โดยใช้ `title` และ `body` เดิมเป็นชื่อ/remarks ของ Version 1 พร้อมเก็บ reference แหล่ง legacy; หลาย Preset ใน scope เดียวกันยังอยู่ครบและ resolver ใช้ priority/preset key ตัดสิน
- ไม่แก้ `quotations.paymentPlan`, `paymentTerms`, `notes` หรือใบเสนอราคาเก่า
- Rollback ระดับแอปคือปิดหน้า/API ใหม่และคง consumer เดิมไว้; ไม่ drop ประวัติเวอร์ชันที่สร้างแล้ว

## UX/UI

- เพิ่ม Navigation Card “Commercial Preset” ใน Settings ซึ่งเป็น global setting เหนือระบบธุรกิจ
- หน้าหลักแสดง scope, Published version, Draft status, สรุปวิธีชำระ/จำนวนงวด และวันที่เผยแพร่
- ใช้ตารางบน Desktop และ responsive card/list ที่ไม่มี page-level horizontal overflow บน Mobile
- Detail และ Version history เปิดใน Drawer
- แยก Save Draft กับ Publish; Publish ใช้ Confirm dialog และต้องกรอก change note
- มี Preview เนื้อหาแบบอ่านอย่างเดียวก่อน Publish
- รองรับ Light/Dark, keyboard, focus-visible, focus trap/restore, loading, empty, error, busy และ toast state
- ใช้ภาษาไทยเป็นหลัก ภาษาอังกฤษเป็นคำรองเท่าที่จำเป็น และ IBM Plex Sans Thai ผ่าน token/shared component เดิม

## Permission ชั่วคราว

- ดูหน้าจัดการ, สร้าง/แก้ Draft, Publish และ Archive: Admin + AE Supervisor
- Route handlers ตรวจ session และ temporary gate ใกล้ data source ทุก route
- Browser ไม่มีสิทธิ์เขียนตารางโดยตรง; server ใช้ service role หลัง authorization
- ไม่สร้าง Role หรือ Capability ใหม่ก่อน Phase 8–9

## API/Data ที่วางแผน

- `commercial_presets` — root, scope และ Published pointer
- `commercial_preset_versions` — lifecycle, commercial content และ audit metadata
- รายการงวดเก็บเป็น JSONB ที่ validate schema ทั้งใน service และ database guard เพื่อ snapshot/version เป็นหน่วยเดียวกัน
- API list/detail, create/update Draft, validate/preview, publish และ archive
- server-only resolver สำหรับ Published Version ตาม scope

ชื่อ column, constraint และ route จริงต้องล็อกหลังตรวจ lifecycle pattern และ schema relation ปัจจุบันก่อนเขียน Migration

## Validation rules

- `documentKey` ต้องอยู่ในชุดที่รองรับ
- `presetKey` ห้ามซ้ำ; scope ซ้ำได้เพื่อรักษาหลายตัวเลือกเดิม แต่ resolver ต้องตัดสินด้วย specificity, priority และ preset key อย่างแน่นอน
- ข้อความต้องผ่านความยาวสูงสุดและ trim ก่อนบันทึก
- งวดชำระต้องมี label, percent มากกว่า 0, ลำดับไม่ซ้ำ และผลรวมเท่ากับ 100
- trigger/due rule ต้องอยู่ในโครงสร้างที่รองรับ ห้ามเก็บ expression ที่ประมวลผลโค้ดได้
- Draft ที่ stale, Published/Archived mutation และ Publish ที่ไม่ผ่าน validation ต้องไม่เกิด partial write
- Resolver ต้องให้ผลเดิมเมื่อ input และ Published data เดิม

## ไม่รวมใน Phase 7A

- การเลือก Preset อัตโนมัติในหน้าสร้างหรือแก้ Quotation
- การ snapshot Preset/Company/Form/Signature/Layout ลง issued document
- การสร้างหรือเก็บ immutable PDF
- การแทน `quotePrint.js` ด้วย Quotation Master Template V2
- การเปลี่ยน Sales Order หรือ `salesOrderPrint.js`
- การแก้ใบเสนอราคา เอกสาร หรือ Note Template เดิมย้อนหลัง
- service-type master data ใหม่
- Permission redesign — อยู่ Phase 8–9 ตามเดิม

## แผน Phase 7 ถัดไป

- Phase 7B — Issued document snapshot และ immutable PDF foundation
- Phase 7C — Production Quotation Print replacement โดยใช้ Quotation Master V2
- Phase 7D — Sales Order document migration

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยันขอบเขตก่อนแก้ implementation
- [x] ซิงก์ `main` ล่าสุดและสร้าง `codex/phase-07a-commercial-presets` โดยไม่แตะ `.agents/`
- [x] จัดทำ Phase document และ Decision log ก่อน implementation
- [x] ตรวจ lifecycle migration/API pattern ปัจจุบันก่อนล็อก schema
- [ ] Migration seed legacy ได้ครบโดยไม่เปลี่ยนหรือลบข้อมูลเดิม
- [ ] Lifecycle, immutable guard, stale update, invalid no-write และ atomic Publish ผ่าน automated tests
- [ ] Resolver exact/team/general และ deterministic tie-break ผ่าน automated tests
- [ ] Authorization ของ Admin + AE Supervisor และ denial ของ role อื่นผ่าน tests
- [ ] UI list, Drawer, editor, Preview, history และ lifecycle ผ่าน functional tests
- [ ] Desktop/Mobile, Light/Dark และ accessibility ผ่าน visual validation
- [x] Migration integrity, rollback notes, targeted lint/tests และ production build ผ่าน
- [ ] อัปเดต implementation validation, known issues และหลักฐานตามผลจริง
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ PR

## Implementation validation — 20 กรกฎาคม 2026

- เพิ่ม Migration `0128_commercial_presets.sql` พร้อม root/version, immutable database guards, atomic create/publish/archive functions, RLS และ service-role-only access
- Seed ทุกแถวจาก `quote_note_templates` เป็น Preset แยกพร้อม legacy reference โดยไม่ update/delete ตารางเดิมและไม่เปลี่ยน Quotation/Sales Order consumer
- เพิ่ม validation สำหรับ scope, ความยาวข้อความ, งวดสูงสุด 12 แถว และผลรวม 100% ทั้งใน application และ database check
- Resolver เลือก Published Preset ด้วย specificity → team/deal/service preference → priority → preset key และมี deterministic unit tests
- เพิ่ม API พร้อม session, Admin + AE Supervisor gate, optimistic concurrency และ audit สำหรับ create/update/publish/archive
- เพิ่มหน้า `/settings/commercial-presets` พร้อม Desktop table, Mobile cards, Drawer editor/preview/version history, explicit Save, Confirm Publish/Archive และ Light/Dark token contract
- `check:migrations` ผ่าน 128 ไฟล์, targeted ESLint ผ่าน, automated tests ผ่าน 430 รายการ และ Next.js production build สำเร็จ
- เครื่องนี้ไม่มี `psql`, Supabase CLI หรือ Docker จึงยังไม่ได้ execute SQL กับ local database; ต้องยืนยัน lifecycle หลังผู้ใช้รัน Migration 0128
- Visual/functional UAT ใน Chrome รอหลัง Migration 0128 โดยต้องไม่สร้าง/Publish ข้อมูลจริงหากผู้ใช้ยังไม่อนุญาต

## Known risks

- `serviceType` เดิมมีความหมายปะปน จึงต้อง migrate แบบ conservative และเก็บ legacy reference
- การ fallback ที่ไม่ deterministic อาจเลือกเงื่อนไขการค้าผิดทีม จึงต้องมี normalized uniqueness และ tie-break ที่ชัดเจน
- การต่อ consumer ใน Phase 7A จะเพิ่ม blast radius และเสี่ยงเปลี่ยนเอกสารจริง จึงเลื่อนไปหลัง infrastructure ผ่าน validation
- Published content เป็นข้อมูลทางการค้า ต้อง immutable และมี audit trail แม้ Permission model ใหม่ยังไม่เริ่ม
