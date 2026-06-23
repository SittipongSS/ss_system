# Attachment & Requirement — Spec

Contract กลางของ **ไฟล์แนบ** และ **กฎความครบถ้วนของเอกสาร** ที่ทุกโมดูลใช้ร่วมกัน
เป็นส่วน *net-new / cross-cutting* ที่สุดในแผน Boundary Map จึงล็อกเป็น spec เดี่ยว
(ดู roadmap รวม: `BOUNDARY_MAP_PLAN.md`)

## หลักการแกน — แยก Storage ออกจาก Requirement

```
Storage   = shared infrastructure  → ที่เก็บไฟล์ + metadata, generic, ไม่รู้จัก workflow
Requirement = เป็นของแต่ละโมดูล     → "action นี้ต้องมีเอกสารอะไรครบ" Tax/PM ตัดสินเอง
```

โมดูลหลัก (Database) **ไม่ควร** เขียนโค้ดเช็คเงื่อนไขยิบย่อยของ Tax/PM —
แต่ละโมดูลประกาศ requirement ของตัวเอง แล้วเรียก storage layer กลางเก็บไฟล์

---

## 1. Storage Layer (shared — มีแล้ว)

ตาราง `attachments` แบบ polymorphic (migration 0028) — access ผ่าน `src/lib/master/attachments.js` เท่านั้น
(server-only, service-role; **ห้าม import ใน client**)

### Schema (ฟิลด์หลัก)
| ฟิลด์ | ความหมาย |
|---|---|
| `id` | PK |
| `entityType` | `customer` \| `product` \| `order` \| `registration` (polymorphic — ดู §2) |
| `entityId` | id ของ record เจ้าของไฟล์ |
| `docType` | คีย์ประเภทเอกสาร (จาก registry §2; ไม่รู้จัก → `other`) |
| `metadata` | jsonb — แท็คเพิ่มเติม (เช่น order: เลขใบเสร็จ/วันที่/ยอด) |
| `createdAt` | เรียงใหม่สุดก่อน |

### API
- `listAttachments(entityType, entityId)` → array (ใหม่สุดก่อน)
- `getAttachment(id)` → record \| null
- Upload: `POST /api/master/attachments` (+ `/api/upload` สำหรับ binary) — gating + ตรวจประเภท/ขนาดที่ server

### Upload constraints (ค่ากลางใน `attachmentTypes.js`)
- ขนาดสูงสุด `MAX_UPLOAD_MB = 10` (override ได้ด้วย env `SUPABASE_MAX_UPLOAD_MB`)
- ชนิดไฟล์: **PDF เท่านั้น** (`ACCEPTED_UPLOAD_MIME = ["application/pdf"]`)
- บังคับจริงที่ server ไม่พึ่ง UI

> **อนาคต ([`DRIVE_STORAGE_PLAN.md`](DRIVE_STORAGE_PLAN.md)):** ย้ายไป Google Drive เปลี่ยนเฉพาะ storage layer
> ส่วน registry + requirement engine คงเดิม (requirement engine อ่าน *row* ไม่ใช่ bytes) —
> นี่คือเหตุผลที่แยก storage ออกมา

---

## 2. Document-Type Registry (single source — มีแล้ว)

อยู่ที่ `src/lib/master/attachmentTypes.js` — ค่าคงที่ล้วน import ได้ทั้ง client (dropdown/badge) และ server (validate)

`ATTACHMENT_TYPES` ต่อ entity, แต่ละ docType มี `{ key, label, required? }`:

| entityType | docType (required) | docType (optional) | เจ้าของ requirement |
|---|---|---|---|
| `customer` | company_certificate, vat_pp20, director_id_card, address_map, design_contract *(นิติบุคคล)* / id_card, design_contract *(บุคคล)* | director_house_reg, power_of_attorney, name_change, other | Database (master) — แต่ Tax อาจใช้เป็น requirement |
| `product` | manufacturing_contract, artwork | other | Database (master) |
| `registration` | label_artwork | approval_letter, other | **Tax** |
| `order` | *(ไม่มี required ตายตัว)* | excise_proof, tax_receipt, tax_form, other | **Tax** (รายสเตปการชำระ) |

**กฎการขยาย:** เพิ่ม docType ที่ registry ที่เดียว — UI dropdown + validation อัปเดตตามอัตโนมัติ
- customer แยกตาม `customerType` ผ่าน `customerDocTypes(type)`; `ATTACHMENT_TYPES.customer` เป็น union ของทุกประเภท (derive อัตโนมัติ ไม่ sync มือ)
- คงคีย์เดิมเสมอ (เช่น `address_map`) เพื่อไม่ให้ไฟล์ที่แนบไว้แล้วหลุด
- `metadata` fields ต่อ entity ประกาศที่ `ATTACHMENT_META_FIELDS` (ตอนนี้มีเฉพาะ `order`)

