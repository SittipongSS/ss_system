# Document Design System Brief

สถานะ: Draft สำหรับคุยก่อนสร้าง Mockup

## หลักการ

เอกสารต้องมี DNA ร่วมกับ SS System ผ่านโลโก้ สีแบรนด์ ฟ้อนต์ ลำดับข้อมูล
และภาษาของสถานะ แต่ไม่ยก Card, Shadow, Dark mode หรือ Interactive UI ลงกระดาษตรง ๆ

ข้อกำหนดพื้นฐาน:

- กระดาษพื้นขาวและอ่านได้เมื่อพิมพ์ขาวดำ
- ใช้สีกรมท่าเป็น brand anchor และ Terracotta เป็น accent อย่างจำกัด
- ชื่อและเนื้อหาเอกสารใช้ภาษาไทยเป็นหลัก ภาษาอังกฤษเป็นรอง
- โครงสร้าง Template ต้องเตรียมรองรับเอกสารภาษาไทยและอังกฤษแบบเลือกภาษาได้ในอนาคต
- เอกสารพิมพ์ไม่เปลี่ยนตาม Light/Dark theme
- `FM-SA-01`, `FM-SA-03` และรหัสแบบฟอร์มอื่นเป็นรหัส ISO ที่ใช้งานจริง
- รักษาข้อมูลทางกฎหมาย, Form code, Revision และวันที่มีผลเป็น controlled metadata
- เอกสารอนุมัติแล้วต้องไม่เปลี่ยนเมื่อข้อมูลบริษัท ลายเซ็น หรือ Template เปลี่ยน

## Language strategy

ระยะแรก:

- ภาษาไทยเป็นข้อความหลัก
- ภาษาอังกฤษเป็นคำรองสำหรับชื่อเอกสารและคำมาตรฐานที่จำเป็น
- หลีกเลี่ยงการผสมภาษาแบบไม่มีกฎใน Field label เดียวกัน

การเตรียมรองรับอนาคต:

- Layout เดียวกันต้อง render ได้จาก locale เช่น `th` และ `en` ไม่สร้าง Template คนละชุด
- Label, title, status และ legal clause แยกจาก Layout เป็น localized content
- ข้อมูลที่มาจากธุรกิจต้องระบุว่า Field ใดต้องมีฉบับแปล ไม่แปลข้อมูลลูกค้าอัตโนมัติ
- Pagination test ต้องรันแยกตามภาษา เพราะความยาวข้อความต่างกัน
- Template version เดียวกันต้องบันทึก locale ที่ใช้กับเอกสารออกจริง

## กลุ่มเอกสารปัจจุบัน

| กลุ่ม | เอกสาร | Orientation | แหล่งสร้างปัจจุบัน |
|---|---|---|---|
| Commercial | Quotation | A4 portrait | `webapp/src/lib/sales/quotePrint.js` |
| Commercial | Sales Order | A4 portrait | `webapp/src/lib/sales/salesOrderPrint.js` ใช้ Quote engine |
| Tax | Excise bill | A4 portrait | `webapp/src/lib/tax/billPrint.js` |
| Report | Tax report | A4 landscape | `webapp/src/lib/tax/reportPrint.js` |
| Operation | Project Timeline | A4 landscape | `webapp/src/lib/pm/ganttPrint.js` |

## ปัญหาที่พบ

- CSS ของเอกสารแยกหลายชุดและใช้ค่าซ้ำแบบ hard-coded
- Margin, Header, Table density, Signature และ Footer ยังไม่เป็นมาตรฐานเดียวกัน
- Form metadata ครอบคลุมบางเอกสารเท่านั้น
- ชื่อเอกสารและ Field label ผสมไทย/อังกฤษไม่สม่ำเสมอ
- Print window โหลด IBM Plex Sans Thai จาก Google Fonts แยกจากตัวแอป
- Font fallback อาจทำให้บรรทัดและจำนวนหน้าเปลี่ยน
- Tests ปัจจุบันตรวจ HTML และ Pagination เป็นหลัก ยังไม่มี visual/PDF regression ครบ

## Document anatomy ที่เสนอ

1. Brand and legal company header
2. Thai/English document title
3. Document number, date, status และ controlled-form metadata
4. Party/customer and reference information
5. Primary data table หรือ operational visualization
6. Totals/summary
7. Notes, payment terms หรือ legal clauses
8. Signature/approval evidence
9. Form code, revision, effective date, generated timestamp และ page number

หน้าต่อควรใช้ compact continuation header และไม่ซ้ำข้อมูลเต็มโดยไม่จำเป็น

## Template แบ่งเป็นสามชนิด

### Layout template

