# แผน implement: ระบบขอราคาต้นทุน (Costing Request)

> สถานะ: **แผนอนุมัติแล้ว รอเริ่มโค้ด** (ฉบับแก้ไขครั้งที่ 1 — 2026-07-22, มติครบจากการวิเคราะห์ 2 รอบ)
> ผูกกับดีล → รวมราคา RM/PM → ผู้บริหารอนุมัติราคาผลิต → ป้อนกลับ FG/ใบเสนอราคา
> ที่มา: ดิจิทัลไลซ์ 2 ชีตของฝ่ายจัดซื้อ/ฝ่ายขาย
> - ชีต 1 (FM-PU07) "แบบฟอร์มรับงานจากทางฝ่ายขาย" = คำขอราคาบรรจุภัณฑ์ SA → PC
> - ชีต 2 "ขอราคา KA" = ตารางประกอบต้นทุนรายสินค้า เพื่อขอราคาผลิตจากผู้บริหาร

## 0. ภาพรวม flow

```
เปิดดีล (ลูกค้า + ยอดอนาคต → วาง FC)
        │
   ① SA ──ขอราคา PM──► PC จัดซื้อ (ขวด/ฝา/กล่อง ฿/ชิ้น)
        │  ──ขอราคา RM──► RD (F หัวน้ำหอม ฿/กก. + FB เนื้อสาร ฿/กก.)
        │
   ② SA ประกอบต้นทุนรายสินค้า ตาม "แม่แบบตามประเภทสินค้า"
        │  RM (แปลง ฿/กก. → ฿/ชิ้น ด้วยกรัม/ชิ้น) + PM + ค่าดำเนินการ (QC/Shrink)
        │
   ③ ส่งผู้บริหาร ──อนุมัติราคาผลิต (฿/ชิ้น ต่อชั้นจำนวน) รายสินค้า──►
        │
   ④ ป้อนกลับเป็น costPrice ของ FG → ใบเสนอราคาลูกค้า
```

## 1. ขอบเขต & หลักการ

ระบบใบเดียวต่อดีล ที่รวบรวมราคา **RM (จาก RD) + PM (จาก PC)** ประกอบตาม **แม่แบบของประเภทสินค้า** → ส่ง **ผู้บริหาร** อนุมัติราคาผลิตต่อชั้นจำนวน **รายสินค้า** → ป้อนกลับเป็น `costPrice` ของ FG → ใบเสนอราคา

**แหล่งราคา (สรุป):**

| องค์ประกอบ | ชนิด | ขอจาก | หน่วยราคา |
|---|---|---|---|
| F = Fragrance หัวน้ำหอม | RM | RD | ฿/กก. |
| FB = เนื้อสาร (shower gel / reed diffuser / body perfume) | RM | RD | ฿/กก. |
| ขวด / ฝา / กล่อง / ซอง ฯลฯ | PM | PC | ฿/ชิ้น |
| QC / Shrink Film / ค่าบรรจุ | labor/overhead | ภายใน | ฿/ชิ้น |

**Reuse บังคับ (ไม่สร้างซ้ำ):** กฎฟอร์มแก้=สร้าง (AGENTS.md), page-header standard, FilterPopover, `AttachmentsPanel`, audit log, chat-webhook (`lib/chat.js`), ลายเซ็นอิเล็กทรอนิกส์ (mig 0122/0125), `lib/sales/ownerIdentity` (snapshot), **`next_entity_number` (mig 0096) ออกเลขเอกสาร**, **แพตเทิร์นคิว inquiries (mig 0104)** — assignee ว่าง = ทั้งฝ่ายเห็น, กด "รับเรื่อง", SLA จากปฏิทินวันหยุดจริง

**เส้นแบ่งกับระบบสอบถาม (inquiries):** ระบบมี inquiry SA↔RD อยู่แล้ว — **การขอราคาเชิงโครงสร้าง (ต่อบรรทัด/ต่อชั้นจำนวน) ต้องผ่านใบ costing เท่านั้น**; inquiry เอาไว้คำถามอิสระ. ต้องสื่อสารเส้นแบ่งนี้ใน UI (เช่น hint ในหน้าสร้าง inquiry ว่า "ขอราคา → ใช้ใบขอราคาต้นทุน") กันราคาไปกองในแชทที่ประกอบต้นทุนไม่ได้

