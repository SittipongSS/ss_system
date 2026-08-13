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

### ลงมือแล้ว — ใบเสนอราคาเลือกภาษาได้ (IS-26080005 · 2026-08-12) · เสร็จสมบูรณ์

ผู้แจ้ง: AE ต้องการใบเสนอราคาภาษาอังกฤษสำหรับลูกค้าต่างชาติ · ทำ **ระดับ 1 เท่านั้น**

| เรื่อง | ที่ตัดสิน |
|---|---|
| เก็บที่ไหน | `quotations.docLanguage` (`'th' \| 'en'` · NOT NULL DEFAULT `'th'`, mig 0238) — ภาษาผูกกับ **ใบ** ไม่ใช่คนที่กดพิมพ์ ใบที่ส่งไปแล้วจึงพิมพ์ซ้ำได้เหมือนเดิม |
| แปลอะไร | **ป้ายบนกระดาษเท่านั้น** — พจนานุกรมคู่ Th/En อยู่ที่ `lib/sales/quotationMasterTemplate.js` (`quotationDocLabels`) ที่เดียว |
| ไม่แปลอะไร | ข้อความที่คนกรอก (ชื่อลูกค้า ที่อยู่ ชื่อสินค้า เงื่อนไขชำระ หมายเหตุ) — ลูกค้าต่างชาติกรอกเป็นอังกฤษมาแต่ต้นอยู่แล้ว การเพิ่มคอลัมน์ En ที่ไม่มีใครกรอกคือหนี้ที่จ่ายเปล่า |
| **หน่วยขาย — แปลด้วย** (เพิ่ม 2026-08-13 · IS-26080025) | เดิมตกไปอยู่ฝั่ง "ค่าที่คนกรอก" ⇒ ใบอังกฤษได้ `10 ชิ้น` ปนกลางตารางที่เหลือเป็นอังกฤษหมด · **หน่วยไม่ใช่ข้อความอิสระ** มันมาจากลิสต์ปิดที่ `lib/master/units.js` เป็นเจ้าของ จึงแปลได้โดยไม่ต้องให้ใครกรอกเพิ่ม (`SALE_UNIT_EN` + `saleUnitLabel`) · **ค่าใน DB ยังเป็นคำไทยเสมอ** แปลตอนเรนเดอร์เท่านั้น ไม่มี migration ไม่แตะแถวเก่า ฉบับตรึงยังเล่นไฟล์เดิม · หน่วยนอกลิสต์ (`โหล`/`แพ็ค`) พิมพ์ตามเดิม **ไม่เดาคำแปล** — ผิดบนเอกสารลูกค้าแย่กว่าไทยปนอังกฤษ |
| ข้อมูลบริษัท | ใช้ `organization_settings.legalNameEn` / `registeredAddressEn` (mig 0120) ที่มีอยู่แล้ว · ยังไม่กรอก → ถอยไปใช้ไทย ดีกว่าเว้นว่าง · **ชื่อไทยยังอยู่บนใบอังกฤษเป็นบรรทัดรอง** เพราะเป็นนิติบุคคลไทย |
| หน้าจอระบบ | **ยังเป็นไทยล้วน** — คนใช้ระบบเป็นคนไทยทั้งหมด สองภาษาเฉพาะเอกสารที่พิมพ์ออกไป |
| สวิตช์ | **อยู่ที่แถบเครื่องมือของหน้าพรีวิว/พิมพ์ ไม่ใช่ในฟอร์ม** (มติผู้ใช้ 2026-08-12 รอบสอง — ดูหมายเหตุใต้ตาราง) · กดแล้วสลับมุมมองทันที **และบันทึกกลับลงใบ** · ล็อกด้วย `isEditableQuotation` ตัวเดียวกับช่องเนื้อหาอื่น — ยื่น/อนุมัติ/รับแล้วเหลือแค่ป้ายบอกภาษา ต้องออก Rev. |
| ฉบับตรึง | reprint เล่น artifact HTML ที่อบภาษาไว้แล้ว จึงเปลี่ยนตามค่าปัจจุบันไม่ได้อยู่แล้ว · แต่ `resolvedPayload.document.docLanguage` + `issued_documents.locale` (`th-TH` / `en-US`) ต้องบันทึกภาษาจริง ไม่งั้นทะเบียนเอกสารที่ออกจริงโกหก · layout version → `quote-master-v4.3` |
| ⛔ ห้าม | เอา `docLanguage` ไปใส่ `quotationApprovalContent` — `approvalFingerprint` ของใบที่อนุมัติแล้วทุกใบบน prod ถูกเก็บไว้และเทียบกับค่าที่คำนวณสดตอนกด "ส่งลูกค้า" เพิ่มคีย์ = ส่งใบไม่ได้ทั้งระบบ |

**ทำไมสวิตช์ย้ายไปหน้าพรีวิว (มติผู้ใช้ 2026-08-12 รอบสอง)** — รอบแรกวางเป็นแผ่นเลือกที่การ์ด
"หัวใบ" ของฟอร์ม · ผู้ใช้ทักว่าจุดที่คนคิดถึงภาษาคือ **ตอนกำลังจะส่งเอกสาร** ไม่ใช่ตอนกรอกหัวใบ
และในฟอร์มก็ไม่เห็นผลจนกว่าจะกดพิมพ์ · ย้ายไปแถบเครื่องมือของหน้าพรีวิวแล้ว **ถอดช่องในฟอร์มทิ้ง**
(สองที่เมื่อไรก็เพี้ยนหากันเมื่อนั้น — กฎเดียวกับ AGENTS.md เรื่องฟอร์มสร้าง/แก้)

