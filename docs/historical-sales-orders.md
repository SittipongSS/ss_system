# ใบสั่งขายย้อนหลัง (SO ย้อนหลัง) — คีย์งานบริการที่ขายไปแล้วนอกระบบ

> สถานะ: **กำลังดำเนินการ** · ตรวจกับโค้ดเมื่อ 2026-09-15 · P1 (โครงสร้าง + ตัวเขียน + จุดตัดเรื่องเงิน + คิว TS) โค้ดครบในแบรนช์ `claude/legacy-so` ยังไม่ commit · 🔴 **mig 0360 ยังไม่รัน — ต้องรันบนฐานจริงก่อน merge** · P2 (โมดัลคีย์ 4 ขั้น) ยังไม่เริ่ม · เฟส 3 (คีย์ของจริง) รอมติ "TS หาจุดไม่เจอ"

อ่านคู่กับ:
[so-pending-approval-amount.md](so-pending-approval-amount.md) (Actual = SO อนุมัติ · ตัว cache คู่ sync/enforce) ·
[legacy-deal-switch.md](legacy-deal-switch.md) (สวิตช์ "ดีลเก่า" — **คนละเรื่อง** กับสายนี้) ·
[service-intake-phase4.md](service-intake-phase4.md) (คิวงานเข้าใหม่ของ TS) ·
[sales-contract-plan.md](sales-contract-plan.md) (เอกสารแทนสัญญา) ·
ม็อก/บรีฟ `~/ss-team/mockups/legacy-so/` (อยู่นอกรีโป)

## 0. ย่อหนึ่งย่อหน้า

ชีตทะเบียนสัญญาบริการของทีม (379 จุดติดตั้ง · 149 ลูกค้า) ไม่มีทางเข้าระบบ เพราะสะพานเส้นเดียวระหว่างขายกับบริการ
(`service_zone_terms`) บังคับบรรทัดใบสั่งขาย ⇒ งานเก่าไม่ขึ้นคิวนัด ไม่มีรอบเติม ไม่มีต่อสัญญา
ทางที่เลือก: **แถวจริงใน `sales_orders` + ธง `origin = 'historical'`** เก็บยอดจริงไว้ในใบ แล้ว **กรองที่ตัวคำนวณ**
ทุกจุดที่คิดเงิน · ใบเกิดเป็น "อนุมัติแล้ว" ไม่มีใบเสนอราคา ไม่มีโครงการ ผูกกับ **ดีลภาชนะ** 1 ใบต่อ (ลูกค้า × AE)
· TS ผูกบรรทัดเข้าโซนเองในคิวงานเข้าใหม่

## 1. มติ (บรีฟ §3 · เคาะ 14–15/09/2026 "เอาตามที่แนะนำ")

