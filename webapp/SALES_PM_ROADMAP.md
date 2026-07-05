# Sales ↔ PM Lifecycle — Boundary Map + Roadmap

เอกสารสถาปัตยกรรม + roadmap ของ **สายชีวิตงานขาย→ส่งมอบ** ที่ร้อยระบบ Sales Planning · PM ·
Sahamit · Tax เข้าด้วยกัน เข้าชุดกับ [`BOUNDARY_MAP.md`](BOUNDARY_MAP.md) (contract กลาง),
[`BOUNDARY_MAP_PLAN.md`](BOUNDARY_MAP_PLAN.md) (roadmap รวม), [`PM_PLAN.md`](PM_PLAN.md),
[`SAHAMIT_PLAN.md`](SAHAMIT_PLAN.md).

> ไฟล์นี้ = **การตัดสินใจสถาปัตยกรรม + ลำดับเฟส** ยังไม่ใช่ spec ราย-โมดูลลงลึก
> รายละเอียด migration/API/UI ของแต่ละเฟส จะเขียนเพิ่มใน `SALES_PLANNING_PLAN.md` (ใหม่)
> และต่อยอด [`PM_PLAN.md`](PM_PLAN.md) เมื่อเริ่มเฟสนั้นจริง

## 0. Current status / handoff (อัปเดต 2026-07-05)

**Merged แล้ว**
- PR #95 (`codex/sales-pm-roadmap`) merge เข้า `main` แล้ว: เพิ่ม roadmap + Phase 0 foundation
- Phase 0 เสร็จแล้วในโค้ด:
  - เพิ่ม capability `salesplan:view/edit/review/target`
  - เปิด `/sales-planning` ใน hub/sidebar/proxy
  - เพิ่มหน้า scaffold `/sales-planning`
  - เพิ่ม `product_price_history` migration **0062** พร้อม RLS
  - hook product create/update ให้ log price history ผ่าน API layer
- Supabase prod: ผู้ใช้แจ้งว่า run SQL `0062_product_price_history.sql` เรียบร้อยแล้ว

**กำลังรอ merge**
- PR #96 (`codex/factory-price-update-ui`): แยก flow “อัปเดตราคาโรงงาน” ออกจาก form แก้ไขสินค้าเดิม
  - การแก้ข้อมูลสินค้าปกติไม่ส่ง `costPrice` แล้ว
  - การเปลี่ยนราคาโรงงานต้องกด action แยก + tick ยืนยันก่อนบันทึก
  - PATCH เฉพาะ `{ costPrice }` เพื่อให้ `product_price_history` เป็นการเปลี่ยนราคาโดยตั้งใจ

**Next recommended session**
1. Merge PR #96 ถ้า review ผ่าน
2. Verify prod:
   - เปิด `/sales-planning`
   - เปิดสินค้า → แก้ไข → เห็นแผง “ราคาโรงงาน” แยกจากข้อมูลสินค้า
   - อัปเดตราคาโรงงาน 1 รายการ → `product_price_history` มี row ใหม่
3. เริ่ม Phase 1: สร้าง `SALES_PLANNING_PLAN.md` แบบละเอียด แล้วลง migration/API/UI สำหรับ `sales_targets` + `sales_deals` core

ground truth (ตรวจกับโค้ด 2026-07-05):
- migration สูงสุด = **0062** (`product_price_history`) → Phase 1 ใช้เลข **0063+** ตอน merge จริง (ระวังชนตอน merge — memory: deploy-workflow)
- `withUser` + response helper (`ok/fail/badRequest…`) มีจริงใน [`src/lib/http.js`](src/lib/http.js) และ PM ใช้ทุก route → ใช้ pattern เดิม
- **audit infra มีแล้ว**: `audit_logs` (0049) + `recordAudit()` ใน [`src/lib/audit.js`](src/lib/audit.js) → reuse ไม่สร้างใหม่
- `sales_deals`/`sales_targets` **ยังไม่มี** (Phase 1 greenfield)
- `project_products` เก็บ FG + `orderQty`/`productionQty` อยู่แล้ว → เป็นวัตถุดิบของใบเสนอราคา
- PM computed status ปัจจุบันอยู่ใน `src/lib/pm/status.js`; `commandCenter.js` ยังเป็น extraction prereq ตาม PM_COMMAND_CENTER แผน

