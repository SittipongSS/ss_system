# Customer › Brand › Product — ลำดับชั้นเป็นกฎของระบบ

> สถานะ: **P0 เสร็จแล้ว (2026-07-09)** — P1 ขึ้นไปยังไม่ลงมือ
> Worktree: `db-customers-brands-products-2a91c5`

## เป้าหมาย (กฎที่ต้องการ)

ทำ **Customer › Brand › Product** ให้เป็นกฎเดียวทั้งระบบ:

1. **ลูกค้า** มีทีมดูแล และมีได้ **> 1 ทีม**
2. **ลูกค้า** มีได้ **หลายแบรนด์**
3. **สินค้า** ผูกกับ **แบรนด์** (ไม่ใช่แค่ผูกลูกค้า)
4. AE ทีมไหน → **default โชว์เฉพาะลูกค้าทีมนั้น** (ลดรายการ) + **toggle ดูทั้งหมด**
5. ดึงแบรนด์ → กรองจาก **ลูกค้า** ที่เลือก
6. ดึงสินค้า → กรองจาก **แบรนด์** ที่เลือก

## การตัดสินใจที่ล็อกแล้ว

- **Customer scope** = Default ทีม + toggle `?scope=all` (ปกป้อง flow ข้ามทีมของสรรพสามิต/PM); หน้า `/database/customers` ส่ง `?scope=all` ไว้ก่อน (พฤติกรรมเดิม) — ที่แคบลงคือ picker ในฟอร์ม
- **Brand model** = ยกเป็น **ตารางจริง** `brands` + `products.brandId` (FK จริง)
- **Free-text brand = ตัดออก** — เลือกจากลิสต์แบรนด์ของลูกค้าเท่านั้น + ปุ่ม "+" เพิ่มแบรนด์เข้าลูกค้าตรงฟอร์ม (แพตเทิร์นเดียวกับหน้า deals)
- **แบรนด์ไม่เข้า approval workflow** (เป็นแอตทริบิวต์ของลูกค้าที่อนุมัติแล้ว)
- **`brandId` nullable ถาวร** — สินค้าไร้แบรนด์/ไร้เจ้าของมีจริง; cascade ต้องมีตัวเลือก "ไม่ระบุแบรนด์" เสมอ (กันสินค้าหายจาก picker)
- **Rename แบรนด์** → sync snapshot ของ products ที่ยังไม่ approved; ที่ approved แล้วเข้า flow re-approval เดิม
- **ลำดับงาน = P0 quick-win ก่อน migration** (ดูเฟสด้านล่าง)

---

## สถานะปัจจุบัน (ground truth)

| หัวข้อ | ปัจจุบัน | ไฟล์ |
|---|---|---|
| ลูกค้า→ทีม (หลายทีม) | ✅ `customers.team` (หลัก) + `customers.teams[]` jsonb | mig `0037_customer_teams.sql` |
| ลูกค้า→แบรนด์ | ⚠️ `customers.brands[]` jsonb `{th,en}` (ไม่ใช่ตาราง) | `schema.sql:16`, mig `0059` |
| สินค้า→ลูกค้า | ✅ `products.customerId` FK | mig `0006_product_master.sql:10` |
| สินค้า→แบรนด์ | ❌ เก็บ **snapshot ข้อความ** `brandName`/`brandNameEn` เท่านั้น | `schema.sql:29`, mig `0059:14` |
| deal→แบรนด์ | ⚠️ เก็บใน `metadata.brand` (ไม่ใช่คอลัมน์) | `sales-planning/deals/page.js:264` |
| customer scope | ❌ โชว์ทุกคน (registry กลาง จงใจ) | `api/customers/route.js:9-15`, `permissions.js:382-384` |
| product scope | ✅ team-scoped + bypass ด้วย `?customerId=` | `api/products/route.js:29` |
| cascade แบรนด์←ลูกค้า | ✅ ทำแล้ว (PM + deals) | `ProjectFormModal.js:191-194`, `deals/page.js:597-601` |
| cascade สินค้า←แบรนด์ | ❌ กรองตามลูกค้าเท่านั้น | `ProjectFormModal.js:52-60` |

Scope helper กลางอยู่แล้วที่ `lib/permissions.js`:
`viewScope`/`viewScopeUser` (:299-312), `inScope` รองรับ `teams[]` แล้ว (:366-369), `canViewRecord` (:382-386, customers = true เสมอ)

---

