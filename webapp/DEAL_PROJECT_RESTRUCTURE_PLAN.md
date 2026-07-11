# Deal–Project Restructure — 1 โครงการมีหลายดีล + ประเภทดีล (Scent / NPD / RE-ORDER)

> แผนปรับโครงสร้างความสัมพันธ์ **deal ↔ project** จาก 1:1 เป็น **หลายดีลต่อ 1 โครงการ**
> พร้อมยก "ประเภทดีล" เป็นฟิลด์จริง เข้าชุดกับ [`SALES_PM_ROADMAP.md`](SALES_PM_ROADMAP.md)
> (โมเดล 2 ชั้น deal=commercial / project=execution — **ยังคงเดิม** แค่เปลี่ยน cardinality)
>
> สถานะ: **ร่างเพื่อรีวิว — ยังไม่ลงมือ** (อัปเดต 2026-07-11)

---

## 0. โจทย์จากผู้ใช้ + การตีความ

1. **Deal** = การรับลีด/หาลูกค้าเข้ามา เพื่อวาง FC วางแผน — แบ่งประเภทเป็น
   **Scent / NPD / RE-ORDER**
2. **Project** 1 โครงการมีได้ **1 ดีลหรือมากกว่า** — ต้องดูได้ในหน้าโครงการ:
   **มูลค่าโครงการ · FC · AT (ยอดจริง) · สถานะงาน · ข้อมูลอัปเดต/ติดตาม**
   และเชื่อมกับระบบอื่น (PM / สรรพสามิต / ส่งของ / Sahamit) ใน ecosystem เดียว

**ตีความ (เสนอ — ยืนยันตอนรีวิว):**

- โครงการ = "งานของลูกค้าเรื่องหนึ่ง" ที่มีวงจรยาว เช่น พัฒนากลิ่น (Scent) → ผลิตครั้งแรก (NPD)
  → สั่งซ้ำ (RE-ORDER) หลายรอบ — ทุกดีลเกาะโครงการเดียวกัน เห็นมูลค่ารวมทั้งเส้น
- **FC** = ยอดคาดการณ์จากดีลที่ยังเปิดอยู่ (open pipeline ของโครงการ)
- **AT** = ยอดจริงจากดีลที่ Won แล้ว (`wonValue`)
- **มูลค่าโครงการ** = AT + FC (ทั้งเส้นชีวิตโครงการ)
- ประเภทดีล:
  - `SCENT` = งานพัฒนากลิ่น/ขายกลิ่น (ใหม่ — ยังไม่มีในระบบ)
  - `NPD` = พัฒนา/ผลิตสินค้าใหม่ (มีแล้ว)
  - `RE-ORDER` = สั่งผลิตซ้ำ (มีแล้ว — สาย Sahamit PO)

---

## 1. โมเดลใหม่

```
                    ┌───────────────────────────────────────┐
                    │  projects (PRJ-…)  = ภาชนะโครงการ       │
                    │  • timeline / tasks / revisions (เดิม)  │
                    │  • rollup: มูลค่ารวม · FC · AT · สถานะ  │
                    │  • feed อัปเดตรวม (ดีล+งาน)             │
                    └───────▲───────▲───────▲───────────────┘
                            │       │       │   (N:1 — ดรอป unique)
             sales_deals #1 │  #2   │  #3   │
             SCENT (won)    NPD (won)   RE-ORDER (open, FC เดือนหน้า)
                    │           │           │
              activities   quotation    sahamit PO ↔ forecast lines
```

**สิ่งที่ *ไม่* เปลี่ยน:** โมเดล 2 ชั้นตาม roadmap (deal เกิดก่อน project ได้, lead ไม่บังคับมี project),
`markWon()` per-deal, boundary "อ่านข้ามได้ ห้าม write ข้ามโมดูล", ระบบ timeline/tasks ของ PM

**สิ่งที่เปลี่ยน:**

| เรื่อง | เดิม | ใหม่ |
|---|---|---|
| deal → project | 1:1 (unique index) | **N:1** (หลายดีลชี้โครงการเดียว) |
| ประเภทดีล | `metadata.projectType` (jsonb, มีแค่ NPD/RE-ORDER) | คอลัมน์จริง `dealType` CHECK (`SCENT`,`NPD`,`RE-ORDER`) |
| back-pointer `projects.metadata.salesDealId` | ค่าเดียว = ดีลเจ้าของ | เลิกเป็น source of truth → ใช้ reverse query `deals WHERE projectId=…` |
| หน้าโครงการ (PM) | โชว์ dealId/dealStage เดียว | แผง **"ดีลในโครงการ"** + KPI rollup (มูลค่า/FC/AT) |
| ทางผูกดีลเข้าโครงการ | สร้างใหม่เท่านั้น (`create-project`) | สร้างใหม่ **หรือผูกกับโครงการเดิม** (`link-project`) |
| Sahamit PO → project | 1 PO = 1 project เสมอ (unique 0068) | สร้างใหม่ หรือ **แนบเข้าโครงการ RE-ORDER เดิม** (ดรอป unique, PO ยัง idempotent per-PO) |

