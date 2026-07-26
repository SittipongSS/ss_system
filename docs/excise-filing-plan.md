# แผน implement: ยื่นชำระภาษีสรรพสามิตจริง ผูกกับ SO (Excise Filing v2)

> สถานะ: **Implementation เสร็จใน draft PR
> [#738](https://github.com/SittipongSS/ss_system/pull/738)**
> (2026-07-26; migration, two entry points, workflow ใหม่ และ CI ครบ)
> เปลี่ยนการยื่นชำระภาษีสรรพสามิต (Track 2) จาก "สร้างมือเลือกทะเบียนทีละตัว" →
> "ยื่นตาม SO ที่อนุมัติแล้ว" เพราะ SO คือใบที่แบก Actual = สินค้าสรรพสามิตในนั้นคือของที่ต้องยื่น

## 0. มติที่ lock แล้ว (2026-07-22)

1. **1 SO = 1 ใบยื่น** (one-to-one, `salesOrderId` unique บนใบยื่น)
2. **ยอดเก็บลูกค้า = ภาษีสรรพสามิต + ภาษีท้องถิ่นเท่านั้น** (ไม่รวมค่าสินค้า/VAT) → ตรงกับ `orders.totalTax` เดิม
3. **เก็บทางสร้างมือไว้ แต่เปลี่ยนหัวใจ**: หน้า `/tax/filings` สร้างใบยื่นได้เหมือนเดิม แต่แทน "เลือกทะเบียนทีละรายการ" ด้วย "เลือกลูกค้า → เลือก SO ที่ยังค้างยื่น" — สองทาง (จากหน้า SO / จากหน้า filings) บรรจบที่การเลือก SO
4. **SO ↔ Tax แตะกันจุดเดียว = การยื่นชำระ**. การ**ขึ้นทะเบียน** เป็นเรื่องของขั้นฐานข้อมูลสินค้า (ทำแล้ว [[excise-product-link]]) ไม่ผูกเข้าท่อ filing — resolver ไม่ต้องหาทะเบียน; ภาษีมาจากตัวสินค้าเอง (`products.exciseTax/localTax`). อย่างมากใบยื่นแค่ **แจ้งเตือน** "FG นี้ยังไม่ขึ้นทะเบียน" (ไม่บล็อก ไม่มีโหมดบังคับ)

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
- `order_items` += `salesOrderLineId` (FK → sales_order_lines, โยงกลับบรรทัด SO ต้นทาง) — `registrationId` เดิม**ไม่บังคับ** (ทะเบียนไม่ใช่เงื่อนไขของ filing แล้ว; ถ้ามีทะเบียน approved ก็เก็บอ้างอิงไว้เฉย ๆ ได้)
- ⚠️ `orders.status` เดิมเป็น free-text (ไม่มี CHECK) → เพิ่ม state `draft`/`delivered` ได้เลย ไม่ต้องแก้ constraint; อัปเดต `workflow.js` เป็นแหล่งความจริงเดียว

## 2. หัวใจใหม่: สร้างใบยื่นจาก SO (resolver กลาง)

สร้าง helper กลาง `lib/excise/soFiling.js` — resolve "บรรทัดที่ต้องยื่นของ SO นี้":
1. โหลด `sales_order_lines` ของ SO → กรองเฉพาะบรรทัดที่ `categoryFlags(fgCode).isExcise === true` (ผ่าน product_types, mig 0131)
2. คิดภาษี/บรรทัด = (`product.exciseTax` + `product.localTax`) × qty — **มาจากตัวสินค้าเอง ไม่ต้องหาทะเบียน**; snapshot ลง order_items ตอนสร้าง (กันภาษีเพี้ยนถ้าแก้ราคาสินค้าทีหลัง เหมือน orders-POST เดิมที่ freeze rate ตอนสร้าง)
3. **ทะเบียน = แค่ธงเตือน (มติ 4):** เช็คว่ามี `excise_registrations` approved (product+customer) ไหม ถ้าไม่มี → ธง `needsRegistration` (UI เตือน + ลิงก์ไปขึ้นทะเบียน [[excise-product-link]]) แต่**ไม่บล็อก ไม่กระทบการคิดภาษี**

resolver ตัวนี้ใช้ร่วมทั้ง 2 entry point:
- **หน้า SO** (`sales-planning/sales-orders/[id]`): SO ที่ `approved` + ยังไม่มีใบยื่น → ปุ่ม "สร้างการยื่นชำระ"
- **หน้า filings** (`/tax/filings` สร้างใหม่): เลือกลูกค้า → โชว์ SO ที่ approved + ยังไม่มีใบยื่น ของลูกค้ารายนั้น → เลือก

## 3. แผน PR (เสนอ 5 ใบ, ไล่ทีละเฟส)

| PR | เนื้อหา | migration |
|---|---|---|
| **1** | ✅ migration `0160` + `workflow.js` + resolver + 5 resolver tests | ✅ |
| **2** | ✅ หน้า SO + Tax-owned create/read endpoint + snapshot + unique 1 SO 1 ใบ | — |
| **3** | ✅ หน้า filings เลือกลูกค้า→SO ที่ approved, อยู่ใน scope และยังไม่มีใบยื่น | — |
| **4** | ✅ `amountToCollect`, confirmed collection audit และ `complete → delivered` พร้อม confirm dialog | — |
| **5** | ⚠️ dashboard/work queue + filter/report status + advisory warning เสร็จ; Google Chat Legal deferred เพราะยังไม่มี Legal space | — |

### Implementation checkpoint — 2026-07-26

- หน้า SO อ่าน downstream filing และเรียก API ฝั่ง Tax เท่านั้น ไม่เขียน `orders` โดยตรง
- หน้า `/tax/filings` และหน้า SO ใช้ resolver/create endpoint เดียวกัน
- candidate selector กรอง approved SO ตาม edit scope, ตัด SO ที่มี filing แล้ว และตัด SO
  ที่ไม่มี taxable excise lines
- อัตราภาษีและจำนวนถูก snapshot ลง `order_items`; ทะเบียนเป็น advisory เท่านั้น
- หน้า filing ลิงก์กลับ SO และแสดง warning จาก `registrationId` ที่ว่าง
- server บล็อกการยกเลิก/reverse Won ของ SO เมื่อมี downstream filing
- workflow และ dashboard รู้จัก `draft`/`delivered`; การส่งเอกสารใช้ confirm dialog
- 764 tests, migration checker, targeted lint และ production build ผ่าน

## 4. จุดเสี่ยง / ต้องระวัง

- **สองโลก permission ตัดกัน**: SO เขียนด้วย `salesplan:*`/AE-Supervisor; filing เขียนด้วย `sales:act`/`legal:approve`. ใบยื่นเป็นของโมดูลภาษี (อ่าน SO ข้ามโมดูล) ตาม BOUNDARY_MAP — **ห้ามให้ปุ่มบนหน้า SO เขียนตาราง orders ตรง ๆ** ต้องยิง endpoint ของโมดูลภาษี
- **ปุ่ม "สร้างการยื่นชำระ" ลงบนหน้า SO detail** ซึ่งกำลังถูก rewrite (`docs/system-modernization/qt-so-unified-detail-page.md`) — จัดเป็น entity-action ตาม page-header standard ให้เข้ากับ design system กลางที่ rewrite วางไว้ (โน้ตไว้ในสเปกนั้นแล้ว)
- **SO line ไม่มีช่องภาษี** → ภาษีมาจาก `products.exciseTax/localTax` (ตัวสินค้า) snapshot ตอนสร้าง; สินค้าที่ `isExciseTaxable=false` (ยกเว้นรายตัว) → ภาษี 0 ไม่เข้าใบยื่น
- **SO ถูกยกเลิก/Won-reversal หลังสร้างใบยื่นแล้ว**: ต้องกันหรือเตือน (ใบยื่นอ้าง SO ที่ถูกถอน) — เคาะตอน PR2
- **ยอดเก็บ vs ยอดยื่นจริง**: มติ 2 = เก็บ = excise+local; แต่ยอดที่ LG ยื่นจริงอาจต่างจากยอดสรุป (ปรับที่กรม) — เก็บทั้ง `amountToCollect` (ตอนสร้าง) และ `exciseTaxPaidAmount` (ตอน complete) แยกกัน ไม่ทับกัน
- **1 SO 1 ใบยื่น** = unique constraint กันซ้ำระดับ DB (ไม่ใช่แค่ UI)

## 5. สิ่งที่ reuse ได้ (ไม่ต้องสร้างใหม่)

workflow.js (SoT สถานะ) · Timeline/StatusBadge/RejectDialog/ConfirmDialog · AttachmentsPanel + docTypes (`excise_proof`/`tax_receipt`) · requirements-gate pattern (`lib/tax/requirements.js`) · ReceiveDialog/FileTaxDialog · โครงหน้า detail ของ `/tax/filings/[id]`

เกี่ยวข้อง: [[excise-product-link]] · [[sales-orders-review-findings]] · [[product-category-compliance-flags]]
