# Phase 7C — Production Quotation Print Replacement

สถานะ: กำลังดำเนินการ (ร่างขอบเขต — รอผู้ใช้ยืนยันก่อนแตะโค้ด)

## ที่มา

Phase 6B ให้ Quotation Master Template (มีถึง V4) ใน Preview, Phase 7A ให้ commercial
preset แบบมีเวอร์ชัน, Phase 7B ให้โครง issued document snapshot + immutable artifact
(mig 0130) โดย **ยังไม่แทน** production print ตาม Decision 0011 การสลับ consumer ของ
ใบเสนอราคาถูกกันไว้เป็น Phase 7C โดยเฉพาะ

ปัจจุบันมี **2 เครื่องยนต์ render ใบเสนอราคาแยกกัน**:

- `quotationMasterTemplate.js` — เครื่องยนต์ Preview (V1–V4). `buildQuotationMasterPreview`
  คืน **โครงสร้างข้อมูลหน้า (page model)** ไม่ใช่ HTML และรับ **fixture scenario** ไม่ใช่
  quotation จริง ส่วนแปลงเป็น HTML อยู่ใน React preview component
- `quotePrint.js` — เครื่องยนต์ใบพิมพ์จริง (`buildQuotePrintHTML`) เป็น pure string builder
  รันฝั่ง server ได้ และเป็นตัวที่ snapshot capturer ของ 7B (`issuedQuotationSnapshot.js`)
  เรียกใช้ตอนตรึง artifact

PR #600 ยกกติกาแบ่งหน้า V4 (เติมเต็มหน้าก่อนตัด + กลุ่มท้ายเอกสารไม่แตก) ไปใส่ `quotePrint.js`
แล้ว และปุ่มพิมพ์ถูกเปลี่ยนเป็น `openQuotePrintWindowPreferIssued` (เล่น artifact ที่ตรึงไว้
ก่อน ถ้ามี) แต่ทั้งสองเครื่องยนต์ยังคง geometry/อัลกอริทึมคนละชุด แก้กติกาหน้าต้องแก้สองที่เสมอ

## ผู้ใช้ยืนยันขอบเขต — 20 กรกฎาคม 2026