**ข้อเท็จจริงจากโค้ดที่กระทบดีไซน์ (ยืนยัน 2026-07-22):**
- Role เป็นโค้ดใน `webapp/src/lib/permissions.js` ไม่ใช่ migration → เพิ่ม role `executive` ได้โดยไม่ต้องแตะ DB; `viewer` ถือ `:view` ครบทุกโมดูลอยู่แล้ว
- `categoryCode` ทั้งระบบเป็น**สตริงประกอบ** `"MM-TTT"` (`lib/master/productCategory.js`) — `product_types` ไม่มีคอลัมน์นี้ (key จริง = `unique(mainCategoryCode,typeCode)`) → **ตารางแม่แบบเก็บ text ห้ามใส่ FK** validate ฝั่งแอปผ่าน `activeProductTypeError` เหมือน products + นิยามพฤติกรรมเมื่อหมวดถูกพักใช้ (`isActive=false` → เลือกใหม่ไม่ได้ ใบเก่าอ่านได้)
- `AttachmentsPanel` ต้องมี entity บันทึกก่อนถึงแนบได้ และไม่มีพรีวิวรูปในหน้า → PR5 เสริมพรีวิวตอนร่าง + thumbnail/lightbox
- ✅ บั๊กแนบไฟล์ปิดแล้ว (commit `52848195`, 2026-07-20 — เป็นบั๊ก cache ล้วน ท่ออัปโหลดยืนยันปกติทุกชั้น) → ไม่มีเงื่อนไขค้างสำหรับ PR5
- **กำไรโรงงาน/margin breakdown (สัดส่วน 0.65 ใน `products/route.js`) เป็นคนละระบบ** — ใช้เฉพาะตอนยื่นขึ้นทะเบียนสรรพสามิต ไม่เกี่ยว costing (มติ 2026-07-22) → PR6 ไม่แตะ

## 2. โมเดลข้อมูล (migration 0140–0141)

ทุก migration: additive + idempotent + RLS on (ไม่มี policy — เข้าผ่าน API service_role ตามแพตเทิร์นเดิม) + `NOTIFY pgrst, 'reload schema'` (รันมือบน Supabase SQL Editor). **เลขล่าสุดในระบบ = 0139** (issued_quotation_pdf_artifact — 0139 ถูกใช้แล้ว ห้ามใช้ซ้ำ)

### `0140_product_type_cost_templates.sql` — แม่แบบต้นทุนต่อประเภท (เติมเองภายหลัง)
```
product_type_cost_templates
  id, "categoryCode" text            -- "MM-TTT" soft ref → product_types (ห้าม FK)
  "isHidden" boolean default false   -- ซ่อน ไม่ลบจริง (มติ: ใบเก่าอ้างย้อนได้เสมอ)
  "createdAt", "updatedAt"
product_type_cost_lines
  id, "templateId", "sortOrder"
  kind        'RM_F' | 'RM_FB' | 'PM' | 'labor'    -- แหล่ง: RM→RD, PM→PC, labor→ภายใน
  label       เช่น 'ขวดแก้ว 50ml' / 'หัวน้ำหอม'
  "unitBasis" 'per_kg' | 'per_piece'               -- RM=per_kg, PM/labor=per_piece
  "defaultGramsPerUnit"  numeric null              -- ใช้แปลง ฿/กก. → ฿/ชิ้น (เฉพาะ per_kg)
  required    boolean
```
- **ลบจริงไม่มี** — มีแค่ซ่อน (`isHidden`) ตามแนวทาง settings ระดับ B (Decision 0012); ใบ costing กาง snapshot จากแม่แบบตอนใช้อยู่แล้ว จึงไม่พังเมื่อแม่แบบเปลี่ยนทีหลัง

