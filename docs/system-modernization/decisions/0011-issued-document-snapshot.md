# Decision 0011 — Immutable Issued Document Snapshot Before Print Replacement

วันที่: 20 กรกฎาคม 2026
สถานะ: ร่างเพื่อเริ่ม Phase 7B (รอผู้ใช้ยืนยัน)

## บริบท

Production Print (`quotePrint.js`, `salesOrderPrint.js`) ยัง render จากข้อมูล live และดึง company data ตอนพิมพ์ ทำให้เอกสารที่ออกให้ลูกค้าไปแล้วเปลี่ยนตาม company/form/preset/signature/layout เวอร์ชันใหม่เมื่อ reprint Phase 6B ให้ Quotation Master V2 ใน Preview และ Phase 7A ให้ commercial preset แต่ทั้งสองยังไม่ผูก Production เพราะ Decision 0004/0010 กำหนดว่า issued snapshot ต้องมาก่อนการสลับ consumer

## การตัดสินใจ

- แยก Phase 7B เป็นโครงสร้าง issued document snapshot + immutable artifact โดย **ยังไม่แทน** Production Print และ **ยังไม่เปลี่ยน** ข้อมูลเดิม
- snapshot pin resolved payload + version pins (company, document standard, commercial preset, signature evidence, layout, locale) พร้อม `sha256` fingerprint ในธุรกรรมเดียว
- snapshot และ artifact immutable: database trigger ปฏิเสธ UPDATE/DELETE, FK แบบ RESTRICT กันการลบ version ที่ถูก pin
- reprint render จาก snapshot เท่านั้น; ไม่มี snapshot = reprint ไม่ได้ ไม่เดาข้อมูล live
- ไม่ backfill เอกสารเก่า; legacy reprint ผ่าน engine เดิมจนกว่าจะออกใหม่
- storage bucket ใหม่แบบ private, server/service-role เท่านั้น
- ผูกสิทธิ์การออกเอกสารกับสิทธิ์อนุมัติเดิม ไม่สร้าง role ใหม่ก่อน Phase 8–9
- แยก consumer replacement เป็น Phase 7C (Quotation Production Print) และ Phase 7D (Sales Order)

## เหตุผล

- เอกสารทางการค้าที่ออกไปแล้วต้อง reprint ได้เหมือนเดิมทุกอักขระ แม้ master version เปลี่ยน
- การมี snapshot/fingerprint ก่อนสลับ print ทำให้ 7C เปรียบเทียบผลลัพธ์เดิม/ใหม่ได้และ rollback ได้ด้วยการปิด flag
- immutable + FK RESTRICT รักษาความสมบูรณ์ของหลักฐานเอกสารและ audit trail แม้ permission model ใหม่ยังไม่เริ่ม
- ไม่ backfill รักษาความปลอดภัยของข้อมูลเดิม (แพทเทิร์นเดียวกับ signature evidence Phase 5)

## ผลตามมา

- Migration 0130 เพิ่ม `issued_documents` และ `issued_document_artifacts` + guard/RLS แต่ไม่แตะ `quotations`, `sales_orders`, `quote_note_templates`
- Phase 7B ไม่เปลี่ยน authority ของ `quotePrint.js`/`salesOrderPrint.js` สำหรับผู้ใช้ทั่วไป
- Phase 7C ต้องผ่าน comparison/print validation จาก snapshot ก่อนสลับ Quotation consumer
- ต้องยืนยันแนวทาง PDF renderer ที่ prod รองรับก่อนล็อกขอบเขต artifact (ดู open questions ใน phase doc)

## ทางเลือกที่ไม่เลือก

- แทน Production Print พร้อมสร้าง snapshot ในครั้งเดียว: blast radius สูง แยกสาเหตุ regression ไม่ได้
- เก็บเฉพาะ fingerprint โดยไม่เก็บ resolved payload: reprint เหมือนเดิมไม่ได้จริง
- Backfill เอกสารเก่าเป็น snapshot: ตีความข้อมูลเดิมเกินหลักฐานและเสี่ยงเปลี่ยนเอกสารที่ออกไปแล้ว
- อนุญาต mutate snapshot เพื่อแก้คำผิด: ทำลายความหมายของ immutable issued document; การแก้ต้องเป็นการออกครั้งใหม่พร้อม sequence ใหม่
