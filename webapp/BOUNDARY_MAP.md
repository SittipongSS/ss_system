# Boundary Map — Architecture Blueprint

เอกสาร **กฎกลางที่ codify แล้ว** ของ `ss_system` (คู่กับ roadmap [`BOUNDARY_MAP_PLAN.md`](BOUNDARY_MAP_PLAN.md)).
ต่างจาก plan ตรงที่ไฟล์นี้เป็น *contract ที่บังคับใช้จริงในโค้ด* — ใช้อ้างเวลารีวิว PR และตอนเพิ่มโมดูลใหม่.

หลักการกลาง (ล็อกแล้ว): **central database + independent business modules**
- `Database/Master` เป็นเจ้าของข้อมูลอ้างอิง — โมดูล Tax/PM เป็นเจ้าของ workflow ของตัวเอง
- โมดูลอ้างอิง master ด้วย id จริง (`customerId`, `productId`) + เก็บ **snapshot** เมื่อต้องการหลักฐาน
- **อ่านข้ามโมดูลได้ (JOIN/read) แต่ห้าม write ข้ามโมดูล** — action สำคัญทำที่หน้าเจ้าของงานเท่านั้น

---

## นิยามศัพท์ (พูดให้ตรงกัน)

| คำ | ความหมาย | ตัวอย่าง |
|---|---|---|
| **master data** | ข้อมูลอ้างอิงกลางที่หลายโมดูลใช้ร่วม | customers, products, product_types, holidays |
| **workflow data** | ข้อมูลที่เกิดจาก process ของโมดูลหนึ่งๆ | excise_registrations, orders, projects, project_tasks |
| **snapshot** | สำเนาค่าจาก master ณ เวลาที่ทำรายการ (กันประวัติเพี้ยนเมื่อ master เปลี่ยน) | `orders.customerName/customerTaxId`, `reg.productName` |
| **attachment** | ไฟล์แนบ polymorphic ผูกกับ entity ใดก็ได้ (ตาราง `attachments`) | ฉลากสินค้า, แผนที่บริษัท, ใบเสร็จ |
| **approval** | สถานะ pending → approved/rejected ที่ gate การมองเห็น downstream | customer/product approvalStatus |

---

## 5.1 Authorization Boundary

ตัวตนมาจาก **Supabase `app_metadata`** (`role` + `team` + `department`) — แก้ได้เฉพาะ service-role
(ไม่ใช่ `user_metadata` ที่ผู้ใช้แก้เองได้). บังคับใช้ **3 ชั้น**:
1. **proxy** (`proxy.js`) — gate ระดับ route/API (coarse: เข้าหน้า/ยิง API นี้ได้ไหม)
2. **API handler** — capability + **row-level scope** ที่ proxy มองไม่เห็น (`canEditRecord` ฯลฯ)
3. **UI** (`AppLayout` nav `can()`, ปุ่ม) — ซ่อนสิ่งที่ทำไม่ได้ (ชั้นความสะดวก ไม่ใช่ด่านจริง)

> ด่านจริงคือ **server (ชั้น 1+2)** เสมอ — UI เป็นแค่ชั้นรอง (ดู cost/margin redaction, tax gating).

### Capability × Role

ที่มา: [`src/lib/permissions.js`](src/lib/permissions.js) (`ROLE_CAPS`). ✓ = มี capability นั้น.

| capability | admin | ae_supervisor | senior_ae | ac | ae | legal | viewer | staff |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `customers:view`  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |   | ✓ |
| `customers:edit`  | ✓ | ✓ | ✓ | ✓ | ✓ |   |   |   |
| `customers:delete`| ✓ | ✓ |   |   |   |   |   |   |
| `products:view`   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |   | ✓ |
| `products:edit`   | ✓ | ✓ | ✓ | ✓ | ✓ |   |   |   |
| `products:delete` | ✓ | ✓ |   |   |   |   |   |   |
| `products:margin` | ✓ |   |   |   |   | ✓ |   |   |
| `sales:view`      | ✓ | ✓ | ✓ | ✓ | ✓ |   |   |   |
| `sales:act`       | ✓ | ✓ | ✓ | ✓ | ✓ |   |   |   |
| `sales:delete`    | ✓ | ✓ | ✓ |   |   |   |   |   |
| `legal:view`      | ✓ | ✓ |   |   |   | ✓ |   |   |
| `legal:approve`   | ✓ |   |   |   |   | ✓ |   |   |
| `history:view`    | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |   |   |
| `pm:view`         | ✓ | ✓ | ✓ | ✓ | ✓ |   | ✓ | ✓ |
| `pm:edit`         | ✓ | ✓ | ✓ | ✓ | ✓ |   |   |   |
| `master:manage`   | ✓ |   |   |   |   |   |   |   |
| `users:manage`    | ✓ |   |   |   |   |   |   |   |
| `audit:view`      | ✓ |   |   |   |   |   |   |   |

