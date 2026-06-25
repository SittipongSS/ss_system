# Boundary Map — Implementation Plan

แผนนำ `MODULE_BOUNDARY_MAP.md` (สถาปัตยกรรมเป้าหมาย) มาลงระบบจริง `ss_system`
เอกสารนี้เป็น **roadmap ที่ผูกกับโค้ดจริง** ไม่ใช่ทฤษฎี — แต่ละงานอ้างไฟล์/ฟังก์ชันที่มีอยู่
และระบุว่าเป็นการ *extract / refactor* หรือ *เขียนใหม่*

## ⭐ ลำดับความสำคัญ (เริ่มอ่านที่นี่)

> **Critical path = Drive** (มี business driver: ลดพื้นที่ Supabase) แต่ก้าวแรกอยู่ฝั่งผู้ใช้
> (ตั้ง Google) → **เตะออกไปขนานทันที** แล้วใช้เวลารอเก็บงานโค้ดถูก-เร็ว-เสี่ยงต่ำให้หมด

| # | งาน | Effort | Risk |
|---|---|---|---|
| 0a | Drive Phase 0 — ตั้ง Google (ฝั่งผู้ใช้, long-lead, บล็อก Drive) | ผู้ใช้ | — |
| 0b | Lint/build hygiene (ต้องสะอาดก่อน refactor) | S | ต่ำ |
| 1 | เก็บ demo hard-delete hack + ล็อก deletion policy (data-safety prod) | S–M | ต่ำ |
| 2 | Drive Phase 1–2 (upload→Drive + proxy + สิทธิ์) | L | กลาง |
| 3 | Drive Phase 3 (ย้ายเก่า + ลบ Supabase original = ลดพื้นที่จริง) | M | กลาง |
| 4 | Phase 1 requirements service (extract) — แทรกได้ระหว่างรอ Drive | S–M | ต่ำ |
| 5 | Phase 3 relations + Phase 4 reports (ตามความต้องการ) | M / M–L | ต่ำ |
| 6 | Phase 5.4 unique customer + blueprint docs (opportunistic) | S–M | ต่ำ |

