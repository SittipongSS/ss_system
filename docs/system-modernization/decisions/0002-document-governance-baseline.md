# Decision 0002 — Document Governance Baseline

วันที่: 19 กรกฎาคม 2026
สถานะ: Accepted; Visual direction deferred to Phase 6 gate

## บริบท

Document Design System ต้องรักษามาตรฐาน ISO, รองรับภาษาในอนาคต,
ผูกหลักฐานการลงนาม และไม่ทำให้เอกสารเก่าเปลี่ยนย้อนหลัง ขณะเดียวกัน
ยังต้องทดลองการใช้งานจริงก่อนลงทุนเก็บ PDF ของเอกสารทุกชนิด

## การตัดสินใจ

### ISO form metadata

- `FM-SA-01` และ `FM-SA-03` เป็นรหัสเอกสาร ISO ที่ใช้งานจริง
- Form code, Revision และ Effective date เป็น controlled metadata
- การเปลี่ยน metadata ต้องเกิดผ่าน Template version ใหม่และมี Audit
- เอกสารที่ออกแล้วต้องอ้างอิง metadata เวอร์ชันเดิม

### Language

- ระยะแรกใช้ภาษาไทยเป็นหลัก ภาษาอังกฤษเป็นรอง
- ออกแบบ Layout และ Content model ให้รองรับเอกสารสองภาษาในอนาคต
- ไม่สร้าง Layout ภาษาไทยและอังกฤษแยกกัน
- เอกสารออกจริงต้องบันทึก locale ที่ใช้

### Signature

- ระยะแรกใช้ภาพลายเซ็นอิเล็กทรอนิกส์ร่วมกับ Audit evidence
- หลักฐานต้องประกอบด้วยผู้ลงนาม, เวลา, signature version,
  document fingerprint และ template version
- Certificate-based digital signature/PKI ยังไม่อยู่ในขอบเขตเริ่มต้น

### Issued PDF

- เก็บ PDF ฉบับออกจริงเฉพาะเอกสารสำคัญแบบนำร่อง
- สำรวจ Workflow, จำนวนการพิมพ์/ดาวน์โหลด และความต้องการ Reprint ก่อนกำหนดรายการถาวร
- เอกสารที่ยังไม่เก็บ PDF ต้องมี data snapshot และ version references เพียงพอสำหรับ Re-render

### Master template

- ใช้ใบเสนอราคาเป็น Master Template ใบแรก
- ทำ Visual direction เปรียบเทียบ 2–3 แนวทางก่อนแก้ shared print engine
- เมื่อใบเสนอราคาได้รับอนุมัติ จึงนำโครงสร้างไปใช้กับ Sales Order และเอกสารกลุ่มอื่น

## เรื่องที่ยังไม่ตัดสินใจ

- บุคลิกหน้าตาเอกสารระหว่าง Modern Controlled Document, Premium Brand emphasis
  หรือแนวทางผสม โดยต้องเลือกที่ต้น Phase 6 ก่อนแก้ Production Template
- รายการเอกสารที่เข้า PDF pilot

การเลื่อนเรื่องหน้าตาไม่อนุญาตให้ Production Template ใช้แบบ C เป็นค่าเริ่มต้นโดยปริยาย
A/B/C เป็น Prototype สำหรับการตัดสินใจเท่านั้น

## ผลต่อการออกแบบและพัฒนา

- Document engine ต้องแยก Layout, localized content และ controlled metadata
- Admin UI ในอนาคตต้องไม่เปิดให้แก้ Form code/Revision แบบข้อมูลทั่วไป
- Approval record ต้องรองรับ signature evidence และ immutable version references
- Mockup ใบเสนอราคาต้องแสดงลำดับภาษาและผลเมื่อพิมพ์ขาวดำ
- การตัดสินใจเรื่องหน้าตาจะทำจากตัวอย่างเปรียบเทียบ ไม่เลือกจากคำอธิบายเพียงอย่างเดียว
