# แผนรื้อโครงสร้าง "คำร้องข้ามฝ่าย" (SA ↔ RD ↔ PC)

รวม 3 เมนู **สอบถาม RD · ขอราคาผลิต · วัสดุ** ให้เป็นโครงเดียวกัน แล้วต่อสายเข้าไทม์ไลน์โครงการ

- เขียน: 2026-07-28
- ต่อยอดจาก: `docs/costing-request-plan.md` (ฉบับ 5), `docs/entity-updates-plan.md`
- สถานะ: **มติครบแล้ว รอเริ่ม PR-1**

---

## 0. ทำไมต้องรื้อตอนนี้

นับแถวบน prod เมื่อ 2026-07-28:

| ตาราง | แถวบน prod |
|---|---|
| `inquiries` / `inquiry_messages` | **0 / 0** |
| `material_price_asks` / `_items` | 1 / 1 |
| `material_prices` / `_revisions` | 1 / 0 |
| `costing_requests` | 1 |
| `sales_deals` | 133 |
| `products` | 120 |
| `products` ที่มีรหัสสูตร**จริง** | **4 แถว = 2 สูตรที่ต่างกัน** |
| `products` ที่มีชื่อสูตรแต่**ไม่มีรหัส** | **10 แถว** — ชื่อพวกนี้คือ "ชื่อกลิ่น" (ดู §0.1) |
| `entity_updates` | 654 |
| `projects` / `project_tasks` | 12 / 282 |

**ทั้งสามเมนูยังแทบไม่มีใครใช้จริง** ขณะที่ดีล/โครงการ/ไทม์ไลน์เดินเต็มที่แล้ว → รื้อโครงตอนนี้
ต้นทุนย้ายข้อมูลเกือบเป็นศูนย์ ปล่อยไว้อีก 3 เดือนราคาจะคนละเรื่อง

> ⚠️ **บทเรียนการนับ:** อย่านับด้วย `formulaCode IS NOT NULL` — 41 จาก 45 แถวเป็น **สตริงว่าง `''`**
> ไม่ใช่ค่าจริง · ทุก query ที่นับ "ช่องข้อความที่กรอกแล้ว" ต้องใช้ `NULLIF(btrim(col), '') IS NOT NULL`
> (ตัวเลข 45 ที่เคยเขียนในแผนฉบับแรกมาจากการนับผิดแบบนี้)

### 0.1 ⭐ หลักฐานตรงว่า "กลิ่น" ไม่มีที่อยู่ — คนกรอกชื่อกลิ่นลงช่องชื่อสูตร

ข้อมูลจริงบน prod (2026-07-28) — สินค้า 14 แถวที่มีข้อมูลสูตรอย่างน้อยหนึ่งช่อง:

```
รหัสสูตร            ชื่อสูตร                              วันที่
(ว่าง)              Walk on beach 01                      2025-08-06
(ว่าง)              Floral bouquet 01                     2025-08-06
(ว่าง)              Loyal love                            2025-08-06
(ว่าง)              Forest night                          2025-08-06
(ว่าง)              Glass window rain                     2202-08-06  ← ปีพิมพ์ผิด
(ว่าง)              Empire Tower EA04 Quiet and Mysterious 2024-05-28
(ว่าง)              Party zone americano whiskey #1       2025-08-19  (×2 สินค้า)
(ว่าง)              Silent zone tea & fig #1              2025-08-19  (×2 สินค้า)
PF638010202-P1      Well sleep #2                         2026-03-09  (×2 สินค้า)
PF441010201-P1.1    Activist zone look so good #1         2025-12-18  (×2 สินค้า)
```

**10 จาก 14 แถวไม่มีรหัสสูตร มีแต่ชื่อ — และชื่อพวกนั้นคือ *ชื่อกลิ่น* ทั้งหมด**
("Walk on beach", "Forest night", "Floral bouquet") ⇒ ยืนยันว่าข้อมูลสองอย่าง (กลิ่น/สูตร)
ปนกันอยู่ในช่องเดียวบน prod แล้วจริง ๆ เพราะระบบไม่มีที่เก็บกลิ่น

**ผลต่อ backfill:** ระบบเดาแทน RD ไม่ได้ว่าแถวไหนเป็นกลิ่น แถวไหนเป็นสูตร → **backfill อัตโนมัติ
เฉพาะแถวที่มีรหัสสูตรจริง (2 สูตร)** ส่วนที่เหลือออกเป็น**รายงานให้ RD จัดระเบียบเอง** ใน UI
(สร้าง master data ผิดแย่กว่าไม่สร้าง)

พบบั๊กข้อมูลแถม: `Glass window rain` มี `formulaDate = 2202-08-06` (ปี 2202) — แจ้งผู้ใช้แก้

---

## 1. มติที่ล็อกแล้ว (ผู้ใช้ยืนยัน 2026-07-28)

1. **RM (หัวน้ำหอม F / เนื้อสาร FB) = RD ตอบ · PM (บรรจุภัณฑ์) = PC ตอบ** — ตรงกับที่ระบบทำอยู่
   (`sourceDeptForMaterialKind`) ไม่มีการสลับ ไม่มี PC ตอบราคา RM
2. **ยังไม่มีฝ่าย Costing** — ผู้ให้ราคาผลิตคือ **ผู้บริหาร (role `executive`) คนเดียว** เหมือนเดิม
   ห้ามเพิ่ม role ใหม่ในแผนนี้
3. **บรีฟกลิ่น / ขอ Mockup = "คำร้อง" ที่ปักหมุดเข้า task เดิมในไทม์ไลน์** ไม่สร้าง task ใหม่
   (งานเดียวต้องไม่โผล่สองที่)
4. **ทะเบียนกลิ่นเก็บ: ชื่อ · รหัส · วันที่ · Rev · Feedback** → Rev เป็นตารางลูก แต่ละ Rev มีวันที่
   ส่งกลิ่นและผลตอบรับของลูกค้า
5. **คำร้องบังคับผูกดีลเฉพาะชนิดที่เป็นงานลูกค้า** (บรีฟ/mockup/เอกสาร) · ชนิดขอราคาไม่บังคับ
   (ขอเก็บข้อมูลไว้ก่อนได้ — สอดคล้องมติเดิมของใบขอราคาผลิต v2)
6. ⭐ **"ขอราคา PM" คือขั้น `หาบรรจุภัณฑ์ที่ลูกค้าต้องการ` (step 25, PC, 30 วัน) ในไทม์ไลน์**
   ไม่ใช่งานลอย ๆ → ทุกชนิดคำร้องมี task ปลายทางในไทม์ไลน์ทั้งหมด

### รอบที่ 2 (2026-07-28) — ปิดคำถามค้าง 4 ข้อ + ขยายขอบเขต 2 เรื่อง

7. **เลขที่: บรีฟกลิ่นและ mockup แยกพรีฟิกซ์ของตัวเอง** ส่วนคำร้องอื่น (สอบถาม/เอกสาร/ติดตามของเข้า)
   ใช้เลขชุดรวม → `SB-` / `MU-` / `RQ-` (+ `RM-` / `PM-` ของเดิม) รวม 5 scope
8. **รหัสกลิ่น RD กรอกเอง** เหมือนรหัสสูตร — ไม่ใช่เลขรันของระบบ (ตัด scope `SC-` ทิ้ง
   แต่ยังบังคับไม่ซ้ำผ่าน unique index)
9. **กลิ่นของลูกค้า A ใช้กับลูกค้า B ไม่ได้** — กลิ่นผูกลูกค้าเสมอ ไม่มี "กลิ่นกลาง"
   → `customerId` เป็น **NOT NULL** และการมองเห็นยึด scope ลูกค้า
10. **SA สร้างกลิ่นเป็นร่างได้ RD เป็นคนรับเข้าทะเบียน** — แพตเทิร์นเดียวกับทะเบียนวัสดุ 0157
    (`status draft → active`, `acceptedBy*`)
11. 🆕 **แยก role `executive` ออกจาก `admin`** — ดู §9
12. 🆕 **รื้อเธรดให้จบในแผนนี้ด้วย** — ดู §10

### ตารางจับคู่ ชนิดคำร้อง ↔ ขั้นในไทม์ไลน์

อ้าง `webapp/src/lib/pm/templates.js` · คีย์ขั้น = `workflowTemplateStepKey`
(`staticStepKey` = `<ประเภทดีล>-<เลขขั้น 2 หลัก>`)

| ชนิดคำร้อง | ฝ่าย | ขั้นปลายทาง | stepKey |
|---|---|---|---|
| `scent_brief` แจ้งบรีฟออกแบบกลิ่น | RD | `ออกแบบกลิ่น` (SCENT step 6) | `scent-06` |
| `mockup` ขอ Mock-up | RD | `ขึ้น Mock-up สินค้า` (NPD step 15) | `npd-15` |
| `price_pm` ขอราคาบรรจุภัณฑ์ | PC | `หาบรรจุภัณฑ์ที่ลูกค้าต้องการ` (NPD step 25) | `npd-25` |
| `price_f` ขอราคาหัวน้ำหอม | RD | — (ป้อนใบขอราคาผลิต) | – |
| `price_fb` ขอราคาเนื้อสาร | RD | — (ป้อนใบขอราคาผลิต) | – |
| `material_eta` ติดตามของเข้า PM/RM | PC | `สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด` (NPD 38 / RE-ORDER 11) | `npd-38` / `re-order-11` |
| `info` สอบถามข้อมูล | RD/PC | — | – |
| `document` ขอเอกสาร | RD/PC | — | – |

> ⚠️ เก็บ `projectId + stepKey` **ไม่ใช่ `projectTaskId`** — `mergeTemplateTasks` ลบ/สร้าง task ใหม่ได้
> ตอน resync แม่แบบ ถ้าผูก id ตรง ๆ หมุดจะหลุดเงียบ ๆ · resolve task ตอนอ่านเสมอ

---

## 2. โครงใหม่ 3 ชั้น

