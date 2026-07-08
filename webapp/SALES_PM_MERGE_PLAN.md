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

## 0.5 ผลตรวจระบบรอบ 2 (2026-07-09)

**สถานะเฟส:** เฟส 1–5 เสร็จและ merge เข้า main แล้ว (mig 0081 wonValue + 0082 drop in_project · sidebar รวมเหลือ 4 เมนูใต้ `/sa` ใน PR #158) — P1–P9 รอบแรกปิดหมด. เหลือเฟส 6 (เปิดฟีเจอร์ที่พักไว้) ยังไม่เริ่ม.

ปัญหาที่พบรอบนี้ (ยังไม่แก้):

| # | ปัญหา | หลักฐาน | ระดับ |
|---|---|---|---|
| N1 | **ปิด Won ผ่าน PATCH ไม่ปลดธง `needsReview`** ของดีล pm-backfill — เช็ค `filledWon` ก่อน `buildWinPatch` ตั้ง `wonValue` + `Object.assign(patch, buildWinPatch(...))` เขียนทับ `patch.metadata` กลับเป็นค่าเดิม → ดีลปิด Won แล้วแต่ยังไม่เข้ายอด/FC (ขัด comment ในโค้ดเอง) | `deals/[id]/route.js:85-106` | 🔴 บั๊ก |
| N2 | **เกณฑ์อนุมัติใบเสนอราคาถูก client คุมได้** — `body.metadata.approvalThreshold` ส่งเข้า `quoteApprovalRequirement` ตรง ๆ → AE ตั้ง threshold สูงลิ่วให้ใบเสนอ 2M เป็น `not_required` แล้ว accept ได้โดยไม่ผ่านหัวหน้า (API ยิงตรงได้แม้ `SALES_FEATURES.quotations` ปิด UI อยู่) | `deals/[id]/quotations/route.js:117`, `lib/quotationApproval.js:8` | 🔴 ช่องโหว่ |
| N3 | **Accept ใบเสนอไม่มี guard** — re-accept ซ้ำได้ (insert `sales_deal_forecasts` ซ้ำทุกครั้ง + เขียนทับ `projectValue` ด้วย `totalAmount||0` → มูลค่าโดนล้างเป็น 0 ได้), ดีล `deposit_pending` ถูกดึง stage ถอยหลังเป็น `awaiting_confirm`, accept ใบที่สองทับใบแรกเงียบ ๆ | `quotations/[id]/accept/route.js:22-70` | 🔴 ช่องโหว่ |
| N4 | **เป้าขายรั่วถึง AE** — filter ทีมทำเฉพาะ scope `team`; AE (scope `own`) ข้าม filter → เห็นเป้าทุกคน/ทุกทีม/เป้า SA รวม ทั้งที่นโยบายให้เป้า SA รวมเป็น superuser-only (จุดเดียวกันใน dashboard คืน `targets` + `byOwner` ดิบทั้งบริษัท) | `targets/route.js:25-27`, `dashboard/route.js:18-19,141` | 🟠 สิทธิ์ |
| N5 | **POST สร้างดีล stage=won ข้าม win-flow** — บังคับแค่ `depositPaid` ไม่บังคับ `wonValue` (ขัด M5) → ยอด Won ใช้ fallback `projectValue`; (`in_project` โดน DB CHECK 0082 กันแล้วแต่โค้ด `DEAL_STAGES` ยังรับ → insert พัง 500) | `deals/route.js:74-94` | 🟠 |
| N6 | **KPI เป้าทีมนับซ้ำ** — เป้า SA รวม (team=null) ตกใน bucket "ไม่ระบุ" แล้วถูกบวกรวมกับเป้ารายทีม → เป้า 10M+10M โชว์ 20M, targetGap เพี้ยน | `dashboard/route.js:92-121` | 🟠 |
| N7 | forecast-reviews GET: AE (scope own) ส่ง `?team=ODM` อ่านผลรีวิว/ยอด/โน้ตของทีมอื่นได้ | `forecast-reviews/route.js:18-21,54-61` | 🟠 สิทธิ์ |
| N8 | create-project: ถ้า insert `project_tasks` พัง → project ถูกสร้างแล้วแต่ไม่ผูกดีล (โปรเจกต์กำพร้าแบบที่ backfill มีไว้ซ่อม); rollback ตอน link ชนกันลบ project แต่ไม่ลบ tasks/products ที่ insert ไปแล้ว | `deals/[id]/create-project/route.js:98-141` | 🟠 |
| N9 | เก็บตก (ต่ำ): PATCH target ส่ง `ownerName` โดยไม่ส่ง `ownerId` → ชื่อโดนล้าง · qty=0 ในใบเสนอถูก coerce เป็น 1 · targets/bulk ไม่ transactional · approve/reject ใบเสนอไม่เช็คสถานะปัจจุบัน · `applyDealScope` own ฝัง `user.name` ดิบใน `.or()` (ชื่อมี `,`/`(` พัง) · backfill พึ่ง unique(projectId) ที่ไม่แน่ว่ามี | หลายไฟล์ | 🟡 |

> ลำดับแนะนำ: N2/N3 ปิดก่อนเปิด `SALES_FEATURES.quotations` (เฟส 6 ห้ามเปิดจนกว่าจะแก้) · N1/N4/N5/N6 แก้ได้เลยไม่ต้องรอ · N7-N9 เก็บกวาดรอบถัดไป

ฝั่ง UI (ตรวจ 4 หน้า + components):

| # | ปัญหา | หลักฐาน | ระดับ |
|---|---|---|---|
| U1 | **กริดวางเป้า: กรอกเป้าปี + แก้เดือนใน node เดียวกันแล้วกดบันทึก → 409** — `saveMonth` ตัดสิน POST/PATCH จาก snapshot เก่า; `distributeYear` สร้าง 12 แถวไปแล้ว → override เดือนยิง POST ซ้ำชน unique → บันทึกค้างครึ่งทาง แก้ทาง: ให้ override เดือนวิ่งผ่าน `/targets/bulk` (match ด้วย period/team/ownerId) | `targets/page.js:233,264-272` | 🔴 บั๊ก |
| U2 | **modal แก้ไขดีล (หน้า detail) ล้าง `customerName` เงียบ ๆ** — PATCH `selected?.name \|\| null` ไม่มี fallback; ถ้าโหลด customers พลาด/ลูกค้า pending ถูกซ่อน → เซฟทีเดียวชื่อลูกค้าหาย (หน้า list มี fallback ถูกแล้ว แต่หน้า detail ตกหล่น) | `deals/[id]/page.js:386` เทียบ `deals/page.js:140` | 🟠 บั๊ก |
| U3 | **ปุ่มลบโชว์ให้ AE/AC ทั้งที่ API จะ 403 เสมอ** เมื่อดีลมี PM project ผูก (`deleteScope('ae','projects')='none'`) — ผู้ใช้กดยืนยัน dialog น่ากลัวแล้วเจอ 403; เคสมีทะเบียนสรรพสามิต (409) ก็ซ่อน/disable ได้จาก `data.exciseRegistrations` ที่หน้า detail ถืออยู่แล้ว | `deals/page.js:534`, `deals/[id]/page.js:416` vs API `:190-194` | 🟠 UX |
| U4 | `deleteDeal` หน้า list ไม่มี try/catch (ตัวเดียวในหน้านี้) → network พัง = unhandled rejection ไม่มี banner | `deals/page.js:157-165` | 🟡 |
| U5 | ดีลเก่า stage `in_project`: select ใน modal แก้ไข render ว่าง (ไม่มี option) — ผู้ใช้เผลอเลือกอะไรก็ demote ดีลปิดแล้ว; ตัวกรอง stage หน้า list ก็เลือก in_project ไม่ได้ | `deals/page.js:572`, `deals/[id]/page.js:866` | 🟡 |
| U6 | เก็บตก: แถวสมาชิกกริดเป้าไม่มี React key (`targets/page.js:392`) · `GapNote` ไม่ส่ง `allocLabel` (label ตาย) · วันที่ดิบ `YYYY-MM-DD` หลายจุดไม่ผ่าน `fmtDate` · variance hint โชว์เลขติดลบกำกวมเมื่อปิดสูงกว่าคาด | หลายจุด | 🟡 |

**ผ่านเกณฑ์:** ไม่มี auto-save ทุกหน้า (กริดเป้า stage→ปุ่มบันทึก ตามกฎ) · API contract ตรงทุกเส้น · Won gating UI↔API สอดคล้อง · `buildWinPatch` merge metadata ไม่ทับ `sahamitPoId`.

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
- ใบเสนอราคา: เปิด `SALES_FEATURES.quotations` (โครง+approval มีแล้ว 0065/0070) — **ห้ามเปิดจนกว่า N2/N3 (ส่วน 0.5) จะถูกแก้**
- การส่ง: เปิด `SALES_FEATURES.shipment` (0067 มีแล้ว)
- สรรพสามิต: มีแล้ว — เพิ่มเงื่อนไขอัตโนมัติ: ดีล won + project หมวด `01-002` → การ์ดเตือน "ต้องจดทะเบียนสรรพสามิต" ในหน้าโครงการ

### เฟส 7 · Requirement เพิ่ม (2026-07-09) — UX รอบเก็บงาน

| # | งาน | รายละเอียด / จุดแตะ |
|---|---|---|
| R1 | **ตัดช่อง "อีเมลลูกค้า" ออกจาก modal เพิ่ม/แก้ PM** | ลบ field ใน `components/pm/ProjectFormModal.js:268-271` (+ตัดจาก `blank`); ฝั่ง server `create-project` เติม `customerEmail` จาก `customers.email` แทน (แบบเดียวกับ sahamit create-project ทำอยู่แล้ว) — คอลัมน์/allowlist PATCH คงไว้เพื่อข้อมูลเก่า; `lib/tax/requirements.js` อ่านจาก customer record อยู่แล้ว ไม่กระทบ |
| R2 | **ย้ายปุ่มแก้ไข/ลบ (หน้า detail) ขึ้นแถวเดียวกับปุ่มย้อนกลับ + เป็น icon-only** | เพิ่ม prop `backActions` ใน `components/ui/Workspace.js` (แถว back link เดิมเป็น `<Link>` เดี่ยว → ทำเป็น flex row มี slot ขวา); หน้า `deals/[id]` ย้ายปุ่มแก้ไข/ลบจาก `headerRight` ไป `backActions` เป็น `btn-icon` (title+aria-label); ปุ่ม Won/ไม่ไปต่อ/จัดการโครงการ คงอยู่ headerRight — ทำพร้อมกันกับ U3 (ซ่อนปุ่มลบเมื่อไม่มีสิทธิ์ลบ project/มีทะเบียนภาษี) |
| R3 | **FC โอกาสปิด (20/50/80/100%) เป็น dropdown ตอนเพิ่ม/แก้โครงการ + โชว์หน้าภาพรวม** | backend รองรับแล้ว (`probability` มีใน POST/PATCH + schema) — งานคือ UI: dropdown 4 ค่า (20/50/80/100) ใน modal สร้าง+แก้ (`initialDealForm` ใน `components/salesPlanning/ui.js`), default ตาม stage; แสดง badge FC% ในตาราง list + หน้าภาพรวม (การ์ด pipeline แยกตาม FC% หรือคอลัมน์ในตารางรายทีม/รายคน) · **นิยามคงเดิม (M6): FC = projectValue เต็ม ไม่ weight ด้วย %** — % เป็นข้อมูลช่วยตัดสินใจ/กรอง ไม่เปลี่ยนสูตรยอด (dashboard มี `weighted` อยู่แล้วถ้าจะโชว์คู่) |
| R4 | **rename "สร้างโครงการ (PM)" / "โครงการ PM" → "จัดการโครงการ" + ปุ่มถาวรในหน้า detail** | จุดแตะ: ปุ่ม nextAction `create_project` + ลิงก์ headerRight "โครงการ PM" (`deals/[id]/page.js:459,477`) + ปุ่มแถวตาราง (`deals/page.js:486`) + `createLabel` ของ `ProjectFormModal` + heading "งานผลิต (PM)"; พฤติกรรมปุ่มใน detail: ยังไม่มี project → เปิด modal สร้าง, มีแล้ว → ลิงก์ไป `/sa/projects/[id]` — โชว์เสมอ (ไม่รอ nextAction) |
| R5 | **ความเคลื่อนไหว (activities) แนบรูปได้ + พรีวิว + เก็บบน Google Drive** | ใช้ infra เดิม: `/api/upload` มี Drive backend แล้ว (`STORAGE_BACKEND=drive` + `lib/drive.js`) → resolve โฟลเดอร์ลูกค้าจาก deal.customerId; เก็บ ref ใน `sales_deal_activities.attachments jsonb` (mig ใหม่ — จองเลข `0083_sales_activity_attachments.sql`, เลขจริงตอน merge) หรือใช้ตาราง `attachments` กลาง (`entityType='sales_activity'`) — **เลือกตาราง attachments กลาง** เพื่อได้ proxy คุมสิทธิ์/ประเภทไฟล์เดิม (จำกัด รูป+PDF 10MB ตามกฎ upload เดิม); UI: ปุ่มแนบใน composer + thumbnail แถว activity + คลิกเปิด lightbox พรีวิว |
| R6 | **เมนู: เหลือทางเข้าเดียวใต้ `/sa`** | ✅ ทำแล้วบน main (PR #158): sidebar เหลือ ภาพรวม·โครงการ·วางเป้าหมาย·งานของฉัน; `/pm/*` redirect เข้า `/sa/*` หมดแล้ว — ถ้ายังเห็นเมนู "ภาพรวมงานผลิต/โครงการผลิต" ใน prod = deploy ยังไม่ล่าสุด · งานเก็บ: ลบ dead page `app/pm/page.js` + `app/pm/projects/page.js` (โดน redirect ครอบ ไม่มีทางเข้าถึงแล้ว) · เมนู "งานของฉัน" คงไว้ (ฐานของ task management ที่จะทำต่อ) |

> แนะนำจัดรอบทำ: (1) แก้บั๊กเร่งด่วน N1+U1+U2+N4/N6 → (2) เฟส 7 R1-R4+R6 (UI ล้วน ไม่มี migration เร็ว) → (3) R5 (มี migration + Drive) → (4) เฟส 6 หลังปิด N2/N3

---

## 3. Migration ที่จอง (เลขจริงตอน merge — ล่าสุดตอนเขียน = 0080)

| เฟส | migration |
|---|---|
| 3 | `0081_sales_deal_won_value.sql` — `wonValue` + backfill won เดิม ✅ รันแล้ว |
| 4 | `0082_sales_deal_drop_in_project_stage.sql` — data-migration `in_project`→`won` + แก้ CHECK ✅ รันแล้ว |
| 5 | ไม่มี (ใช้ endpoint backfill; ดีล stub ใช้ schema เดิม) |
| 7 (R5) | `0083_sales_activity_attachments.sql` — ถ้าใช้ตาราง `attachments` กลาง อาจไม่ต้องมี mig (เช็ค CHECK ของ `entityType` ก่อน — ถ้า constrain ต้องเพิ่มค่า `sales_activity`) |

> รันมือบน Supabase SQL Editor ก่อน deploy + `NOTIFY pgrst, 'reload schema'` (memory: deploy-workflow)

## 4. ความเสี่ยง

| เสี่ยง | กัน |
|---|---|
| AE ลบดีล → ลบ timeline PM ที่ทีมทำไปแล้ว | M2: ต้องมีสิทธิ์ลบ project (superuser/senior_ae ทีมตัวเอง) + M8 ห้ามลบ won/PO/มีทะเบียนภาษี |
| ปิดสร้าง PM เดี่ยวแล้วงานรีบไม่มีทางเข้า | โมดัลรวม "สร้างโครงการ + timeline" คลิกเดียวจากฝั่งขาย (เฟส 2) |
| backfill สร้างดีลผิดเจ้าของ/ทีม | needsReview + หน้าไล่ตรวจ (เฟส 5) ก่อนนับยอด |
| rename แล้วผู้ใช้งง ดีลเก่า=โครงการใหม่ | ทำเฟส 4 หลังพฤติกรรม (ลบ/สร้าง/won) นิ่งแล้ว สื่อสารครั้งเดียว |
