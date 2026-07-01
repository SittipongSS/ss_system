# SAHAMIT UI Revamp Plan — Forecast / PO / Reconciliation

พอร์ตดีไซน์ที่ขัดเกลาแล้วจาก **ss-cj** (`D:\SS-CJ-ANG`, Vite SPA) เข้าโมดูล SAHAMIT ของ **ss-team** (Next.js).
โมดูล SAHAMIT ทำ backend + logic ครบแล้ว (เฟส 0–5, ดู memory `sahamit-module-plan`) — งานนี้คือ **ยกระดับ UI/UX ของหน้าจอ** ให้เท่าภาพต้นฉบับ ไม่ใช่สร้างระบบใหม่

> เอกสารต้นฉบับ ss-cj (ground truth):
> - Forecast: `src/components/ForecastsManager.jsx`, `src/components/forecasts/ForecastGrid.jsx`, `ForecastAddForm.jsx`
> - PO: `src/components/POManager.jsx`, `src/components/pos/POAddForm.jsx`
> - Reconcile: `src/components/ReconciliationGrid.jsx`
> - Theme: `src/index.css`

---

## ข้อค้นพบสำคัญ (ลดความเสี่ยง)

**CSS ที่ต้องใช้ถูกพอร์ตมาแล้ว** ใน `webapp/src/app/globals.css`:
- `.reconcile-grid` + sticky ซ้าย/ขวา (บรรทัด ~1056–1140)
- `.grid-cell-box` + `.match/.over/.unforecasted/.pending/.covered/.discrepancy/.exceeded` (บรรทัด ~1167–1290)
- `.glass-panel`, `.glow-gold/.glow-emerald`, `.premium-table`, `.tabs-header/.tab-btn`, `.segmented`, `.ui-badge`, `.status-pill`

→ หน้า `reconcile/page.js` ปัจจุบันใช้ `premium-table` + inline `color-mix` เอง **ทั้งที่ class ที่สวยกว่ามีอยู่แล้ว** งานส่วนใหญ่จึงเป็น **rewrite component ให้ไปใช้ class เดิม** ไม่ใช่พอร์ต CSS

---

## จุดตัดสินใจที่ล็อกแล้ว (2026-07-02)

1. **Reconcile drill-down = หน้าเต็มแยก route** `/sahamit/reconcile/[fgCode]/[month]` (3 แท็บ) — แก้ปัญหา "modal แสดงผลไม่พอ" ตรงจุด, refresh/แชร์ลิงก์ได้
2. **Forecast รอบ = นับทุกการลง แต่ "แก้ไขได้"** (ทางเลือก B จาก [[sahamit-forecast-round-counting]], ล็อก 2026-07-02) — การลงใหม่ = สร้างรอบใหม่ (`POST /forecast/rounds`, roundNo=last+1) เหมือนเดิม **แต่รอบไม่ immutable อีกต่อไป**: ต้องแก้รอบที่ลงผิด/ลืม/เออเรอร์ได้ (แก้ receivedDate/note/coverMonths + แก้ qty ต่อช่อง/เพิ่ม-ลบ SKU-เดือน + ลบรอบ). Save รอบเดิม = **แทนที่ lines ทั้งรอบ (replace)** ผ่าน `PATCH /forecast/rounds/[id]` (ต้องสร้างใหม่). Peak/diff คำนวณสดจาก snapshot → แก้รอบแล้วถูกต้องเอง
3. **เพิ่ม field "สถานที่ส่ง" ให้ PO** (บางปะกง/โพธาราม/ขอนแก่น) — ต้อง migration ใหม่
4. **เส้นแบ่ง LD 60/90 บนกริด = เลื่อนออกจากเฟส A** (ยังไม่วาดตอนนี้) แต่ **logic Leadtime ห้ามลืม/ห้ามแตะ**

---

## ⚠️ กฎ Leadtime (ต้องคงไว้ทุกเฟส — อย่าลืม)

