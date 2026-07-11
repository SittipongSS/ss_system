# Deal–Project Restructure — ลูกค้า › โครงการ › ดีล (NPD / RE-ORDER)

> แผนปรับโครงสร้างความสัมพันธ์ **deal ↔ project** จาก 1:1 เป็น **หลายดีลต่อ 1 โครงการ**
> พร้อมยก "ประเภทดีล" เป็นฟิลด์จริง เข้าชุดกับ [`SALES_PM_ROADMAP.md`](SALES_PM_ROADMAP.md)
> (โมเดล 2 ชั้น deal=commercial / project=execution — **ยังคงเดิม** แค่เปลี่ยน cardinality)
>
> สถานะ: **ร่างเพื่อรีวิว — ยังไม่ลงมือ** (อัปเดต 2026-07-11 รอบ 2 — ตัด SCENT ออก, เพิ่มลำดับชั้นลูกค้า)

---

## 0. โจทย์จากผู้ใช้ + การตีความ

1. **Deal** = การรับลีด/หาลูกค้าเข้ามา เพื่อวาง FC วางแผน
2. **ประเภทดีล** (นิยามจากผู้ใช้ รอบ 2+3):
   - **NPD** = พัฒนา**สินค้าใหม่** + สั่งผลิตครั้งแรก — ครอบทั้ง **กลิ่นใหม่** (พัฒนากลิ่นด้วย)
     และ **กลิ่นเดิม** (เอากลิ่นที่มีอยู่มาทำสินค้าใหม่) — เส้นแบ่งคือ "สินค้าใหม่" ไม่ใช่ "กลิ่นใหม่"
   - **RE-ORDER** = สั่งผลิต**สินค้าเดิม**ที่พัฒนาไปแล้วซ้ำ (จำนวนเดิมหรือไม่เดิมก็ได้)
3. **ลูกค้า 1 ราย มีได้หลายโครงการ** · **โครงการ 1 อันมีได้หลายดีล** — หน้าโครงการต้องเห็น:
   **มูลค่าโครงการ · FC · AT (ยอดจริง) · สถานะงาน · ข้อมูลอัปเดต/ติดตาม** และเชื่อมระบบอื่นใน ecosystem เดียว

**ข้อสรุปการวางประเภท (แนะนำ):**

- ใช้ **2 ประเภท: `NPD` / `RE-ORDER`** — ไม่มี `SCENT` เป็นประเภทดีลแยก เพราะ "พัฒนากลิ่น"
  เป็น**เฟส optional ภายใน NPD**: [`NPD_TEMPLATE`](src/lib/pm/templates.js) มี Phase 2
  "พัฒนาสูตร/ออกแบบกลิ่น" + Phase 3 "Mock-up" ครบ (ส่งกลิ่น/Confirm กลิ่น) แล้วต่อด้วยผลิต
- **NPD มี 2 รูปแบบย่อย (ไม่ใช่ประเภทแยก): กลิ่นใหม่ / กลิ่นเดิม** — เก็บเป็น attribute เบา ๆ
  `metadata.scentSource` = `'new' | 'existing'` บนดีล NPD (toggle ตอนสร้างดีล, default `new`)
  → ตอนสร้างโครงการ ถ้า `existing` ให้ gen timeline โดย**ตัดขั้น Phase 2 (ออกแบบกลิ่น) ออก**
  (Phase 3 Mock-up ยังอยู่ — ต้องขึ้นต้นแบบสินค้าใหม่เสมอ); task เป็น draft ให้ PM ปรับ/ยืนยันอยู่แล้ว
  ไม่ทำเป็นคอลัมน์จนกว่าจะต้องรายงานแยกมิตินี้จริง
- enum เปิดขยายได้: ถ้าวันหน้ามีธุรกิจ "ขายกลิ่นอย่างเดียว ไม่ผลิตสินค้า" ค่อยเพิ่มค่า `SCENT`
  ทีหลัง (แก้ CHECK 1 บรรทัด + template ใหม่) — ไม่ต้องออกแบบเผื่อวันนี้
- **`dealType` ตรงกับ `projects.type` ที่มีอยู่แล้ว 1:1** (NPD/RE-ORDER) → ไม่ต้องมี mapping layer

---

## 1. โมเดลใหม่ — ลำดับชั้น 3 ระดับ + กติกาก่อตั้งโครงการ