1. **รวมเป็นเครื่องยนต์เดียว (D-7C-2 = รวม) — ทิศทาง A (ยืนยัน 2026-07-20 หลังตรวจโค้ด):**
   ผลลัพธ์ที่ต้องการคือ preview = ใบจริง 100%, ใช้ pagination V4 ที่ calibrate แล้ว, และมีที่
   ให้ดูแลจุดเดียว การตรวจโค้ดพบว่า **`quotePrint.js` คือเครื่องยนต์ที่รับข้อมูลจริง + เป็น pure
   server HTML builder + ต่อท่อ capturer/ปุ่มพิมพ์แล้วบน prod** ส่วน `quotationMasterTemplate.js`
   เป็น fixture + page-model + React preview เท่านั้น จุดแข็งอยู่คนละตัว จึง **กลับทิศจากถ้อยคำ
   เดิม**: คง `quotePrint.js` เป็น renderer จริง แล้วยก **pagination V4 (px-calibrated #601)**
   จาก masterTemplate มาเป็น **module กลางใช้ร่วม** ทั้งสองฝั่ง; หน้า preview เปลี่ยนมา render
   จาก `buildQuotePrintHTML` เพื่อให้ preview = ใบจริง; **freeze ส่วน fixture/React renderer
   ของ masterTemplate** (เดิมบันทึกว่า freeze quotePrint — แก้เป็น freeze ฝั่ง masterTemplate
   ตามข้อเท็จจริงของโค้ด)
2. **เลื่อน PDF binary:** artifact ยังเก็บเป็น **canonical HTML** (reprint เล่น HTML เดิม)
   ไม่ทำ PDF binary + storage bucket ในเฟสนี้ โฟกัสที่การสลับ consumer ให้ปลอดภัยก่อน
   PDF binary + D-006 pilot list เลื่อนเป็นเฟสย่อยถัดไปเมื่อเลือกวิธี render บน Vercel ได้
3. **ขอบเขตเอกสาร: quotation เท่านั้น** — Sales Order เป็น Phase 7D

## เป้าหมาย

ให้ทุกเส้นทางที่ผู้ใช้เห็น/พิมพ์ใบเสนอราคา (preview, ปุ่มพิมพ์, reprint จาก snapshot)
มาจากเครื่องยนต์ V4 เดียว โดยไม่เปลี่ยนหน้าตาที่ผู้ใช้เห็นตอนนี้ (V4 คือค่าตั้งต้นอยู่แล้ว)
และไม่ทำให้ใบที่ออก/ตรึงไปแล้วเปลี่ยน

## การเปลี่ยนแปลงที่วางไว้ (ทิศทาง A)

1. **สกัด pagination V4 เป็น module กลาง** — ย้าย `paginateFilled` + `buildGroupedPages` +
   ค่าคาลิเบรต V4 (`V4_PAGE_UNITS`/`V4_TOTALS`/`V4_CONTINUATION_CAPACITY` ฯลฯ) + helper
   (`v4PageCost`, `v4GroupUnits`, `v4FirstCapacity`, `rowUnits`, `pageUnits`) ออกจาก
   `quotationMasterTemplate.js` ไปไฟล์ใหม่ `lib/sales/quotationPagination.js` เป็น pure functions
   ไม่มี dependency UI — เป็น single source of truth ของการแบ่งหน้า
2. **`quotePrint.js` ใช้ page-model จาก module กลาง** — แทนที่ `paginateCommercialLines` +
   ฮิวริสติก `finalReserve` เดิม (ตัดหน้าเร็วเกิน) ด้วยการแบ่งหน้าตาม page-model V4:
   ตัดรายการแบบ fill + ใช้ decision "closing group พอในหน้าสุดท้ายไหม" จาก `buildGroupedPages`
   ตัดสินว่า totals/payment/signatures อยู่หน้าสุดท้ายหรือขึ้นหน้าใหม่ — layout/CSS/watermark/
   ช่องลงชื่อ/ตารางงวด และท่อข้อมูลจริงคงเดิมทั้งหมด
3. **`quotationMasterTemplate.js` เรียก module กลางแทนสำเนาเดิม** — ลบสำเนา pagination ที่ซ้ำ
   ออก เหลืออ้าง module กลาง (ไม่มี divergence อีก)
4. **หน้า preview render จาก `buildQuotePrintHTML`** — แมป fixture scenario → รูป quote แล้ว
   render ด้วยเครื่องยนต์ใบจริง (preview = ใบจริง 100%); คงตัวเลือก scenario + สี/ขาวดำ
5. **Freeze ฝั่ง fixture/React renderer ของ masterTemplate** — คอมเมนต์กำกับว่าเป็น preview
   fixture/harness; ไม่ใช่เจ้าของ layout อีก. `quotePrint.js` **ไม่** freeze (เป็น renderer จริง)
6. **snapshot capturer + ปุ่มพิมพ์: ไม่ต้องแก้ท่อ** — เพราะทั้งคู่เรียก `buildQuotePrintHTML`
   อยู่แล้ว การเปลี่ยน pagination ภายในมีผลอัตโนมัติ

## ไม่รวมใน Phase 7C

- PDF binary + storage bucket + generator version (เลื่อนเป็นเฟสย่อยถัดไป)
- D-006 PDF pilot list
- Sales Order print/consumer (Phase 7D)
- แก้ใบเสนอราคา/เอกสาร/template เดิมย้อนหลัง หรือ backfill snapshot ใบเก่า
- Permission redesign (Phase 8–9)

## Precondition และความเสี่ยง

- **Precondition — ยืนยันแล้ว 2026-07-20:** query prod ได้ `issued_documents` = **0 แถว**
  (ตาราง exists = mig 0130 รันบน prod แล้ว แต่ยังไม่มีใบถูกออก/ตรึง) → รวมเครื่องยนต์ตั้งแต่
  ใบแรกได้สะอาด artifact ทุกใบมาจากเครื่องยนต์เดียว ไม่ปนของเก่า **หมายเหตุ:** ต่อให้ prod มี snapshot อยู่แล้ว ก็ไม่ใช่ตัวบล็อก — reprint เล่น
  HTML ที่ตรึงไว้ ไม่ re-render การเปลี่ยน renderer มีผลเฉพาะใบที่ออก**ใหม่**หลังสลับเท่านั้น
  (แต่จะเกิดจุดที่ artifact ต่างเครื่องยนต์กันคนละช่วงเวลา — ยอมรับได้เพราะแต่ละใบ immutable)
- ความเสี่ยงหลัก: การแมปข้อมูลจริงไม่ครบเคส (printHeader/logo, ลายเซ็น, หลายงวด) →
  ต้อง comparison test เทียบผล V4 กับ `quotePrint.js` บนชุดข้อมูลเดียวกันก่อนสลับ
- Rollback ระดับแอป = คืนปุ่มพิมพ์/capturer ให้เรียก `quotePrint.js` (ไม่ลบ), ไม่แตะ
  snapshot/artifact ที่สร้างแล้ว

## Definition of Done

- [ ] ผู้ใช้ยืนยันขอบเขตนี้ก่อนแก้ implementation
- [ ] V4 renderer เป็น pure server-side builder ที่ preview / capturer / print เรียกร่วมกัน
- [ ] Data adapter แมป quotation จริงครบทุกเคสที่ 7B ทดสอบ
- [ ] Comparison test: ผล V4 กับ quotePrint.js บนข้อมูลชุดเดียวกัน ไม่ต่างอย่างมีนัย (หรือบันทึกความต่างที่ตั้งใจ)
- [ ] snapshot capturer + ปุ่มพิมพ์ live สลับมา V4; ใบที่มี snapshot ยังเล่น artifact เดิม
- [ ] `quotePrint.js` ทำเครื่องหมาย legacy + คอมเมนต์กำกับหน้าที่ที่เหลือ
- [ ] ตรวจ Desktop/Mobile และ A4/สี/ขาวดำของใบเสนอราคา
- [ ] targeted lint/tests + production build ผ่าน
- [ ] อัปเดต [Permission action inventory](./permission-action-inventory.md) ถ้ามีสิทธิ์ใหม่ (คาดว่าไม่มี)
- [ ] บันทึก Before/After และ known issues
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push, PR และ CI ผ่าน

## Implementation validation — 21 กรกฎาคม 2026

- **preview = ใบจริง:** หน้า `/settings/document-standards/quotation-preview` เรนเดอร์ผ่าน
  `buildQuotePrintHTML` ใน `<iframe srcDoc>` (เครื่องยนต์เดียวกับใบพิมพ์จริง) แทน component
  แม่แบบแยก. เพิ่ม adapter `buildQuotationPreviewPrintInput(scenarioId, state)` ใน
  `quotationMasterTemplate.js` แปลง fixture model → รูป `quote` (ใช้คณิต fixture เดิมซ้ำ:
  ยอดรวม/จัดสรรงวด); สถานะ draft→ลายน้ำ "ฉบับร่าง", cancelled→"ยกเลิก", approved→ไม่มีลายน้ำ
- **ปลดระวาง renderer แม่แบบ:** ลบ `components/documents/QuotationMasterDocument.js` + `.module.css`
  (ไม่มีที่อื่นอ้างแล้ว) และลบเทสต์ 6 ตัวที่อ่านไฟล์ component นั้น; ตัวเลือก V1–V4 ในหน้า
  preview ถูกถอด (เหลือ scenario + สถานะ + สี/ขาวดำ). `buildQuotationMasterPreview` +
  pagination V1–V4 คงไว้เป็นแหล่งข้อมูล fixture + อ้างอิงย้อนหลัง (เทสต์เดิมยังผ่าน)
- **คาลิเบรต pagination ใบจริง (แก้ "ไม่เต็มหน้าก็ตัดแล้ว"):** วัด DOM จริงของสไตล์ชีต
  `quotePrint.js` (2026-07-21) — พื้นที่เนื้อหาใต้หัวเอกสาร ≈ 880px, แถวสินค้า **24px**
  (ไม่ใช่ 50px แบบ preview เดิม — คนละ geometry ตามที่เคยเตือนไว้), หัวตาราง 21px,
  party grid 195px, มูลค่ารวม 96px, กลุ่มท้ายเอกสาร ~555px. ปรับ `paginateCommercialLines`:
  หน้าแรก 15→**24**, หน้าต่อ 22→**32** (หน้าสุดท้าย reserve 8 คาลิเบรตถูกอยู่แล้ว คงไว้).
  วัดซ้ำในเบราว์เซอร์: multipage **4→3 หน้า**, ทุก scenario overflow = 0 (ไม่มีเนื้อหาโดน
  ตัดหาย), จำนวนหน้าตรงกับเป้า V4 ที่คาลิเบรตไว้ (standard 2, dense 2, multipage 3,
  installments 2, long-content 2)
- **capturer + ปุ่มพิมพ์:** ไม่ต้องแก้ท่อ — ทั้งคู่เรียก `buildQuotePrintHTML` อยู่แล้ว
  การคาลิเบรต pagination จึงมีผลกับใบจริง + reprint snapshot ใหม่โดยอัตโนมัติ
- **ทดสอบ:** `npm test` ผ่าน **490/490** (รวม adapter 4 เทสต์ใหม่ + capacity ที่คาลิเบรต);
  `eslint` ไฟล์ที่แก้ = ผ่าน; `npm run build` (production) = ผ่าน

## งานที่รอสภาพแวดล้อมจริง / เฟสถัดไป

- UAT บนเบราว์เซอร์จริง: ตรวจหน้า preview + สั่งพิมพ์/Save PDF จากใบจริง เทียบหน้าตา
  (โดยเฉพาะเคสหลายหน้า + กลุ่มท้ายเอกสารชิดล่าง) — worktree นี้เห็นผ่าน static snapshot
  เท่านั้น จึงวัดด้วย DOM measurement แทนการพิมพ์จริง
- PDF binary + storage bucket + D-006 pilot list (เลื่อนตามมติ ข้อ 2) — เฟสย่อยถัดไป