โมเดล 6 วันของ PO อยู่ใน `webapp/src/lib/sahamit/material.js` แล้ว **ห้ามแก้ตรรกะ:**
- `docDate` → **`receivedDate` = จุดเริ่มนับ** → `dueDate` (ลูกค้าอยากได้)
- **`recommendedReadyDate` = receivedDate + lead (60 in-FC / 90 out-FC วันทำการ)** = guideline
  - นับ **วันทำการ** ด้วย `addBusinessDays` (`lib/pm/dateHelpers`) + **holidays จากตาราง** ([[holiday-calendar-system]]) — **ห้าม hardcode วันหยุด**
  - `in-FC` = (fgCode, deliveryMonth) มี FC > 0 → 60 วัน; ไม่งั้น 90 วัน
- `expectedDate` (default = recommended, เลื่อนได้) → `actualDeliveredDate`
- ช้า 2 ระดับ: แนะนำเลย due = PO มาช้า (ไม่ผิดเรา) / ส่งจริงเลยแนะนำ = เราช้า

เส้นแบ่ง LD บนกริด reconcile เป็นแค่ **การ visualize กฎนี้** — เลื่อนไปทำหลังเฟส A (ดูท้ายเอกสาร)

---

## เฟส A — Reconcile Matrix ยกเครื่อง (คุ้มสุด, ทำก่อน)

**ไฟล์:** `webapp/src/app/sahamit/reconcile/page.js`, `webapp/src/lib/sahamit/reconcileClient.js`, `material.js`

0. **เก็บ toggle 3 มุมมอง `FC vs PO` / `FC` / `PO`** (`.segmented`) ไว้ — ผู้ใช้ชอบ อย่าเอาออก
1. เปลี่ยน markup จาก `premium-table` → `<table class="reconcile-grid">` ใน `.reconciliation-container`
   - sticky ซ้าย = SKU (ชื่อ + fgCode mono + badge หมวด/ปริมาตร), sticky ขวา = รวม FC
2. Cell = `<div class="grid-cell-box {status}">` แทน inline color-mix:
   - บรรทัด FC (`cell-lbl` + `cell-val fc`) / บรรทัด PO (`cell-val po`) / `cell-status-tag`
   - 🔒 มุมขวาบนถ้า locked, ⇄ มุมซ้ายบนถ้ามี coverage
   - 💡 "แนะนำดึงจาก {เดือน} (+n)" / "แนะนำโยกไป {เดือน} (−n)" — ดึงจาก coverage suggestion ที่ `reconcileClient` คำนวณอยู่แล้ว
3. Legend สถานะครบ (match/over/discrepancy/pending/unforecasted/covered/shifted)
4. คลิก cell → `router.push('/sahamit/reconcile/{fgCode}/{month}')` (แทนเปิด modal)

> **เฟส A ยังไม่ทำเส้นแบ่ง LD 60/90** (ตัดสินใจ 2026-07-02) — เลื่อนไปเฟสหลัง. อย่าลบ/แตะ logic LD ใน `material.js` และห้ามลืมกฎ Leadtime ด้านล่างเวลาทำ cell/สถานะ

**ทดสอบ:** render ทุก view (FC / PO / FC-vs-PO), สีสถานะตรง `reconcile.js`

---

## เฟส B — Drill-down เป็นหน้าเต็ม (หัวใจของงาน)

**ไฟล์ใหม่:** `webapp/src/app/sahamit/reconcile/[fgCode]/[month]/page.js` (+ layout guard เดิม)
**Reuse:** `reconcileClient.cellDetail()`, `CoveragePanel` เดิม (แตกเป็น section)

โครง 3 แท็บ (ใช้ `.tabs-header/.tab-btn`):

- **แท็บ 1 · ภาพรวม**
  - หัว: ชื่อสินค้า + fgCode + เดือน + ปุ่มกลับ (`Workspace` header)
  - การ์ดเทียบ PO vs FC + ข้อความส่วนต่าง ("ขาดอีก n" / "เกินแผน +n") + progress bar สี status
  - inline edit FC + ปุ่ม 🔒 ล็อก/ปลดล็อก (เดิมอยู่ใน modal — ย้ายมา)