---

## 2. Ground truth (ตรวจกับโค้ด 2026-07-11)

- migration สูงสุด = **0087** (มีเลขซ้ำ `0087_personal_tasks_proxy_worker` + `0087_sales_history`) → แผนนี้จองเลข **0088+** และเช็กชนตอน merge
- unique 1:1 อยู่ที่ [`0064_sales_pm_link.sql:22`](supabase/migrations/0064_sales_pm_link.sql) (`sales_deals_project_id_uidx`) — มี plain index ซ้อนอยู่แล้ว (บรรทัด 42) ดรอป unique ได้เลย
- `PROJECT_TYPES = ['NPD','RE-ORDER']` + `normalizeProjectType()` ใน [`salesPlanning.js:148`](src/lib/salesPlanning.js) — เก็บใน `sales_deals.metadata.projectType` แล้ว passthrough ไปเป็น `projects.type` (เลือก PM template)
- PM template: `NPD_TEMPLATE` / `REORDER_TEMPLATE` ใน [`pm/templates.js`](src/lib/pm/templates.js) — **ไม่มี SCENT template**
- จุดที่ assume 1:1 (พังถ้ามี 2 ดีล/โครงการ):
  - [`api/pm/projects/[id]/route.js:53`](src/app/api/pm/projects/[id]/route.js) — GET ดึงดีลด้วย `.maybeSingle()` → **PGRST116 error ทั้งหน้า** เมื่อเจอ 2 แถว
  - เดียวกัน `:186` title sync (จะทับชื่อทุกดีล) และ `:211` delete guard (`.maybeSingle()` พัง/หลุดดีลเกิน)
  - [`deals/[id]/create-project/route.js:29`](src/app/api/sales-planning/deals/[id]/create-project/route.js) — กันดีลที่มี `projectId` แล้ว (ยังถูก แต่ต้องเพิ่มทาง link เข้าโครงการเดิม)
  - filter `!d.projectId` ใน [`salesPlanningForecast.js`](src/lib/salesPlanningForecast.js) (49,342,422) — ตัดดีลที่ผูกโครงการแล้วออกจากการจับคู่ PO
  - `projects.metadata.salesDealId` ถูก copy ไป excise ([`from-project/route.js:96`](src/app/api/excise-registrations/from-project/route.js)) + shipment-prep (`:110`) → กำกวมเมื่อมีหลายดีล
- มูลค่า: dashboard ([`api/sales-planning/dashboard/route.js`](src/app/api/sales-planning/dashboard/route.js)) รวม **per-deal** อยู่แล้ว (`wonAmt = wonValue ?? projectValue`, FC = `projectValue` ของดีลเปิด) → หลายดีล/โครงการ **ไม่ double-count** ตราบใดที่มูลค่าแต่ละดีล = ยอดขายรอบนั้นจริง ๆ
- Sahamit: `sahamit_pos.projectId` unique ([`0068`](supabase/migrations/0068_sahamit_po_project_link.sql)) + `salesDealId` ([`0073`](supabase/migrations/0073_sahamit_po_sales_deal_link.sql)); settle ระดับ line สร้าง won-deal stub ได้หลายดีลต่อ PO อยู่แล้ว

---

## 3. Schema (migrations จองเลข 0088+ — จริงตอน merge)

### 0088 — `sales_deal_type`
```sql
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "dealType" text NOT NULL DEFAULT 'NPD'
  CHECK ("dealType" IN ('SCENT','NPD','RE-ORDER'));

-- backfill จาก metadata.projectType (มีแค่ NPD/RE-ORDER)
UPDATE public.sales_deals
  SET "dealType" = COALESCE(NULLIF(metadata->>'projectType',''),'NPD')
  WHERE metadata ? 'projectType';

CREATE INDEX IF NOT EXISTS sales_deals_type_idx ON public.sales_deals ("dealType");
```
- `metadata.projectType` คงเขียนคู่ไว้ 1 เฟส (transition) แล้วค่อยเลิก
- **แยกบทบาท**: `dealType` = ประเภทเชิงพาณิชย์ (Sales) · `projects.type` = ตัวเลือก PM template
  (SCENT ยังไม่มี template → map ไป NPD template ก่อน — open decision #2)

### 0089 — `deal_project_many`
```sql
DROP INDEX IF EXISTS public.sales_deals_project_id_uidx;
-- plain index sales_deals_project_id_idx มีอยู่แล้ว (0064)
```

### 0090 — `sahamit_po_project_many` (เฟส 3)
```sql
DROP INDEX IF EXISTS public.sahamit_pos_project_id_uidx;
CREATE INDEX IF NOT EXISTS sahamit_pos_project_id_idx ON public.sahamit_pos ("projectId");
```
- idempotency ต่อ PO ยังอยู่: `create-project` ใช้ `.is('projectId', null)` guard ต่อ PO เหมือนเดิม

> DDL รันมือบน Supabase SQL Editor ก่อน deploy + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow)

