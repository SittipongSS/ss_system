# เฟสสุดท้าย: rewrite หน้าใบเสนอราคา + ใบสั่งขาย ให้เป็น design system เดียว

> สถานะ: **ยังไม่เริ่ม** — เอกสารส่งมอบงาน (สำรวจโค้ดจริงบน main แล้ว ณ 2026-07-26, commit `323dc470`)
> มติผู้ใช้ 2026-07-25: *"rewrite QT กับ SO ต้องไปควบคู่กัน เพราะเป็นส่วนที่เกี่ยวเนื่องกัน
> และมันควรเป็น design system เดียว"*

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

## ของร่วมที่ควรยกเป็น component เดียว

| ของ | ตอนนี้อยู่ที่ | หมายเหตุ |
|---|---|---|
| `WorkflowRail` | SO เขียนเอง · QT ไม่มี | ทั้งสองใบมี flow 3 ขั้นเหมือนกันแล้ว |
| ตารางรายการ read-only | SO เขียนเอง · QT ใช้ `QuotationLineItems` (แก้ได้) | เพิ่ม prop โหมด |
| โมดัลยืนยัน + ช่องเหตุผล | QT `unaccept` ≈ SO `override`/`reject` | เขียนซ้ำเกือบบรรทัดต่อบรรทัด |
| alert error/success | SO module CSS · QT inline style | ควรเป็น utility |
| แผงสถานะการอนุมัติ | ทั้งคู่เขียน inline style เอง | QT มี 2 ขั้น (mig 0155) SO มี 3 สถานะ |

## ลำดับที่แนะนำ

1. ยก `WorkflowRail` + ตาราง read-only + โมดัลยืนยัน + alert utility ออกมาก่อน
   (ยังไม่แตะหน้า — commit นี้ทดสอบได้ด้วย unit test)
2. เปลี่ยน SO มาใช้ของกลางที่ยกออกมา (พฤติกรรมต้องไม่เปลี่ยน)
3. เปลี่ยน QT: ใช้ `SalesDetailOverview` + ของกลางชุดเดียวกัน แล้ว **ลบ CSS ที่ก๊อปมา
   ~250 บรรทัด**
4. เทียบสองหน้าเคียงกัน desktop + mobile และ light + dark → ปุ่มความหมายเดียวกันต้องอยู่
   ตำแหน่งเดียวกัน ชื่อเดียวกัน สไตล์เดียวกัน
5. ตรวจตาม Review checklist ท้าย `ux-ui-rulebook.md`

## ห้ามทำให้พังโดยไม่รู้ตัว

- **สถานะอนุมัติของ QT มี 4 ค่า** (`not_required` grandfather / `not_submitted` /
  `pending` / `approved`) — ปุ่มยื่นกับปุ่มอนุมัติต้องแยกกันตามนี้ (mig 0155)
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