- **แท็บ 2 · เอกสารอ้างอิง**
  - FC ทุกรอบของเดือนนี้ (roundNo / receivedDate / qty / สถานะยังอยู่เดือนเดิม–เลื่อนแล้ว)
  - PO ทุกใบส่งเดือนนี้ (เลข PO mono / qty / มูลค่า / วันสั่ง / กำหนดรับ / ส่งจริง)
- **แท็บ 3 · ชดเชยยอดข้ามเดือน**
  - รายการ coverage รับเข้า/ส่งออก + ปุ่มยืนยัน/ลบ + คำแนะนำ 💡 + date picker วันอัปเดต
  - เนื้อจาก `CoveragePanel` เดิม

**API:** ไม่ต้องเพิ่ม — ใช้ `/forecast/rounds`, `/po`, `/coverage`, `/locks` เดิม (page เป็น client component fetch เอง หรือ pass ผ่าน server component)

**ทดสอบ:** เข้า URL ตรง ๆ ได้, refresh คงหน้า, back กลับกริด, edit/lock/coverage ยังทำงาน

---

## เฟส C — Forecast Matrix Grid tab

**ไฟล์:** `webapp/src/app/sahamit/forecast/page.js`, reuse `forecastClient.roundMatrix()`, `ForecastImportModal` เดิม

- เพิ่ม segmented 3 แท็บ: **รายการสินค้า (Overview)** / **ตารางจัดการ (Matrix Grid)** / **ประวัติ (History)**
  - Overview = สรุปต่อ SKU (รวม, รอบล่าสุด, อัปเดตล่าสุด)
  - Matrix Grid = กริดแก้สด SKU×เดือน (`premium-table` sticky) — input ต่อช่อง + วันที่อัปเดต + ✓ ถ้า lock + ทินต์เหลืองถ้าต่างจากรอบล่าสุด + คอลัมน์รวม + footer รวม
  - History = list รอบเดิม + `RoundComparison`
