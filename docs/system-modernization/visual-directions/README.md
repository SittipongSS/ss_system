# Quotation Visual Direction Brief

สถานะ: Prototype สำหรับเลือกทิศทาง ไม่ใช่ Production Template
วันที่: 19 กรกฎาคม 2026

## เป้าหมาย

เปรียบเทียบภาษาภาพของใบเสนอราคา `FM-SA-01` ด้วยข้อมูลชุดเดียวกัน
ก่อนสร้าง Document engine หรือแก้ `quotePrint.js`

เปิด Prototype แบบ Interactive:

- [quotation-directions.html](./quotation-directions.html)
- ปุ่ม `ดูขาวดำ` ใช้ตรวจว่าลำดับข้อมูลยังอ่านได้เมื่อไม่มีสี
- ปุ่ม `พิมพ์ทั้ง 3 แบบ` ใช้เทียบ A4 จาก Browser เดียวกัน

ไฟล์ Review ที่ Render แล้ว:

- [PDF A4 ทั้ง 3 แนวทาง](../../../output/pdf/quotation-visual-directions.pdf)
- [A — Controlled ISO](./renders/quotation-direction-1.png)
- [B — Premium Brand](./renders/quotation-direction-2.png)
- [C — Balanced System](./renders/quotation-direction-3.png)
- [A — ขาวดำ](./renders/grayscale/quotation-direction-1-gray.png)
- [B — ขาวดำ](./renders/grayscale/quotation-direction-2-gray.png)
- [C — ขาวดำ](./renders/grayscale/quotation-direction-3-gray.png)

> หมายเหตุ: PDF Prototype ใช้ Tahoma ซึ่งมีในเครื่องเป็น fallback สำหรับตรวจ Layout
> เท่านั้น Production ต้อง self-host IBM Plex Sans Thai และรอ `document.fonts.ready`
> ก่อนพิมพ์ตามข้อกำหนด Document Design System

## ตัวเลือก

| เกณฑ์ | A — Controlled ISO | B — Premium Brand | C — Balanced System |
|---|---:|---:|---:|
| ความเป็นทางการ/ตรวจสอบง่าย | สูงมาก | ปานกลาง | สูง |
| บุคลิกแบรนด์ | ต่ำ | สูงมาก | สูง |
| รองรับข้อมูลหนาแน่น | สูงมาก | ปานกลาง | สูง |
| ความทนเมื่อพิมพ์ขาวดำ | สูงมาก | ปานกลาง | สูง |
| เหมาะเป็นฐานเอกสารหลายชนิด | สูง | ปานกลาง | สูงมาก |

## A — Controlled ISO

ลักษณะ:

- Grid ชัดและจัดข้อมูลแบบเอกสารควบคุม
- Form code, Revision, วันที่มีผล และเลขเอกสารเด่น
- ใช้สีเพียงเส้น Accent และข้อความบางส่วน
- ตารางใช้กรอบเต็ม อ่านและตรวจยอดง่าย

เหมาะกับ:

- เอกสารภายใน
- เอกสารที่ตรวจ ISO บ่อย
- เอกสารที่ต้องพิมพ์ขาวดำเป็นหลัก

ข้อจำกัด:

- บุคลิกแบรนด์น้อย
- อาจให้ความรู้สึกเหมือนแบบฟอร์มมากกว่าเอกสารเสนอขาย

## B — Premium Brand

ลักษณะ:

- ใช้พื้นที่ว่างและ Header แบรนด์มากขึ้น
- ตารางลดเส้นแนวตั้งและใช้ Navy header
- ยอดรวมและเงื่อนไขดูเหมือนเอกสารเสนอขายระดับ Premium
- ช่องลงนามโปร่งและเบากว่า

เหมาะกับ:

- เอกสารส่งลูกค้า
- งานที่ภาพลักษณ์และ Brand impression สำคัญ

ข้อจำกัด:

- ข้อมูลหนาแน่นอาจกินหลายหน้าเร็วขึ้น
- ต้องตรวจขาวดำและเครื่องพิมพ์คุณภาพต่ำมากกว่าแบบอื่น
- ไม่ควรนำองค์ประกอบตกแต่งไปใช้กับรายงานทุกชนิด

## C — Balanced System (แนะนำ)

ลักษณะ:

- ใช้โครงสร้างและความตรวจสอบง่ายของแบบ A
- เพิ่มลำดับภาพและบุคลิกแบรนด์จากแบบ B อย่างจำกัด
- Form metadata ยังชัด แต่ไม่แย่งชื่อเอกสารและข้อมูลลูกค้า
- ตารางอ่านง่าย มีเส้นเท่าที่จำเป็น และ Grand total เด่น
- กล่องลายเซ็นรองรับ Electronic evidence และลูกค้าเซ็นมือ

เหมาะกับ:

- เป็น Master Template ของใบเสนอราคา
- ขยายไป Sales Order และเอกสารกลุ่ม Commercial
- สร้าง shared components ที่เอกสารอื่นเลือก variant ได้

## คำแนะนำ

ใช้ C เป็นโครงหลัก แล้วเลือกความเข้มขององค์ประกอบต่อไปนี้ได้:

- Header และการวางโลโก้จาก B
- Controlled metadata และความชัดของตารางจาก A
- Totals, signature evidence และ Footer จาก C

การเลือกไม่จำเป็นต้องเลือกทั้งแบบ สามารถระบุว่า “ใช้ C แต่เอาตารางแบบ A”
หรือ “ใช้ C แต่ลดสี Header” ได้

## สิ่งที่ยังไม่ประเมินใน Prototype รอบนี้

- Pagination หลายหน้าจริง
- ข้อมูลภาษาอังกฤษเต็มฉบับ
- ฟ้อนต์ self-hosted
- Signature image จริง
- QR/verification page
- PDF snapshot และ Template version persistence

สิ่งเหล่านี้จะทำหลังเลือก Visual direction และก่อนเปลี่ยน Production Template

## Visual QA รอบแรก

- [x] A4 portrait ครบ 3 หน้า
- [x] โลโก้จริงแสดงครบ
- [x] ภาษาไทยแสดงครบ ไม่มี missing glyph
- [x] Header, ตาราง, Totals, Signature และ Footer ไม่ทับกัน
- [x] ตรวจภาพสี
- [x] ตรวจภาพขาวดำ
- [x] Form code, Revision และ Effective date แสดงในทุกแนวทาง
- [ ] ผู้ใช้เลือกแนวทางหรือระบุส่วนที่จะผสม

## Render ซ้ำ

สคริปต์ `render_visual_directions.py` สร้าง PDF สำหรับ Review โดยใช้ ReportLab และ
`svglib` จาก Runtime เครื่องมือ ไม่ใช่ Dependency ของ Production webapp
