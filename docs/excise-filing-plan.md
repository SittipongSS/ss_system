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

## 4.1 ด่านทางเดินสถานะที่ server (ตรวจระบบ 2026-10-26 ข้อ 4)

🐞 `PATCH /api/orders/[id]` เดิมเช็กสถานะต้นทางแค่ 3 ปลายทาง (รอรับเงิน · รับเงินแล้ว · ส่งเอกสารแล้ว) ⇒ ฝ่าย RA
สั่ง "กำลังยื่น"/"ชำระแล้ว" จากร่างหรือรอรับเงินได้ตรง ๆ (ข้ามการรับเงินจากลูกค้า) · ตีกลับใบที่ชำระแล้วได้ ·
เลขใบเสร็จ S&S / ใบเสร็จสรรพสามิตบังคับแค่ในโมดัล — ยิง API ตรงปิดงานได้โดยไม่มีใบเสร็จ

ตอนนี้ตารางเดียว `FILING_TRANSITIONS` ([`lib/excise/workflow.js`](../webapp/src/lib/excise/workflow.js)) ตัดสินทุกปลายทาง
ผ่าน `filingTransitionError` ใน route · ปุ่มตีกลับบนหน้าใบยื่นอ่านตารางเดียวกัน (`canTransitionFiling`)

⭐ **ตั้งแต่แผนรื้อสรรพสามิต PR5 (29/10) ใบยื่นเป็นของ RA ทั้งเส้น** — ขั้น "รอรับเงิน/รับเงินแล้ว" ของฝ่ายขายเลิกใช้ (เงินค่าภาษีเก็บด้วย
SO ค่าสรรพสามิต · บัญชีปิดใบ) · ด่านเริ่มยื่นอีกสองข้อ (เงินปิดใบแล้ว · ทะเบียนครบ — ข้ามได้ใส่เหตุผล) อยู่ที่ `filingStartGateError`
(`lib/excise/raFilingRules.js`) · รายละเอียด `docs/excise-qt-so-rework-plan.md` หมวด 7.5

| ปลายทาง | ใคร | มาจาก | ต้องมี (ใบยกเว้นไม่ต้อง) |
|---|---|---|---|
| กำลังยื่น | RA | ร่าง · ตีกลับ (ใบยกเว้นเข้าไม่ได้) | ด่านเงิน + ด่านทะเบียน (หรือเหตุผลข้าม) |
| ชำระแล้ว | RA | กำลังยื่น · **ใบยกเว้น: ร่าง** | เลขที่ใบเสร็จสรรพสามิต |
| ส่งเอกสารแล้ว | RA | ชำระแล้ว | — |
| ตีกลับ | RA | กำลังยื่น | เหตุผลที่ตีกลับ (ทุกใบ) |

<details><summary>ตารางก่อน PR5 (เลนฝ่ายขายเก็บเงินบนใบยื่น · เลิกใช้)</summary>

| ปลายทาง | ใคร | มาจาก | ต้องมี (ใบยกเว้นไม่ต้อง) |
|---|---|---|---|
| รอรับเงิน | ฝ่ายขาย | ร่าง | — |
| รับเงินแล้ว | ฝ่ายขาย | รอรับเงิน · ตีกลับ | เลขที่ Invoice/Receipt ของ S&S |
| กำลังยื่น | RA | รับเงินแล้ว (ใบยกเว้นเข้าไม่ได้) | เลขที่ใบกำกับภาษี |
| ชำระแล้ว | RA | กำลังยื่น · **ใบยกเว้น: รับเงินแล้ว** | เลขที่ใบเสร็จสรรพสามิต |
| ส่งเอกสารแล้ว | ฝ่ายขาย | ชำระแล้ว | — |
| ตีกลับ | RA | รับเงินแล้ว · กำลังยื่น | เหตุผลที่ตีกลับ (ทุกใบ) |

</details>