```
ลูกค้า (customers) ──< โครงการ (projects) ──< ดีล (sales_deals)
        1:N (มีแล้ว 0008)         1:N (แผนนี้ — ดรอป unique 0064)

ตัวอย่าง: ลูกค้า Y
 ├─ โครงการ "น้ำหอม A"                     ← เกิดจากดีล NPD
 │    ├─ ดีล NPD  (won)   ← ก่อตั้งโครงการ: พัฒนากลิ่น+สินค้า+ผลิตครั้งแรก
 │    ├─ ดีล RE-ORDER #1 (won)   ← สั่งซ้ำรอบ 2
 │    └─ ดีล RE-ORDER #2 (open, FC ส.ค.)  ← pipeline ของโครงการ
 └─ โครงการ "สเปรย์ B"
      └─ ดีล NPD (quotation)
```

**กติกาความสัมพันธ์ (invariant):**

| กติกา | บังคับที่ |
|---|---|
| โครงการมีดีล **NPD ได้ไม่เกิน 1** (ดีลก่อตั้ง) | partial unique index (ดู §3) + validate ใน API |
| ดีล NPD → **สร้างโครงการใหม่เสมอ** (1 NPD = 1 โครงการ) | `create-project` (flow เดิม) |
| ดีล RE-ORDER → **ผูกโครงการเดิมเสมอ** (สินค้าพัฒนาแล้ว) | `link-project` ใหม่ + default จับคู่จาก FG |
| สินค้าเก่าก่อนมีระบบ (ไม่มีดีล NPD ในระบบ) → สร้าง "โครงการ legacy" ได้โดยไม่มี NPD | ทางเดิมของ Sahamit PO `create-project` (มีอยู่แล้ว) |
| ดีลกับโครงการต้องลูกค้าเดียวกัน | validate ทุก link/unlink + audit |

**สิ่งที่ *ไม่* เปลี่ยน:** โมเดล 2 ชั้นตาม roadmap (deal เกิดก่อน project ได้, lead ไม่บังคับมี project),
`markWon()` per-deal, boundary "อ่านข้ามได้ ห้าม write ข้ามโมดูล", ระบบ timeline/tasks ของ PM,
`projects.type` + template NPD/RE-ORDER เดิม

**สิ่งที่เปลี่ยน:**

| เรื่อง | เดิม | ใหม่ |
|---|---|---|
| deal → project | 1:1 (unique index) | **N:1** — NPD ≤1 + RE-ORDER 0..N ต่อโครงการ |
| ประเภทดีล | `metadata.projectType` (jsonb) | คอลัมน์จริง `dealType` CHECK (`NPD`,`RE-ORDER`) |
| back-pointer `projects.metadata.salesDealId` | ค่าเดียว = ดีลเจ้าของ | เลิกเป็น source of truth → reverse query `deals WHERE projectId=…` |
| หน้าโครงการ (PM) | โชว์ dealId/dealStage เดียว | แผง **"ดีลในโครงการ"** + KPI rollup (มูลค่า/FC/AT) |
| ทางผูกดีลเข้าโครงการ | สร้างใหม่เท่านั้น (`create-project`) | NPD=สร้างใหม่ · RE-ORDER=**ผูกโครงการเดิม** (`link-project`) |
| Sahamit PO → project | 1 PO = 1 project เสมอ (unique 0068) | สร้างใหม่ (legacy) หรือ **แนบเข้าโครงการเดิม** (ดรอป unique, ยัง idempotent per-PO) |
| มุมมองลูกค้า | — | Customer 360: โครงการทุกอันของลูกค้า + rollup รวม (เฟส 4) |

---

## 2. Ground truth (ตรวจกับโค้ด 2026-07-11)

- migration สูงสุด = **0087** (มีเลขซ้ำ `0087_personal_tasks_proxy_worker` + `0087_sales_history`) → แผนนี้จองเลข **0088+** และเช็กชนตอน merge
- **ลูกค้า 1:N โครงการ มีอยู่แล้ว**: `projects.customerId` FK → customers ตั้งแต่
  [`0008_pm_projects.sql:14`](supabase/migrations/0008_pm_projects.sql) + index — เหลือแค่ทำหน้ารวม (เฟส 4)
