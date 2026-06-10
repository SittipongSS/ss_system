# แพลน: Master Data / Shared Core สำหรับ ss-team

> เอกสารนี้คือแพลนการยกระดับ `customers` + `products` ให้เป็น **master data กลาง**
> ที่ทุกระบบใน ss-team (สรรพสามิต, PM, และระบบอนาคต) ดึงไปใช้ร่วมกัน
> ทุกขั้นตอนเป็น **additive ปลอดภัย** ไม่ทำลายข้อมูล/พฤติกรรมเดิม
>
> สถานะ: รอเริ่มลงมือ (ดีไซน์ล็อกแล้ว — ดูหัวข้อ "จุดตัดสินใจที่ล็อกแล้ว")

---

## 1. บริบท & เป้าหมาย

ss-team เป็น Next.js app เดียวที่ "อยู่อาศัย" หลายระบบ:

- **ระบบสรรพสามิต (ภาษี)** — orders / order_items / legal-tax workflow (มีอยู่แล้ว)
- **ระบบ PM (จัดการโครงการ)** — projects / project_tasks / timeline / ISO (กำลังจะพอร์ตจาก ss-cj)
- **ระบบอนาคต** — ยังไม่ระบุ

ทุกระบบต้องดึง "ลูกค้า" และ "สินค้า" จากแหล่งเดียวกัน เป้าหมายคือทำ **Shared Core** ที่:

1. มี master data ชุดเดียว แก้ที่เดียว (single source of truth)
2. ระบบอื่นอ้างอิงด้วย **FK จริง** ไม่ copy เป็น text กระจาย
3. เข้าถึงผ่านชั้น service กลาง (`src/lib/master/`) ไม่ query ตรงกระจายทุก route

> ⚠️ ไม่ทำเป็น service/แอปแยกตัวที่สาม — ทำเป็น **modular monolith + shared core** ภายใน ss-team

---

## 2. จุดตัดสินใจที่ล็อกแล้ว

| # | จุด | ข้อสรุป |
|---|---|---|
| 1 | **"คน" (people)** | ไม่ทำตาราง `people` แยก — ใช้ Supabase auth users (SA) ที่มีอยู่. `role` บน task = ป้ายแผนกเฉยๆ. step ของแผนกอื่น (RD/PD/QC/WH/LG) ไม่ระบุชื่อคน |
| 2 | **entity ที่เป็น master** | `customers`, `products`, `product_types`. **brands** คงเป็น jsonb/text ไว้ก่อน |
| 3 | **namespace** | สร้างชั้น `src/lib/master/` ตอนนี้, **คง URL เดิม** (`/api/customers` ฯลฯ), ค่อยจัด URL ใหม่ทีหลังถ้าจำเป็น |
| 4 | **สโคปเฟสนี้** | เฉพาะ master data ที่ PM ต้องใช้ — ยังไม่ดูด audit/permission/storage เข้า core |
| 5 | **PM data scope** | Team-scoped (ODM/KA/SV), supervisor เห็นหมด — ใช้ `viewScope`/`editScope` เดิมจาก `lib/permissions.js` |
| 6 | **สิทธิ์เข้าถึง PM** | เฉพาะฝ่าย SALES (`ae_supervisor`/`senior_ae`/`ac`/`ae`) ไม่รวม `legal` |

> หมายเหตุ: ข้อ 5–6 เป็นเรื่องของ "ระบบ PM" ไม่ใช่ master data โดยตรง แต่บันทึกไว้เพราะ
> ตัดสินใจร่วมกันแล้ว และกระทบ schema PM ในเฟสถัดไป

---

## 3. สถาปัตยกรรมเป้าหมาย