| ข้อ | มติ | ลงโค้ดที่ |
|---|---|---|
| 1 | เงินงานเก่า **ไม่เข้า** Actual / FC / เป้า / ผลงานขาย (ออกบิลผ่าน Express ไปแล้ว) | §4 ทั้งหมด |
| 2 | เก็บยอดจริงไว้ในใบ แล้ว **กรองที่ตัวคำนวณ** (ไม่ใส่ 0 ในคอลัมน์เงิน) | `pipelineRowsOnly` · `salesOrderAmountKind` → `'excluded'` |
| 3 | ปลดเงื่อนไขใบเสนอราคาเฉพาะสายนี้ · เลขเดิมเก็บเป็นข้อความอ้างอิง | `quotationId DROP NOT NULL` + CHECK `sales_orders_origin_shape` (pipeline ยังบังคับ) |
| 4 | ผูกดีล · ดีลภาชนะ 1 ใบต่อลูกค้า × AE · ยอดดีล = 0 | CHECK `sales_deals_historical_shape` + unique `sales_deals_historical_container_uk` |
| 5 | ระบบออกเลขใหม่ตามรูปแบบปกติ (`SO-{YY}{MM}{RUNNING:4}-0`) · **วันที่ใบ = วันเริ่มสัญญาจริง** · เลข Express/IV/Q# เก็บเป็นอ้างอิง ค้นหาได้ | RPC ใช้บล็อกออกเลขชุดเดียวกับ 0343 (เทสต์เทียบ) · `historicalQuoteRef/ExpressRef/InvoiceRef` |
| 6 | เกิดเป็น **อนุมัติแล้ว** ทันที (ไม่เข้ากองรออนุมัติ) · `approvedAt` = เวลาคีย์ | RPC `create_historical_sales_order` |
| 7 | **ไม่ผูกโครงการ** | CHECK `"projectId" IS NULL` · guard create-project / link-project |
| 8 | 1 ใบ = ลูกค้า × ช่วงสัญญา (≈220) · **1 บรรทัด = 1 จุดติดตั้ง** (379) | `sales_order_lines."installationPoint"` (1–200) |
| 9 | งานที่จบแล้ว 196 แถว = เฟสสอง | planner ปฏิเสธ `running:false` |
| 10 | แถว "ยกเลิก" ไม่เอาเข้า | — (ตัดสินตอนคีย์) |
| 11 | แถวมูลค่า 0 เอาเข้าถ้ายังเดิน พร้อมหมายเหตุ | ยอด 0 ต้องมี `notes` + ยกเว้นด่านเงินอัตโนมัติ |
| 12 | สัญญางานที่ยังเดิน = **เอกสารแทนสัญญา** (external) | `POST /contracts` รับดีลภาชนะเฉพาะ external + service |
| 13 | งวดชำระ = คีย์เท่าที่รู้ + **สวิตช์ยกเว้นด่านเงินรายใบ** มีร่องรอยผู้ยกเว้น | `paymentGateExempt*` 4 คอลัมน์ · `visitGate` ข้อ② |
| 14 | รอบบริการต่อบรรทัดกรอกเท่าที่รู้ | `serviceRounds` เว้นว่างได้ |
| 15 | คีย์ได้: **AE Supervisor + แอดมิน** (เทียบ role ตรง ๆ ไม่ใช่ isSuperuser) | `canKeyHistoricalSalesOrder` + literal ใน RPC |
| 16 | คีย์ทีละใบ (ไม่อัปโหลดทั้งชีต) | ไม่มีตัวนำเข้า |
| 17 | **ผูกบรรทัด ↔ โซน = TS ในคิว "งานเข้าใหม่"** · ฝ่ายขายพิมพ์ชื่อจุดติดตั้งเป็นข้อความ ไม่มีตัวเลือกโซนในโมดัล | §8 |
| 18 | ค่า origin = **`'historical'`** (ไม่ใช่ `'legacy'` — `metadata.legacy` เป็นของสวิตช์ดีลเก่า) | `lib/sales/historicalOrders.js` บ้านเดียวของ literal |
| 19 | ป้ายดีลภาชนะ **ห้ามเรียก "ดีลเก่า"** | `HISTORICAL_DEAL_TITLE` = "งานบริการย้อนหลัง · ลูกค้า" |
| 20 | SO ย้อนหลังผูกดีลสวิตช์เดิมไม่ได้ — ดีลปลายทางต้อง historical + won + SERVICE + ไม่มีโครงการ | RPC ตรวจ `historical_so_deal_invalid` หลังทุกทางที่หยิบดีล |
| 21 | รายงานเป้า (`report/route.js`) ต้องกรอง origin ในเฟส 1 · ตัวกรองของ sync/enforce อยู่ใน **0360** (บรีฟเขียน 0357 — เลขย้ายแล้ว) | §4 |

### คำตอบคำถามเปิดของแผน P1 (15/09/2026 · ทับค่าตั้งต้นของแผน)

1. **AE บังคับตอนคีย์** — ต้องเลือก AE ปัจจุบัน (ae/senior_ae ที่ใช้งานอยู่ · กติกาเดียวกับ `validateDealOwner`) ·
   ไม่มีดีลภาชนะเจ้าของว่าง (CHECK + RPC `historical_so_owner_required`) · ทีมตามเจ้าของดีล ·
   แถวชีตที่ AE ว่าง (94 แถว) ผู้คีย์เลือก AE ให้ · unique เป็น `(customerId, ownerId)` ตรง ๆ