> role ที่ไม่รู้จัก → default = `customers:view` + `products:view` + `history:view` (read-only).
> **3 admin-system caps** (`master:manage` / `users:manage` / `audit:view`) คือสิ่งที่แยก `admin` ออกจาก `ae_supervisor`.

### Data scope (whose records)

`admin` + `ae_supervisor` = **superuser** (scope `all` ทุก resource). ที่เหลือ:

| role | view | edit | delete (orders/projects) | delete (registrations) |
|---|---|---|---|---|
| superuser (admin, ae_supervisor) | all | all | all | all |
| senior_ae | team | team | team | team |
| ac | team | team | — | — |
| ae | team | own | — | own (draft) |
| legal | all | — (acts via approval) | — | — |
| viewer / staff | all (read) | — | — | — |

- `customers` เป็น central registry → **ทุก signed-in user view ได้** (ไม่ผูก team) — ดู `canViewRecord`.
- `legal:approve` ให้ legal/admin **edit ฟิลด์ภาษีข้ามทีมได้** (ทุก resource ยกเว้น customers) — ผ่าน field-level gating (`allowedEditFields`): SA ถือฟิลด์การค้า, LG ถือฟิลด์อนุมัติ/ภาษี.
- ลบ `customers`/`products` = superuser เท่านั้น (org rule). ลบ registration ไม่ fallback `canEditRecord` (กัน legal/ac หลุดเข้า delete path) — authority อยู่ที่ `deleteScope` ที่เดียว.

### Module ↔ master (จุดที่ Gemini ถาม)

**ไม่มี "สิทธิ์โมดูล" แยกต่างหาก** — สิทธิ์เป็น *per-resource capability*. ผู้ใช้ที่ทำงาน Tax/PM
จะถือ `customers:view`/`products:view` มาในตัว (อยู่ใน `SALES_OPS`/legal/staff caps) จึง **read master
ได้อัตโนมัติ** โดยไม่ต้องมีสิทธิ์ master ชุดแยก. การ **write master** ต้องมี `*:edit` ของ resource นั้นตรงๆ
และทำที่หน้า Database เท่านั้น (โมดูล Tax/PM อ้าง master ด้วย id — ไม่แก้ master เอง).

---

## 5.2 Transaction Boundary

DB เดียว (Postgres) แต่ **ไม่มี cross-table transaction wrapper** ในชั้น API (PostgREST/service-role
ยิงทีละ statement). กฎ:

1. **cross-module write ต้องมีเจ้าภาพ transaction เดียว + rollback path ชัด.** ถ้า insert หลาย table
   แล้ว step หลังพลาด → ต้อง **ลบ/คืนค่า step ก่อนหน้าเอง** (manual rollback).
2. **action สำคัญทำที่โมดูลเจ้าของเท่านั้น** — ไม่ write ข้ามโมดูลจากหน้าอื่น (Database 360-view = read-only).

### Pattern อ้างอิง: manual rollback (orders)

[`api/orders/route.js`](src/app/api/orders/route.js) — สร้าง order = insert header แล้ว insert items;
ถ้า items พลาด **ลบ header ทิ้ง** กันเหลือ order ที่ไม่มีบรรทัด:

```js
const { error: orderErr } = await supabase.from('orders').insert(newOrder);
if (orderErr) return Response.json({ error: orderErr.message }, { status: 500 });

const { error: itemsErr } = await insertOrderItems(supabase, itemRows);
if (itemsErr) {
  await supabase.from('orders').delete().eq('id', orderId); // ← rollback header
  return Response.json({ error: itemsErr.message }, { status: 500 });
}
```

PATCH order (แก้ line items) ใช้แนวเดียวกัน: header update สำเร็จก่อน → ค่อย delete+insert items.

