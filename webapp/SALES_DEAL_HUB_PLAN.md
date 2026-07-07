# Sales Deal Hub — ทำ "ดีล" เป็นศูนย์กลางโครงการ (ข้อ 5)

> แผนออกแบบหน้า `deals/[id]` ให้เป็น **ศูนย์บัญชาการของดีล**: ดูสถานะ → รู้ว่าขั้นต่อไปคืออะไร →
> ตัดสินใจไปต่อ/ไม่ไปต่อ (go/no-go) → ส่งต่อไปยังระบบที่ทำงานจริง (PM / สรรพสามิต / ส่งของ) จนจบ.
> เข้าชุดกับ [`SALES_PM_ROADMAP.md`](SALES_PM_ROADMAP.md) (โมเดล 2 ชั้น deal↔project) — เอกสารนี้ลงลึกเฉพาะ "หน้าดีล".
>
> สถานะ: **ร่างเพื่อรีวิว — ยังไม่ลงมือ**

---

## 0. บริบท / ของที่มีอยู่แล้ววันนี้

หน้า [`deals/[id]/page.js`](src/app/sales-planning/deals/[id]/page.js) ปัจจุบันชื่อ "ศูนย์รวมโครงการ" มีข้อมูลครบ
แต่ **เป็น read-only เกือบทั้งหมด** — ปุ่มที่มีคือ "เปิดโครงการ PM" กับ "รีเฟรช" เท่านั้น:

| ส่วน | มีแล้ว | ขาด |
|---|---|---|
| KPI (สถานะ/มูลค่า/ใบเสนอ/เอกสาร) | ✅ แสดงผล | ไม่มี action |
| แผง PM (โครงการ/FG/ส่งของ) | ✅ แสดง + ลิงก์เปิด | ไม่มีปุ่มสร้าง/ผูก |
| ใบเสนอราคา / เอกสาร | ✅ แสดง (flagปิด) | ไม่มี action |
| ปลายน้ำ (ทะเบียนภาษี/PO สหมิตร) | ✅ นับจำนวน | ไม่มีปุ่มส่งต่อ |
| ประวัติสถานะ + FC drift | ✅ | — |
| **ไปต่อ/ไม่ไปต่อ (go/no-go)** | ❌ | **ทั้งหมด** |
| **ขั้นต่อไปคืออะไร (next action)** | ❌ | **ทั้งหมด** |
| **ส่งต่อไประบบไหน (routing)** | ❌ | **ทั้งหมด** |

**endpoint action ที่มีอยู่แล้ว (reuse ได้ทันที):**
- `POST /api/sales-planning/deals/[id]/win` — ปิด Won (idempotent, ผ่าน `markWon()` กลาง) — [win/route.js](src/app/api/sales-planning/deals/[id]/win/route.js)
- `PATCH /api/sales-planning/deals/[id]` — เปลี่ยน stage / `lostReason` / ฟิลด์อื่น (มี stage_history อัตโนมัติ)
- `POST /api/sales-planning/deals/[id]/create-project` — สร้าง/ผูกโครงการ PM
- `GET .../overview` — รวมข้อมูลดีล+related ที่หน้านี้ใช้อยู่แล้ว

**สรุป: งานข้อ 5 = frontend + helper ตัดสินใจ เป็นหลัก — ไม่มี migration, endpoint action ~90% มีแล้ว.**

---

## 1. เป้าหมาย (ให้ตรงกับที่ผู้ใช้เลือก)

1. **สถานะ + ขั้นต่อไป** — เห็น lifecycle ของดีลชัด ๆ และ "ตอนนี้ต้องทำอะไรต่อ"
2. **go / no-go** — ปุ่มตัดสินใจ "ปิดได้ (Won)" หรือ "ไม่ไปต่อ (Lost + เหตุผล)" บนหน้าดีล
3. **ส่งต่อ (routing/handoff)** — จากดีลไปยังระบบที่ทำงานจริง: PM (โครงการ) → สรรพสามิต (ทะเบียน) → ส่งของ; เห็นว่าอันไหนทำแล้ว/ยัง
4. **จนจบ** — เห็นทั้งเส้นตั้งแต่ลีดจนปิดงาน ในหน้าเดียว

---

## 2. โมเดล lifecycle + "ขั้นต่อไป" (single source)