## โมเดลข้อมูลใหม่

```
customers ──1:N──> brands ──1:N──> products
   (teams[])         (customerId)     (brandId + customerId)
```

### ตาราง `brands` (ใหม่ — mig 0085)
| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | text PK | `BRD-<uuid>` |
| `customerId` | text FK → customers.id | **บังคับ** — แบรนด์เป็นของลูกค้า 1 ราย |
| `nameTh` | text | ชื่อไทย (อาจว่างได้ ตามกฎ bilingual เดิม) |
| `nameEn` | text | ชื่ออังกฤษ (EN-only ได้) |
| `isActive` | bool default true | soft delete |
| `ownerId` | uuid | ผู้สร้าง |
| `createdAt`/`updatedAt` | timestamptz | |

- Index: `(customerId)`, unique `(customerId, lower(nameTh))` และ `(customerId, lower(nameEn))` กัน dup ในลูกค้าเดียว (ข้ามค่าว่าง)
- **ไม่มีคอลัมน์ team** — team อนุมานจาก customer เสมอ (single source)

### `products` เพิ่ม `brandId` (mig 0086)
- `brandId` text FK → brands.id, index
- คง `brandName`/`brandNameEn` เป็น **snapshot** สำหรับแสดงผล/ประวัติ (กัน rename ทำข้อมูลเก่าเพี้ยน)
- กฎ integrity: `brand.customerId === product.customerId` เสมอ

### `customers.brands[]` (jsonb เดิม)
- **คงไว้ระยะเปลี่ยนผ่าน + dual-write** จนกว่าทุกจุดอ่านจะย้ายไปตาราง แล้วค่อย drop ใน mig ถัดไป

---

## Migrations (รันมือบน Supabase prod ก่อน deploy)

| mig | ทำอะไร |
|---|---|
| **0085** | สร้างตาราง `brands` + index/unique |
| **0086** | เพิ่ม `products.brandId` + index |
| **0087 (backfill)** | (ก) explode `customers.brands[]` → rows ในตาราง `brands` (gen BRD id, map ตามชื่อ); (ข) เซ็ต `products.brandId` โดย match `(customerId, brandName/brandNameEn)`; รายงานสินค้าที่ match ไม่ได้ (brandName ไม่อยู่ใน list ลูกค้า) → `brandId` = null ไว้ตรวจมือ |
| _ภายหลัง_ | drop `customers.brands[]` เมื่อย้าย read ครบ (แยก PR) |

> อย่าลืม `NOTIFY pgrst, 'reload schema';` หลังเพิ่มคอลัมน์ (บทเรียน schema cache)

---

## Backend / API

### กฎกลาง (single source) — `lib/master/hierarchy.js` (ใหม่)
- `listBrands({ customerId, scope, user })` — canonical brand fetch
- `assertBrandUnderCustomer(brandId, customerId)` — ใช้ตอน validate write
- `assertProductUnderBrand(brandId, customerId)` — brand.customerId ต้อง = product.customerId
- ให้ทุก route เรียกจากที่นี่ ห้าม reimplement

### `/api/brands` (ใหม่)
- `GET ?customerId=` → รายชื่อแบรนด์ของลูกค้า (scope สืบทอดจากลูกค้า)
- `POST/PATCH` → ต้องมี `customerId`; validate ไม่ dup ในลูกค้า
- `DELETE`/deactivate → **guard**: ห้ามลบ/ปิด ถ้ามี products อ้าง `brandId` อยู่ (คืน 409 + จำนวนสินค้าที่ผูก) — ปิดช่องโหว่ตาม [[brand-customer-integrity-plan]]

### `/api/products`
- เพิ่มพารามิเตอร์ `?brandId=` (กรองสินค้าตามแบรนด์)
- POST/PATCH: บังคับ/validate `brandId` → ต้องอยู่ใต้ `customerId` เดียวกัน; snapshot `brandName`/`brandNameEn` จาก brand row
- คง `?customerId=` bypass เดิม (excise picker)

### `/api/customers` — default team scope + toggle
- GET: ถ้า `viewScopeUser(user)==='team'` และ **ไม่มี** `?scope=all` → กรองเฉพาะ `teams[]` มี `user.team` (fallback `team`)
- `?scope=all` → คืนทุกราย (สำหรับหน้า database / ค้นข้ามทีม)
- **canViewRecord (รายตัว) คงเปิดไว้** → flow สรรพสามิตที่ derive ลูกค้าจากสินค้าข้ามทีมยังทำงาน (list scope ≠ record lock)
- guard ลบลูกค้า: เช็ก products/brands ก่อนลบ (integrity)