### ชั้น A — ทะเบียน (ข้อมูลหลัก) ย้ายไปใต้ "ฐานข้อมูล"

| ทะเบียน | ที่มา | ผูกกับ |
|---|---|---|
| **กลิ่น** `scents` + `scent_revisions` | ใหม่ | ← วัสดุ `RM_F`, ← สูตร |
| **สูตร** `formulas` | ยกจาก 3 ช่องข้อความบน `products` (mig 0112) — backfill 45 แถว | ← วัสดุ `RM_FB`, ← `products.formulaId` |
| **วัสดุ** `material_prices` | มีแล้ว (0157) — เพิ่ม `scentId` / `formulaId` | ← ใบขอราคาผลิต |

ผลลัพธ์: "ขอราคา F อ้างชื่อกลิ่น" / "ขอราคา FB อ้างชื่อสูตร" เปลี่ยนจากพิมพ์ข้อความเป็น
**เลือกจากทะเบียนด้วย id** — ปิดบั๊กตระกูลเดียวกับที่ 0158 เพิ่งปิด ("ตอบแล้วเกิดวัสดุตัวใหม่")

### ชั้น B — คำร้องข้ามฝ่าย: กลไกเดียว มีชนิด

**ต่อยอดจาก `material_price_asks` (0158) ไม่ใช่จาก `inquiries`** — ของ 0158 ใหม่กว่าและมีครบทุกอย่าง
ที่ต้องใช้อยู่แล้ว: เลขที่ · สถานะ 6 ขั้น · คิวรายฝ่าย · เธรดกลาง · ไฟล์แนบต่อครบ 5 จุด · บรรทัด
หลายรายการ · ชั้นจำนวน · เทสต์ · `RecordControlCard`
ส่วน `inquiries` (0104) เป็นเธรดล้วน ไม่มีบรรทัด ไม่มีคิว **และมี 0 แถวบน prod** → **ลบทิ้ง**

```
material_price_asks       →  dept_requests          (+ kind, บริบทดีล/โครงการ, stepKey, title)
material_price_ask_items  →  dept_request_items     (มีเฉพาะชนิดขอราคา)
inquiries + inquiry_messages  →  ลบทั้งคู่
```

สถานะชุดเดียวทุกชนิด (ของ 0158 เดิม): `draft → pending → acknowledged → answered → closed`
(+ `cancelled`)

### ชั้น C — ของเข้า PM/RM ระดับโครงการ

ยกกลไกของ `/sahamit/material` (`pmDueDate` / `rmDueDate` / `arrivedAt` ราย PO line) ขึ้นเป็นของกลาง
ระดับโครงการ → ตาราง `material_deliveries` · สรุปขึ้นขั้น `npd-38` ให้ milestone นั้นมีของจริงข้างใน
และวันช้าสุดดันวันเริ่มผลิตผ่านเครื่องยนต์ `lib/pm/schedule.js` ที่มีอยู่แล้ว

---

## 3. เมนูก่อน/หลัง

```
ก่อน                              หลัง
─────────────────────────         ────────────────────────────────────────
สอบถาม RD                         คำร้อง            (คิวฝ่ายฉัน / ที่ฉันเปิด / ทั้งหมด — กรองด้วยชนิด)
ขอราคาผลิต                        ขอราคาผลิต        (คงเดิม — เอกสารสาย QT/SO ผู้บริหารเข้าตรง)
วัสดุ (ทะเบียน+เคส 3 แท็บ)         ของเข้า & กำหนดการผลิต

ฐานข้อมูล: ลูกค้า · สินค้า · หมวดสินค้า
        →  + ทะเบียนกลิ่น · ทะเบียนสูตร · ทะเบียนวัสดุ (ย้ายมาจากเมนู "วัสดุ")

หน้าดีล: แท็บ "สอบถาม RD"  →  แท็บ "คำร้อง" (เห็นทุกชนิด + ใบขอราคาผลิตของดีลนั้น)
```

แก้ชื่อชนกัน: เมนูสหมิตร `วัสดุ / Lead time` → `ของเข้า (สหมิตร)`

---

## 4. เลขที่เอกสาร

ใช้ RPC `next_entity_number` เดิม (mig 0096)

| ชนิด | scope | รูปแบบ |
|---|---|---|
| `price_f` / `price_fb` | `RM` | `RM-YYMMXXXX` (คงเดิม) |
| `price_pm` | `PM` | `PM-YYMMXXXX` (คงเดิม) |
| `scent_brief` บรีฟออกแบบกลิ่น | `SB` | `SB-YYMMXXXX` |
| `mockup` ขอ Mock-up | `MU` | `MU-YYMMXXXX` |
| `info` / `document` / `material_eta` | `RQ` | `RQ-YYMMXXXX` |

(มติข้อ 7: สองงานที่เป็น "งานพัฒนา" ของ RD แยกเลขให้ค้นย้อนหลังได้ง่าย ส่วนคำร้องเบ็ดเตล็ด
ใช้เลขชุดเดียวพอ — `kind` บอกชนิดบนหน้าจออยู่แล้ว)

**ทะเบียนกลิ่นไม่ใช้เลขรัน** — RD กรอก `code` เอง (มติข้อ 8) เหมือนรหัสสูตร บังคับไม่ซ้ำที่ index

เลขออก **ตอนกดส่ง** ไม่ใช่ตอนสร้างร่าง (บทเรียนใบขอราคาผลิต PR3a — ร่างที่ถูกทิ้งจะได้ไม่กินเลข)
scope `IQ` ของ `inquiries` เลิกใช้ (ไม่มีแถวบน prod จึงไม่ต้องกันเลขย้อนหลัง)

---

## 5. Migration

### ⚠️ ก่อนเริ่ม: เคลียร์เลข 0169 ที่ซ้ำบน main

`npm run check:migrations` (มีอยู่แล้ว, `scripts/check-migrations.mjs`) จับได้:

```
Migration integrity check failed.
Unexpected duplicate versions:
- 0169: 0169_deal_feed_to_entity_updates.sql, 0169_sales_order_reissue_after_cancel.sql
```

**ข้อจำกัดที่ต้องรู้ (แก้แล้ว 2026-07-28):** ตอนเขียนแผนนี้ CI **ไม่ได้รันสคริปต์นี้เลย**
(`.github/workflows/ci.yml` มีแค่ lint → test → build) → เลขซ้ำที่เกิดจาก 2 PR merge ไล่กัน
ไม่มีใครเห็นจนกว่าจะมีคนรันบน main เอง · การขยับ `0169_deal_feed…` → `0170_` ในแผนนี้จึงไป
ทับ `0170_deal_stage_order_swap.sql` ที่ merge เข้ามาก่อนพอดี = **ชนซ้ำรอบสอง**
(ท้ายสุดขยับเป็น `0172_`) · ตอนนี้ CI รัน `check:migrations` ทั้งตอน `pull_request`
**และ `push` เข้า main** แล้ว — ด่านที่รันเฉพาะตอน PR มองเลขชนแบบนี้ไม่เห็นตลอดกาล

ไล่เนื้อในทั้งสองไฟล์แล้ว (2026-07-28):

| ไฟล์ | เนื้อใน | ต้องรันบน prod ไหม |
|---|---|---|
| `0169_deal_feed_to_entity_updates` | INSERT ล้วน **ไม่มี DDL** · ตารางต้นทาง `sales_deal_activities` = 0 แถว | **ไม่มีผล** รันหรือไม่รันเหมือนกัน |
| `0169_sales_order_reissue_after_cancel` | `CREATE OR REPLACE FUNCTION create_sales_order_draft` | **ต้องรัน** — ยืนยันจากข้างนอกไม่ได้ |

ตรวจตัวที่สองบน Supabase SQL Editor (ต้องเทียบ **เนื้อในฟังก์ชัน** ไม่ใช่แค่ว่ามีฟังก์ชันอยู่ —
`CREATE OR REPLACE` ทำให้ฟังก์ชันเวอร์ชันเก่าดูเหมือนรันแล้ว)

> ⚠️ **เลือกโทเคนให้อยู่ใน `$$ ... $$` เท่านั้น** — `prosrc` เก็บเฉพาะเนื้อในฟังก์ชัน คอมเมนต์
> เหนือ `CREATE OR REPLACE` ไม่ถูกเก็บ · โทเคนที่ใช้ได้คือ `supersededById`
> (0169 มี 2 ครั้งในตัวฟังก์ชัน · 0155 ไม่มีเลย)

```sql
-- ตรวจก่อนเริ่มแผน: A) 0169 ลง prod แล้วไหม  B) มีผู้บริหาร  C) ผู้บริหารมีลายเซ็น
SELECT 'A) migration 0169 (SO reissue)' AS "รายการ",
       CASE WHEN bool_or(p.prosrc LIKE '%supersededById%')
            THEN '✅ รันแล้ว'
            ELSE '❌ ยังไม่รัน — ต้องรัน 0169_sales_order_reissue_after_cancel.sql ก่อนออกเลข 0170'
       END AS "ผล"
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'create_sales_order_draft'
UNION ALL
SELECT 'B) บัญชี role executive',
       CASE WHEN count(*) = 0
            THEN '❌ ยังไม่มีบัญชีผู้บริหาร — อย่าเพิ่ง merge PR-0'
            ELSE '✅ มี ' || count(*) || ' บัญชี: ' || string_agg(email, ', ')
       END
  FROM auth.users WHERE raw_app_meta_data->>'role' = 'executive'
UNION ALL
SELECT 'C) ผู้บริหารมีลายเซ็นหรือยัง',
       COALESCE(string_agg(email || ' → ' ||
         CASE WHEN sig THEN '✅ มีลายเซ็น' ELSE '❌ ยังไม่อัปลายเซ็น = อนุมัติไม่ได้' END, ' · '),
         '— ข้าม (ยังไม่มีบัญชี executive)')
  FROM (SELECT u.email, (s."activeVersionId" IS NOT NULL) AS sig
          FROM auth.users u
          LEFT JOIN public.user_signatures s ON s."userId" = u.id::text
         WHERE u.raw_app_meta_data->>'role' = 'executive') t;
```

