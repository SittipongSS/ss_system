# Sales ⊃ PM — แผนรวม "จัดการโครงการ" เข้าเป็นส่วนหนึ่งของ "บริหารงานขาย"

ต่อยอดจาก [`SALES_PM_ROADMAP.md`](SALES_PM_ROADMAP.md) (โมเดล 2 ชั้น deal↔project) —
**การตัดสินใจใหม่ (2026-07-08): ยกระดับจาก "2 ศูนย์กลางคู่กัน" เป็น "Sales เป็นแม่"**
ดีล (ต่อไปเรียก **โครงการ**) เป็น record ตั้งต้นเสมอ แล้วกระจายไปงานปลายน้ำ:

```
SA สร้างโครงการ (sales_deals)
  ├─► PM timeline (projects)        ← สร้างจากโครงการเท่านั้น (ปิดสร้างเดี่ยว)
  ├─► ใบเสนอราคา (quotations)       ← มีแล้ว ซ่อนด้วย SALES_FEATURES — เฟสอนาคต
  ├─► สรรพสามิต (excise)            ← มีแล้ว (from-project) เมื่อเข้าเงื่อนไข 01-002
  └─► การส่ง (shipment_prep)        ← มีแล้ว ซ่อนด้วย SALES_FEATURES — เฟสอนาคต
```

ยกเว้นเดียวที่สร้างโครงการอัตโนมัติ: **Sahamit PO** (settle เข้าดีล/สร้าง won-stub — ผ่านชั้น sales อยู่แล้ว จึงไม่ขัดกฎ)

---

## 0. ผลตรวจระบบ (2026-07-08) — ปัญหาที่พบ

| # | ปัญหา | หลักฐาน | ระดับ |
|---|---|---|---|
| P1 | **ลบดีลแล้วโครงการ PM ไม่ถูกลบ** — DELETE ลบเฉพาะ `sales_deals`; FK `sales_deals.projectId` เป็นขาออก จึงไม่มี cascade ไป `projects` → โปรเจกต์กำพร้า (`metadata.salesDealId` ชี้ดีลที่หายไป) | [`deals/[id]/route.js:138`](src/app/api/sales-planning/deals/%5Bid%5D/route.js) | 🔴 บั๊ก |
| P2 | ทิศกลับทำไว้แล้วแต่ทิศนี้ไม่มี — ลบโปรเจกต์ฝั่ง PM มี logic คืนดีลเข้า pipeline ([`pm/projects/[id]/route.js:196`](src/app/api/pm/projects/%5Bid%5D/route.js)) แต่ลบดีลไม่จัดการโปรเจกต์เลย | เทียบสอง route | 🔴 asymmetry |
| P3 | PM ยังสร้างโปรเจกต์เดี่ยวได้ (`POST /api/pm/projects` + ปุ่มหน้า /pm) — ขัดโมเดลใหม่ | [`pm/projects/route.js:47`](src/app/api/pm/projects/route.js) | 🟠 ต้องปิด |
| P4 | ปิด Won ไม่บังคับกรอก **มูลค่าจริง** — one-click win ใช้ `projectValue` (ค่าคาดการณ์) เป็นยอด Won ทันที; PATCH stage=won ก็ไม่บังคับ → ยอด Won/target gap เพี้ยนเมื่อยอดจริงต่างจากคาด | [`win/route.js`](src/app/api/sales-planning/deals/%5Bid%5D/win/route.js), `buildWinPatch` | 🟠 ฟีเจอร์ขาด |
| P5 | ไม่มีที่เก็บ "มูลค่าคาดการณ์" แยกจาก "มูลค่าปิดจริง" — ถ้า overwrite `projectValue` ตอน won ค่าคาดการณ์บนดีลหาย (เหลือแต่ใน `sales_deal_forecasts` history) | schema `sales_deals` | 🟠 |
| P6 | ลบดีลที่ settle จาก Sahamit PO ได้ → `sahamit_pos.dealId` SET NULL, junction FC cascade หาย = ยอด/ประวัติการจับคู่หาย | mig 0072/0073 | 🟡 governance |
| P7 | คำเรียกปนกัน — หน้า list/deals เรียก "โครงการ" แล้ว แต่ overview/detail/PM ยังปน "ดีล/deal/โปรเจกต์" | grep "ดีล" 20+ ไฟล์ | 🟡 สับสน |
| P8 | โปรเจกต์ PM เก่า (ก่อนมี sales-planning) ไม่ผูกดีล → มองไม่เห็นจากฝั่งขาย, ไม่เข้ายอด | ไม่มี backfill | 🟡 ข้อมูลค้าง |
| P9 | ลบโปรเจกต์: `project_tasks`/`project_products` cascade จริง แต่ `personal_tasks.projectId` / `project_doc_revisions.projectId` เป็น logical-only → แถวกำพร้า (สอดคล้อง memory: FK ไม่สม่ำเสมอ) | mig 0009/0010 vs 0019/0040 | 🟡 เก็บกวาด |

