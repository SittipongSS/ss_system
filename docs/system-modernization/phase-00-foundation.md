# Phase 0 — Requirements and Design Foundation

สถานะ: เสร็จสมบูรณ์

เริ่ม: 19 กรกฎาคม 2026
เป้าหมาย: ล็อกกฎและการตัดสินใจก่อนเปลี่ยน Product code

## ขอบเขต

Phase 0 สร้างแหล่งอ้างอิงกลางและเตรียมการตัดสินใจ ไม่เปลี่ยน UI, API,
Database หรือพฤติกรรม Production

งานในเฟสนี้:

- จัดทำ Roadmap และกติกาปิดเฟส
- จัดทำ UX/UI Rulebook สำหรับ Card, KPI, Graph, Table, Drawer, Modal และ Typography
- สำรวจกลุ่มเอกสารพิมพ์และกำหนดกรอบ Document Design System
- แยกสิ่งที่ตกลงแล้วออกจากเรื่องที่ยังรอการตัดสินใจ
- เริ่ม Permission action inventory โดยยังไม่รื้อ Permission
- กำหนด Test, UAT, Migration และ Rollback checklist กลาง

## สิ่งที่ตกลงแล้ว

- ใช้ Design System และ CSS token ที่มีอยู่ใน `webapp/src/app/globals.css`
- ไม่ติดตั้ง Material component library เพิ่ม
- หน้าเว็บใช้ภาษาไทยเป็นหลัก และใช้ IBM Plex Sans Thai
- ไม่มี Auto-save; การแก้ไขต้องมีปุ่มบันทึกและขั้นตอนยืนยัน
- รายละเอียดหรือแก้ไขรายการเดียวใช้ Drawer เป็น house pattern
- Import ที่ต้อง Preview ตารางกว้างใช้ Large Dialog หรือหน้าแยก
- Account, ข้อมูลหลัก, Admin Center และรายงานต้องมี ownership ชัดเจน
- หมวดสินค้าต้องมีทั้งเมนูจัดการและ Template สำหรับ Import/Export
- Document Template ต้องคุยและอนุมัติหน้าตาก่อนเริ่มสร้าง Engine
- Permission redesign ทำหลังฟังก์ชันทั้งหมดเสร็จ
- ทุกเฟสต้องมีบันทึกและผู้ใช้ยืนยันก่อนปิดเฟส

## เรื่องที่ยังต้องตัดสินใจ

| รหัส | เรื่อง | ข้อเสนอเริ่มต้น | สถานะ |
|---|---|---|---|
| D-001 | ผู้ดูแลหมวดสินค้าในอนาคต | สร้าง capability เฉพาะตอนรื้อ Permission | รอคุยเฟส Permission |
| D-002 | Form code เช่น FM-SA-01 เป็นเอกสาร ISO จริงหรือไม่ | เป็นรหัส ISO ที่ใช้งานจริงและต้องเป็น controlled metadata | ยืนยันแล้ว |
| D-003 | บุคลิกเอกสาร | เก็บ A/B/C ไว้เปรียบเทียบและต้องเลือกก่อนแก้ Production Document Template | เลื่อนไปต้น Phase 6 |
| D-004 | ภาษาชื่อเอกสาร | ไทยเป็นหลัก อังกฤษเป็นรอง และเตรียมรองรับเอกสารสองภาษาในอนาคต | ยืนยันแล้ว |
| D-005 | ระดับลายเซ็น | Electronic signature image + audit evidence ในระยะแรก | ยืนยันแล้ว |
| D-006 | การเก็บเอกสารออกจริง | เก็บ PDF เฉพาะเอกสารสำคัญแบบนำร่อง แล้วประเมินจากการใช้งานจริง | ยืนยันหลักการ; รอรายการเอกสาร |
| D-007 | ผู้เผยแพร่ Template และข้อมูลบริษัท | ใช้ Admin เดิมชั่วคราว | รอเฟส Permission |
| D-008 | Master Template ใบแรก | ใช้ใบเสนอราคา | ยืนยันแล้ว |

## สิ่งที่ไม่ทำใน Phase 0

- ไม่แก้ Top bar หรือหน้า Account
- ไม่แก้ Schema หมวดสินค้า
- ไม่สร้าง Import/Export
- ไม่สร้าง Admin Center
- ไม่อัปโหลดลายเซ็น
- ไม่เปลี่ยน Template เอกสารจริง
- ไม่แก้ Role, Capability, RLS หรือ Permission model

## Deliverables

- [x] Roadmap และ Definition of Done
- [x] UX/UI Rulebook ฉบับเริ่มต้น
- [x] Document Design System brief ฉบับเริ่มต้น
- [x] Permission action inventory ฉบับเริ่มต้น
- [x] Release checklist ฉบับเริ่มต้น
- [x] ผู้ใช้ตรวจและตอบ D-002, D-004, D-005 และหลักการของ D-006
- [x] ผู้ใช้ยืนยันใบเสนอราคาเป็น Master Template
- [x] จัดทำ Visual Direction Prototype ของใบเสนอราคา 3 แนวทาง
- [x] Render เป็น PDF A4 และตรวจภาพสี/ขาวดำครบทั้ง 3 แนวทาง
- [x] บันทึกให้กลับมาเลือกทิศทาง D-003 ก่อนเริ่ม Production Document Template
- [ ] ระบุรายการเอกสารสำคัญสำหรับ PDF pilot จากข้อมูลการใช้งาน
- [x] ปรับเอกสารตามข้อสรุป
- [x] ผู้ใช้ยืนยันปิด Phase 0 และให้ดำเนินการเฟสถัดไป

## Phase closeout

เมื่อจบเฟสให้เติมข้อมูลต่อไปนี้:

- วันที่ปิดเฟส: 19 กรกฎาคม 2026
- PR: ติดตามใน Pull Request ของสาขา `codex/system-modernization-phase-00`
- Commit: ติดตามจาก Git history ของ Pull Request
- ผล CI: รอตรวจใน Pull Request
- ผู้ยืนยัน: ผู้ใช้เจ้าของระบบ
- เรื่องที่ย้ายไปเฟสถัดไป: เลือก Visual direction ที่ต้น Phase 6; ระบุ PDF pilot หลังสำรวจการใช้งานจริง
- Known issues: Prototype PDF ใช้ Tahoma ชั่วคราว; Production ต้อง self-host IBM Plex Sans Thai