- **โหมดกริด 2 อย่าง (ตัดสินใจ #2 = ทางเลือก B):**
  - **ลงใหม่** (default) → `POST /forecast/rounds` สร้างรอบใหม่ (roundNo=last+1) → RoundComparison โชว์ diff เทียบรอบก่อน
  - **แก้รอบเดิม** (เลือกรอบจาก History/dropdown แล้วกด "แก้") → prefill กริดด้วย lines รอบนั้น → Save = `PATCH /forecast/rounds/[id]` **แทนที่ lines ทั้งรอบ** + แก้ receivedDate/note/coverMonths ได้ + ปุ่มลบรอบ
- **รีเช็ควันที่รับซ้ำ (guard แบบ soft):** ตอน "ลงใหม่" ถ้า `receivedDate` ตรงกับรอบที่มีอยู่ → เตือน "วันที่รับนี้เคยลงรอบ #N แล้ว — อาจลงข้อมูลไปแล้ว" + ให้เลือก **[ไปแก้รอบ #N]** (สลับเป็นโหมดแก้รอบเดิม) หรือ **[สร้างรอบใหม่ต่อไป]**. ไม่บังคับ merge — แค่กันลงซ้ำโดยไม่ตั้งใจ (สอดคล้องกับปัญหา split-import ใน [[sahamit-forecast-round-counting]])
- **API ใหม่ที่ต้องสร้าง:** `PATCH /api/sahamit/forecast/rounds/[id]` (แก้ header + replace lines; DELETE มีแล้ว) — ปัจจุบัน route มีแค่ POST + DELETE (`webapp/src/app/api/sahamit/forecast/rounds/route.js` / `[id]`)
- prefill กริดจากรอบล่าสุด (`roundMatrix` ของรอบ effective)

**ทดสอบ:** (1) ลงใหม่ → เกิดรอบใหม่ + peak guard + diff ถูก; (2) แก้รอบเดิม (ลงผิด/ลืม) → lines ถูกแทนที่ + reconcile/peak recompute ถูก; (3) ลบรอบที่ลงเกิน; (4) ลงวันที่รับซ้ำ → เด้งเตือน + ลิงก์ไปแก้รอบเดิม

---

## เฟส D — PO polish (สถานที่ส่ง + จัดกลุ่ม)

**Migration ใหม่ (รันมือบน prod ก่อน deploy — ดู memory `deploy-workflow`):**
```
0057_sahamit_po_line_destination.sql
  ALTER TABLE sahamit_po_lines ADD COLUMN destination text;  -- 'bangpakong'|'photharam'|'khonkaen' | null
```
> ตรวจเลข migration ล่าสุดจริงก่อนตั้งชื่อ (0056 คือ coverage; อาจมีเลขชนตอน merge — ดูบทเรียนใน `deploy-workflow`)

**ไฟล์:** `PoFormModal.js`, `PoDetailModal.js`, `po/page.js`, API `/api/sahamit/po` + `/po/lines/[id]`

- toggle 3 ปุ่มสถานที่ส่งต่อบรรทัด (bangpakong/photharam/khonkaen) — icon MapPin, style teal เมื่อเลือก (reuse pattern ss-cj)
- (ออปชัน) จัดกลุ่ม list ตาม PO# + ช่วงวันกำหนดรับ (min–max) เหมือนภาพ
- แสดง destination ใน list/detail + export
- **PO detail → หน้าเต็ม** (ภาพ ss-cj ยืนยันว่าเป็นหน้า ไม่ใช่ modal: มี "← ย้อนกลับไปใน PO", badge "PO Detail", ตารางบรรทัดโชว์ ราคาต่อหน่วย/ราคารวม/มูลค่ารวม/สถานะจับคู่ "ตรงตาม Forecast"/ปุ่ม "แบ่งส่ง"): ย้าย `PoDetailModal` → route `/sahamit/po/[id]` (สอดคล้องหลัก "detail หนัก = หน้า" เดียวกับเฟส B). โชว์คอลัมน์ราคา/มูลค่า (ต้องมี pricing จากเฟส F) + สถานะจับคู่ FC ต่อบรรทัด + ปุ่มแบ่งส่ง (split มีอยู่แล้ว)

**ทดสอบ:** สร้าง/แก้ PO เก็บ destination, ทำงานได้แม้คอลัมน์ยังไม่ถูกรัน (POST ใส่ค่าเฉพาะเมื่อมี — กันพังก่อนรัน migration); เข้า /sahamit/po/[id] ตรง ๆ + back ได้

---

## เฟส E (เลื่อนออกจาก A) — เส้นแบ่ง LD 60/90 บนกริด reconcile

visualize กฎ Leadtime (ด้านบน) — ทำหลังจาก A/B นิ่งแล้ว
- คำนวณเดือน cutoff จาก receivedDate ล่าสุด + `recommendedReadyDate` (reuse `material.js`, ห้ามคำนวณ lead ซ้ำเอง)
- วาด `border-left: 2px dashed var(--amber)` บนคอลัมน์ + ป้าย "LD 60 วัน ▶" / "◀ LD 90 วัน" บน header
- **ทดสอบ:** เส้น LD ตรงเดือนที่ material.js คำนวณ (นับวันทำการ + holidays)

---

## เฟส F — Report: มูลค่า FC vs PO + สถานะ + โอกาสแบ่งส่ง (ref: ss-cj `Dashboard.jsx`)

Report สรุป **มูลค่า** (ไม่ใช่แค่จำนวน): FC ปัจจุบันเท่าไหร่ / PO เท่าไหร่ / แต่ละตัวสถานะอะไร / PO ไหนยังแบ่งส่งได้ — พอร์ตแนวจาก `src/components/Dashboard.jsx` ของ ss-cj

### ⚠️ Prerequisite — ที่มาของราคา (ล็อกแล้ว 2026-07-02 = P1 + backfill)
ss-cj คิดมูลค่าจาก **`products.price`**: มูลค่า = qty × product.price ทั้ง FC และ PO. **ss-team ไม่มีคอลัมน์ราคาทั้งใน `products` และ `sahamit_po_lines`** — ราคาเดียวที่มีคือ `order_items.salePrice` (mig 0041, snapshot ต่อบรรทัดออเดอร์สรรพสามิต ผูก `productId`, = ราคาขายล่าสุด ไม่ใช่ราคา master).

**ตัดสินใจ:** เพิ่ม `price` ใน **products master** (แบบ ss-cj) + **backfill จาก `order_items.salePrice` ล่าสุดต่อ productId** (ใช้ราคาที่ "ผูกอยู่แล้ว" เป็นค่าเริ่มต้น) → มูลค่า FC และ PO = qty × products.price.
```
0058_products_price.sql
  ALTER TABLE products ADD COLUMN IF NOT EXISTS price numeric;
  -- backfill: set products.price = salePrice ของ order_items ล่าสุด (per productId) ที่ salePrice not null
  -- (DO/EXECUTE + exception handler กัน schema ไม่ตรง เหมือน 0041)
```
> ตรวจเลข migration ล่าสุดจริงก่อนตั้งชื่อ (D ใช้ 0057). เพิ่ม field ราคาใน UI products master (แก้ราคาได้ภายหลัง). ราคา master = single source ทั้งเว็บ ([[master-data-shared-core-plan]]).

### หน้า Report (`/sahamit/report` หรือ tab ใน Dashboard)
- **KPI cards:** มูลค่า FC รวม / มูลค่า PO รวม / อัตราครอบคลุม (PO÷FC %) / จำนวนจุดคลาดเคลื่อน (pending+discrepancy+unforecasted)
- **สรุปสถานะ (health badges):** นับต่อสถานะ match/over/discrepancy/pending/unforecasted/shifted (reuse `reconcileClient` + `reconcile.js` — มี status/สีครบแล้ว)
- **ตารางมูลค่าต่อ SKU:** fgCode / ชื่อ / FC qty×price=มูลค่า FC / PO qty×price=มูลค่า PO / ส่วนต่าง / สถานะ
- **โอกาสแบ่งส่ง (แบ่งส่ง / ยอดคงค้าง):** list บรรทัด PO ที่ยัง split ได้ = status ∈ (open, partial) และยังไม่ actualDelivered — reuse `poRollupStatus`/`po.js`; แสดง qty คงเหลือ + ปุ่มไปหน้าแบ่งส่ง (เฟส D)
- (ออปชัน) trend chart FC vs PO รายเดือน (ss-cj มี polyline 8 เดือน) — ทำ SVG เบา ๆ ไม่ต้องมี lib
- ปุ่ม export Excel reuse `/api/sahamit/export`

**ไฟล์:** หน้าใหม่ `webapp/src/app/sahamit/report/page.js` + helper `lib/sahamit/reportClient.js` (รวมมูลค่า/สถานะ/splittable — reuse reconcileClient/po.js ไม่ทำ logic ซ้ำ)

**ทดสอบ:** มูลค่า FC/PO ตรง qty×price, health count ตรง reconcile, list splittable ตรง (open/partial เท่านั้น)

---

## จุดตัดสินใจ #4 (ล็อกแล้ว 2026-07-02) — ที่มาของราคา = **P1 + backfill**
เพิ่ม `price` ใน products master + backfill จาก `order_items.salePrice` ล่าสุด (ดู Prerequisite เฟส F). มูลค่า FC/PO = qty × products.price. (ไม่เลือก P2 = เก็บ unitPrice ต่อบรรทัด PO — ถ้าภายหลังราคา PO จริงต่างจากมาตรฐานมากค่อยพิจารณาเพิ่ม)

---

## ลำดับแนะนำ

A (ไม่รวม LD) → B (drill-down หน้าเต็ม) → C (forecast แก้รอบ) → D (PO: destination + detail เป็นหน้า) → **F (report — ต้องล็อกราคา P1/P2 ก่อน)** → E (LD markers)
แต่ละเฟสเป็น PR แยกได้, verify ด้วย preview ก่อน commit/push (ผู้ใช้ merge เอง)

## Non-goals
- ไม่พอร์ต production/AI/feed จาก ss-cj (นอก scope SAHAMIT)
