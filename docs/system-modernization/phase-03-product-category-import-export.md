# Phase 3 — Product Category Import/Export

สถานะ: กำลังดำเนินการ

เริ่ม: 19 กรกฎาคม 2026

เป้าหมาย: ทำให้ AE Supervisor และ Admin ปรับปรุงหมวดสินค้าจำนวนมากผ่าน Excel ได้อย่างตรวจสอบย้อนกลับได้ โดยต้องเห็น Preview ก่อนเขียนข้อมูลจริง และต้องไม่ทำลายรหัสที่สินค้า ดีล โครงการ กฎภาษี หรือ Timeline Template อ้างอิงอยู่

## คำศัพท์ที่ล็อกแล้ว

- `ไฟล์สำหรับนำเข้า` หมายถึง Excel สำหรับเพิ่มหรือแก้ไขข้อมูลหลักใน Phase 3
- `ส่งออกข้อมูลปัจจุบัน` หมายถึง Excel สำหรับตรวจสอบ/รายงาน ไม่ใช่แม่แบบเอกสาร
- `Workflow และ Timeline Template` หมายถึงขั้นตอนโครงการ ผู้รับผิดชอบ และระยะเวลา อยู่ Phase 4B
- `แม่แบบเอกสาร` หมายถึงรูปแบบใบเสนอราคา FM-SA-01 และเอกสารธุรกิจอื่น อยู่ Phase 6–7
- UI ห้ามใช้คำว่า `Template` เดี่ยว ๆ เพราะทำให้สี่ความหมายข้างต้นปะปนกัน

## ขอบเขตที่ยืนยัน

- เพิ่ม Action `ส่งออกข้อมูล` และ `นำเข้าข้อมูล` ที่หน้าหมวดสินค้า โดยคง `เพิ่มหมวดสินค้า` เป็น Primary action เดียว
- เพิ่มหน้าแยก `/database/product-categories/import` สำหรับ Upload, Preview, Confirm และประวัติ เพราะตาราง Preview กว้างเกิน Drawer
- ดาวน์โหลดไฟล์ `.xlsx` เวอร์ชันล่าสุดที่มีข้อมูลปัจจุบันสำหรับแก้ไขและนำกลับเข้าได้
- ส่งออกข้อมูลปัจจุบันพร้อม Usage และ operational metadata ในรูปแบบอ่านอย่างเดียว
- Preview ทุกแถวก่อนเขียนข้อมูลจริง พร้อมสรุป เพิ่มใหม่/แก้ไข/ไม่เปลี่ยน/เปลี่ยนสถานะ/ผิดพลาด/ขัดแย้ง
- Commit แบบ all-or-nothing; ถ้ามี Error หรือ Conflict จะไม่เขียนบางส่วน
- เก็บประวัติการนำเข้า ชื่อไฟล์ hash เวอร์ชัน ผู้ดำเนินการ เวลา สรุปผล และ Before/After
- เปิดรายละเอียดประวัติหนึ่งรอบด้วย Drawer ตาม house pattern
- ใช้ภาษาไทยเป็นหลักบน UI และใช้ IBM Plex Sans Thai ผ่านระบบฟอนต์เดิม
- ใช้ Design token และ shared component เดิม; ไม่ติดตั้ง Material/UI library เพิ่ม

## Information Architecture และลำดับหน้าจอ

### หน้าหมวดสินค้า

- `ส่งออกข้อมูล` เป็นปุ่มความสำคัญต่ำ
- `นำเข้าข้อมูล` เป็นปุ่มรองและนำไปหน้า Import workspace
- `เพิ่มหมวดสินค้า` เป็นปุ่มหลักเพียงปุ่มเดียว
- ไม่เพิ่ม Top navigation ใหม่สำหรับ Import/Export
- Phase 4A สามารถเพิ่มทางลัดจาก Admin Center มายังหน้าเดิมได้ แต่ห้ามสร้าง flow ซ้ำ

### Import workspace

1. ดาวน์โหลดไฟล์สำหรับนำเข้าล่าสุด
2. เลือกหรือวางไฟล์ `.xlsx`
3. ระบบอ่านและตรวจสอบโดยยังไม่เขียนฐานข้อมูล
4. ผู้ใช้กรองและตรวจ Preview
5. ผู้ใช้กดยืนยันและ Confirm อีกครั้ง
6. ระบบ Commit ทั้งชุดและแสดงผลสำเร็จ
7. ผู้ใช้เปิดประวัติหรือดาวน์โหลดผลการตรวจได้

บน Desktop ใช้ `premium-table` และ horizontal scroll โดยตรึงคอลัมน์รหัส บน Mobile ใช้ summary กับรายการ Error/Conflict ก่อน และไม่บีบตารางกว้างให้พอดีจอ

## Workbook contract

ไฟล์สำหรับนำเข้ามีอย่างน้อย 3 Sheet:

1. `คำแนะนำ` — วิธีใช้ กฎรหัส สถานะ และวันที่สร้างไฟล์
2. `หมวดสินค้า` — ข้อมูลที่แก้ไขและนำเข้าได้
3. `_metadata` — เวอร์ชันไฟล์ เวลาส่งออก และข้อมูลตรวจ stale; ซ่อนไว้จากการใช้งานทั่วไป

Sheet `หมวดสินค้า` มีคอลัมน์เทคนิค `__recordId` และ `__updatedAt` ที่ซ่อนอยู่สำหรับล็อกรหัสและตรวจข้อมูล stale ผู้ใช้ไม่ต้องแก้สองคอลัมน์นี้

คอลัมน์ใน Sheet `หมวดสินค้า`:

| คอลัมน์ | นำเข้า | กฎ |
|---|---|---|
| รหัสหมวดหลัก | ได้เฉพาะรายการใหม่ | ตัวเลข 2 หลัก; รายการเดิมแก้ไม่ได้ |
| ชื่อหมวดหลัก | ได้ | ต้องเหมือนกันทุกแถวในกลุ่มเดียวกัน |
| รหัสหมวดรอง | ได้เฉพาะรายการใหม่ | ตัวเลข 3 หลัก; รายการเดิมแก้ไม่ได้ |
| ชื่อหมวดสินค้า (ไทย) | ได้ | ภาษาไทยเป็นหลัก |
| Product category name (English) | ได้ | รองรับสองภาษาในอนาคต |
| สถานะ | ได้ | รับเฉพาะ `ใช้งาน` หรือ `พักใช้งาน` |
| หมายเหตุ | ได้ | ไม่เกิน 255 ตัวอักษร |

- ต้องมีชื่อหมวดสินค้าอย่างน้อยหนึ่งภาษา
- Usage, ID, createdAt, updatedAt และ deactivatedAt ไม่นำเข้า
- ไฟล์ Excel ใช้ฟอนต์ที่รองรับภาษาไทยในเครื่องทั่วไป เช่น Leelawadee UI; ไม่พึ่ง Web Font ของหน้าเว็บ
- เวอร์ชันเริ่มต้นวางแผนเป็น `PC-IMPORT-1`; ไฟล์เวอร์ชันที่ไม่รองรับต้องหยุดและให้ดาวน์โหลดใหม่

## กฎ Preview และ Commit

- จับคู่รายการด้วย `(mainCategoryCode, typeCode)`
- รหัสซ้ำในไฟล์เป็น Error
- ชื่อหมวดหลักหลายค่าในรหัสหลักเดียวกันเป็น Error
- การเปลี่ยนชื่อหมวดหลักต้องแสดงผลกระทบทั้งกลุ่ม
- รายการที่หายจากไฟล์ไม่ถูกลบและไม่ถูกพักใช้อัตโนมัติ
- การพักใช้/เปิดใช้ต้องมาจากค่าสถานะที่ระบุชัดในไฟล์
- รหัส `01-002` และรหัสอื่นที่กฎระบบอ้างอิงยังแก้ไม่ได้
- การพักใช้รหัสที่มี Usage ทำได้หลังเห็นจำนวนผลกระทบและยืนยัน แต่ไม่ลบข้อมูลย้อนหลัง
- ถ้าข้อมูลถูกแก้หลังเวลาที่สร้างไฟล์ แถวนั้นเป็น Conflict และต้องดาวน์โหลดข้อมูลล่าสุด
- Preview ต้องผูกกับ file hash และข้อมูลที่ตรวจแล้ว; Commit ห้ามรับข้อมูลแถวใหม่จาก Client โดยไม่ตรวจซ้ำ
- จำกัดเฉพาะ `.xlsx`, ขนาดไม่เกิน 5 MB และจำนวนแถวตามค่าที่กำหนดใน implementation
- สูตรหรือชนิด cell ที่ไม่ปลอดภัยในคอลัมน์ข้อมูลต้องถูกปฏิเสธหรืออ่านเป็นข้อความเท่านั้น

## API และข้อมูลที่วางแผน

เส้นทางที่วางแผน:

- `GET /api/product-types/template` — ไฟล์สำหรับนำเข้าล่าสุด
- `GET /api/product-types/export` — ข้อมูลปัจจุบันสำหรับตรวจสอบ
- `POST /api/product-types/import/preview` — parse และ validate โดยไม่เขียนข้อมูลหลัก
- `POST /api/product-types/import/commit` — Commit preview ที่ยืนยันแล้ว
- `GET /api/product-types/imports` — ประวัติ
- `GET /api/product-types/imports/[id]` — รายละเอียดหนึ่งรอบ

ไม่ใช้ `/api/upload` เพราะ endpoint เดิมเป็นระบบแนบไฟล์เอกสารและมี lifecycle/authorization คนละแบบ

Migration ถัดไปวางแผนเป็น `0119_product_category_imports.sql` โดยต้อง:

- เก็บ import run และ row-level evidence ที่จำเป็น
- รองรับสถานะ previewed/completed/failed/expired
- ใช้ transaction หรือ RPC เพื่อ Commit ทั้งชุด
- ตรวจ concurrency/stale data ก่อนเขียน
- เปิด RLS และให้เข้าถึงผ่าน server API เท่านั้น
- ไม่ Normalize `product_types` ในเฟสนี้

## Permission ชั่วคราว

- Download template, Export, Preview, Commit และดูประวัติ: `admin` และ `ae_supervisor`
- ใช้ `canManageProductCategories()` ให้ตรงกับ Phase 2
- ไม่ใช้ `master:manage` อย่างเดียว เพราะจะตัด AE Supervisor ออกจากข้อมูลธุรกิจที่ผู้ใช้ยืนยันให้ดูแล
- ยังไม่สร้าง Role หรือ Capability ใหม่; ย้ายไปออกแบบจริงใน Phase 8–9

## Audit และประวัติ

- หนึ่ง Import run ต้องมี actor snapshot, file name, file hash, template version และ timestamp
- เก็บ summary จำนวน create/update/status/unchanged/error/conflict
- เก็บ Before/After ระดับแถวสำหรับรายการที่ Commit
- บันทึก central Audit เป็นเหตุการณ์ import batch โดยไม่สร้างข้อความรบกวนจากแถวที่ไม่เปลี่ยน
- Export และ download template ไม่เปลี่ยนข้อมูล จึงยังไม่บันทึก central Audit ใน Phase 3

## Rollback

- ปิด Action Import/Export และถอดหน้า Import workspace ได้โดยไม่กระทบหน้า CRUD เดิม
- Migration history table สามารถคงไว้เป็น audit evidence แม้ถอด UI
- หากต้องย้อนข้อมูลจาก Import ให้ใช้ Before evidence ของรอบนั้นและขั้นตอนที่ตรวจสอบได้ ห้ามลบประวัติ
- ไม่ทำปุ่ม Undo อัตโนมัติใน Phase 3 เพราะอาจมีข้อมูล downstream เกิดหลัง Import

## ไม่รวมใน Phase 3

- Workflow/Timeline Template editor: Phase 4B
- Admin Center และข้อมูลบริษัท: Phase 4A
- Electronic signature: Phase 5
- Document Design System และแม่แบบเอกสาร: Phase 6–7
- Permission redesign: Phase 8–9
- Import ลูกค้า สินค้า หรือข้อมูลหลักชนิดอื่น; ใช้ผลจากเฟสนี้เป็น pattern ในอนาคต

## Validation และ Definition of Done

- [x] เอกสารและขอบเขตได้รับการยืนยัน
- [x] Migration check และ rollback notes ผ่าน
- [x] Unit tests: workbook parser, normalization, duplicate, group conflict, status และ stale data
- [ ] API tests: unauthenticated/forbidden, preview no-write, atomic commit และ history scope
- [x] Export/template round-trip test
- [x] ESLint, automated tests และ production build ผ่าน
- [x] Desktop/Mobile และ Light/Dark ผ่าน
- [ ] Keyboard, focus, loading, empty, error และ success states ผ่าน
- [ ] Preview ตารางกว้างไม่มีเนื้อหาทับ footer หรือ horizontal overflow ที่ผิดตำแหน่ง
- [ ] ไฟล์ตัวอย่าง Before/After และ error workbook ถูกบันทึก
- [x] Permission action inventory อัปเดต
- [ ] ผู้ใช้ตรวจและยืนยัน
- [ ] Commit, Push, PR และ CI สำเร็จ

บันทึก QA วันที่ 2026-07-19:

- Automated tests ผ่าน 351/351 และ Production build ผ่านด้วย Next.js 16.2.7
- ตรวจภาพจริง Desktop/Mobile และ Light/Dark แล้ว ไม่พบ page-level horizontal overflow หรือ bottom navigation ทับ action
- แก้ Empty state ของประวัติจากปุ่มไม่มีชื่อเป็นปุ่ม `ตรวจอีกครั้ง` ที่มี accessible name
- การทดสอบ Preview/Commit แบบ end-to-end กับข้อมูลจริงยังรอ environment ที่เชื่อม Supabase; ห้ามใช้ข้อมูล Production เพื่อทดสอบโดยไม่ได้รับอนุญาตเฉพาะครั้ง

## Known risks / งานที่ต้องเฝ้าระวัง

- `product_types` เก็บชื่อหมวดหลักซ้ำทุกหมวดรอง จึงต้อง Commit การเปลี่ยนชื่อเป็นกลุ่มเดียว
- Timeline Template ปัจจุบันอยู่ในโค้ด `src/lib/pm/templates.js`; Phase 3 ต้องรักษารหัสที่ระบบนี้อ้างอิง
- Preview ที่อยู่นานเกินไปอาจ stale ต้องมีอายุและตรวจซ้ำก่อน Commit
- Import จำนวนมากสร้าง Audit noise ได้ จึงใช้ batch summary + row evidence แยกกัน