```
                    ss-team (Next.js app เดียว)
┌─────────────────────────────────────────────────────────────┐
│   ┌─────────── SHARED CORE ───────────┐                       │
│   │  Master:  customers · products ·   │                       │
│   │           product_types            │                       │
│   │  เข้าถึงผ่าน:  src/lib/master/       │                       │
│   └────────────────────────────────────┘                      │
│            ▲              ▲               ▲                    │
│            │ import/read  │               │                    │
│   ┌────────┴───┐  ┌───────┴────┐  ┌───────┴───────┐           │
│   │ สรรพสามิต   │  │   PM       │  │ อนาคต...       │          │
│   │ (orders)    │  │(projects)  │  │               │          │
│   └─────────────┘  └────────────┘  └───────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**กฎทอง 3 ข้อ:**
1. master แก้ได้ที่ core เท่านั้น — subsystem อ่านอย่างเดียว + เก็บ snapshot เท่าที่ต้อง
2. ทุก route เรียก master ผ่าน `lib/master/` ตัวเดียว
3. ทุก entity master มี `metadata jsonb` ไว้รองรับฟิลด์อนาคตโดยไม่ต้อง migrate

---

## 4. การเปลี่ยนแปลงฐานข้อมูล (Migrations)

ต่อจาก migration ล่าสุด `0004_order_customer.sql` → เริ่มที่ `0005`
ทุกไฟล์เป็น idempotent (`add column if not exists` / `create table if not exists`)
และคงคอนเวนชัน **camelCase ในเครื่องหมายคำพูด** ให้ตรงกับ schema เดิม

### 4.1 `migrations/0005_customer_master.sql` — ขยาย customers

```sql
-- ============================================================
--  Migration 0005: ยกระดับ customers เป็น master data
--  เพิ่มฟิลด์ติดต่อ/เครดิต + metadata (ขยายอนาคตไม่ต้อง migrate)
--  Safe & idempotent. ไม่กระทบข้อมูลเดิม.
-- ============================================================

alter table public.customers add column if not exists "contactPerson" text;
alter table public.customers add column if not exists "email"         text;
alter table public.customers add column if not exists "creditTerms"   text;
alter table public.customers add column if not exists "jubiliId"      text;     -- อ้างอิงแนวคิดจาก ss-cj
alter table public.customers add column if not exists "metadata"      jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists "updatedAt"     timestamptz not null default now();
```

### 4.2 `migrations/0006_product_master.sql` — products + FK ลูกค้า (หัวใจ)

```sql
-- ============================================================
--  Migration 0006: ผูก products → customers ด้วย FK จริง
--  เดิม products เชื่อมลูกค้าด้วยการ match customerName/taxId (เปราะ)
--  ตอนนี้เพิ่ม "customerId" FK + categoryCode (อ้าง product_types)
--  คง customerName/taxId เป็น snapshot ต่อ (backward compatible)
--  ไม่ backfill ในไฟล์นี้ (ดูสคริปต์แยก ส่วน 8)
-- ============================================================

alter table public.products add column if not exists "customerId"   text references public.customers("id") on delete set null;
alter table public.products add column if not exists "categoryCode" text;     -- เช่น '01-002' (mainCategoryCode-typeCode)
alter table public.products add column if not exists "metadata"     jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists "updatedAt"     timestamptz not null default now();

create index if not exists products_customerid_idx   on public.products ("customerId");
create index if not exists products_categorycode_idx on public.products ("categoryCode");
```

### 4.3 `migrations/0007_product_types.sql` — taxonomy หมวดสินค้า

ยกตาราง + seed จาก [ss-cj `seed-product-types.sql`](../../SS-CJ-ANG/seed-product-types.sql)
(แปลงชื่อคอลัมน์เป็น camelCase ให้ตรงคอนเวนชัน ss-team)

```sql
-- ============================================================
--  Migration 0007: ตาราง master หมวดสินค้า (product_types)
--  ใช้ร่วม: ฟอร์มสินค้า (dropdown หมวด) + PM template (categoryOnly/Exclude)
--  RLS เปิด ไม่มี policy (เข้าผ่าน API service_role เหมือนตารางอื่น)
-- ============================================================

create table if not exists public.product_types (
  "id"               serial primary key,
  "mainCategoryCode" varchar(2)   not null,   -- เช่น '01' (ODM), '02' (ธุรกิจบริการ)
  "mainCategoryName" varchar(50)  not null,
  "typeCode"         varchar(3)   not null,   -- เช่น '002'
  "nameEn"           varchar(100),
  "nameTh"           varchar(100),
  "note"             varchar(200),
  unique("mainCategoryCode", "typeCode")
);

alter table public.product_types enable row level security;

