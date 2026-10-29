# แผนรื้อระบบภาษีสรรพสามิต v2 — ใบเสนอราคาค่าสรรพสามิต (ฟอร์ม QT · SA ออก · ไม่มีดีล) → SO ค่าสรรพสามิต (ไม่นับ Actual) → บัญชี → RA ยื่นกรม

**สถานะ:** กำลังดำเนินการ · มติครบ 28/10 (Q1–Q8b + D1–D9) · **0414 รันบน prod แล้ว · PR1 (#1937) ขึ้น prod 28/10 `f4c4bca0` · PR2 (#1939) ขึ้น prod 28/10 `e8fee650`** · **0415 รันบน prod แล้ว 28/10** (ตรวจ: patched 4 · accept_fn 1 · accept_grant 0) · **PR3 (#1940) ขึ้น prod 28/10 `9cc76168`** · **0416 รันบน prod แล้ว 29/10** (ตรวจ: patched 3 · create_fn 1 · create_grant 0 · revoke_guard 1) · **PR4 (#1941) ขึ้น prod 29/10 `e647977d`** · **D7 ตอบครบ 29/10** (01-015 ต้องเสียภาษี · ยื่นกรมทีละ SO) · **0417 รันบน prod แล้ว 29/10** (ตรวจ: cols 7 · uidx 1 · qty_numeric true · link_guard 1 · cancel_guard 1) · **PR5 (#1943) ขึ้น prod 29/10 `6f757a52`** · ใบทดลอง SO-26080010-0 เริ่ม 29/10 (ใบเสนอราคาค่าสรรพสามิต QT-26100568-0) · เลขแผนเลื่อน +1 ทั้งชุด เพราะ 0413 ถูกใช้โดย #1936
**เขียน:** 2026-10-28 · อ้างโค้ด `origin/main` ที่ `250648bc0` (migration ล่าสุด **0412**) · ตัวเลข prod อ่านเมื่อ 26–28/10 (อ่านอย่างเดียว)
**แทน:** แผนฉบับ 27/09 (แบบ B — RA ออกใบ ET) ซึ่งตกไปตามมติ 28/10 · สำเนาเดิม `~/ss-team/audit/excise-rework-20260927/excise-qt-so-rework-plan-v1-20260927.md` (หมวด 3, 6, 10, 13–15 ของฉบับเดิมยังเป็นข้อมูลอ้างอิงที่ถูกต้อง)

---

## 0. สรุปหน้าเดียว

**เส้นทาง:** SO ลูกค้าอนุมัติ → **SA ออกใบเสนอราคาค่าสรรพสามิต** ด้วยฟอร์ม QT เดิม (ระบบสร้างบรรทัดจาก SO ให้) → ผู้จัดการอนุมัติ → ลูกค้ารับ → SA สร้าง **SO ค่าสรรพสามิต** → ผู้จัดการอนุมัติ → **บัญชีเดินขั้นปกติ** (รับรองเงิน → ใบกำกับ → ปิดใบ) → **RA ยื่นกรม** แล้วส่งใบเสร็จให้ลูกค้า

**เอกสารสองชิ้นเป็นแถวจริงในตารางเดิม ไม่มีดีล:**

| เอกสาร | ตาราง | ต่างจากใบขายปกติ |
|---|---|---|
| ใบเสนอราคาค่าสรรพสามิต | `quotations` · `origin = 'excise'` · `dealId` ว่าง · `sourceSalesOrderId` = SO ลูกค้า | บรรทัดระบบสร้าง แก้ราคาไม่ได้ · ไม่แตะดีล/FC/Won |
| SO ค่าสรรพสามิต | `sales_orders` · `origin = 'excise'` · `dealId` ว่าง · `sourceSalesOrderId` = SO ลูกค้า | `actualAmount = 0` บังคับด้วย CHECK · ไม่มี Rev. · ไม่มีโครงการ |

**สิทธิ์ของใบไม่มีดีล = สิทธิ์ของดีลที่ SO ต้นทางสังกัด** — `quotations`/`sales_orders` ไม่มีคอลัมน์ทีมหรือเจ้าของของตัวเอง ดีลของ SO ลูกค้าคือที่เดียวที่มีทีมและเจ้าของ (หมวด 3.7)

**สินค้า `FG-<รหัสลูกค้า>-04-003`** ลูกค้าละตัว ระบบสร้างให้ตอนออกใบแรก · บรรทัดละ FG ต้นทาง · ราคา/ชิ้น = ภาษี 8.8% ปัดครั้งเดียว

**งานทั้งหมด:** migration 4 ไฟล์ (เลขชั่วคราว 0414–0417) · PR 6 ใบ ตามหมวด 7 · ผ่านตัวค้านตรวจกับโค้ดจริงหนึ่งรอบแล้ว (2 BLOCKER · 8 MAJOR · 12 MINOR แก้ลงแผนครบ — สรุปท้ายเอกสาร) · ไม่มีการย้ายข้อมูลเอกสาร (ตาราง `orders` ยังว่าง) · ใบค้าง 49 ใบเข้าคิวตอนเปิดระบบ

---

## 1. มติที่ใช้ (28/10/2026 · ถามทีละข้อในแชต)

| เรื่อง | มติ | ต่างจากค่าแนะนำเดิม |
|---|---|---|
| ฟอร์ม (Q1/Q1b) | ใช้ฟอร์มเดียวกับใบเสนอราคา | ✔ (ค่าแนะนำเดิม = ใบ ET ของ RA) |
| คนออกใบ | SA ในระบบขาย · RA รับช่วงเฉพาะทะเบียน/ยื่นกรม | ✔ |
| ดีล | ไม่มีดีล ผูก SO ต้นทาง | — |
| Actual | ไม่นับ | — |
| บัญชี | ตรวจเหมือน SO ปกติ | — |
| 04-003 (Q20) | สินค้า `FG-<ลูกค้า>-04-003` ลูกค้าละตัว · ระบบสร้างให้เอง | ✔ (ค่าแนะนำเดิม = บรรทัดไม่มีสินค้า) |
| บรรทัด | บรรทัดละ FG ต้นทาง | — |
| Q2 ปัดเศษ | 8.8% แล้วปัดครั้งเดียวต่อชิ้น | ✔ |
| Q3 ทะเบียน | เตือนตอนออกใบ · บังคับตอนยื่นกรม (ข้ามได้ถ้าใส่เหตุผล) · ราคาขายปลีกบังคับตั้งแต่ออกใบ | — |
| Q4 ราคา/ทะเบียน | SA กรอกราคาขายปลีก + ร่างทะเบียน · RA อนุมัติ (เส้นเดิม) | ✔ |
| Q5 หน่วยใบ | 1 SO ลูกค้า = 1 ใบค่าสรรพสามิต (จำนวนเต็มทั้ง SO) | — |
| Q6 ใบค้าง | เข้าคิวทั้งหมด ติดป้าย "ก่อนเปิดระบบ" + ทาง "ไม่เรียกเก็บในระบบ" | — |
| Q7 QT ราคารวมภาษี | ยังทำได้ (ส่วนนั้นนับ Actual) → SA กด "ไม่เรียกเก็บ — ราคารวมแล้ว" · RA ยื่นกรมอย่างเดียว | ✔ |
| Q8a สหมิตร | ตัดออกก่อน | — |
| Q8b 01-015 | ถาม RA · คงธงไว้ระหว่างนี้ | — |

**Q9–Q25** ใช้ค่าแนะนำ ปรับตามมติข้างบนแล้ว: เลข SO- ชุดเดิม · VAT 7% บนยอดภาษี · งานเกิดตอน SO ลูกค้าอนุมัติ · SA แจ้งชำระพร้อมสลิป → FN รับรอง · ลายเซ็นตามกติกา QT/SO ปกติ · แก้ใบค่าสรรพสามิตด้วย Rev. แบบ QT · RA ยื่นกรมก่อนลูกค้าจ่ายได้ถ้าใส่เหตุผล · RA ส่งใบเสร็จกรม · ถอด `ra:approve` รายคน · FN ลง 04-003 เป็นบัญชีรับแทน · admin สำรอง RA · คงงานไทม์ไลน์ SA "วางบิล + ค่าสรรพสามิต"

**คำร้องขอเอกสารบัญชีจากใบค่าสรรพสามิต (29/10 · ถามในแชต):** ผูกคำร้องกับ **ดีลของ SO ลูกค้าต้นทาง** (ค่าแนะนำ) — ทีม/สิทธิ์/ลูกค้าของคำร้องเดินตามดีลนั้น เกณฑ์เดียวกับสิทธิ์ของใบ (หมวด 3.7) · server อ่านดีลต้นทางเอง ไม่เชื่อฟอร์ม

**ข้อปลีกย่อย D1–D9** ตัดสินครบแล้ว 28/10 (หมวด 10) — ทุกข้อตามค่าแนะนำ · D7 ได้คำตอบ 29/10 (01-015 ต้องเสียภาษี · ยื่นกรมทีละ SO = ค่าตั้งต้นทั้งสองข้อ)

---

## 2. เส้นทางทีละขั้น

| # | ขั้น | ใคร | ที่ไหน | เกิดอะไร | ด่าน |
|---|---|---|---|---|---|
| 1 | SO ลูกค้าอนุมัติ | ผู้จัดการขาย | `/sa/sales-orders/[id]` (เดิม) | นับ Actual ตามเดิม | เดิม |
| 2 | งานเข้าคิว SA | ระบบ | คิว "รอออกใบค่าสรรพสามิต" (หน้า SO รายการ + เส้นเดินงานบน SO + ป้ายเมนู) | คำนวณสด ไม่เก็บ | SO pipeline อนุมัติ · มีบรรทัดต้องเสียภาษี · ยังไม่มีใบค่าสรรพสามิตที่ยังมีผล · ยังไม่ตัดสิน "ไม่เรียกเก็บ" · ไม่ใช่สหมิตร |
| 3a | ออกใบเสนอราคาค่าสรรพสามิต | SA (ทีมของดีลต้นทาง) | ปุ่มบน SO ลูกค้า → หน้า QT โหมดค่าสรรพสามิต | แถว `quotations` origin excise สถานะร่าง · ระบบสร้างสินค้า 04-003 ถ้ายังไม่มี · บรรทัดจาก SO | **ทุก FG ต้องมีราคาขายปลีก** (ไม่มี = ออกใบไม่ได้) · ไม่มีทะเบียนอนุมัติ = เตือน · ยอดรวม > 0 |
| 3b | หรือ "ไม่เรียกเก็บในระบบ" | SA | เมนูบนแถวคิว / บน SO ลูกค้า | ประทับบน SO ลูกค้า: ชนิด (เก็บนอกระบบแล้ว · ราคารวมภาษีแล้ว · ไม่ต้องเสีย) + เหตุผล ≥ 10 ตัว + เลขอ้างอิง | ทำได้เมื่อไม่มีใบค่าสรรพสามิตที่ยังมีผล |
| 4 | แก้ใบ | SA | หน้า QT โหมดค่าสรรพสามิต | แก้หัวใบได้ (วันที่ หมายเหตุ ผู้ติดต่อ ภาษาเอกสาร งวดชำระ) · บรรทัดแก้ไม่ได้ มีแต่ปุ่ม "คิดใหม่จาก SO" | ตามกติกา QT ร่าง |
| 5 | ยื่นอนุมัติ → อนุมัติ | SA → เจ้าของดีลต้นทางหรือผู้จัดการขาย | RPC เดิมของ QT (ปะให้หาดีลผ่าน SO ต้นทาง) | ลายเซ็นผู้เสนอ/ผู้อนุมัติ · ตรึงเอกสาร FM-SA-01 | เดิม · โมดัลบอกผล |
| 6 | ลูกค้ารับ | SA | ปุ่มรับใบบนหน้า QT | `accept_excise_quotation_atomic` (ไม่แตะดีล) | ใบอนุมัติแล้ว · SO ต้นทางยังอนุมัติและไม่ถูกแทน · ใบที่รับแล้วได้ใบเดียวต่อ SO ต้นทาง |
| 7 | สร้าง SO ค่าสรรพสามิต | SA | `/sa/sales-orders/new?quotationId=` (เดิม) | `create_excise_sales_order_draft` · origin excise · ไม่มีดีล/โครงการ · Actual 0 · บรรทัดลอกจาก QT | QT รับแล้ว · ยังไม่มี SO ที่ยังมีผลของ QT ใบนี้ |
| 8 | ยื่น → อนุมัติ SO | SA → ผู้จัดการขาย | ด่าน/RPC เดิม (ปะสาขา excise) | `financeStatus = 'pending'` · งวดตรึง · **ไม่นับ Actual** · `actualMode` = 'order' เสมอ | เดิม ยกเว้นข้อบังคับโครงการ/ดีล |
| 9 | แจ้งชำระ + สลิป | SA | แท็บการชำระ (เดิม) | งวด → reported | เดิม |
| 10 | รับรองเงิน · ใบกำกับ · ปิดใบ | FN | `/finance/payments` + การ์ดบัญชี (เดิม) | confirmed · `taxInvoiceNo` · `financeStatus approved` | เดิม |
| 11 | งานเข้าคิว RA | ระบบ | `/tax` คิว "รอยื่นกรม" | คำนวณสด | SO ค่าสรรพสามิตอนุมัติแล้ว **หรือ** SO ลูกค้าตัดสิน "ไม่เรียกเก็บ" แบบเก็บนอกระบบ/ราคารวมแล้ว · ยังไม่มีใบยื่น |
| 12 | สร้างใบยื่น + เริ่มยื่น | RA | `/tax/filings` | แถว `orders` ผูก SO ลูกค้า (+ SO ค่าสรรพสามิต) · รายการจากบรรทัดใบค่าสรรพสามิต | ทะเบียนอนุมัติครบ (ข้ามได้ใส่เหตุผล) · เงิน FN รับรองแล้ว (ข้ามได้ใส่เหตุผล) |
| 13 | บันทึกยื่นเสร็จ → ส่งใบเสร็จ | RA | หน้าใบยื่น | complete → delivered | เลขใบเสร็จกรม (บังคับที่ server · #1925) |

SA เข้า `/tax` เฉพาะร่างทะเบียน (เส้นเดิมตาม Q4 — `RegistrationFormModal` อยู่ใต้ `/tax/registrations`) ไม่แตะใบยื่น · RA ไม่เข้าหน้าขาย (อ่านสรุป SO ผ่าน API ของ `/tax`) · FN ใช้ `/finance` ตามเดิม
"SA" ในขั้น 5–9 หมายถึงคนที่กติกาเดิมยอม: ยื่น QT/SO = เจ้าของดีลต้นทางหรือผู้จัดการขาย (`canSubmitSalesOrder` · `salesOrderWorkflow.js:37-43`) · ยกเลิก QT = ผู้อนุมัติ (กติกา 24/09)

---

## 3. แบบข้อมูล

### 3.1 ใบเสนอราคาค่าสรรพสามิต (`quotations`)

- คอลัมน์ใหม่ `origin` (`'pipeline'` | `'excise'` · ค่าตั้งต้น pipeline · แก้ไม่ได้หลังเกิด) และ `sourceSalesOrderId` (FK → `sales_orders` ON DELETE RESTRICT)
- CHECK `quotations_origin_shape`: pipeline ⇔ มีดีล ไม่มี SO ต้นทาง · excise ⇔ ไม่มีดีล มี SO ต้นทาง · แล้วจึงปลด NOT NULL ของ `dealId`
- ใบที่ **รับแล้ว** ได้ใบเดียวต่อ SO ต้นทาง (partial unique index) · ใบร่าง/ส่งแล้วที่ยังมีผลต้องไม่ซ้ำ — ตรวจในแอป (index บนสถานะร่างใช้ไม่ได้ เพราะเส้น Rev. แทรกใบใหม่ก่อนพลิกใบเดิม — `revise/route.js` ไม่ atomic)
- เลข: ใช้ตัวนับและรูปแบบ QT- ชุดเดิม (`create_quotation_with_number` ไม่ผูกดีล · `quote_number_counters` คีย์ปีอย่างเดียว) — ค่าตั้งต้น ทักได้
- หัวใบ: ลูกค้า/ที่อยู่/ผู้ติดต่อ/เลขผู้เสียภาษี/สาขาลอกจาก QT ต้นทางของ SO ลูกค้า (เหมือนกระดาษที่ลูกค้าเคยได้) · `vatRate = 7` (บวก VAT ท้ายใบ · `QUOTE_VAT_OPTIONS`) ตรึง · งวดชำระตั้งต้น 100% งวดเดียว แก้ได้แบบ QT · ภาษาเอกสารตาม QT ต้นทาง
- เอกสาร: มาตรฐาน `quotation` (FM-SA-01) ตัวเดิม · บล็อก "ข้อมูลอ้างอิง" (**มติเจ้าของ 29/10** จากกระดาษใบทดลอง): เลขที่โครงการ `-` · โครงการ **ค่าภาษีสรรพสามิต** (EN: Excise tax recharge) · ประเภทโครงการ **OTHER** · ผู้เสนอราคา + โทร = AE เจ้าของดีลของ SO ต้นทาง · เอกสารอ้างอิง `SO-xxxx / QT-xxxx` (เดิม "ค่าภาษีสรรพสามิตของ …") · กระดาษ SO ค่าสรรพสามิตใช้คำชุดเดียวกัน (`excisePaperProject` ใน quotationMasterTemplate) · "คิดใหม่จากใบสั่งขาย" เติมผู้เสนอราคา/เบอร์ ณ ตอนนี้ และเขียนทับคำอ้างอิงเฉพาะที่ระบบเขียนเอง
- ⚠️ `createQuotationDraft` ผูกดีลทั้งก้อน (ลูกค้า เจ้าของ ขั้นดีล ประวัติขั้น) — เส้นสร้างใบค่าสรรพสามิตเป็นฟังก์ชันพี่น้อง ใช้ `insertQuotationWithNumber` / `pickDocumentAddresses` / `pickQuotationContact` / `resolvePinnedPresetVersionIds` ร่วม แต่ไม่แตะดีล
- เมตาดาต้าผู้เสนอ `metadata.salesOwner/salesOwnerId/salesOwnerPhone` = เจ้าของดีลต้นทาง (ชื่อตรึงตั้งแต่ 29/10 — ใบไม่มีดีลให้อ่านสด · ใบรุ่นก่อนอ่าน `sourceDeal`)

### 3.2 SO ค่าสรรพสามิต (`sales_orders`)

- `origin` เพิ่มค่า `'excise'` · `sourceSalesOrderId` (FK RESTRICT) · ปลด NOT NULL ของ `dealId` หลังมี CHECK `excise ⇔ dealId ว่าง`
- สาขา excise ของ `sales_orders_origin_shape`: ไม่มีดีล ไม่มีโครงการ · มี `quotationId` (ใบค่าสรรพสามิต) และ `sourceSalesOrderId` · `actualAmount = 0` · `revisionNo = 0` (ไม่มี Rev. — แก้ด้วยยกเลิกแล้วออกใหม่) · ช่อง historical/paymentGateExempt ว่าง · **ยอม** `financeStatus` และลายเซ็น (ต่างจาก historical)
- `actualMode` = 'order' เสมอ (CHECK ของ 0412 ยอมรายงวดเฉพาะ pipeline อยู่แล้ว)
- เจ้าของ (`ownerId/ownerName`) = เจ้าของดีลต้นทาง — ⚠️ trigger `snapshot_sales_order_owner` (0294:41-46) อ่านดีลจาก `dealId` ตรง ๆ ใบไม่มีดีลจะถูก **เขียนทับเจ้าของเป็นค่าว่าง** ⇒ ปะให้ถอยไปดีลของ SO ต้นทาง (0416) · กระดิ่งวางบิล/ใบกำกับส่งถึง `[order.ownerId, deal.ownerId]` (`billingDueNotify.js:245` · `taxInvoiceNotify.js:49`) จึงถึง SA ได้
- เลข SO- ชุดเดิม · ป้าย "ค่าสรรพสามิต · ไม่นับ Actual" ทุกที่ที่แสดงใบ

### 3.3 สินค้า `FG-<รหัสลูกค้า>-04-003`

- ตัวช่วยฝั่ง server `ensureExciseChargeProduct(supabase, { customerId, segmentHint })`:
  - **หาด้วย `customerId` + `categoryCode = '04-003'`** ไม่ใช่ด้วยรหัส (รหัสลูกค้ามีทั้ง 3 และ 4 หลัก)
  - ไม่เจอ → สร้างด้วย admin client: `fgCode` · `customerId` · `customerName` · `categoryCode '04-003'` · `approvalStatus 'approved'` · `isActive true` · `costPrice null` · `exciseTax/localTax 0` · **`isExciseTaxable false` ระบุชัด** (ค่าตั้งต้นของฐานเป็น TRUE — ถ้าปล่อย `resolveSoFiling` จะมองบรรทัดค่าสรรพสามิตเป็นของต้องเสียภาษี แล้ววนยื่นซ้ำ) + `recordAudit` + `recordProductPriceHistory`
  - ชนกัน (23505 · ออกใบสองใบพร้อมกัน) → อ่านซ้ำแล้วใช้ตัวที่มีอยู่
- **ส่วนรหัสลูกค้าในรหัสสินค้า** — `composeFgCode` เติมเป็น 4 หลักเสมอ (AR-108 → `FG-0108-04-003`) แต่ของจริงลูกค้า 3 หลักเขียน `FG-108-…` · prod 28/10: ส่วนรหัสลูกค้า 3 หลัก 123 · 4 หลัก 117 · ลูกค้า 35 รายใช้ปนทั้งสองแบบ ⇒ ค่าตั้งต้น: ใช้รูปเดียวกับสินค้ากลุ่ม 04 ตัวอื่นของลูกค้า ถ้าไม่มีใช้รูปของ FG ต้นทางบรรทัดแรกบน SO ถ้าไม่มีอีกใช้ `composeFgCode`
- **ปิดทางเปิดด้วยมือ:** `POST /api/products` (หลัง `route.js:199`) และ PATCH ที่เปลี่ยนหมวด/รหัส (`[id]/route.js:211,289-297`) ปฏิเสธ 04-003 · `ProductCategorySelect` ซ่อน 04-003 (ใช้ทั้งฟอร์มสินค้าและหมวดของบรรทัดพิมพ์เองใน QT) · `PROTECTED_PRODUCT_CATEGORY_CODES` เพิ่ม 04-003 (`productCategory.test.mjs:102` 11 → 12)
- **ไม่ขึ้นในตัวเลือก QT ขาย:** `GET /api/products` สาขาไม่ใช่โหมดจัดการ (`route.js:114,123`) ตัด 04-003 · server ของ QT pipeline ปฏิเสธบรรทัดที่ productId เป็นสินค้า 04-003 (กันเก็บซ้ำ)
- ข้อมูลจริง 28/10: สินค้าหมวด 04-003 = 0 ตัว · บรรทัด QT/SO ที่รหัสเป็น 04-003 = 0 · บรรทัดที่คำอธิบายมีคำว่า "สรรพสามิต" = 0 ⇒ ด่าน "QT ขายใส่สินค้า 04-003 ไม่ได้" ใช้กับ **บรรทัดที่เพิ่มใหม่** เท่านั้น (ใบเก่าไม่มีให้พังอยู่แล้ว แต่ไม่เขียนด่านแบบทั้งใบ)
- DML: `product_types` 04-003 `nameTh = 'ค่าภาษีสรรพสามิต'` · `nameEn = 'Excise tax recharge'` (ตอนนี้ `nameEn` เป็นคำไทย) · `isExcise` ยัง false (ห้ามติ๊ก)

### 3.4 บรรทัดและสูตร

**ตัวสร้างบรรทัดตัวเดียว** `buildExciseQuotationLines(customerSo)` (ต่อจาก `resolveSoFiling` เดิม):

| ช่อง | ค่า |
|---|---|
| `productId` / `fgCode` | สินค้า 04-003 ของลูกค้า |
| `description` | `<FG ต้นทาง> <ชื่อ>` (EN: `<FG ต้นทาง> <ชื่อ EN>`) — **มติเจ้าของ 29/10** จากกระดาษใบทดลอง: ชื่อสินค้า 04-003 "ค่าภาษีสรรพสามิต" ขึ้นบรรทัดแรกของรายการอยู่แล้ว ไม่ต้องพูดซ้ำ "ค่าภาษีสรรพสามิต 8.8% —" · รหัส FG ตัดช่องว่าง/แท็บท้ายรหัส (บรรทัด SO เก่ามีแท็บ) |
| `qty` | หน่วยรวมของบรรทัด FG (`lineUnitsTotal` = แพ็ค × จำนวน) · `packQty` ว่าง (ทริกเกอร์ 0410 ดูเฉพาะ 02-001 จึงผ่าน) |
| `unit` | หน่วยของบรรทัด FG |
| `unitPrice` | ภาษี/ชิ้น = `round2(ราคาขายปลีก ÷ 1.07 × 8.8%)` |
| `lineTotal` | `round2(qty × unitPrice)` (ตรงกับ CHECK `quotation_lines_line_money_rule` 0407) |
| `metadata` | `lineKind 'excise_charge'` · `sourceSalesOrderLineId` · `sourceProductId` · `sourceFgCode` · `retailPriceIncVat` · `excisePerUnit` · `localPerUnit` · `registrationState` |

**สูตรใหม่ (Q2):** ภาษี/ชิ้น = `round2(ฐาน × 8.8%)` ครั้งเดียว · แบบ ภส. ต้องกรอกสองช่อง ⇒ ค่าตั้งต้น: สรรพสามิต/ชิ้น = `round2(ฐาน × 8%)` · ท้องถิ่น/ชิ้น = ภาษี/ชิ้น − สรรพสามิต/ชิ้น (สองช่องรวมกันเท่ายอดที่เก็บเสมอ) · ปัดด้วยสตางค์จำนวนเต็มแทน `Math.round(v*100)/100` (เคส …5 เพี้ยนจาก float)

ตัวคิดกลาง `exciseTaxLine` เปลี่ยนตาม → กระทบหน้า `/tax` ทั้งหมด (ใบยื่นจริงยังเป็น 0 ใบ ไม่มีใบเก่าเพี้ยน) · จอที่ตอนนี้บวกค่าดิบแล้วค่อยแสดง (หน้าสินค้า หน้าลูกค้า `RegistrationFormModal`) จะตรงกับใบยื่นพอดี

**ล็อกบรรทัด:**
- `enforceMasterPrices` (`quoteLines.js:369-476`) เขียนราคา/คำอธิบาย/หน่วยทับบรรทัดที่มี productId และหาราคาก่อนหน้า **ด้วย productId** — ทุกบรรทัดใช้สินค้าเดียวกันจะยุบเป็นราคาเดียว ⇒ ข้ามเมื่อใบเป็น origin excise **และ** productId เป็นสินค้า 04-003 ของลูกค้า (ตัดสินจากแถวในฐาน ไม่ใช่จาก metadata ที่จอส่งมา — metadata อยู่นอกลายนิ้วมืออนุมัติ ปลอมได้)
- PATCH / Rev. ของใบ excise ปฏิเสธ `lines` จากจอ · บรรทัดเปลี่ยนได้ทางเดียวคือ `recalcFromSalesOrder` (แบบเดียวกับใบยื่น #1924) ระหว่างร่าง/ตีกลับ
- จอ: `quoteLineLocks` (`quoteLines.js:296-303`) ล็อกทุกช่องของบรรทัด excise

### 3.5 "ไม่เรียกเก็บในระบบ" บน SO ลูกค้า

กฎความเป็นเจ้าของโมดูลข้อ 2 — ขั้นของ SA บนเอกสารเดิมเป็นคอลัมน์ ไม่ใช่เอกสารใหม่:
`exciseNotBilledKind` (`collected_outside` | `included_in_price` | `not_liable`) · `exciseNotBilledReason` (≥ 10 ตัว) · `exciseNotBilledRef` (เลข Express / เลข QT) · `exciseNotBilledAt/ById/ByName` · CHECK ให้มีได้เฉพาะใบ pipeline · ถอนได้จนกว่า RA จะสร้างใบยื่น
⚠️ ต้องตรวจตอนลงมือว่า trigger ล็อกใบอนุมัติแล้ว (ถ้ามี) ยอมให้เขียนคอลัมน์ชุดนี้

### 3.6 ใบยื่นกรม (`orders`) — ของ RA

- ยังผูก SO ลูกค้า (`orders.salesOrderId` · unique · FK RESTRICT — ล็อกยกเลิก/Rev./ย้อนอนุมัติ SO ลูกค้าอยู่แล้วที่ `sales-orders/[id]/route.js:1531-1546` · RPC 0376:156-160 · 0166:78-80)
- เพิ่ม `exciseSalesOrderId` (FK RESTRICT · unique บางส่วน) · ช่องเหตุผลข้ามด่าน (`filingSkipMoneyReason` · `filingSkipRegistrationReason`) · `filingStartedAt/ById` · `updatedAt` (ไม่เคยมี) · `order_items.quantity` เป็น numeric (ตาราง 0 แถว)
- **ผู้สร้าง = RA** (วันนี้ POST ต้องมี `sales:act` · `from-sales-order/route.js:248`) · 🔴 **ทางสร้างของ SA ต้องปิดใน PR3** ไม่ใช่รอ PR5 (ตรวจแผน · BLOCKER) — ถ้า SA สร้างใบยื่นบน SO ลูกค้าได้ระหว่างนั้น unique `orders_sales_order_unique_idx` (0160:13) จะกันใบของ RA และ ReceiveDialog เก็บเงินค่าภาษีซ้ำกับ SO ค่าสรรพสามิต
- รายการ: จากบรรทัดใบค่าสรรพสามิต (ยอดที่ลูกค้าจ่ายจริง) · ใบ "ไม่เรียกเก็บ" คิดจาก SO ลูกค้าด้วยตัวสร้างบรรทัดตัวเดียวกัน
  - `order_items.productId` = `metadata.sourceProductId` (FG ต้นทาง — ทะเบียนจับคู่ด้วยตัวนี้ · ห้ามใช้สินค้า 04-003)
  - `order_items.salesOrderLineId` = บรรทัด SO ลูกค้า (`metadata.sourceSalesOrderLineId` · FK ไป `sales_order_lines` · 0160:21)
  - ภาษี/ชิ้น = `unitPrice` ของบรรทัดใบค่าสรรพสามิต · แตกช่อง ภส. ด้วยกติกา D1
  - การคิดใหม่จากใบสั่งขายของ #1924 (`orders/[id]/route.js:160-196` · คิดจากสินค้าปัจจุบัน + ต้องมีขอบเขตขาย) **ปิดสำหรับใบที่ผูก SO ค่าสรรพสามิต** (ยอดที่ลูกค้าจ่ายแล้วห้ามถูกคิดทับ) · ใบ "ไม่เรียกเก็บ" ย้ายสิทธิ์คิดใหม่ไปให้ RA
- `orders.quotationId` (0349) คงความหมายเดิม = QT ลูกค้า · ใบค่าสรรพสามิตหาได้จาก `exciseSalesOrderId → quotationId`
- ⚠️ trigger `orders_assign_excise_tax_notice_identity` (0162:151) ออกเลข ET / FM-TAX-01 "ใบแจ้งชำระค่าภาษีสรรพสามิต" ให้ทุกแถว `orders` และ `billPrint` พิมพ์เป็นเอกสารถึงลูกค้า ⇒ ขัด Q1 (เอกสารถึงลูกค้าคือใบเสนอราคา) · ใบยื่นกลายเป็นเอกสารภายในของ RA: ปุ่ม "ออกใบแจ้งชำระค่าภาษี" ถอดออก · เลข ET ใช้เป็นเลขอ้างอิงภายในของใบยื่น (ไม่ส่งลูกค้า)
- ทางเดินใหม่ (เขียน `FILING_TRANSITIONS` ของ #1925 ใหม่): `draft → filing → complete → delivered` + `rejected`(ภายใน RA) · ขั้น "รับเงิน" ของ SA (ReceiveDialog) ตัดทิ้ง — "เงินเข้าแล้ว" อ่านจากงวดที่ FN รับรองบน SO ค่าสรรพสามิต
- ด่านเริ่มยื่น: ทะเบียนอนุมัติครบ **หรือ** เหตุผลข้าม · เงินรับรองแล้ว **หรือ** เหตุผลข้าม (Q15) · ใบ `not_liable` ไม่ต้องยื่น
- RA อ่าน SO ไม่ได้ (ไม่มี `salesplan:view` · `permissions.js:688`) ⇒ สรุป SO/ใบค่าสรรพสามิต/สถานะเงินมาทาง API ของ `/tax` · ลิงก์ "ใบสั่งขายต้นทาง" บนหน้าใบยื่น (`tax/filings/[id]/page.js:339`) เปลี่ยนเป็นแผงสรุปในหน้า

### 3.7 สิทธิ์ของใบไม่มีดีล

ปัญหา: ทุกด่านของ QT/SO ตัดสินผ่าน `row.deal` (`scopedRow.js:41-50,110-127` · ลิสต์ QT/SO · GET/PATCH · งวด · ไฟล์แนบ · `privateEvidence`) และ `inSalesViewScope(user, null)` ตอบ **true** ให้ role ที่เห็นทุกทีม แต่ false ให้ role ทีม/ของตัวเอง

ทางแก้ — ตัวตัดสินเดียว:
- `SCOPED_TABLES.quotations/sales_orders` select ดีลของ SO ต้นทางมาด้วย (embed ต้อง **ระบุชื่อ FK** — คู่ `quotations ↔ sales_orders` จะมีสองความสัมพันธ์ · `sales_orders` อ้างตัวเอง · กัน PGRST201) และ `scopeOf = row.deal ?? row.sourceSalesOrder?.deal`
- `salesDocDeal(row)` / `salesDocAccess(user, row, mode)` ใน `lib/scopedRow.js` ให้ทุก route เรียกตัวเดียว · ใบที่หาดีลไม่ได้เลย = ปฏิเสธ (ยกเว้น admin) ตามกติกาเดิม
- FN: เห็นและทำงานฝั่งบัญชีตามเดิม (ขอบเขต 'all') · RA: ไม่เห็นหน้าขาย
- ratchet: ห้ามเรียก `inSales*Scope(user, row.deal)` ตรง ๆ กับใบที่อาจไม่มีดีล
- ⚠️ **ดีลของ SO ต้นทางใช้ตัดสินสิทธิ์อย่างเดียว ห้ามเอาไปใส่ `row.deal`** — โค้ดหลายจุดใช้ `quote.deal` ทำงานกับดีลจริง (เช่น `quotationCancelRepo.js:151-156` ส่งดีลเข้าตัวคิด FC) ถ้าเติมดีลต้นทางลงไป ใบ excise จะไปขยับ FC ของดีลลูกค้า
- "รอฉันอนุมัติ" (`isQuotationAwaitingMyApproval` · `quotationWorkflow.js:141` · ใช้ที่ `quotations/route.js:90` · `nav/counts/route.js:196`) ตัดใบของดีลที่ปิดแล้ว — ดีลต้นทางของ SO อนุมัติเป็น Won เสมอ ⇒ ใบ excise ต้องส่ง `dealClosed: false` ไม่งั้นไม่ขึ้นป้ายผู้อนุมัติเลย
- จุดที่ต้องต่อเข้าตัวตัดสินเพิ่ม (ตรวจแผน): ตารางวางบิล/เลื่อนวันของลูกค้า (`installmentScheduleServer.js:95`) · แท็บเอกสารของ SO (`sales-orders/[id]/documents/route.js:26` วันนี้ admin อย่างเดียว) · แท็บเอกสารรวมของดีลต้นทาง (`documents/all/route.js:78-79` กรองด้วย dealId) · สมุดชำระของ FN จัดกลุ่มตามเจ้าของดีล (`finance/payments/route.js:99-106`) → ใช้เจ้าของดีลต้นทาง

---

## 4. กัน Actual

**ชั้น 1 ฐานข้อมูล (ปิดเองโดยโครงสร้าง):** `sync_sales_order_actual` · `enforce_sales_order_actual_on_deal` · `_deal_so_actual_extras` (0412:421,513,562) กรองเฉพาะ `dealId = X AND origin = 'pipeline'` · ใบ excise ไม่มีดีลและไม่ใช่ pipeline ⇒ ไม่เข้า wonValue / actualByMonth / soPending · CHECK `actualAmount = 0` · `actualMode` รายงวดได้เฉพาะ pipeline (0412:231-236)

**ชั้น 2 ตัวตัดสินระดับแถว — ต้องตัดใบ excise ออกเพิ่ม (วันนี้รั่ว):**
- `salesOrderAmountKind` (`salesOrderWorkflow.js:307-312`) · `splitSalesOrderAmounts` (:328) · `salesOrderCountedActual` (`salesOrderActualMode.js:343`) · `salesOrderActualEvents` (:539) — ทุกตัวถือว่า "ไม่ใช่ historical = Actual"
- จุดที่รั่วถ้าไม่แก้: การ์ด "Actual ก่อน VAT" หน้ารายการ SO (`sales-orders/page.js:546,568,781,972`) · ชิปกรองที่จัดใบ excise เป็น "ใบจากใบเสนอราคา" (`salesOrderListFilter.js:50,87-88`) · หน้า SO (`[id]/page.js:1894,2011,2633` + ถ้อยคำอนุมัติ/ย้อน/ยกเลิก :673-690,739,1375,3096,3153) · ช่อง SO บนหน้า QT (`quotations/[id]/page.js:1157-1163`)
- 🔴 **ห้ามกลับเป็น `origin === 'pipeline'`** (ตรวจแผน 28/10 · BLOCKER) — query รายงานยอดขาย (`salesReportData.js:170,245`) ไม่ได้ select `origin` เพราะกรอง `pipelineRowsOnly` ในตัว query แล้ว · แถวพวกนั้นไหลเข้า `salesOrderActualEvents` (`reportRows.js:67`) และ `salesOrderAmountKind` (`reportPendingApproval.js:111`) ⇒ ถ้าตัดสินแบบ "เฉพาะ pipeline" แถวที่ไม่มี `origin` จะกลายเป็นไม่นับ **รายงานยอดขายทั้งจอและ Excel เป็น 0** · ใช้แบบตัดออก: `isActualOrder = (o) => !isHistoricalOrder(o) && !isExciseOrder(o)` (ไม่มี origin = นับเหมือนเดิม) และเทสต์ guard บังคับให้ทุก select ที่ไม่ได้กรองใน query ต้องมี `origin`
- ตัวช่วยใหม่ใน `lib/sales/historicalOrders.js` (บ้านเดียวของ literal origin): `ORIGIN_EXCISE` · `isExciseOrder` · `isActualOrder` (แบบตัดออกข้างบน) · `exciseRowsOnly` · `EXCISE_STATUS_NOTE`
- ตัวอ่านที่ใช้ `pipelineRowsOnly` อยู่แล้วตัดใบ excise ทิ้งเอง: รายงานยอดขาย (จอ/Excel) · งานผลิต · ลิสต์ใบยื่นเดิม · เลนย้อนอนุมัติ · บริการ

**ชั้น 3 ฝั่งใบเสนอราคา:** FC / พยากรณ์ / คิว FC (`forecast-review:38` · `forecast-report:90,142` · `forecastSourceRepo.js:34`) ข้ามใบที่ไม่มีดีลอยู่แล้ว · มูลค่าดีลมาจาก `accept_quotation_atomic` ซึ่งใบ excise ไม่เรียก · ต้องกรองเพิ่ม: ตัวเลือกสัญญา (`contracts/options/route.js:66-74` กิน `.limit(500)`) · ปุ่มสร้างคำร้องจาก QT (`RequestCreateButton.js:70`) · คิว "Won รอยื่น SO" (`handoffQueueData.js:20-30` — ตัดสินว่าใบ excise เข้าคิว SA ตัวใหม่แทน)

ข้อระวังบัญชี: ยอดในสมุดชำระของ FN รวมเงินค่าภาษี (เงินรับแทน) · ติดป้าย origin · FN ลง Express เป็นบัญชีรับแทน (Q23)

---

## 5. ผลกับ SO ลูกค้า

- **ล็อกเมื่อมีใบค่าสรรพสามิตที่ยังมีผล** (Q16): ย้อนอนุมัติ / Rev. / ยกเลิก SO ลูกค้าถูกบล็อกพร้อมบอกเลขใบค่าสรรพสามิตที่ต้องยกเลิกก่อน · ด่าน JS ใน `sales-orders/[id]/route.js` (RPC ถูกเรียกผ่าน route เท่านั้น) · ลบถูกกันด้วย FK RESTRICT · การลบดีล/QT แบบบังคับ (`forceDelete.js:383-470`) ต้องนับใบค่าสรรพสามิตลูก ๆ ในหน้าพรีวิว ไม่งั้นชน 23503 ดิบกลางทาง (ลบทีละใบ ไม่ atomic)
- **ยกเลิกใบค่าสรรพสามิต = ปลดล็อก** · ผู้ยกเลิกตามกติกา QT 24/09 = ผู้อนุมัติ (`canCancelQuotation` · `quotationWorkflow.js:178`) SA ขอยกเลิกได้ · ⚠️ วันนี้ยกเลิกได้เฉพาะ `draft/sent/rejected` (`quotationCancelRepo.js:37` · `quotationCancel.js:63` "accepted → ย้อนการรับก่อน") และใบ excise ย้อนการรับไม่ได้ ⇒ **ต้องมีสาขายกเลิกของใบ excise ที่ยอม `accepted`** เมื่อไม่มี SO ค่าสรรพสามิตที่ยังมีผล (ไม่งั้น SO ลูกค้าล็อกตาย) · ถ้ามี SO ค่าสรรพสามิตแล้วต้องยกเลิก SO ก่อน (เงินที่รับแล้วคืนผ่านเส้นคืนเงินเดิมของ FN)
- **SO ค่าสรรพสามิตย้อนอนุมัติไม่ได้เลย** — Rev. เกิดไม่ได้ (CHECK `revisionNo = 0`) ถ้าปล่อยย้อน ใบจะค้าง `approval_revoked` ตลอดไป · แก้ด้วยยกเลิกแล้วออกใหม่เท่านั้น และยกเลิกได้เมื่อ RA ยังไม่ได้สร้างใบยื่น (ด่านยกเลิก/ย้อน/Rev./ลบบังคับต้องดู `orders.exciseSalesOrderId` ด้วย ไม่ใช่แค่ `orders.salesOrderId` — `sales-orders/[id]/route.js:1531-1546` · 0166:78 · 0376:156-160 · `forceDelete.js:237`)
- **เริ่มยื่นกรมแล้ว = SO ลูกค้าล็อกถาวร** (กลไกเดิมของ `orders.salesOrderId`)
- แก้หลังรับเงินแล้ว (D8): ยกเลิก + FN คืนเงิน + เก็บใหม่ · การโอนงวด (carry 0378:209-225) ต้องดีลเดียวกันและ pipeline จึงใช้ไม่ได้
- SO ค่าสรรพสามิตไม่แตะดีลลูกค้าเลย: Actual · FC · Won · เธรดดีล (`documentThread.js` เขียนเธรดเมื่อมี dealId เท่านั้น) · ปิดโครงการ
- `cancel_sales_order_with_reversal_atomic` ยกเลิก QT ที่รับแล้ว **ตามดีล** (0170:101-102) — ใบ excise ไม่มีดีลจึงไม่โดน · SO ค่าสรรพสามิตยกเลิกได้แบบไม่ย้อน Won เท่านั้น

---

## 6. Migration (เลขชั่วคราว · เอาเลขจริงตอน merge · ทุกไฟล์ทดสอบใน PGlite ก่อน)

⚠️ **ห้ามลอกเนื้อ RPC จากไฟล์ migration** — ตัวที่รันจริงถูกปะด้วยการแทนสตริงใน `prosrc` หลายรอบ (0382/0385/0392/0396/0400/0404/0407/0412) ⇒ เนื้อที่จะแก้ต้องมาจาก `pg_get_functiondef` บน prod · การปะใช้แบบ "หาข้อความยึด เจอครั้งเดียวเท่านั้น ไม่งั้น RAISE" ตามแบบ 0407 §4
⚠️ ห้ามมีข้อความ `FUNCTION public.<ชื่อ RPC เดิม>` ในไฟล์ใหม่ที่ไม่ได้นิยามฟังก์ชันนั้นเต็มตัว (เทสต์ `serviceRoundsCopyPaths.latestDefinitionOf`)

### 0414 `excise_documents_origin` — โครงสร้างล้วน · รันก่อน PR1

```sql
BEGIN;
-- §1 quotations ─────────────────────────────────────────────────────────
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'pipeline',
  ADD COLUMN IF NOT EXISTS "sourceSalesOrderId" text
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT;
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_origin_check;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_origin_check
  CHECK (origin IN ('pipeline', 'excise'));
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_origin_shape;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_origin_shape CHECK (
  (origin = 'pipeline' AND "dealId" IS NOT NULL AND "sourceSalesOrderId" IS NULL)
  OR (origin = 'excise' AND "dealId" IS NULL AND "sourceSalesOrderId" IS NOT NULL));
ALTER TABLE public.quotations ALTER COLUMN "dealId" DROP NOT NULL;      -- หลัง CHECK เท่านั้น
DROP TRIGGER IF EXISTS quotations_origin_immutable_trg ON public.quotations;
CREATE TRIGGER quotations_origin_immutable_trg BEFORE UPDATE OF origin ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_origin_immutable();   -- ฟังก์ชันกลางของ 0360 (ใช้ TG_TABLE_NAME)
CREATE INDEX IF NOT EXISTS quotations_source_sales_order_idx
  ON public.quotations ("sourceSalesOrderId") WHERE "sourceSalesOrderId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS quotations_one_accepted_excise_per_source_uidx
  ON public.quotations ("sourceSalesOrderId") WHERE origin = 'excise' AND status = 'accepted';

-- §2 sales_orders ───────────────────────────────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "sourceSalesOrderId" text
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledKind" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledReason" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledRef" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledById" text,
  ADD COLUMN IF NOT EXISTS "exciseNotBilledByName" text;
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_origin_check;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_origin_check
  CHECK (origin IN ('pipeline', 'historical', 'excise'));
-- origin_shape: สาขา pipeline + historical ลอกจาก 0374 **ตัวต่อตัว** แล้ว OR สาขา excise
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_origin_shape;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_origin_shape CHECK (
  ( /* pipeline — 0374 verbatim */ ) OR ( /* historical — 0374 verbatim */ )
  OR ( origin = 'excise' AND "dealId" IS NULL AND "projectId" IS NULL
       AND "quotationId" IS NOT NULL AND "sourceSalesOrderId" IS NOT NULL
       AND "actualAmount" = 0 AND "revisionNo" = 0 AND "revisedFromId" IS NULL
       AND "historicalQuoteRef" IS NULL AND "historicalExpressRef" IS NULL
       AND "historicalInvoiceRef" IS NULL AND "historicalIntakeHash" IS NULL
       AND "paymentGateExemptAt" IS NULL AND "exciseNotBilledKind" IS NULL ));
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_deal_by_origin;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_deal_by_origin CHECK (
  (origin = 'excise') = ("dealId" IS NULL)
  AND ("sourceSalesOrderId" IS NULL OR origin = 'excise'));
ALTER TABLE public.sales_orders ALTER COLUMN "dealId" DROP NOT NULL;    -- หลัง CHECK เท่านั้น
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_excise_not_billed_shape;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_excise_not_billed_shape CHECK (
  -- ทั้งชุดหรือไม่มีเลย (ถอนการตัดสิน = ล้างทุกช่อง) · ความยาวเหตุผล 10–500 ตามแบบ payment_gate_exempt_sane (0360)
  ( "exciseNotBilledKind" IS NULL AND "exciseNotBilledReason" IS NULL AND "exciseNotBilledRef" IS NULL
    AND "exciseNotBilledAt" IS NULL AND "exciseNotBilledById" IS NULL AND "exciseNotBilledByName" IS NULL )
  OR ( origin = 'pipeline'
       AND "exciseNotBilledKind" IN ('collected_outside', 'included_in_price', 'not_liable')
       AND char_length(btrim("exciseNotBilledReason")) BETWEEN 10 AND 500
       AND ("exciseNotBilledRef" IS NULL OR char_length("exciseNotBilledRef") <= 100)
       AND "exciseNotBilledAt" IS NOT NULL AND "exciseNotBilledById" IS NOT NULL ));
CREATE INDEX IF NOT EXISTS sales_orders_source_sales_order_idx
  ON public.sales_orders ("sourceSalesOrderId") WHERE "sourceSalesOrderId" IS NOT NULL;

-- §3 ลิงก์ SO ต้นทางคือสมอของสิทธิ์ ⇒ แก้ไม่ได้หลังเกิด (ทั้งสองตาราง) ───────────────
CREATE OR REPLACE FUNCTION public.guard_source_sales_order_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceSalesOrderId" IS DISTINCT FROM OLD."sourceSalesOrderId" THEN
    RAISE EXCEPTION 'source_sales_order_immutable' USING DETAIL = TG_TABLE_NAME || ':' || OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quotations_source_so_immutable_trg ON public.quotations;
CREATE TRIGGER quotations_source_so_immutable_trg BEFORE UPDATE OF "sourceSalesOrderId" ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.guard_source_sales_order_immutable();
DROP TRIGGER IF EXISTS sales_orders_source_so_immutable_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_source_so_immutable_trg BEFORE UPDATE OF "sourceSalesOrderId" ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_source_sales_order_immutable();

-- §4 ชื่อหมวด 04-003 (DML) ────────────────────────────────────────────────
UPDATE public.product_types SET "nameTh" = 'ค่าภาษีสรรพสามิต', "nameEn" = 'Excise tax recharge'
 WHERE "mainCategoryCode" = '04' AND "typeCode" = '003';
NOTIFY pgrst, 'reload schema';
COMMIT;
-- SELECT ท้าย: คอลัมน์ใหม่ครบ · CHECK ใหม่ 5 ตัว · trigger ใหม่ 3 ตัว · dealId nullable ทั้งสองตาราง · 0 แถว origin excise
```

รันก่อน PR1 ได้ทันที — เพิ่มอย่างเดียว · แถวเดิมเป็น pipeline/historical ทั้งหมดผ่าน CHECK ใหม่ (ตัวค้านยืนยันแล้ว) · ไม่มีแถว excise จนกว่า PR3 ขึ้น · คอลัมน์ของใบยื่นกรมแยกไป 0417 (ไม่ผูกด่าน "ตาราง orders ต้องว่าง" ไว้กับ PR1)

### 0415 `excise_quotation_rpcs` — รันก่อน PR3

> **ที่เขียนจริง (28/10):** ปะทั้งสี่ตัวด้วยการแทนข้อความยึด `SELECT * INTO v_deal FROM public.sales_deals WHERE id = v_quote."dealId"` ครั้งเดียวต่อฟังก์ชัน (เครื่องหมาย `-- 0415/E1` · รันซ้ำได้) · RPC รับใบใช้ลายเซ็น `accept_excise_quotation_atomic(p_quote_id, p_current_fingerprint, p_actor_id, p_actor_name)` — ตรวจลายนิ้วมืออนุมัติแทน `updatedAt` (แบบเดียวกับ accept ปกติ) · ไม่รับหลักฐานแนบ · คำแปลไทยของ RAISE อยู่ใน `lib/excise/exciseQuotation.js` (`ACCEPT_ERRORS`) ไม่ใช่ `documentWorkflowErrors` · ทดสอบใน PGlite บนสำเนาโครงสร้าง prod หลัง 0414 ผ่าน 31/31

- **ปะ** `submit_quotation_with_signature_evidence_atomic` (0156:104-106) · `approve_quotation_with_signature_evidence_atomic` (0165:57-62 + ปะ 0382) · `withdraw_quotation_submission_atomic` (0161:126-131 + 0382) · `reject_quotation_submission_atomic` (0164:93-98 + 0382): จุดอ่านดีลจาก `v_quote."dealId"` → `COALESCE(v_quote."dealId", (SELECT so."dealId" FROM public.sales_orders so WHERE so.id = v_quote."sourceSalesOrderId"))` · ผลคือเจ้าของดีลต้นทาง/ผู้จัดการขายเป็นผู้อนุมัติตามกติกาเดิม · ข้อความยึดต้องยืนยันกับ `pg_get_functiondef` ตอนเขียน (ชื่อตัวแปรอาจต่างกันรายฟังก์ชัน)
- **ใหม่** `accept_excise_quotation_atomic(p_quotation_id, p_actor_id, p_actor_name, p_expected_updated_at, p_evidence jsonb)`: ล็อก QT · origin excise · อนุมัติแล้ว + sent · SO ต้นทางยังอนุมัติ ไม่ถูกแทน เป็น pipeline · ตั้ง accepted + หลักฐานแบบใบปกติ · **ไม่แตะดีล/FC/ใบพี่น้อง**
- REVOKE จาก PUBLIC/anon/authenticated → GRANT `service_role` ตามแบบ 0382 · คำแปลไทยของ RAISE code ใหม่ใน `documentWorkflowErrors`
- `unaccept_quotation_atomic` (0380/0388) ผูกดีลทั้งก้อน — ใบ excise ไม่ใช้ (ยกเลิกแทน) · route unaccept ปฏิเสธใบ excise

### 0416 `excise_sales_order_rpcs` — รันก่อน PR4

> **ที่เขียนจริง (29/10):** ปะสี่ฟังก์ชันด้วยข้อความยึดครั้งเดียวต่อจุด (ป้าย `0416/E1`–`E4` · รันซ้ำได้): E1 ข้อ "ต้องมีโครงการ" ยกเว้นใบ excise · E2 ใบ excise จับคู่ QT ค่าสรรพสามิตที่รับแล้วของ SO ต้นทางเดียวกัน (ใบปกติตรวจ `q."dealId" = v_order."dealId"` เหมือนเดิม) · E3 เจ้าของจากดีลของ SO ต้นทาง · ย้อนอนุมัติใบ excise กันด้วย **trigger** `sales_orders_excise_no_revoke_trg` (`sales_order_revoke_excise_forbidden`) — รุ่นแรกปะเนื้อ `revoke_sales_order_approval_atomic` แล้วข้อความยึดไม่เจอบน prod (29/10 · เนื้อตัวรันจริงต่างจากสายไฟล์ · ทั้งไฟล์ถอยกลับ) ⚠️ PR5/0417 ที่จะแตะ revoke ต้องอ่านเนื้อบน prod ก่อน — ผลตรวจตอนรัน 0416: `revoke_sales_order_approval_atomic` บน prod **เก็บบรรทัดเป็น CRLF** (`strpos(prosrc, chr(13)) > 0` = true · ยังมีรหัส `sales_order_revoke_state_invalid` ครบ) ⇒ ข้อความยึดหลายบรรทัดที่เขียนด้วย `\n` ไม่มีวันเจอ · ใช้ข้อความยึดบรรทัดเดียว หรือ `replace(src, chr(13), '')` ก่อนเทียบ · **รันบน prod แล้ว 29/10** (รอบสอง · ตรวจ: patched 3 · create_fn 1 · create_grant 0 · revoke_guard 1) · `create_excise_sales_order_draft(p_quote_id, p_order_id, p_actor_id, p_actor_name, p_overrides)` ลอกตัวรันจริง + ล็อก SO ต้นทาง FOR UPDATE (ต้อง pipeline · อนุมัติ · ไม่ถูกแทน) · ไม่สร้างงวด (route สร้างตามเส้นเดิม) · ทดสอบใน PGlite บนสายมิเกรชันถึง 0415 ผ่าน 33/33 (รวมยื่น→อนุมัติจริงด้วยลายเซ็น · ดีลลูกค้าไม่ขยับ · แบบรายงวดถูกปฏิเสธ · เนื้อ revoke ต่างจากไฟล์ · ถอยกลับ)

- **ใหม่** `create_excise_sales_order_draft(...)`: ลอกจาก `pg_get_functiondef('create_sales_order_draft')` ตัวที่รันจริง (0363 + ปะ 0407) แล้วเปลี่ยน: ต้องเป็น QT origin excise ที่รับแล้ว · `origin = 'excise'` · `dealId/projectId = NULL` · `sourceSalesOrderId` จาก QT · `actualAmount = 0` · เจ้าของ = เจ้าของดีลต้นทาง · บรรทัดลอกครบรวม metadata และ packQty · ตัวนับ SO เดิม
- **ปะ** RPC ยื่น/อนุมัติ SO (`submit_…` 0197:63 + 0404 · `approve_…` 0197:168 + 0382/0392/0396/0400/0404): ข้อ "ต้องมี projectId" และ "QT ที่รับแล้วบนดีลเดียวกัน" เพิ่มสาขา excise = `q.id = o."quotationId" AND q.origin = 'excise' AND q.status = 'accepted'` · `approve_sales_order_with_actual_mode` (0412:872) ไม่ต้องแก้ (excise ส่ง 'order')
- **ปะ** `snapshot_sales_order_owner` (0294:41-46): ดีลที่ใช้ = `COALESCE(NEW."dealId", (SELECT "dealId" FROM sales_orders WHERE id = NEW."sourceSalesOrderId"))` · ใบอื่นทำงานเหมือนเดิม
- **ปะ** `revoke_sales_order_approval_atomic` (0166 + ปะ): ใบ origin excise ย้อนอนุมัติไม่ได้ (`sales_order_revoke_excise_forbidden`) — ถ้าปล่อย ใบจะค้าง `approval_revoked` เพราะ Rev. เกิดไม่ได้ · ด่าน JS ซ้ำอีกชั้นใน route
- ไม่แตะ `revise_approved_sales_order_atomic` — ใบ excise ออก Rev. ไม่ได้ทั้ง CHECK (`revisionNo = 0`) และด่าน JS

### 0417 `excise_filing_links` — รันก่อน PR5

> **ที่เขียนจริง (29/10):** คอลัมน์ตามร่างข้างล่าง (`filingStartedById` เป็น text + เพิ่ม `filingStartedByName`) · **ไม่ปะเนื้อ RPC ย้อนอนุมัติ/Rev.** (บทเรียน 0416 — เนื้อบน prod เป็น CRLF) และไม่จำเป็น: SO ลูกค้ายังล็อกผ่าน `orders.salesOrderId` ตามเดิม · SO ค่าสรรพสามิตย้อนอนุมัติไม่ได้ (0416) · Rev. เกิดไม่ได้ (CHECK) ⇒ เพิ่ม **trigger สองตัว** แทน: `orders_excise_link_check_trg` (ใบที่ชี้ SO ค่าสรรพสามิตต้องชี้ SO ลูกค้าต้นทางของใบนั้น · `orders_excise_link_invalid`) · `sales_orders_excise_filed_no_cancel_trg` (SO ค่าสรรพสามิตที่มีใบยื่นยกเลิกไม่ได้ · `sales_order_cancel_excise_filed`) · ด่าน "ตารางว่าง" เฝ้าเฉพาะรอบแรก (รันซ้ำได้) · PGlite บนสายไฟล์ถึง 0416 ผ่าน 20/20 · **รันบน prod แล้ว 29/10** (ตรวจ: cols 7 · uidx 1 · qty_numeric true · link_guard 1 · cancel_guard 1)

```sql
BEGIN;
-- ทางสร้างใบยื่นของ SA ปิดตั้งแต่ PR3 ⇒ ถ้ามีแถวโผล่ = มีทางรั่ว หยุดดูก่อน
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.orders) THEN RAISE EXCEPTION 'orders_not_empty'; END IF;
END $$;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "exciseSalesOrderId" text
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "filingSkipMoneyReason" text,
  ADD COLUMN IF NOT EXISTS "filingSkipRegistrationReason" text,
  ADD COLUMN IF NOT EXISTS "filingStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "filingStartedById" uuid,        -- ชนิดเดียวกับ orders."ownerId" / "filedBy"
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_excise_sales_order_uidx
  ON public.orders ("exciseSalesOrderId") WHERE "exciseSalesOrderId" IS NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN quantity TYPE numeric;
-- ด่าน "SO มีใบยื่นอยู่" ของย้อนอนุมัติ/Rev. (0166:78 · 0376:156-160) ดูแค่ salesOrderId →
-- ปะให้ดู "exciseSalesOrderId" ด้วย (ข้อความยึดจาก pg_get_functiondef)
NOTIFY pgrst, 'reload schema';
COMMIT;
```

---

## 7. แผน PR

| PR | เนื้อหา | ต้องรัน | ต้องรอ |
|---|---|---|---|
| **PR1** รั้ว Actual + ตัวตัดสินสิทธิ์ใบไม่มีดีล | ตัวช่วย origin ใน `historicalOrders.js` · 4 ตัวตัดสิน Actual ระดับแถวตัดใบ excise ออก (แบบตัดออก ไม่ใช่ "เฉพาะ pipeline" — หมวด 4) + ถ้อยคำบนหน้า SO/QT · ป้าย "รอฉันอนุมัติ" ของใบไม่มีดีล (`dealClosed: false`) · ตารางวางบิลลูกค้า · แท็บเอกสาร SO/ดีล · สมุดชำระ FN จัดกลุ่ม · `salesDocAccess` + `SCOPED_TABLES` ถอยไปดีลของ SO ต้นทาง · ลิสต์ QT/SO · GET/PATCH · งวด (`installments/route.js:92-95`) · ไฟล์แนบ (`salesOrderAttachmentAccess.js:54-66`) · `privateEvidence` · ป้ายเมนู QT (ผู้อนุมัติของใบไม่มีดีล) · กรองตัวเลือกสัญญา/ปุ่มคำร้อง · ratchet + จัดชั้นตัวอ่านใน `historicalMoneyGuards` ใหม่ · **ไม่มีอะไรเปลี่ยนบน prod** (ยังไม่มีแถว excise) | 0414 | — |
| **PR2** สูตร 8.8% + สินค้า 04-003 | `exciseTaxLine` ปัดครั้งเดียว + แตกช่อง ภส. + ปัดด้วยสตางค์ · `ensureExciseChargeProduct` · ปิดเปิด 04-003 ด้วยมือ (POST/PATCH/ตัวเลือกหมวด/ตัวเลือกสินค้า) · `PROTECTED_PRODUCT_CATEGORY_CODES` · QT pipeline ปฏิเสธสินค้า 04-003 · `enforceMasterPrices` ข้ามบรรทัด excise · `buildExciseQuotationLines` | 0414 | PR1 |
| **PR3** ใบเสนอราคาค่าสรรพสามิต | route สร้างจาก SO ลูกค้า · คิว SA "รอออกใบค่าสรรพสามิต" + ช่วงบนเส้นเดินงาน SO + ป้ายเมนู · หน้า QT โหมด excise (บรรทัดล็อก · คิดใหม่จาก SO · ชิป) · submit/approve/withdraw/reject/cancel/revise แตกสาขา · accept → `accept_excise_quotation_atomic` · unaccept ปฏิเสธ · "ไม่เรียกเก็บในระบบ" บน SO ลูกค้า · ล็อก SO ลูกค้า (Q16) · สาขายกเลิกใบ excise ที่รับแล้ว · พรีวิวลบบังคับนับใบ excise ลูก · 🔴 **ปิดทางสร้างใบยื่นของ SA** (`POST /api/tax/orders/from-sales-order` · `POST /api/orders` · ปุ่มบนเส้นเดินงาน · คิว "รอยื่นภาษี" ของ SA) | 0415 | PR2 |
| **PR4** SO ค่าสรรพสามิต | สร้าง SO จากใบที่รับแล้ว → `create_excise_sales_order_draft` · หน้า SO โหมด excise (ซ่อนดีล/โครงการ/ผลิต/บริการ/สเปค/สัญญา/Rev./ย้อน Won · ชิป "ไม่นับ Actual") · ยื่น/อนุมัติผ่าน RPC ที่ปะ · งวด/แจ้งชำระ/FN ครบ · ยกเลิกแบบไม่ย้อน Won เท่านั้น · ย้อนอนุมัติไม่ได้ · กระดิ่งถึงเจ้าของดีลต้นทาง | 0416 | PR3 |
| **PR5** เส้นยื่นกรมของ RA | RA สร้างใบยื่นจากคิว `/tax` (SO ค่าสรรพสามิตอนุมัติ / ไม่เรียกเก็บ) · รายการจากใบค่าสรรพสามิต · `FILING_TRANSITIONS` ใหม่ (ด่านเงินจาก FN · ด่านทะเบียน · ข้ามได้ใส่เหตุผล · RA ส่งใบเสร็จ) · proxy: การเขียน `/api/orders` และ from-sales-order เหลือ RA · ถอดทางเข้าของ SA (ปุ่มบนเส้นเดินงาน · `SalesOrderFilingModal` ย้ายไป RA · `ReceiveDialog` ลบ) · แผงสรุป SO ในหน้าใบยื่น (RA ไม่เข้าหน้าขาย) · คิว "รอยื่นภาษี" ย้ายเป็นของ RA · รายการใบยื่นจากใบค่าสรรพสามิต (productId/ลิงก์บรรทัดตามหมวด 3.6) · ปิดคิดใหม่ของ #1924 บนใบที่ผูก SO ค่าสรรพสามิต · ถอดปุ่มพิมพ์ใบแจ้งชำระ ET ถึงลูกค้า · ด่านยกเลิก/ย้อน/ลบของ SO ค่าสรรพสามิตดู `exciseSalesOrderId` | 0417 | PR4 · #1925 merge |
| **PR6** ใบค้าง + เทมเพลต + เอกสาร | ป้าย "ก่อนเปิดระบบ" (49 ใบ ณ 26/10) · Q21 คงงาน SA แต่ผูกกับคิวใหม่ · DML ถอด `ra:approve` รายคน (Q22) · `docs/excise-filing-plan.md` v3 · บันทึก "ใบไม่มีดีล" ใน `docs/module-ownership-rule.md` · `docs/INDEX.md` | DML | PR5 + มีใบทดลองถึง delivered |

ทุก PR: เทสต์ห้ามต่อฐานจริง (ส่งตัวจำลอง) · `recordAudit` ทุกการเขียน · โมดัลบอกผลทุกการอนุมัติ · ไม่มีสิทธิ์ = ไม่แสดง / ติดด่าน = แสดงพร้อมเหตุผล · เปิดจอจริงก่อนบอกว่าเสร็จ

---

### 7.1 PR1 — สิ่งที่ทำจริง (28/10) และของที่ย้ายไป PR หลัง

ทำแล้ว:
- ตัวตัดสิน Actual: `isActualOrder` (แบบตัดออก) ใน `salesOrderAmountKind` · `salesOrderCountedActual` · `salesOrderActualEvents` · `actualModeEligibility` · `actualStartBlocker` · ชิปที่มา "ใบจากใบเสนอราคา" · ย้อนอนุมัติ/ออก Rev. ปฏิเสธใบ excise
- ตัวตัดสินสิทธิ์: `salesDocScopeDeal` / `inSalesDocScope` / `loadSourceDeals` / `attachSourceDeals` ใน `lib/scopedRow.js` (ดีลต้นทางลง `row.sourceDeal` ไม่ใช่ `row.deal` · อ่านแยกอีกรอบ ไม่ embed — กัน PGRST201) · `loadScoped` ของสองตาราง · ลิสต์ QT/SO · GET/PATCH/DELETE QT · submit/revise/unaccept QT · GET/PATCH SO · งวด (`loadOrderForUser`) · ตารางวางบิล (`loadOrdersBundle`) · แท็บเอกสาร SO · ไฟล์แนบ SO · `privateEvidence` · สมุดชำระ FN จัดกลุ่มตามเจ้าของดีลต้นทาง
- "รอฉันอนุมัติ": `quotationApprovalContext` (ทะเบียน QT + nav/counts) · ใบ excise ส่ง `dealClosed: false`
- กรองออก: ตัวเลือกสัญญา (`nonExciseRowsOnly` ก่อน `.limit(500)`) · ปุ่มคำร้อง · คิว "Won รอยื่น SO" · POST สร้าง SO จาก QT ปฏิเสธใบ excise
- ยาม: `exciseDocGuards.test.mjs` (ตัวตัดสิน · ขอบเขต · ratchet ห้าม `inSales*Scope(user, x.deal)` ใน route สองตาราง) · `historicalMoneyGuards` ข้อ 5b (คำสั่งอ่าน SO ที่ไม่กรอง origin ต้อง select origin · 4 จุดยกเว้นพร้อมเหตุผล) + literal `origin 'excise'` บ้านเดียว
- ⚠️ ก่อนรัน 0414 `check:columns` แดง 7 จุด (คอลัมน์ใหม่ล้วน) — รันบน prod แล้ว 28/10 ⇒ PR1 merge ได้ (deploy ก่อนรัน = ทะเบียน QT + ป้ายเมนู + สมุดชำระ FN พัง 42703)

ย้ายไป PR หลัง (ใบ excise ยังไม่มีจนถึง PR3 ⇒ ไม่มีจอไหนเห็นของพวกนี้ก่อนเวลา):
- ถ้อยคำ Actual บนหน้า SO รายใบ (สถานะ/ทัก/การ์ด) + ช่อง SO บนหน้า QT → PR3 (หน้า QT) / PR4 (หน้า SO)
- แท็บเอกสารรวมของดีลต้นทาง (`documents/all` กรองด้วย dealId) · ชิปที่มา "ใบค่าสรรพสามิต" บนทะเบียน SO → PR4
- route ย่อยของ QT ที่ `loadScoped` เปิดขอบเขตให้ใบ excise แล้ว (cancel · reject · withdraw · issued · file) แต่ยังไม่ได้ทวนตรรกะของใบไม่มีดีล (เช่น cancel ส่ง `quote.deal` เข้า FC) → PR3 ทวนทุกตัว · accept/approval ยังปฏิเสธใบไม่มีดีลอยู่ (ตั้งใจ — PR3 แตกสาขา)

### 7.2 PR2 — สิ่งที่ทำจริง (28/10)

- **สูตร (Q2 + D1):** `exciseTaxLine` ภาษี/ชิ้น = ปัด(อัตรารวม) ครั้งเดียว · สรรพสามิต/ชิ้น = ปัด(อัตราสรรพสามิต) · ท้องถิ่น = ส่วนที่เหลือ (สองช่องรวมกันเท่ายอดเสมอ) · `round2` ปัดด้วยสตางค์ (1.005 → 1.01) · คืน `taxPerUnit` เพิ่ม · ตัวอย่าง: ราคาขายปลีก 100 → 8.22/ชิ้น (สูตรเดิม 8.23) · ใบยื่นจริงยังเป็น 0 ใบ ⇒ ไม่มีใบเก่าเพี้ยน
- **H2 (ตรวจระบบ 26/10):** ใบยื่นจาก SO ฟังคำตัดสินบนทะเบียนที่อนุมัติแล้ว (`isExciseTaxable` ที่ RA override) ทั้งยกเว้นและบังคับ · ทะเบียนที่ยังไม่อนุมัติใช้ธงของสินค้าตามเดิม
- **สินค้า 04-003:** `lib/excise/exciseCharge.js` (บริสุทธิ์: `exciseChargeFgCode` ตามแบบท่อนรหัสลูกค้า D5 · `buildExciseQuotationLines` · `isExciseChargeProduct`) + `lib/excise/exciseChargeProduct.js` (`ensureExciseChargeProduct` — หาด้วยลูกค้า+หมวด · สร้างอนุมัติแล้ว `isExciseTaxable false` · ชน 23505 อ่านซ้ำ · audit/ประวัติราคารับเป็นพารามิเตอร์) — **ยังไม่มีผู้เรียก** (PR3 ใช้)
- **ปิดทางมือ:** POST สินค้าปฏิเสธ 04-003 · PATCH ปฏิเสธย้ายเข้า/ออก/เปลี่ยนรหัส-เจ้าของ (แก้ชื่อ/พักใช้ได้) · ตัวเลือกหมวดซ่อน 04-003 (ยกเว้นค่าที่เลือกอยู่) · ตัวเลือกสินค้าของจอขายตัด 04-003 · `PROTECTED_PRODUCT_CATEGORY_CODES` 11 → 12
- **ใบขาย:** `exciseChargeLinesAdded` ปฏิเสธบรรทัดสินค้า 04-003 ที่เพิ่งใส่ (PATCH · Rev. · สร้างใบ · seed จากโครงการ) · `enforceMasterPrices({ origin })` ข้ามบรรทัด 04-003 ของลูกค้าเจ้าของใบเมื่อใบเป็น excise (ตัดสินจากแถวสินค้าในฐาน) · ใบยื่นจาก SO ตัดบรรทัด 04-003 ทิ้ง (กันภาษีซ้อนภาษี)
- ยังไม่ทำ (PR3): ล็อกบรรทัดบนจอ (`quoteLineLocks`) · PATCH/Rev. ของใบ excise ปฏิเสธ `lines` · `recalcFromSalesOrder` ของใบเสนอราคา

### 7.3 PR3 — สิ่งที่ทำจริง (28/10)

- **ออกใบ:** `POST /api/sales-planning/sales-orders/[id]/excise-quotation` (สิทธิ์แก้ SO ลูกค้า) → `createExciseQuotationDraft` ใน `lib/excise/exciseQuotation.js` · บรรทัดจากใบยื่นจำลองของ SO (`resolveSalesOrderFiling`) · ราคาขายปลีกขาด = ออกไม่ได้ (Q3) · หัวใบลอกจาก QT ต้นทาง · VAT 7% · ชำระเต็มงวดเดียว · ผู้ติดต่อฝ่ายขาย = เจ้าของดีลต้นทาง · สินค้า 04-003 สร้างผ่าน `ensureExciseChargeProduct` · ใบที่ยังมีผลซ้ำ = ปฏิเสธ (ตรวจในแอป)
- **หน้า QT โหมด excise:** บรรทัดล็อก + ปุ่ม "คิดใหม่จากใบสั่งขาย" (PATCH `action: 'recalc_from_sales_order'` — เซิร์ฟเวอร์สร้างบรรทัดเอง) · PATCH ปฏิเสธ `lines`/ส่วนลด/VAT ที่ส่งมาเอง · การ์ดใบสั่งขายต้นทาง · "ลูกค้ารับแล้ว" แทน Won · ซ่อนย้อนการรับ
- **วงจรอนุมัติ:** submit/approval/withdraw/reject/cancel/revise อ่านดีลผ่าน `quotationApprovalDeal` (ดีลของ SO ต้นทาง) · FC เดินเฉพาะใบที่มีดีล · accept แตกสาขาไป `acceptExciseQuotation` ก่อนอ่านดีล · unaccept ปฏิเสธใบ excise · ใบ excise ที่รับแล้วยกเลิกได้ (ปลดล็อก SO ลูกค้า)
- **"ไม่เรียกเก็บในระบบ" (Q6/Q7):** action `set_excise_not_billed` / `clear_excise_not_billed` บน PATCH SO (CAS ด้วย `updatedAt` · audit) · กล่องเลือกเหตุแบบไทล์ (`ExciseNotBilledDialog`) · ถอนได้จนกว่า RA สร้างใบยื่น
- **ล็อก SO ลูกค้า (Q16):** ย้อนอนุมัติ/ออก Rev./ยกเลิก ปฏิเสธเมื่อมีใบค่าสรรพสามิตที่ยังมีผล (ร่าง/ยื่น/ตีกลับ/รับแล้ว) · ลบดีล/QT/SO ปฏิเสธเมื่อมีใบ excise ลูก (รวมพรีวิวลบบังคับ)
- **ปิดทางสร้างใบยื่นของ SA:** `SA_FILING_CREATE_OPEN = false` ใน `lib/excise/workflow.js` ปิดทั้ง `POST /api/tax/orders/from-sales-order` และ `POST /api/orders` · ปุ่มบนเส้นเดินงานเปลี่ยนเป็นช่วง "ค่าสรรพสามิต" (ออกใบ / ไม่เรียกเก็บ / ลิงก์ใบที่ยังมีผล) · คิวรอยื่นภาษีและแบนเนอร์หน้ารายการ SO ตัด SO ที่จัดการแล้ว (`exciseHandledOrderIds`)
- **H2 ตกหล่นจาก PR2:** ตัวโหลดสามจุดไม่ได้ select `isExciseTaxable` ⇒ ทะเบียน override ไม่มีผล · เติมแล้ว + เทสต์ยาม
- ยังไม่ทำ: คำร้องขอเอกสารบัญชีจากใบ excise (`POST /api/sa/requests` ปฏิเสธใบไม่มีดีล · รอมติว่า `dept_requests.dealId` ใช้ดีลต้นทางไหม) → PR4 (ทำแล้ว — หมวด 7.4)

### 7.4 PR4 — สิ่งที่ทำจริง (29/10)

- **สร้าง SO:** `POST /api/sales-planning/sales-orders` รับใบค่าสรรพสามิตที่ลูกค้ารับแล้ว → `create_excise_sales_order_draft` · เติม `sourceDeal` ก่อนตัดสินสิทธิ์ · ข้ามด่านโครงการปิด · เอกสารยืนยัน/งวด/เงินงวดแรกเส้นเดียวกับใบปกติ · ข้อความไทยของรหัส 0416 ใน `lib/excise/exciseSalesOrder.js`
- **ยื่น/อนุมัติ:** ผู้ยื่น = เจ้าของดีลของ SO ต้นทาง (`salesOrderApprovalDeal`) ทั้งจอและ route · ด่านเอกสารอ้างอิงของใบ excise = ใบที่รับแล้ว + SO ต้นทาง + ลูกค้า · อนุมัติแบบรายงวดถูกปฏิเสธ (`actualModeEligibility` ของ PR1) · ไม่มี Actual/FC/เธรดดีล
- **ทางที่ปิด:** ย้อนอนุมัติ · ออก Rev. · ยกเลิกแบบย้อน Won (route ตอบก่อนถึง RPC + ฐานกันซ้ำ) · ยกเลิกใบค่าสรรพสามิตที่รับแล้วต้องยกเลิก SO ค่าสรรพสามิตก่อน (ตรวจก่อนพรีวิว)
- **จอ:** หน้า SO โหมด excise — ป้าย "ค่าสรรพสามิต · ไม่นับ Actual" · การ์ด SO ต้นทางแทนการ์ดโครงการ/ดีล · ถ้อยคำสถานะไม่พูดถึง Actual · รางขั้น "ไม่นับ Actual" · ยอดก่อน VAT = ยอดรวม − VAT · ไม่มีการ์ด/ปุ่มสัญญา · ไม่มีย้อน Won · หน้าสร้าง SO การ์ด SO ต้นทาง · หน้า QT การ์ด SO ปลายทางบอกยอดจริง
- **เส้นเดินงานบน SO ลูกค้า:** รับใบแล้ว = ลิงก์ "ออกใบสั่งขายค่าสรรพสามิต" · มี SO แล้ว = สถานะของ SO นั้น (อนุมัติ = เสร็จช่วง) · คิว/แบนเนอร์ "รอออกใบค่าสรรพสามิต" ยังค้างจนกว่าจะมี SO (`exciseHandledOrderIds`)
- **คำร้องขอเอกสารบัญชี:** ใบค่าสรรพสามิตผูกดีลของ SO ต้นทาง (มติ 29/10) — server อ่านเอง · ฟอร์มเติมดีลด้วย `billingDealIdOf`
- **ยังไม่ทำ:** ใบยื่นกรมดู `orders.exciseSalesOrderId` (0417 · PR5) — ระหว่างนี้ยกเลิก SO ค่าสรรพสามิตได้โดยไม่ตรวจใบยื่น (ทางสร้างใบยื่นของ SA ปิดอยู่ · RA ยังไม่ได้ผูกใบยื่นกับ SO ค่าสรรพสามิต)

### 7.5 PR5 — สิ่งที่ทำจริง (29/10)

- **คิว "รอยื่นกรม" ของ RA:** `GET /api/tax/orders/queue` (ra:view · ไม่ผ่านด่านหน้าขาย) — SO ค่าสรรพสามิตอนุมัติแล้ว + SO ลูกค้าที่ตัดสินไม่เรียกเก็บแบบเก็บนอกระบบ/รวมในราคา ที่ยังไม่มีใบยื่น · `?exciseSalesOrderId=` / `?salesOrderId=` = พรีวิวใบหนึ่งใบ (รายการ · คำเตือน · ด่าน) · ตัวโหลดกลาง `lib/excise/raFiling.js` · กติกาล้วน `lib/excise/raFilingRules.js`
- **สร้างใบยื่น:** `POST /api/tax/orders/from-sales-order` เหลือ **ra:approve** (`{ exciseSalesOrderId }` หรือ `{ salesOrderId }`) · ผูกทั้ง SO ลูกค้าและ SO ค่าสรรพสามิต · รายการจากบรรทัดใบค่าสรรพสามิต (FG ต้นทาง · ลิงก์บรรทัด SO ลูกค้า · ช่อง ภส. ตามใบ · ทะเบียน ณ ตอนสร้าง) · ยอดเรียกเก็บ = ยอดรวม SO ค่าสรรพสามิต · ใบไม่เรียกเก็บคิดจาก SO ลูกค้า · proxy เปิดการเขียน `/api/orders` ให้ ra:approve อย่างเดียว · POST `/api/orders` (สร้างเอง) ปิดถาวร
- **ทางเดินใหม่ (`FILING_TRANSITIONS`):** ร่าง/ตีกลับ → กำลังยื่น → ชำระแล้ว → ส่งเอกสารแล้ว ทุกขั้นเป็นของ RA · ตีกลับ = RA ระหว่างยื่น แล้วยื่นใหม่ · ใบยกเว้นข้ามกำลังยื่น (ร่าง → ชำระแล้ว) · **ด่านเริ่มยื่น** (`filingStartGateError`): บัญชีปิดใบ SO ค่าสรรพสามิตแล้ว (`financeStatus = approved`) · ทะเบียนอนุมัติครบทุกรายการ — ข้ามได้ด้วยเหตุผล 10–500 ตัวอักษร เก็บลงใบ (`filingSkipMoneyReason` · `filingSkipRegistrationReason`) · ใบไม่เรียกเก็บผ่านด่านเงินเสมอ (เงินอยู่นอกระบบตามคำตัดสินของฝ่ายขาย) · เลขที่ใบกำกับไม่บังคับแล้ว (บัญชีออกบนงวดของ SO ค่าสรรพสามิต)
- **คิดใหม่:** ใบผูก SO ค่าสรรพสามิตคิดใหม่ไม่ได้ (`filingRecalcBlock`) · ใบไม่เรียกเก็บ RA คิดใหม่จาก SO ลูกค้าได้ตอนร่าง/ตีกลับ (ตัวโหลดเดียวกับตอนสร้าง · ไม่ใช้ขอบเขตขาย) · ลบได้เฉพาะร่างโดย RA (แอดมินทุกสถานะ) = งานกลับเข้าคิว
- **ถอดของฝ่ายขาย:** `ReceiveDialog` · `OrderFormModal` (+CSS) · ปุ่ม "ออกใบแจ้งชำระค่าภาษี" ถึงลูกค้า · คิวใบยื่นของ SA บน /tax · `SalesOrderFilingModal` เขียนใหม่เป็นโมดัลของ RA (เลือกจากคิว → พรีวิว → สร้าง) · ปุ่ม "สร้างใบยื่น" บน /tax/filings เป็นของ RA (`?create=<คีย์งาน>` จากคิวบนภาพรวม)
- **หน้าใบยื่น:** ปุ่มตามเส้น RA · โมดัลเริ่มยื่นบอกสองด่าน + ช่องเหตุผลข้าม · แผงสรุป SO (`source` จาก GET ใบรายตัว — RA ไม่เข้าหน้าขาย: ใบสั่งขายลูกค้า · ใบสั่งขายค่าสรรพสามิต + ยอดที่ลูกค้าจ่าย · ใบเสนอราคาค่าสรรพสามิต · สถานะบัญชี · คำตัดสินไม่เรียกเก็บ · ด่านเริ่มยื่น · เหตุผลที่ข้าม) · ลิงก์ไปหน้าขายโชว์เฉพาะคนมี salesplan:view · เลิกโหลดลิสต์ทะเบียน/ลูกค้า/สินค้าทั้งตาราง (ข้อย่อยของตรวจระบบ 26/10)
- **ยกเลิก SO:** ด่านใบยื่นดูทั้ง `salesOrderId` และ `exciseSalesOrderId` · ร่าง = ให้ RA ลบใบยื่นก่อน · เริ่มยื่นแล้ว = ยกเลิกไม่ได้ · ฐานกันอีกชั้น (0417) · พรีวิวลบบังคับของ SO/QT นับใบยื่นทั้งสองลิงก์
- **ภาพรวม /tax:** การ์ด "รอยื่นกรม (ยังไม่มีใบ)" + "ตีกลับ" แทน "รอรับเงิน/รอยื่น" · คิวงานของ RA = งานในคิว + ใบร่าง/ตีกลับ/กำลังยื่น/ชำระแล้ว · ฝ่ายขายไม่มีงานใบยื่นแล้ว (ป้ายเมนูใบยื่นเหลือเลน RA)
- **เส้นเดินงานบน SO ลูกค้า:** รางใบยื่นสี่จุด · ตีกลับยืนที่ "กำลังยื่น" · SO ค่าสรรพสามิตอนุมัติแล้วบอก "รอฝ่าย RA ยื่นกรม"
- **ยังไม่ทำ (PR6):** ใบค้าง 49 ใบ · ถอด ra:approve รายคน · เอกสาร excise-filing-plan v3 · เลขที่ใบยื่นแบบสร้างเอง `PO-` (ทางนั้นปิดถาวรแล้ว ไม่มีแถวเกิดใหม่)

### 7.6 หลังใบทดลอง SO-26080010-0 (29/10 · มติเจ้าของในแชต · ไม่มี migration)

- **ทะเบียน QT/SO:** ใบค่าสรรพสามิต (ไม่มีดีล) คอลัมน์ "ลูกค้า / ดีล" = **"ค่าสรรพสามิต · <ดีลของ SO ต้นทาง>"** เปิดดีลได้ · ประเภท **OTHER** (คำเดียวกับกระดาษ) · ตัวกรองประเภท/ผู้ดูแล/คำค้นใช้ดีลต้นทาง (`lib/excise/exciseListRow.js`) · ดีลต้นทางใช้แสดงผลเท่านั้น ไม่ใส่ `row.deal` (หมวด 3.7)
- **คิว "รอยื่นกรม" เห็นงานตั้งแต่ใบเสนอราคาค่าสรรพสามิตอนุมัติ** (ตัวเลือก "ขึ้นตั้งแต่ QT อนุมัติ (แนะนำ)"): แถว **กำลังมา** (`ready: false`) พร้อมขั้นที่ถึง — รอลูกค้ารับใบ · รอออก SO · SO ร่าง/รออนุมัติ · ปุ่มสร้างใบยื่นยังรอ SO ค่าสรรพสามิตอนุมัติ (กดแล้วบอกเหตุ) · แถวพร้อม = **รอสร้างใบยื่น** · หน้า /tax/filings มีแผงคิวเหนือรายการใบยื่น
- **ปุ่ม "ออกใบเสนอราคาค่าสรรพสามิต" บน SO ลูกค้าไม่บันทึกทันทีแล้ว** ("อยู่ในขั้นแก้ไขก่อน แบบ new ใบเสนอราคา"): พาไปหน้า `/sa/quotations/new-excise?salesOrderId=…&returnTo=…` ซึ่งโหลด `GET …/excise-quotation?preview=1` (ด่านเดียวกับทางบันทึก · **ไม่ออกเลข ไม่สร้างสินค้า 04-003 ไม่ลงฐาน** — `previewExciseQuotationDraft` + `peekExciseChargeProduct`) · แก้หัวใบได้: วันที่ · ยืนราคาถึง (ตั้งต้น 30 วันแบบหน้าสร้างใบปกติ) · เอกสารอ้างอิง · งวดชำระ · เงื่อนไขชำระ · หมายเหตุ (+ชุดเงื่อนไขการค้า ตรวจว่ามีจริงตอนบันทึก) · รายการอ่านอย่างเดียว (คิดจาก SO · แก้ภายหลังด้วย "คิดใหม่จากใบสั่งขาย") · ลูกค้า/ที่อยู่/ผู้ติดต่อลอกจาก QT ต้นทาง เปลี่ยนได้ที่หน้าใบหลังบันทึก · "บันทึก" = `POST` ทางเดิมพร้อมหัวใบ (`exciseQuotationOverrides` ตรวจรูปวัน/งวด 100%/ภาษา — บรรทัด/VAT/ส่วนลดไม่รับจากฟอร์ม) · หัวใบของพรีวิวและทางบันทึกมาจากตัวสร้างแถวตัวเดียว (`exciseQuotationRow`) ⇒ ที่เห็นบนหน้า = ที่ลงฐาน

## 8. เทสต์ที่จะแดงโดยตั้งใจ (ต้องเขียนใหม่ ห้ามข้าม)

| เทสต์ | ทำไม |
|---|---|
| `historicalSalesOrderMigration.test.mjs:404-423` | ล็อกว่าไฟล์ล่าสุดที่นิยาม `sales_orders_origin_shape` คือ 0374 → เป็น 0414 · :425-430 (สาขา pipeline ต้องตรงกับ 0360 ตัวต่อตัว) ต้องยังผ่าน |
| `historicalSalesOrderMigration.test.mjs:245-272` | ฟังก์ชันฐานที่อ่าน SO อนุมัติต้องกรอง pipeline หรืออยู่ใน `SQL_STATE_CHECK_ONLY` → ตัวใหม่ใน 0415/0416 ต้องจัดชั้น |
| `historicalMoneyGuards.test.mjs` | จัดชั้นตัวอ่าน `sales_orders` ใหม่: `PER_ID_GUARDED` (from-sales-order · SO [id] · งวด) · `SEES_HISTORICAL` (เหตุผลหลายข้อไม่จริงกับ excise) · `SCOPED_SAFE` quotations/[id] ("ใบย้อนหลังไม่มี QT" — excise มี) · literal guard :326 ขยายให้ครอบ `'excise'` |
| `productCategory.test.mjs:102` | 11 → 12 |
| `exciseBilling.test.mjs:102-111,140-155` · `soFiling.test.mjs` · `soFilingRecalc.test.mjs` · `registrationRoute.test.mjs` | ตัวเลขปัดแยก → ปัดครั้งเดียว |
| `filingTransitions.test.mjs` (#1925) | ทางเดินใหม่ของ RA |
| `proxy.test.mjs` | ล็อกว่า SA สร้างใบยื่นได้ |
| `salesOrderWorkTrack.test.mjs` · `handoffQueue.test.mjs` | ช่วงยื่นภาษีย้ายเป็นของ RA · คิวใหม่ของ SA |
| `documentWorkflowErrors` · `serviceRoundsCopyPaths` · `selectExpression` (PGRST201) | RAISE code ใหม่ · ALTER TABLE/FUNCTION ใหม่ · embed ที่ต้องระบุชื่อ FK |
| `saveQuotationContentColumns.test.mjs` | ถ้ามีคอลัมน์หัวใบใหม่ที่ต้องผ่าน `save_quotation_content` |

เทสต์ใหม่ที่ต้องมี: fixture ใบ excise อนุมัติแล้วได้ Actual 0 ทุกตัวตัดสิน · **แถวที่ไม่มี `origin` (รายงานยอดขาย) ยังนับ Actual** · guard: select ที่ป้อนตัวตัดสิน Actual และไม่ได้กรองใน query ต้องมี `origin` · ใบไม่มีดีลเห็นได้เฉพาะทีมของดีลต้นทาง (role ทีม/ของตัวเอง/ทุกทีม) · `enforceMasterPrices` ไม่ทับบรรทัด excise แต่ยังทับ QT ขาย · QT ขายใส่สินค้า 04-003 ไม่ได้ · กระดิ่งใบ excise ถึงเจ้าของดีลต้นทาง · RA ไม่มีทางอ่าน `/api/sales-planning`

---

## 9. ความเสี่ยง

| ความเสี่ยง | ทางลด |
|---|---|
| ปลด `dealId` NOT NULL แล้วตัวอ่านที่ลืมพังหรือรั่ว (59 ไฟล์แตะ `quotations` · ทุก route SO ผูกดีล) | PR1 ต้องขึ้นก่อนมีใบ excise ใบแรก · ตัวตัดสินเดียว `salesDocAccess` · ratchet ห้ามเรียก scope กับดีลที่อาจว่าง |
| Actual รั่วผ่านตัวตัดสินกลับด้านที่หลุดรอด | ชั้นฐานข้อมูลปิดเอง + CHECK `actualAmount = 0` + fixture ทุกตัวตัดสิน |
| ปะ RPC ที่รันอยู่ผิดตัว (เนื้อจริงต่างจากไฟล์) | อ่าน `pg_get_functiondef` บน prod ก่อนเขียน · ข้อความยึดต้องเจอครั้งเดียว · PGlite |
| PGRST201 — สองความสัมพันธ์ `quotations ↔ sales_orders` · `sales_orders` อ้างตัวเอง · `orders` → `sales_orders` สองเส้น | embed ทุกจุดระบุชื่อ FK · เทสต์ `selectExpression` |
| SA เก็บซ้ำ: ใส่สินค้า 04-003 / บรรทัดพิมพ์เองเรื่องสรรพสามิตใน QT ขาย | สินค้าไม่ขึ้นในตัวเลือก + server ปฏิเสธ · บรรทัดพิมพ์เองยังพิมพ์ได้ (Q7 ยอมราคารวมภาษี) → ทางเดียวที่กันคือ SA กด "ไม่เรียกเก็บ — ราคารวมแล้ว" |
| ใบค้างมีราคาขายปลีกไม่ครบ (101/220 สินค้า · 37 บรรทัดใน 22 SO ณ 26/10) | ออกใบไม่ได้จนกว่าเติมราคา (ด่าน Q3) · คิวบอกรายการที่ขาด |
| ทะเบียนขาดเยอะ (79 บรรทัดไม่มีเลย) → RA ข้ามด่านจนเป็นนิสัย | ทุกการข้ามมีเหตุผลบนใบ · รายงาน · ทบทวนรายสัปดาห์ |
| RA คนเดียว / FN ลายเซ็นคนเดียว | admin สำรอง RA (Q25) · FN อัปลายเซ็นเพิ่มก่อนเปิดระบบ |
| เงินค่าภาษีไหลในสมุดชำระของ FN | ป้าย origin · ลงบัญชีรับแทน |
| เลข migration ชน (หลายเซสชัน) | เอาเลขตอน merge · ตรวจ `ls migrations` และแบรนช์ที่ค้าง |
| dev DB = prod DB · ทดลองทุกครั้งเผาเลข QT/SO จริง | ทดลองกับใบค้างจริงหนึ่งใบที่ราคา/ทะเบียนครบ เดินครบเส้นพร้อม SA/ผู้จัดการ/FN/RA · ตรวจ wonValue/รายงานยอดขายก่อนและหลัง |

---

## 10. ข้อที่ตัดสินเพิ่ม (D1–D9 · ตอบครบ 28/10 · D7 ตอบ 29/10)

| # | เรื่อง | ค่าตั้งต้นในแผน | ใคร |
|---|---|---|---|
| D1 | แตกยอดสรรพสามิต/ท้องถิ่นตอนกรอก ภส. หลังปัด 8.8% ครั้งเดียว | ✅ **มติ 28/10:** สรรพสามิต = round2(ฐาน × 8%) · ท้องถิ่น = ภาษี/ชิ้น − สรรพสามิต/ชิ้น | เจ้าของ |
| D2 | เลขใบค่าสรรพสามิต | ✅ **มติ 28/10:** QT- ชุดเดิม + ป้าย "ค่าสรรพสามิต" · มาตรฐาน FM-SA-01 ตัวเดิม | เจ้าของ |
| D3 | SO ค่าสรรพสามิตออก Rev. ได้ไหม | ✅ **มติ 28/10:** ไม่มี Rev. · แก้ = ยกเลิก SO (ถ้า RA ยังไม่ยื่น) → ยกเลิก/Rev. ใบเสนอราคา → ออก SO ใหม่ | เจ้าของ |
| D4 | ด่านเอกสารยืนยันคำสั่งซื้อของ SO ค่าสรรพสามิต | ✅ **มติ 28/10:** เหมือน SO ปกติ (ไม่มีข้อยกเว้น) | เจ้าของ |
| D5 | ส่วนรหัสลูกค้าในรหัส 04-003 (3/4 หลัก) | ✅ **มติ 28/10:** ตามรูปที่ลูกค้าใช้อยู่ — สินค้ากลุ่ม 04 ของลูกค้า → FG ต้นทางบน SO → 4 หลัก (`composeFgCode`) | เจ้าของ |
| D6 | วันเปิดระบบ | ✅ **มติ 28/10:** เปิดทันทีที่ PR6 ขึ้น (ไม่กำหนดวันตายตัว) · ก่อนหน้านั้นทดลองกับใบค้างจริงหนึ่งใบให้เดินครบเส้นหลัง PR5 · ใบค้างทั้งหมดเข้าคิวตอน PR6 พร้อมป้าย "ก่อนเปิดระบบ" | เจ้าของ |
| D7b | ตัวเทสเตอร์ NOT FOR SALE (หมวด 01-002) เก็บค่าภาษีจากลูกค้าไหม | ✅ **มติเจ้าของ 29/10:** **เก็บด้วย** — คิดตามหมวดของสินค้าเหมือนตัวขาย (แนวเดียวกับ 01-015) · บรรทัดใบค่าสรรพสามิตแก้/ลบเองไม่ได้ จึงต้องตัดสินก่อนออกใบ | เจ้าของ |
| D7 | 01-015 ต้องเสียภาษีไหม · ยื่นกรมจริงรายรอบ/รายเดือน | ✅ **ตอบแล้ว 29/10 (เจ้าของ):** 01-015 "น้ำหอม (ห้ามจำหน่าย)" **ต้องเสียภาษี** (คงธง `isExcise` · prod ยังไม่มีสินค้าในหมวดนี้) · **ยื่นกรมทีละ SO** — 1 SO = 1 ใบยื่น = 1 ใบเสร็จกรม (0417 ลิงก์หนึ่งต่อหนึ่ง) | RA |
| D8 | แก้ใบหลังลูกค้าจ่ายแล้ว (ไม่มี Rev. + โอนงวดข้ามใบไม่ได้) | ✅ **มติ 28/10:** ยกเลิก + FN คืนเงิน + เก็บใหม่ (เส้นคืนเงินเดิม) · ถ้าเกิดบ่อยค่อยเพิ่มการโอนงวดระหว่าง SO ค่าสรรพสามิตของ SO ต้นทางเดียวกัน | เจ้าของ |
| D9 | SO ลูกค้าที่ตัดสิน "ไม่เรียกเก็บ" แล้วออก Rev. | ✅ **มติ 28/10:** ไม่ตามไป · Rev. ใหม่เข้าคิวให้ SA ตัดสินใหม่ (ประกาศใน `serviceRoundsCopyPaths` ว่าคอลัมน์ชุด `exciseNotBilled*` ไม่ลอก) | เจ้าของ |

---

## 11. การเปลี่ยนผ่าน

**ก่อนเริ่ม:** ตัดสิน D1–D5 · FN อัปลายเซ็นเพิ่ม · ตั้ง admin เป็นตัวสำรอง RA · merge #1925 ก่อน PR5
**ลำดับรัน:** 0414 → PR1 → PR2 → 0415 → PR3 → 0416 → PR4 → 0417 → PR5 → PR6 · migration รันมือใน SQL Editor ก่อน merge PR ที่ใช้เสมอ (deploy อัตโนมัติวันละ 3 รอบ — โค้ดที่อ่านคอลัมน์ที่ยังไม่มีจะพังทั้ง query)
**ไม่มีการย้ายข้อมูลเอกสาร** (`orders` ว่าง) · DML: ชื่อหมวด 04-003 (ใน 0414) · ถอด `ra:approve` รายคน (PR6)
**ใบค้าง:** 49 SO (14 ลูกค้า · ก.ค. 1 / ส.ค. 20 / ก.ย. 22 / ต.ค. 6 ณ 26/10) เข้าคิว SA พร้อมป้าย "ก่อนเปิดระบบ" · ลำดับ: ใบที่ราคา/ทะเบียนครบ (7 ใบ) → ใบที่เก็บนอกระบบแล้ว → ใบที่รอเติมราคา · นับตัวเลขใหม่ตอนเปิดระบบ (ตัวเลขเปลี่ยนทุกวัน)
**ทดลอง:** ใบจริงหนึ่งใบเดินครบ 13 ขั้น · เปิดจอด้วยบัญชีจริงของแต่ละฝ่าย (admin ผ่านทุกด่าน บังบั๊ก proxy) · ตรวจ wonValue/wonMonth ของดีลลูกค้า รายงานยอดขาย แดชบอร์ด ไม่ขยับ

---

## ภาคผนวก — ข้อเท็จจริงจากโค้ดที่ผูกแผน (main `250648bc0`)

- `quotations.dealId` NOT NULL + FK CASCADE (0065:8) · `sales_orders.dealId` NOT NULL (0107:9) · `quotations` ไม่มีคอลัมน์ origin / ownerId / team · RLS ไม่มี policy (service role ล้วน)
- RPC ที่ผูกดีล: submit QT (0156:104-106) · approve QT (0165:57-62 · ปะ 0382) · withdraw (0161:126-131) · reject (0164:93-98) · accept (0361:93-170 · ปะ 0388) · unaccept (0380:60-134) · create SO draft (0363:177 · ปะ 0407) · submit/approve SO (0197:63,168 · ปะ 0382/0392/0396/0400/0404) · cancel with reversal (0170:95-102) · ที่ไม่ผูก: `create_quotation_with_number` (0328) · `save_quotation_content` (0343 · ปะ 0407) · `force_delete_quotation` (0381:80 กันค่าว่างแล้ว) · `finance_approve_…` (0251) · snapshot เอกสาร (0130)
- Actual ชั้นฐานข้อมูล: 0412:421,513,562 กรอง pipeline + ดีล · ตัวตัดสินระดับแถวกลับด้าน: `salesOrderWorkflow.js:307-312,328` · `salesOrderActualMode.js:343,539`
- สิทธิ์: RA = `customers:view, products:view, products:margin, ra:view, ra:approve, history:view` (`permissions.js:688`) · FN = `salesplan:view` ('all') + `payments:confirm` · การแจ้งชำระ: `salesplan:edit` หรือ `canConfirmPayment` (`salesOrderPayments.js:823-829`) แต่ `loadOrderForUser` ตัดใบไม่มีดีลทุกคน (`installments/route.js:92-95`)
- สินค้า: รหัสลูกค้า `customers.arCode` → `customerCodeSegment` เติม 4 หลัก (`masterCodes.js:151-155`) · กลุ่ม 03/04 ไม่มีเลขรัน (`:116,173`) · ตัวเลือกสินค้ากรอง `approvalStatus` approved/ว่าง + `isActive` (`api/products/route.js:114,123`) · `enforceMasterPrices` ไม่ดู approval (`quoteLines.js:372-375`)
- เส้นยื่นเดิม: `orders.salesOrderId` unique + FK RESTRICT (0160) · `order_items.salesOrderLineId` FK RESTRICT · `order_items.quantity` integer (0002) · POST from-sales-order ต้องมี `sales:act` (`route.js:248`)

---

## ผลตรวจแผนรอบที่ 1 (ตัวค้านอิสระ · 28/10) — แก้ลงแผนแล้ว

| ระดับ | เรื่อง | แก้ที่ |
|---|---|---|
| BLOCKER | ตัดสิน Actual แบบ "เฉพาะ pipeline" ทำรายงานยอดขายเป็น 0 (query ไม่ได้ select `origin`) | หมวด 4 ใช้แบบตัดออก + guard |
| BLOCKER | ทางสร้างใบยื่นของ SA เปิดค้างระหว่าง PR3–PR5 → ชน unique + เก็บเงินซ้ำ | หมวด 3.6 · PR3 ปิดทาง |
| MAJOR | SO ค่าสรรพสามิตย้อนอนุมัติ/ยกเลิกได้หลัง RA ยื่น (ด่านดูแค่ `salesOrderId`) | หมวด 5 · 0416 trigger กันย้อนอนุมัติ · 0417 |
| MAJOR | ใบ excise ที่รับแล้วยกเลิกไม่ได้ → SO ลูกค้าล็อกตาย | หมวด 5 · PR3 |
| MAJOR | ใบ excise ไม่ขึ้น "รอฉันอนุมัติ" (ดีลต้นทาง Won = ปิด) | หมวด 3.7 · PR1 |
| MAJOR | รายการใบยื่นจากบรรทัดใบค่าสรรพสามิต: productId/ลิงก์บรรทัด/คิดใหม่ของ #1924 | หมวด 3.6 · PR5 |
| MAJOR | trigger 0162 ออกเลข ET + ใบแจ้งชำระถึงลูกค้าให้ทุกใบยื่น (ขัด Q1) | หมวด 3.6 · PR5 |
| MAJOR | หมวด 04-003 อาจมีของเดิมบน prod | ตรวจแล้ว 0 ทุกตาราง · ด่านเฉพาะบรรทัดใหม่ (หมวด 3.3) |
| MAJOR | จุดที่ PR1 ตกหล่น: ตารางวางบิล · แท็บเอกสาร · ลบบังคับ · ห้ามเติม `row.deal` | หมวด 3.7 · หมวด 5 · PR1/PR3 |
| MAJOR | แก้หลังจ่ายเงิน = คืนเงิน + เก็บใหม่ | D8 |
| MINOR | ด่าน `orders_not_empty` ใน 0414 ผูก PR1 กับ PR5 · ไม่มี NOTIFY · ลิงก์ SO ต้นทางแก้ได้ · CHECK ไม่เรียกเก็บไม่ครบชุด · ชนิด id ปน · PR1 ไม่ต้องรอ #1925 · SA ยังเข้า `/tax` ร่างทะเบียน · ผู้ยกเลิก QT = ผู้อนุมัติ · ผู้ยื่น SO = เจ้าของดีลต้นทาง/ผู้จัดการ · Rev. ของ SO ที่ตัดสินไม่เรียกเก็บ · แท็บเอกสารดีล/สมุดชำระจัดกลุ่ม · ความหมาย `orders.quotationId` | หมวด 2 · 3.6 · 3.7 · 6 · 7 · 10 |

ยืนยันแล้วว่าถูก: ชนิด id เป็น text · `guard_record_origin_immutable()` ใช้ได้ทุกตาราง · CHECK boolean ใช้ได้ · แถวเดิมผ่าน CHECK ใหม่ทุกตัว · `origin_shape` นิยามแค่ 0360/0374 (0412 ไม่ชน) · ชื่อคอลัมน์ `orders`/`order_items`/`product_types` ถูก · ปัญหาเจ้าของ 0294 มีจริง · Actual ชั้นฐานข้อมูลของ 0412 กรองจริง · trigger 0410 ดูแค่ 02-001 · ตัวอ่าน FC ข้ามใบไม่มีดีล · `create_quotation_with_number` รับคอลัมน์ใหม่ได้ · ยังไม่มี embed คู่ quotations↔sales_orders ที่จะชน PGRST201 วันนี้
