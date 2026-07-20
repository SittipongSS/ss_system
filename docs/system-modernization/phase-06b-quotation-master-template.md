# Phase 6B — Quotation Master Template

สถานะ: เสร็จสมบูรณ์

เริ่ม: 20 กรกฎาคม 2026

เป้าหมาย: สร้าง Quotation Master Template V2 ที่ตรวจได้ด้วยข้อมูลตัวอย่างหลายสถานการณ์ โดยไม่เปลี่ยน Production Print Template ก่อน Document Engine และ immutable snapshot ใน Phase 7

## ขอบเขตที่ยืนยันแล้ว

- ใช้แนวทาง `Balanced Controlled`: Direction C เป็นโครงหลักและยกความชัดของ controlled metadata จาก Direction A
- ไทยเป็นภาษาหลัก อังกฤษเป็นคำรองเฉพาะหัวข้อสำคัญ
- ใช้ IBM Plex Sans Thai และกำหนด type scale สำหรับ A4 โดยเฉพาะ
- แสดง controlled form line เป็น `FM-SA-01: Rev. No.00. 08/05/2568` ตรงทุกอักขระ
- ใช้ document accent token แยกตามชนิดเอกสาร; Phase นี้ยืนยัน Quotation ก่อนและเตรียม contract สำหรับเอกสารอื่น
- สร้างหน้า Preview ใน Settings โดยใช้ shared UI/token ของระบบและไม่เขียนข้อมูลจริง
- Preview ต้องรองรับหนึ่งรายการ, ตารางเต็มหน้า, หลายหน้า, ชื่อลูกค้า/ที่อยู่ยาว, หมายเหตุยาว, มี/ไม่มีส่วนลด, หนึ่งงวด/หลายงวด, Draft/Approved/Cancelled และมี/ไม่มีลายเซ็น
- ตรวจ A4, Save as PDF, สีและขาวดำ รวมถึงหน้า Preview บน Desktop/Mobile และ Light/Dark
- แยก Master Template V2 ออกจาก `quotePrint.js`; Production ยังใช้ engine เดิมตลอด Phase 6B

## ไม่รวมใน Phase 6B

- แทน Production `quotePrint.js` หรือ `salesOrderPrint.js`
- Versioned Commercial Preset, team/deal/service matching และ fallback
- Pin Company Data, Document Standard, Layout Template, locale หรือ data snapshot ลง issued document
- Issued PDF storage และ reprint engine
- Sale Order visual migration
- Permission redesign

รายการข้างต้นอยู่ Phase 7 ยกเว้น Permission ซึ่งอยู่ Phase 8–9

## Visual contract

### Typography

- ชื่อเอกสารไทย 18–20 pt / 700
- ชื่ออังกฤษรอง 9–10 pt / 500
- ชื่อบริษัท 10–11 pt / 600
- เนื้อหา 9.5–10 pt / 400
- หัวตาราง 8.5–9.5 pt / 600
- Controlled metadata 8–9 pt / 500
- ยอดรวมสุทธิ 11–13 pt / 700
- ตัวเลขเงินและปริมาณใช้ tabular figures

### Layout hierarchy

1. Brand และ controlled form metadata
2. ชื่อเอกสาร เลขที่เอกสาร และวันที่
3. ผู้ซื้อ/ผู้ขายและข้อมูลอ้างอิง
4. ตารางรายการ
5. สรุปยอด ส่วนลด และภาษี
6. ตารางงวดชำระ
7. วิธีชำระเงิน เงื่อนไข และหมายเหตุ
8. ลายเซ็นและ audit reference
9. Footer, form code และเลขหน้า

### Accent

- Accent เป็น presentation token ของ template ไม่ใช้สีสถานะ workflow
- Quotation ใช้ warm brand accent ที่ยังอ่านได้เมื่อพิมพ์ขาวดำ
- เอกสารชนิดอื่นต้องกำหนด accent key ของตนใน Phase 7 โดยไม่เปลี่ยน hierarchy หรือ semantics
- ข้อมูลสำคัญต้องไม่สื่อด้วยสีเพียงอย่างเดียว

## Test matrix