### `0141_costing_requests.sql` — ใบขอราคา (header + สินค้า + ชั้นจำนวน)
```
costing_requests
  id 'CR-' + uuid
  "docNo" text unique                -- CR-YYMMXXXX ผ่าน next_entity_number scope 'CR'
  status  'draft' | 'pricing' | 'assembling' | 'pending_exec'
          | 'returned' | 'approved' | 'linked' | 'cancelled'
  "dealId" (→ sales_deals, บังคับ), "customerId", "customerName" snapshot,
  "requestedById/Name", "moq" numeric default 1000,   -- MOQ ปรับได้ต่อใบ
  note, "createdAt", "updatedAt"
costing_request_items
  id, "requestId", "productId" (→ products, null ได้ถ้ายังไม่ขึ้นทะเบียน FG),
  "categoryCode" text (→ แม่แบบ ณ ตอนเลือก), "productLabel", "fragranceName",
  "approvalStatus" 'pending' | 'approved' | 'returned'   -- อนุมัติรายสินค้า
  "returnReason" text null
  "approvedById/Name", "approvedAt", "approvalSignatureId" (→ ลายเซ็น mig 0122)
costing_item_components        -- กาง 1 ครั้งจากแม่แบบ ณ ตอนเลือกประเภท (snapshot)
  id, "itemId", kind, label, "unitBasis", "gramsPerUnit",
  "sourceDept" 'RD'|'PC'|null, "pricePerKg", "pricePerUnit",
  "priceStatus" 'pending'|'quoted', "quotedById/Name", "quotedAt"
costing_item_tiers             -- ชั้นจำนวน (350/500/1000 …) + ราคาที่อนุมัติ
  id, "itemId", qty, "approvedUnitPrice"
```
- **ไม่มีคอลัมน์ `isMoq`** — derive ตอนอ่าน: `qty === header.moq` (เก็บสองที่ = drift)
- **ไม่มีคอลัมน์นับยอดอนุมัติ** — ตัวเลข x/y นับสดจาก items ทุกครั้งที่อ่าน (มติ: ห้ามเก็บ count)
- **อนุมัติคนเดียวจบ** (มติ: มีแค่ executive ไม่มีอนุมัติซ้อน) → `approvedUnitPrice` ช่องเดียวพอ

### เอกสารแนบ — ไม่ต้องมี migration
`attachments` (mig 0028) รับ `entityType` เป็น string อยู่แล้ว → เพิ่ม `'costing_item'` ใน `ATTACHMENT_TYPES` (`webapp/src/lib/master/attachmentTypes.js`) พอ

## 3. Role ใหม่: `executive` (ผู้บริหาร)

แก้ `webapp/src/lib/permissions.js` — role ใหม่ = viewer ทุก `:view` + สิทธิ์อนุมัติราคา:
```js
ROLES: [... , 'executive']
DEPARTMENTS: [... , 'EX']   // + DEPARTMENT_ROLES.EX = ['executive']
ROLE_CAPS.executive = [
  ...viewer_caps,          // เห็นทุกแดชบอร์ด/ติดตามงานทั้งระบบ
  'costing:view', 'costing:approve',   // ← cap ใหม่
]
```
- **ไม่แจก `products:margin`** (มติ 2026-07-22): กำไรโรงงานใช้เฉพาะงานสรรพสามิต — ผู้บริหารเห็นต้นทุนครบใน**ใบ costing** อยู่แล้ว (costing:view ครอบ breakdown เต็มทุกบรรทัด) เพียงพอต่อการคำนวณและลงราคาโรงงาน; ถ้าวันหน้าจำเป็นค่อย grant รายคน (`GRANTABLE_CAPS` รองรับอยู่แล้ว)
- เพิ่ม cap `costing:view` / `costing:edit` / `costing:quote` / `costing:approve` ใน `SUPERUSER_CAPS`
- SA ได้ `costing:view` + `costing:edit` (สร้าง/ประกอบใบ)
- RD/PC ได้ `costing:view` + `costing:quote` (ตอบราคาเฉพาะบรรทัด `sourceDept` ของฝ่ายตน — **บังคับ filter ที่ API layer** เพราะ RLS ไม่มี policy พึ่ง DB ไม่ได้)
- executive **ไม่มี operation อื่น** — เขียนได้เฉพาะการอนุมัติราคา (proxy write-gate บล็อกให้เองเพราะไม่มี `:edit`)
- **แม่แบบต้นทุน = admin เท่านั้น** (มติ: executive ทำหน้าที่อนุมัติอย่างเดียว ไม่ดูแล master data)

## 4. MOQ & ชั้นจำนวน