### Helpers (ใช้ทั้ง UI + server)
- `requiredDocKeys(entityType, docTypes?)` → คีย์ที่ `required: true` (รับ override การ์ดได้ เช่น customer ตามประเภท)
- `attachmentTypeLabel(entityType, docType)` → ป้ายไทย (fallback: คืน key)
- `customerDocTypes(customerType)` → ชุดการ์ดของลูกค้าตามประเภท

---

## 3. Requirement Engine (งานที่ต้องทำ — Phase 1)

**สถานะ:** logic มีแล้วแต่ฝัง inline ที่ submit-gate (`api/excise-registrations/[id]/route.js:118-131`)
**เป้าหมาย:** ยกออกเป็น service กลาง + เปิด GET endpoint ให้ UI โชว์ checklist และ server ใช้ตัวเดียวกัน validate

### Contract — response shape (ล็อก)
```json
{
  "ready": false,
  "missing":  [{ "entityType": "registration", "docType": "label_artwork", "label": "ฉลาก / Artwork ที่ยื่น" }],
  "warnings": [{ "field": "customerEmail", "message": "ยังไม่มีอีเมลลูกค้า" }]
}
```
- `missing` = เอกสาร **required ที่ยังไม่มี** → บล็อก action (hard)
- `warnings` = คุณภาพข้อมูล/ไม่ครบแต่ไม่บล็อก (soft)
- `ready = missing.length === 0`

### กฎสำคัญ (invariants)
1. **Requirement เป็นของโมดูล** ไม่ใช่ของ storage — Tax ตัดสินเอกสาร registration/order; PM ตัดสินเอกสาร project
2. **Server validate ทุกครั้งก่อน action** — ห้ามพึ่ง UI อย่างเดียว (GET /requirements เป็นแค่ตัวช่วยโชว์)
3. requirement อาจกินเอกสารข้าม entity ได้ — เช่น submit registration ต้องมี `label_artwork` (ที่ registration) **และ** `address_map` (ที่ customer เจ้าของ) ดู `route.js:124-125`
4. requirement ผูกกับ **action** ไม่ใช่ผูกกับ entity ลอย ๆ (ดูตาราง §4)

### โครงที่จะสร้าง
```
src/lib/tax/requirements.js
  registrationRequirements(supabase, regId) → { ready, missing[], warnings[] }
  orderFilingRequirements(supabase, orderId) → { ... }   // ก่อน file/ยืนยันชำระ

src/lib/master/completeness.js
  customerCompleteness(supabase, customerId) → { ready, missing[], warnings[] }
  productCompleteness(supabase, productId)   → { ... }

Endpoints:
  GET /api/tax/registrations/[id]/requirements
  GET /api/master/customers/[id]/completeness
```
แล้วแก้ submit-gate ให้เรียก `registrationRequirements()` แทน inline (ลด duplication)

---

## 4. Requirement Ownership — action × เอกสารที่บังคับ

| Action | โมดูล | เอกสารบังคับก่อนทำ | เช็คที่ |
|---|---|---|---|
| submit registration (draft → pending_legal) | Tax | `label_artwork` (registration) + `address_map` (customer) | `excise-registrations/[id]` PATCH |
| approve registration | Tax | (ครบจาก submit แล้ว) — LG แนบ `approval_letter` หลังอนุมัติ | Tax |
| สร้าง order | Tax | registration ต้อง `approved` (ไม่ใช่เอกสาร แต่เป็น state) | `orders` POST |
| ยืนยันชำระ / file tax | Tax | `excise_proof` / `tax_receipt` / `tax_form` (order) | Tax filing |
| approve customer (master) | Database | completeness ผ่าน (เอกสาร required ของ customerType) | master |
| approve product (master) | Database | `manufacturing_contract`, `artwork` | master |
| close/issue project (PM) | PM | เอกสาร ISO/project (เมื่อทำ PM requirement) | PM |

---

## 5. Decision rules เวลาเพิ่มเอกสาร/requirement ใหม่

1. ไฟล์นี้ผูกกับ entity ไหน → ใช้ `entityType` ที่มี (ห้ามสร้างตารางไฟล์ใหม่)
2. เป็นเอกสาร master (อยู่กับ customer/product ถาวร) หรือ workflow (อยู่กับ registration/order)?
3. required หรือไม่ → ตั้ง flag ใน registry; ถ้า required ต้องมี action ที่บังคับมัน
4. requirement เป็นของโมดูลไหน → ใส่ใน requirement service ของโมดูลนั้น ไม่ใช่ storage
5. ต้องการ metadata เพิ่ม (เลข/วันที่/ยอด) → เพิ่มใน `ATTACHMENT_META_FIELDS[entity]`
6. มี action ใดต้องบล็อกถ้าไฟล์ไม่ครบ → validate ที่ server endpoint นั้นเสมอ

> ถ้าตอบข้อ 2 หรือ 4 ไม่ชัด = ยังไม่ควรลง schema — ล็อก boundary ก่อน