โมเดล stage มีอยู่แล้วใน [`salesPlanning.js`](src/lib/salesPlanning.js) (`DEAL_STAGES`, `STAGE_LABELS`,
`DEFAULT_PROBABILITY_BY_STAGE`). สิ่งที่ **ต้องเพิ่ม** = ฟังก์ชันเดียวที่บอกว่า "แต่ละสถานะ ขั้นต่อไปคืออะไร + ทำ action ไหนได้"
เพื่อไม่ให้ตรรกะกระจายอยู่ใน UI.

**ไฟล์ใหม่: `src/lib/salesPlanningLifecycle.js`** (pure, มี unit test)

```
dealLifecycle(deal, related) → {
  steps: [{ key, label, state: 'done'|'current'|'todo'|'skipped' }],  // สำหรับ stepper
  nextAction: { kind, label, hint } | null,   // การ์ด "ขั้นต่อไป"
  canGo: boolean,      // แสดงปุ่มปิด Won ได้ไหม
  canNoGo: boolean,    // แสดงปุ่ม Lost ได้ไหม
  routes: [{ kind, label, status: 'available'|'done'|'locked', href|action }],
}
```

**ตารางตัดสินใจ (ยึด D3: win = confirmed + deposit):**

| stage | ขั้นต่อไป (nextAction) | go/no-go | routing ที่ปลดล็อก |
|---|---|---|---|
| lead | คัดกรองลูกค้า/บันทึกกิจกรรม | no-go | — |
| qualified | ทำใบเสนอราคา¹ / เสนอไทม์ไลน์ | go, no-go | — |
| quotation | รอรับใบเสนอ → accept | go, no-go | — |
| timeline_proposed | รอลูกค้ายืนยัน | go, no-go | สร้างโครงการ PM (proposed)² |
| awaiting_confirm | รอมัดจำ | go, no-go | สร้างโครงการ PM |
| deposit_pending | **ปิด Won** (ปุ่มหลัก) | go, no-go | สร้างโครงการ PM |
| won | สร้าง/ผูกโครงการ PM | — | **PM, สรรพสามิต, ส่งของ** |
| in_project | ติดตามงานผลิต | — | เปิด PM, สรรพสามิต, ส่งของ, PO |
| lost | (จบ) | — | — |

¹ ถ้า `SALES_FEATURES.quotations=false` ให้ข้ามขั้นใบเสนอ → ชี้ "เสนอไทม์ไลน์/ปิด Won" แทน
² routing PM โผล่ได้ตั้งแต่ก่อน won ตามโมเดล (project เกิดก่อน win ได้ = proposed timeline)

> **go = ปุ่มลัดข้ามไป Won** (ผ่าน `POST /win`). ไม่บังคับให้ไล่ทีละ stage — ตรงกับพฤติกรรมจริงที่บางดีลรับ PO/มัดจำเลย.
> **no-go = Lost** ต้องกรอกเหตุผล (`lostReason`) เสมอ → PATCH `{ stage:'lost', lostReason }`.

---

## 3. Routing / handoff — ส่งต่อไป "ทำงานจริง"

ยึดกฎ boundary จาก roadmap: **write ที่หน้าเจ้าของงานเท่านั้น** — ดีลเป็นแค่ "จุดปล่อย" (deep-link/action) ไม่ write ตารางข้ามโมดูล.

| ปลายทาง | เงื่อนไขปลดล็อก | การทำงานจากหน้าดีล | เจ้าของจริง |
|---|---|---|---|
| **PM (โครงการ)** | won / deposit_pending+ | ยังไม่มี → ปุ่ม "สร้างโครงการ" (`create-project`); มีแล้ว → "เปิดโครงการ PM" | PM |
| **สรรพสามิต (ทะเบียน)** | ดีลมี FG **หมวด 01-002** + มี `projectId` แล้ว | ปุ่ม "สร้างทะเบียนสรรพสามิต" → deep-link ไปโมดูล Tax แบบ prefill จากโครงการ (D12) | Tax |
| **ส่งของ (shipment)** | มี `projectId` + flag `shipment` | โชว์สถานะ; ปุ่มไปหน้า shipment-prep ใน PM | PM |
| **PO สหมิตร** | ผูกแล้ว (KA) | แสดงเลข PO + ลิงก์เปิด (อ่านอย่างเดียว) | Sahamit |

**การ์ด "งานปลายน้ำ" เดิมยกระดับจาก read-only → มีปุ่ม action** ต่อรายการ พร้อมป้ายสถานะ ทำแล้ว/ยัง/ล็อก.