- Compact: 1 รายการ, ไม่มีส่วนลด, ชำระครั้งเดียว, ไม่มีลายเซ็น
- Standard: 3–6 รายการ, มีส่วนลด, 2 งวด, ลายเซ็นอนุมัติ
- Dense: รายการเต็มหนึ่งหน้า, ข้อความ wrap และเลขจำนวนมาก
- Multi-page: หลายหน้า, repeat table header, footer และ page number ถูกต้อง
- Long content: ลูกค้า/ที่อยู่/หมายเหตุ/เงื่อนไขยาว
- Installment: 1, 2 และ 4 งวด รวมเปอร์เซ็นต์และยอดครบ
- State: Draft watermark, Approved evidence และ Cancelled watermark
- Output: สี, grayscale และ Save as PDF

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยัน Phase 6B ก่อน sync/สร้าง branch/แก้ไฟล์
- [x] Sync `main`, สร้าง branch ใหม่ และไม่แก้/stage/delete `.agents/`
- [x] Phase document และ Decision 0009 ถูกสร้างก่อน implementation
- [x] Template model และ fixture scenarios มี automated tests
- [x] หน้า Preview แบบ static fixture สลับ scenario/state/color ได้โดยไม่อ่านหรือเขียนข้อมูลจริง
- [x] A4 สี/ขาวดำและ multi-page browser preview ผ่าน visual QA
- [ ] Save as PDF ผ่าน UAT ใน Chrome โดยหัวตาราง, footer และเลขหน้าครบ
- [ ] Desktop/Mobile, Light/Dark, keyboard และ accessibility ผ่าน
- [x] Production `quotePrint.js`/`salesOrderPrint.js` ไม่มี behavior change
- [x] Permission inventory, roadmap และ validation log อัปเดต
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ PR

## Validation log

- 20 กรกฎาคม 2026 — automated test ทั้ง repository ผ่าน 423/423 รายการ
- 20 กรกฎาคม 2026 — targeted ESLint และ `npm run build` ผ่าน; route `/settings/document-standards/quotation-preview` ถูกสร้างสำเร็จ
- 20 กรกฎาคม 2026 — Chrome visual QA ผ่านสำหรับ Standard หนึ่งหน้า, Multi-page 27 รายการ/3 หน้า, footer `1 / 3` ถึง `3 / 3`, color/grayscale และ Draft/Approved signature evidence behavior
- 20 กรกฎาคม 2026 — หน้า Preview อยู่ใต้ gate `canManageDocumentStandards` เดิม และใช้ fixture เท่านั้น
- คงค้าง UAT: Save as PDF, Mobile viewport และ Light mode ก่อนอนุญาต Commit/Push/PR

## Rollback

- ลบ route หน้า Preview, fixture และ Master Template V2 ที่ยังไม่ถูก Production เรียกใช้
- คืน Settings card และเอกสารสถานะ
- ไม่มี migration และไม่มีข้อมูล Production ต้องย้อน

## Pagination hotfix validation — 20 กรกฎาคม 2026

- แก้เกณฑ์แบ่งหน้าสำหรับเอกสารที่มีส่วนสรุป/ตารางงวดชำระ เพื่อไม่ให้ส่วนท้ายเอกสารล้นลงมาทับ footer ของหน้าแรก
- กำหนดหน้ากระดาษ Print เป็น A4 `210mm × 297mm` และเพิ่ม `page-break-after` สำหรับ browser print engine รุ่นเดิม โดยยกเว้นหน้าสุดท้าย
- Automated test ยืนยันว่า Compact ยังอยู่หน้าเดียว ส่วน Standard และ 4 งวดแยกเป็น 2 หน้า รวมถึงตรวจ print CSS contract
- Browser QA ที่ viewport 1440 × 1000: Standard และ Installment มี 2 หน้า สูง 1,123 px เท่ากันทุกหน้า และไม่พบ final content ชน footer
- Responsive QA ที่ viewport 390 × 844: ไม่มี horizontal overflow และกระดาษใช้ความสูงตามเนื้อหาแทนการบังคับ A4 บนหน้าจอเล็ก
- `npm run build`, targeted test, ESLint และ `git diff --check` ผ่าน; Production `quotePrint.js`/`salesOrderPrint.js` และข้อมูลจริงไม่ถูกเปลี่ยน
- ยังคงต้องให้ผู้ใช้ UAT ผ่าน Print/Save as PDF จริงอีกครั้งใน PR ก่อนอนุญาต merge