-- seed: port ทั้งหมดจาก ss-cj seed-product-types.sql เช่น
insert into public.product_types ("mainCategoryCode","mainCategoryName","typeCode","nameEn","nameTh","note") values
  ('01','ODM','002','BODY PERFUME','น้ำหอมสำหรับผิวกาย',''),
  ('01','ODM','003','SCENT CANDLE','เทียนหอม',''),
  -- ... (ยกรายการที่เหลือทั้งหมดจาก ss-cj) ...
  ('02','ธุรกิจบริการ','001','ระบบกระจายกลิ่น SDS','ระบบกระจายกลิ่น','')
on conflict ("mainCategoryCode","typeCode") do nothing;
```

> **หมายเหตุการรัน:** รันทีละไฟล์ใน Supabase Dashboard → SQL Editor (0005 → 0006 → 0007)

---

## 5. ชั้น Service กลาง — `src/lib/master/`

หัวใจของ "ระบบกลางที่คนอื่นมาเรียก" — รวม logic การเข้าถึง master ไว้ที่เดียว
แทนที่แต่ละ route จะเขียน `supabase.from('customers')...` กระจายเอง

### 5.1 `src/lib/master/customers.js`
```
listCustomers()                  → คืนลูกค้าทั้งหมด (registry กลาง)
getCustomer(id)                  → ลูกค้ารายเดียว
resolveCustomer({ id|taxId|name }) → หา customer record จาก id หรือ snapshot
```

### 5.2 `src/lib/master/products.js`
```
listProducts()
getProduct(id)
listProductsForCustomer(customerId)  → ใช้ FK ก่อน, fallback name/taxId (ช่วงเปลี่ยนผ่าน)
```

### 5.3 `src/lib/master/productTypes.js`
```
listProductTypes()
categoryOf(fgCode)   → แยก 'XX-YYY' ออกจาก fgCode (เช่น FG-123-01-002-5555 → '01-002')
```

> route ทั้งหมด (ภาษี + PM) เรียกผ่านไฟล์เหล่านี้ — ฝั่ง server import ตรง (ไม่มี HTTP hop)

---

## 6. การแก้ API Routes

### 6.1 customers
- [`src/app/api/customers/route.js`](src/app/api/customers/route.js) — POST: เพิ่ม `contactPerson`, `email`, `creditTerms`, `jubiliId`, `metadata` ใน object `newCustomer`
- [`src/app/api/customers/[id]/route.js`](src/app/api/customers/%5Bid%5D/route.js):
  - PATCH: เพิ่มฟิลด์ใหม่ใน `for (const k of [...])` + เซ็ต `updatedAt`
  - `findLinkedProducts()`: **ค้นด้วย `customerId` ก่อน** แล้ว fallback ไป `customerName`/`taxId` (ของเก่ายังหาเจอ)
  - ย้าย logic นี้ไปไว้ที่ `lib/master/products.listProductsForCustomer()`

### 6.2 products
- [`src/app/api/products/route.js`](src/app/api/products/route.js) — POST:
  - รับ `customerId` จาก body (form เลือกจาก master) → resolve `customerName`/`taxId` เป็น snapshot ผ่าน `resolveCustomer()`
  - รับ `categoryCode` (จาก dropdown)
- [`src/app/api/products/[id]/route.js`](src/app/api/products/%5Bid%5D/route.js):
  - เพิ่ม `customerId`, `categoryCode` ใน `salesEditable`
  - เซ็ต `updatedAt`

### 6.3 product-types (route ใหม่)
- `src/app/api/product-types/route.js`:
  - `GET` — ทุก user อ่านได้ (ใช้ทำ dropdown)
  - `POST`/`PATCH`/`DELETE` — จำกัด cap `master:manage` (supervisor)

---

## 7. Permissions

แก้ [`src/lib/permissions.js`](src/lib/permissions.js):

- เพิ่ม cap **`master:manage`** ใน `ROLE_CAPS.ae_supervisor` (สำหรับแก้ taxonomy product_types)
- master data edit อื่นๆ ใช้ cap เดิม (`customers:edit`, `products:edit`) — ไม่ต้องเพิ่ม
- (เตรียมเฟส PM) เพิ่ม `pm:view` / `pm:edit` ให้ role ฝั่ง SALES ภายหลัง — ยังไม่ทำในเฟส master data

---

## 8. Backfill (ทำครั้งเดียว, ปลอดภัย)

สคริปต์ `scripts/backfill-product-customer.mjs` (แพทเทิร์นเดียวกับ
[`scripts/migrate-to-supabase.mjs`](scripts/migrate-to-supabase.mjs)):

1. ดึง products ที่ `customerId IS NULL`
2. จับคู่กับ customers ด้วย `taxId` (แม่นสุด) → fallback `name`
3. เซ็ต `customerId` ให้ตรง
4. **ไม่ลบ/แก้ snapshot เดิม** — ของเก่ายังเชื่อมได้ตลอด

> รันหลังจาก migration 0006 และหลัง deploy route ที่รองรับ FK แล้ว

---

## 9. การแก้ UI

- **Customer picker (component กลาง)** — `src/components/CustomerPicker.js`
  ใช้ใน ฟอร์มสินค้า (แทนช่องพิมพ์ชื่อลูกค้า) + อนาคต ฟอร์มโปรเจกต์ PM
- **Category dropdown** — ดึงจาก `/api/product-types` ใช้ในฟอร์มสินค้า
- หน้า `/customers/[id]` + `/products/[id]` — โชว์ฟิลด์ใหม่ (contact/email/credit/category)
- (อนาคต) จัดกลุ่มเมนู "ข้อมูลหลัก (Master Data)" ใน [`AppLayout.js`](src/components/AppLayout.js)

---

## 10. ลำดับการลงมือ (Checklist)

```
[ ] 1. เขียน migrations/0005_customer_master.sql
[ ] 2. เขียน migrations/0006_product_master.sql
[ ] 3. เขียน migrations/0007_product_types.sql (+ port seed ครบจาก ss-cj)
[ ] 4. รัน 0005 → 0006 → 0007 บน Supabase (SQL Editor)
[ ] 5. สร้าง src/lib/master/{customers,products,productTypes}.js
[ ] 6. แก้ route customers (POST/PATCH + findLinkedProducts → lib/master)
[ ] 7. แก้ route products (customerId/categoryCode + resolve snapshot)
[ ] 8. สร้าง route ใหม่ /api/product-types
[ ] 9. เพิ่ม cap master:manage ใน permissions.js
[ ] 10. UI: CustomerPicker + category dropdown + ฟิลด์ใหม่ในหน้า detail
[ ] 11. (option) backfill script + รัน
[ ] 12. ทดสอบ regression ระบบภาษี (orders/products เดิมต้องทำงานปกติ)
```

ลำดับ 1–9 คือแกน master data; 10 คือ UI; 11–12 คือเก็บงาน

---

## 11. ความเสี่ยง & การกันพลาด

| ความเสี่ยง | การกัน |
|---|---|
| products เดิมเชื่อมลูกค้าด้วย name/taxId | คง snapshot + lookup fallback ใน `listProductsForCustomer()` |
| migration รันซ้ำ | ใช้ `if not exists` / `on conflict do nothing` ทั้งหมด |
| products POST ใช้ `...body` spread | ตรวจว่า field ใหม่ที่รับมาตั้งใจรับ (กัน client ยัด field แปลก) |
| cascade name/taxId → products (ใน customers PATCH) | ยังทำงานเหมือนเดิม + เพิ่มการ sync ผ่าน customerId |
| กระทบระบบภาษีที่ใช้งานจริง | เฟสนี้ไม่ย้าย URL / ไม่แตะ schema orders — additive ล้วน |

---

## 12. นอกขอบเขตเฟสนี้ (อนาคต)

- ตาราง `brands` เป็น entity จริง (ตอนนี้ jsonb พอ)
- ดูด audit / permission / file-storage เข้า shared core
- จัด namespace URL ใหม่ (`/api/master/*`, `/api/tax/*`, `/api/pm/*`)
- ระบบ PM (projects/tasks/timeline/ISO) — ผูก `customer_id`/`product_id` เป็น FK กับ master ตั้งแต่แรก (ใช้แพลนนี้เป็นฐาน)