- `costing_requests.moq` default **1000** ปรับได้ต่อใบ
- ชั้นจำนวน (`costing_item_tiers`) เป็น dynamic ไม่ hardcode — เพิ่ม/ลบชั้นได้ (เช่น 500/1000/3000); ชั้นที่ตรง MOQ ติดธงตอนแสดงผล (derive ไม่เก็บ)
- ราคาที่อนุมัติเก็บ **ต่อชั้น** เพราะราคาผลิต/ราคา PM ต่างกันตามจำนวน; ผู้บริหารกรอกราคาต่อชั้น

## 5. Lifecycle & สถานะ (มติ 2026-07-22)

**อนุมัติรายสินค้า + สถานะใบ derive อัตโนมัติ + ตัวนับ x/y:**

```
item:    pending ──► approved            (executive อนุมัติ + ลายเซ็น)
                └──► returned + เหตุผล    (executive ตีกลับรายตัว — ตัวที่ approved แล้วไม่หลุด)

header (derive-on-write ใน endpoint เดียวกับ action — ไม่มีปุ่มปิดใบแยก):
  draft → pricing (ขอราคา RD+PC) → assembling (ราคาครบ SA ประกอบ)
        → pending_exec ──ทุก item approved──► approved → linked (ป้อน FG/QT แล้ว)
                       └─มี item returned──► returned → SA แก้ส่งใหม่ → pending_exec
  cancelled = SA/admin ยกเลิกใบ (เช่น ดีลหลุด)
```

- **UI:** pill สถานะ (ตาม page-header standard) + ตัวนับ `อนุมัติแล้ว 3/5 รายการ` — ตัวเลขนับสดตอนอ่านเสมอ
- อนุมัติ item สุดท้ายครบ → ใบพลิกเป็น `approved` อัตโนมัติ + แจ้ง SA ทาง chat ทันที
- **ดีล lost/cancelled:** ใบ costing ที่ยังไม่จบแสดงธงเตือน "ดีลปิดแล้ว" + SA/admin กดยกเลิกใบได้ (ไม่ auto-ลบ)
- **Un-accept QT / re-assemble:** ถ้าใบถูกแก้หลัง approved (กลับไป assembling) ราคาที่อนุมัติเดิมของ item ที่ถูกแก้ต้อง reset เป็น pending (invalidate — กันราคาเก่าหลอน)
- แจ้งเตือนข้ามฝ่ายผ่าน chat-webhook: SA กดขอราคา → แจ้ง RD+PC; ราคาครบ → แจ้ง SA; ส่งอนุมัติ → แจ้ง executive; อนุมัติครบ/ตีกลับ → แจ้ง SA
- audit log ทุกการเปลี่ยนสถานะ + การอนุมัติ (เก็บ signatureId)

## 6. หน้าจอ / UI (routes ใหม่ใต้ `/sa`)

| Route | ใคร | ทำอะไร |
|---|---|---|
| `/sa/costing` | SA, RD, PC, executive | รายการใบ + FilterPopover (สถานะ/ทีม/ลูกค้า) + ตัวนับ x/y ต่อใบ |
| `/sa/costing/[id]` | ทุก role ที่เกี่ยว | หน้าใบ — SA ประกอบ, RD/PC เติมราคาฝ่ายตน, executive อนุมัติรายสินค้า |
| `/settings/cost-templates` | **admin เท่านั้น** | จัดการแม่แบบต่อประเภท (สร้าง/แก้/ซ่อน — ไม่มีลบจริง) |

- **ปุ่มสร้าง/แก้ ใช้ component เดียว** `CostingRequestForm` (ต่างกันแค่โหมดผ่าน props ตาม AGENTS.md)
- header ใบ: เลือกดีล → auto-fill ลูกค้า/เจ้าของ; เลือกประเภทสินค้า → กางบรรทัดจากแม่แบบ (snapshot)
- คิวฝั่ง RD/PC ลอกแพตเทิร์น inquiries: ทั้งฝ่ายเห็นใบที่มีบรรทัดของฝ่ายตนค้าง ใครก็ตอบได้

## 7. การแนบรูป + พรีวิวในระบบ