### กฎสรรพสามิต: เฉพาะ FG หมวด 01-002 (สำคัญ)
ภาษีสรรพสามิตคิดเฉพาะสินค้า **หมวด `01-002` (น้ำหอมฉีดผิวกาย)** เท่านั้น — reuse helper ที่มีอยู่
[`categoryOf(fgCode)`](src/lib/master/categoryOf.js) + `isExciseCategory(cat)` (`cat === '01-002'`).
หมวดแยกจากตัว fgCode ได้ตรง ๆ (`FG-AAA-BB-CCC-DDDD` → `BB-CCC`) — **ไม่ต้อง join คอลัมน์เพิ่ม**.

- **แหล่ง fgCode ของดีล**: `deal.metadata.fgCodes` (ดีลจาก forecast) และ/หรือ `project_products[].product.fgCode` (ถ้ามีโครงการ)
- `dealHasExciseFg(deal, projectProducts)` = มี fgCode ใด ๆ ที่ `isExciseCategory(categoryOf(fg))` → true
- **ถ้า false** (ดีลไม่มี FG 01-002): การ์ดสรรพสามิต **ไม่แสดง** (หรือแสดงจาง ๆ ว่า "ไม่เข้าข่ายสรรพสามิต") — ไม่ให้ปุ่มสร้างทะเบียน
- **ถ้า true แต่ยังไม่มี `projectId`**: การ์ดขึ้น **locked** + hint "สร้างโครงการ PM ก่อน"
- **ถ้า true + มี projectId**: ปลดล็อกปุ่ม "สร้างทะเบียนสรรพสามิต"

> สอดคล้องกับที่ระบบใช้อยู่แล้ว: การเพิ่ม FG 01-002 ในโครงการ PM จะ resync ขั้นตอนสรรพสามิตอัตโนมัติ
> ([pm/projects/[id]/route.js](src/app/api/pm/projects/[id]/route.js)) — หน้าดีลแค่เป็น "จุดปล่อย" ให้ตรงกฎเดียวกัน.

---

## 4. เลย์เอาต์หน้าใหม่ (Deal Command Center)

```
┌─ หัว: ชื่อดีล · ลูกค้า · [ปิดได้(Won)] [ไม่ไปต่อ(Lost)] [เปิด PM] [รีเฟรช] ─┐
├─ แถบ lifecycle stepper: ลีด─ผ่านคัด─เสนอราคา─…─Won─เข้าโครงการ ────────────┤
├─ การ์ด "ขั้นต่อไป": <nextAction.label> + hint + ปุ่มหลัก ───────────────────┤
├─ KPI เดิม (สถานะ/มูลค่า/ใบเสนอ/เอกสาร) ────────────────────────────────────┤
├─ แผง "ส่งต่อ (Routing)": PM · สรรพสามิต · ส่งของ · PO  (ปุ่ม+สถานะต่ออัน) ──┤
├─ แผง PM / ใบเสนอ / เอกสาร (เดิม) ─────────────────────────────────────────┤
└─ FC drift + ประวัติสถานะ (เดิม) ──────────────────────────────────────────┘
```

Component ใหม่ (เล็ก, อยู่ในหน้าเดียวหรือ `components/sales/`):
- `DealStepper` — แถบ stage ใช้ `steps` จาก helper
- `NextActionCard` — การ์ดขั้นต่อไป
- `GoNoGoButtons` — ปุ่ม Won / Lost (+ modal เหตุผล Lost) ใช้ `Modal` กลาง
- `RoutingPanel` — การ์ดส่งต่อ (reuse การ์ด "งานปลายน้ำ" เดิม)

ใช้คลาส UI กลางที่มีอยู่ (`glass-panel`, `ui-badge`, `btn`, `kpi-grid`) — ไม่เพิ่ม CSS ใหม่ถ้าเลี่ยงได้.

---

## 5. สิ่งที่ต้อง reuse vs สร้างใหม่