### Decision Checklist (เพิ่มข้อ Transaction)

ตอบก่อนเขียน handler ที่แตะ >1 table:
- [ ] action นี้ **update >1 table/โมดูล พร้อมกัน** ไหม? ถ้าใช่ →
- [ ] ลำดับ write ชัดไหม (อะไรก่อน-หลัง) + step ไหนคือ "จุดยืนยัน"
- [ ] ถ้า step หลังพลาด มี **rollback** คืน step ก่อนหน้าหรือยัง (ไม่ทิ้ง orphan/half-write)
- [ ] error ของทุก query เช็คแล้ว (query พลาด → 4xx/5xx ไม่ใช่ปล่อยผ่าน)
- [ ] ถ้าเป็น cross-module — มันควรเป็น write ที่นี่จริงไหม หรือควรเด้งไปหน้าเจ้าของงาน

---

## 5.3 Audit Log (foundation — Phase 5.3)

สมุดบันทึก "ใครทำอะไรเมื่อไหร่" กลาง — **แยกขาดจากข้อมูลจริง** (ลบ record จริงแล้ว log ยังอยู่).

- ตาราง `audit_logs` ([migration 0049](supabase/migrations/0049_audit_logs.sql)) — RLS เปิด ไม่มี policy,
  เขียนผ่าน service-role; actor* = snapshot ตัวตน; `before/after` = jsonb เต็ม record; ไม่มี FK ไป entity.
- helper เดียว [`src/lib/audit.js`](src/lib/audit.js) → `recordAudit({ user, action, entityType, entityId, before, after, summary, request })`.
  **ไม่ throw** — ถ้า insert พลาดจะ `log.error` แล้วผ่าน (audit ห้ามทำให้ action ผู้ใช้พัง).
- wired แล้ว (foundation): **customers / products / orders** ทั้ง create/update/delete (+ approval).
- **ยังไม่ทำ (เฟสถัดไป):** หน้า `/audit` (supervisor only, cap `audit:view`) + `/api/audit` อ่าน log,
  และ wire เพิ่มให้ registration/project/user-management. การกระทำ login/approve เป็น action แยกเพิ่มภายหลัง.

เพิ่ม audit ให้ route ใหม่: `import { recordAudit }` แล้วเรียก **หลัง write สำเร็จ** ด้วย `await`
(serverless — ต้อง await ให้ insert จบก่อน return).

---

## 5.4 Unique Customer = `taxId` + `branchCode`

- **DB:** unique index `(taxId, branchCode)` ([migration 0039](supabase/migrations/0039_customer_branch_shipping.sql),
  deploy บน prod แล้ว) — บริษัทเดียว (taxId เดียว) มีได้หลายสาขา; `taxId` NULL หลายแถวได้ (บุคคลธรรมดา/ต่างชาติ).
- **บังคับ "เฉพาะตอนยื่นทะเบียน"** ไม่ใช่ตอนสร้างลูกค้า — completeness gate ใน
  [`lib/tax/requirements.js`](src/lib/tax/requirements.js): ทะเบียนที่ลูกค้ายังไม่มี `taxId`/`branchCode`
  จะขึ้นใน `missing[]` → **submit ถูกบล็อก** (service เดียวกับ checklist ที่ผู้ใช้เห็น).

---

## New-Module Checklist (ทุกโมดูลใหม่ต้องตอบครบก่อนเริ่ม)

```
1. owner คือใคร
2. ใช้ master entity ไหน (อ้างด้วย id)
3. ต้องเก็บ snapshot อะไร (กันประวัติเพี้ยนเมื่อ master เปลี่ยน)
4. action สำคัญคืออะไร + ทำที่หน้าไหน (write ห้ามข้ามโมดูล)
5. required attachments มีอะไร (ใช้ requirement engine กลาง lib/tax/requirements.js เป็นแม่แบบ)
6. report มีอะไร + อยู่ใต้โมดูลตัวเอง (Database report = data-quality เท่านั้น)
7. permission ใช้ capability อะไร (ไม่สร้าง model ใหม่ — เพิ่ม cap ใน permissions.js)
8. แสดง relation ใน Database 360-view อย่างไร (read-only)
9. action นี้แตะ >1 table ไหม → Transaction Checklist (5.2)
10. action ไหนต้องบันทึก audit (recordAudit หลัง write สำเร็จ)
```