เสริม `AttachmentsPanel` (ไม่แตะ entity อื่น) 3 จุด:
1. **พรีวิว thumbnail + lightbox** — ถ้า `mimeType` เป็นรูป แสดง `<img>` จาก proxy URL ในหน้าเลย คลิกขยาย (lightbox แบบ in-flow ไม่ใช้ `position:fixed`)
2. **พรีวิวตอนร่าง (ยังไม่เซฟ)** — โหมด `draft`: เก็บไฟล์ใน state + พรีวิวด้วย `URL.createObjectURL` แล้ว upload จริงตอนกด "บันทึกใบ" (คืน entityId ก่อน)
3. รับ paste/drag-drop รูป

## 8. API (ตามแพตเทิร์น route.js เดิม)

- `/api/sa/costing` (GET/POST)
- `/api/sa/costing/[id]` (GET/PATCH)
- `/api/sa/costing/[id]/quote` (RD/PC เติมราคา — filter บรรทัดตาม `sourceDept` ของผู้ใช้ที่ API)
- `/api/sa/costing/[id]/approve` (executive — รายสินค้า; อนุมัติครบ → พลิกใบ + แจ้งเตือนใน transaction เดียว)
- `/api/cost-templates` (admin — สร้าง/แก้/ซ่อน)

ทุก endpoint เช็ค cap + scope ที่ proxy layer; เลขเอกสารผ่าน `next_entity_number` scope `'CR'`

## 9. เชื่อมปลายทาง (PR6)

- item ที่อนุมัติแล้ว → ปุ่ม "ป้อนเป็นต้นทุน FG": เขียน `costPrice` ของ products (ราคาโรงงานที่อนุมัติ ณ ชั้น MOQ) + `recordProductPriceHistory`
- **ไม่แตะ margin breakdown / สัดส่วน 0.65** — เป็นระบบสรรพสามิต คนละส่วน (มติ 2026-07-22)
- ลิงก์ใบ ↔ ดีล ↔ ใบเสนอราคา สองทาง

## 10. นำเข้าข้อมูลเก่า

PC00001–PC00025 (ชีต 1) + ชีต 2 → import แบบ map `customerName` → `customerId` (fuzzy + ยืนยันมือ) ตามแพตเทิร์น backfill เดิม — ทำหลังโครงสร้างเสร็จ

## 11. ลำดับงาน (แยก PR)

1. **PR1** — role `executive` + caps `costing:*` + department EX (โค้ดล้วน, ทดสอบ gate) — เริ่มได้ทันที ไม่พึ่งอะไร
2. **PR2** — mig 0140 + `/settings/cost-templates` (admin จัดการ + ซ่อน) + **seed แม่แบบ ≥1 ประเภท** (PR3 ต้องมีของทดสอบจริง)
3. **PR3a** — mig 0141 + API ใบขอราคา + หน้า list `/sa/costing`
4. **PR3b** — หน้า detail + `CostingRequestForm` (สร้าง/แก้ component เดียว)
5. **PR4** — RD/PC ตอบราคา (คิวแบบ inquiries) + executive อนุมัติรายสินค้า + ลายเซ็น + derive สถานะใบ + chat แจ้งเตือน
6. **PR5** — เสริม `AttachmentsPanel` (พรีวิว/lightbox/draft) + ผูก `costing_item`
7. **PR6** — ป้อนต้นทุนกลับ FG + ลิงก์ใบเสนอราคา + ธงดีลปิด
8. **PR7** — import ข้อมูลเก่า

## 12. มติที่ล็อกแล้ว (2026-07-22) & คำถามค้าง

**ล็อกแล้ว:**
1. ✅ อนุมัติ**รายสินค้า** + สถานะใบ derive อัตโนมัติ + ตัวนับ x/y (นับสด ไม่เก็บ)
2. ✅ ผู้บริหารเห็นต้นทุน**ครบในใบ costing** — ไม่แจก `products:margin` (กำไรโรงงาน = งานสรรพสามิตล้วน)
3. ✅ อนุมัติ**คนเดียวจบ** มีแค่ executive
4. ✅ แม่แบบ = **admin เท่านั้น** + **ซ่อนแทนลบ**
5. ✅ MOQ derive ธงตอนอ่าน ไม่เก็บ `isMoq`

**ค้าง (ไม่บล็อกการเริ่ม):**
1. RD ตอบราคาต่อบรรทัดในใบ (v1) — "คลังราคากลาง" หัวน้ำหอม/เนื้อสาร reuse ข้ามใบ = v2
2. รายชื่อผู้ใช้ role executive จริง (ใส่ตอน deploy PR1)