- unique 1:1 อยู่ที่ [`0064_sales_pm_link.sql:22`](supabase/migrations/0064_sales_pm_link.sql) (`sales_deals_project_id_uidx`) — มี plain index ซ้อนอยู่แล้ว (บรรทัด 42)
- `PROJECT_TYPES = ['NPD','RE-ORDER']` + `normalizeProjectType()` ใน [`salesPlanning.js:148`](src/lib/salesPlanning.js) — เก็บใน `sales_deals.metadata.projectType` แล้ว passthrough เป็น `projects.type` (เลือก PM template) → **enum ตรงกับที่ผู้ใช้ต้องการอยู่แล้ว** แค่ยกจาก jsonb เป็นคอลัมน์
- PM template: [`NPD_TEMPLATE`](src/lib/pm/templates.js) ครอบ พัฒนากลิ่น→Mock-up→เตรียมผลิต→ผลิต→ส่งมอบ;
  `REORDER_TEMPLATE` = เตรียมผลิต→ผลิต→ส่งมอบ (ไม่มีขึ้นทะเบียนสรรพสามิต — ขึ้นแล้วตอน NPD) → **ตรงนิยามใหม่ ไม่ต้องแก้ template**
- จุดที่ assume 1:1 (พังถ้ามี 2 ดีล/โครงการ):
  - [`api/pm/projects/[id]/route.js:53`](src/app/api/pm/projects/[id]/route.js) — GET ดึงดีลด้วย `.maybeSingle()` → **PGRST116 error ทั้งหน้า** เมื่อเจอ 2 แถว
  - เดียวกัน `:186` title sync (จะทับชื่อทุกดีล) และ `:211` delete guard (`.maybeSingle()` พัง/หลุดดีลเกิน)
  - [`deals/[id]/create-project/route.js:29`](src/app/api/sales-planning/deals/[id]/create-project/route.js) — กันดีลที่มี `projectId` แล้ว (ยังถูกสำหรับ NPD แต่ RE-ORDER ต้องมีทาง link)
  - filter `!d.projectId` ใน [`salesPlanningForecast.js`](src/lib/salesPlanningForecast.js) (49,342,422) — ตัดดีลที่ผูกโครงการแล้วออกจากการจับคู่ PO
  - `projects.metadata.salesDealId` ถูก copy ไป excise ([`from-project/route.js:96`](src/app/api/excise-registrations/from-project/route.js)) + shipment-prep (`:110`) → กำกวมเมื่อมีหลายดีล
- มูลค่า: dashboard ([`api/sales-planning/dashboard/route.js`](src/app/api/sales-planning/dashboard/route.js)) รวม **per-deal** อยู่แล้ว (`wonAmt = wonValue ?? projectValue`, FC = `projectValue` ของดีลเปิด) → หลายดีล/โครงการ **ไม่ double-count** ตราบใดที่มูลค่าแต่ละดีล = ยอดขายรอบนั้นจริง ๆ
- Sahamit: `sahamit_pos.projectId` unique ([`0068`](supabase/migrations/0068_sahamit_po_project_link.sql)) + `salesDealId` ([`0073`](supabase/migrations/0073_sahamit_po_sales_deal_link.sql)); settle ระดับ line สร้าง won-deal stub ได้หลายดีลต่อ PO อยู่แล้ว (hardcode `'RE-ORDER'` — ถูกต้องตามโมเดลใหม่)

---

## 3. Schema (migrations จองเลข 0088+ — จริงตอน merge)

### 0088 — `sales_deal_type`
```sql
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "dealType" text NOT NULL DEFAULT 'NPD'
  CHECK ("dealType" IN ('NPD','RE-ORDER'));

-- backfill จาก metadata.projectType (มีค่า NPD/RE-ORDER อยู่แล้ว)
UPDATE public.sales_deals
  SET "dealType" = CASE WHEN metadata->>'projectType' = 'RE-ORDER' THEN 'RE-ORDER' ELSE 'NPD' END
  WHERE metadata ? 'projectType';

CREATE INDEX IF NOT EXISTS sales_deals_type_idx ON public.sales_deals ("dealType");
```
- `metadata.projectType` คงเขียนคู่ไว้ 1 เฟส (transition) แล้วค่อยเลิก
- `dealType` ใช้ค่าเดียวกับ `projects.type` → passthrough ตรง ๆ ตอนสร้างโครงการ (ไม่มี mapping)