ที่ตัดสินระหว่างทาง:

- **สวิตช์ต้องบันทึก ไม่ใช่สลับมุมมองเฉย ๆ** — สลับเฉย ๆ แปลว่าพิมพ์ครั้งหน้าเด้งกลับไทย
  ต้องจำเองทุกครั้งว่าลูกค้ารายไหนเป็นต่างชาติ · และตอนอนุมัติจะตอบไม่ได้ว่า artifact
  ที่ตรึงต้องเป็นภาษาอะไร (ตรึงได้ไฟล์เดียว ภาษาเดียว) ⇒ **ยังต้องมี `docLanguage` เก็บอยู่กับใบ**
- **ฝังสองภาษาไว้ในไฟล์เดียวแล้วซ่อนด้วย CSS** ไม่ใช่เรนเดอร์ใหม่ตอนกด — หน้าต่างพิมพ์ถูกตัด
  `opener` ทิ้งด้วยเหตุผลความปลอดภัย จึงเรียกกลับไปหาหน้าหลักไม่ได้ · ต้นทุนจริงวัดแล้ว
  +7KB จาก 177KB (ฟอนต์ที่ฝังอยู่แล้วใช้ร่วมกันทั้งสองภาษา)
- **บันทึกไม่สำเร็จต้องขึ้นข้อความสีแดง** ไม่กลืนเงียบ — ไม่งั้นคนพิมพ์ใบอังกฤษส่งลูกค้าไปแล้ว
  เข้าใจว่าระบบจำให้ พอกลับมาพิมพ์ใหม่กลายเป็นไทยโดยไม่เคยมีอะไรเตือน
- 🐞 ข้อความแจ้งผลต้องอยู่ **แถวล่างของแถบ** — รอบแรกวางแถวเดียวกับปุ่ม พอข้อความยาว
  มันบีบจนป้ายปุ่มโดนตัดกลางคำและปุ่มพิมพ์ตกบรรทัด (เห็นตอนทดสอบเคสบันทึกไม่สำเร็จ)

**ระดับ 2 (ยังไม่ทำ — รอผู้แจ้งลองใช้จริงก่อน):** `customers.nameEn` + ที่อยู่อังกฤษ
(⚠️ ที่อยู่เป็นลิสต์ตั้งแต่ mig 0202 → ต้องเพิ่มคู่อังกฤษ **ต่อรายการที่อยู่** ไม่ใช่ต่อลูกค้า)
และชุด commercial preset ภาษาอังกฤษ · ระดับ 1 ให้แก้ข้อความบนใบเองไปก่อน

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

## Commercial preset requirements

ยืนยันเมื่อ 19 กรกฎาคม 2026 ว่าแต่ละทีมและแต่ละประเภทดีลใช้วิธีชำระเงิน,
โครงงวด และหมายเหตุไม่เหมือนกัน จึงต้องมี Commercial Preset แยกจาก
Workflow/Timeline Template

สถานะปัจจุบัน:

- `quote_note_templates` แยกได้ตาม `serviceType` แต่ยังไม่มี team scope หรือ version lifecycle
- `quotations.paymentPlan` เก็บงวดชำระแบบ snapshot ต่อใบ แต่ยังไม่มี Preset กลางให้เลือก
- Quotation และ Sales Order แสดงตารางงวดเมื่อ `paymentPlan.type = installment` แล้ว
- ตารางปัจจุบันมีงวด, รายละเอียด, เปอร์เซ็นต์และจำนวนเงิน แต่ยังไม่มี due rule/date แบบโครงสร้าง

ขอบเขตเป้าหมายของ Commercial Preset:

- Match ด้วยชนิดเอกสาร, ทีม, ประเภทดีล และประเภทบริการ
- fallback จาก exact match ไป team default แล้วจบที่ general default
- เก็บวิธีชำระเงิน, ข้อความเงื่อนไข, หมายเหตุ และรายการงวด
- รายการงวดรองรับชื่อ, เปอร์เซ็นต์, trigger/เงื่อนไขครบกำหนด, due offset/date rule และหมายเหตุ
- จำนวนเงินคำนวณจากยอดรวมของเอกสาร ไม่เก็บยอดคงที่ใน Preset
- เลือก Preset ตอนสร้างใบและแก้เฉพาะใบได้ก่อนอนุมัติ
- Snapshot เนื้อหา, calculated rows และ Preset version ลงเอกสารที่ออกจริง
- Published Preset ใหม่ไม่มีผลย้อนหลังกับเอกสารที่อนุมัติแล้ว
- Sales Supervisor และ Admin จัดการชั่วคราวจนถึง Permission Phase 8–9

การแบ่งเฟส:

- Phase 6 ออกแบบ Quotation Master Template และตารางงวดสำหรับหนึ่งงวด, หลายงวด,
  ข้อความยาว, หลายหน้า, สีและขาวดำ
- Phase 7 สร้าง versioned Commercial Preset, selector/fallback, snapshot และ Document Engine integration
- Phase 4B ไม่แก้ Commercial Preset หรือ Production Document Template

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
