# แผน implement: ยื่นชำระภาษีสรรพสามิตจริง ผูกกับ SO (Excise Filing v2)

> สถานะ: **แผนรอเคาะเริ่มโค้ด** (2026-07-22, มติหลัก 4 ข้อ lock แล้ว)
> เปลี่ยนการยื่นชำระภาษีสรรพสามิต (Track 2) จาก "สร้างมือเลือกทะเบียนทีละตัว" →
> "ยื่นตาม SO ที่อนุมัติแล้ว" เพราะ SO คือใบที่แบก Actual = สินค้าสรรพสามิตในนั้นคือของที่ต้องยื่น

## 0. มติที่ lock แล้ว (2026-07-22)

1. **1 SO = 1 ใบยื่น** (one-to-one, `salesOrderId` unique บนใบยื่น)
2. **ยอดเก็บลูกค้า = ภาษีสรรพสามิต + ภาษีท้องถิ่นเท่านั้น** (ไม่รวมค่าสินค้า/VAT) → ตรงกับ `orders.totalTax` เดิม
3. **เก็บทางสร้างมือไว้ แต่เปลี่ยนหัวใจ**: หน้า `/tax/filings` สร้างใบยื่นได้เหมือนเดิม แต่แทน "เลือกทะเบียนทีละรายการ" ด้วย "เลือกลูกค้า → เลือก SO ที่ยังค้างยื่น" — สองทาง (จากหน้า SO / จากหน้า filings) บรรจบที่การเลือก SO
4. **ด่านทะเบียน: เตือนไม่บล็อก** ตอนนี้ (สร้างใบยื่นได้แม้บางบรรทัดยังไม่ขึ้นทะเบียน) + มี setting เปิดโหมด "บังคับทะเบียนครบก่อนยื่น" ไว้ใช้ตอน transfer เต็มตัว

## 1. สถาปัตยกรรม: ต่อยอดตาราง `orders` เดิม (ไม่สร้างระบบใหม่ขนาน)

flow ที่ผู้ใช้ต้องการ 5 ขั้น ทับกับ workflow เดิม (`pending → received → filing → complete`) เกือบพอดี — ต่างแค่ที่มา (SO แทน manual) + ขั้นที่ 5 ใหม่ จึง **reuse ตาราง orders / order_items / workflow.js / dialog / attachments / requirements-gate เดิมได้เกือบหมด** ไม่ต้อง rebuild

```
flow ผู้ใช้                         state (orders.status)         ผู้ทำ / cap
─────────────────────────────────────────────────────────────────────────────
① SA เตรียมข้อมูล + สรุปยอดเก็บ      draft (ใหม่) → pending          SA (sales:act)
② SA ยืนยันเก็บเงินลูกค้าแล้ว        pending → received             SA (sales:act)
③ LG รับเรื่องไปยื่น                 received → filing              LG (legal:approve)
④ ยื่นเสร็จลงใบเสร็จ                 filing → complete             LG (legal:approve)
⑤ SA ส่งใบเสร็จให้ลูกค้า (ใหม่)      complete → delivered (ใหม่)    SA (sales:act)
```

### ความสัมพันธ์ตาราง
- `orders` += `salesOrderId` (FK → sales_orders, **unique** = 1 SO 1 ใบยื่น) + `amountToCollect` (ยอดสรุปที่ตั้งใจเก็บ = excise+local ณ ตอนสร้าง) + `collectedConfirmedAt/By` (ขั้น ②) + `docsDeliveredAt/By` (ขั้น ⑤)
- `order_items` += `salesOrderLineId` (FK → sales_order_lines, โยงกลับบรรทัด SO ต้นทาง) — ยังคง `registrationId` เดิมไว้ (ที่มาของ tax rate snapshot)
- ⚠️ `orders.status` เดิมเป็น free-text (ไม่มี CHECK) → เพิ่ม state `draft`/`delivered` ได้เลย ไม่ต้องแก้ constraint; อัปเดต `workflow.js` เป็นแหล่งความจริงเดียว

## 2. หัวใจใหม่: สร้างใบยื่นจาก SO (resolver กลาง)

