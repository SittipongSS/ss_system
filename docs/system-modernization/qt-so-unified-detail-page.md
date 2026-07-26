# เฟสสุดท้าย: rewrite หน้าใบเสนอราคา + ใบสั่งขาย ให้เป็น design system เดียว

> สถานะ: **implementation รอบแรกเสร็จและผ่านการตรวจ** — Contextual Right Rail +
> Document Control ใช้กับ QT/SO detail และ QT create แล้ว (2026-07-26)
> มติผู้ใช้ 2026-07-25: *"rewrite QT กับ SO ต้องไปควบคู่กัน เพราะเป็นส่วนที่เกี่ยวเนื่องกัน
> และมันควรเป็น design system เดียว"*

### Implementation checkpoint — 2026-07-26

- ✅ เพิ่ม `ContextualRightRail`, `DocumentSummaryCard`, `DocumentControlCard`,
  `RelatedDocumentCard` และ `WorkflowRail` กลาง
- ✅ QT/SO ใช้ action model และตำแหน่งปุ่มชุดเดียวกัน โดย business rule/API ยังอยู่ที่แต่ละหน้า
- ✅ ย้าย browser confirm/prompt ของ QT/SO เป็น `ConfirmDialog`/`Modal`
- ✅ QT ใช้ `SalesDetailOverview` กลางและลบ CSS overview/sidebar ที่ซ้ำ
- ✅ QT create ใช้ `DetailPageLayout` + overview/summary/control card กลาง พร้อม
  `DocumentReadinessList`; ปุ่มบันทึก/ยกเลิกอยู่ในกลุ่มจัดการเอกสาร
- ✅ QT/SO ใช้ `QuotationLineItems` read-only, `StatusNotice` และ `ReasonDialog`
  กลางแล้ว ไม่เหลือตาราง/alert/reason dialog คู่แฝดในสองหน้า
- ✅ SO มี `RelatedDocumentCard` สำหรับ downstream Excise Filing; การสร้างเรียก
  endpoint ของโมดูล Tax และลิงก์กลับกันสองทาง
- ✅ unit tests 764 รายการ, targeted lint, migration checker และ production build ผ่าน
- ✅ ตรวจ QT/SO shared components ด้วยข้อมูล QA ชั่วคราว และตรวจหน้า QT create จริงทั้ง
  desktop/mobile + light/dark; ไม่มี horizontal overflow หรือ console error
- ⏳ acceptance matrix ทุก role/status กับข้อมูลจริงยังต้องตรวจใน staging ที่มี Supabase env

## ที่มา

