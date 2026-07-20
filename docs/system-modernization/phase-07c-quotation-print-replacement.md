# Phase 7C — Production Quotation Print Replacement และ PDF Artifact

สถานะ: กำลังดำเนินการ (ขอบเขตรอผู้ใช้ยืนยัน)

เริ่มร่าง: 20 กรกฎาคม 2026

เป้าหมาย: ปิดวงจร "เอกสารที่ออกจริง" ของใบเสนอราคาให้ครบตาม Decision 0011 —
พิมพ์จาก snapshot, เก็บ PDF ตัวจริงถาวร และเสียบ Commercial Preset เข้าการสร้าง
เอกสาร — โดยยังไม่แตะ Sale Order (Phase 7D)

## บริบท ณ วันเริ่มเฟส

งานส่วนหนึ่งของ 7C ถูกส่งมอบไปแล้วนอกกระบวนการเฟสผ่านสาย V4:

- PR #597 — แม่แบบ V4 (เติมรายการเต็มหน้าก่อนตัด + กลุ่มท้ายเอกสารไม่แตก) ใน Preview
- PR #600 — นำกติกาแบ่งหน้า V4 ใส่ `quotePrint.js` ใบจริง และปุ่มพิมพ์ production
  ใช้ `openQuotePrintWindowPreferIssued`: ใบที่อนุมัติแล้วพิมพ์จาก issued snapshot
  (Phase 7B) ก่อนเสมอ
- PR #601 — แก้โมเดลความจุหน้าเป็น px-calibrated ฝั่ง Preview

สิ่งที่ยังไม่มี: PDF binary ถาวร, Commercial Preset ยังเป็น dead code
(resolver ไม่มี consumer), และการ validate การพิมพ์จาก snapshot กับใบจริง
ยังไม่ได้ทำเป็นทางการ

## ขอบเขตที่เสนอ (รอยืนยัน)

### 1. PDF Artifact ของใบเสนอราคาที่ออกจริง

- เมื่อเกิด issued snapshot (ตอนอนุมัติ) ให้ generate PDF จาก snapshot
  และเก็บใน storage bucket แบบ private ตาม contract ของ Phase 7B
  (path/sha256/size/mime + generator version)
- Reprint/ดาวน์โหลด ให้เสิร์ฟ PDF ที่เก็บไว้ ไม่ render ใหม่; ถ้า artifact
  ยังไม่เกิด (สร้าง async แล้วพลาด) fallback เป็น render จาก snapshot
  พร้อมระบุใน audit
- นำร่องเฉพาะ**ใบเสนอราคา** ตาม D-006 (ดู open question D-7C-3)
- ไม่ backfill ใบเก่า — ใบที่ไม่มี snapshot ใช้เส้นทางเดิม

### 2. เสียบ Commercial Preset เข้าการสร้างใบเสนอราคา

- ตอนสร้าง/แก้ QT ให้ default วิธีชำระเงิน เงื่อนไข หมายเหตุ และงวดชำระ
  จาก `resolveCommercialPreset` (Published version เท่านั้น)
- ผู้ใช้แก้ทับค่า default ได้ต่อใบเหมือนเดิม; preset เป็นค่าตั้งต้น ไม่ใช่ค่าบังคับ
- snapshot ของ Phase 7B pin `commercialPresetVersionId` ที่ใช้จริง (ช่องรออยู่แล้ว)
- ลบสถานะ dead code ของ `resolvePublishedCommercialPreset`

### 3. Validation การพิมพ์จาก snapshot (release gate ของเฟส)

- UAT: อนุมัติใบจริงอย่างน้อย 1 ใบ → ตรวจ snapshot เกิด, reprint ตรงฉบับ,
  PDF artifact ตรง fingerprint
- เทียบผลพิมพ์ live vs snapshot ของใบเดียวกันก่อนปิดเฟส
- Calibrate ความจุหน้า `quotePrint.js` กับเอกสารจริง (ปัจจุบันใช้ค่าอนุรักษ์
  15/22 ต่อหน้า) — ห้ามคัดลอกตัวเลขจาก Preview เพราะคนละ geometry

## ไม่รวมใน Phase 7C

- Sale Order ทุกส่วน: Phase 7D
- การรวมเครื่องยนต์ render (ดู D-7C-2) หากตัดสินใจทำ ให้เป็นงานแยก
- Permission redesign: Phase 8–9
- Workflow จดแจ้ง อย. (มติ 2026-07-20 แยกต่างหาก ยังไม่ผูกเอกสาร)

## เรื่องที่ต้องตัดสินใจ

| รหัส | เรื่อง | ข้อเสนอเริ่มต้น | สถานะ |
|---|---|---|---|
| D-7C-1 | วิธี generate PDF บน production (Vercel) | ตรวจทางเลือก serverless chromium vs external render service vs เก็บ canonical HTML ต่อ + พิมพ์ผ่าน browser; ต้องได้ผล deterministic ตรง fingerprint | รอตรวจทางเทคนิคก่อนตัดสินใจ |
| D-7C-2 | สองเครื่องยนต์ (`quotationMasterTemplate.js` Preview / `quotePrint.js` ใบจริง) รวมเป็นหนึ่งหรือไม่ | คงสองเครื่องยนต์ใน 7C (ลดความเสี่ยง) และบันทึกภาระ "แก้กติกาแบ่งหน้าต้องแก้คู่กัน" ไว้ทบทวนหลัง 7D | เสนอคงไว้ก่อน |
| D-7C-3 | รายการเอกสาร PDF pilot (ปิด D-006 จาก Phase 0) | ใบเสนอราคาใบเดียวก่อน แล้วขยาย Sale Order ตอน 7D | รอผู้ใช้ยืนยัน |

## Definition of Done

- [ ] ผู้ใช้ยืนยันขอบเขตและคำตอบ D-7C-1..3
- [ ] Migration (ถ้ามี) + rollback บันทึกและตรวจ
- [ ] Preset default ทำงานตอนสร้าง QT พร้อม unit tests
- [ ] PDF artifact เกิดตอนอนุมัติ, immutable, fingerprint ตรง พร้อม tests
- [ ] UAT ใบจริง: snapshot + reprint + PDF ตรงฉบับ
- [ ] อัปเดต Permission action inventory
- [ ] อัปเดต README roadmap และเอกสารเฟสนี้
- [ ] ผู้ใช้ตรวจและยืนยันปิดเฟส
