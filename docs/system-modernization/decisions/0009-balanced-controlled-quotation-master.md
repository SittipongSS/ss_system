# Decision 0009 — Balanced Controlled Quotation Master

วันที่: 20 กรกฎาคม 2026

สถานะ: Accepted for Phase 6B

## บริบท

Phase 6B ต้องเลือกทิศทางจาก Prototype A/B/C ก่อนสร้าง Master Template ที่จะเป็นต้นแบบของ Production Document Engine ใน Phase 7 ผู้ใช้ต้องการรูปแบบใกล้เคียง Visual Direction PDF, ให้ควบคุมฟอนต์และขนาดอย่างจริงจัง และให้ accent แตกต่างตามชนิดเอกสาร โดย controlled form metadata ต้องถูกต้องตาม ISO

## การตัดสินใจ

- เลือก Direction C — Balanced System เป็นโครงสร้างหลัก
- นำความเด่นชัดของ form code, revision, effective date และ document identity จาก Direction A มาใช้
- ไม่ใช้การเน้นแบรนด์แบบ Direction B จนทำให้ metadata หรือตารางธุรกิจเสียลำดับ
- เรียกแนวทางรวมว่า `Balanced Controlled`
- ใช้ IBM Plex Sans Thai พร้อม A4 type scale ที่ล็อกใน Phase document
- Accent เป็น template token แยกจาก workflow status และเตรียม mapping แยกตาม document key
- Quotation เป็น Master Template ใบแรก; เอกสารอื่นนำ structure ไปใช้หลังผู้ใช้อนุมัติแบบนี้
- Phase 6B ทำ isolated Preview เท่านั้น ส่วน Production replacement, version pinning และ snapshot อยู่ Phase 7

## เหตุผล

- Direction C ขยายไปหลายชนิดเอกสารและหลายหน้าได้ดีที่สุดโดยยังรักษาบุคลิกแบรนด์
- Direction A ช่วยให้ข้อมูล ISO ตรวจง่ายและพิมพ์ขาวดำชัด
- การแยก Preview จาก Production ป้องกันเอกสารเก่าเปลี่ยนย้อนหลังระหว่างที่ Document Engine ยังไม่มี immutable snapshot
- Accent token ทำให้เอกสารแต่ละชนิดแยกบุคลิกได้โดยไม่แตก shared layout

## ผลกระทบ

- Phase 6B ต้องมี scenario matrix และ rendered PDF ก่อนอนุมัติ
- `quotePrint.js` และ `salesOrderPrint.js` ยังเป็น Production authority
- Phase 7 ต้อง pin layout version, accent key, company/form/signature versions, locale และ data snapshot ก่อนสลับ consumer
- Commercial Preset ต้องเติม payment/remarks/installment content ลง model เดียวกันโดยไม่แก้ layout contract

## ทางเลือกที่ไม่เลือก

- Direction A ล้วน: ควบคุมเอกสารดีแต่แข็งเกินสำหรับเอกสารส่งลูกค้า
- Direction B ล้วน: บุคลิกพรีเมียมชัดแต่ controlled metadata และ grayscale เสี่ยงอ่อนลง
- แก้ Production Template ทันที: เสี่ยงทำให้ reprint เอกสารเดิมเปลี่ยนโดยไม่มี version snapshot