**สิ่งที่ดีอยู่แล้ว (ไม่ต้องรื้อ):** `markWon()` เป็น single source 3 ทางเข้า · ชื่อ deal↔project sync สองทาง ·
unique partial index กัน 1 project ผูกหลายดีล · quotation/shipment/excise มีโครงพร้อม (แค่ toggle ปิดไว้) ·
FC split/drift ฝั่งสหมิตรทำงานแล้ว

---

## 1. Decisions ที่ล็อกในรอบนี้

| # | เรื่อง | มติ |
|---|---|---|
| M1 | สันหลัง | **Sales เป็นแม่** — sales_deals คือ "โครงการ"; projects (PM) เป็นชั้น execution ใต้โครงการ |
| M2 | การลบ | ลบโครงการ (ดีล) → **ลบ PM project + ลูกทั้งหมดด้วย** (cascade ผ่าน API ไม่ใช่ FK); ผู้ลบต้องมีสิทธิ์ลบ project ด้วย (`canDeleteRecord`) ไม่งั้น 403 บอกเหตุผล |
| M3 | ลบฝั่ง PM | เอาปุ่ม/route ลบโปรเจกต์เดี่ยวออก — การลบทำที่โครงการ (แม่) ที่เดียว |
| M4 | สร้าง PM | ปิด `POST /api/pm/projects` (คง GET) + ปุ่ม "สร้างโปรเจกต์" หน้า /pm พาไปสร้างโครงการที่บริหารงานขาย; ทางสร้าง project เหลือ 2 ทาง: deal `create-project` + Sahamit PO |
| M5 | Won จริง | เพิ่ม `sales_deals.wonValue` — **บังคับกรอกตอนปิด Won** (prefill = projectValue); `projectValue` คงเป็นค่าคาดการณ์ตลอดชีวิตดีล |
| M6 | FC คงเหลือ | คงเหลือ = Σ คาดการณ์ของดีล **open เท่านั้น**; ดีลที่ won ออกจาก FC ทั้งก้อน — ส่วนต่างคาด vs จริง (variance) ไม่ค้างเป็น FC, โชว์เป็นรายงาน variance แทน; ยอด Won/target gap ใช้ `wonValue` |
| M7 | คำเรียก | rename UI ทั้งระบบ "ดีล"→"โครงการ"; ชื่อตาราง/route (`sales_deals`, `/sales-planning/deals`) **คงเดิม** ไม่ rename DB |
| M8 | PO-settled | ดีลที่มี `metadata.sahamitPoId` หรือ won แล้ว **ห้ามลบ** — ให้แก้/ยกเลิกด้วยวิธีอื่น (กันประวัติยอดหาย) |
| M9 | ข้อมูล PM เก่า | backfill: สร้างดีล stub ผูกทุก project ที่ยังไม่มีดีล (ดูเฟส 5) — ไม่ปล่อยเป็น 2 โลกถาวร |