---

## Frontend

### คอมโพเนนต์กลาง `CustomerBrandProductSelect` (ใหม่)
Cascade มาตรฐานเดียว: เลือกลูกค้า → โหลดแบรนด์ (`/api/brands?customerId=`) → เลือกแบรนด์ → โหลดสินค้า (`/api/products?brandId=`)
- เปลี่ยนลูกค้า → เคลียร์แบรนด์+สินค้า; เปลี่ยนแบรนด์ → เคลียร์สินค้า
- รองรับ prop `scope` (team/all) + ปุ่ม toggle "ดูทั้งหมด"
- No auto-save — ค่าที่เลือกยังอยู่ใน draft จนกดบันทึกในฟอร์มแม่ ([[no-autosave-explicit-save]])

### จุดที่ reuse
- `components/pm/ProjectFormModal.js` — เพิ่มขั้น brand→product (ตอนนี้ข้าม)
- `sales-planning/deals/page.js` — เพิ่ม brandId ลง metadata/คอลัมน์
- `components/excise/RegistrationFormModal.js`, `OrderFormModal.js` — cascade เดียวกัน
- หน้า `/database` — จัดการแบรนด์ต่อลูกค้า (CRUD) + customer list มี toggle team/all

---

## ลำดับงาน (เฟส — สลับ quick win ขึ้นก่อน migration)

1. **P0 — Quick win (ไม่มี migration)** ✅ เสร็จ 2026-07-09:
   - customers GET default team-scope (`teams[]`∋ทีมเรา, ไม่มีทีม=แถวกลางเห็นทุกคน) + `?scope=all`; `?manage=1` implies all → หน้า database เดิมไม่เปลี่ยน; รายตัว (GET /[id]) ยังเปิด
   - PATCH `{ addBrand }` เพิ่มแบรนด์เข้าลูกค้าโดย**ไม่** trigger re-approval (แก้ brands ผ่านฟอร์มเต็มยัง revert ตามเดิม)
   - `components/master/AddBrandButton.js` ปุ่ม "+" ใช้ร่วม 5 จุด: ProjectFormModal, EditProductModal, ฟอร์มเพิ่มสินค้า (database/products), ฟอร์มดีล (list+detail)
   - ตัด allowFreeText แบรนด์ทุกจุด; PM form: FG list กรองตามแบรนด์ (ไม่เลือก=ทุกแบรนด์), FG-first เติมแบรนด์อัตโนมัติ, เปลี่ยนลูกค้าล้างแบรนด์
   - picker inject ค่าปัจจุบันที่หลุด scope/ลิสต์ (ลูกค้าข้ามทีม, แบรนด์ free-text ยุคเก่า) กันค่าเดิมหาย
2. **P1 — Data layer**: mig 0085-0087 + backfill + รายงาน orphan brandName. (ไม่แตะ UI)
3. **P2 — API**: `/api/brands`, product `?brandId=` + validate, guards integrity.
4. **P3 — `lib/master/hierarchy.js`** single source + สลับ UI จาก brandName → brandId ใต้ฝากระโปรง.
5. **P4 — Cleanup**: rename-sync snapshot + dual-write → ตัด read จาก `customers.brands[]` → drop คอลัมน์ (PR แยก).

> จุดที่พบตอนวิเคราะห์: โค้ดแตะ brand 34 ไฟล์/149 จุด แต่ส่วนใหญ่อ่าน snapshot → งานจริงกระจุกที่จุดเขียน; allowFreeText แบรนด์มีที่ EditProductModal:233, ProjectFormModal:277, database/products/page.js:528

## จุดเสี่ยง / ต้องระวัง
- **Orphan brandName**: สินค้าที่ชื่อแบรนด์ไม่ตรง list ลูกค้า → backfill ไม่ได้ ต้องมีรายงาน + แก้มือก่อน enforce NOT NULL
- **FK ไม่สม่ำเสมอใน live DB** ([[no-real-fk-constraints]]) — verify FK brands/brandId ทำงานจริงหลังรัน mig
- **เคลียร์ demo data** ก่อน deploy ([[clear-demo-data-before-deploy]])
- deal ใช้ `metadata.brand` (string) — ต้อง map เป็น brandId ด้วยถ้าจะบังคับลำดับชั้นใน sales