## Minimal accent refinement — 20 กรกฎาคม 2026

- ผู้ใช้ยืนยันให้ลดการใช้ terracotta accent ใน Quotation Master V2 โดยคง accent ไว้เฉพาะชื่อเอกสารเพื่อรักษา document identity
- เปลี่ยนยอดรวมสุทธิจากแถบสีทึบเป็นพื้นกระดาษพร้อมเส้นและข้อความ navy; หัวตารางรายการยังคง navy เพื่อ contrast และลำดับการอ่าน
- เปลี่ยนขอบข้อมูลลูกค้า/ข้อมูลอ้างอิง, หัวตารางงวดชำระ, เงื่อนไข, signed surface และ watermark เป็น neutral/navy hierarchy
- รหัสสินค้า, ลายเซ็นอิเล็กทรอนิกส์ และ Evidence ใช้ navy/muted แทน accent เพื่อไม่ให้ข้อมูลรองแย่งจุดเด่นจากชื่อเอกสาร
- เพิ่ม CSS contract test เพื่อป้องกัน accent กระจายกลับไปยังส่วนตกแต่ง โดย Production `quotePrint.js` และข้อมูลจริงยังไม่เปลี่ยน
- Targeted Quotation Master test ผ่าน 9/9, automated test ทั้ง repository ผ่าน 437/437, `git diff --check` ผ่าน และ Next.js production build สำเร็จ
- Visual UAT ของ workspace ปัจจุบันรอผู้ใช้ล็อกอินที่ `localhost:3001`; ไม่ใช้ credential หรือข้าม authentication ระหว่าง validation

## V1/V2/V3 comparison and pagination refinement — 20 กรกฎาคม 2026

- เพิ่มตัวสลับ V1/V2/V3 ในหน้า Preview โดย V3 เป็นค่าเริ่มต้นและการสลับไม่เปลี่ยน scenario, document state หรือ color mode
- V1 เก็บ visual direction เดิม, V2 เป็น minimal accent และ V3 ใช้กล่องยอดรวม/เส้นกล่องข้อมูล/รหัสสินค้า/terms/signature แบบ V2 พร้อมเพิ่ม accent-soft เฉพาะหัวตารางงวดและใช้ accent โปร่งกับ watermark
- Footer ของทุกเวอร์ชันตัดคำว่า `เอกสารควบคุม` ออก เหลือเว็บไซต์, controlled form line และเลขหน้า
- ปรับ pagination ให้ Standard 4 รายการแบ่งเป็น 2 + 2 แทน 1 + 3 โดยยังคง Compact หน้าเดียวและ 4 งวดเป็น 3 + 2
- แต่ละ variant มี template identifier แยก `quotation-balanced-controlled-v1`, `-v2` และ `-v3`; งานนี้ยังเป็น Preview เท่านั้นและไม่เปลี่ยน Production Print authority
- Targeted Quotation Master tests ผ่าน 12/12 และ automated tests ทั้ง repository ผ่าน 440/440; `git diff --check` และ Next.js production build ผ่าน
- Browser QA ที่ 1440 × 1000 ยืนยัน Standard เป็น A4 สองหน้าสูง 1,123 px เท่ากัน, สินค้า 2 + 2, ไม่มี footer collision และไม่มี page-level horizontal overflow
- Responsive QA ที่ 390 × 844 ไม่มี horizontal overflow, กระดาษสูงตามเนื้อหา, segmented control V1/V2/V3 มี touch target 40 px และ footer ไม่มีคำว่า `เอกสารควบคุม`
- Visual contract ยืนยัน V1 ใช้ grand total/rail accent เดิม, V2 ใช้ white/navy/neutral และ V3 ใช้ item code navy, V2 totals/rails, accent-soft schedule header และ accent watermark โปร่ง 14%; grayscale filter ทำงาน

## Known risks

- Browser print engine อาจแบ่งหน้าไม่เหมือนกันตาม font readiness จึงต้องรอ `document.fonts.ready` ก่อน Print/PDF
- สี accent ต้องผ่าน grayscale; ห้ามใช้สีเป็นสัญญาณเดียว
- Preview fixture ไม่แทน real-data snapshot validation ซึ่งเป็น release gate ของ Phase 7