2. **งวดที่เก็บนอกระบบแล้วไม่คีย์** — คีย์เฉพาะยอดที่ยังต้องเก็บ · ใบที่มีประวัติเก็บเงินแล้วใช้สวิตช์ยกเว้นด่านเงิน ·
   พรีวิวเตือนงวดที่เลยกำหนด ("จะขึ้นเลยกำหนดในทะเบียนบัญชีทันที")
3. **TS หาจุดติดตั้งไม่เจอ — P1 ไม่มีทางออก** · บรรทัดค้างในคิวและนับบนป้ายตลอด · undo เดียวคือแอดมินลบทั้งใบก่อน TS ผูก ·
   🔴 **ต้องมีมติ/ทางออกก่อนเฟส 3** (ข้อเสนอ P2: AE Sup/แอดมินถอดบรรทัดที่ยังไม่ผูก หรือ TS ตีกลับ "ไม่พบจุดนี้" พร้อมเหตุผล)
4. **ย้ายพนักงาน (`users/[id]/transfer`) ไม่ย้ายดีลภาชนะอัตโนมัติ** — พรีวิว/ผลลัพธ์บอกจำนวนดีลภาชนะที่คนออกยังถืออยู่ ·
   ย้ายทีละใบด้วย PATCH ดีล (§6.6) · ปลายทางมีดีลภาชนะของลูกค้ารายนั้นอยู่แล้ว = 409 (P1 ไม่รวมดีล)

## 2. โครงสร้างข้อมูล (mig 0360)

- `sales_deals.origin` · `sales_orders.origin` — `'pipeline' | 'historical'` DEFAULT pipeline · **เปลี่ยนไม่ได้** (trigger `guard_record_origin_immutable`)
- `sales_orders`: `historicalQuoteRef` · `historicalExpressRef` · `historicalInvoiceRef` (≤200) · `historicalIntakeHash` (sha256 ของคำขอ) ·
  `paymentGateExemptAt/ById/ByName/Reason` (เหตุผล 10–500 · CHECK ห้ามใบ pipeline มี)
- `sales_order_lines."installationPoint"` (1–200)
- `sync_sales_order_actual` / `enforce_sales_order_actual_on_deal` = 0353 + `origin = 'pipeline'` สี่จุด (เทสต์ตัดตัวกรองแล้วเทียบ 0353)
- RPC (service_role เท่านั้น): `create_historical_sales_order` (intake key + fingerprint · replay เฉพาะคำขอเดียวกัน · ล็อกลูกค้า × AE ·
  สร้างดีลภาชนะถ้ายังไม่มี · race กับการย้ายเจ้าของ → ค้นใหม่แล้วผูก หรือ `historical_so_container_deal_race`) ·
  `append_historical_installments` (FOR UPDATE · ผลรวมห้ามเกินยอดใบ) · `historical_so_installments_total` (ตัวตรวจงวดชุดเดียว)
- งวดที่ RPC เขียน = `pending` + `frozenAt` (ตรึงแล้ว) ⇒ แจ้งชำระแล้วเข้าคิวบัญชี (`reported`) ตามสายเดิม · `financeStatus` NULL (ไม่เข้าคิวปิดใบของบัญชี)

## 3. ทางเข้าของคน

| ใคร | ทำอะไร | ด่าน |
|---|---|---|
| AE Supervisor / แอดมิน | คีย์ใบ · ยกเว้นด่านเงิน · คีย์งวดเพิ่ม · ย้ายเจ้าของดีลภาชนะ | `canKeyHistoricalSalesOrder` |
| ฝ่ายขาย / บัญชี | แจ้ง/รับรองงวดตามปกติ · ออกเอกสารแทนสัญญา + ผูกกับใบ | สิทธิ์เดิมของงวด/สัญญา |
| TS (Planner/หัวหน้า) | ผูกบรรทัดเข้าโซนในคิวงานเข้าใหม่ · เพิ่มไซต์ย้อนหลังถ้ายังไม่มี | `canEditService` |
| แอดมิน | undo = ลบใบ (ปกติได้เฉพาะยังไม่มีอะไรปลายน้ำ · บังคับลบผ่านพรีวิว) | §6.5 |