**อ่านผล:** A ❌ = รัน `0169_sales_order_reissue_after_cancel.sql` ก่อน (ยังไม่ระเบิดวันนี้เพราะ
prod ยังไม่มี SO สักใบ) แล้ว**ขยับไฟล์ที่ merge ทีหลังเป็น 0170** เลื่อนแผนนี้เป็น 0171–0174
พร้อมเขียนหัวไฟล์กำกับว่า "รันแล้วในชื่อเดิม ไม่ต้องรันซ้ำ" · B/C ❌ = ทำ PR-1..PR-7 ได้ตามปกติ
แต่**พัก PR-0 ไว้** (ดู §9) · (ดู memory `migration-drift-guard` — เลขซ้ำเป็นครั้งที่ 3 แล้ว)

### ยืนยันตัวเลข prod ที่ใช้ตัดสินใจทั้งแผน (§0)

```sql
SELECT 'inquiries' AS "ตาราง", count(*) AS "แถว", 'ต้องเป็น 0 — แผนลบตารางนี้ทิ้ง' AS "หมายเหตุ" FROM public.inquiries
UNION ALL SELECT 'inquiry_messages', count(*), 'ต้องเป็น 0' FROM public.inquiry_messages
UNION ALL SELECT 'material_price_asks', count(*), 'จะถูก rename เป็น dept_requests' FROM public.material_price_asks
UNION ALL SELECT 'costing_requests', count(*), '' FROM public.costing_requests
UNION ALL SELECT 'material_prices', count(*), '' FROM public.material_prices
UNION ALL SELECT 'products (มี formulaCode)', count(*), 'จำนวนสูตรที่จะ backfill' FROM public.products WHERE NULLIF(btrim("formulaCode"), '') IS NOT NULL
UNION ALL SELECT 'sales_deal_activities', count(*), 'ต้องเป็น 0 ก่อน drop (PR-6)' FROM public.sales_deal_activities
UNION ALL SELECT 'personal_task_updates', count(*), 'เทียบกับบรรทัดถัดไปให้เท่ากันก่อน drop' FROM public.personal_task_updates
UNION ALL SELECT 'entity_updates (personal_task)', count(*), '' FROM public.entity_updates WHERE "entityType" = 'personal_task';
```

### 0170 — ทะเบียนกลิ่น + ทะเบียนสูตร

```sql
-- ============================================================
--  Migration 0170: ทะเบียนกลิ่น (scents) + ทะเบียนสูตร (formulas)
--  แผน docs/cross-department-requests-plan.md ชั้น A
--
--  ก่อนหน้านี้ "กลิ่น" ไม่มีตัวตนในระบบเลย (มีแค่ชื่อ task ในไทม์ไลน์ + ข้อความ
--  ในทะเบียนวัสดุ) และ "สูตร" เป็น 3 ช่องข้อความบน products (mig 0112)
--  → ขอราคา F/FB อ้างของพวกนี้ได้แค่พิมพ์ชื่อ จับคู่ไม่ได้ รายงานไม่ได้
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ⚠ ต้องรัน **ก่อน** deploy โค้ด PR-1
-- ============================================================

BEGIN;

-- ── 1) ทะเบียนกลิ่น ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scents (
  id             text PRIMARY KEY,
  -- รหัสกลิ่น = ของจริงจาก RD ไม่ใช่เลขรันของระบบ (มติ 8 — เหมือนรหัสสูตร)
  -- ร่างที่ SA เปิดยังไม่มีรหัส → RD ใส่ตอนรับเข้าทะเบียน
  code           text,
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  -- ⚠ มติ 9: กลิ่นของลูกค้า A ใช้กับ B ไม่ได้ → ผูกลูกค้าเสมอ ไม่มี "กลิ่นกลาง"
  "customerId"   text NOT NULL,
  "customerName" text,
  -- ดีล SCENT ต้นทางที่สั่งออกแบบ (null = กลิ่นที่มีอยู่ก่อน/สร้างจากทะเบียนตรง ๆ)
  "dealId"       text,
  -- มติ 10: SA เปิดร่างได้ RD เป็นคนรับเข้าทะเบียน (แพตเทิร์นเดียวกับ material_prices 0157)
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN (
                   'draft',       -- SA เสนอเข้ามา รอ RD รับ (ยังอ้างในคำร้องขอราคาไม่ได้)
                   'developing',  -- RD รับแล้ว กำลังออกแบบ/ส่งให้ลูกค้าลอง
                   'active',      -- ลูกค้าอนุมัติแล้ว ใช้ผลิตได้
                   'archived')),  -- เลิกใช้
  -- Rev ล่าสุด — derive ตอนเขียนเสมอ (อ่านทะเบียนไม่ต้อง join ลูกทุกครั้ง)
  "currentRevisionNo" integer NOT NULL DEFAULT 0,
  "ownerId"      text, "ownerName" text,           -- RD เจ้าของกลิ่น
  "acceptedById" text, "acceptedByName" text, "acceptedAt" timestamptz,
  note           text CHECK (note IS NULL OR length(note) <= 2000),
  "createdById"  text, "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  -- รับเข้าทะเบียนแล้วต้องมีรหัสเสมอ (ร่างยังไม่มีได้)
  CHECK (status = 'draft' OR code IS NOT NULL)
);

-- ตัวตนของกลิ่น = ชื่อ (ตัดช่องว่าง/ไม่สนตัวพิมพ์) + ลูกค้า
-- แพตเทิร์นเดียวกับ material_prices_identity_uk (0157) — ห้ามให้ชื่อซ้ำในลูกค้าเดียวกัน
-- ไม่งั้นขอราคา F สองใบจะชี้คนละแถวโดยไม่มีใครรู้
CREATE UNIQUE INDEX IF NOT EXISTS scents_identity_uk
  ON public.scents (lower(btrim(name)), "customerId");
-- รหัสกลิ่นห้ามซ้ำทั้งบริษัท (partial — ร่างที่ยังไม่มีรหัสไม่นับ)
CREATE UNIQUE INDEX IF NOT EXISTS scents_code_uk
  ON public.scents (lower(btrim(code))) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS scents_customer_idx ON public.scents ("customerId");
CREATE INDEX IF NOT EXISTS scents_deal_idx     ON public.scents ("dealId");
CREATE INDEX IF NOT EXISTS scents_status_idx   ON public.scents (status);

-- ── 2) Rev ของกลิ่น = การส่งกลิ่นให้ลูกค้า 1 ครั้ง + ผลตอบรับ ──────────────
-- ⚠ ต่างจาก material_price_revisions ตรงที่ **แก้ได้** — feedback ลูกค้ามาทีหลัง
-- วันที่ส่ง (คนละวันกับวันที่ได้คำตอบ) จึงห้ามใส่ guard immutable แบบราคา
CREATE TABLE IF NOT EXISTS public.scent_revisions (
  id               text PRIMARY KEY,
  "scentId"        text NOT NULL REFERENCES public.scents(id) ON DELETE CASCADE,
  "revisionNo"     integer NOT NULL CHECK ("revisionNo" >= 1),
  "sampleCode"     text,                           -- รหัสตัวอย่างที่ส่ง (ของ RD)
  "sentAt"         date,                           -- "วันที่ Rev" = วันที่ส่งกลิ่น
  "sentById"       text, "sentByName" text,
  -- ผลตอบรับจากลูกค้า
  "feedbackStatus" text NOT NULL DEFAULT 'pending' CHECK ("feedbackStatus" IN (
                     'pending',   -- ส่งแล้ว รอลูกค้าตอบ
                     'revise',    -- ให้แก้ → เกิด Rev ถัดไป
                     'approved',  -- ผ่าน
                     'rejected')),-- ไม่เอากลิ่นนี้
  "feedbackAt"     date,
  "feedbackById"   text, "feedbackByName" text,
  feedback         text CHECK (feedback IS NULL OR length(feedback) <= 4000),
  note             text CHECK (note IS NULL OR length(note) <= 2000),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  -- มีผลตอบรับแล้วต้องมีวันที่เสมอ (ไม่งั้นวัด lead time ของ RD ไม่ได้)
  CHECK ("feedbackStatus" = 'pending' OR "feedbackAt" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS scent_revisions_no_uk
  ON public.scent_revisions ("scentId", "revisionNo");

-- ── 3) ทะเบียนสูตร ─────────────────────────────────────────────────────────
-- รหัสสูตรเป็นของจริงจาก RD (ไม่ใช่เลขรันของระบบ) → ผู้ใช้กรอกเอง แต่ห้ามซ้ำ
-- ⚠ code เป็น NULL ได้เฉพาะสถานะ 'draft' — เพราะของจริงบน prod มี 10 แถวที่มีแต่ชื่อ
--   ไม่มีรหัส (ดู §0.1) ถ้าบังคับ NOT NULL จะเอาเข้าทะเบียนไม่ได้เลย
--   แพตเทิร์นเดียวกับ scents (มติ 10): เข้ามาเป็นร่าง → RD ใส่รหัสตอนรับเข้าทะเบียน
CREATE TABLE IF NOT EXISTS public.formulas (
  id             text PRIMARY KEY,
  code           text CHECK (code IS NULL OR length(btrim(code)) BETWEEN 1 AND 100),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  "formulaDate"  date,                             -- วันที่ของสูตร (เดิม products."formulaDate")
  -- สูตรใช้กลิ่นตัวไหน (มติผู้ใช้: สูตรเกี่ยวข้องกับกลิ่น)
  "scentId"      text REFERENCES public.scents(id) ON DELETE SET NULL,
  "customerId"   text, "customerName" text,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'archived')),
  note           text CHECK (note IS NULL OR length(note) <= 2000),
  "acceptedById" text, "acceptedByName" text, "acceptedAt" timestamptz,
  "createdById"  text, "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR code IS NOT NULL)
);
-- partial: ร่างที่ยังไม่มีรหัสไม่นับ (เหมือน scents_code_uk)
CREATE UNIQUE INDEX IF NOT EXISTS formulas_code_uk
  ON public.formulas (lower(btrim(code))) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS formulas_scent_idx    ON public.formulas ("scentId");
CREATE INDEX IF NOT EXISTS formulas_customer_idx ON public.formulas ("customerId");

-- ── 4) ต่อทะเบียนเข้าของเดิม ───────────────────────────────────────────────
-- products: 3 ช่องข้อความเดิม **ไม่ลบในรอบนี้** (ยังมีที่อ่านอยู่หลายจุด รวมทั้ง
-- snapshot บนใบขอราคาผลิต/เคส) — เพิ่ม pointer ก่อน แล้วเก็บกวาดใน PR-5
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_formula_idx ON public.products ("formulaId");

-- material_prices: F ผูกกลิ่น · FB ผูกสูตร (PM ไม่ผูกอะไร)
-- ⚠ ไม่แตะ material_prices_identity_uk ในรอบนี้ — ตัวตนยังยึด formulaCode (text)
--   เปลี่ยน unique index = ต้องล้างข้อมูลก่อน ยกไป PR-5 ตอนที่ pointer เต็มแล้ว
ALTER TABLE public.material_prices
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL;

-- ── 5) backfill สูตร — เฉพาะแถวที่มี "รหัสสูตรจริง" เท่านั้น ────────────────
-- prod ณ 2026-07-28: 4 แถว = 2 สูตรที่ต่างกัน (ไม่ใช่ 45 — ดูบทเรียนการนับใน §0)
-- รวมตามรหัสสูตร (ตัดช่องว่าง/ไม่สนตัวพิมพ์) — สินค้าหลายตัวใช้สูตรเดียวกันได้
--
-- ⚠ อีก 10 แถวที่มี "ชื่อสูตร" แต่ไม่มีรหัส **ตั้งใจไม่ backfill** (ดู §0.1) —
--   ชื่อพวกนั้นคือชื่อกลิ่น ระบบเดาแทน RD ไม่ได้ว่าอันไหนเป็นกลิ่น อันไหนเป็นสูตร
--   → ออกเป็นรายงาน "รอ RD จัดระเบียบ" ในหน้าทะเบียนแทน (query ท้ายไฟล์)
INSERT INTO public.formulas (id, code, name, "formulaDate", "customerId", "customerName", status)
SELECT
  'FML-' || md5(lower(btrim(p."formulaCode"))),
  min(btrim(p."formulaCode")),
  min(COALESCE(NULLIF(btrim(p."formulaName"), ''), btrim(p."formulaCode"))),
  max(p."formulaDate"),
  -- ผูกลูกค้าให้เฉพาะสูตรที่ใช้กับลูกค้ารายเดียวล้วน ๆ (ปนกัน = สูตรกลาง)
  CASE WHEN count(DISTINCT p."customerId") = 1 THEN min(p."customerId") END,
  CASE WHEN count(DISTINCT p."customerId") = 1 THEN min(p."customerName") END,
  'active'                      -- มีรหัสจริง = รับเข้าทะเบียนได้เลย ไม่ต้องเป็นร่าง
  FROM public.products p
 WHERE NULLIF(btrim(p."formulaCode"), '') IS NOT NULL
 GROUP BY lower(btrim(p."formulaCode"))
 ON CONFLICT DO NOTHING;

UPDATE public.products p
   SET "formulaId" = 'FML-' || md5(lower(btrim(p."formulaCode")))
 WHERE NULLIF(btrim(p."formulaCode"), '') IS NOT NULL
   AND p."formulaId" IS NULL;

-- เก็บกวาดสตริงว่างให้เป็น NULL (41 แถว) — ไม่งั้นทุกการนับต่อจากนี้ต้องระวังเอง
UPDATE public.products
   SET "formulaCode" = NULLIF(btrim("formulaCode"), ''),
       "formulaName" = NULLIF(btrim("formulaName"), '')
 WHERE btrim(COALESCE("formulaCode", '')) = '' OR btrim(COALESCE("formulaName", '')) = '';

-- ── 6) RLS (แพตเทิร์นเดิมทั้งระบบ: ปิดหมด เปิดเฉพาะ service_role) ──────────
ALTER TABLE public.scents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_revisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulas         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scents, public.scent_revisions, public.formulas
  FROM anon, authenticated;
GRANT  ALL ON TABLE public.scents, public.scent_revisions, public.formulas
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT count(*) FROM formulas;                                    -- ควรได้ 2
-- SELECT count(*) FROM products WHERE "formulaId" IS NOT NULL;      -- ควรได้ 4
-- SELECT count(*) FROM products
--  WHERE NULLIF(btrim("formulaCode"),'') IS NOT NULL AND "formulaId" IS NULL;  -- ต้องได้ 0
--
-- ── รายการที่ RD ต้องจัดระเบียบเอง (โชว์ในหน้าทะเบียน ไม่ backfill อัตโนมัติ) ──
-- SELECT "fgCode", "productDescription", "formulaName", "formulaDate"
--   FROM products
--  WHERE "formulaId" IS NULL AND NULLIF(btrim("formulaName"), '') IS NOT NULL;
--  → RD ตัดสินทีละแถวว่าเป็น "กลิ่น" (เข้า scents) หรือ "สูตร" (เข้า formulas + ใส่รหัส)
--  ⚠ มีบั๊กข้อมูลรออยู่ 1 แถว: formulaDate = '2202-08-06' (ปี 2202)
```