### 0089 — `deal_project_many`
```sql
DROP INDEX IF EXISTS public.sales_deals_project_id_uidx;

-- invariant ใหม่: โครงการหนึ่งมีดีลก่อตั้ง (NPD) ได้ไม่เกิน 1 — RE-ORDER ผูกได้ไม่จำกัด
CREATE UNIQUE INDEX IF NOT EXISTS sales_deals_project_npd_uidx
  ON public.sales_deals ("projectId")
  WHERE "projectId" IS NOT NULL AND "dealType" = 'NPD';
-- plain index sales_deals_project_id_idx มีอยู่แล้ว (0064)
```

### 0090 — `sahamit_po_project_many` (เฟส 3)
```sql
DROP INDEX IF EXISTS public.sahamit_pos_project_id_uidx;
CREATE INDEX IF NOT EXISTS sahamit_pos_project_id_idx ON public.sahamit_pos ("projectId");
```
- idempotency ต่อ PO ยังอยู่: `create-project` ใช้ `.is('projectId', null)` guard ต่อ PO เหมือนเดิม

> DDL รันมือบน Supabase SQL Editor ก่อน deploy + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow)
> ลำดับ 0089: **deploy โค้ดที่อ่านดีลเป็น list ก่อน** แล้วค่อยรัน DDL (ดู §8)

---

## 4. กติกามูลค่า / FC / AT (single source)

helper ใหม่ **`src/lib/sales/projectRollup.js`** (pure + unit test) — ใช้ทั้งหน้า PM / Sales / Customer 360:

```
rollupDeals(deals[]) → {
  at:        Σ wonAmt(deal)       ของดีล stage=won            // ยอดจริง
  fc:        Σ projectValue        ของดีลเปิด (ไม่ lost/won)   // pipeline
  fcWeighted:Σ projectValue×prob%  ของดีลเปิด                  // อ้างอิง
  total:     at + fc                                           // "มูลค่าโครงการ"
  byType:    { NPD: {...}, 'RE-ORDER': {...} }
  counts:    { open, won, lost }
  nextForecastMonth: min(forecastMonth ของดีลเปิด)
}
```

- `wonAmt` reuse นิยามเดิมของ dashboard (`wonValue ?? projectValue ?? 0`) — **ห้ามนิยามซ้ำ**:
  ย้าย/export จาก dashboard route มาไว้ที่ helper แล้วให้ dashboard เรียกใช้
- ระดับลูกค้า (Customer 360): rollup เดียวกัน ป้อนดีลทุกโครงการของลูกค้า → มูลค่ารวมต่อลูกค้า
- dashboard รวม per-deal เหมือนเดิม (ไม่เปลี่ยนสูตรรวมบริษัท/ทีม) — เพิ่มมิติ **แยกตาม dealType**
  (NPD = งานพัฒนาใหม่ vs RE-ORDER = ฐานรายได้ซ้ำ — คนละความหมายทางธุรกิจ)

---

## 5. เฟสการทำ

### เฟส 1 · ประเภทดีล (dealType) — เล็ก จบในตัว ★ เริ่มก่อน
- migration 0088 + backfill
- [`salesPlanning.js`](src/lib/salesPlanning.js): `DEAL_TYPES = ['NPD','RE-ORDER']` + labels ไทย
  (พัฒนาสินค้าใหม่ / สั่งผลิตซ้ำ) — reuse `PROJECT_TYPES` เดิมได้เลย (ค่าตรงกัน)
- API deals CRUD อ่าน/เขียน `dealType` (คู่กับ `metadata.projectType` ชั่วคราว)
- UI: dropdown ประเภทตอนสร้าง/แก้ดีล + badge สี 2 ประเภทใน pipeline/ตาราง + filter ตามประเภท
- ดีล NPD: toggle "กลิ่นใหม่ / กลิ่นเดิม" → `metadata.scentSource` (default `new`);
  ตอน `create-project` ส่งต่อให้ template gen ตัดขั้น Phase 2 เมื่อ `existing` (โค้ด gen อยู่เฟส 2 ได้ถ้าสะดวกกว่า)
- สาย Sahamit ที่ hardcode `'RE-ORDER'` ([`salesPlanningForecast.js:396,446`](src/lib/salesPlanningForecast.js),
  [`create-sales-deal/route.js:134`](src/app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js)) → เขียนลง `dealType` ด้วย