ควบคุม Header, Table, Totals, Signature และ Footer ผ่าน shared engine
ไม่เปิดให้ผู้ใช้แก้ HTML หรือลากวางอิสระในระยะแรก

### Content template

ข้อความที่ธุรกิจแก้ได้ เช่น หมายเหตุ เงื่อนไขการชำระเงิน เงื่อนไขส่งมอบ
และข้อความท้ายเอกสาร

### Form configuration

การเปิด/ปิด Field, ชื่อเอกสาร, บทบาทผู้ลงนาม, Form code, Revision
และ Effective date ภายในขอบเขตที่ระบบอนุญาต

## Typography ที่เสนอ

- IBM Plex Sans Thai สำหรับเนื้อหา
- Tabular figures สำหรับเงินและปริมาณ
- Mono ใช้เฉพาะรหัสเมื่อจำเป็น
- Title ภาษาไทย 18–20pt
- English subtitle 9–10pt
- Company name 10–11pt
- Body 9.5–10pt
- Table header 8.5–9.5pt
- Metadata 8–9pt
- Grand total 11–13pt

ก่อนเปิดการพิมพ์ต้องรอ `document.fonts.ready` และควรให้ฟ้อนต์มาจากระบบเดียวกัน
เพื่อลดความแตกต่างระหว่างเครื่อง

## Signature variants

- Internal electronic signature: ภาพลายเซ็น, ชื่อ, บทบาท, เวลา, signature version และ verification data
- External manual signature: พื้นที่ลงชื่อ, ชื่อ, ตำแหน่ง และวันที่
- Multi-department approval: ลำดับผู้รับรองหลายฝ่ายและอาจใช้หน้ารับรองแยก

ภาพลายเซ็นไม่ใช่หลักฐานเพียงอย่างเดียว ต้องผูก Audit, User, Timestamp,
Document fingerprint และ Template version

ระยะแรกยืนยันให้ใช้ภาพลายเซ็นอิเล็กทรอนิกส์ร่วมกับ Audit evidence
ยังไม่รวม Certificate-based digital signature หรือ PKI ในขอบเขตเริ่มต้น

## Versioning ที่เสนอ

- Template มี Draft, Published และ Archived
- ข้อมูลบริษัทและ Form metadata มีเวอร์ชัน
- เอกสารที่ออกจริงบันทึก company version, template version, signature version และ data snapshot
- เอกสารสำคัญเก็บ PDF ฉบับที่ออกจริงแบบนำร่อง
- รายการเอกสารที่เข้า PDF pilot ต้องพิจารณาจาก Workflow และการใช้งานจริงก่อนล็อก
- Template ใหม่ไม่มีผลย้อนหลังกับเอกสารอนุมัติแล้ว

## Mockup gate

ยืนยันให้ใช้ใบเสนอราคาเป็น Master Template และทำอย่างน้อย 2–3 แนวทาง
เพื่อช่วยเลือกทิศทางหน้าตาก่อนแก้ Engine จริง

Visual Direction Prototype รอบแรก:

- [Quotation Visual Direction Brief](./visual-directions/README.md)
- [Interactive A4 comparison](./visual-directions/quotation-directions.html)
- [Rendered A4 PDF](../../output/pdf/quotation-visual-directions.pdf)

Test cases ของ Mockup:

- หนึ่งรายการ
- ตารางเต็มหนึ่งหน้า
- หลายหน้า
- ชื่อลูกค้าและที่อยู่ยาว
- หมายเหตุและเงื่อนไขยาว
- มีและไม่มีส่วนลด
- Draft/Approved/Cancelled
- มีและไม่มีลายเซ็น
- Print สีและขาวดำ
- Save as PDF

## คำตัดสินที่ยังรอ

- [x] Form code/Revision เป็น controlled ISO document จริง
- [ ] เลือก A/B/C หรือส่วนผสมที่ต้น Phase 6 ก่อนแก้ Production Document Template
- [x] ใช้ภาษาไทยเป็นหลัก ภาษาอังกฤษเป็นรอง และเตรียมรองรับสองภาษาในอนาคต
- [x] ใช้ภาพลายเซ็นอิเล็กทรอนิกส์ร่วมกับ Audit evidence ในระยะแรก
- [x] เก็บ PDF เฉพาะเอกสารสำคัญแบบนำร่องและประเมินการใช้งานก่อนขยาย
- [ ] ระบุรายการเอกสารที่เข้า PDF pilot หลังสำรวจการใช้งานจริง
- [x] ใช้ใบเสนอราคาเป็น Master Template ใบแรก

การยังไม่เลือก Visual direction ไม่ขวาง Phase 1-5 เพราะไม่มีเฟสใดแก้ Production
Document Template การตัดสินใจนี้เป็น Gate บังคับที่ต้น Phase 6