### 0171 — คำร้องข้ามฝ่าย (เคสขอราคา → คำร้อง) + ลบ inquiries

```sql
-- ============================================================
--  Migration 0171: เคสขอราคาวัสดุ → คำร้องข้ามฝ่าย (dept_requests)
--  แผน docs/cross-department-requests-plan.md ชั้น B
--
--  ระบบมีกลไก "ขอให้ฝ่ายอื่นทำอะไรให้" อยู่ 2 ชุดที่เกือบเหมือนกันแต่คนละคำ
--  คนละตาราง คนละคิว → RD ต้องเฝ้าสองที่ และไม่มีที่ไหนรวมว่างานค้างมีกี่ชิ้น
--    · inquiries (0104)            = เธรดล้วน บังคับดีล ไม่มีบรรทัด ไม่มีคิวรายฝ่าย
--    · material_price_asks (0158)  = เลขที่+สถานะ 6 ขั้น+คิว+บรรทัด+ชั้นจำนวน+เธรดกลาง
--  ตัวหลังใหม่กว่าและมีครบ → ขยายตัวหลังให้รับ "ชนิด" แล้วลบตัวแรกทิ้ง
--
--  ⚠ prod ณ 2026-07-28: inquiries = 0 แถว, material_price_asks = 1 แถว
--    (ตรวจซ้ำก่อนรันจริง — ถ้า inquiries ไม่ว่างแล้วต้องหยุดและเขียน backfill ก่อน)
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-2
-- ============================================================

BEGIN;

-- ── 0) ด่านกันลบข้อมูลจริง ─────────────────────────────────────────────────
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.inquiries;
  IF n > 0 THEN
    RAISE EXCEPTION 'inquiries มี % แถว — แผนนี้คิดบนสมมติฐานว่าว่าง หยุดก่อน', n;
  END IF;
END $$;

-- ── 1) เปลี่ยนชื่อตาราง: เคสขอราคา → คำร้อง ────────────────────────────────
ALTER TABLE public.material_price_asks       RENAME TO dept_requests;
ALTER TABLE public.material_price_ask_items  RENAME TO dept_request_items;
ALTER TABLE public.dept_request_items        RENAME COLUMN "askId" TO "requestId";

-- ── 2) ชนิดคำร้อง + บริบทงาน + หมุดไทม์ไลน์ ────────────────────────────────
ALTER TABLE public.dept_requests
  -- ชนิดไม่มี CHECK ที่ระดับ DB โดยเจตนา — ชุดชนิดประกาศในโค้ด
  -- (lib/master/requestTypes.js) แพตเทิร์นเดียวกับ updateTypes/attachmentTypes/
  -- materialTypes: เพิ่มชนิดใหม่ = แก้โค้ดล้วน ไม่ต้องออก migration ทุกครั้ง
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'price_pm',
  -- หัวเรื่อง: ชนิดขอราคาไม่ต้องมี (บรรทัดบอกเองว่าถามอะไร) ชนิดอื่นบังคับที่ API
  ADD COLUMN IF NOT EXISTS title text CHECK (title IS NULL OR length(title) <= 200),
  ADD COLUMN IF NOT EXISTS body  text CHECK (body  IS NULL OR length(body)  <= 4000),
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false,
  -- บริบทงาน (บังคับเฉพาะชนิดงานลูกค้า — ตรวจที่ API ไม่ใช่ CHECK เพราะกฎขึ้นกับ kind)
  ADD COLUMN IF NOT EXISTS "dealId"    text,
  ADD COLUMN IF NOT EXISTS "projectId" text,
  -- หมุดขั้นในไทม์ไลน์: เก็บ stepKey ไม่ใช่ taskId — mergeTemplateTasks ลบ/สร้าง task
  -- ใหม่ตอน resync แม่แบบ ผูก id ตรง ๆ แล้วหมุดจะหลุดเงียบ ๆ (resolve ตอนอ่าน)
  ADD COLUMN IF NOT EXISTS "stepKey"   text,
  -- ผูกกลิ่น/สูตรด้วย id (0170) — เลิกอ้างด้วยข้อความ
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL,
  -- วันที่ผู้ขอ "อยากได้คำตอบ" vs วันที่ฝ่ายผู้ตอบ "รับปากว่าจะตอบ"
  -- (ยกแนวคิดมาจาก inquiries ที่กำลังจะลบ — เส้นวัด KPI คือตัวหลัง)
  ADD COLUMN IF NOT EXISTS "requestedDueDate" date,
  ADD COLUMN IF NOT EXISTS "committedDueDate" date;

-- dept เดิม CHECK ไว้แค่ RD/PC — ยังพอ (ชนิดใหม่ทั้งหมดไปสองฝ่ายนี้)
-- ถ้าวันหนึ่งต้องส่งถึง LG/QC ค่อยผ่อน CHECK ใน migration แยก

CREATE INDEX IF NOT EXISTS dept_requests_kind_idx    ON public.dept_requests (kind, status);
CREATE INDEX IF NOT EXISTS dept_requests_deal_idx    ON public.dept_requests ("dealId");
CREATE INDEX IF NOT EXISTS dept_requests_project_idx ON public.dept_requests ("projectId", "stepKey");

-- ── 3) แถวเดิมทั้งหมดคือคำร้องขอราคา — เติม kind ให้ถูกตามฝ่าย/ชนิดวัสดุ ────
-- (prod มี 1 แถว แต่เขียนให้ทั่วไปไว้ เผื่อ staging มีมากกว่านั้น)
UPDATE public.dept_requests r
   SET kind = CASE
     WHEN r.dept = 'PC' THEN 'price_pm'
     WHEN EXISTS (SELECT 1 FROM public.dept_request_items i
                   WHERE i."requestId" = r.id AND i.kind = 'RM_F') THEN 'price_f'
     ELSE 'price_fb'
   END;
ALTER TABLE public.dept_requests ALTER COLUMN kind DROP DEFAULT;

-- ── 4) เธรดกลาง: entityType 'material_ask' → 'dept_request' ────────────────
UPDATE public.entity_updates
   SET "entityType" = 'dept_request'
 WHERE "entityType" = 'material_ask';

-- ไฟล์แนบ (polymorphic, ไม่มี CHECK entityType — ดู lib/master/attachmentTypes.js)
UPDATE public.attachments
   SET "entityType" = 'dept_request_item'
 WHERE "entityType" = 'material_ask_item';

-- ── 5) ลบระบบสอบถามเดิม (0 แถว — ยืนยันด้วยด่านข้อ 0 แล้ว) ─────────────────
DROP TABLE IF EXISTS public.inquiry_messages;
DROP TABLE IF EXISTS public.inquiries;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT kind, count(*) FROM dept_requests GROUP BY 1;
-- SELECT count(*) FROM entity_updates WHERE "entityType" = 'material_ask';   -- ต้องได้ 0
-- SELECT count(*) FROM attachments    WHERE "entityType" = 'material_ask_item'; -- ต้องได้ 0
--
-- Rollback: RENAME กลับ + DROP คอลัมน์ที่เพิ่ม + UPDATE entityType กลับ
--           (ตาราง inquiries สร้างใหม่จาก 0104 ได้ เพราะไม่มีข้อมูลให้กู้)
```