---

## 2. เฟสงาน

### เฟส 1 · แก้บั๊กการลบ (P1/P2/P6/P9) — ทำก่อน เล็ก จบไว
- DELETE deal: ถ้า `projectId` → เช็ค `canDeleteRecord(user,'projects',project)`; ลบ project (tasks/products cascade DB) + ลบ `personal_tasks`, `project_doc_revisions`, `shipment_prep` ของ project ใน API; แล้วลบดีล (activities/history/forecasts/quotations cascade DB)
- กันลบ: ดีล won / มี `sahamitPoId` / มีทะเบียนสรรพสามิตผูก project → 409 พร้อมเหตุผล (M8)
- UI confirm บอกชัดว่าจะลบอะไรบ้าง ("จะลบ timeline PM x ขั้นตอน, เอกสารเตรียมส่ง ฯลฯ")
- ปิด DELETE ฝั่ง `/api/pm/projects/[id]` + ซ่อนปุ่มลบหน้า PM (M3)
- ไม่มี migration

### เฟส 2 · ทางเข้าเดียว (P3)
- `POST /api/pm/projects` → 403 ("สร้างโครงการที่บริหารงานขาย")
- หน้า /pm: ปุ่มสร้าง → ลิงก์ไป `/sales-planning/deals` (หรือเปิดโมดัลสร้างดีล+โครงการในคลิกเดียว — ฟอร์มดีลย่อ + ฟิลด์ PM ที่มีอยู่ใน create-project modal เดิม)
- ตรวจ callers ภายใน: sales `create-project` + sahamit `create-project` insert ตรง table อยู่แล้ว ไม่กระทบ

### เฟส 3 · Won จริง + FC (P4/P5) — migration `0081_sales_deal_won_value.sql`
- `ALTER TABLE sales_deals ADD COLUMN "wonValue" numeric` (+ backfill `wonValue = projectValue` ให้ดีล won เดิม)
- `markWon()` รับ `wonValue` **required** (ยกเว้น source สหมิตรที่คำนวณจาก PO coverage → ใช้ coveredValue เป็น wonValue อัตโนมัติ ซึ่งคือ "ยอดจริง" อยู่แล้ว)
- UI ปิด Won (หน้า list + detail): เปลี่ยน confirm → dialog กรอกมูลค่าจริง (prefill projectValue) + มัดจำ
- dashboard: `wonValue` KPI/รายคน/รายทีม/targetGap ใช้ `wonValue`; `remainingForecast` = open pipeline (สูตรเดิมให้ผลนี้อยู่แล้ว — เขียน comment ล็อกนิยาม M6); เพิ่มแถว variance (Σ projectValue − Σ wonValue ของดีล won)
- PATCH: ห้ามแก้ `projectValue` หลัง won (คาดการณ์ freeze); แก้ `wonValue` ได้ (สิทธิ์ senior_ae+)

### เฟส 4 · Rename + IA รวมระบบ (P7)
- กวาดคำ UI: "ดีล/deal" → "โครงการ" ทุกหน้า sales-planning + PM + สหมิตร (label เท่านั้น)
- แก้ปัญหาชื่อชน: ฝั่ง PM เรียกสิ่งที่ตัวเองถือว่า "แผนงาน/timeline ของโครงการ" ไม่เรียกโปรเจกต์ลอย ๆ
- Sidebar/hub: ย้าย PM เข้าไปเป็นเมนูย่อยใต้ "บริหารงานขาย" (หรือแท็บในหน้าโครงการ) — จุดเข้าโครงการเดียว, หน้า deal detail เป็นศูนย์รวม (overview มีอยู่แล้ว) โชว์: ข้อมูลขาย · timeline PM · ใบเสนอราคา (เฟสอนาคต) · สรรพสามิต · การส่ง (เฟสอนาคต) — ส่วนที่ยังไม่เปิดใช้ แสดง placeholder "อยู่ในแผนเฟสถัดไป" ตาม `SALES_FEATURES`
- stage `in_project` เลิกใช้จริงแล้ว (winStageForProject คืน won เสมอ) → data-migration ย้ายดีลเก่า `in_project`→`won` + ตัดออกจาก CHECK/labels ในรอบ migration เฟส 3