---

## 4. กติกามูลค่า / FC / AT ระดับโครงการ (single source)

helper ใหม่ **`src/lib/sales/projectRollup.js`** (pure + unit test) — ใช้ทั้งหน้า PM และ Sales:

```
rollupDeals(deals[]) → {
  at:        Σ wonAmt(deal)       ของดีล stage=won            // ยอดจริง
  fc:        Σ projectValue        ของดีลเปิด (ไม่ lost/won)   // pipeline
  fcWeighted:Σ projectValue×prob%  ของดีลเปิด                  // อ้างอิง
  total:     at + fc                                           // "มูลค่าโครงการ"
  byType:    { SCENT: {...}, NPD: {...}, 'RE-ORDER': {...} }
  counts:    { open, won, lost }
  nextForecastMonth: min(forecastMonth ของดีลเปิด)
}
```

- `wonAmt` reuse นิยามเดิมของ dashboard (`wonValue ?? projectValue ?? 0`) — **ห้ามนิยามซ้ำ**:
  ย้าย/export จาก dashboard route มาไว้ที่ helper แล้วให้ dashboard เรียกใช้
- dashboard รวม per-deal เหมือนเดิม (ไม่เปลี่ยนสูตรรวมบริษัท/ทีม) — เพิ่มมิติ **แยกตาม dealType**

---

## 5. เฟสการทำ

### เฟส 1 · ประเภทดีล (dealType) — เล็ก จบในตัว ★ เริ่มก่อน
- migration 0088 + backfill
- [`salesPlanning.js`](src/lib/salesPlanning.js): `DEAL_TYPES = ['SCENT','NPD','RE-ORDER']` + labels ไทย
  (กลิ่น / สินค้าใหม่ / สั่งซ้ำ) แทน `PROJECT_TYPES` เดิม (คง alias ไว้ให้โค้ดเก่า)
- API deals CRUD อ่าน/เขียน `dealType` (คู่กับ `metadata.projectType` ชั่วคราว)
- UI: dropdown ประเภทตอนสร้าง/แก้ดีล + badge สี 3 ประเภทใน pipeline/ตาราง + filter ตามประเภท
- สาย Sahamit ที่ hardcode `'RE-ORDER'` ([`salesPlanningForecast.js:396,446`](src/lib/salesPlanningForecast.js),
  [`create-sales-deal/route.js:134`](src/app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js)) → เขียน `dealType` ด้วย
- dashboard: การ์ด/กราฟแยกตามประเภท (FC·AT per type)
- **ไม่แตะ cardinality — เสี่ยงต่ำมาก**

### เฟส 2 · โครงการมีหลายดีล (แกนหลัก)
1. migration 0089 (ดรอป unique)
2. **ฝั่ง PM อ่านเป็น list** — แก้จุด `.maybeSingle()` ทั้ง 3:
   - project GET → `deals: [{id, title, stage, dealType, projectValue, wonValue, forecastMonth}]`
     (คง `dealId`/`dealStage` = ดีลล่าสุดที่ active ไว้ 1 เฟส เพื่อ backward compat)
   - delete guard → เช็ก `count > 0` (โครงการลบไม่ได้ถ้ามีดีลผูก — ทุกดีล ไม่ใช่ดีลเดียว)
   - **เลิก title sync สองทาง** (ชื่อดีล ≠ ชื่อโครงการอีกต่อไป เมื่อมีหลายดีล)
