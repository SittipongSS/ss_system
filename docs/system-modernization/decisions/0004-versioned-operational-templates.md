# Decision 0004 — Versioned Operational Templates and Commercial Content Boundary

วันที่: 19 กรกฎาคม 2026
สถานะ: ยืนยันเพื่อเริ่ม Phase 4B

## บริบท

Workflow/Timeline Template ปัจจุบันเป็นค่าคงที่ใน `webapp/src/lib/pm/templates.js` และถูกใช้สร้างหรือ resync task ของโครงการ ขณะเดียวกันระบบใบเสนอราคามี `quote_note_templates` แยกตาม `serviceType` และมี `paymentPlan` ต่อใบ แต่ยังไม่มี Commercial Preset แบบแยกทีมและประเภทดีล

ทั้งสองเรื่องเรียกว่า Template เหมือนกัน แต่มี lifecycle และผลกระทบต่างกัน:

- Operational Template สร้าง task, dependency และกำหนดเวลาโครงการ
- Commercial Content Template สร้างข้อความ เงื่อนไข และงวดชำระที่ถูก snapshot ลงเอกสาร

## การตัดสินใจ

### ขอบเขต Phase 4B

- Phase 4B จัดการเฉพาะ Workflow/Timeline Operational Template
- ใช้ Draft, Published และ Archived พร้อม immutable history
- Template version ต้องถูก pin กับ project/deal segment และ task ที่สร้างแล้ว
- Published ใหม่ไม่มีผลย้อนหลังกับ task เดิม
- Existing project ไม่ถูก rebuild ระหว่าง Migration
- NPD รุ่นเก่ายังคง legacy compatibility path เพื่อกันข้อมูลสูญหาย

### Commercial Preset

- ไม่รวม Commercial Preset ใน Phase 4B
- Phase 6 กำหนด visual/layout ของ Notes, Payment Terms และตารางงวดชำระใน Quotation Master Template
- Phase 7 สร้าง versioned Commercial Preset และเชื่อม Document Engine
- Preset ต้องรองรับทีม, ประเภทดีล, ประเภทบริการ และชนิดเอกสาร พร้อม fallback ที่กำหนดได้
- ใบเอกสารต้อง snapshot preset content และ version ที่เลือก เพื่อไม่เปลี่ยนย้อนหลัง
- ผู้ใช้แก้ข้อความหรืองวดเฉพาะใบได้ก่อนอนุมัติ โดยไม่แก้ Preset ต้นทาง

### Permission

- Operational Template ใช้ Admin `master:manage` ชั่วคราว
- Commercial Preset ใช้ Sales Supervisor ตามสิทธิ์ review เดิมร่วมกับ Admin จนถึง Phase 8–9
- ยังไม่สร้าง capability ใหม่ใน Phase 4B

## เหตุผล

- การรวม Operational และ Commercial Template ใน Migration/API ชุดเดียวเพิ่ม blast radius โดยไม่จำเป็น
- Operational Template เปลี่ยนโครงสร้างโครงการ ส่วน Commercial Preset เปลี่ยนเนื้อหาเอกสารและต้องผ่าน Document Design gate
- การแยกเฟสทำให้ทดสอบ no-retroactive-change และ rollback ของแต่ละ domain ได้ชัดเจน
- requirement เรื่องทีม/ประเภทดีลถูกบันทึกตั้งแต่ตอนนี้ จึงไม่สูญหายแม้ implementation อยู่ Phase 7

## ผลตามมา

- Phase 4B ไม่แก้ `quote_note_templates`, `paymentPlan`, `quotePrint.js` หรือ `salesOrderPrint.js`
- Static Workflow Template จะถูกแทนด้วย server-side version resolver โดยยังมี rollback path
- Phase 6 ต้องมี mockup/test case ของตารางงวดหลายรูปแบบ
- Phase 7 ต้องออกแบบ migration จาก Note Template เดิมไป Commercial Preset โดยรักษาใบเสนอราคาเก่า