- "ยกเว้น" ตัดสินจากทะเบียนของรายการ (`stampExemptFlags` → `isExemptFiling`) ไม่ใช่ยอด 0 — ดู `docs/excise-retail-price.md`
- ช่องบังคับนับทั้งค่าที่ส่งมากับคำขอและค่าที่เก็บไว้บนใบแล้ว · ค่าที่ผ่านด่านถูกตัดช่องว่างหัวท้ายก่อนลงฐาน
- ทางย้อน "กำลังยื่น → รับเงินแล้ว" ที่คอมเมนต์เดิมเขียนไว้ **ไม่เคยมีจริง** (โค้ดเดิมปฏิเสธอยู่แล้ว · ไม่มีปุ่มบนจอ) — ตารางไม่ประกาศ

## 4.2 ด่านของทะเบียนสินค้าที่ server (ตรวจระบบ 2026-10-26 ข้อ 5–6 · แก้ 2026-10-29)

🐞 ข้อ 5 — `PATCH /api/excise-registrations/[id]` เขียน `status` ตาม body ตรง ๆ ให้ทุกคนที่ถือ `ra:approve` ⇒ อนุมัติร่าง
ที่ยังไม่ยื่นได้ (ข้ามด่านเอกสารบังคับ) · ยื่นแทนฝ่ายขายโดยไม่ผ่านด่านเอกสาร · ตีกลับใบที่ยังไม่ยื่น · ตั้งค่าที่ไม่ใช่สถานะ ·
เลขที่อนุมัติบังคับแค่ใน `ApproveDialog`

ตอนนี้ตาราง `REGISTRATION_TRANSITIONS` (ไฟล์เดียวกับ `FILING_TRANSITIONS`) ตัดสินก่อนแตะแถว ผ่าน `registrationTransitionError`

| ปลายทาง | ใคร | มาจาก | ต้องมี |
|---|---|---|---|
| รออนุมัติ (ยื่น) | ฝ่ายขาย | ร่าง · ตีกลับ | เอกสารบังคับครบ (ด่านเดิมใน route) |
| ขึ้นทะเบียนแล้ว | RA | รออนุมัติ | เลขที่อนุมัติ |
| ตีกลับ | RA | รออนุมัติ | เหตุผลที่ตีกลับ |

- อนุมัติแล้ว → ร่าง (ปลดอนุมัติ) อยู่นอกตาราง — เส้นแยกของมันเดิม (RA + เหตุผล + แจ้งเตือน)
- ไม่มี CHECK ระดับฐาน (ไม่เปลืองเลข migration · ข้อมูลจริง 29/10 มีแค่สองค่า: อนุมัติแล้ว 36 · รออนุมัติ 5 · ทุกใบอนุมัติมีเลข)

🐞 ข้อ 6 — ฝ่ายขายเปลี่ยน FG ได้ระหว่างฝ่าย RA ตรวจ: สถานะไม่ถอย และฉลาก/Artwork ของ FG ตัวเดิมยังติดใบ ⇒ RA อาจอนุมัติ
FG ตัวใหม่ด้วยเอกสารของตัวเก่า

ตอนนี้ FG/ลูกค้าของทะเบียนแก้ได้เฉพาะ **ร่าง · ตีกลับ** (`REGISTRATION_LINK_EDITABLE_STATUSES`) — รออนุมัติ = 409 พร้อม
`REGISTRATION_LINK_LOCKED_MESSAGE` · ปุ่มแก้ไขบนหน้าทะเบียนยังโชว์แล้วบอกเหตุด้วยข้อความชุดเดียวกัน (กติกา GatedAction) ·
ทะเบียนไม่มีปุ่มดึงกลับ ⇒ เลือก FG ผิดตอนยื่น = ให้ RA ตีกลับก่อนแล้วค่อยแก้

## 5. สิ่งที่ reuse ได้ (ไม่ต้องสร้างใหม่)

workflow.js (SoT สถานะ) · Timeline/StatusBadge/RejectDialog/ConfirmDialog · AttachmentsPanel + docTypes (`excise_proof`/`tax_receipt`) · requirements-gate pattern (`lib/tax/requirements.js`) · ReceiveDialog/FileTaxDialog · โครงหน้า detail ของ `/tax/filings/[id]`

เกี่ยวข้อง: [[excise-product-link]] · [[sales-orders-review-findings]] · [[product-category-compliance-flags]]
