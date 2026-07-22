# Phase 7C — Production Quotation Print Replacement และ PDF Artifact

สถานะ: รอตรวจ (โค้ดครบทั้ง #1 PDF artifact + #2 Commercial Preset — รอ UAT ใบจริงบน prod)

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

**อัปเดต 2026-07-22 — ขอบเขต #2 (Commercial Preset) ส่งมอบแล้ว:**
`resolveCommercialPreset` มี consumer แล้ว — (ก) endpoint ผู้จัดทำใบ
`GET /api/commercial-presets/resolve` (gate `salesplan:edit`) คืนค่าตั้งต้นของ preset
ที่ match scope ดีล (Published เท่านั้น); (ข) หน้าสร้างใบเสนอราคาเติมค่าตั้งต้น
วิธีชำระ/เงื่อนไข/หมายเหตุ/งวดชำระ เฉพาะช่องที่ยังว่าง (แก้ทับได้); (ค) server ตรึง
`metadata.commercialPresetVersionId` ตอนสร้างใบแบบ authoritative; (ง) issued snapshot
pin เวอร์ชันจาก metadata แทน hardcode null. เหลือของ 7C จริง ๆ = **PDF binary (D-7C-1)**

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
| D-7C-1 | วิธี generate PDF บน production (Vercel) | เทียบ chromium-in-function / external service / PDF library | **ตัดสินใจแล้ว 22 ก.ค. 2026: ทิศ A — puppeteer-core + @sparticuz/chromium** (เรนเดอร์ในฟังก์ชัน sin1, ข้อมูลไม่ออกนอก, ใช้เอกสาร V4 เดิม). External service ตัดออก (ส่งข้อมูลการเงินออก 3rd party); PDF library ตัดออก (ต้องสร้าง renderer ที่ 2). **fingerprint = identity ของ 7B บน HTML canonical**; PDF = artifact ที่เรนเดอร์จาก HTML นั้น + เก็บ sha256 เพื่อ integrity (ไม่บังคับ PDF byte-deterministic เพราะ chromium ฝัง timestamp) |
| D-7C-2 | สองเครื่องยนต์ (`quotationMasterTemplate.js` Preview / `quotePrint.js` ใบจริง) รวมเป็นหนึ่งหรือไม่ | ~~คงสองเครื่องยนต์~~ **ตัดสินใจแล้ว 21 ก.ค. 2026: รวม (ทิศทาง B)** — PR #612 ให้ server builder `quotationMasterDocument.js` (V4) เป็น renderer ของ snapshot/พิมพ์สด/preview ทั้งหมด; `quotePrint.js` เหลือหน้าที่เดียวคือใบสั่งขาย (7D) ห้ามลบจนกว่า 7D จบ; ทิศทาง A (PR #610) ถูกปฏิเสธและ revert | ตัดสินใจแล้ว — ส่งมอบผ่าน #612 |
| D-7C-3 | รายการเอกสาร PDF pilot (ปิด D-006 จาก Phase 0) | ใบเสนอราคาใบเดียวก่อน แล้วขยาย Sale Order ตอน 7D | รอผู้ใช้ยืนยัน |

## Definition of Done

- [x] ผู้ใช้ยืนยัน D-7C-1 (ทิศ A) — D-7C-3 (pilot = ใบเสนอราคาใบเดียวก่อน) ตามข้อเสนอ
- [x] Migration + rollback: `0139_issued_quotation_pdf_artifact.sql` (ตาราง immutable +
  bucket `issued-quotation-pdf`); rollback = DROP TABLE + ลบ bucket. **รัน + ยืนยัน live
  บน prod แล้ว 2026-07-22** (table_ok + bucket_ok + guard_ok = true)
- [x] Preset default ทำงานตอนสร้าง QT พร้อม unit tests (2026-07-22 — endpoint resolve +
  prefill หน้าใหม่ + server stamp `metadata.commercialPresetVersionId` + snapshot pin;
  `commercialPresetToQuotationDefaults` 9/9 tests เขียว)
- [x] PDF artifact เกิดตอนอนุมัติ (best-effort) + immutable (guard เดิม) + เก็บ path/sha256/
  size/mime/generatorVersion; ดาวน์โหลด fallback สร้างจาก snapshot ถ้ายังไม่มี (idempotent).
  build ผ่าน (route `/issued/pdf` registered) · 524/524 tests · eslint clean
- [ ] **UAT ใบจริง (บน prod):** อนุมัติ QT → เกิดแถว `issued_document_pdf_artifacts` + ไฟล์
  ใน bucket, ดาวน์โหลด PDF ตรงกับ HTML reprint, fingerprint ตรง
- [ ] อัปเดต Permission action inventory
- [x] อัปเดต README roadmap และเอกสารเฟสนี้
- [ ] ผู้ใช้ตรวจและยืนยันปิดเฟส

## หมายเหตุ deploy (ทิศ A)
- การ generate เกิดบน Vercel (`sin1`) เท่านั้น; **local dev** ต้องตั้ง env
  `PUPPETEER_EXECUTABLE_PATH` ชี้ Chrome ที่ติดตั้ง จึงจะทดสอบ PDF ได้ (ไม่งั้นเรนเดอร์ไม่ออก)
- `next.config.mjs` ตั้ง `@sparticuz/chromium` + `puppeteer-core` เป็น `serverExternalPackages`
- route `/issued/pdf` + approval ตั้ง `runtime='nodejs'`, `maxDuration=60`; ถ้าเจอ OOM บน prod
  ให้เพิ่ม memory ของฟังก์ชันผ่าน `vercel.json` (default น่าจะพอสำหรับใบเสนอราคา)
- bucket `issued-quotation-pdf` จำกัด `application/pdf` + 20MB (override ชื่อด้วย env
  `ISSUED_QUOTATION_PDF_BUCKET` ได้)

### กับดัก: ไบนารี chromium หายจาก Lambda (แก้แล้ว 2026-07-23, PR #649 + #652)

อาการบน prod: กดดาวน์โหลด PDF แล้วได้ `The input directory ".../@sparticuz/chromium/bin"
does not exist` ทั้งที่ build ผ่านและไม่มี warning ใด ๆ

สาเหตุซ้อนกัน 2 ชั้น:

1. **`serverExternalPackages` ไม่ได้แปลว่าไฟล์ถูกก๊อปขึ้นฟังก์ชัน** — มันสั่งแค่ "อย่า bundle"
   ไบนารี brotli ของ chromium ถูกอ่านด้วย `fs` ตอน runtime ไม่ได้ `require` ตัว file tracing
   จึงมองไม่เห็นและตัด `bin/` ทิ้ง ต้องประกาศ `outputFileTracingIncludes` เพิ่ม
2. **key ของ `outputFileTracingIncludes` เป็น glob ไม่ใช่ path** — เขียน `[id]` ตรง ๆ จะถูกอ่าน
   เป็น character class แล้วไม่แมตช์ route เงียบ ๆ ต้อง escape เป็น `\[id\]`

**วิธีตรวจว่า include ทำงานจริง โดยไม่ต้องรอ deploy** (ใช้ได้กับทุกเคส include/exclude):
หลัง `next build` ให้เปิดไฟล์ trace ของ route นั้น แล้วหาไฟล์ payload ที่ควรถูกก๊อปไป

```
.next/server/app/api/sales-planning/quotations/[id]/issued/pdf/route.js.nft.json
```

ต้องเห็น `chromium.br`, `al2023.tar.br`, `fonts.tar.br`, `swiftshader.tar.br` ถ้าไม่เห็น = include
ไม่ทำงาน (ไฟล์นี้คือสิ่งที่ Vercel ใช้ตัดสินว่าจะก๊อปอะไรขึ้นฟังก์ชัน)

หมายเหตุเพิ่ม: ฝั่ง JS ของ Next 16 ข้าม `collectBuildTraces()` เมื่อ bundler เป็น Turbopack
แต่ **Turbopack รองรับ config นี้เองในฝั่ง Rust** — อย่าสรุปว่าไม่รองรับจากการ grep `next/dist/`
และไม่ต้องสลับไป `--webpack` (ซึ่งตอนนี้ build ไม่ผ่านอยู่แล้ว ติด CSS modules purity rule ที่
`settings/document-standards/quotation-preview/page.module.css`)
