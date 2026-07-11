# Deal–Project Restructure — ลูกค้า › โครงการ › ดีล (SCENT / NPD / RE-ORDER)

> แผนปรับโครงสร้างความสัมพันธ์ **deal ↔ project** จาก 1:1 เป็น **หลายดีลต่อ 1 โครงการ**
> พร้อมยก "ประเภทดีล" เป็นฟิลด์จริง เข้าชุดกับ [`SALES_PM_ROADMAP.md`](SALES_PM_ROADMAP.md)
> (โมเดล 2 ชั้น deal=commercial / project=execution — **ยังคงเดิม** แค่เปลี่ยน cardinality)
>
> สถานะ: **มติครบ — พร้อมเริ่มเฟส 1** (อัปเดต 2026-07-11 รอบ 6 — เพิ่มแผน IA: เมนู/URL/ชื่อเรียกใน UI §5)
>
> **2026-07-12: เอกสารนี้ถูกยกเป็นเฟส A–B ของแผนแม่บท [`SALES_REVAMP_PLAN.md`](SALES_REVAMP_PLAN.md)**
> (รื้อระบบบริหารงานขายทั้งเส้น Lead → ปิดโครงการ) — มติ/รายละเอียดในนี้ยังใช้ทั้งหมด

---

## 0. โจทย์จากผู้ใช้ + มติประเภทดีล (ล็อกแล้ว รอบ 3)

1. **Deal** = การรับลีด/หาลูกค้าเข้ามา เพื่อวาง FC วางแผน — **แยกประเภทตั้งแต่ต้นทางเพื่อเก็บข้อมูล**:
   - **SCENT** = พัฒนากลิ่น (งานออกแบบ/ขายกลิ่น)
   - **NPD** = พัฒนาสินค้า (Mock-up → ผลิตครั้งแรก → ส่งมอบ)
   - **RE-ORDER** = สั่งผลิตสินค้าเดิมซ้ำ (จำนวนเดิมหรือไม่เดิมก็ได้)
2. **โครงการ = เอาดีลมารวม** — ลูกค้า 1 ราย มีหลายโครงการ · โครงการ 1 อันมีหลายดีล
   หน้าโครงการเห็น: **มูลค่าโครงการ · FC · AT · สถานะงาน · อัปเดต/ติดตาม** + เชื่อมระบบอื่นใน ecosystem เดียว

**ทำไม 3 ประเภทถึงถูกต้อง (ยืนยันจากโค้ดเดิม):** งานออกแบบกลิ่นมี **รายได้ของตัวเอง** อยู่แล้ว —
[`NPD_TEMPLATE`](src/lib/pm/templates.js) มี "ใบเสนอราคาออกแบบกลิ่น / สัญญาออกแบบกลิ่น /
ใบสั่งขายออกแบบกลิ่น" (steps 2–4) แยกจาก "ใบเสนอราคาผลิต / สัญญาจ้างผลิต" (steps 26–27)
→ เป็นการขาย 2 ก้อนจริง ๆ ควรเป็น 2 ดีล มี FC/AT แยกกันตั้งแต่ต้น

**ผลพลอยได้:** เคส "กลิ่นเดิม + สินค้าใหม่" ไม่ต้องมี toggle พิเศษอีกต่อไป (ตัด `scentSource`
ของแผนรอบ 2 ทิ้ง) — โครงการที่ใช้กลิ่นเดิมก็แค่**ไม่มีดีล SCENT** เริ่มที่ดีล NPD เลย

---

## 1. โมเดลใหม่ — ลำดับชั้น 3 ระดับ + โครงการเป็นภาชนะรวมดีล

```
ลูกค้า (customers) ──< โครงการ (projects) ──< ดีล (sales_deals)
        1:N (มีแล้ว 0008)         1:N (แผนนี้ — ดรอป unique 0064)

ตัวอย่าง: ลูกค้า Y
 ├─ โครงการ "น้ำหอม A"  (วงจรเต็ม)
 │    ├─ ดีล SCENT     (won)  ← พัฒนากลิ่น (มีสัญญาออกแบบ+มูลค่าของตัวเอง)
 │    ├─ ดีล NPD       (won)  ← พัฒนาสินค้า+ผลิตครั้งแรก
 │    ├─ ดีล RE-ORDER #1 (won)   ← ยอดจริง (AT)
 │    └─ ดีล RE-ORDER #2 (open)  ← pipeline (FC เดือนหน้า)
 └─ โครงการ "สเปรย์ B"  (กลิ่นเดิม → ไม่มีดีล SCENT)
      └─ ดีล NPD (quotation)
```

**กลไกเดียวรวมทุกประเภท:** ดีลแรกของโครงการ (ประเภทใดก็ได้) = **ดีลก่อตั้ง** → สร้างโครงการ +
gen task ชุดตาม template ของประเภทนั้น; ดีลถัดไป**ผูกโครงการเดิม** → **ต่อท้าย task ชุดของประเภทตัวเอง
แบบ draft** ให้ PM ยืนยัน (memory: pm-task-draft-confirm) — SCENT→NPD→RE-ORDER ใช้กลไกเดียวกันหมด

**ไทม์ไลน์ (มติผู้ใช้ รอบ 4): แยกไทม์ไลน์ต่อดีล แล้วรวมที่โครงการ**

- ทุก task ติดป้าย **`project_tasks.dealId`** → 1 ดีล = 1 **segment** ของไทม์ไลน์
  (SCENT / NPD / RE-ORDER แต่ละใบมีเส้นของตัวเอง)
- **anchor แยกต่อ segment**: SCENT เริ่มจากวันเริ่มดีล · NPD เริ่มจากวันยืนยันพัฒนาสินค้า ·
  RE-ORDER เริ่มจากวันได้ PO — forward-only ต่อ segment (กติกา anchor เดิม ใช้ระดับ segment แทนระดับโครงการ)