สร้าง helper กลาง `lib/excise/soFiling.js` — resolve "บรรทัดที่ต้องยื่นของ SO นี้":
1. โหลด `sales_order_lines` ของ SO → กรองเฉพาะบรรทัดที่ `categoryFlags(fgCode).isExcise === true` (ผ่าน product_types, mig 0131)
2. แต่ละบรรทัด: หา `excise_registrations WHERE productId + customerId(ของ SO) + status='approved'`
3. คิดภาษี/บรรทัด = (reg.exciseTax + reg.localTax) × qty (snapshot จากทะเบียน เหมือน orders-POST เดิม)
4. **ด่านทะเบียน (มติ 4):** บรรทัดไม่มีทะเบียน approved → `warn` ไม่ block; บรรทัดนั้นภาษี = 0 + ธง `needsRegistration` (UI เตือน + ลิงก์ไปขึ้นทะเบียน — ต่อกับ [[excise-product-link]]); ยอดสรุปนับเฉพาะบรรทัดที่มีทะเบียน. ถ้าเปิด setting โหมดบังคับ → block

resolver ตัวนี้ใช้ร่วมทั้ง 2 entry point:
- **หน้า SO** (`sales-planning/sales-orders/[id]`): SO ที่ `approved` + ยังไม่มีใบยื่น → ปุ่ม "สร้างการยื่นชำระ"
- **หน้า filings** (`/tax/filings` สร้างใหม่): เลือกลูกค้า → โชว์ SO ที่ approved + ยังไม่มีใบยื่น ของลูกค้ารายนั้น → เลือก

## 3. แผน PR (เสนอ 5 ใบ, ไล่ทีละเฟส)

| PR | เนื้อหา | migration |
|---|---|---|
| **1** | mig เพิ่มคอลัมน์ (salesOrderId/amountToCollect/collected*/docsDelivered* + salesOrderLineId) + `workflow.js` เพิ่ม state draft/delivered + resolver `lib/excise/soFiling.js` + เทสต์ resolver | ✅ |
| **2** | สร้างใบยื่นจาก SO: ปุ่มบนหน้า SO + endpoint create-from-SO (derive lines, snapshot tax, กัน 1 SO 1 ใบ) | — |
| **3** | หน้า filings สร้างใหม่แบบเลือกลูกค้า→SO (แทนโมดัลเลือกทะเบียนเดิม) + ตัวกรอง SO ค้างยื่น | — |
| **4** | ขั้น ② ยอดเก็บ: สรุปยอด + ยืนยันเก็บเงิน (ต่อยอด ReceiveDialog) + ขั้น ⑤ delivered (SA ส่งเอกสาร + แนบหลักฐาน) | — |
| **5** | setting โหมดบังคับทะเบียน + gate ตอน transfer เต็มตัว + เก็บงานเสริม (แจ้งเตือน LG ตอนส่งมอบ, รายงาน) | อาจมี |

## 4. จุดเสี่ยง / ต้องระวัง

- **สองโลก permission ตัดกัน**: SO เขียนด้วย `salesplan:*`/AE-Supervisor; filing เขียนด้วย `sales:act`/`legal:approve`. ใบยื่นเป็นของโมดูลภาษี (อ่าน SO ข้ามโมดูล) ตาม BOUNDARY_MAP — **ห้ามให้ปุ่มบนหน้า SO เขียนตาราง orders ตรง ๆ** ต้องยิง endpoint ของโมดูลภาษี
- **SO line ไม่มีช่องภาษี** → ภาษีมาจากทะเบียน snapshot เท่านั้น (เหมือน orders เดิม) — resolver ต้อง handle บรรทัดไม่มีทะเบียน
- **SO ถูกยกเลิก/Won-reversal หลังสร้างใบยื่นแล้ว**: ต้องกันหรือเตือน (ใบยื่นอ้าง SO ที่ถูกถอน) — เคาะตอน PR2
- **ยอดเก็บ vs ยอดยื่นจริง**: มติ 2 = เก็บ = excise+local; แต่ยอดที่ LG ยื่นจริงอาจต่างจากยอดสรุป (ปรับที่กรม) — เก็บทั้ง `amountToCollect` (ตอนสร้าง) และ `exciseTaxPaidAmount` (ตอน complete) แยกกัน ไม่ทับกัน
- **1 SO 1 ใบยื่น** = unique constraint กันซ้ำระดับ DB (ไม่ใช่แค่ UI)

## 5. สิ่งที่ reuse ได้ (ไม่ต้องสร้างใหม่)

workflow.js (SoT สถานะ) · Timeline/StatusBadge/RejectDialog/ConfirmDialog · AttachmentsPanel + docTypes (`excise_proof`/`tax_receipt`) · requirements-gate pattern (`lib/tax/requirements.js`) · ReceiveDialog/FileTaxDialog · โครงหน้า detail ของ `/tax/filings/[id]`

เกี่ยวข้อง: [[excise-product-link]] · [[sales-orders-review-findings]] · [[product-category-compliance-flags]]