### 0172 — ของเข้า PM/RM ระดับโครงการ

```sql
-- ============================================================
--  Migration 0172: รายการของเข้า PM/RM ระดับโครงการ (material_deliveries)
--  แผน docs/cross-department-requests-plan.md ชั้น C
--
--  ของเดิม: การติดตามของเข้ามีเฉพาะสายสหมิตร (sahamit_material_tracking —
--  pmDueDate/rmDueDate/arrivedAt ราย PO line) · งานทั่วไปมีแค่ task เดียวใน
--  ไทม์ไลน์ "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" (45 วัน) ที่ไม่มี
--  อะไรอยู่ข้างใน → SA ถาม PC ทีไรก็ต้องไล่ถามเป็นรายตัวนอกระบบ
--
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-4
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.material_deliveries (
  id              text PRIMARY KEY,
  "projectId"     text NOT NULL,
  "dealId"        text,
  -- ผูกวัสดุในทะเบียนถ้ามี (ปิดบั๊กตระกูล "จับคู่ด้วยข้อความ") · label เป็น snapshot เสมอ
  "materialId"    text REFERENCES public.material_prices(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  qty             numeric CHECK (qty IS NULL OR qty > 0),
  unit            text,
  "poRef"         text,                             -- เลข PR/PO ภายนอก (Express)
  "dueDate"       date,                             -- กำหนดถึง
  "arrivedAt"     date,                             -- มาแล้ว (null = ยังไม่มา)
  "ownerId"       text, "ownerName" text,           -- PC ผู้รับผิดชอบ
  -- มติ 13: แถวส่วนใหญ่ "กาง" มาจากบรรทัดของใบขอราคาผลิตที่อนุมัติแล้ว
  -- SET NULL: ลบใบ CR แล้วรายการของเข้าต้องอยู่ต่อ (ของสั่งไปแล้วจริง)
  "costingRequestId" text REFERENCES public.costing_requests(id) ON DELETE SET NULL,
  "componentId"      text,                          -- บรรทัดต้นทางในใบ (logical link)
  "source"        text NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'costing')),
  -- คำร้องติดตามที่ทำให้แถวนี้ถูกอัปเดตล่าสุด (logical link ไม่ใส่ FK — คำร้องถูกลบได้
  -- แต่ข้อมูลของเข้าต้องอยู่ต่อ)
  "requestId"     text,
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  -- ของมาก่อนกำหนดได้ แต่ต้องไม่มาก่อนวันสร้างแถวแบบไร้เหตุผล → ตรวจที่ API
  CHECK ("arrivedAt" IS NULL OR "dueDate" IS NULL OR "arrivedAt" >= '2000-01-01')
);
CREATE INDEX IF NOT EXISTS material_deliveries_project_idx
  ON public.material_deliveries ("projectId", "dueDate");
CREATE INDEX IF NOT EXISTS material_deliveries_open_idx
  ON public.material_deliveries ("projectId") WHERE "arrivedAt" IS NULL;
-- ⚠ กดปุ่ม "กางจากใบขอราคาผลิต" ซ้ำต้องไม่ได้แถวซ้ำ (idempotent ที่ระดับ DB
--   ไม่ใช่พึ่ง client ไม่กดสองครั้ง) — partial เพราะแถวที่พิมพ์เองไม่มี componentId
CREATE UNIQUE INDEX IF NOT EXISTS material_deliveries_component_uk
  ON public.material_deliveries ("projectId", "componentId")
  WHERE "componentId" IS NOT NULL;

ALTER TABLE public.material_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_deliveries FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_deliveries TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

### 0173 — แจ้งเตือนรายคน (มติ 14/15)

```sql
-- ============================================================
--  Migration 0173: แจ้งเตือนรายคน (notifications)
--  แผน docs/cross-department-requests-plan.md §11
--
--  ระบบยังไม่มีแจ้งเตือนในแอปเลย — มีแต่ Google Chat webhook ที่ยิงเข้า
--  **ห้องรวมของฝ่าย** (8 space ใน lib/chat.js) ซึ่งบอกไม่ได้ว่าใครต้องทำ
--  และไม่มีทางรู้ว่าใครอ่านแล้ว → คำตอบของ RD ที่ SA ไม่เห็น = งานค้างเงียบ
--
--  ตารางนี้เป็นทั้งกล่องแจ้งเตือนและแหล่งของ "ตัวนับยังไม่ได้อ่าน" (มติ 15:
--  ตัวนับ derive จาก readAt IS NULL — ไม่มีตาราง watermark ต่อเธรดต่อคน)
--
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-7
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id            text PRIMARY KEY,
  -- ผู้รับ 1 คน 1 แถว (fan-out ตอนเขียน) — อ่านเร็วและนับ unread ได้ตรง ๆ
  -- ไม่ใช้แบบ "1 เหตุการณ์ + ตารางผู้อ่าน" เพราะทุก query ที่ผู้ใช้เห็นจะต้อง join
  "userId"      text NOT NULL,
  -- polymorphic แบบเดียวกับ entity_updates/attachments — ไม่มี FK โดยเจตนา
  "entityType"  text NOT NULL,
  "entityId"    text NOT NULL,
  -- ชนิดแจ้งเตือนประกาศในโค้ด (lib/master/notificationTypes.js) ไม่ผูก CHECK
  kind          text NOT NULL,
  title         text NOT NULL CHECK (length(title) <= 200),
  body          text CHECK (body IS NULL OR length(body) <= 500),
  "linkPath"    text,                                -- เปิดไปที่ไหนเมื่อกด
  -- ข้อความต้นทางในเธรด (ถ้าแจ้งเตือนนี้มาจากเธรด) — ใช้พาไปยังข้อความนั้นตรง ๆ
  "updateId"    text,
  "actorId"     text, "actorName" text,              -- คนที่ทำให้เกิดเหตุการณ์
  "readAt"      timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

-- กล่องแจ้งเตือนของคนหนึ่ง (เรียงใหม่→เก่า) + ตัวนับ unread
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON public.notifications ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications ("userId") WHERE "readAt" IS NULL;
-- ตัวนับต่อ entity ("เคสนี้มี 3 เรื่องที่คุณยังไม่ได้ดู")
CREATE INDEX IF NOT EXISTS notifications_entity_idx
  ON public.notifications ("userId", "entityType", "entityId") WHERE "readAt" IS NULL;
-- ⚠ กันแจ้งเตือนซ้ำจากเหตุการณ์เดียวกัน (retry / กดสองครั้ง)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uk
  ON public.notifications ("userId", "updateId") WHERE "updateId" IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