---

## 1. การตัดสินใจหลัก (ล็อกแล้ว): โมเดล 2 ชั้น

ระบบมี **สองสันหลังคนละระดับ** ไม่ใช่คู่แข่งกัน — เชื่อมด้วยเส้นเดียว:

```
┌──────────────────────────────────────────────────────────┐
│  ชั้นพาณิชย์ (commercial)  =  Sales Planning               │
│  spine: sales_deals                                        │
│  • pipeline / stage / forecast / target / review           │
│  • ใบเสนอราคา (หลายใบ) → accept                            │
│  • win = confirmed + deposit paid                          │
└─────────────────────────┬────────────────────────────────┘
             projectId  ↕  metadata.salesDealId   (1:1)
┌─────────────────────────▼────────────────────────────────┐
│  ชั้น execution  =  Project Management (PM)                │
│  spine: projects                                           │
│  • timeline / tasks / revisions (คงเดิม)                   │
│  • shipment_prep → คลัง                                    │
│  • excise (+projectId) → tax                               │
│  • project เกิดก่อน win ได้ (proposed timeline)            │
└──────────────────────────────────────────────────────────┘
       ▲                                    ▲
   Customer master · Product master · product_price_history
```

**เหตุผลที่เลือกโมเดลนี้ (ไม่ใช่ "PM เป็นสันหลังเดียว")**
ดีลเกิด*ก่อน*โปรเจกต์ และดีลส่วนใหญ่*ไม่*กลายเป็นโปรเจกต์ (lead/qualify/รอตัดสินใจ) — ปัญหาเดิมของ
Google Sheet (ไม่มี owner / month ไม่ชัด) อยู่ช่วง **ก่อนเป็นโปรเจกต์** ทั้งหมด ถ้าบังคับให้ทุก lead
ต้องมี project จะได้ "ghost project" เต็มไปหมด หรือไม่ก็เสีย pipeline ช่วงต้น = กลับไปเป็นปัญหาเดิม

> วิสัยทัศน์ "PM เป็นศูนย์กลาง" ยังอยู่ครบ — แค่แบ่งเป็น **2 ศูนย์กลาง**: Sales = ศูนย์กลางก่อน win,
> PM = ศูนย์กลางหลัง win. ผู้ใช้เห็นรวมผ่านหน้า **Customer/Deal 360**

---

## 2. Boundary — ใครเป็นเจ้าของอะไร

ยึดกฎกลางจาก [`BOUNDARY_MAP.md`](BOUNDARY_MAP.md): **อ่านข้ามโมดูลได้ (JOIN/read) แต่ห้าม write ข้ามโมดูล**
— action สำคัญทำที่หน้าเจ้าของงานเท่านั้น.

| เรื่อง | เจ้าของ (write) | อ่านได้โดย | หมายเหตุ |
|---|---|---|---|
| ลูกค้า / สินค้า / ราคา | Master (Database) | ทุกโมดูล | snapshot เมื่อต้องการหลักฐาน |
| ราคา + ประวัติราคา | Master (`product_price_history`) | Sales (ใบเสนอราคา) | ใบเสนอราคา **แช่แข็ง** ราคา ไม่อ่านสด |
| opportunity / stage / forecast / target | **Sales Planning** | PM (แสดง), ผู้บริหาร | win อยู่ที่นี่เท่านั้น |
| ใบเสนอราคา (quotation) | **Sales Planning** (child ของ deal) | PM (แสดง) | seed line จาก `project_products` |
| timeline / tasks / revisions | **PM** | Sales (แสดงใน 360) | คงระบบเดิม |
| shipment_prep (เตรียมส่งคลัง) | **PM** | คลัง (พิมพ์) | trigger จาก task "เตรียมส่งของ" |
| ทะเบียนสรรพสามิต | **Tax** | PM/Sales (แสดง) | +`projectId`; ปุ่ม prefill จาก won project |
| PO / material / stock forecast | **Sahamit** (KA) | Sales (reverse calc) | PO → เด้งสร้าง RE-ORDER project |