สายงานหลักฐานลายเซ็น (mig 0150–0155, PR #698–#713) ปิดครบแล้ว — ทั้งสองเอกสารมี flow
เดียวกัน (ร่าง → ยื่นอนุมัติ = ลงนามผู้จัดทำ → อนุมัติ = ลงนามผู้อนุมัติ) และใช้เครื่องยนต์
เอกสารตัวเดียวกัน (`lib/sales/quotationMasterDocument.js`) แต่ **หน้าเว็บของสองใบยังเหมือน
คนละระบบ** — ปุ่มความหมายเดียวกันอยู่ต่างตำแหน่ง ต่างสไตล์ ต่างชื่อ

## ⚠️ กติกาของเฟสนี้ (มติผู้ใช้)

1. **ทำคู่กัน ห้ามทำทีละหน้า** — แก้หน้าเดียวแล้วอีกหน้าตามทีหลัง = ช่วงกลางทางผู้ใช้เจอ
   สองระบบเหมือนเดิม
2. **ห้ามยก QT ไปหา SO** — ยกทั้งสองหน้าไปหา **มาตรฐานกลาง** พร้อมกัน
3. ยึด `docs/system-modernization/ux-ui-rulebook.md` (มีอยู่แล้ว **ห้ามคิดกติกาใหม่**)
4. โหลด skill `material-design` ก่อนแตะ UI · ใช้ token จาก `webapp/src/app/globals.css`
   ห้าม hard-code สี/ขนาด
5. **เปิดหน้าเว็บดูจริงก่อนส่ง** ห้ามประเมินจาก diff — ทดสอบได้แม้ไม่มี `.env`
   (proxy ปล่อยผ่านเมื่อ env หาย + stub `window.fetch` เพื่อดูหน้าตอนมีข้อมูล)
6. กฎ `webapp/AGENTS.md`: **ห้ามมีโค้ดคู่แฝด** — ของที่ใช้ร่วมต้องเป็น component เดียว

## สถานะจริงของโค้ด (ตัวเลขจากการสำรวจ ไม่ใช่การประเมิน)

| | ใบเสนอราคา (QT) | ใบสั่งขาย (SO) | ต้นแบบที่สะอาดสุด |
|---|---|---|---|
| ไฟล์หน้า | `sales-planning/quotations/[id]/page.js` **760 บรรทัด** | `sales-planning/sales-orders/[id]/page.js` **400 บรรทัด** | `pm/tasks/[id]/page.js` **210 บรรทัด** |
| CSS เฉพาะหน้า | **477 บรรทัด / 29 คลาส** | 52 บรรทัด / 20 คลาส | เหลือแค่ grid/field/label/value |
| ใช้ `SalesDetailOverview` | ❌ **ไม่ใช้** | ✅ ใช้ | ✅ ใช้ |
| `window.confirm` / `prompt` | 3 | 5 | 0 |

**`SalesDetailOverview` ถูกใช้แล้ว 8 หน้า** (customers, products, pm/tasks, sa/inquiries,
sa/projects, deals, leads, sales-orders) — **QT เป็นหน้ารายละเอียดเดียวในระบบที่ไม่ใช้**

### สิ่งที่ต้องแก้ฝั่ง QT

- **6 คลาสก๊อปทับ component กลางตรง ๆ**: `.overviewCard` `.badgeRow` `.eyebrow`
  `.overviewHeading` `.quickFacts` `.stateBadge` — ชื่อเดียวกับใน
  `components/salesPlanning/SalesDetailOverview.module.css` แต่ค่าเพี้ยนกัน
  (ไซด์บาร์ไม่ sticky · หัวการ์ด 16px vs 15px ไม่มีเส้นคั่น · eyebrow ไม่ uppercase ·
  breakpoint 900 vs 1050)
- หัวเรื่องเป็น**ชื่อลูกค้า** (`h2`) — ควรเป็น**เลขที่เอกสาร** (`h1`) เหมือนหน้าอื่น
- `.headerActions` ซ้อนบน `.ui-workspace-back-actions` (gap 8 vs 10)
- ไม่มี loading state

### สิ่งที่ต้องแก้ฝั่ง SO

- `window.confirm` ×4 + `window.prompt` (เหตุผลตีกลับ) → `Modal`/`ConfirmDialog`
  (ต้นแบบ `sa/costing/[id]`)
- `.workflowRail` `.workflowStep` `.stepMarker` `.workflowCard` `.workflowHeader`
  เขียนเฉพาะหน้า → ยกเป็น **`WorkflowRail` กลาง** ให้ QT ใช้ด้วย
- `.linesTable` `.tableWrap` `.totals` `.grandTotal` `.actualTotal` ซ้ำกับ
  `QuotationLineItems.module.css` → ทำ **read-only mode** ให้ component กลางแล้วเรียกใช้
- `.alertError` / `.alertSuccess` → utility กลางใน `globals.css`
- สถานะเอกสารโชว์ซ้ำหลายที่ → เหลือป้ายข้างชื่อ
- สีดิบ `color: white` + `!important` → token
- loading state โชว์ `premium-header` ตอนโหลด แต่ `hideHeader` ตอนโหลดเสร็จ
  (หน้ากระพริบเปลี่ยนโครง)

## มติ UX เพิ่มเติม: Contextual Right Rail

ใช้รูปแบบ **Contextual Right Rail** เป็นโครงกลางของหน้า create/edit/detail ที่มีการตัดสินใจ
เกี่ยวกับเอกสาร โดย desktop แสดงเป็นคอลัมน์ขวาแบบ sticky และหน้าจอแคบเปลี่ยนเป็นการ์ดเต็มความกว้าง
ใน document flow ปกติ ไม่ใช่ navigation sidebar, drawer หรือ FAB

Right rail เป็นพื้นที่ประกอบ component ตามบริบท ไม่ใช่การ์ดใหญ่ใบเดียว:

```text
ContextualRightRail
├── DocumentSummaryCard       ยอดรวม/ข้อมูลสำคัญ
├── DocumentControlCard       สถานะ ความพร้อม และ action ของเอกสารปัจจุบัน
└── RelatedDocumentCard       เอกสารต้นทาง/ปลายทางที่เกี่ยวข้อง
```

หน้าไม่จำเป็นต้องแสดงครบทุก card แต่ตำแหน่งและลำดับต้องเหมือนกันทั้ง QT และ SO เมื่อมีความหมายเดียวกัน

### ขอบเขตความรับผิดชอบ

- `ContextualRightRail` รับผิดชอบเฉพาะ layout, sticky behavior, spacing และ responsive order
- `DocumentSummaryCard` แสดงยอดรวม/quick facts ด้วยตัวเลขแบบ tabular; ไม่มี workflow logic
- `DocumentControlCard` แสดงสถานะ คำอธิบาย `WorkflowRail`, readiness/evidence และกลุ่มปุ่ม
- `RelatedDocumentCard` แสดงความสัมพันธ์และการสร้าง/เปิดเอกสารถัดไป
- QT/SO page หรือ pure adapter ของแต่ละเอกสารเป็นผู้คำนวณ permission, visibility, disabled state,
  disabled reason และ callback/API; component กลาง **ห้าม** branch ด้วย `documentType`
- modal ยืนยัน, modal ใส่เหตุผล, dry-run preview และ async state ยังเป็นของหน้า/feature hook
  แล้วส่ง callback และ busy state เข้ามา
- ใช้ `ActionButtons.js`, `Toast`, `Skeleton`, `EmptyState` และ token/class ใน `globals.css`
  ก่อนสร้างของใหม่

ตัวอย่าง contract ที่ต้องการ:

```jsx
<DocumentControlCard
  status={status}
  statusDescription={statusDescription}
  workflowSteps={workflowSteps}
  checklist={checklist}
  notices={notices}
  primaryAction={primaryAction}
  secondaryActions={secondaryActions}
  dangerActions={dangerActions}
  busy={busy}
/>
```

action descriptor ขั้นต่ำประกอบด้วย `id`, `label`, `kind`, `visible`, `disabled`,
`disabledReason`, `busy` และ `onClick` โดยมี filled primary ได้สูงสุดหนึ่ง action ต่อบริบท

### ตำแหน่งปุ่มมาตรฐาน

| ตำแหน่ง | หน้าที่ |
|---|---|
| Page header | ย้อนกลับ + entity utility เช่น แก้ไข, ลบ/บังคับลบ |
| `DocumentControlCard` | บันทึก, ยื่น, อนุมัติ, ตีกลับ, เปลี่ยนสถานะ, ยกเลิก/คืนสถานะ, override, ออกเอกสาร/PDF |
| `RelatedDocumentCard` | สร้าง/เปิด SO จาก QT และสร้าง/เปิดรายการยื่นชำระจาก SO |

ห้ามแสดง action เดียวกันซ้ำทั้ง header และ right rail และห้ามนำการสร้างเอกสารปลายทางมาปนกับ
lifecycle ของเอกสารปัจจุบัน

### Action ตามบริบทของ QT และ SO

| บริบท | QT | SO |
|---|---|---|
| Create/Edit | บันทึก, ยกเลิกการแก้ไข | บันทึกร่าง, บันทึกและยื่น, ยกเลิก |
| Ready to submit | ยื่นอนุมัติ | ยื่นอนุมัติ |
| Pending review | อนุมัติ, ตีกลับ | อนุมัติและนับ Actual, ตีกลับ, Admin Override ตามสิทธิ์ |
| Approved/active | ส่งให้ลูกค้า, Won, ย้อนการรับตามเงื่อนไข | ยกเลิก SO/คืนเป็นร่างตามเงื่อนไข |
| Document output | ออกเอกสาร/ดาวน์โหลด PDF | ออกเอกสาร/ดาวน์โหลด PDF |
| Related process | สร้าง/เปิด SO ใน `RelatedDocumentCard` | สร้าง/เปิดการยื่นชำระใน `RelatedDocumentCard` |

ตารางนี้ระบุตำแหน่งและลำดับชั้นของปุ่มเท่านั้น เงื่อนไขจริงต้อง reuse predicate/permission
เดิมของแต่ละหน้า ห้ามเขียน business rule ชุดใหม่จากตารางนี้

### State และ responsive behavior

- action ที่ผู้ใช้ไม่มีสิทธิ์ให้ซ่อน; action ที่ยังทำไม่ได้เพราะข้อมูลไม่พร้อมให้ disabled พร้อมเหตุผล
- async action ล็อก action group ป้องกันกดซ้ำ และแจ้งผลผ่าน `Toast`
- ไม่มี auto-save; ทุกโหมดแก้ไขต้องมีปุ่มบันทึกและขั้นยืนยันตามกติกาของระบบ
- desktop ใช้ sticky right rail; หน้าจอแคบเปลี่ยนเป็น full-width card โดยไม่ render ปุ่มซ้ำ
- mobile touch target อย่างน้อย 40px และ primary action เต็มความกว้างเมื่อพื้นที่ไม่พอ
- ใช้ surface/token เดิม รองรับ light/dark และไม่ hard-code สี เงา radius หรือ breakpoint ใหม่

### การขยายไปทั้งระบบ

เฟสนี้สร้าง primitive ให้ reuse ได้ทั้งระบบ แต่ migration ในเฟสเดียวกันจำกัดที่ QT และ SO ก่อน
เมื่อผ่าน visual/behavior QA แล้วจึงทยอยใช้ `ContextualRightRail` กับหน้าเอกสารอื่น เช่น
ใบเสนอราคาผลิต และใช้แนวคิดเดียวกันกับ Deal/Project ผ่าน control card เฉพาะ domain
โดยไม่ยัด business logic ทุกโมดูลเข้า `DocumentControlCard`

## ของร่วมที่ควรยกเป็น component เดียว

| ของ | ตอนนี้อยู่ที่ | หมายเหตุ |
|---|---|---|
| `ContextualRightRail` | QT create มีแนวคิดนี้แล้ว · detail ยังไม่เป็นมาตรฐาน | เป็น layout primitive ที่ประกอบ summary/control/related cards |
| `DocumentControlCard` | ปุ่มกระจายอยู่ใน header/card/inline ทั้ง QT และ SO | เป็น renderer กลาง; business rule ยังอยู่ที่ feature |
| `DocumentSummaryCard` | QT create มี summary card · detail ใช้คนละรูปแบบ | รองรับยอดรวม/quick facts โดยไม่ผูกชนิดเอกสาร |
| `RelatedDocumentCard` | QT→SO และ SO→Filing อยู่คนละตำแหน่ง | แยก downstream process ออกจาก current-document workflow |
| `WorkflowRail` | SO เขียนเอง · QT ไม่มี | ทั้งสองใบมี flow 3 ขั้นเหมือนกันแล้ว |
| ตารางรายการ read-only | SO เขียนเอง · QT ใช้ `QuotationLineItems` (แก้ได้) | เพิ่ม prop โหมด |
| โมดัลยืนยัน + ช่องเหตุผล | QT `unaccept` ≈ SO `override`/`reject` | เขียนซ้ำเกือบบรรทัดต่อบรรทัด |
| alert error/success | SO module CSS · QT inline style | ควรเป็น utility |
| แผงสถานะการอนุมัติ | ทั้งคู่เขียน inline style เอง | QT มี 2 ขั้น (mig 0155) SO มี 3 สถานะ |

## ลำดับที่แนะนำ

1. ยก `ContextualRightRail` + `DocumentSummaryCard` + `DocumentControlCard` +
   `RelatedDocumentCard` + `WorkflowRail` + ตาราง read-only + โมดัลยืนยัน + alert utility ออกมาก่อน
   (ยังไม่แตะหน้า — commit นี้ทดสอบได้ด้วย unit test)
2. สร้าง pure adapter/action model ของ QT และ SO จาก predicate/permission เดิม
   โดยยังไม่ย้าย API หรือ business rule เข้า component กลาง
3. เปลี่ยน SO มาใช้ของกลางที่ยกออกมา (พฤติกรรมต้องไม่เปลี่ยน)
4. เปลี่ยน QT: ใช้ `SalesDetailOverview` + ของกลางชุดเดียวกัน แล้ว **ลบ CSS ที่ก๊อปมา
   ~250 บรรทัด**
5. เทียบสองหน้าเคียงกัน desktop + mobile และ light + dark → ปุ่มความหมายเดียวกันต้องอยู่
   ตำแหน่งเดียวกัน ชื่อเดียวกัน สไตล์เดียวกัน
6. ทดสอบทุก role/status รวม disabled reason, modal, dry-run, loading และ error/success feedback
7. ตรวจตาม Review checklist ท้าย `ux-ui-rulebook.md`

## ห้ามทำให้พังโดยไม่รู้ตัว

- **สถานะอนุมัติของ QT มี 4 ค่า** (`not_required` grandfather / `not_submitted` /
  `pending` / `approved`) — ปุ่มยื่นกับปุ่มอนุมัติต้องแยกกันตามนี้ (mig 0155)
- **`not_required` = "อนุมัติแล้ว" ไม่ใช่ "ยังไม่เข้ากระบวนการ"** (มติ 2026-07-26) —
  ใบ grandfather ส่งลูกค้า/Won ได้เลย (`documentWorkflow.js` + accept RPC ตั้งแต่ mig 0098)
  จึง **แก้ทับฉบับเดิมไม่ได้ ต้องออก Revision** ตามกติกา "หลังอนุมัติห้ามแก้ทับ" และ
  **ยื่นอนุมัติไม่ได้** (ไม่มีอะไรให้ยื่น). เกิดใหม่ไม่ได้แล้ว (default `not_submitted`
  ตั้งแต่ mig 0156) — เงื่อนไขเดียวคือ `isRevisableQuotationApprovalStatus` ใน
  `lib/sales/quotationWorkflow.js` ห้ามเขียน `=== 'approved'` ซ้ำที่อื่น

| สถานะอนุมัติ QT | แก้ทับ | ยื่นอนุมัติ | ถอนการยื่น | ออก Revision |
|---|---:|---:|---:|---:|
| `not_submitted` | ✅ ผู้มีสิทธิ์แก้ | ✅ | — | — |
| `pending` | ❌ | ❌ | ✅ ผู้ยื่น/ผู้อนุมัติ | ❌ |
| `approved` | ❌ | ❌ | ❌ | ✅ ผู้มีสิทธิ์แก้ |
| `not_required` (grandfather) | ❌ | ❌ | — | ✅ ผู้มีสิทธิ์แก้ |
- **ปุ่มออกเอกสารต้องเรียก `openQuotePrintWindowPreferIssued` /
  `openSalesOrderPrintWindowPreferIssued` เสมอ** — ใบที่อนุมัติแล้วต้องเล่นฉบับตรึง
  ไม่ใช่เรนเดอร์สด (ADR 0011)
- ปุ่มลบ/บังคับลบมี dry-run preview อยู่แล้ว — ห้ามลดเป็น confirm ธรรมดา
- `SignatureReadyNotice` ต้องยังเตือน**ทั้งผู้ยื่นและผู้อนุมัติ** (PR #706/#713)
- filled action ไม่เกิน 1 ปุ่มต่อบริบท (rulebook :9)

## งานที่จะมาแตะหน้า SO นี้ในอนาคต (เผื่อที่ไว้ตอน rewrite)

**Excise Filing v2** (`docs/excise-filing-plan.md`, PR #647) จะเพิ่ม **entity-action ใหม่บนหน้า SO
detail**: ปุ่ม **"สร้างการยื่นชำระ"** (โผล่เมื่อ SO `approved` + ยังไม่มีใบยื่น) + ตัวแสดง
**สถานะการยื่นภาษี** ของ SO นั้น (ลิงก์ไป `/tax/filings/[id]` เมื่อสร้างแล้ว)

- SO ↔ ระบบภาษี**แตะกันจุดเดียวคือการยื่นชำระ** — การขึ้นทะเบียนไม่เกี่ยว (อยู่ขั้นฐานข้อมูล
  สินค้า, [[excise-product-link]])
- ปุ่มนี้ต้องจัดเป็น **entity-action ตาม page-header standard** (ขวาบนนอกการ์ด) เหมือน action
  อื่นของ SO — rewrite ควรเผื่อช่องไว้ ไม่ต้อง implement (คนละ PR/คนละ worktree)
- ⚠️ ปุ่มนี้เป็นของ**โมดูลภาษี** (`sales:act`) ไม่ใช่ salesplan — ยิง endpoint ของภาษี ห้ามเขียน
  ตาราง orders ตรงจากหน้า SO (BOUNDARY_MAP: write ห้ามข้ามโมดูล)
- ยังไม่เริ่มโค้ด: ถ้า rewrite เสร็จก่อน filing v2 แค่เผื่อโครง; ถ้า filing v2 มาก่อน ให้ยึด
  design system กลางที่ rewrite วางไว้