**สลับลำดับเมื่อ:** ถ้า Supabase ใกล้เต็ม → ดัน Drive (#2,#3) ขึ้นอันดับ 1 ทันที
รายละเอียด Drive: [`DRIVE_STORAGE_PLAN.md`](DRIVE_STORAGE_PLAN.md) · contract attachment: [`ATTACHMENT_REQUIREMENT_SPEC.md`](ATTACHMENT_REQUIREMENT_SPEC.md)

---

หลักการกลาง (ล็อกแล้ว): **central database + independent business modules**
- `Database/Master` เป็นเจ้าของข้อมูลอ้างอิง — โมดูล Tax/PM เป็นเจ้าของ workflow ของตัวเอง
- โมดูลอ้างอิง master ด้วย id จริง (`customerId`, `productId`) + เก็บ **snapshot** เมื่อต้องการหลักฐาน
- อ่านข้ามโมดูลได้ (JOIN/read) แต่ **ห้าม write ข้ามโมดูล** — action สำคัญทำที่หน้าเจ้าของงานเท่านั้น

---

## 0. สถานะปัจจุบัน (ground truth จากโค้ด)

| หัวข้อในแผน | สถานะ | หลักฐานในโค้ด |
|---|---|---|
| Pages `/database/*`, `/tax/*`, `/pm/*`, `/users` | ✅ Done | `src/app/database/`, `src/app/tax/`, `src/app/pm/` |
| `/api/master/*` namespace | ✅ Done | thin re-export alias ของ `/api/customers`, `/api/products` |
| `/api/tax/*` namespace | ✅ Done (รอบนี้) | alias `tax/registrations`, `tax/orders` → `excise-registrations`, `orders` |
| Snapshot pattern (ชื่อ/ราคา/ภาษี ณ เวลานั้น) | ✅ Done | reg เก็บ `productName/customerName/taxId` (`excise-registrations/route.js:70`); order เก็บ `customerName/customerTaxId/exciseRatePerUnit` (`orders/route.js:110`) |
| Requirement / completeness check | ✅ Done (Phase 1) | service กลาง `lib/tax/requirements.js` (`registrationRequirements` → `{ready,missing,warnings}`); submit-gate (PATCH) + `GET /api/(tax/)registrations/[id]/requirements` ใช้ตัวเดียวกัน; หน้า reg โชว์ checklist+warnings จาก endpoint |
| Deletion policy | ✅ Done (Phase 2) | กฎกลาง `lib/deletion.js` (`referencedBlock`/`registrationDeleteBlock`); customer/product บล็อกถ้าถูกอ้าง (+`isActive`); registration ลบได้เฉพาะ draft ที่ไม่มี order line — hack `"Removed status check for demo"` เก็บออกแล้ว |
| Audit log | 🟡 Partial | ออกแบบ `audit_logs` + หน้า `/audit` ไว้แล้ว (ยังไม่กระจายให้ทุกโมดูลบันทึก) |
| Re-approval on edit | ✅ Done | reg approved = locked + ขอแก้ไข (`excise-registrations/[id]/route.js:44-64`) |
| `/relations` endpoints (360 view) | ✅ Done (Phase 3) | `lib/master/relations.js` + `GET /api/(master/)customers/[id]/relations` ({products,registrations,orders,projects}) + `.../products/[id]/relations` ({registrations,orders,projects}); หน้า database detail เลิก fetch-all-regs → ใช้ endpoint scoped + เพิ่ม projects (+ orders ที่สินค้า) |
| `/database/reports`, `/pm/reports` | ❌ Planned | มีแค่ `/tax/reports` + `/api/tax/reports` |
| Authorization / Transaction boundary | ❌ Planned (เอกสาร) | กฎกระจายในโค้ด ยังไม่ได้ codify เป็น blueprint |
| Unique customer `taxId + branchCode` | ❌ Planned | ยังไม่มี unique constraint |

**สรุป:** โครงกระดูก (namespace, snapshot, approval) แข็งแล้ว งานที่เหลือคือ
(ก) ยก logic ที่ฝังใน handler ออกมาเป็น service ที่ reuse ได้ (requirements)
(ข) ทำกฎกลางให้สม่ำเสมอทั้งระบบ (deletion, transaction)
(ค) เติมหน้าที่ยังขาด (relations, reports)

> **กรอบความคิด (brownfield ไม่ใช่ greenfield):** ระบบนี้ ~70% เสร็จแล้ว — master core,
> tax flow, PM, approval, snapshot ทำงานจริงอยู่ แผนนี้จึงเป็น **"harden + fill gaps"**
> ไม่ใช่ "build layers จากศูนย์" อย่าเสียแรง re-build/re-spec ของที่ใช้ได้แล้ว
> ให้ล็อกเฉพาะ *Boundary / Contract / Requirement / Permission / Report / Attachment pattern*
> ส่วนรายละเอียด field ของแต่ละโมดูลค่อย iterate ตาม workflow จริง

---

## Phase 0 — ล็อกกติกาสถาปัตยกรรม (ทำก่อนเขียนเพิ่ม)

**เป้าหมาย:** ทุกคนเข้าใจตรงกันก่อนเพิ่มโค้ด — ป้องกัน drift ตั้งแต่ต้น

### งาน (ส่วนใหญ่เป็นเอกสาร ไม่ใช่โค้ด)
1. ใช้ `MODULE_BOUNDARY_MAP.md` เป็นเอกสารหลัก (เก็บเข้า repo — ดู Phase 6)
2. นิยามศัพท์ให้ชัดในที่เดียว: **master data** vs **workflow data** vs **snapshot** vs **attachment** vs **approval**
3. ล็อก namespace: `/database`, `/tax`, `/pm` (UI) + `/api/master`, `/api/tax`, `/api/pm` (API)
   - ✅ master + tax alias ทำแล้ว — เหลือทยอยให้ UI ใหม่ชี้ namespace ใหม่ + เลิกอ้าง legacy
4. ล็อกตาราง "action ไหนทำที่หน้าไหน" (ตาม map section 3) — เป็น reference เวลารีวิว PR

### Acceptance
- [ ] นิยามศัพท์ + ตาราง action-placement อยู่ใน repo อ้างได้
- [ ] ตกลงกฎ "read ข้ามโมดูลได้ / write ห้ามข้ามโมดูล" เป็นลายลักษณ์

**ขนาด:** S (เอกสารล้วน) — แต่ทำก่อนเสมอ

---

## Phase 1 — Requirement / Completeness Service (extract, ไม่ใช่เขียนใหม่)

**เป้าหมาย:** ยก logic ตรวจเอกสารก่อน submit ที่ฝังใน PATCH ออกมาเป็น service กลาง + เปิด GET endpoint
ให้ frontend ดึงมาโชว์เป็น checklist/progress ได้ และ server ใช้ตัวเดียวกัน validate (single source of truth)

ทำไมเริ่มที่ Tax: logic ชัดสุด มีของจริงอยู่แล้ว และ payoff สูงสุด (กันยื่นเอกสารไม่ครบ)

### งาน
1. สร้าง `src/lib/tax/requirements.js`
   - `export async function registrationRequirements(supabase, regId)` → `{ ready, missing[], warnings[] }`
   - ย้าย logic จาก `excise-registrations/[id]/route.js:118-131` มาที่นี่ (reg docs + customer `address_map`)
   - reuse `requiredDocKeys('registration')`, `attachmentTypeLabel`, `listAttachments` (มีอยู่แล้วใน `lib/master/`)
2. แก้ PATCH submit-gate ให้เรียก `registrationRequirements()` แทน inline (ลด duplication)
3. เพิ่ม `GET /api/tax/registrations/[id]/requirements/route.js` → คืน response ตามรูปแบบ section 6 ของ map
4. (ตามด้วย) `GET /api/master/customers/[id]/completeness` — warnings เชิงคุณภาพข้อมูล (ไม่มี email, ไม่มีที่อยู่ ฯลฯ)

### Response contract (ล็อกตาม map)
```json
{ "ready": false,
  "missing":  [{ "docType": "product_label", "label": "ฉลากสินค้า" }],
  "warnings": [{ "field": "customerEmail", "message": "ยังไม่มีอีเมลลูกค้า" }] }
```

### Acceptance
- [x] submit ที่เอกสารไม่ครบยังถูกบล็อกเหมือนเดิม (regression) แต่ตอนนี้ใช้ service เดียวกับ GET (PATCH เรียก `registrationRequirements`)
- [x] เรียก GET endpoint ได้ค่า `missing` ตรงกับที่ submit จะ reject (service เดียวกัน)
- [x] frontend หน้า `tax/registrations/[id]` โชว์ checklist จาก endpoint นี้ (refetch เมื่อแนบ/ลบเอกสาร — live)

**สถานะ:** ✅ Done. ไฟล์: `lib/tax/requirements.js`, `api/excise-registrations/[id]/requirements/route.js` (+ tax alias),
refactor PATCH submit-gate, หน้า `tax/registrations/[id]/page.js` (checklist+warnings จาก endpoint, ปุ่มยื่น gate ด้วย `ready`).
**Follow-up (ยังไม่ทำ):** `GET /api/master/customers/[id]/completeness` แยก (task 4) — ตอนนี้ warnings คุณภาพข้อมูลลูกค้า
fold อยู่ใน registration requirements แล้ว (email/เบอร์โทร); แยกเป็น endpoint ของ customer เมื่อทำ Phase 3 relations.

**ขนาด:** S–M (เป็น refactor + 1 endpoint บาง)

---

## Phase 2 — Deletion Policy (ทำกฎกลางให้สม่ำเสมอ)

**ปัญหา:** ลบ master data ที่ถูกใช้ใน workflow แล้วทำให้ order/registration อ้างถึงของที่หายไป
ตอนนี้ registration เป็น hard delete และมี hack `"Removed status check for demo"`

### งาน
1. **กฎกลาง:** entity ที่เคยถูกใช้ใน workflow → **soft delete / deactivate เท่านั้น** (ห้าม hard delete)
   - master: ใช้ `isActive` (customer มีแล้ว — ขยายให้ product/product_type ถ้ายังไม่มี)
   - workflow record (registration/order): ลบได้เฉพาะตอน `draft`/ยังไม่ผูกอะไร; ถ้าผูกแล้วให้ cancel/void
2. ลบ hack บรรทัด `excise-registrations/[id]/route.js:171` `"Removed status check for demo"` — คืน status guard จริง
   (ตรงกับเมโม *Clear Demo Data Before Deploy* — เป็น demo logic ที่ต้องเก็บกวาดก่อน deploy)
3. helper กลาง `lib/permissions.js` หรือ `lib/deletion.js`: `canHardDelete(entity, record)` คืน false ถ้ามี dependent
4. ตรวจ `DELETE` ทุก route ให้ผ่านกฎเดียวกัน (registration `:161`, order `:202`, customers, products)

### Acceptance
- [x] ลบ registration ที่ไม่ใช่ draft ถูกบล็อก (409 + ข้อความให้ "ขอแก้ไข" ก่อน) — `registrationDeleteBlock`
- [x] ลบ customer/product ที่มี order/registration → ถูกบล็อก (deactivate ผ่าน `isActive` แทน) — `referencedBlock`
- [x] ไม่มีคำว่า "demo" ใน guard ของ DELETE handler

**สถานะ:** ✅ Done — ไม่ต้อง migration เพิ่ม (customer/product มี `isActive` อยู่แล้ว; registration ใช้ status guard).
ครอบคลุม 4 route: registration (draft+order-line guard), customers/products (reference guard ผ่าน helper กลาง),
orders (มี tax-lock guard เดิม: committed → superuser break-glass — สอดคล้องกับตระกูลกฎเดียวกัน).

**Hardening (รอบทบทวน):**
- **สิทธิ์ลบ registration ย้ายเข้า `deleteScope` ทั้งหมด** = superuser(all)/senior_ae(team)/ae(own) —
  เลิก fallback `canEditRecord` ที่เผลอเปิดให้ `legal` (legal:approve bypass) และ `ac` ("no delete") ลบได้
  ตอนนี้ตรงกับ orders แล้ว (กฎสิทธิ์ลบอยู่ที่ `permissions.js` ที่เดียว)
- **Cascade attachments:** ลบ customer/product/registration → เก็บกวาด `attachments` (row + ไฟล์ storage/Drive)
  ผ่าน `purgeAttachments()` ใน `lib/master/attachments.js` (reuse `deleteAttachmentFile` ร่วมกับ `/api/attachments/[id]`)
  กันไฟล์/แถวกำพร้า — สำคัญกับ Drive track (พื้นที่)
- **Robustness:** count/reference query เช็ค error แล้วทุก route (query พลาด → 500 ไม่ใช่ปล่อยให้ลบหลุด)
- product_types ไม่มี DELETE route → ไม่ต้องทำ

**ขนาด:** M — แตะ 4 route + helper กลาง `lib/deletion.js` (ไม่ต้องมี migration)

---

## Phase 3 — Relation Endpoints (Database 360-degree view)

**เป้าหมาย:** ให้ Database detail page อ่านความสัมพันธ์ข้ามโมดูลแบบ **read-only summary** (อ่านได้, ห้ามแก้)

### งาน
1. `GET /api/master/customers/[id]/relations` → `{ products[], registrations[], orders[], projects[] }` (สรุป + ลิงก์ "เปิดใน Tax/PM")
2. `GET /api/master/products/[id]/relations` → `{ registrations[], orderItems[], projects[] }`
3. หน้า `database/customers/[id]`, `database/products/[id]` แสดงผล + ปุ่ม deep-link ไป module เจ้าของงาน
4. **ย้ำ guard:** หน้าเหล่านี้ห้ามมีปุ่ม approve tax / file / แก้ timeline (ตาม map section 4)

### Acceptance
- [x] customer detail โชว์ทุก relation ในที่เดียว อ่านอย่างเดียว (products/registrations/orders + **projects** ใหม่)
- [x] product detail โชว์ registrations + **orders** + **projects** (ใหม่) อ่านอย่างเดียว
- [x] ทุกปุ่ม action เด้งไปหน้าเจ้าของงาน (reg→/tax/registrations, order→/tax/filings, project→/pm/projects); ปุ่มเขียนในหน้า Database มีแค่ master-data ของตัวเอง (แก้/พัก/ลบ customer·product) ไม่มี tax/pm write

**สถานะ:** ✅ Done. ไฟล์: `lib/master/relations.js`, `api/(master/)customers/[id]/relations`, `api/(master/)products/[id]/relations`,
หน้า `database/customers/[id]`, `database/products/[id]`.
**Security:** ข้อมูลภาษี (registrations/orders) gate ด้วย `history:view` ที่ service (กัน staff/viewer ที่ viewScope='all' ดึงผ่าน API ตรง);
projects gate ด้วย `pm:view`; ที่เหลือ scope ด้วย `canViewRecord` เหมือน route อื่น.
**Note:** order_items→orders ใช้ embed (FK จริง); project_products→projects query 2 สเตป (FK ไม่แน่นอน).

**ขนาด:** M — เป็น read aggregation (ใช้ JOIN ได้เพราะ DB เดียว ตามที่ Gemini แนะนำ: read ข้ามได้, write ห้าม)

---

## Phase 4 — Report Boundary

**เป้าหมาย:** report เชิง workflow อยู่กับโมดูลเจ้าของ; Database report = คุณภาพข้อมูลกลาง

### งาน
1. `/database/reports` + `/api/master/reports` — data-quality: ลูกค้าข้อมูลไม่ครบ, สินค้ารออนุมัติ, เอกสาร master ขาด, usage summary
2. `/pm/reports` + `/api/pm/reports` — operational (งานค้าง/overdue/workload) + management (lead time/overdue rate/by team)
3. reuse pattern จาก `tax/reports` + `lib/tax/reports.js`, `lib/tax/exportExcel.js`, `lib/tax/reportPrint.js` ที่ทำไว้แล้ว
   - แยก export helper ให้ generic ถ้ายังผูกกับ tax (ทำเป็น `lib/reports/export.js`)

### Acceptance
- [ ] แต่ละ report อยู่ใต้โมดูลเจ้าของ + มี Excel/PDF export
- [ ] Database report ไม่มี workflow metric (เช่น "รอยื่นภาษี") — อันนั้นเป็นของ `/tax/reports`

**ขนาด:** M–L (สองชุดรายงาน + export)

---

## Phase 5 — กฎกลางที่ต้อง codify (เอกสาร + guard เล็กน้อย)

ประเด็นที่ Gemini ชี้และแผนเดิมเงียบ — ส่วนใหญ่เป็นการ *เขียนกฎให้ชัด* ไม่ใช่โค้ดเยอะ

### 5.1 Authorization Boundary
- ระบุชัด: สิทธิ์ module (เช่น tax) เห็น master read ได้อัตโนมัติไหม หรือต้องมีสิทธิ์ master ควบคู่
- ปัจจุบัน gating เป็น role-based ใน handler (`getCurrentUser` + `viewScope`/`canEditRecord` ใน `lib/permissions.js`) — เขียน matrix สิทธิ์ × โมดูลให้ครบ

### 5.2 Transaction Boundary (เพิ่มในDecision Checklist ข้อ 10)
- เพิ่มคำถาม: *"action นี้ต้อง update >1 โมดูลพร้อมกันไหม?"*
- ของจริงมี manual rollback แล้ว (`orders/route.js:144` — insert items fail → ลบ header) → ใช้เป็น pattern อ้างอิง
- กฎ: cross-module write ต้องมีเจ้าภาพ transaction เดียว + rollback path ชัด

### 5.3 Audit Log กลาง
- ต่อยอด `audit_logs`/`/audit` ที่ออกแบบไว้ → ให้ทุกโมดูลเขียน action ของตัวเองผ่าน helper เดียว (`lib/audit.js`)

### 5.4 Unique Customer = `taxId + branchCode` (map 11.5 + Gemini caveat)
- เพิ่ม `branchCode` + partial unique index `(taxId, branchCode)` — **บังคับเฉพาะตอน Tax Registration** ไม่ใช่ตอนสร้าง customer (เผื่อบุคคลธรรมดา/ต่างชาติที่ยังไม่มี taxId)
- migration ใหม่ (รันมือบน prod ตาม *Deploy Workflow*)

**ขนาด:** S (เอกสาร) + S–M (5.4 migration)

---

## Phase 6 — เก็บเอกสารเป็น Architecture Blueprint

1. ย้าย `MODULE_BOUNDARY_MAP.md` (ต้นฉบับ) + แผนนี้เข้า repo: `webapp/BOUNDARY_MAP.md` + `webapp/BOUNDARY_MAP_PLAN.md` (ไฟล์นี้) ตามคอนเวนชัน `*_PLAN.md` ที่มีอยู่ (`MASTER_DATA_PLAN.md`, `PM_PLAN.md`)
2. แยก `ATTACHMENT_REQUIREMENT_SPEC.md` — attachment/requirement เป็น cross-cutting + เป็นงาน net-new ที่สุด (คุ้มที่จะมี spec เดี่ยว ต่างจาก master core ที่แค่ document ของเดิม)
3. อัปเดต Decision Checklist (map ข้อ 10) ให้รวม Transaction + Authorization
4. ทุกฟีเจอร์ใหม่ต้องผ่าน checklist ก่อนลง schema/UI

### New-Module Checklist (ทุกโมดูลใหม่ต้องตอบครบก่อนเริ่ม)
```
1. owner คือใคร
2. ใช้ master entity ไหน (อ้างด้วย id)
3. ต้องเก็บ snapshot อะไร (กันประวัติเพี้ยนเมื่อ master เปลี่ยน)
4. action สำคัญคืออะไร + ทำที่หน้าไหน
5. required attachments มีอะไร (ใช้ requirement engine กลาง)
6. report มีอะไร + อยู่ใต้โมดูลตัวเอง
7. permission ใช้ capability อะไร (ไม่สร้าง model ใหม่)
8. แสดง relation ใน database 360-view อย่างไร
```

---

## ลำดับแนะนำ & dependency

```
Phase 0 (lock rules)    ── ทำก่อนเสมอ, เอกสารล้วน
Lint/build hygiene      ── เก็บก่อนงานใหญ่ (Codex แจ้ง lint fail — ดูด้านล่าง)
Phase 1 (requirements)  ── ทำได้ทันที, payoff สูง, low risk
Phase 2 (deletion)      ── ทำได้ทันที (รวมเก็บ demo hack), แตะหลาย route
Phase 5.4 (unique cust) ── migration เดี่ยว, ทำคู่กับ Phase 2 ได้
Phase 3 (relations)     ── หลัง 1 (ใช้ completeness/relation ร่วม pattern)
Phase 4 (reports)       ── หลัง 3 (relation query reuse ได้)
Phase 5.1–5.3 (เอกสาร)  ── ทำคู่ขนานได้ตลอด
Phase 6 (blueprint)     ── ปิดท้าย
```

### Storage backend track (ขนานได้ — [`DRIVE_STORAGE_PLAN.md`](DRIVE_STORAGE_PLAN.md))
- ย้ายไฟล์แนบ Supabase → Google Drive เพื่อลดพื้นที่ Supabase — แตะแค่ชั้น **storage** จึงเป็น track อิสระ
- coupling เดียวกับ roadmap = **Phase 2 (deletion)**: ทั้งคู่แตะ DELETE handler ของ attachments → ประสานกัน
- requirement engine (Phase 1) **ไม่กระทบ** เพราะอ่าน attachment *row* ไม่ใช่ bytes

### Lint / Build hygiene (เก็บก่อนงานใหญ่)
- Codex แจ้งว่า build ผ่านแต่ **lint ยัง fail** — ยังไม่ยืนยัน (รัน eslint ใน worktree ไม่ได้: ไม่มี `node_modules` + flat config `eslint.config.mjs` ต้องการ eslint ในเครื่อง)
- **TODO:** ในเครื่องที่ลง deps แล้ว รัน `npm run lint` → เก็บ error ให้หมดก่อนเริ่ม Phase 1
  เพราะ refactor ใหญ่บน codebase ที่ lint แดงอยู่จะแยกไม่ออกว่า error เก่าหรือใหม่

**ถ้าจะเริ่ม:** แนะนำ **Phase 1** ก่อน (extract requirements service) — เป็น refactor ความเสี่ยงต่ำ
ที่ทำให้ pattern ของทั้งระบบชัดขึ้น และ Phase 3/4 จะ reuse ได้ทันที

---

## หมายเหตุก่อน deploy (จากเมโมเดิม)
- เคลียร์ demo/mockup data + demo logic (เช่น hack บรรทัด 171) ก่อน commit/push ทุกครั้ง
- migration รันมือบน Supabase prod ก่อน deploy + `NOTIFY pgrst, 'reload schema'` กัน schema cache ค้าง
- ระวังเลข migration ชนตอน merge หลาย PR