**กฎ cross-module ที่ล็อก**
- Sales → PM: สร้าง/ผูก project ผ่าน action เดียว (`create-project`) เก็บ `projectId`↔`salesDealId`; ไม่ write ตาราง PM ตรง
- Sahamit → PM: PO สร้าง project ผ่าน action (มี dialog ยืนยัน) — idempotent ด้วย `sahamit_pos.projectId`
- PM → Tax: registration สร้างในโมดูล Tax; PM แค่ส่ง prefill (snapshot), ไม่ write `excise_registrations` ตรง

---

## 3. Entity map + linkage

```
sales_deals (SDL-…)  ── projectId ─────────► projects (PRJ-…)
  │  stage/win/forecast                         │  metadata.salesDealId (ย้อนกลับ)
  ├── sales_deal_activities                     ├── project_products (FG + qty)
  ├── sales_deal_forecasts (history)            ├── project_tasks (timeline)
  ├── sales_deal_stage_history                  ├── shipment_prep (+lines)   [ใหม่]
  ├── quotations (+lines)  [ใหม่]               └── excise_registrations.projectId [+field]
  │     seed จาก project_products
  └── warehouseNeedMonth / requiredConfirmMonth  ◄── Sahamit reverse calc

products ── product_price_history [ใหม่]   (ราคาแก้ได้ + log; ใบเสนอราคาอ้าง snapshot)
sahamit_pos.projectId [+field] ── เด้งสร้าง RE-ORDER project (won-deal stub นับยอด)
```

---

## 4. Decisions ที่ล็อกแล้ว (จากการถกกับผู้ใช้)

| # | เรื่อง | มติ |
|---|---|---|
| D1 | สันหลัง | โมเดล 2 ชั้น: deal=commercial, project=execution |
| D2 | ใบเสนอราคา/โครงการ | 1 โครงการ/ดีล มีใบเสนอราคาได้ **หลายใบ** |
| D3 | นิยาม win | **confirmed + deposit paid** (adopt จาก Codex — แม่นกว่า "quote accepted"); quote accepted = stage ก่อน win |
| D4 | ทางเข้า win | 3 ทาง บรรจบที่ `markWon()` กลาง: accept quotation / รับ PO (Sahamit) / gate manual |
| D5 | ราคาในใบเสนอราคา | โชว์ราคาขายอย่างเดียว (redact margin ด้วย `redactProductMargin` เดิม); `unitPrice` **แช่แข็ง** |
| D6 | ราคาสินค้า | แก้ได้ + เก็บ log ทุกครั้ง (`product_price_history`) |
| D7 | Sahamit PO | ได้ PO = Won → **เด้ง dialog ยืนยัน → สร้าง RE-ORDER project** (1 PO = 1 โครงการ, หลาย FG) |
| D8 | กันสร้างซ้ำ | `sahamit_pos.projectId` 1:1 |
| D9 | Timeline reorder | ใช้ anchor เดิม: `startDate`=วันได้ PO, `dueDate`=วันส่ง, เดินหน้า + ป้าย feasibility |
| D10 | Source of truth "พร้อมส่ง" | **PM timeline** เป็นตัวจริง; Sahamit `material_tracking` เป็นข้อมูลประกอบ |
| D11 | shipment_prep | ทุกทีม (KA ใช้ควบคู่ Sahamit); เฟสแรก = ออก+พิมพ์เอกสาร ยังไม่ track สถานะจริง |
| D12 | excise | คงทำในโมดูล Tax; เพิ่ม `projectId` + ปุ่ม "สร้างจากโครงการ won" (prefill snapshot) |
| D13 | อนุมัติใบเสนอราคา | อนุมัติ**เฉพาะเกินเงื่อนไข** (ใบปกติ AE ส่งเอง) |

