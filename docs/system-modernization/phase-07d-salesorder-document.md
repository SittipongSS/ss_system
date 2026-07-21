# Phase 7D — Sales Order Document (V4 engine)

สถานะ: กำลังดำเนินการ (2026-07-21)

## ที่มา

Phase 7C ทำให้ **ใบเสนอราคา** ใช้เครื่องยนต์เอกสาร Quotation Master V4
(`lib/sales/quotationMasterDocument.js`) แล้ว. **ใบสั่งขาย (Sales Order, FM-SA-03)**
ยังพิมพ์ด้วยเครื่องยนต์เก่า: `salesOrderPrint.js` แมป order → รูป quote แล้วเรียก
`buildQuotePrintHTML` (design เดิม) พร้อม options เฉพาะ SO (เลข SO, อ้างอิง QT,
สถานะ, ผู้ลงนาม 3 ช่องแบบ SO, ลายน้ำตามสถานะ).

## ขอบเขต (ยืนยัน 2026-07-21)

ให้ใบสั่งขายใช้ **หน้าตา V4 เดียวกับใบเสนอราคา** โดย **generalize เครื่องยนต์ V4 ตัวเดิม**
ให้รองรับทั้งสองเอกสารผ่าน parameter — **ไม่สร้าง builder/CSS ชุดใหม่** (กันปัญหา CSS
ซ้ำสองที่แบบที่เพิ่งเก็บกวาดใน #619).

- SO เป็นเอกสารโครงเดียวกับ QT: หัวเอกสาร + ผู้ซื้อ + ตารางรายการ + มูลค่ารวม +
  งวดชำระ + ช่องลงชื่อ — ต่างแค่ **ชื่อฟอร์ม (FM-SA-03/SALES ORDER), เลขที่, ป้ายวันที่
  (วันที่ SO / กำหนดชำระ), แถวอ้างอิง (อ้างอิง QT + สถานะ), และผู้ลงนาม 3 ช่องแบบ SO**
- **ไม่อยู่ในขอบเขต:** issued snapshot ของ SO (7B ทำเฉพาะ quotation), PDF binary

## การเปลี่ยนแปลงที่วางไว้

1. **Generalize renderer + model contract** (`quotationMasterDocument.js`) ให้ตัวแปรที่ต่าง
   กันมาจาก model แทน hardcode:
   - หัวเอกสาร: `document.dateLabel/dateValue` + `secondaryLabel/secondaryValue`
     (QT = วันที่/ยืนราคาถึง; SO = วันที่ SO/กำหนดชำระ)
   - บล็อกอ้างอิง: `referenceRows[]` (label/value, ข้ามค่าว่าง) — QT = ดีล/โครงการ/
     ผู้เสนอราคา/โทร; SO = อ้างอิง QT/สถานะ/ดีล/โครงการ
   - ช่องลงชื่อ: `signers[]` (label/role/name/esignature?) — QT 3 ช่องเดิม; SO =
     ผู้จัดทำ(พนักงานขาย)/ผู้อนุมัติ(ผจก.ฝ่ายขาย)/ฝ่ายบัญชี
   - หัวเอกสารบริษัท + ตาราง + งวดชำระ + CSS = ใช้ร่วมเหมือนเดิม
2. **ปรับ model builder ของ QT** (`buildQuotationMasterModelFromQuote` + fixture
   `buildQuotationMasterPreview`) ให้เติม field ใหม่โดย**ผลลัพธ์ QT ต้องเท่าเดิมเป๊ะ**
3. **เพิ่ม `buildSalesOrderMasterHTML(order)`** + model builder ของ SO ใน
   `salesOrderPrint.js` (แมป order → model + params SO) แทนการเรียก `buildQuotePrintHTML`
4. **rewire** `openSalesOrderPrintWindow` → เรนเดอร์ V4; คง prepare/showError wrapper เดิม
5. **ปลดระวาง `buildQuotePrintHTML` + `paginateCommercialLines`** — ยืนยันแล้วว่า **0 consumer**
   (QT+SO ใช้ V4 หมด) → **เลื่อนเป็น follow-up แยก** เพื่อให้ PR 7D โฟกัส (การลบ ~300 บรรทัด
   + ถอดเทสต์ ทำ PR cleanup ต่างหาก); คง window helper (prepare/show/open*PreferIssued) ที่ยังใช้

## Implementation validation — 21 กรกฎาคม 2026

- Generalize renderer + model: หัวเอกสารใช้ `document.dateLabel/dateValue/secondaryLabel/
  secondaryValue`, บล็อกอ้างอิงใช้ `referenceRows[]`, ช่องลงชื่อใช้ `signers[]`
  (esignature optional) — `buildQuotationMasterModelFromQuote` รับ options override; QT
  fixture (`buildQuotationMasterPreview`) เติม field เดียวกัน → **QT ไม่เปลี่ยน (เทสต์เดิมเขียว)**
- `salesOrderPrint.js` เรียก `buildQuotationMasterHTML(order→printable, {form FM-SA-03,
  documentTitleTh ใบสั่งขาย, dateLabel วันที่ SO, secondaryLabel กำหนดชำระ, referenceRows
  [อ้างอิง QT/สถานะ/ดีล/โครงการ], signers [ผู้จัดทำ/ผู้อนุมัติ/ฝ่ายบัญชี], watermark ตามสถานะ})`
  แทน `buildQuotePrintHTML`
- ยืนยัน browser (DOM): SO ออกเป็น V4 — ใบสั่งขาย/SALES ORDER, FM-SA-03, วันที่ SO/กำหนดชำระ,
  อ้างอิง QT + สถานะ, ผู้ลงนาม SO 3 ช่อง, งวดชำระ 3 คอลัมน์, approved=ไม่มีลายน้ำ
- ทดสอบ `npm test` **502/502** · eslint สะอาด · `npm run build` ผ่าน

## Definition of Done

- [x] ผู้ใช้ยืนยันขอบเขต (2026-07-21)
- [x] เทสต์ SO ใหม่ + เทสต์ generalize renderer ผ่าน
- [x] ตรวจ A4/หลายหน้า/overflow=0 · eslint · build ผ่าน
- [x] ยืนยันด้วย browser (DOM) ก่อน commit/PR — merged `87d05efc`/`bd587b08`/`21cfc473`
- [x] ใบเสนอราคา (QT) หน้าตา/พฤติกรรมไม่เปลี่ยน — เทสต์ QT เดิมเขียวทั้งหมด
- [ ] **UAT ใบจริง:** SO พิมพ์ออกมาเป็นหน้าตา V4 (หัว FM-SA-03, อ้างอิง QT, สถานะ,
  ผู้ลงนาม SO ถูกต้อง) — รอผู้ใช้ตรวจกับเอกสารจริงก่อนปิดเฟส

## งานที่รอ/เลื่อน
- SO issued snapshot (ถ้าธุรกิจต้องการตรึงเอกสาร SO เหมือน QT) — เฟสแยก
- PDF binary (7C ค้าง)
