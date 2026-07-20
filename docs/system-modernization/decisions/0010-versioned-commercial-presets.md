# Decision 0010 — Versioned Commercial Presets Before Document Consumers

วันที่: 20 กรกฎาคม 2026
สถานะ: ยืนยันเพื่อเริ่ม Phase 7A

## บริบท

ใบเสนอราคาปัจจุบันมี Note Template และ Payment Plan แต่ยังไม่มีค่ากลางที่แยกตามทีม ประเภทดีล ประเภทบริการ และชนิดเอกสารอย่างเป็นระบบ ขณะเดียวกัน Quotation Master V2 พร้อมในรูป Preview แล้ว แต่ Production ยังไม่มี immutable issued snapshot ที่ป้องกันเอกสารเก่าเปลี่ยนตามค่ากลางใหม่

การเปลี่ยน Production Print พร้อมกับเพิ่ม Preset และ snapshot ในครั้งเดียวจะรวมความเสี่ยงด้านข้อมูล การเลือกเงื่อนไขการค้า และ layout ไว้ใน PR เดียว

## การตัดสินใจ

- แยก Phase 7A เป็นโครงสร้าง Versioned Commercial Preset โดยยังไม่เชื่อม Production consumer
- Preset แยกจาก Workflow/Timeline Operational Template และใช้ lifecycle `draft`, `published`, `archived`
- Scope รองรับ document, team, deal และ optional service โดย fallback exact → team default → general; เมื่อความจำเพาะเท่ากันให้ team มาก่อน deal/service แล้วใช้ priority และ preset key เป็น deterministic tie-break
- Published/Archived immutable และ Publish เป็น transaction เดียว
- เก็บ payment method, payment terms, remarks และ installment rows ที่มี label, percent, trigger/due rule และ note
- Seed Note Template เดิมทุกตัวเป็น Preset แยกแบบ non-destructive และไม่แก้ใบเสนอราคาเก่า
- ใช้ Admin + AE Supervisor เป็น temporary management gate โดยไม่สร้างสิทธิ์ใหม่ก่อน Phase 8–9
- แยก consumer work เป็น Phase 7B issued snapshot/PDF, Phase 7C Quotation Production Print และ Phase 7D Sales Order

## เหตุผล

- Preset ต้องมี lifecycle, resolver และ migration ที่เชื่อถือได้ก่อนใช้สร้างเอกสารจริง
- การไม่ต่อ consumer ใน 7A ทำให้ rollback ได้โดยปิด UI/API ใหม่ ขณะที่ Production workflow เดิมยังทำงานเหมือนเดิม
- immutable issued snapshot เป็นเงื่อนไขก่อนเปลี่ยน Production Print เพื่อให้ reprint เอกสารเดิมไม่เปลี่ยนตาม company, form, signature, layout หรือ preset เวอร์ชันใหม่
- การ migrate Note Template แบบ conservative รักษาข้อมูลเดิมโดยไม่ตีความ `serviceType` เกินหลักฐานที่มี

## ผลตามมา

- Migration 0128 เพิ่มตารางและ seed ใหม่ แต่ไม่ drop หรือ rewrite `quote_note_templates`
- Phase 7A เพิ่ม resolver และ management UI แต่ `createQuotationDraft.js`, `quotePrint.js` และ `salesOrderPrint.js` ยังไม่เปลี่ยน authority
- เอกสารใหม่ยังไม่เลือก Preset อัตโนมัติจนกว่า issued snapshot contract จะพร้อม
- Phase 7B ต้องกำหนด snapshot contract ที่ pin layout, accent, company, form, signature, commercial preset, locale และ rendered artifact
- Phase 7C ต้องผ่าน comparison/print validation ก่อนสลับ Quotation consumer

## ทางเลือกที่ไม่เลือก

- เปลี่ยน Production Print พร้อม Preset: blast radius สูงและ rollback แยกสาเหตุไม่ได้
- ใช้ Note Template เดิมต่อโดยเพิ่ม field: lifecycle, normalized scope และ immutable history ไม่ชัดเจน
- ลบ Note Template หลัง seed: ทำให้ rollback และการตรวจเทียบข้อมูลเดิมเสี่ยงโดยไม่จำเป็น
- สร้าง service-type master ใน Phase 7A: ยังไม่มี authority และอยู่นอกเป้าหมาย infrastructure ของเฟสนี้
