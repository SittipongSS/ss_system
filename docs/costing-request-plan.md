# แผน implement: ระบบขอราคาผลิต (Costing Request)

> สถานะ: **ฉบับแก้ไขครั้งที่ 4 — รวมสองระบบเป็นระบบเดียว (มติ 2026-07-26) รอเริ่มโค้ด**
> ฉบับที่ 1 (MERGED #637) ใบเดียวจบวงจร — สร้างครบ 6 PR (#638–#650)
> ฉบับที่ 3 (MERGED #659) แยกเป็น 2 เอกสาร (ใบขอราคาวัสดุ MR + ใบขอราคาผลิต CR) —
> สร้างครบ 3 PR (#662/#665/#666) และ**ใช้จริงไม่ได้** ด้วยเหตุผลในข้อ 0
> ฉบับนี้**ยุบใบขอราคาวัสดุทิ้ง** เหลือเอกสารเดียว + ยกคลังราคาวัสดุขึ้นเป็นข้อมูลหลัก

## 0. ทำไมต้องรื้อ — แยกผิดแกน

ฉบับ 3 แยกด้วยเหตุผลที่ถูก ("ราคาวัสดุกับราคาผลิตคนละส่วนกัน") แต่**แยกเป็นคนละ
เอกสาร** ทั้งที่ของสองอย่างนี้ไม่ได้ต่างกันที่ "เอกสาร" — มันต่างกันที่ **ชั้นของข้อมูล**:

| | ราคาวัสดุ | ราคาผลิต |
|---|---|---|
| ธรรมชาติ | **ข้อมูลหลัก** — มีตัวตนถาวร ใช้ซ้ำ มีประวัติราคา (เหมือนลูกค้า/สินค้า) | **เอกสารงาน** — เกิดครั้งเดียว มีเลข มีคนอนุมัติ |
| ควรอยู่ในรูป | ทะเบียน (registry) | ใบ + workflow |

พอทำใบ MR เป็นเอกสารคู่ขนานกับใบ CR ตัวเชื่อมระหว่างสองใบเลยเหลือแค่ **ข้อความ
ชื่อวัสดุ** และนั่นทำให้ผลตรวจ 2026-07-26 พบข้อบกพร่อง 7 ข้อ ซึ่ง 5 ข้อมาจากจุดนี้จุดเดียว:

| # | อาการ | ที่ | หายเมื่อ |
|---|---|---|---|
| 1 🔴 | RD/PC กด "แก้ราคา" ในคลัง = 403 เสมอ (proxy กั้นด้วย `costing:edit` ที่ RD/PC ไม่มี) | `src/proxy.js:263` | PR-1 |
| 2 🔴 | ตอบใบ MR ทุกครั้ง = สร้างวัสดุ**ตัวใหม่** ไม่เคยเป็น rev.2 | `materialPricesAdmin.js:77` + `requests/route.js:52` | PR-1 (UNIQUE key + เลือกจากทะเบียน) |
| 3 🔴 | `gramsPerUnit` แก้บนใบไม่ได้เลย → แม่แบบไม่ใส่กรัม = ใบค้างถาวร ส่งผู้บริหารไม่ได้ | ไม่มี API/UI ที่ไหนเขียนค่านี้ | PR-2 |
| 4 🟠 | จับคู่คลัง↔บรรทัดด้วยชื่อตรงเป๊ะ — ชื่อบรรทัดเป็นชื่อกลาง ชื่อในคลังเป็นของเฉพาะ → ไม่มีวันแมตช์ | `costingLibrary.js:18` → `bestPriceFor` | PR-2 (ผูกด้วย id) |
| 5 🟠 | ราคาทับรายลูกค้าใช้ไม่ได้ — ฟอร์มส่งแต่ `customerName` ไม่ส่ง `customerId` → ราคาของลูกค้า A ถูกใช้กับ B | `requests/page.js:55` | PR-1 (ทะเบียนเลือกลูกค้าจริง) |
| 6 🟡 | บรรทัดเกินอายุติดธง "รอยืนยัน" แต่ไม่มีแจ้งเตือน/คิวให้ RD/PC | `fill-prices/route.js` ไม่ sendChat | PR-1 (คิว asks) |
| 7 🟡 | `priceSource='manual'` ไม่มีโค้ดไหนเขียน · สถานะ `pricing` ค้างไม่มีความหมาย | mig 0144 / `costing.js:44` | PR-3 |

## 1. โครงใหม่

```
┌─ ทะเบียนวัสดุ (master data — ไม่ใช่เอกสาร ไม่มีเลขที่) ─────────┐
│ วัสดุมี id จริง · ราคาเป็น rev (immutable) · มีอายุ              │
│ · ราคากลาง / ราคาทับรายลูกค้า                                    │
│ เซลเพิ่มวัสดุได้เป็น "ร่าง" → RD/PC รับ + ใส่ราคา = "ใช้งาน"      │
│ ปุ่ม "ขอราคา" บนทะเบียน = ถามราคาลอย ๆ ได้โดยไม่ต้องมีงาน         │
└──────────────┬──────────────────────────────────┬────────────────┘
      เลือกวัสดุ │                                  │ คำตอบ = rev ใหม่
               ↓                                  ↑
╔═ ใบขอราคาผลิต CR-YYMMXXXX — เอกสารเดียวของระบบ ═══════════════╗
║ กางบรรทัดตามแม่แบบประเภทสินค้า (คงเดิม)                          ║
║ แต่ละบรรทัด: เลือกวัสดุจากทะเบียน + กรอกกรัม/ชิ้น (แก้ได้)         ║
║   มีราคาสด    → ดึงเข้าเป็น snapshot ทันที                       ║
║   ไม่มี/เกินอายุ → กด "ขอราคา" **ในใบนี้เลย** (ไม่ออกเอกสารใหม่)   ║
║ ครบทุกบรรทัดบังคับ = ปลดล็อกส่งผู้บริหาร                          ║
║ ผู้บริหารเคาะราคาผลิตต่อชั้นจำนวน รายสินค้า + ลายเซ็น             ║
║ → ผูก FG (ถ้าไปต่อ) → ป้อนราคาผลิตเข้า FG                       ║
╚═════════════════════════════════════════════════════════════════╝
```

**หายไปจากระบบ:** ใบขอราคาวัสดุ (MR-YYMMXXXX), หน้า `/sa/materials/requests`,
เลขที่ scope `MR`, การเด้งข้ามหน้าเพื่อรอราคาแล้วกลับมาเดาว่าชื่อไหนคู่กับบรรทัดไหน

**ได้คืนฟรี:** สถานะ `pricing` (รอราคา RD/PC) ใน `COSTING_STATUSES` กลับมามีความหมาย
· เส้น `/quote` เดิม (RD/PC ตอบราคาในใบ) กู้จาก git ได้ — ถูกถอดตอน commit `72637ff8`

### วงจรสถานะ

```
วัสดุ:   draft ──รับ+ใส่ราคา──▶ active ──ซ่อน──▶ archived
          ▲ เซลเสนอ            └─ ราคา rev N (มีอายุ) ─┘
คำขอราคา: open ──RD/PC ออก rev ใหม่──▶ answered
                └──ผู้ขอยกเลิก──▶ cancelled
ใบ CR:   draft → pricing → assembling → pending_exec ⇄ returned → approved → linked
                  ▲ มี ask ค้าง        ▲ ราคาครบทุกบรรทัดบังคับ
```

## 2. มติที่ล็อกแล้ว (2026-07-26)

1. **เอกสารเดียว** — ใบ CR เท่านั้น; ทะเบียนวัสดุไม่ใช่เอกสาร ไม่มีเลขที่ ไม่มีสถานะใบ
2. **ถามราคาลอย ๆ = ปุ่มบนทะเบียนวัสดุ** ไม่ใช่เอกสาร — RD/PC เห็นคิวเดียวกันกับที่ถามจากในใบ
3. **เซลสร้างวัสดุได้ แต่เข้าเป็น "ร่าง"** รอ RD/PC รับ (คนใส่ราคายังเป็น RD/PC เท่านั้นเสมอ)
   วัสดุร่าง = ยังไม่มีราคา → บรรทัดที่ใช้วัสดุร่างส่งผู้บริหารไม่ได้ (ด่านเดิมทำงานพอดี)
4. **prod ยังไม่มีข้อมูลจริง** (ยืนยัน 2026-07-26) → migration **drop ตาราง MR ทิ้งได้**
   ไม่ต้องเขียนสคริปต์ย้ายข้อมูล ไม่ต้องเก็บใบเก่าอ่านอย่างเดียว
5. **บรรทัดผูกวัสดุด้วย id** ไม่ใช่ชื่อ — เลิกฟังก์ชันจับคู่ตามชื่อทั้งหมด (`bestPriceFor`
   ยังอยู่แต่ใช้เลือก "ราคากลาง vs ทับรายลูกค้า" ของวัสดุ **ตัวเดียวกัน** เท่านั้น)
6. **กรัม/ชิ้น แก้ได้บนบรรทัดในใบ** — แม่แบบให้แค่ค่าตั้งต้น (ขวด 30ml/100ml หมวดเดียวกัน
   ต้องกรอกคนละค่า)
7. **ราคาที่ดึงแล้วยังตรึงเหมือนเดิม** — snapshot `pricePerKg/pricePerUnit` +
   `materialRevisionId` บนบรรทัด; ราคาทะเบียนขยับทีหลังไม่กระทบใบที่ดึงไปแล้ว
8. มติเดิมที่คงอยู่ทั้งหมด: อนุมัติรายสินค้า + ตัวนับ x/y นับสด · ผู้บริหารคนเดียวจบ +
   ลายเซ็น · ดีล/FG optional · revise = ใบใหม่ rev.2 · RM ผูกสูตร · แม่แบบ = admin +
   ซ่อนแทนลบ · อายุราคา default 90 วัน · คำศัพท์ "ราคาผลิต"

## 3. โมเดลข้อมูล

เลขล่าสุด = 0156 → migration ใหม่ = **`0157_material_registry.sql`**
ตารางที่**ไม่แตะเลย**: `product_type_cost_templates/lines` (0140), `costing_requests`,
`costing_request_items`, `costing_item_tiers` (0141), ป้อนต้นทุน (0142),
`material_price_revisions` (immutable + guard ดีอยู่แล้ว)

```
DROP  material_price_requests, material_price_request_items   -- ใบ MR ทั้งชุด
      + guard trigger/function + force_delete_material_request (0147)
      + แถว entity_number_counters scope='MR'

material_prices (คงตาราง เพิ่มความเป็น master)
  + status  'draft' | 'active' | 'archived'   -- draft = เซลเสนอ รอ RD/PC รับ
  + "acceptedById/Name", "acceptedAt"          -- RD/PC รับวัสดุร่างเข้าทะเบียน
  + UNIQUE (kind, lower(btrim(label)), coalesce("customerId",''))  -- กันซ้ำที่ราก (บั๊ก 2)
  ~ "isHidden" ยุบเข้า status='archived' แล้ว DROP COLUMN
  (kind/label/sourceDept/customerId/customerName/supplierNote/revisions คงเดิม)

material_price_asks (ใหม่ — "คำขอราคา" เป็นคิว ไม่ใช่เอกสาร)
  id, "materialId", status 'open'|'answered'|'cancelled',
  reason 'new_material'|'no_price'|'expired',
  "costingRequestId" null = ถามลอย ๆ จากทะเบียน / มีค่า = ถามจากในใบ,
  "componentId" null = ไม่ผูกบรรทัด,   -- ผูกไว้เพื่อเติมราคากลับ + แจ้งกลับ
  "requestedById/Name/At", "answeredRevisionId", "answeredById/Name/At", note
  UNIQUE partial (materialId, componentId) WHERE status='open'  -- กดรัวไม่เกิดคิวซ้ำ

costing_item_components (ปรับความหมาย ไม่เพิ่มตาราง)
  ~ "materialId"  = ตัวชี้จริง (เลือกจาก dropdown) ไม่ใช่ผลการเดาจากชื่อ
  ~ "gramsPerUnit" แก้ได้ผ่าน API ใหม่ (แม่แบบให้ค่าตั้งต้น)
  ~ "priceSource"  เหลือ 'library' | 'confirmed'  -- ตัด 'manual' (บั๊ก 7)
  - DROP "confirmStatus", "confirmRequestedAt", "confirmRequestedById" → ย้ายไป asks
```

### DDL ร่างของ 0157

> ⚠️ นี่คือ**ร่าง** — PR-1 เป็นคนสร้างไฟล์จริงแล้วส่ง SQL ฉบับสมบูรณ์ให้รันมือบน
> Supabase SQL Editor (DDL ผ่าน service-role ไม่ได้ — เหมือนทุกตัวตั้งแต่ 0005)

```sql
BEGIN;

-- 1) ถอนใบขอราคาวัสดุทั้งชุด (prod ไม่มีข้อมูลจริง — มติข้อ 4)
DROP TRIGGER  IF EXISTS material_price_requests_guard ON public.material_price_requests;
DROP FUNCTION IF EXISTS public.guard_material_price_request();
DROP FUNCTION IF EXISTS public.force_delete_material_request(text);
DROP TABLE    IF EXISTS public.material_price_request_items;
DROP TABLE    IF EXISTS public.material_price_requests;
DELETE FROM public.entity_number_counters WHERE scope = 'MR';

-- 2) material_prices → ทะเบียน
ALTER TABLE public.material_prices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  ADD COLUMN IF NOT EXISTS "acceptedById"   text,
  ADD COLUMN IF NOT EXISTS "acceptedByName" text,
  ADD COLUMN IF NOT EXISTS "acceptedAt"     timestamptz;

UPDATE public.material_prices SET status = 'archived' WHERE "isHidden" = true;
DROP INDEX IF EXISTS public.material_prices_kind_idx;      -- อ้าง isHidden
ALTER TABLE public.material_prices DROP COLUMN IF EXISTS "isHidden";
CREATE INDEX material_prices_kind_idx ON public.material_prices (kind, status);

-- ⚠️ ก่อนสร้าง UNIQUE: เช็คของทดลองที่ซ้ำอยู่ก่อน (บั๊ก 2 ทำให้มีได้)
--   SELECT kind, lower(btrim(label)) l, coalesce("customerId",'') c, count(*)
--   FROM public.material_prices GROUP BY 1,2,3 HAVING count(*) > 1;
CREATE UNIQUE INDEX material_prices_identity_uk
  ON public.material_prices (kind, lower(btrim(label)), coalesce("customerId", ''));

-- 3) คิวคำขอราคา
CREATE TABLE IF NOT EXISTS public.material_price_asks (
  id                   text PRIMARY KEY,
  "materialId"         text NOT NULL REFERENCES public.material_prices(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'answered', 'cancelled')),
  reason               text NOT NULL
                       CHECK (reason IN ('new_material', 'no_price', 'expired')),
  "costingRequestId"   text,          -- null = ถามลอย ๆ จากทะเบียน
  "componentId"        text,          -- null = ไม่ผูกบรรทัดในใบ
  note                 text CHECK (note IS NULL OR length(note) <= 500),
  "requestedById"      text NOT NULL, "requestedByName" text,
  "requestedAt"        timestamptz NOT NULL DEFAULT now(),
  "answeredRevisionId" text,
  "answeredById"       text, "answeredByName" text,
  "answeredAt"         timestamptz,
  "cancelledAt"        timestamptz,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'answered' OR "answeredRevisionId" IS NOT NULL)
);
CREATE UNIQUE INDEX material_price_asks_open_uk
  ON public.material_price_asks ("materialId", coalesce("componentId", ''))
  WHERE status = 'open';
CREATE INDEX material_price_asks_queue_idx   ON public.material_price_asks (status, "requestedAt" DESC);
CREATE INDEX material_price_asks_costing_idx ON public.material_price_asks ("costingRequestId");

ALTER TABLE public.material_price_asks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_price_asks FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_price_asks TO service_role;

-- 4) บรรทัดต้นทุน: ธงยืนยันย้ายไป asks + ตัด 'manual' + เคลียร์ตัวชี้ค้าง
ALTER TABLE public.costing_item_components
  DROP COLUMN IF EXISTS "confirmStatus",
  DROP COLUMN IF EXISTS "confirmRequestedAt",
  DROP COLUMN IF EXISTS "confirmRequestedById";

UPDATE public.costing_item_components SET "priceSource" = NULL WHERE "priceSource" = 'manual';
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.costing_item_components'::regclass
     AND pg_get_constraintdef(oid) ILIKE '%priceSource%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.costing_item_components DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.costing_item_components
  ADD CONSTRAINT costing_item_components_price_source_check
  CHECK ("priceSource" IS NULL OR "priceSource" IN ('library', 'confirmed'));

UPDATE public.costing_item_components
   SET "materialId" = NULL, "materialRevisionId" = NULL
 WHERE "materialId" IS NOT NULL
   AND "materialId" NOT IN (SELECT id FROM public.material_prices);

COMMIT;
NOTIFY pgrst, 'reload schema';
```

**Rollback:** ใบ MR กู้ไม่ได้ (drop จริง) — ถ้าต้องถอย ให้รัน 0143 ส่วนที่ 3 ซ้ำเพื่อสร้าง
ตารางเปล่ากลับมา; `material_price_asks` drop ได้ตรง; คอลัมน์ `confirm*` เพิ่มกลับด้วย 0144

## 4. โครงสร้างไฟล์

### ลบทิ้ง (PR-1)
```
src/app/sa/materials/requests/page.js
src/app/sa/materials/requests/[id]/page.js
src/app/api/sa/materials/requests/route.js
src/app/api/sa/materials/requests/[id]/route.js
src/app/api/sa/materials/requests/[id]/answer/route.js
src/app/api/sa/costing/[id]/confirm-price/route.js        (PR-2 — แทนด้วย asks)
```

### สร้างใหม่
```
supabase/migrations/0157_material_registry.sql            PR-1
src/lib/materialRegistry.js                               PR-1  logic ล้วน (แทน materialPrices.js เดิมบางส่วน)
src/lib/materialRegistry.test.mjs                         PR-1
src/components/materials/MaterialForm.js                  PR-1  ⚠️ ฟอร์มเดียว สร้าง+แก้ (กฎ AGENTS.md)
src/components/materials/MaterialPicker.js                PR-2  ค้น+เลือกวัสดุ, สร้างใหม่จากในใบ
src/app/api/sa/materials/[id]/route.js                    PR-1  GET/PATCH(accept|archive|edit)/DELETE
src/app/api/sa/materials/[id]/revisions/route.js          PR-1  POST = ออก rev ใหม่ + ปิด ask
src/app/api/sa/materials/asks/route.js                    PR-1  GET คิว / POST ขอราคา
src/app/api/sa/materials/asks/[id]/route.js               PR-1  PATCH cancel
src/app/api/sa/costing/[id]/components/route.js           PR-2  PATCH ผูกวัสดุ / แก้กรัม
```

### แก้
| ไฟล์ | PR | แก้อะไร |
|---|---|---|
| `src/proxy.js` (บรรทัด 263–266) | 1 | `/api/sa/materials` ผ่านด้วย `costing:quote` **หรือ** `costing:edit`; ลบ regex `/revise` ที่ชี้ route ที่ไม่มี (บั๊ก 1) |
| `src/lib/materialPrices.js` | 1 | ลบ `generateMaterialRequestDocNo`, `normalizeMaterialRequestItems`; `bestPriceFor` เหลือเลือกราคากลาง/ทับรายลูกค้าของวัสดุตัวเดียว; เพิ่ม `materialPriceState()` |
| `src/lib/materialPricesAdmin.js` | 1 | ลบ `loadMaterialRequests`/`findMaterialRequest`; `appendMaterialRevision` รับ `materialId` บังคับ (ไม่สร้างวัสดุเองอีก); เพิ่ม `loadAsks`/`closeAsksForMaterial` |
| `src/app/sa/materials/page.js` | 1 | เขียนใหม่ทั้งหน้า — ทะเบียน + แท็บคิวรอตอบ |
| `src/components/AppLayout.js:222` | 1 | ชื่อเมนู "คลังราคาวัสดุ" → "ทะเบียนวัสดุ" |
| `src/lib/costingLibrary.js` | 2 | `componentLibraryStatus` ยึด `materialId` แทนชื่อ; `libraryPricingBlocker` เช็ค: ไม่ผูกวัสดุ / วัสดุร่าง / ไม่มีราคา / เกินอายุ / มี ask ค้าง / กรัมว่างบนบรรทัด per_kg |
| `src/lib/costingAdmin.js:69` | 2 | `componentRowsFromTemplate` — กรัมจากแม่แบบเป็นค่าตั้งต้น แก้ได้ทีหลัง |
| `src/app/api/sa/costing/[id]/fill-prices/route.js` | 2 | ดึงจาก `materialId` ที่ผูกไว้; คืน `_filled/_expired/_missing` ให้ UI ใช้จริง |
| `src/app/api/sa/costing/[id]/submit/route.js` | 2 | blocker ใหม่ + ตั้งสถานะ `pricing` เมื่อมี ask ค้าง |
| `src/app/sa/costing/[id]/page.js` | 2 | บล็อกบรรทัด: MaterialPicker + ช่องกรัม + ป้ายสถานะ + ปุ่มขอราคา; toast บอกจำนวนจริง |
| `src/lib/costing.js` | 2–3 | `submitToExecError` เลิกรับสถานะ `pricing` แบบ legacy; คอมเมนต์ 2 เอกสารออก |
| `*.test.mjs` ที่เกี่ยว | 1–3 | `materialPrices` / `costingLibrary` / `costing` |

### API สรุป

```
ทะเบียน
GET    /api/sa/materials?kind=&status=&customerId=&q=   ทุกคนที่ canViewCosting
POST   /api/sa/materials                                 เซล→status draft · RD/PC→active
       { kind, label, customerId?, supplierNote?, price? }
PATCH  /api/sa/materials/[id]    { action: 'accept'|'archive'|'edit', ... }
DELETE /api/sa/materials/[id]                            ลบได้เฉพาะร่างที่ยังไม่มี rev
POST   /api/sa/materials/[id]/revisions                  RD/PC เท่านั้น (canQuoteMaterial)
       { price, validUntil?, note? }  → ปิด ask ที่ open ของวัสดุนี้ทั้งหมด + แจ้งกลับ

คิวคำขอราคา
GET    /api/sa/materials/asks?status=open                RD/PC เห็นของฝ่ายตน, เซลเห็นที่ตัวเองขอ
POST   /api/sa/materials/asks
       { materialId, reason, costingRequestId?, componentId?, note? }
PATCH  /api/sa/materials/asks/[id]   { action: 'cancel' }

ใบ CR (PR-2)
PATCH  /api/sa/costing/[id]/components
       { componentId, materialId?, gramsPerUnit? }   ผูกวัสดุแล้วมีราคาสด = เติม snapshot ทันที
PATCH  /api/sa/costing/[id]/fill-prices               ดึงราคาล่าสุดทุกบรรทัดที่ผูกวัสดุแล้ว
```

**สิทธิ์** — ด่านจริงอยู่ใน handler เสมอ (proxy เห็นแค่ role): ใส่ราคา/รับวัสดุร่าง =
`canQuoteMaterial` (ฝ่ายเจ้าของ RD/PC) · เพิ่มร่าง/ขอราคา/ผูกวัสดุในใบ = `costing:edit`
(+ `canEditCostingRequest` รายใบ) · ดูทั้งหมด = `canViewCosting`

**แจ้งเตือน** — ขอราคา (ทั้งจากทะเบียนและจากในใบ) → space `rd`/`pc` ตามฝ่ายเจ้าของวัสดุ ·
RD/PC ตอบ → แจ้งกลับผู้ขอทุกคน + ใบที่รออยู่ · ส่งผู้บริหาร/ผลอนุมัติ → เดิม
**Audit** — ทุก action ผ่าน `recordAudit` เหมือนเดิม; `entityType` ใหม่ = `material_price_ask`

## 5. หน้าจอ

| ที่ | ของใหม่/เปลี่ยน |
|---|---|
| `/sa/materials` (รื้อ) | **ทะเบียนวัสดุ** — 2 แท็บ: **ทะเบียน** (ค้น/กรอง ชนิด·สถานะ·ลูกค้า · เพิ่มวัสดุ · แก้ราคา=rev ใหม่ · ประวัติ rev · ขอราคา · ซ่อน) และ **คิวรอตอบ** (คำขอ open ของฝ่ายตน รวมวัสดุร่าง + ไม่มีราคา + เกินอายุ ตอบได้จากในคิวเลย) ← ปิดบั๊ก 6 |
| `/sa/materials/requests` | ลบทั้งโฟลเดอร์ + redirect → `/sa/materials` |
| `/sa/costing/[id]` (รื้อบล็อกบรรทัด) | ต่อบรรทัด: **เลือกวัสดุ** (กรองตาม kind ของบรรทัดอัตโนมัติ, สร้างใหม่จากในใบได้) · ช่อง **กรัม/ชิ้น** แก้ได้ · ป้ายสถานะราคา (สด / เกินอายุ / รอ RD/PC / วัสดุร่าง) · ปุ่ม **ขอราคา** รายบรรทัด |
| `/sa/costing/[id]` | ปุ่ม "ดึงราคาจากคลัง" → **"ดึงราคาล่าสุดทุกบรรทัด"** + toast บอกจำนวนจริง |
| ที่เหลือ | ไม่เปลี่ยน — อนุมัติ/ตีกลับ/ลายเซ็น/ผูก FG/ป้อนต้นทุน/revise/แม่แบบ |

## 6. ลำดับสร้าง (3 PR)

**PR-1 ทะเบียนวัสดุ**
mig 0157 · `materialRegistry.js` + เทสต์ · หน้า `/sa/materials` ใหม่ (ทะเบียน + คิว) ·
API ทะเบียน/rev/asks · แก้ proxy (บั๊ก 1) · ลบใบ MR ทั้งชุด · เมนู
→ ใบ CR ยังทำงานแบบเดิมได้ระหว่างทาง (บรรทัดที่ผูก `materialId` ไว้ยังชี้ถูก)

**PR-2 ใบ CR ผูกวัสดุจริง**
`MaterialPicker` + `/components` API (ผูกวัสดุ + แก้กรัม, บั๊ก 3) · ขอราคาจากในใบเข้าคิวเดียวกัน ·
`componentLibraryStatus`/`libraryPricingBlocker` ยึด id (บั๊ก 4) · สถานะ `pricing` กลับมาใช้ ·
`fill-prices` คืนจำนวนจริง · ลบ `confirm-price`

**PR-3 เก็บกวาด**
ตัด `priceSource='manual'` ออกจากโค้ด/คอมเมนต์ · ลบสายจับคู่ตามชื่อที่เหลือ ·
เทสต์ครบทั้ง 3 ไฟล์ lib · rulebook + memory + คอมเมนต์ที่ยังอ้าง "2 เอกสาร"

## 7. เช็คลิสต์ทดสอบ (UAT)

1. เซลเพิ่มวัสดุใหม่ → เป็นร่าง, RD/PC เห็นในคิว, รับ+ใส่ราคา → active + แจ้งกลับผู้ขอ
2. RD กดแก้ราคาวัสดุ RM ได้ / PC แก้ PM ได้ / **สลับฝ่ายกันแก้ไม่ได้** / เซลแก้ราคาไม่ได้เลย
3. แก้ราคา = rev.2 · ประวัติครบ · **ใบที่ดึง rev.1 ไปแล้วตัวเลขไม่ขยับ**
4. ถามวัสดุตัวเดิมซ้ำ → ไม่เกิดวัสดุใหม่ (UNIQUE) และคิวไม่ซ้ำ (partial unique)
5. ราคาทับรายลูกค้า: วัสดุชื่อเดียวกัน ลูกค้า A มีราคาเฉพาะ → ใบของ A ได้ราคาเฉพาะ, ใบของ B ได้ราคากลาง
6. บรรทัด per_kg กรัมว่าง → ส่งผู้บริหารไม่ได้ + **แก้กรัมบนใบได้จริง** แล้วส่งผ่าน
7. ราคาเกินอายุ → บรรทัดขึ้นป้าย + กดขอราคา → RD/PC เห็นในคิว → ตอบ → บรรทัดอัปเดตเอง
8. ใบที่มี ask ค้าง = สถานะ `pricing` และส่งผู้บริหารไม่ได้
9. อนุมัติ/ตีกลับ/ลายเซ็น/ป้อนต้นทุนเข้า FG/revise rev.2 — ยังทำงานเหมือนเดิมทุกเส้น
10. `npm test` เขียว · `npm run check:migrations` เขียว

## 8. ความเสี่ยง

1. **ชื่อวัสดุซ้ำ/สะกดต่าง** — UNIQUE จับได้แค่ตรงเป๊ะ ("ขวดแก้ว 50ml" vs "ขวด 50 ml.")
   เฟสแรกพึ่งการค้นตอนเลือก; ถ้าเริ่มรกค่อยทำตัวช่วยรวม
2. **เซลสร้างวัสดุร่างเกลื่อน** — RD/PC ต้องคอยรับ/ปฏิเสธ; ถ้าเป็นภาระค่อยจำกัดเป็น
   "เสนอได้เฉพาะตอนอยู่ในใบ CR"
3. **UNIQUE index สร้างไม่ผ่านถ้ามีข้อมูลทดลองซ้ำอยู่** — ต้องรัน query เช็ค/ล้างก่อน (ดู DDL)
4. **ระหว่าง PR-1 → PR-2 ระบบขอราคาวัสดุได้จากทะเบียนอย่างเดียว** — ใบ CR ยังใช้ของเดิม
   (จับคู่ตามชื่อ) ชั่วคราว ไม่พัง แต่ยังไม่ได้ประโยชน์เต็ม
5. mig 0157 ต้องรันมือบน Supabase SQL Editor และ **ต้องรันก่อน deploy โค้ด PR-1**