3. **action ผูกดีลเข้าโครงการเดิม**: `POST /api/sales-planning/deals/[id]/link-project {projectId}`
   - validate: ลูกค้าเดียวกัน (หรือเตือน) + สิทธิ์ scope เดิม + `recordAudit`
   - `create-project` เดิมคงอยู่ (สร้างใหม่+ผูก) แต่เลิก guard "ดีลนี้มีโครงการแล้ว = conflict"
     → เปลี่ยนเป็น "มีแล้ว = แค่เปิดดู" และหน้าดีลเสนอ 2 ปุ่ม: สร้างใหม่ / ผูกกับโครงการเดิมของลูกค้า
   - อุดบั๊กเดิมพร้อมกัน: create-project ห้ามดันดีลถอยหลัง stage (finding #7 ใน SALES_DEAL_HUB_PLAN)
4. **back-pointer**: เลิกอ่าน `projects.metadata.salesDealId` เป็น source of truth —
   excise `from-project` + shipment-prep รับ `dealId` ตรง ๆ จากผู้เรียก (หน้าดีล/หน้าโครงการส่งมา)
   fallback: ถ้าโครงการมีดีลเดียวใช้ดีลนั้น, มีหลายดีลให้ผู้ใช้เลือก
5. UI หน้าโครงการ PM: แผง **"ดีลในโครงการ"** (ตาราง: ประเภท/สถานะ/มูลค่า/FC เดือน) +
   แถว KPI rollup (มูลค่ารวม · FC · AT · #ดีล) จาก `projectRollup.js` — reuse `KpiCard` + module overview pattern
6. UI หน้าดีล: การ์ด PM เดิมเพิ่ม "ดีลอื่นในโครงการเดียวกัน" (ลิงก์ข้าม)

### เฟส 3 · RE-ORDER เข้าโครงการเดิม (สาย Sahamit)
- migration 0090 (หลาย PO → โครงการเดียว)
- `sahamit/po/[id]/create-project`: dialog เดิมเพิ่มตัวเลือก **"แนบเข้าโครงการเดิมของลูกค้า"**
  (list โครงการ active ของ customer นั้น) — PO ที่แนบ = สร้าง won-deal stub `dealType='RE-ORDER'`
  ผูก `projectId` เดิม; ยังกันซ้ำต่อ PO ด้วย `sahamit_pos.projectId` guard เดิม
- ปลด filter `!d.projectId` ใน PO-matching ([`salesPlanningForecast.js`](src/lib/salesPlanningForecast.js)):
  ดีลที่ผูกโครงการแล้วแต่ยังเปิดอยู่ ต้องยังจับคู่ PO ได้ (เงื่อนไขใหม่ = stage เปิด ไม่ใช่ "ไม่มีโครงการ")
- timeline: การแนบ PO เข้าโครงการเดิม **ไม่ rebuild timeline อัตโนมัติ** — เพิ่ม task ชุด RE-ORDER
  ต่อท้ายแบบ draft ให้ PM กดยืนยัน (สอดคล้อง memory: pm-task-draft-confirm + timeline forward-only)

### เฟส 4 · Project 360 — อัปเดต/ติดตาม/เชื่อมระบบ
- หน้าโครงการ: **feed รวม** = `sales_deal_activities` ของทุกดีล + stage history + งาน PM ที่เพิ่งเสร็จ
  (อ่านอย่างเดียว, ลิงก์กลับไปเขียนที่หน้าเจ้าของ — ตาม boundary)
- แผงเชื่อมระบบระดับโครงการ: ทะเบียนสรรพสามิต (ราย FG) · shipment-prep · PO Sahamit ทุกใบ ·
  ใบเสนอราคาของทุกดีล — reuse การ์ด routing จาก Deal Hub
- dashboard Sales: drill-down ระดับโครงการ (มูลค่ารวมต่อโครงการ, top projects)

---

## 6. จุดที่ต้องแก้ (impact checklist ฝั่งโค้ด)

| ไฟล์ | บรรทัด | ต้องทำ | เฟส |
|---|---|---|---|
| `api/pm/projects/[id]/route.js` | 53, 186, 211 | maybeSingle→list · เลิก title sync · delete guard นับทุกดีล | 2 |
| `deals/[id]/create-project/route.js` | 29, 137 | เลิก conflict guard · คง `.is('projectId',null)` กันเขียนทับ | 2 |
| `salesPlanningWin.js` | 12, 40 | winPatch ไม่ทับ `projectId` ที่ผูกอยู่ | 2 |
| `salesPlanningForecast.js` | 49, 342, 396, 422, 446 | filter เปิด≠ไม่มีโครงการ · เขียน dealType | 1, 3 |
| `deals/[id]/overview/route.js` | 38–56 | เพิ่ม sibling deals ของโครงการเดียวกัน | 2 |
| `deals/[id]/page.js` | 484–742, 1024 | dropdown dealType · การ์ดดีลร่วมโครงการ | 1, 2 |
| `deals/page.js` | 108, 243, 461, 559 | badge/filter dealType (เลิกอ่าน metadata) | 1 |
| `api/sales-planning/dashboard/route.js` | 15–149 | มิติ byType · ย้าย `wonAmt` เข้า helper | 1 |
| `excise-registrations/from-project/route.js` | 96 | รับ `dealId` ตรง (เลิกพึ่ง metadata.salesDealId) | 2 |
| `pm/projects/[id]/shipment-prep/route.js` | 110 | เดียวกัน | 2 |
| `sahamit/po/[id]/create-project/route.js` | 49–51, 87, 167, 204 | ตัวเลือกแนบโครงการเดิม · dealType | 3 |
| `pm/projects/[id]/page.js` | — | แผงดีล + KPI rollup | 2 |
| `lib/pm/templates.js` | 80 | `templateFor` รองรับ SCENT (map→NPD ชั่วคราว) | 1 |

---

## 7. Open decisions (ขอมติก่อนลงมือเฟสนั้น)

1. **นิยาม SCENT** — งานพัฒนากลิ่น/ขายกลิ่นตามที่ตีความไหม? มีผลกับ label ไทย + dashboard
2. **SCENT ต้องมี PM template ของตัวเองไหม** หรือใช้ NPD template ไปก่อน (เสนอ: map→NPD ก่อน,
   ทำ SCENT_TEMPLATE เมื่อทีมสรุปขั้นตอนงานกลิ่นจริง)
3. **ผูกดีลข้ามลูกค้าได้ไหม** — เสนอ: ห้าม (ดีลกับโครงการต้อง customer เดียวกัน) มี override supervisor
4. **`dealId`/`dealStage` เดิมใน project GET** — คงเป็น "ดีล active ล่าสุด" กี่เฟสก่อนตัด (เสนอ: คง 1 เฟส)
5. **RE-ORDER อัตโนมัติผูกโครงการเดิม?** — เสนอ: ไม่อัตโนมัติ ให้เลือกใน dialog (default = โครงการ
   ล่าสุดของลูกค้า+FG เดียวกัน ถ้าเจอ)

---

## 8. ความเสี่ยง + การกัน

| ความเสี่ยง | การกัน |
|---|---|
| ดรอป unique แล้วโค้ดเก่า (`maybeSingle`) พังก่อนแก้ครบ | **ลำดับบังคับ**: แก้โค้ดอ่านเป็น list + deploy ก่อน แล้วค่อยรัน 0089 บน prod |
| มูลค่า double-count (ดีลใหญ่ถูกซอยเป็นหลายดีล) | กติกา: `projectValue` ของดีล = ยอดขายรอบนั้นเท่านั้น; rollup รวมจากดีลเสมอ ไม่กรอกมูลค่าที่โครงการ |
| `metadata.salesDealId` ค้าง/ชี้ผิดดีล | เฟส 2 เลิกอ่านเป็น truth ทุกจุด (grep ยืนยันเหลือ 0 จุดก่อนปิดเฟส) |
| ดีลผูกผิดโครงการ (คนละลูกค้า) | validate customer match + audit ทุก link/unlink |
| PO-matching เปิดกว้างขึ้นแล้วจับคู่มั่ว | เงื่อนไขใหม่จำกัด: stage เปิด + ลูกค้า/FG ตรง เหมือน logic คัดกรองเดิม |
| เลข migration ชน (0087 ซ้ำอยู่แล้ว) | จองเลขจริงตอนใกล้ merge + ตรวจ `ls supabase/migrations` ก่อน |
| timeline เพี้ยนเมื่อแนบ RE-ORDER เข้าโครงการเดิม | task ชุดใหม่เป็น draft ต้องยืนยัน + forward-only anchor เดิม |

---

## 9. แผนทดสอบ (ต่อเฟส)

- เฟส 1: lint+build+`node --test`; สร้างดีล 3 ประเภท → badge/filter/dashboard แยกถูก; ดีลเก่า backfill เป็น NPD/RE-ORDER ตรง metadata เดิม
- เฟส 2: ดีล A สร้างโครงการ → ดีล B (ลูกค้าเดียวกัน) link เข้าโครงการเดียวกัน → หน้าโครงการโชว์ 2 ดีล + rollup ถูก (AT=won, FC=open); ลบโครงการถูกกันเมื่อมีดีล; excise/shipment ระบุดีลถูกตัว
- เฟส 3: PO ใหม่ของลูกค้าเดิม → แนบโครงการเดิม → เกิด won-deal RE-ORDER ในโครงการ + task draft; PO เดิมกดซ้ำไม่สร้างซ้ำ
- เฟส 4: feed รวมเรียงเวลาถูก, ลิงก์ข้ามระบบครบ