GRANT  ALL ON TABLE public.notifications TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── เก็บกวาด (ตั้ง cron ทีหลัง — ตารางนี้โตเร็วที่สุดในระบบ) ────────────────
-- DELETE FROM notifications WHERE "readAt" IS NOT NULL AND "createdAt" < now() - interval '90 days';
```

---

## 6. ลำดับ PR

### PR-1 — ทะเบียนกลิ่น + สูตร (mig 0170)

| ไฟล์ | งาน |
|---|---|
| `supabase/migrations/0170_scent_formula_registry.sql` | DDL + backfill |
| `lib/master/scents.js` (ใหม่) | logic: สถานะ, Rev, feedback, ตัวตนกลิ่น, สิทธิ์ (RD เป็นเจ้าของ) |
| `lib/master/formulas.js` (ใหม่) | logic: normalize รหัส/ชื่อ, ผูกกลิ่น |
| `app/api/master/scents/**` · `formulas/**` | CRUD + `POST /scents/[id]/revisions` (ส่งกลิ่น) + `PATCH .../feedback` |
| `app/database/scents/page.js` · `formulas/page.js` | ทะเบียน + ฟอร์มเดียวใช้ทั้งสร้าง/แก้ (กฎ AGENTS.md) |
| ↑ เพิ่มการ์ด **"รอจัดระเบียบ (10)"** | สินค้าที่มีชื่อสูตรแต่ไม่มีรหัส (§0.1) — RD กดเลือกทีละแถวว่าเป็น *กลิ่น* หรือ *สูตร* แล้วระบบสร้างให้ + ผูก `formulaId`/`scentId` กลับไปที่สินค้า |
| `components/AppLayout.js` | เมนู "ทะเบียนกลิ่น" / "ทะเบียนสูตร" ใต้ฐานข้อมูล |
| `components/database/ProductForm.js` | ช่องสูตร: text → `FormulaPicker` (คงค่าเดิมอ่านได้) |
| `lib/master/updateTypes.js` | เธรด `scent` (comment / sent / feedback) |
| `src/proxy.js` | ลงทะเบียน endpoint ใหม่ (allowlist default-deny — ไม่ลงทะเบียน = non-admin 403 เงียบ) |
| เทสต์ | `scents.test.mjs` · `formulas.test.mjs` |

**เกณฑ์ผ่าน:** สร้างกลิ่น → ส่ง Rev 1 → บันทึก feedback `revise` → ส่ง Rev 2 → `approved`;
สินค้า 45 ตัวชี้ `formulaId` ครบ; ทะเบียนสูตรเลือกกลิ่นได้

### PR-2 — รวมคำร้อง (mig 0171)

| ไฟล์ | งาน |
|---|---|
| `supabase/migrations/0171_dept_requests.sql` | rename + kind + บริบท + ลบ inquiries |
| `lib/master/requestTypes.js` (ใหม่) | ชุดชนิด: ฝ่ายปลายทาง · scope เลขที่ · บังคับดีลไหม · มีบรรทัดไหม · stepKey |
| `lib/deptRequests.js` (จาก `lib/materialAsks.js`) | logic เดิม + แตกกฎตามชนิด |
| `app/api/sa/requests/**` (จาก `/api/sa/materials/asks/**`) | + redirect เส้นเก่า |
| `app/sa/requests/page.js` | คิวฝ่ายฉัน / ที่ฉันเปิด / ทั้งหมด + ตัวกรองชนิด |
| **ลบ** `app/sa/inquiries/**` · `app/api/sales-planning/inquiries/**` · `lib/inquiries.js` · `components/salesPlanning/Inquiry*` | ~1,400 บรรทัด |
| `lib/salesDetailTabs.js` · หน้าดีล | แท็บ "สอบถาม RD" → "คำร้อง" |
| `lib/chat.js` | การ์ดแจ้งเตือนรวมเป็นใบเดียว ต่อชนิด |

**เกณฑ์ผ่าน:** เคสเดิมบน prod เปิดได้เหมือนเดิม เลข `PM-`/`RM-` ไม่เปลี่ยน เธรด/ไฟล์แนบครบ;
ไม่มีลิงก์ค้างชี้ `/sa/inquiries`

> ⚠️ **ห้ามลืม 5 จุดของไฟล์แนบ** เมื่อ entityType เปลี่ยน — `loadParent` + view gate + edit gate
> ของ `/api/attachments` · `lib/drive.js resolveFolderForEntity` · `PARENT_TABLE` ใน
> `lib/master/attachments.js` (รายการเต็มอยู่หัวไฟล์ `lib/master/costingAttachmentAccess.js`)

### PR-3 — ชนิดที่มีผลลัพธ์ (โค้ดล้วน)

**ก้อนแรก — หมุดไทม์ไลน์ (ทำแล้ว):**

- ✅ ยืนยันกับ prod แล้วว่า stepKey ทั้งสี่ตัวมีอยู่จริง — `scent-06` (ออกแบบกลิ่น) ·
  `npd-15` (ขึ้น Mock-up) · `npd-25` (หาบรรจุภัณฑ์) · `npd-38` (สั่งซื้อสารและบรรจุภัณฑ์)
  ตรงกับ `staticStepKey()` ใน `lib/pm/schedule.js` = `<ชนิดโครงการ>-<เลขขั้น 2 หลัก>`
- ✅ ป้ายหมุดบนแถวขั้นตอน — ทำที่ `DealTimelineTable` (= `TimelineWorkspace`) ที่เดียว
  ได้ทั้งหน้าดีลและหน้าโครงการ ทั้งมุมมองตารางและมุมมองรายการ
  - ⚠️ ตารางไทม์ไลน์ที่อยู่ใน `sa/projects/[id]/page.js` เป็น **โค้ดตายใต้ `{false && (…)}`**
    ~600 บรรทัด · แก้ตรงนั้นแล้วหน้าจอไม่เปลี่ยนอะไรเลย
- ✅ `POST /api/sa/requests` เติม `projectId` จากดีล (deal↔project 1:1 mig 0064) —
  **ไม่รับจาก client** เหตุผลเดียวกับ `stepKey` · ดีลที่ยังไม่ผูกโครงการปักหมุดไม่ได้
  ซึ่งเป็นเคสส่วนใหญ่บน prod (132 ดีล มี `projectId` 12) — คำร้องยังโผล่บนหน้าดีลตามเดิม
- 🐞 **แก้ผู้อ่านที่ค้างบนตารางที่ mig 0174 ลบไปแล้ว** (ตกค้างจาก #790):
  `api/pm/projects/[id]` อ่าน `inquiries` → การ์ดคำร้องบนหน้าโครงการว่างเปล่าเงียบ ๆ ·
  `api/pm/personal-tasks` อ่าน `inquiry_messages` → "สร้างงานจากข้อความ" ตอบ
  "ไม่พบข้อความต้นทาง" เสมอ · เพิ่มเทสต์ `droppedTables.test.mjs` สแกนทั้ง `src/`
  **มี migration ที่ DROP TABLE เมื่อไร ต้องเติมชื่อตารางลงลิสต์นั้น**

**ก้อนที่เหลือ:**

- `scent_brief` ปิดเคส → สร้าง/ผูกแถวใน `scents`
- `price_f` / `price_fb` ตอบราคาแล้ว rev เข้าทะเบียนวัสดุที่ผูก `scentId`/`formulaId`
  (ฟอร์มเลือกกลิ่น/สูตรจากทะเบียนแทนพิมพ์ชื่อ ✅ ทำไปแล้วใน PR-2b)

### PR-4 — ของเข้า & กำหนดการผลิต (mig 0172)

- ตาราง `material_deliveries` + หน้า/แท็บในโครงการ + `PATCH` รายแถว (กำหนดถึง / มาแล้ว)
- **ปุ่ม "กางรายการจากใบขอราคาผลิต"** (มติ 13) — `POST /api/pm/projects/[id]/deliveries/generate`
  อ่านบรรทัดวัสดุของใบ CR ที่อนุมัติแล้วของดีลนั้น แล้วสร้างแถวให้ครบ (`source='costing'`)
  · กดซ้ำไม่ได้แถวซ้ำเพราะ unique `(projectId, componentId)` · เพิ่ม/ลบ/พิมพ์เองทีหลังได้
- สรุปขึ้นขั้น `npd-38` / `re-order-11`: `x/y รายการมาแล้ว · ช้าสุด <วันที่>`
- คำร้อง `material_eta` = SA กดขอให้ PC อัปเดตทั้งชุด (ไม่ใช่ไล่ถามทีละตัว)
- เมนูสหมิตร `วัสดุ / Lead time` → `ของเข้า (สหมิตร)` (แก้ชื่อชนกันอย่างเดียว ไม่ยุบรวม)

### PR-5 — เก็บกวาด (แทรกก่อน PR-3 ตามมติผู้ใช้ 2026-07-29)

**ก้อนแรก (ไม่มี migration) — ทำแล้ว:**

- ✅ ย้ายทะเบียนวัสดุจาก `/sa/materials` → `/database/materials` (เมนู "ทะเบียนวัสดุ"
  ย้ายจากกลุ่ม "ขาย" ไปกลุ่ม "ฐานข้อมูล")
  - **cap ต้องคง `costing:view` + `canViewCosting` ไว้** ห้ามกลืนเป็น `products:view`
    ตามเพื่อนบ้านในกลุ่มนั้น — `products:view` อยู่ใน `DEFAULT_CAPS` แทบทุก role ถือ
    ส่วนแถวในทะเบียนนี้คือ**ราคาต้นทุน** เปิดกว้าง = ต้นทุนรั่วทั้งบริษัท
  - **URL ของ API คงเป็น `/api/sa/materials`** ไม่ย้ายตาม เพราะ allowlist ใน `proxy.js`
    ผูกกับ prefix นั้น และผู้ใช้ไม่เห็น path ของ API อยู่แล้ว
- ✅ แท็บ **"กลิ่น & สูตร"** บนหน้ารายละเอียดลูกค้า — `scents."customerId"` เป็น NOT NULL
  (มติ 9) ความสัมพันธ์ลูกค้า→กลิ่นจึงเป็น 1:N สมบูรณ์ ควรมีที่ยืนบนหน้าลูกค้า
  - อ่านผ่าน `customerRelations()` เส้นเดิม (ไม่เพิ่ม endpoint) · read-only
  - ⚠️ **สูตรกรองด้วย `customerId` ล้วนไม่พอ** — ช่องนั้นเป็น NULL ได้ (= สูตรกลาง)
    ต้องรวม "สูตรที่ผูกกลิ่นของลูกค้ารายนี้" ด้วย แล้ว dedupe ตาม id
  - ทะเบียนไม่มีหน้ารายละเอียดรายตัว → ลิงก์เป็น `?q=` (เปิดทะเบียนแล้วค้นให้)
    และตั้งตัวกรองเป็น "ทุกสถานะ" ไม่งั้นแถวที่เก็บเข้ากรุแล้วจะหายเงียบ ๆ
- ✅ แก้ปุ่ม "กลับรายการเคส" ใน `/sa/requests/[id]` ที่ยังชี้ `/sa/materials?tab=…`
  (ตกค้างจาก PR-2b — หน้านั้นไม่มีแท็บแล้ว · build/เทสต์จับ href ตายไม่ได้)

**ก้อนที่เหลือ (ต้องมี migration — ยังไม่ทำ):**

- `products.formulaName/formulaCode/formulaDate` → อ่านผ่าน `formulaId` แล้วค่อยเลิกใช้ช่องข้อความ
  (snapshot บนเอกสารที่ออกแล้วห้ามแตะ)
- `material_prices_identity_uk` เปลี่ยนจาก `formulaCode` (text) → `formulaId`
- ลบ scope `IQ` ออกจากเอกสารประกอบ

### PR-6 — รื้อเธรดให้จบ (mig เล็ก: drop 2 ตารางเก่า)

รายละเอียดใน §10 — ลีดมาใช้ component กลาง + เธรด QT/SO + ตอบยกคำพูด + drop
`personal_task_updates` / `sales_deal_activities`

### PR-7 — แจ้งเตือนรายคน + ตัวนับยังไม่ได้อ่าน (mig 0173)

รายละเอียดใน §11

### PR-0 — แยก executive ออกจาก admin (ทำแยกได้ทันที ไม่ต้องรอ PR อื่น)

รายละเอียดใน §9 — โค้ดล้วน ไม่มี migration · **แต่ต้องยืนยันก่อนว่ามีบัญชี executive
พร้อมลายเซ็นบน prod แล้ว** ไม่งั้นจะไม่มีใครอนุมัติราคาผลิตได้เลย

---

## 7. ความเสี่ยง & กฎที่ต้องเคารพ

| ความเสี่ยง | กันอย่างไร |
|---|---|
| migration 0169 ซ้ำสองไฟล์บน main | `npm run check:migrations` + SQL ตรวจ `prosrc` (ดูต้น §5) **ก่อน** ออก 0170 |
| ถอด `costing:approve` ออกจาก admin แล้วอนุมัติไม่ได้เลยตอนผู้บริหารไม่อยู่ | ใส่ไว้ใน `GRANTABLE_CAPS` — admin grant รายคนเองได้ ทิ้งร่องรอยใน audit (§9) |
| rename ตารางแล้ว PostgREST cache ค้าง | `NOTIFY pgrst, 'reload schema'` ท้ายทุก migration (มีในทุกไฟล์แล้ว) |
| ไฟล์แนบพังตอนเปลี่ยน entityType | ต่อครบ 5 จุด (ดู PR-2) — เคยพลาดมาแล้วสองรอบ (#733) |
| `Number(null) = 0` ทำ "ยังไม่รู้ราคา" กลายเป็น "ฟรี" | ใช้ `numberOrNull` ทุกจุดที่คำนวณต้นทุน |
| rev ของ**ราคา** เป็น immutable แต่ rev ของ**กลิ่น**แก้ได้ | อย่าลอก guard ของ `material_price_revisions` มาใส่ `scent_revisions` — feedback มาทีหลังวันส่ง |
| หมุดไทม์ไลน์หลุดตอน resync แม่แบบ | เก็บ `stepKey` ไม่ใช่ `projectTaskId` |
| endpoint ใหม่ 403 เงียบ ๆ | proxy เป็น allowlist default-deny — ลงทะเบียนทุกเส้นใหม่ |
| ฟอร์มสร้าง/แก้เพี้ยนหากัน | component เดียวสองโหมด (กฎ `webapp/AGENTS.md`) |
| Vercel ไม่ build หลัง merge | ตรวจ `gh api repos/SittipongSS/ss_system/deployments` เทียบ sha |

---

## 8. คำถามที่ยังไม่ได้ตัดสิน

**ปิดครบทุกข้อแล้ว** (มติรอบ 2 §1 ข้อ 7–10 · มติรอบ 3 ข้อ 13–15 ข้างล่าง)

### มติรอบ 3 (2026-07-28)

13. **รายการของเข้า: ระบบกางให้จากใบขอราคาผลิตที่อนุมัติแล้ว** — ใบ CR มีบรรทัดวัสดุครบอยู่แล้ว
    กดปุ่มเดียวได้ทั้งชุด PC เติมแค่วันที่ · ยังเพิ่ม/ลบ/พิมพ์แถวเองได้ (งานที่ไม่มีใบ CR)
14. **เธรดต้องมีแจ้งเตือน** → ต้องสร้างชั้นแจ้งเตือน**รายคน**ขึ้นใหม่ (ระบบตอนนี้มีแต่ Chat webhook
    เข้าห้องรวมของฝ่าย) — ดู §11
15. **ตัวนับยังไม่ได้อ่าน = derive จากแจ้งเตือนที่ยังไม่อ่าน** ไม่สร้างกลไกแยก · **ไม่ทำ watermark
    ต่อเธรดต่อคนแบบ Slack** (แพงและได้เพิ่มน้อย)

---

## 9. แยก role `executive` ออกจาก `admin` (มติข้อ 11)

### สภาพปัจจุบัน — ปนกันจุดเดียว แต่เป็นจุดที่สำคัญที่สุด

| role | ถือ `costing:approve` | ที่มา |
|---|---|---|
| `executive` | ✅ | `ROLE_CAPS.executive` — อำนาจเดียวที่เป็นของเขาคนเดียว |
| `admin` | ✅ | อยู่ใน `SUPERUSER_CAPS` (`lib/permissions.js:198`) — ตั้งใจให้เป็น break-glass |
| `ae_supervisor` | ❌ | ถูกกันไว้แล้วใน `SALES_HEAD_EXCLUDED` |

⇒ **admin อนุมัติราคาผลิตแทนผู้บริหารได้** ซึ่งขัดกับเจตนาว่า "ราคาผลิตอนุมัติโดยผู้บริหารเท่านั้น"
(มติ 2026-07-22) · ที่เหลือแยกกันดีอยู่แล้ว: executive ไม่มี `:edit`/`:act` ใด ๆ, ไม่มี `products:margin`,
ไม่มี admin-system caps (`users:manage`/`master:manage`/`audit:view`)

> `isSuperuser(admin)` เป็นเรื่อง **ขอบเขตข้อมูล (scope)** ไม่ใช่ **อำนาจ (capability)** — ไม่ต้องแตะ
> admin ต้องเห็นทุกทีมต่อไปเพื่อดูแลระบบ ที่ตัดคืออำนาจอนุมัติ

### สิ่งที่ทำ (โค้ดล้วน ไม่มี migration)

1. ถอด `'costing:approve'` ออกจาก `SUPERUSER_CAPS` → **admin ไม่มีอำนาจอนุมัติราคาผลิตอีกต่อไป**
2. เพิ่ม `'costing:approve'` เข้า `GRANTABLE_CAPS` + label
   `'อนุมัติราคาผลิต แทนผู้บริหาร (EX)'` — ผู้บริหารไม่อยู่/ยังไม่มีลายเซ็น admin **grant ให้ตัวเอง
   หรือคนอื่นเป็นครั้ง ๆ ได้** และการ grant ลง audit log (ต่างจาก break-glass เงียบ ๆ แบบเดิม)
   — แพตเทิร์นเดียวกับ `legal:approve` ที่ทำไว้แล้ว
3. `canApproveCosting` ไม่ต้องแก้ (เช็ค cap ตรง ๆ อยู่แล้ว ไม่มี `isSuperuser` ลัด)
4. `signatureCoverage.js` — cohort ผู้ต้องมีลายเซ็นต้องรวม **ผู้ที่ถูก grant** ไม่ใช่แค่ role `executive`
   ไม่งั้น grant แล้วกดอนุมัติไม่ได้อยู่ดี (ไม่มีลายเซ็น = อนุมัติไม่ได้)
5. เทสต์: `permissions.test.mjs` เพิ่มเคส "admin อนุมัติราคาผลิตไม่ได้" + "admin ที่ถูก grant ทำได้"

### ⚠️ ต้องเช็คก่อน merge

**มีบัญชี role `executive` อยู่จริงบน prod หรือยัง และเจ้าตัวอัปลายเซ็นแล้วหรือยัง** — ถ้ายังไม่มี
แล้วถอด break-glass ออก จะกลายเป็น **ไม่มีใครอนุมัติราคาผลิตได้เลยทั้งระบบ** (ผู้ใช้เก็บบัญชีไว้ใน
Supabase Auth app_metadata ไม่มีตาราง `public.users` ให้ตรวจจากภายนอก) → ตรวจที่หน้า `/users`
และ `/settings/signature-coverage` ก่อน แล้วค่อย merge

---

## 10. รื้อเธรดให้จบ (มติข้อ 12)

### เหลืองานน้อยกว่าที่แผน entity-updates เขียนไว้มาก

`docs/entity-updates-plan.md` วางไว้ 6 ขั้น และประเมินว่าขั้นสอบถาม/ดีล = "ความเสี่ยงสูง"
แต่**นับ prod จริง 2026-07-28 แล้วสมมติฐานนั้นไม่จริง**:

| ตาราง | prod | ผลต่อแผน |
|---|---|---|
| `entity_updates` | 654 (personal_task 653 · deal 1) | ของกลางใช้งานจริงแล้ว |
| `personal_task_updates` (เก่า) | 573 | ย้ายครบแล้ว **รอ drop** |
| `sales_deal_activities` (เก่า) | **0** | ย้ายครบ (ไม่มีอะไรให้ย้าย) **รอ drop** |
| `inquiry_messages` (เก่า) | **0** | **ตายไปกับ inquiries ใน 0171 ไม่ต้องย้ายเลย** |
| `mgmt_updates` | **ไม่มีตารางบน prod** | โมดูล mgmt พักอยู่ (mig 0076–0080 ไม่เคยรัน) — ข้ามไป |

⇒ ขั้น "สอบถาม RD" (ที่ประเมินว่าเสี่ยงสูงสุด) **หายไปทั้งขั้น** เพราะแผนนี้ลบ inquiries ทิ้ง
และขั้น mgmt ไม่มีของให้ทำ → เหลือของจริงแค่ 3 อย่าง

### สิ่งที่ทำ — PR-6 (ต่อท้าย PR-5)

1. **ยกหน้าลีดมาใช้ `UpdateThread` กลาง** — ตอนนี้เป็นฟีดอ่านอย่างเดียวที่เขียน CSS รางเวลาเอง
   (หน้าตาดีที่สุดในระบบตามที่แผนเดิมบันทึกไว้) → ย้ายมาใช้ของกลางผ่าน `extraItems`
   แล้ว **ลบ CSS รางเดิมทิ้ง** (ไม่งั้นเข้าอาการเดียวกับ `.premium-table` ที่วางทับแต่ไม่ลบของเก่า)
2. **เพิ่มเธรดให้ QT/SO** — เอกสารสองตัวนี้มี action 8 ตัวที่ควรลงเธรด (ยื่น/อนุมัติ/ตีกลับ/
   ดึงกลับ/ออก Rev. …) แต่ยังไม่มีเธรดเลย · `entityType` ใหม่ 2 ตัว + kind ตามคำศัพท์ที่ล็อกไว้
   (**ตีกลับ** = ผู้อนุมัติ · **ดึงกลับ** = ผู้ยื่นเท่านั้น · **ออก Rev.** — ห้ามใช้ "ถอน/ถอด")
3. **drop ตารางเก่า 2 ตัว** (mig เดียวกับ PR-6): `personal_task_updates`, `sales_deal_activities`
   — ตรวจจำนวนให้เท่ากันก่อน drop เสมอ
4. **เธรดใหม่ที่แผนนี้สร้าง** ประกาศใน `lib/master/updateTypes.js` + `updateAccess.js`:
   - `scent` — comment / `sent` (ส่งกลิ่น Rev N) / `feedback` (ผลตอบรับลูกค้า)
   - `dept_request` — ของเดิม `material_ask` เปลี่ยนชื่อ + kind ใหม่ตามชนิดคำร้อง
   - `material_delivery` — `eta_changed` / `arrived` (เปลี่ยนวันของเข้าต้องมีรอย)

### ยกระดับตัวเธรดเอง (ทำใน PR-6 ด้วย)

- **ตอบยกคำพูด (quote reply)** — ค้างมาจากแผน entity-updates · เธรดสองฝ่าย (SA ↔ RD/PC) ที่มี
  หลายรายการในเคสเดียว จำเป็นจริง ไม่งั้นไม่รู้ว่าตอบบรรทัดไหน
  > ⚠️ มติเดิมยังใช้อยู่: **ไม่ลอก nested reply / โหวตแบบ Reddit** — ยกคำพูดเป็นข้อความแบน
  > อ้าง id ข้อความต้นทาง (`meta.quotedId`) ไม่ใช่ต้นไม้ซ้อนชั้น
- **สวิตช์ซ่อนเหตุการณ์ระบบ** มีแล้ว (`isSystemUpdateItem`) — ตรวจว่าเธรดใหม่ทุกตัวประกาศ
  `authorable` ถูก ไม่งั้นข้อความคนจะถูกซ่อนไปกับเหตุการณ์ระบบ

(ตัดสินแล้วทั้งคู่: มีแจ้งเตือน + มีตัวนับ — ดู §11)

---

## 11. แจ้งเตือนรายคน + ตัวนับยังไม่ได้อ่าน (มติ 14/15)

### สิ่งที่ระบบมีตอนนี้ vs สิ่งที่ขาด

| ชั้น | สถานะ | ปัญหา |
|---|---|---|
| Google Chat webhook เข้า **ห้องรวมของฝ่าย** (8 space, `lib/chat.js`) | ✅ มีแล้ว | บอกไม่ได้ว่า *ใคร* ต้องทำ · ทุกคนในฝ่ายเห็นเหมือนกันหมด · **ไม่มีทางรู้ว่าใครอ่านแล้ว** |
| แจ้งเตือน**รายคน**ในแอป | ❌ ไม่มีเลย | คำตอบของ RD ที่ SA ไม่เห็น = งานค้างเงียบทั้งที่สถานะเขียนว่า "ตอบแล้ว" |
| ตัวนับยังไม่ได้อ่าน | ❌ ไม่มี | ต้องเปิดทุกเคสในคิวเพื่อดูว่ามีอะไรใหม่ |

**Chat webhook ไม่ถูกแทนที่** — มันยังเหมาะกับ "งานใหม่เข้าคิวฝ่าย" (ทั้งฝ่ายควรเห็น)
ส่วนตารางใหม่รับ "เรื่องที่คุณเกี่ยวข้องโดยตรง" · สองชั้นนี้ทำคนละหน้าที่

### ใครได้รับแจ้งเตือนบ้าง (กฎเดียวใช้ทุกเธรด)

เขียนที่ `lib/master/notificationRecipients.js` — **ที่เดียว** ห้ามให้แต่ละโมดูลคิดเอง

1. **ผู้เปิดคำร้อง** (`requestedById`) — เจ้าของเรื่อง
2. **ผู้รับเรื่อง** (`acknowledgedById`) — คนที่รับปากว่าจะตอบ
3. **คนที่เคยโพสต์ในเธรดนั้น** (participants — `DISTINCT authorId` จาก `entity_updates`)
4. **คนที่ถูกพาดพิง `@`** ในข้อความ (แม้ไม่เคยอยู่ในเธรด)
5. **ไม่ยิงกลับหาคนโพสต์เอง** — กฎข้อนี้ต้องอยู่ท้ายสุดเสมอ

> ⚠️ อย่าใช้ "ทุกคนในฝ่าย" เป็นผู้รับ — นั่นคือสิ่งที่ Chat webhook ทำอยู่แล้ว ถ้าทำซ้ำจะได้
> กล่องแจ้งเตือนที่ไม่มีใครอ่านภายในสัปดาห์เดียว

### เหตุการณ์ที่ยิงแจ้งเตือน

| เหตุการณ์ | ถึงใคร |
|---|---|
| มีข้อความใหม่ในเธรด | ผู้เกี่ยวข้องตามกฎข้างบน |
| ถูกพาดพิง `@ชื่อ` | คนนั้น (แม้ไม่เคยอยู่ในเธรด) |
| คำร้องถูกรับเรื่อง / ตอบครบ / ปิด / ตีกลับ | ผู้เปิดคำร้อง |
| ราคาผลิตอนุมัติ / ตีกลับ | ผู้ยื่นใบ |
| Feedback กลิ่นเข้ามา | RD เจ้าของกลิ่น |
| วันของเข้าเลื่อน / ของมาถึง | เจ้าของดีล + เจ้าของโครงการ |

### ตัวนับ (มติ 15 — ไม่ทำ watermark)

- **กระดิ่งบนแถบบน** = `count(*) WHERE userId = me AND readAt IS NULL`
- **ป้ายบนแถวในคิว** = นับ unread ต่อ `(entityType, entityId)` — "เคสนี้มี 3 เรื่องที่คุณยังไม่ได้ดู"
- **เปิดเธรด = mark read** ของ entity นั้นทั้งก้อน (1 UPDATE) ไม่ต้องรู้ว่าอ่านถึงข้อความไหน

**ที่ตั้งใจไม่ทำ:** watermark ต่อเธรดต่อคนแบบ Slack (เส้นคั่น "ข้อความใหม่", "อ่านถึงข้อความที่ 7
จาก 12") — ต้องมีตารางแยกและเขียนทุกครั้งที่เลื่อนดู แลกกับประโยชน์ส่วนเพิ่มที่น้อย

### ไฟล์ที่แตะ (PR-7)

| ไฟล์ | งาน |
|---|---|
| `supabase/migrations/0173_notifications.sql` | DDL |
| `lib/master/notificationTypes.js` (ใหม่) | ชุด kind + ป้าย/ไอคอน (แพตเทิร์นเดียวกับ `updateTypes`) |
| `lib/master/notificationRecipients.js` (ใหม่) | กฎผู้รับ **ที่เดียวของระบบ** |
| `lib/notifications.js` (ใหม่) | `notify()` fan-out + dedupe + mark read |
| `app/api/notifications/route.js` · `read/route.js` | กล่อง + ตัวนับ + mark read |
| `components/ui/NotificationBell.js` (ใหม่) | กระดิ่ง + dropdown ใน `AppLayout` |
| `components/ui/UpdateThread.js` | ยิง `notify()` ตอนโพสต์ + `@mention` picker |
| `src/proxy.js` | ลงทะเบียน `/api/notifications*` |
| cron | ลบแจ้งเตือนที่อ่านแล้วเกิน 90 วัน (ตารางนี้โตเร็วที่สุดในระบบ) |

### ความเสี่ยงเฉพาะของ PR นี้

| ความเสี่ยง | กันอย่างไร |
|---|---|
| ตารางโตเร็วมาก (fan-out 1 เหตุการณ์ = N แถว) | index มี partial `WHERE readAt IS NULL` + cron ลบของเก่า |
| แจ้งเตือนซ้ำจาก retry | unique `(userId, updateId)` ที่ระดับ DB ไม่พึ่ง client |
| ยิงหาคนโพสต์เอง = กล่องเต็มด้วยเสียงตัวเอง | กฎข้อ 5 ต้องอยู่ท้ายสุดเสมอ + เทสต์ครอบ |
| `@mention` ทำให้เห็นชื่อคนนอกสิทธิ์ | picker ต้องกรองด้วย scope เดิมของ entity นั้น ไม่ใช่ list ผู้ใช้ทั้งบริษัท |