## 4. จุดตัดเรื่องเงิน (ทุกจุดที่ใบย้อนหลังต้องไม่ถูกนับ)

**SQL** — cache Actual/รออนุมัติของดีล (sync + enforce)

**ตัวอ่านใบสั่งขาย**
- `api/sales-planning/report` (ใบอนุมัติรายเดือน + ใบรออนุมัติ) — `pipelineRowsOnly`
- `lib/pm/productionJobsRepo` ร่างงานผลิตอัตโนมัติ — `pipelineRowsOnly` + `isHistoricalOrder` ใน `productionPlan`
- `lib/sales/handoffQueueData` คิวรอยื่นภาษี · `api/tax/orders/from-sales-order` (ตัวเลือก · GET "ไม่เข้าเกณฑ์" · POST ปฏิเสธ)
- `lib/sales/salesOrderWorkflow`: `salesOrderAmountKind` = `'excluded'` · `salesOrderActual` = 0 (ทะเบียน SO · หน้าดีล · หน้า SO)

**ตัวอ่าน KPI ระดับดีล** (ดีลภาชนะ = Won มูลค่า 0)
- `isWonAwaitingSo` ตัดดีลภาชนะ · dashboard/history กรองที่ query (history กันการเขียน `sales_history` ถาวรด้วย)
- `summarizeMyDeals` · การ์ด KPI หน้าดีล (`kpiDeals`) · DealDrillDownModal — `.filter(isKpiDeal)` (แถวยังโชว์ในตาราง แต่ไม่นับการ์ด "ดีลทั้งหมด")
- คำใต้การ์ด Won: kind `historical` — "ดีลของใบสั่งขายย้อนหลัง · ไม่นับยอดขายและ FC"

**การกระทำที่ปิด** — ย้อนการอนุมัติ · ออก Rev. · คืนเป็นร่าง · ยกเลิกแบบย้อน Won (ยกเลิกเฉย ๆ ได้) · สลับภาษาเอกสาร (พิมพ์ใบย้อนหลังยังไม่รองรับ) ·
ดีลภาชนะ: เปลี่ยนลูกค้า/สาย/ประเภท/ทีมว่าง · ไทม์ไลน์ · สร้าง/ผูกโครงการ · ลบดีลที่ยังถือใบ (CASCADE จะลบใบย้อนหลังทั้งลูกค้า × AE)

**ค้นหา** — ทะเบียน SO และทะเบียนการชำระค้นด้วยเลขเอกสารเดิมได้ · แถวทะเบียนการชำระพก `origin`

## 5. ยามกันไหลกลับ

| ยาม | ไฟล์ | กัน |
|---|---|---|
| SQL tripwire | `historicalSalesOrderMigration.test.mjs` | ฟังก์ชันที่อ่าน `sales_orders` + `'approved'` ต้องกรอง pipeline หรืออยู่ในรายการ "ตรวจสถานะอย่างเดียว" 7 ตัว (approve/cancel-reversal/capture-snapshot/finance-approve/revoke + สอง RPC ของ 0360) · ghost check |
| คำสั่งอ่าน SO | `historicalMoneyGuards.test.mjs` | ทุก `.from('sales_orders')` ที่แตะยอด/สถานะต้องอยู่ชั้นใดชั้นหนึ่ง: **MUST_FILTER** (report×2 · productionJobsRepo · handoffQueueData · tax picker) · **PER_ID_GUARDED** (tax by-id · SO `[id]` · installments) · **SEES_HISTORICAL** (nav counts · service intake · finance payments · ทะเบียน SO · overview ดีล) · **SCOPED_SAFE** (ของที่อ่านผ่าน projectId/quotationId/ร่าง) |
| import KPI ระดับดีล | เดียวกัน | ไฟล์ที่ import ตัวช่วย Won/FC ต้องตัดดีลภาชนะเอง หรืออยู่ใน `DEAL_KPI_ALLOWLIST` พร้อมเหตุผล |
| literal | เดียวกัน | `'historical'` และ `.eq('origin', …)` มีบ้านเดียวคือ `lib/sales/historicalOrders.js` (สะกดผิดที่เดียว = ตัวกรองว่างเงียบ) |
| สายไฟฝั่งบริการ | `lib/service/historicalServiceSide.test.mjs` | select ของคิว/bind/gateContext · bind เรียกด่านปลายทางก่อน insert · gateContext ไม่กลืน error · visitGate ยกเว้นเฉพาะข้อ② |
| copy paths | `serviceRoundsCopyPaths.test.mjs` | คอลัมน์ใหม่ของ `sales_orders` ต้องประกาศว่า Rev./ร่างไม่ก๊อป |