**Decision ค้าง (ตอบเมื่อถึงเฟส 3):** กฎ "เกินเงื่อนไข" = margin-based (แม่น ต้อง redact ต้นทุน) หรือ discount-based (ง่าย)

---

## 5. ลำดับเฟส

หลักการเรียง: **value ออกก่อน + งาน greenfield (Sales) เสี่ยงต่ำนำหน้า + แตะระบบเดิม (PM/Sahamit/Tax) ทีหลัง**

### เฟส 0 · ฐานร่วม (เล็ก, ทำก่อน) — DONE (PR #95)
- [x] ล็อกโมเดล A (ไฟล์นี้) · เพิ่ม capability `salesplan:view/edit/review/target` ใน [`permissions.js`](src/lib/permissions.js)
- [x] **`product_price_history`** (migration 0062) — ราคาแก้ได้ + log ทุกครั้ง; hook ที่ API layer ของ products; RLS enabled
- [x] scaffold: hub card ([`home/page.js`](src/app/home/page.js)) + sidebar group ([`AppLayout.js`](src/components/AppLayout.js)) + [`src/proxy.js`](src/proxy.js) allowlist สำหรับ `/sales-planning`
- [x] UI hardening follow-up: PR #96 แยก “อัปเดตราคาโรงงาน” เป็น action เฉพาะ ไม่แก้ทับในช่อง form ปกติ (รอ merge)

### เฟส 1 · Sales Planning core  ★ value สูงสุด · greenfield · แทน Google Sheet
- migration: `sales_targets`, `sales_deals`, `sales_deal_activities`, `sales_deal_stage_history`, `sales_deal_forecasts`
- API: `deals` CRUD (scope/validate/audit ผ่าน `recordAudit`), `targets`, `activities`, `dashboard` (aggregate ใน API)
- หน้า: **pipeline · targets · dashboard**
- บังคับ **นิยาม Forecast 3 แบบ** (Sales FC / Project Timeline / Warehouse FC) + **win = confirm+deposit**
- ยังไม่มี PM link / ยังไม่มี quotation entity → `projectValue` กรอกมือไปก่อน
- ความเสี่ยง: ต่ำมาก (ไม่แตะระบบเดิม)

### เฟส 2 · เชื่อมสันหลัง PM ↔ Sales
- `sales_deals.projectId` + `projects.metadata.salesDealId` (1:1)
- action `POST /api/sales-planning/deals/[id]/create-project` — reuse logic สร้าง project เดิม, set stage `timeline_proposed`/`in_project`
- **`markWon(dealId, source)` กลางใน [`commandCenter.js`](src/lib/pm/commandCenter.js)**: win → activate project
  - prereq: ทำ `commandCenter.js` extraction (PM_COMMAND_CENTER แผน) ก่อน/พร้อมกัน — ห้ามนิยาม status ซ้ำ
- **Customer/Deal 360 (light)**: เห็น deal + project ของมันในที่เดียว

### เฟส 3 · ใบเสนอราคา (child ของ deal)
- migration: `quotations` + `quotation_lines`
- line **seed จาก `project_products` (FG+qty) + ราคา master → แช่แข็ง `unitPrice`**; โชว์ราคาขายเท่านั้น
- accept → เลื่อน stage (→ awaiting confirm); **เกินเงื่อนไข → ต้องอนุมัติ** (ตอบ decision ค้าง)
- `qtValue`/`projectValue` derive จากใบที่ accept (เลิกกรอกมือจากเฟส 1)

### เฟส 4 · ปลายน้ำจาก won project (ฝั่ง PM)
- **`shipment_prep` + lines** — ทุกทีม, trigger จาก task "เตรียมส่งของ" ใน timeline, ออก+พิมพ์เอกสาร (reuse pattern `ganttPrint`)
- `excise_registrations.projectId` (migration) + ปุ่ม **"สร้างจากโครงการ won"** ในโมดูล Tax (prefill snapshot customer+FG)
- **Sahamit PO → dialog ยืนยัน → สร้าง RE-ORDER project** (idempotent `sahamit_pos.projectId`) + won-deal stub นับยอด (ข้าม pipeline)
- ความเสี่ยง: สูงกว่า (แตะ PM/Sahamit/Tax เดิม) → ทำเมื่อสันหลังนิ่ง