- dashboard: การ์ด/กราฟแยกตามประเภท (FC·AT per type)
- **ไม่แตะ cardinality — เสี่ยงต่ำมาก**

### เฟส 2 · โครงการมีหลายดีล (แกนหลัก)
1. **ฝั่ง PM อ่านเป็น list ก่อน** — แก้จุด `.maybeSingle()` ทั้ง 3:
   - project GET → `deals: [{id, title, stage, dealType, projectValue, wonValue, forecastMonth}]`
     (คง `dealId`/`dealStage` = ดีล NPD ก่อตั้ง หรือดีล active ล่าสุด ไว้ 1 เฟส เพื่อ backward compat)
   - delete guard → เช็ก `count > 0` (โครงการลบไม่ได้ถ้ามีดีลผูก — ทุกดีล ไม่ใช่ดีลเดียว)
   - **เลิก title sync สองทาง** (ชื่อดีล ≠ ชื่อโครงการอีกต่อไป เมื่อมีหลายดีล)
2. deploy ข้อ 1 → รัน migration 0089 บน prod (ดรอป unique + partial unique NPD)
3. **action ผูกดีลเข้าโครงการเดิม**: `POST /api/sales-planning/deals/[id]/link-project {projectId}`
   - เฉพาะดีล `RE-ORDER` (NPD ใช้ `create-project` เดิม — partial unique กันซ้ำอีกชั้น)
   - validate: ลูกค้าเดียวกัน + สิทธิ์ scope เดิม + `recordAudit`
   - default แนะนำโครงการ: จับคู่จาก FG ของดีล (`metadata.fgCodes` / forecast lines) กับ `project_products`
   - `create-project` เดิม: อุดบั๊กดันดีลถอยหลัง stage พร้อมกัน (finding #7 ใน SALES_DEAL_HUB_PLAN)
4. **back-pointer**: เลิกอ่าน `projects.metadata.salesDealId` เป็น source of truth —
   excise `from-project` + shipment-prep รับ `dealId` ตรง ๆ จากผู้เรียก
   fallback: โครงการมีดีลเดียวใช้ดีลนั้น, มีหลายดีลให้ผู้ใช้เลือก
5. UI หน้าโครงการ PM: แผง **"ดีลในโครงการ"** (ตาราง: ประเภท/สถานะ/มูลค่า/FC เดือน) +
   แถว KPI rollup (มูลค่ารวม · FC · AT · #ดีล) จาก `projectRollup.js` — reuse `KpiCard` + module overview pattern
6. UI หน้าดีล: การ์ด PM เดิมเพิ่ม "ดีลอื่นในโครงการเดียวกัน" (ลิงก์ข้าม); ดีล RE-ORDER โชว์ปุ่ม
   "ผูกกับโครงการเดิม" แทน "สร้างโครงการ"

### เฟส 3 · RE-ORDER เข้าโครงการเดิม (สาย Sahamit)
- migration 0090 (หลาย PO → โครงการเดียว)
- `sahamit/po/[id]/create-project`: dialog เดิมเพิ่มตัวเลือก **"แนบเข้าโครงการเดิมของลูกค้า"**
  (default = โครงการที่ FG ตรงกัน ถ้าเจอ; ไม่เจอ → สร้างโครงการ legacy แบบเดิม)
  — PO ที่แนบ = won-deal stub `dealType='RE-ORDER'` ผูก `projectId` เดิม; กันซ้ำต่อ PO ด้วย guard เดิม
- ปลด filter `!d.projectId` ใน PO-matching ([`salesPlanningForecast.js`](src/lib/salesPlanningForecast.js)):
  ดีลที่ผูกโครงการแล้วแต่ยังเปิดอยู่ ต้องยังจับคู่ PO ได้ (เงื่อนไขใหม่ = stage เปิด ไม่ใช่ "ไม่มีโครงการ")
- timeline: การแนบ PO เข้าโครงการเดิม **ไม่ rebuild timeline อัตโนมัติ** — เพิ่ม task ชุด
  `REORDER_TEMPLATE` ต่อท้ายแบบ draft ให้ PM กดยืนยัน (memory: pm-task-draft-confirm + timeline forward-only)

### เฟส 4 · Project 360 + Customer 360 — อัปเดต/ติดตาม/เชื่อมระบบ
- หน้าโครงการ: **feed รวม** = `sales_deal_activities` ของทุกดีล + stage history + งาน PM ที่เพิ่งเสร็จ
  (อ่านอย่างเดียว, ลิงก์กลับไปเขียนที่หน้าเจ้าของ — ตาม boundary)
- แผงเชื่อมระบบระดับโครงการ: ทะเบียนสรรพสามิต (ราย FG) · shipment-prep · PO Sahamit ทุกใบ ·
  ใบเสนอราคาของทุกดีล — reuse การ์ด routing จาก Deal Hub
- **Customer 360 (light)**: หน้าลูกค้า (master เดิม) เพิ่มแท็บ "โครงการ" — list โครงการทุกอัน +
  rollup ต่อโครงการ + รวมทั้งลูกค้า (reuse `projectRollup.js`; ไม่มี migration — `projects.customerId` มีแล้ว)
- dashboard Sales: drill-down ระดับโครงการ (มูลค่ารวมต่อโครงการ, top projects / top customers)

---

## 6. จุดที่ต้องแก้ (impact checklist ฝั่งโค้ด)

| ไฟล์ | บรรทัด | ต้องทำ | เฟส |
|---|---|---|---|
| `api/pm/projects/[id]/route.js` | 53, 186, 211 | maybeSingle→list · เลิก title sync · delete guard นับทุกดีล | 2 |
| `deals/[id]/create-project/route.js` | 29, 137 | จำกัดเป็นทางของ NPD · อุดบั๊ก stage ถอยหลัง · ส่ง scentSource ให้ template gen | 2 |
| `lib/pm/templates.js` + จุด gen timeline | 8–50 | NPD กลิ่นเดิม: ตัดขั้น Phase 2 (ปรับ dependsOnSteps ของ step ที่อ้าง 17) | 2 |
| `deals/[id]/link-project/route.js` | ใหม่ | action ผูก RE-ORDER เข้าโครงการเดิม | 2 |
| `salesPlanningWin.js` | 12, 40 | winPatch ไม่ทับ `projectId` ที่ผูกอยู่ | 2 |
| `salesPlanningForecast.js` | 49, 342, 396, 422, 446 | filter เปิด≠ไม่มีโครงการ · เขียน dealType | 1, 3 |
| `deals/[id]/overview/route.js` | 38–56 | เพิ่ม sibling deals ของโครงการเดียวกัน | 2 |
| `deals/[id]/page.js` | 484–742, 1024 | dropdown dealType · การ์ดดีลร่วมโครงการ · ปุ่ม link-project | 1, 2 |
| `deals/page.js` | 108, 243, 461, 559 | badge/filter dealType (เลิกอ่าน metadata) | 1 |
| `api/sales-planning/dashboard/route.js` | 15–149 | มิติ byType · ย้าย `wonAmt` เข้า helper | 1 |
| `lib/sales/projectRollup.js` | ใหม่ | rollup กลาง (AT/FC/total/byType) + unit test | 2 |
| `excise-registrations/from-project/route.js` | 96 | รับ `dealId` ตรง (เลิกพึ่ง metadata.salesDealId) | 2 |
| `pm/projects/[id]/shipment-prep/route.js` | 110 | เดียวกัน | 2 |
| `sahamit/po/[id]/create-project/route.js` | 49–51, 87, 167, 204 | ตัวเลือกแนบโครงการเดิม (default จับคู่ FG) | 3 |
| `pm/projects/[id]/page.js` | — | แผงดีล + KPI rollup | 2 |
| หน้าลูกค้า (master) | — | แท็บโครงการ + rollup | 4 |

---

## 7. Open decisions (ขอมติก่อนลงมือเฟสนั้น)

1. **มีธุรกิจ "ขายกลิ่นอย่างเดียว" (ไม่ผลิตสินค้า) ไหม?** — ถ้ามี ค่อยเพิ่ม `SCENT` เป็นประเภทที่ 3
   ภายหลัง (enum ขยายได้ 1 บรรทัด + ต้องมี template งานกลิ่นแยก) — แผนนี้ยังไม่ทำ
2. **RE-ORDER บังคับผูกโครงการตอนไหน** — เสนอ: บังคับตอน **won** อย่างช้าที่สุด
   (สร้างดีล RE-ORDER ลอย ๆ เพื่อวาง FC ได้ แต่ปิด Won ต้องระบุโครงการ); ทางเลือก: บังคับตั้งแต่สร้าง
3. **`dealId`/`dealStage` เดิมใน project GET** — คงไว้กี่เฟสก่อนตัด (เสนอ: คง 1 เฟส = ดีล NPD ก่อตั้ง)
4. **โครงการ legacy (ไม่มีดีล NPD)** — ให้สร้างจากหน้า PM ตรง ๆ ได้ด้วยไหม (วันนี้เกิดได้จาก
   Sahamit PO เท่านั้น) — เสนอ: ได้ เพื่อรองรับสินค้าเก่าที่จะมี RE-ORDER เข้ามา
5. **ผูกดีลข้ามลูกค้า** — เสนอ: ห้ามเด็ดขาด (validate customer ตรงกัน) ไม่มี override

---

## 8. ความเสี่ยง + การกัน

| ความเสี่ยง | การกัน |
|---|---|
| ดรอป unique แล้วโค้ดเก่า (`maybeSingle`) พังก่อนแก้ครบ | **ลำดับบังคับ**: แก้โค้ดอ่านเป็น list + deploy ก่อน แล้วค่อยรัน 0089 บน prod |
| มูลค่า double-count (ดีลใหญ่ถูกซอยเป็นหลายดีล) | กติกา: `projectValue` ของดีล = ยอดขายรอบนั้นเท่านั้น; rollup รวมจากดีลเสมอ ไม่กรอกมูลค่าที่โครงการ |
| โครงการมี NPD ซ้อน 2 ดีล | partial unique index (0089) + validate ใน create-project/link-project |
| `metadata.salesDealId` ค้าง/ชี้ผิดดีล | เฟส 2 เลิกอ่านเป็น truth ทุกจุด (grep ยืนยันเหลือ 0 จุดก่อนปิดเฟส) |
| ดีลผูกผิดโครงการ (คนละลูกค้า) | validate customer match + audit ทุก link/unlink |
| RE-ORDER จับคู่โครงการผิด (FG ซ้ำหลายโครงการ) | default = แนะนำเท่านั้น ผู้ใช้ยืนยันใน dialog เสมอ |
| PO-matching เปิดกว้างขึ้นแล้วจับคู่มั่ว | เงื่อนไขใหม่จำกัด: stage เปิด + ลูกค้า/FG ตรง เหมือน logic คัดกรองเดิม |
| เลข migration ชน (0087 ซ้ำอยู่แล้ว) | จองเลขจริงตอนใกล้ merge + ตรวจ `ls supabase/migrations` ก่อน |
| timeline เพี้ยนเมื่อแนบ RE-ORDER เข้าโครงการเดิม | task ชุดใหม่เป็น draft ต้องยืนยัน + forward-only anchor เดิม |

---

## 9. แผนทดสอบ (ต่อเฟส)

- เฟส 1: lint+build+`node --test`; สร้างดีล 2 ประเภท → badge/filter/dashboard แยกถูก; ดีลเก่า backfill ตรง `metadata.projectType` เดิม
- เฟส 2: ดีล NPD กลิ่นเดิม → สร้างโครงการ → timeline ไม่มีขั้นออกแบบกลิ่น แต่ยังมี Mock-up;
  ดีล NPD สร้างโครงการ → ดีล RE-ORDER (ลูกค้าเดียวกัน) link เข้าโครงการเดียวกัน →
  หน้าโครงการโชว์ 2 ดีล + rollup ถูก (AT=won, FC=open); สร้าง NPD ตัวที่ 2 ผูกโครงการเดิม → ถูกกัน;
  ลบโครงการถูกกันเมื่อมีดีล; excise/shipment ระบุดีลถูกตัว
- เฟส 3: PO ใหม่ของลูกค้าเดิม → default เจอโครงการ FG ตรง → แนบ → เกิด won-deal RE-ORDER ในโครงการ + task draft; PO เดิมกดซ้ำไม่สร้างซ้ำ
- เฟส 4: feed รวมเรียงเวลาถูก; หน้าลูกค้าเห็นทุกโครงการ + มูลค่ารวมตรงกับผลรวมโครงการ