- **มุมมองดีล** = ไทม์ไลน์เฉพาะ segment ตัวเอง + สถานะดีลคำนวณจาก task ชุดตัวเอง (reuse `getComputedStatus` กับ subset)
- **มุมมองโครงการ** = Gantt รวมทุก segment (swimlane ต่อดีล, สีตามประเภท) — เห็นทั้งเส้นชีวิตโครงการ
- **จำเป็นเชิงเทคนิคด้วย ไม่ใช่แค่ UX**: regen timeline ปัจจุบัน ([`schedule.js:221`](src/lib/pm/schedule.js))
  จับคู่ task เดิมด้วย**ชื่อ** — หลายดีลประเภทเดียวกันในโครงการ = ชื่อ task ชนกัน ("ผลิตสินค้า" ×2)
  → ต้อง scope การจับคู่/regen เป็น **ต่อ dealId** (key = dealId+name)

**กติกาความสัมพันธ์:**

| กติกา | บังคับที่ |
|---|---|
| 1 ดีล ผูกได้ 1 โครงการเดียว (ไม่ย้ายเอง) | `create-project`/`link-project` guard ต่อดีล (เดิม) |
| ดีลกับโครงการต้องลูกค้าเดียวกัน | validate ทุก link + `recordAudit` |
| ลำดับแนะนำ SCENT→NPD→RE-ORDER | **UI guidance เท่านั้น** ไม่ล็อกที่ DB (ดู open decision #2) |
| RE-ORDER ต้องผูกโครงการเดิมอย่างช้าตอน won | validate ใน `markWon` (open decision #3) |
| โครงการ legacy (สินค้าเก่าก่อนมีระบบ) เริ่มที่ RE-ORDER ได้ | ทางเดิมของ Sahamit PO (มีอยู่แล้ว) |

**สิ่งที่ *ไม่* เปลี่ยน:** โมเดล 2 ชั้นตาม roadmap (deal เกิดก่อน project ได้, lead ไม่บังคับมี project),
`markWon()` per-deal (win = confirmed + deposit ทุกประเภท), boundary "อ่านข้ามได้ ห้าม write ข้ามโมดูล",
ระบบ timeline/tasks/revisions ของ PM

**สิ่งที่เปลี่ยน:**

| เรื่อง | เดิม | ใหม่ |
|---|---|---|
| deal → project | 1:1 (unique index) | **N:1** — หลายดีลรวมในโครงการเดียว |
| ประเภทดีล | `metadata.projectType` (jsonb, NPD/RE-ORDER) | คอลัมน์จริง `dealType` CHECK (`SCENT`,`NPD`,`RE-ORDER`) |
| template PM | NPD_TEMPLATE เส้นเต็ม (กลิ่น+สินค้า+ผลิต) | **แยกเป็น 3**: SCENT (Phase 1–2 เดิม) · NPD (Mock-up→ส่งมอบ) · RE-ORDER (เดิม) |
| `projects.type` | CHECK (NPD, RE-ORDER) | + `SCENT` (= ประเภทดีลก่อตั้ง; ใช้เลือก template ชุดแรก) |
| back-pointer `projects.metadata.salesDealId` | ค่าเดียว = ดีลเจ้าของ | เลิกเป็น source of truth → reverse query |
| หน้าโครงการ (PM) | โชว์ dealId/dealStage เดียว | แผง **"ดีลในโครงการ"** + KPI rollup (มูลค่า/FC/AT/byType) |
| ทางผูกดีลเข้าโครงการ | สร้างใหม่เท่านั้น | สร้างใหม่ (ดีลก่อตั้ง) หรือ **ผูกโครงการเดิม** (`link-project` + ต่อ task draft) |
| ไทม์ไลน์ | 1 เส้นต่อโครงการ (anchor เดียว) | **1 segment ต่อดีล** (`project_tasks.dealId`, anchor แยก) → รวมเป็น Gantt swimlane ที่โครงการ |
| Sahamit PO → project | 1 PO = 1 project เสมอ (unique 0068) | สร้างใหม่ (legacy) หรือ **แนบเข้าโครงการเดิม** |
| มุมมองลูกค้า | — | Customer 360: โครงการทุกอันของลูกค้า + rollup รวม (เฟส 4) |

---

## 2. Ground truth (ตรวจกับโค้ด 2026-07-11)

- migration สูงสุด = **0087** (มีเลขซ้ำ `0087_personal_tasks_proxy_worker` + `0087_sales_history`) → จองเลข **0088+** และเช็กชนตอน merge
- **ลูกค้า 1:N โครงการ มีอยู่แล้ว**: `projects.customerId` FK ตั้งแต่ [`0008_pm_projects.sql:14`](supabase/migrations/0008_pm_projects.sql)
- **`projects.type` CHECK (NPD, RE-ORDER)** ที่ [`0008:17`](supabase/migrations/0008_pm_projects.sql) → ต้อง migration เพิ่ม `SCENT`
- unique 1:1 อยู่ที่ [`0064_sales_pm_link.sql:22`](supabase/migrations/0064_sales_pm_link.sql) (`sales_deals_project_id_uidx`) — มี plain index ซ้อนอยู่แล้ว (บรรทัด 42)
- `PROJECT_TYPES = ['NPD','RE-ORDER']` + `normalizeProjectType()` ใน [`salesPlanning.js:148`](src/lib/salesPlanning.js) — เก็บใน `sales_deals.metadata.projectType` แล้ว passthrough เป็น `projects.type`
- **template แยกได้สะอาด**: [`NPD_TEMPLATE`](src/lib/pm/templates.js) Phase 1–2 (steps 1–8 ขาย+ออกแบบกลิ่น)
  = ว่าที่ `SCENT_TEMPLATE`; Phase 3–6 (steps 15–47 Mock-up→ส่งมอบ รวมขึ้นทะเบียนสรรพสามิต step 31)
  = ว่าที่ `NPD_TEMPLATE` ใหม่ — ต้องแก้ `dependsOnSteps` ที่อ้างข้ามรอย (steps 25/26 อ้าง [3]/[17])
  **โครงการเก่าไม่กระทบ**: template ใช้ตอน gen เท่านั้น task ใน DB ไม่เปลี่ยน
- **`project_tasks` ยังไม่รู้จักดีล**: มีแค่ `origin` template/custom (0022) — และ regen timeline
  ([`schedule.js:221`](src/lib/pm/schedule.js)) **จับคู่ task เดิมด้วยชื่อ** → หลายดีลประเภทเดียวกัน
  ในโครงการ = ชื่อชนกัน ต้องเพิ่ม `dealId` + scope regen ต่อดีล (ไม่ใช่แค่เรื่อง UX)
- จุดที่ assume 1:1 (พังถ้ามี 2 ดีล/โครงการ):
  - [`api/pm/projects/[id]/route.js:53`](src/app/api/pm/projects/[id]/route.js) — GET ดึงดีลด้วย `.maybeSingle()` → **PGRST116 error ทั้งหน้า** เมื่อเจอ 2 แถว
  - เดียวกัน `:186` title sync (จะทับชื่อทุกดีล) และ `:211` delete guard
  - [`deals/[id]/create-project/route.js:29`](src/app/api/sales-planning/deals/[id]/create-project/route.js) — กันดีลที่มี `projectId` แล้ว (ยังถูกต่อดีล แต่ต้องเพิ่มทาง link เข้าโครงการเดิม)
  - filter `!d.projectId` ใน [`salesPlanningForecast.js`](src/lib/salesPlanningForecast.js) (49,342,422) — ตัดดีลที่ผูกโครงการแล้วออกจากการจับคู่ PO
  - `projects.metadata.salesDealId` ถูก copy ไป excise ([`from-project/route.js:96`](src/app/api/excise-registrations/from-project/route.js)) + shipment-prep (`:110`) → กำกวมเมื่อมีหลายดีล
- มูลค่า: dashboard ([`api/sales-planning/dashboard/route.js`](src/app/api/sales-planning/dashboard/route.js)) รวม **per-deal** อยู่แล้ว (`wonAmt = wonValue ?? projectValue`, FC = `projectValue` ของดีลเปิด) → หลายดีล/โครงการ **ไม่ double-count** ตราบใดที่มูลค่าแต่ละดีล = ยอดขายก้อนนั้นจริง ๆ (SCENT = ค่าออกแบบ, NPD = ยอดผลิตแรก, RE-ORDER = ยอดซ้ำ)
- Sahamit: `sahamit_pos.projectId` unique ([`0068`](supabase/migrations/0068_sahamit_po_project_link.sql)) + `salesDealId` ([`0073`](supabase/migrations/0073_sahamit_po_sales_deal_link.sql)); stub hardcode `'RE-ORDER'` — ถูกต้องตามโมเดลใหม่

---

## 3. Schema (migrations จองเลข 0088+ — จริงตอน merge)

### 0088 — `sales_deal_type`
```sql
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "dealType" text NOT NULL DEFAULT 'NPD'
  CHECK ("dealType" IN ('SCENT','NPD','RE-ORDER'));

-- backfill จาก metadata.projectType (มีแค่ NPD/RE-ORDER — ดีลเก่าไม่มี SCENT)
UPDATE public.sales_deals
  SET "dealType" = CASE WHEN metadata->>'projectType' = 'RE-ORDER' THEN 'RE-ORDER' ELSE 'NPD' END
  WHERE metadata ? 'projectType';

CREATE INDEX IF NOT EXISTS sales_deals_type_idx ON public.sales_deals ("dealType");

-- SCENT เป็น type โครงการได้ตั้งแต่เฟส 1 (มติ #1: แยก template เลย)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_type_check CHECK ("type" IN ('SCENT','NPD','RE-ORDER'));
```
- `metadata.projectType` คงเขียนคู่ไว้ 1 เฟส (transition) แล้วค่อยเลิก
- `dealType` ใช้ค่าเดียวกับ `projects.type` → passthrough ตรงตอนสร้างโครงการ (ไม่มี mapping)

### 0089 — `deal_project_many` (เฟส 2)
```sql
DROP INDEX IF EXISTS public.sales_deals_project_id_uidx;
-- plain index sales_deals_project_id_idx มีอยู่แล้ว (0064)
```
- **ไม่มี partial unique ต่อประเภท** — รองรับเคสจริง (ออกแบบกลิ่นหลายรอบ / สินค้าหลายตัวจากกลิ่นเดียว)
  คุมด้วย UI guidance + audit แทน (มติ #2)

### 0090 — `project_tasks_deal_link` (เฟส 2)
```sql
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS "dealId" text REFERENCES public.sales_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_tasks_deal_idx ON public.project_tasks ("dealId");

-- backfill: โครงการที่มีดีลผูกอยู่ (ยุค 1:1 มีได้ดีลเดียว) → task template ทั้งชุดเป็นของดีลนั้น
UPDATE public.project_tasks pt
  SET "dealId" = sd.id
  FROM public.sales_deals sd
  WHERE sd."projectId" = pt."projectId" AND pt."dealId" IS NULL;
```
- `dealId` เป็น NULL ได้ (task custom ที่ผู้ใช้เพิ่มเอง / โครงการไม่มีดีล) — task ไม่มีดีล = segment "ทั่วไป" ของโครงการ

### 0091 — `sahamit_po_project_many` (เฟส 3)
```sql
DROP INDEX IF EXISTS public.sahamit_pos_project_id_uidx;
CREATE INDEX IF NOT EXISTS sahamit_pos_project_id_idx ON public.sahamit_pos ("projectId");
```
- idempotency ต่อ PO ยังอยู่: `create-project` ใช้ `.is('projectId', null)` guard ต่อ PO เหมือนเดิม

> DDL รันมือบน Supabase SQL Editor ก่อน deploy + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow)
> ลำดับ 0089: **deploy โค้ดที่อ่านดีลเป็น list ก่อน** แล้วค่อยรัน DDL (ดู §9)

---

## 4. กติกามูลค่า / FC / AT (single source)

helper ใหม่ **`src/lib/sales/projectRollup.js`** (pure + unit test) — ใช้ทั้งหน้า PM / Sales / Customer 360.
**KPI ที่ต้องโชว์บนหน้าโครงการ (มติผู้ใช้): FC Total · Actual · FC คงเหลือ** + มูลค่ารวม:

```
rollupDeals(deals[]) → {
  fcTotal:    Σ projectValue        ของดีล won + เปิด (ไม่นับ lost)  // FC Total — แผนทั้งโครงการ
  actual:     Σ wonAmt(deal)        ของดีล stage=won                 // Actual (AT) — ยอดจริงที่ปิดได้
  fcRemaining:Σ projectValue        ของดีลเปิด                       // FC คงเหลือ — ที่ยังต้องตามปิด
  total:      actual + fcRemaining                                   // มูลค่าโครงการ (ยอดจริง+ที่เหลือ)
  fcWeighted: Σ projectValue×prob%  ของดีลเปิด                       // อ้างอิง
  byType:     { SCENT: {...}, NPD: {...}, 'RE-ORDER': {...} }        // ทุก metric แยก 3 ประเภท
  counts:     { open, won, lost }
  nextForecastMonth: min(forecastMonth ของดีลเปิด)
}
```

- หมายเหตุ: `fcTotal − actual ≠ fcRemaining` เมื่อยอดปิดจริงต่างจาก FC (`wonValue ≠ projectValue`)
  — ส่วนต่างนี้คือ variance (dashboard เดิมมี `wonVariance` แล้ว) โชว์เป็นตัวเสริมได้
- นิยามเดียวกับ dashboard เดิม (`fullForecast`/`remainingForecast`) — ย้ายมาไว้ helper แล้วให้ dashboard เรียกใช้

- `wonAmt` reuse นิยามเดิมของ dashboard (`wonValue ?? projectValue ?? 0`) — **ห้ามนิยามซ้ำ**:
  ย้าย/export จาก dashboard route มาไว้ที่ helper แล้วให้ dashboard เรียกใช้
- ระดับลูกค้า (Customer 360): rollup เดียวกัน ป้อนดีลทุกโครงการของลูกค้า → มูลค่ารวมต่อลูกค้า
- dashboard รวม per-deal เหมือนเดิม (ไม่เปลี่ยนสูตรรวมบริษัท/ทีม) — เพิ่มมิติ **แยกตาม dealType 3 ค่า**
  (SCENT = รายได้งานออกแบบ · NPD = ยอดพัฒนา+ผลิตแรก · RE-ORDER = ฐานรายได้ซ้ำ)

---

## 5. เมนู · URL · ชื่อเรียกใน UI (IA)

**ปัญหาวันนี้ (ตรวจโค้ด 2026-07-11):** คำเรียก**กลับด้าน**กับโมเดลใหม่พอดี —

- คำว่า **"โครงการ" ถูกใช้เรียก*ดีล*ทั้งระบบ**: เมนู `/sa/deals` label "โครงการ" ([`AppLayout.js:177`](src/components/AppLayout.js)),
  หน้า list "บริหารงานขาย — โครงการ", หน้าดีล "ศูนย์รวมโครงการ" ([`deals/[id]/page.js:565`](src/app/sales-planning/deals/[id]/page.js)),
  attribute "ประเภทโครงการ", KPI "มูลค่าโครงการเปิด"
- ตัว **project จริงฝั่ง PM กลับใช้ทับศัพท์ "โปรเจกต์"** ("กลับไปหน้ารวมโปรเจกต์", "แก้ไขโปรเจกต์", หัว "Timeline Project:")
- **`/sa/projects` (index) วันนี้ redirect ไป `/sa/deals`** ([`next.config.mjs:38`](next.config.mjs)) — ไม่มีหน้ารวมโครงการ
- ชื่อระบบไม่คงเส้น: "บริหารงานขาย" (hub/sidebar) vs "แผนงานขาย" (หน้า targets) + ลิงก์ legacy หลุด `/sa` 2 จุด
  ([`DealDrillDownModal.js:113`](src/components/salesPlanning/DealDrillDownModal.js), [`targets/plan/page.js:282,295`](src/app/sales-planning/targets/plan/page.js))

### คำมาตรฐาน (ล็อก)

| entity | คำที่ใช้ทุกที่ | เลิกใช้ |
|---|---|---|
| `sales_deals` | **ดีล** (+ ประเภทดีล: พัฒนากลิ่น / พัฒนาสินค้า / สั่งผลิตซ้ำ) | "โครงการ" เรียกดีล, "ประเภทโครงการ" |
| `projects` | **โครงการ** | ทับศัพท์ "โปรเจกต์", "Timeline Project" |
| ระบบ | **บริหารงานขาย** (เดียว) | "แผนงานขาย", card "จัดการโครงการ" ที่ hub |

### โครง URL + เมนู (namespace `/sa` เดิม — เพิ่ม 1 รายการ)

| เมนู (กลุ่ม บริหารงานขาย) | URL | หน้า | สถานะ |
|---|---|---|---|
| ภาพรวม | `/sa` | dashboard เดิม | คงเดิม |
| **ดีล** | `/sa/deals` | pipeline เดิม | **rename label** (เดิม "โครงการ") |
| **โครงการ** | `/sa/projects` | **หน้ารวมโครงการ (ใหม่ เฟส 2)**: ตาราง โครงการ×ลูกค้า×ประเภท + KPI FC Total/Actual/FC คงเหลือ + #ดีล | ใหม่ — ยกเลิก redirect `/sa/projects→/sa/deals` |
| วางเป้าหมาย | `/sa/targets` | เดิม | คงเดิม |
| งานของฉัน | `/sa/tasks` | เดิม | คงเดิม |

- `/sa/projects/[id]` (หน้าโครงการเดิม) คง URL — เปลี่ยนแค่หัว/ป้ายเป็น "โครงการ"
- physical folders (`sales-planning/`, `pm/`) + API paths **ไม่ย้าย** — จัดการที่ rewrite ชั้น `next.config.mjs` เท่านั้น (เสี่ยงต่ำ)
- หน้ารวมโครงการใหม่: ไฟล์จริง `src/app/pm/projects/page.js` + rewrite `/sa/projects → /pm/projects`
  (แก้ redirect เดิมบรรทัด 38, 40) — ใช้สิทธิ์ `salesplan:view` เดียวกับ deals

### งาน rename (เฟส 1 — ไม่มี migration)

| จุด | เดิม → ใหม่ |
|---|---|
| เมนู `/sa/deals` (`AppLayout.js:177`) | โครงการ → **ดีล** |
| หน้า list (`deals/page.js:397-399`) | "บริหารงานขาย — โครงการ" → "บริหารงานขาย — ดีล"; back "กลับไปภาพรวม" คง |
| หน้าดีล (`deals/[id]/page.js:565-567,685`) | "ศูนย์รวมโครงการ" → **"ศูนย์รวมดีล"**; back "กลับหน้าโครงการ" → "กลับหน้าดีล"; "งานของโครงการ" → "งานของดีล" |
| attribute ประเภท (ทุกฟอร์ม/ตาราง) | "ประเภทโครงการ" → **"ประเภทดีล"** |
| KPI ภาพรวม (`sales-planning/page.js:563`) | "มูลค่าโครงการเปิด/โครงการเปิด N" → "มูลค่าดีลเปิด/ดีลเปิด N" |
| targets (`targets/page.js:361`) | "แผนงานขาย — วางเป้าหมาย" → "บริหารงานขาย — วางเป้าหมาย" |
| PM detail (`pm/projects/[id]/page.js:925-962`) | "โปรเจกต์" ทุกจุด → "โครงการ"; "Timeline Project: {code}" → "โครงการ {code} — ไทม์ไลน์" |
| shipment-prep (`shipment-prep/page.js:64-73`) | "กลับไปโปรเจกต์/ไม่พบโปรเจกต์" → "…โครงการ" |
| hub card PM (`home/page.js:140`) | "จัดการโครงการ" → "งานโครงการ (PM)" หรือยุบรวม (การ์ดนี้เหลือเฉพาะ staff pm-only) |
| ลิงก์ legacy 2 จุด | `/sales-planning/…` → `/sa/…` (`DealDrillDownModal.js:113`, `targets/plan:282,295`) |

### งานโครงสร้าง (เฟส 2)

- หน้าใหม่ `/sa/projects` (หน้ารวมโครงการ) + เมนู "โครงการ" + แก้ rewrite/redirect ใน `next.config.mjs`
- back link ของหน้าโครงการ (`/sa/projects/[id]`) เปลี่ยนจาก `/sa/deals` → `/sa/projects` (หน้ารวมใหม่)

---

## 6. เฟสการทำ

### เฟส 1 · ประเภทดีล 3 ค่า + แยก template — SCENT ครบวงจรตั้งแต่แรก ★ เริ่มก่อน
- migration 0088 + backfill (รวม `projects.type` รับ SCENT — มติ #1)
- [`salesPlanning.js`](src/lib/salesPlanning.js): `DEAL_TYPES = ['SCENT','NPD','RE-ORDER']` + labels ไทย
  (พัฒนากลิ่น / พัฒนาสินค้า / สั่งผลิตซ้ำ) แทน `PROJECT_TYPES` (คง alias ให้โค้ดเก่า)
- **แยก template เป็น 3 ชุด (มติ #1)**: [`templates.js`](src/lib/pm/templates.js) →
  `SCENT_TEMPLATE` (steps 1–8 เดิม) · `NPD_TEMPLATE` ใหม่ (steps 15–47: Mock-up→ส่งมอบ,
  แก้ `dependsOnSteps` ที่อ้าง [3]/[17] ข้ามรอย) · `REORDER_TEMPLATE` เดิม;
  `templateFor(type)` 3 ทาง — unit test นับ step/phase/milestone ครบ; โครงการเก่าไม่กระทบ
- API deals CRUD อ่าน/เขียน `dealType` (คู่กับ `metadata.projectType` ชั่วคราว —
  หมายเหตุ: `normalizeProjectType()` เดิมบีบทุกอย่างเป็น NPD ต้องรองรับ SCENT)
- UI: dropdown 3 ประเภทตอนสร้าง/แก้ดีล + badge สี 3 ประเภทใน pipeline/ตาราง + filter ตามประเภท
  + ตัวเลือก type ใน [`ProjectFormModal`](src/components/pm/ProjectFormModal.js)
- ดีล SCENT `create-project` ได้เลยด้วย template ตัวเอง (ยังอยู่ใต้กติกา 1:1 เดิมจนเฟส 2 —
  ดีล NPD ที่ตามมาค่อย link เข้าโครงการเดียวกันเมื่อเฟส 2 ออก)
- สาย Sahamit ที่ hardcode `'RE-ORDER'` ([`salesPlanningForecast.js:396,446`](src/lib/salesPlanningForecast.js),
  [`create-sales-deal/route.js:134`](src/app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js)) → เขียนลง `dealType` ด้วย
- dashboard: การ์ด/กราฟแยก 3 ประเภท (FC Total·Actual·FC คงเหลือ per type)
- **rename ทั้งชุดตาม §5** (เมนู "ดีล", "ศูนย์รวมดีล", "ประเภทดีล", เลิก "โปรเจกต์", targets เป็น
  "บริหารงานขาย", แก้ลิงก์ legacy 2 จุด) — ทำพร้อมกันเพราะ badge/dropdown ประเภทแตะไฟล์เดียวกันอยู่แล้ว
- **ไม่แตะ cardinality — เสี่ยงต่ำ** (template ใช้ตอน gen เท่านั้น)

### เฟส 2 · โครงการรวมหลายดีล (แกนหลัก)
1. *(แยก template ทำแล้วในเฟส 1)*
2. **ฝั่ง PM อ่านเป็น list** — แก้จุด `.maybeSingle()` ทั้ง 3:
   - project GET → `deals: [{id, title, stage, dealType, projectValue, wonValue, forecastMonth}]`
     (คง `dealId`/`dealStage` = ดีลก่อตั้ง ไว้ 1 เฟส เพื่อ backward compat)
   - delete guard → เช็ก `count > 0` (ทุกดีล) · **เลิก title sync สองทาง**
3. deploy ข้อ 2 → รัน migration 0089+0090 บน prod (ดรอป unique + `project_tasks.dealId` พร้อม backfill)
   - **ไทม์ไลน์ต่อ segment**: gen/append task เขียน `dealId` เสมอ · regen ใน
     [`schedule.js`](src/lib/pm/schedule.js) เปลี่ยน key จับคู่จากชื่อ → `dealId`+ชื่อ (กันชื่อชนข้าม segment)
     · anchor คิดต่อ segment (วันเริ่มของดีลนั้น) forward-only เหมือนเดิม
   - Gantt หน้าโครงการ: จัดกลุ่ม task เป็น swimlane ต่อดีล (สีตามประเภท); หน้าดีลเห็นเฉพาะ segment ตัวเอง
   - สถานะดีล = `getComputedStatus` เฉพาะ task ของ segment ตัวเอง (reuse ตัวเดิม ส่ง subset)
4. **action ผูกดีลเข้าโครงการเดิม**: `POST /api/sales-planning/deals/[id]/link-project {projectId}`
   - ใช้ได้ทุกประเภทดีลที่ยังไม่ผูกโครงการ; validate ลูกค้าเดียวกัน + scope + `recordAudit`
   - ผูกแล้ว → **ต่อ task ชุดตาม template ของประเภทดีลแบบ draft** ให้ PM ยืนยัน
     (กลไกเดียวกับที่วางไว้สำหรับ RE-ORDER — generalize ให้ SCENT→NPD ใช้ด้วย)
   - default แนะนำโครงการ: จับคู่จาก FG/ลูกค้าของดีล กับโครงการ active
   - `create-project` เดิม = ทางของดีลก่อตั้ง; อุดบั๊กดันดีลถอยหลัง stage พร้อมกัน (finding #7 ใน SALES_DEAL_HUB_PLAN)
5. **back-pointer**: เลิกอ่าน `projects.metadata.salesDealId` เป็น source of truth —
   excise `from-project` + shipment-prep รับ `dealId` ตรงจากผู้เรียก; fallback: ดีลเดียวใช้ดีลนั้น, หลายดีลให้เลือก
6. UI หน้าโครงการ PM: แผง **"ดีลในโครงการ"** (ตาราง: ประเภท/สถานะ/มูลค่า/FC เดือน) +
   แถว KPI rollup (**FC Total · Actual · FC คงเหลือ** · มูลค่ารวม · #ดีล) จาก `projectRollup.js`
   — reuse `KpiCard` + module overview pattern
7. **หน้ารวมโครงการใหม่ `/sa/projects` + เมนู "โครงการ"** (§5): ตาราง โครงการ×ลูกค้า×ประเภท +
   KPI rollup ต่อแถว; แก้ rewrite/redirect ใน `next.config.mjs` (ยกเลิก `/sa/projects→/sa/deals`);
   back link หน้าโครงการชี้กลับหน้ารวมใหม่
8. UI หน้าดีล: ปุ่มคู่ "สร้างโครงการใหม่ / ผูกกับโครงการเดิม" + การ์ด "ดีลอื่นในโครงการเดียวกัน"

### เฟส 3 · RE-ORDER เข้าโครงการเดิม (สาย Sahamit)
- migration 0091 (หลาย PO → โครงการเดียว)
- `sahamit/po/[id]/create-project`: dialog เดิมเพิ่มตัวเลือก **"แนบเข้าโครงการเดิมของลูกค้า"**
  (default = โครงการที่ FG ตรงกัน; ไม่เจอ → สร้างโครงการ legacy แบบเดิม)
  — PO ที่แนบ = won-deal stub `dealType='RE-ORDER'` ผูก `projectId` เดิม; กันซ้ำต่อ PO ด้วย guard เดิม
- ปลด filter `!d.projectId` ใน PO-matching ([`salesPlanningForecast.js`](src/lib/salesPlanningForecast.js)):
  เงื่อนไขใหม่ = stage เปิด ไม่ใช่ "ไม่มีโครงการ"
- timeline: แนบ PO → ต่อ task `REORDER_TEMPLATE` แบบ draft (กลไกข้อ 4 ของเฟส 2)

### เฟส 4 · Project 360 + Customer 360 — อัปเดต/ติดตาม/เชื่อมระบบ
- หน้าโครงการ: **feed รวม** = `sales_deal_activities` ของทุกดีล + stage history + งาน PM ที่เพิ่งเสร็จ
  (อ่านอย่างเดียว, ลิงก์กลับไปเขียนที่หน้าเจ้าของ — ตาม boundary)
- แผงเชื่อมระบบระดับโครงการ: ทะเบียนสรรพสามิต (ราย FG) · shipment-prep · PO Sahamit ทุกใบ ·
  ใบเสนอราคาของทุกดีล — reuse การ์ด routing จาก Deal Hub
- **Customer 360 (light)**: หน้าลูกค้า (master เดิม) เพิ่มแท็บ "โครงการ" — list โครงการทุกอัน +
  rollup ต่อโครงการ + รวมทั้งลูกค้า (reuse `projectRollup.js`; ไม่มี migration)
- dashboard Sales: drill-down ระดับโครงการ (top projects / top customers)

---

## 7. จุดที่ต้องแก้ (impact checklist ฝั่งโค้ด)

| ไฟล์ | บรรทัด | ต้องทำ | เฟส |
|---|---|---|---|
| `lib/salesPlanning.js` | 148–164 | `DEAL_TYPES` 3 ค่า + labels + normalize รองรับ SCENT | 1 |
| `deals/page.js` | 108, 243, 461, 559 | badge/filter 3 ประเภท (เลิกอ่าน metadata) | 1 |
| `deals/[id]/page.js` | 484–742, 1024 | dropdown 3 ประเภท · การ์ดดีลร่วมโครงการ · ปุ่ม link-project | 1, 2 |
| `api/sales-planning/dashboard/route.js` | 15–149 | มิติ byType 3 ค่า · ย้าย `wonAmt` เข้า helper | 1 |
| `salesPlanningForecast.js` | 49, 342, 396, 422, 446 | เขียน dealType · filter เปิด≠ไม่มีโครงการ | 1, 3 |
| `lib/pm/templates.js` | ทั้งไฟล์ | แยก SCENT/NPD template + แก้ dependsOnSteps + `templateFor` 3 ทาง | 1 |
| `api/pm/projects/[id]/route.js` | 53, 186, 211 | maybeSingle→list · เลิก title sync · delete guard นับทุกดีล | 2 |
| `lib/pm/schedule.js` | 219–272 | จับคู่/regen scope ต่อ dealId (key = dealId+name) · anchor ต่อ segment | 2 |
| Gantt + มุมมอง timeline | — | swimlane ต่อดีล (สีตามประเภท) · หน้าดีลเห็นเฉพาะ segment ตัวเอง | 2 |
| `deals/[id]/create-project/route.js` | 29, 53, 137 | ทางดีลก่อตั้ง (3 ประเภท) · อุดบั๊ก stage ถอยหลัง | 2 |
| `deals/[id]/link-project/route.js` | ใหม่ | ผูกโครงการเดิม + ต่อ task draft ตามประเภท | 2 |
| `salesPlanningWin.js` | 12, 40 | winPatch ไม่ทับ `projectId` ที่ผูกอยู่ · RE-ORDER ต้องมีโครงการตอน won | 2 |
| `lib/sales/projectRollup.js` | ใหม่ | rollup กลาง (AT/FC/total/byType) + unit test | 2 |
| `deals/[id]/overview/route.js` | 38–56 | เพิ่ม sibling deals ของโครงการเดียวกัน | 2 |
| `excise-registrations/from-project/route.js` | 96 | รับ `dealId` ตรง (เลิกพึ่ง metadata.salesDealId) | 2 |
| `pm/projects/[id]/shipment-prep/route.js` | 110 | เดียวกัน | 2 |
| `components/pm/ProjectFormModal.js` | 235–236 | ตัวเลือก type 3 ค่า | 1 |
| `pm/projects/[id]/page.js` | 105, … | แผงดีล + KPI rollup + สี type SCENT | 2 |
| `sahamit/po/[id]/create-project/route.js` | 49–51, 87, 167, 204 | ตัวเลือกแนบโครงการเดิม (default จับคู่ FG) | 3 |
| หน้าลูกค้า (master) | — | แท็บโครงการ + rollup | 4 |
| `components/AppLayout.js` | 172–181 | เมนู "ดีล" (rename) + เมนู "โครงการ" ใหม่ → `/sa/projects` | 1, 2 |
| rename ตาม §5 (7 ไฟล์) | ดูตาราง §5 | "โครงการ"→"ดีล" ฝั่ง sales · "โปรเจกต์"→"โครงการ" ฝั่ง PM · ลิงก์ legacy 2 จุด | 1 |
| `next.config.mjs` | 38, 40 | ยกเลิก redirect `/sa/projects→/sa/deals` · rewrite ไปหน้ารวมโครงการใหม่ | 2 |
| `pm/projects/page.js` | ใหม่ | หน้ารวมโครงการ (ตาราง + KPI rollup ต่อแถว) | 2 |

---

## 8. มติ (เคาะแล้ว 2026-07-11)

| # | เรื่อง | มติ |
|---|---|---|
| 1 | ดีล SCENT กับ template | **แยก template ตั้งแต่เฟส 1** — SCENT สร้างโครงการด้วย template ตัวเองได้ทันที ไม่มี fallback |
| 2 | จำกัดจำนวนดีลต่อประเภทในโครงการ | ไม่ล็อกที่ DB — UI เตือน + audit (ตามที่เสนอ) |
| 3 | RE-ORDER บังคับผูกโครงการตอนไหน | สร้างลอย ๆ วาง FC ได้ ปิด Won ต้องระบุโครงการ (ตามที่เสนอ) |
| 4 | field `dealId`/`dealStage` เดิมใน project GET | คงชี้ดีลก่อตั้งไว้ 1 เฟสระหว่างเปลี่ยนผ่าน แล้วตัดในเฟส 3 — เป็นเรื่อง plumbing ภายใน ไม่กระทบผู้ใช้ (ดูคำอธิบายใต้ตาราง) |
| 5 | ผูกดีลข้ามลูกค้า | ห้ามเด็ดขาด — validate customer ตรงกัน (ตามที่เสนอ) |

> **อธิบายข้อ 4:** โค้ดหน้าโครงการทุกวันนี้มีช่องข้อมูล "ดีลของโครงการ" อยู่ **1 ช่อง** (`dealId`/`dealStage`)
> ใช้โชว์ป้าย/ลิงก์ไปดีล เมื่อโครงการมีหลายดีล ช่องเดียวไม่พอ → เปลี่ยนเป็น list (`deals[]`)
> คำถามเดิมคือ "ช่องเก่าลบเลยไหม" — คำตอบที่ใช้: **เก็บช่องเก่าไว้ชั่วคราว** (ชี้ดีลก่อตั้ง)
> เพื่อให้หน้าจอ/โค้ดส่วนที่ยังไม่ถูกแก้ไม่พังระหว่างเปลี่ยนผ่าน แล้วลบทิ้งเมื่อทุกจุดย้ายไปใช้ list แล้ว

---

## 9. ความเสี่ยง + การกัน

| ความเสี่ยง | การกัน |
|---|---|
| ดรอป unique แล้วโค้ดเก่า (`maybeSingle`) พังก่อนแก้ครบ | **ลำดับบังคับ**: แก้โค้ดอ่านเป็น list + deploy ก่อน แล้วค่อยรัน 0089 บน prod |
| แยก template แล้วโครงการ NPD เก่าเพี้ยน | template ใช้ตอน gen เท่านั้น — task เก่าอยู่ใน DB ไม่ถูกแตะ; unit test นับ step ครบทั้ง 3 template |
| มูลค่า double-count (งานเดียวถูกซอยเป็น SCENT+NPD) | กติกา: มูลค่าดีล = ยอดขายก้อนนั้นเท่านั้น (ค่าออกแบบ ≠ ยอดผลิต — เป็นรายได้คนละก้อนจริง ไม่ใช่ double-count); rollup รวมจากดีลเสมอ ไม่กรอกที่โครงการ |
| `metadata.salesDealId` ค้าง/ชี้ผิดดีล | เฟส 2 เลิกอ่านเป็น truth ทุกจุด (grep ยืนยันเหลือ 0 จุดก่อนปิดเฟส) |
| ดีลผูกผิดโครงการ (คนละลูกค้า) | validate customer match + audit ทุก link |
| จับคู่โครงการผิด (FG ซ้ำหลายโครงการ) | default = แนะนำเท่านั้น ผู้ใช้ยืนยันใน dialog เสมอ |
| PO-matching เปิดกว้างขึ้นแล้วจับคู่มั่ว | เงื่อนไขใหม่จำกัด: stage เปิด + ลูกค้า/FG ตรง เหมือน logic คัดกรองเดิม |
| เลข migration ชน (0087 ซ้ำอยู่แล้ว) | จองเลขจริงตอนใกล้ merge + ตรวจ `ls supabase/migrations` ก่อน |
| timeline เพี้ยนเมื่อต่อ task ชุดใหม่ | ทุกชุดต่อท้ายเป็น draft ต้องยืนยัน + forward-only anchor ต่อ segment |
| regen จับคู่ task ผิดตัวเมื่อชื่อชนข้ามดีล | scope regen ต่อ dealId (0090 backfill ให้ task เก่ามีเจ้าของครบ) |

---

## 10. แผนทดสอบ (ต่อเฟส)

- เฟส 1: lint+build+`node --test` (รวม test template 3 ชุด); สร้างดีล 3 ประเภท → badge/filter/dashboard แยกถูก;
  ดีล SCENT สร้างโครงการ → timeline มีเฉพาะขั้นขาย+ออกแบบกลิ่น; ดีล NPD สร้างโครงการ → timeline เริ่มที่ Mock-up;
  ดีลเก่า backfill เป็น NPD/RE-ORDER ตรง `metadata.projectType` เดิม; โครงการเก่า timeline ไม่เปลี่ยน;
  ไล่ทุกหน้า sales/PM ไม่เหลือคำ "โครงการ" ที่หมายถึงดีล / "โปรเจกต์" (grep UI strings ยืนยัน)
- เฟส 2 (เพิ่ม): เมนู "โครงการ" เปิด `/sa/projects` เห็นตารางโครงการ + KPI ต่อแถวตรงกับหน้า detail;
  ลิงก์เก่า `/sa/projects` ที่เคย redirect ไป deals ต้องแสดงหน้ารวมใหม่แทน
- เฟส 2: ดีล SCENT ก่อตั้งโครงการ → timeline มีเฉพาะขั้นออกแบบกลิ่น; ดีล NPD link เข้าโครงการเดิม →
  task ชุด Mock-up→ส่งมอบ ต่อท้ายเป็น draft **เป็น segment ใหม่ (anchor ของตัวเอง)**;
  Gantt โครงการเห็น 2 swimlane สีต่างกัน; หน้าดีลเห็นเฉพาะ segment ตัวเอง + สถานะดีลคิดจาก task ตัวเอง;
  regen timeline ดีลหนึ่งไม่กระทบ task ของอีกดีล (ทดสอบชื่อ task ซ้ำข้าม segment);
  หน้าโครงการโชว์ 2 ดีล + rollup ถูก (AT=won, FC=open, byType แยก);
  โครงการกลิ่นเดิม: ก่อตั้งด้วย NPD ตรง ๆ → timeline เริ่มที่ Mock-up; ลบโครงการถูกกันเมื่อมีดีล; excise/shipment ระบุดีลถูกตัว
- เฟส 3: PO ใหม่ของลูกค้าเดิม → default เจอโครงการ FG ตรง → แนบ → won-deal RE-ORDER + task draft; PO เดิมกดซ้ำไม่สร้างซ้ำ
- เฟส 4: feed รวมเรียงเวลาถูก; หน้าลูกค้าเห็นทุกโครงการ + มูลค่ารวมตรงกับผลรวมโครงการ