## 6. API

### 6.1 คีย์ใบ — `POST /api/sales-planning/sales-orders/historical`

พรีวิวก่อน (`preview:true`) แล้วบันทึกด้วย `intakeKey` เดิม · ห้าม `retry:true` · ออก `intakeKey` ใหม่หลังบันทึกสำเร็จ/หลังแอดมินลบใบ

```jsonc
{
  "preview": true, "intakeKey": "uuid", "running": true,
  "customerId": "…", "ownerId": "uuid (บังคับ)", "team": "… (ขอได้ แต่ทีมจริงตามเจ้าของ)",
  "orderDate": "2024-06-01", "amountsIncludeVat": true, "vatRate": 7, "docLanguage": "th",
  "refs": { "quote": "Q#…", "express": null, "invoice": "IV…" },
  "notes": "… (บังคับเมื่อยอด 0)",
  "lines": [{ "installationPoint": "…", "productId": "…", "qty": 2, "lineAmount": 60320, "serviceRounds": 36 }],
  "installments": [{ "label": "งวด 3/3", "amount": 30160, "dueDate": "…", "coversFrom": "…", "coversTo": "…" }],
  "paymentGateExemptReason": null, "acknowledgeDuplicates": false
}
```

| ผล | รูป |
|---|---|
| พรีวิว | 200 `{ preview:true, plan:{ header, lines, installments, deal, exemption, duplicates, warnings, errors } }` — ไม่เรียก RPC |
| บันทึก | 201 `{ order, lines, installments, deal, dealCreated, replayed:false }` · ส่งซ้ำคำขอเดิม 200 `replayed:true` |
| ข้อมูลผิด | 400 `{ error, errors:[{ field, message }] }` (VAT 0 หรือ 7 เท่านั้น) |
| สิทธิ์ | 403 (ไม่ใช่ AE Sup/แอดมิน) |
| ซ้ำ | 409 `historical_so_duplicate_unacknowledged` + `duplicates` (ลูกค้าเดียวกัน วันที่เดียวกัน หรือเลขเดิมตรง) |
| รหัสคีย์ชน | 409 `historical_so_intake_key_conflict` + `existingOrderId` |
| ชนการย้ายเจ้าของดีล | 409 `historical_so_container_deal_race` — "กดบันทึกอีกครั้ง" |
| ยังไม่รัน 0360 | 503 |

### 6.2 ยกเว้นด่านเงิน — `PATCH /api/sales-planning/sales-orders/:id`
`{ action:"set_payment_gate_exemption", exempt, reason }` · AE Sup/แอดมิน · ใบย้อนหลังที่อนุมัติอยู่เท่านั้น · เหตุผล 10–500 ·
`exempt` ต้องเป็น boolean จริง (ไม่ส่ง / `"true"` / `1` = 400 — ไม่ตีความเป็นถอด) ·
ใบยอด 0 ถอนการยกเว้นไม่ได้ · สถานะเดิมซ้ำ = ไม่เขียน · audit เฉพาะสี่ช่อง