### เฟส 5 · Backfill ข้อมูล PM เก่า (P8, ตอบคำถาม "ข้อมูลใน PM ที่ยังไม่ผูกจะทำไง")
สองชั้น:
1. **สคริปต์/endpoint ครั้งเดียว** (superuser): ทุก `projects` ที่ไม่มีดีลชี้ → สร้างดีลผูกอัตโนมัติ
   - stage: `timeline_proposed` (มีไทม์ไลน์แล้วแต่ **ยังไม่ปิดการขาย** — ผู้ดูแลตัดสินใจปิด Won เอง ไม่เหมาเป็น won), `wonValue = null`, `projectValue = 0`
   - `metadata: { source: 'pm-backfill', needsReview: true, bypassPipeline: true }` → **ไม่เข้า FC/ยอดเดือนปัจจุบัน** (forecastMonth = null) จนกว่าจะเติมมูลค่า
   - owner/team/customer ดึงจาก project (`ownerId`, `team`, `customerId`)
2. **หน้า/แถบตรวจ** ใน sales-planning: ตัวกรอง "รอเติมข้อมูล (backfill)" ให้ AE เจ้าของไล่เติม `projectValue`/เดือน (หรือปิด Won ด้วย `wonValue`) แล้วปลดธง `needsReview` อัตโนมัติ
- ระหว่างยังไม่ backfill: หน้า PM list ติดป้าย "ยังไม่ผูกโครงการขาย" ให้เห็นชัด

### เฟส 6 · เปิดฟีเจอร์ที่พักไว้ (ตามลำดับความพร้อม ไม่บล็อกกัน)
- ใบเสนอราคา: เปิด `SALES_FEATURES.quotations` (โครง+approval มีแล้ว 0065/0070)
- การส่ง: เปิด `SALES_FEATURES.shipment` (0067 มีแล้ว)
- สรรพสามิต: มีแล้ว — เพิ่มเงื่อนไขอัตโนมัติ: ดีล won + project หมวด `01-002` → การ์ดเตือน "ต้องจดทะเบียนสรรพสามิต" ในหน้าโครงการ

---

## 3. Migration ที่จอง (เลขจริงตอน merge — ล่าสุดตอนเขียน = 0080)

| เฟส | migration |
|---|---|
| 3 | `0081_sales_deal_won_value.sql` — `wonValue` + backfill won เดิม + data-migration `in_project`→`won` + แก้ CHECK |
| 5 | ไม่มี (ใช้ endpoint backfill; ดีล stub ใช้ schema เดิม) |

> รันมือบน Supabase SQL Editor ก่อน deploy + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow)

## 4. ความเสี่ยง

| เสี่ยง | กัน |
|---|---|
| AE ลบดีล → ลบ timeline PM ที่ทีมทำไปแล้ว | M2: ต้องมีสิทธิ์ลบ project (superuser/senior_ae ทีมตัวเอง) + M8 ห้ามลบ won/PO/มีทะเบียนภาษี |
| ปิดสร้าง PM เดี่ยวแล้วงานรีบไม่มีทางเข้า | โมดัลรวม "สร้างโครงการ + timeline" คลิกเดียวจากฝั่งขาย (เฟส 2) |
| backfill สร้างดีลผิดเจ้าของ/ทีม | needsReview + หน้าไล่ตรวจ (เฟส 5) ก่อนนับยอด |
| rename แล้วผู้ใช้งง ดีลเก่า=โครงการใหม่ | ทำเฟส 4 หลังพฤติกรรม (ลบ/สร้าง/won) นิ่งแล้ว สื่อสารครั้งเดียว |