### เฟส 5 · Sahamit ↔ Sales reverse calc + governance
- `warehouseNeedMonth − requiredLeadTimeDays = requiredConfirmMonth` + risk alert "FC ช้ากว่า required"
- `sales_forecast_reviews` (supervisor review/approve) · forecast accuracy · `sales_deal_documents` (checklist)
- audit: **reuse `recordAudit`/`audit_logs` ที่มีแล้ว** (0049) — เติม log ใน routes ใหม่; หน้า `/audit` มีอยู่แล้ว

### เฟส 6 · Future (วางไว้ ไม่บล็อก)
- orders เต็มรูป (quotation→order convert) · warehouse tracking จริง (สถานะส่ง/material generalize)
- notification/reminder · bulk actions · merge งาน PM responsive/productivity (ขนานได้ตลอด ไม่อยู่บน critical path)

---

## 6. เหตุผลของลำดับ (dependency)

| หลักการ | เหตุผล |
|---|---|
| Sales core (เฟส 1) มาก่อน | value สูงสุด (แก้ Sheet) + greenfield เสี่ยงต่ำ ได้ของใช้เร็ว |
| เชื่อมสันหลัง (เฟส 2) ก่อนใบเสนอราคา | quotation ต้องเกาะ deal+project ที่ผูกกันแล้ว |
| `commandCenter.js` = prereq เฟส 2 | single source ของ status/win — ห้ามนิยามซ้ำ |
| ปลายน้ำ (เฟส 4) หลัง core | แตะ PM/Sahamit/Tax เดิม เสี่ยงกว่า ทำเมื่อสันหลังนิ่ง |
| PM responsive/productivity | ขนานได้ทุกเมื่อ ไม่อยู่บน critical path (UX polish) |

---

## 7. Migration ที่จอง (จริงตอน merge)

| เฟส | migration (คร่าว, จองเลขจริงตอน merge) |
|---|---|
| 0 | DONE: `0062_product_price_history.sql` (`product_price_history`, RLS enabled) |
| 1 | NEXT: `0063+` สำหรับ `sales_targets`, `sales_deals`, `sales_deal_activities`, `sales_deal_stage_history`, `sales_deal_forecasts` |
| 2 | `sales_deals.projectId`, `projects.metadata` (มี jsonb แล้ว — อาจไม่ต้อง) |
| 3 | `quotations`, `quotation_lines` |
| 4 | `shipment_prep`(+lines), `excise_registrations.projectId`, `sahamit_pos.projectId` |
| 5 | `sales_forecast_reviews`, `sales_deal_documents` |

> DDL รันมือบน Supabase SQL Editor ก่อน deploy + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow schema cache)

---

## 8. ความเสี่ยง + การกัน

| ความเสี่ยง | การกัน |
|---|---|
| deal ลอย (ไม่มี project) / project ลอย (ไม่มี deal) | Customer/Deal 360 + audit; project จาก Sales/Sahamit ผูก id เสมอ |
| Sales FC ปนกับ Warehouse FC | ยึดนิยาม 3 แบบ; warehouse = deadline, sales = expected confirm/deposit |
| Sales FC ช้ากว่า warehouse need | reverse calc `requiredConfirmMonth` + เตือน (เฟส 5) |
| ghost project จาก lead | โมเดล A: lead อยู่บน deal ไม่สร้าง project จนจำเป็น |
| ราคาใบเสนอราคาเพี้ยนเมื่อ master เปลี่ยน | `unitPrice` แช่แข็งใน `quotation_lines` |
| KA reorder รก pipeline | PO → project ตรง + won-deal stub (ไม่ผ่าน pipeline) |
| เลข migration ชนตอน merge | จองเลขตอนใกล้ merge (0057+) |