### 6.3 คีย์งวดเพิ่ม — `POST /api/sales-planning/sales-orders/:id/installments`
`{ action:"append", rows:[{ label, amount, dueDate, coversFrom, coversTo }] }` · AE Sup/แอดมิน + สิทธิ์แก้ดีล ·
201 `{ installments, appended, warnings }` · 400 `{ error, errors }` · 503 เมื่อยังไม่รัน 0360 ·
POST แบบอื่นบนใบย้อนหลัง = 400 (ไม่มีแผนจากใบเสนอราคาให้ยกมา)

### 6.4 สัญญา (เส้นเดิม)
`POST /contracts { dealId, kind:"service", source:"external", externalDocKind, externalRef, contractDate }` → แนบไฟล์ →
`approve-external` (ต้องมีวันเริ่ม + วันหมดอายุ) → `PATCH /sales-orders/:id { action:"set_service_contract", contractId }`
— ใบย้อนหลัง: สัญญาต้องมีทั้งสองวันและ **ครอบ `orderDate`** (ดีลภาชนะถือสัญญาได้หลายช่วง)

### 6.5 undo (แอดมิน)
`DELETE /sales-orders/:id?dryRun=1` → `DELETE` แบบปกติได้เมื่อยังไม่มีโซนที่ TS ผูก · รอบบริการ · งวดคอนเฟิร์ม · เลขใบกำกับ
(ไม่งั้น 409 → อ่านพรีวิวแล้วใช้ `?force=1`) · ด่านอ่านโซน/รอบบริการ/**งวด** ใหม่ทั้งสามก้อน อ่านไม่ขึ้น = 500 ไม่ลบ
(ไม่เชื่องวดของ `loadOrder` ที่กลืน error เป็นว่าง) · audit เก็บ zone terms + service plans + งวดดิบ · รอบบริการที่ชี้ใบถูกถอดชี้ ·
ดีลภาชนะที่ว่างแล้วลบต่อได้

### 6.6 ย้ายเจ้าของดีลภาชนะ (คำตอบข้อ 4)
- `GET /api/users/:id/transfer` → `{ historicalDeals, historicalDealList }` · `POST` (ย้ายดีลเปิดตามเดิม) คืน `historicalDeals` ·
  `historicalDealList` · `historicalDealsError` (ถ้านับไม่ได้) — **ไม่ย้ายดีลภาชนะให้**
- `PATCH /api/sales-planning/deals/:id { ownerId }` — AE Sup/แอดมิน · เจ้าของใหม่ต้องเป็น ae/senior_ae ปัจจุบัน ·
  ทีมของดีลถูกทับเป็นทีมของ AE ปลายทางเสมอ (ทีมตามดีล) · AE ที่ยังไม่มีทีม = 400 "ตั้งทีมที่หน้าจัดทีมก่อน" (ด่านเดียวกับตอนคีย์) ·
  AE คนนั้นมีดีลภาชนะของลูกค้ารายเดียวกันแล้ว = 409 บอกชื่อ AE + รหัสดีล (P1 ไม่รวมดีล) ·
  ใบย้อนหลังของดีลถูกย้าย `ownerId/ownerName` ตาม (ใบกำกับ/ทะเบียนการชำระแจ้งถูกคน) · audit
- ⚠️ ฟอร์มดีลล็อกช่องเจ้าของบนดีล Won ⇒ P1 ย้ายได้ทาง API เท่านั้น

## 7. การกระทำของงวดบนใบย้อนหลัง

| action | ใบย้อนหลัง |
|---|---|
| `schedule` · `coverage` · `report` (≥1 หลักฐาน) · `confirm` · `reject` · `withdraw` · `unconfirm` | ได้เหมือนใบปกติ — งวดตรึงแล้ว แจ้งชำระจึงเข้า `reported` |
| `tax-invoice` / `tax-invoice-clear` | ได้ — บันทึกเลขใบกำกับที่ออกไปแล้ว (writer เดียว `lib/sales/taxInvoice.js`) ไม่ได้ออกใบใหม่ |
| `link` | ปฏิเสธ (ไม่มี quotationId) |
| `unlink` | ไม่มีผล (ไม่มีอะไรผูก) |
| POST ยกงวดจากแผนใบเสนอราคา | 400 — ใช้ `append` |

## 8. ฝั่งบริการ (คิวงานเข้าใหม่ · ด่านเข้าไซต์)

รายละเอียดอยู่ใน [service-intake-phase4.md](service-intake-phase4.md) §ใบสั่งขายย้อนหลังในคิว — สรุป:
- แถวพก `origin` · เลขเดิม · จุดติดตั้ง · ใบย้อนหลังเรียงต่อท้ายใบปกติ · ป้ายบนเมนูนับรวม
- `fgSummary` แยกกลุ่มตามจุดติดตั้ง (ใบปกติไม่ขยับ) · wizard โชว์จุด + ชี้ "เพิ่มไซต์ย้อนหลัง"
- bind ตรวจปลายทางทุกใบ (ไซต์ของลูกค้าในใบ · ไซต์ลูกค้า · ไซต์/โซนเปิดใช้งาน) · ตัดวันของ term จาก body · audit รายแถว
- `visitGate` ข้อ② ผ่านเมื่อ `historicalGateExempt` และบอกว่าผ่านเพราะยกเว้น · **ข้อ① สัญญาไม่มีทางยกเว้น** —
  ทุกโซนของใบย้อนหลังติด "ผูกที่หน้าใบสั่งขาย" จนกว่าเอกสารแทนสัญญาที่ครอบ `orderDate` จะถูกผูก (P2 ต้องพาเดินขั้นสัญญา)
- `gateContext` เลิกกลืน error

## 9. ลำดับ deploy

1. commit 1: mig 0360 + เทสต์ของมัน (ไม่มี JS) · `npm test` + `check:migrations`
2. **รัน 0360 บนฐานจริงด้วยมือ** (SQL Editor · DDL) → คำสั่งตรวจหลังรันในหัวไฟล์ → smoke test BEGIN…ROLLBACK
3. `npm run check:columns` + `check:rowcap` บนเครื่อง
4. commit 2+: JS ทั้งหมด · PR เขียน "0360 รันบน prod วันที่ … — ต้องรันก่อน merge" · CI `check:columns` แดงจนกว่าจะรัน

🔴 สลับข้อ 2 กับ 4 = 500 ที่ dashboard · รายงาน · คิวผลิต · ตัวเลือกภาษี · ด่านเข้าไซต์ (visits/plans/renewals) · คิวงานเข้าใหม่ ·
และคิวรอยื่นภาษีว่างเงียบ (my-dashboard/overview กลืน error) · รัน 0360 ก่อนปลอดภัย

## 10. ค้าง / ต้องตัดสิน

- 🔴 **มติ "TS หาจุดติดตั้งไม่เจอ"** ก่อนเฟส 3 (คำตอบข้อ 3)
- แจ้ง TS ก่อนเฟส 3 ว่าป้ายงานเข้าใหม่จะโตราว 180 บรรทัด
- P2: โมดัลคีย์ 4 ขั้น + จอจบ (พาเดินขั้นสัญญา) · ป้าย/ตัวกรอง "ย้อนหลัง" บนทะเบียน SO · คำบนหน้า SO ("ลบฉบับร่างถาวร" · "อ้างอิง QT" · การ์ดที่อยู่ "ยึดตามใบเสนอราคา") · พิมพ์ใบย้อนหลัง · ชื่อแสดงของดีลภาชนะ (ข้อ 19) · UI ย้ายเจ้าของดีลภาชนะ
- บรีฟ (`mockups/legacy-so/design-brief.md`) ยังเขียน `origin='legacy'` (§2) · "0357" (ข้อ 21) · ดีลเก่า 49 (จริง 51) · ม็อก `index.html` ยังมีคำ "ดีลเก่า" · AE "เว้นว่างได้" · งวด "รับรองแล้ว" · สองช่องวันที่ — แก้ก่อน P2
- `canSalesOrderTransition` (ตัดสินจากสถานะอย่างเดียว) ยังไม่ได้ไล่ผู้เรียก