| งาน | ทำยังไง |
|---|---|
| ปิด Won | reuse `POST /win` |
| Lost + เหตุผล | reuse `PATCH` (`stage:'lost', lostReason`) + modal เหตุผล |
| สร้างโครงการ | reuse `POST /create-project` |
| ข้อมูลหน้า | reuse `GET /overview` (อาจเติม field เล็กน้อย) |
| ตรรกะขั้นต่อไป | **สร้างใหม่** `salesPlanningLifecycle.js` (+test) |
| กฎสรรพสามิต 01-002 | reuse `categoryOf` + `isExciseCategory` ([categoryOf.js](src/lib/master/categoryOf.js)) — ไม่เขียนกฎซ้ำ |
| UI stepper/next/routing/go-nogo | **สร้างใหม่** (4 component เล็ก) |
| สิทธิ์ | ปุ่ม action โชว์เฉพาะ `canEditSalesPlanning` + `inSalesEditScope` (มี helper แล้ว) |

**ไม่มี migration. ไม่มีตารางใหม่.**

---

## 6. เฟสการทำ (เสนอ)

**เฟส 1 — สถานะ + go/no-go** (value สูง, เสี่ยงต่ำ)
1. `salesPlanningLifecycle.js` + unit test
2. `DealStepper` + `NextActionCard`
3. `GoNoGoButtons` (Won ผ่าน /win, Lost ผ่าน PATCH + modal เหตุผล)
4. verify: ปิด Won ได้, Lost บันทึกเหตุผล, stepper อัปเดต

**เฟส 2 — Routing panel** (ส่งต่อ) — ✅ ทำแล้ว
5. `RoutingPanel` + `RouteCard`: ปุ่มสร้าง/เปิดโครงการ PM (reuse create-project)
6. ปุ่มสรรพสามิต: reuse `POST /api/excise-registrations/from-project {projectId}` (ตัวเดียวกับหน้า PM
   ที่เขียน projectId + metadata.salesDealId อยู่แล้ว) → แล้ว `router.push('/tax/registrations/<id>')`.
   **ตอบ open decision #2:** ไม่ทำ query-param prefill ใหม่ — ใช้ POST action เดิม เพราะครบและไม่แตะ Tax
7. ป้ายสถานะทำแล้ว/ยัง/ล็อก ต่อปลายทาง; done → ลิงก์ไปทะเบียนจริง
8. shipment → รอเปิด flag `shipment` (แสดง/ลิงก์ไป PM shipment-prep)

> เฟส 1 ใช้งานได้จบในตัว (ตัดสินใจ+ปิดดีล). เฟส 2 เพิ่มการส่งต่อ. รีวิว/ทดสอบทีละเฟส.

---

## 7. บั๊กที่ควรอุดพร้อมกัน (เจอตอนเช็คระบบ)

- **create-project ดันดีลถอยหลัง** (finding #7): `deposit_pending` → กลับเป็น `timeline_proposed`
  ตอนสร้างโครงการ. แก้ให้ stage เดินหน้าเท่านั้น (ไม่ถอย) — เกี่ยวตรงกับ routing เฟส 2.
- **accept quote ยอด null ทับ projectValue เป็น 0** (finding #8) — ถ้าเปิด flag ใบเสนอในอนาคต ควรกันไว้.

(สอง finding นี้เป็นของกลุ่ม "correctness ที่เหลือ" — ยกมาอุดตรงนี้เพราะแตะ flow เดียวกัน.)

---

## 8. Open decisions (ขอมติก่อน/ระหว่างลงมือ)

1. **go = ข้ามไป Won ได้ทุก stage เปิด ไหม** หรือจำกัดเฉพาะ `deposit_pending`? (เสนอ: อนุญาตทุก open stage — ตรงพฤติกรรมจริง, markWon กัน idempotent อยู่แล้ว)
2. **ปุ่มสรรพสามิต** ต้องมีหน้า Tax ที่รับ prefill param อยู่ก่อนไหม — ต้องเช็ก/ทำ deep-link ฝั่ง Tax (อาจเลื่อนเป็นเฟส 2.5 ถ้ายังไม่มี)
3. **Lost แล้วกู้คืนได้ไหม** (reopen) — เสนอ: เฟสนี้ Lost = จบ, reopen ไว้ทีหลัง

---

## 9. แผนทดสอบ (verify)

- lint + build + `node --test` (มี unit test ของ lifecycle)
- ไล่ดีลจริง: lead → go → won → create-project → in_project; ตรวจ stepper/next/routing เปลี่ยนถูก
- Lost: กรอกเหตุผล → stage=lost, `lostReason` บันทึก, stage_history มี row
- สิทธิ์: user นอก edit-scope ไม่เห็นปุ่ม action
