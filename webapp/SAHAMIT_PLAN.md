# SAHAMIT (Planning & Sales) — แผนนำเข้า ss-cj → ss-team

> โมดูล Forecast / PO / Reconciliation + Material Tracking สำหรับลูกค้า **บจก. สหมิตรโปรดักส์ (AR-109)**
> เข้าใช้ได้เฉพาะ **SA · ทีม Key Account (KA)**
> ที่มา (ground truth): `D:\SS-CJ-ANG` (React 19 + Vite SPA) · ปลายทาง: `webapp/` (Next.js + Supabase)
> สถานะ: ร่างแผน — ยังไม่ลงมือ

---

## 1. สรุปภาพรวม / การ map สองระบบ

| มิติ | ss-cj (ต้นทาง) | ss-team (ปลายทาง) | ผลต่อการพอร์ต |
|---|---|---|---|
| Framework | Vite SPA, React Context | Next.js (App Router) + API routes | **เป็นการ rebuild ไม่ใช่ copy** UI ต้องสร้างใหม่ |
| Data access | Supabase ยิงตรงจาก browser | API routes ฝั่ง server + RBAC | ต้องย้าย logic ขึ้น server / lib |
| ตรรกะหลัก | `TrackingContext.jsx` (~2,466 บรรทัด) | — | **pure functions พอร์ตได้ตรง** → `lib/sahamit/` |
| ขอบเขตลูกค้า | ไม่มี (ถือว่าทุกอย่างคือสหมิตร) | multi-customer + ทีม | ต้องบังคับ scope AR-109 + KA ฝั่ง server |
| สินค้า/SKU | `products.sku` (text PK) | `products.id` + `fgCode` (unique) ผูก `customerId` | ใช้ `fgCode` แทน SKU, อ้างด้วย `productId` |

**ของมีค่าที่ได้ฟรี:** ตรรกะเปรียบเทียบ FC (`diffFcBatches`), จัดสถานะช่อง (`getReconciliationStatus`), เตือน peak ลด (`getSkuFcTotalWarning`) — เป็น pure function ที่ผ่านการใช้งานจริงแล้ว ยกมาเป็นไลบรารีได้เลย เคยมีแบบอย่าง (พอร์ต PM จาก ss-cj มาก่อน)

---

## 2. การตัดสินใจเชิงสถาปัตยกรรม (สำคัญ)

1. **สินค้า:** ใช้ master data เดิม กรอง `customerId = AR-109` — สินค้า SAHAMIT ต้องมีใน master พร้อม `fgCode`. ทุกแถว FC/PO อ้าง `productId` (FK) + snapshot `fgCode` ไว้กันชื่อเปลี่ยน
2. **ขอบเขตลูกค้า:** เก็บคอลัมน์ `customerId` บนทุกตาราง (default = AR-109) เพื่อรองรับลูกค้ารายอื่นในอนาคต แต่บังคับกรอง **ฝั่ง server** ไม่ใช่แค่ UI
3. **FC เป็น "รอบ" ชัดเจน:** แทนที่จะอนุมานรอบจากวันที่อัปโหลดแบบ ss-cj → สร้าง entity `forecast_round` (เลขรอบ, วันที่รับ FC, ช่วงเดือนที่ครอบคลุม) ให้ "FC ครั้งที่ 1/2/3" เป็นของจริง → diff ระหว่างรอบแม่นยำ ตอบได้ว่า "รายการไหนหาย/ลด เทียบรอบก่อน"
4. **สถานะ/RBAC:** เพิ่ม capability `sahamit:view` / `sahamit:edit` gate ด้วย `team === 'KA'` (+admin/supervisor) ทั้ง client (`useCan`) และ server (API)

---

## 3. การวิเคราะห์ช่องโหว่ / ความเสี่ยง (ช่องโหว่)

### 3.1 ช่องโหว่ที่ต้องอุด
- **C1 — Scope รั่วฝั่ง server:** ss-cj ไม่มี customer scope เลย ถ้าพอร์ตมาแบบกรองแค่ UI ใครยิง API ตรงก็เห็นข้อมูลลูกค้าอื่น/ข้ามทีมได้ → **API ทุกตัวต้องบังคับ `team==='KA'` + `customerId=AR-109`**
- **C2 — SKU ไม่ตรงกัน:** Excel จากสหมิตรอาจใช้รหัสสินค้าของลูกค้าเอง ≠ `fgCode` ใน master → ต้องมีขั้น **resolve/mapping** + กติกาเมื่อเจอ SKU ที่ไม่รู้จัก (reject แถว / สร้าง draft / map ด้วยมือ) มิฉะนั้น FC/PO หลุดเงียบ
- **C3 — รอบ FC อนุมานจากวันที่ (ของเดิม) เปราะ:** สองไฟล์วันเดียวกันรวมร่าง, อัปซ้ำนับเบิ้ล → แก้ด้วย entity รอบชัดเจน (ข้อ 2.3) + import idempotent (อัปรอบเดิมซ้ำ = แทนที่ ไม่ใช่เพิ่ม)
- **C4 — ประวัติวันคาดการณ์ส่ง PO หาย:** ของเดิมมี `delivery_date` ช่องเดียว เลื่อนทีเขียนทับ → ประวัติหาย. ผู้ใช้ต้องการ "เลื่อนได้ >1 ครั้ง + บันทึกวันส่งจริง" → ต้องเก็บ **expected-date history** (JSONB array: `{expectedDate, changedAt, reason}`) แยกจาก `actualDeliveredDate`

### 3.2 งานสร้างใหม่ (ไม่มีใน ss-cj)
- **N1 — RM/PM lead-time tracker:** กติกาธุรกิจใหม่
  - PM: สต็อกล่วงหน้าเมื่อมี **FC** (pre-stock)
  - RM: สั่งเมื่อมี **PO** เท่านั้น
  - PO **ตรง FC** → พร้อมผลิต ~**60 วันทำการ** (PM มีแล้ว สั่งแค่ RM)
  - PO **นอก FC** → ~**90 วัน** (สั่งทั้ง PM + RM)
  - ต้องมี: จำแนก PO ว่า in-FC / out-FC (ได้จากผล reconciliation), คำนวณวันพร้อมจาก lead time, สถานะวัสดุ (PM in stock? / RM ordered? / RM arrived? / PM arrived?)
- **N2 — คำนวณวันทำการ:** "60 วันทำการ" ต้องใช้ business-day math → **reuse ตาราง `holidays`** (migration 0018, shared-core ของ PM timeline อยู่แล้ว) อย่า hardcode
- **N3 — เน้นการมองเห็น peak ลด:** ผู้ใช้ต้องการ "เห็นว่ารายการไหนลด เพื่อถามลูกค้า" → ไม่ใช่ block แต่เป็น drill-down ระดับ line ข้ามรอบ (ของเดิมเตือนที่ยอดรวม ต้องต่อยอดให้ลงรายตัว)

### 3.3 ความเสี่ยงเชิงเทคนิค
- **R1 — FK ใน live DB ไม่สม่ำเสมอ** (ดู memory): ประกาศ FK ได้แต่ logic อย่าพึ่ง cascade — ลบ/อัปเดตให้จัดการเอง
- **R2 — Next.js เวอร์ชันนี้ไม่ตรง training data** (ดู `webapp/AGENTS.md`): ต้องอ่าน `node_modules/next/dist/docs/` ก่อนเขียน API/route
- **R3 — Import Excel เป็นทางเข้าข้อมูลหลัก** (FC/PO มาเป็นไฟล์ทุกเดือน): ต้อง parse ฝั่ง server (`exceljs` อ่านได้), จัดการ SKU ไม่รู้จัก, คอลัมน์เดือน, idempotency
- **R4 — ฟีเจอร์ coverage/shifting/locked cell ของเดิมซับซ้อนสุด** (`po_coverage` + ตรรกะ getReconciliationStatus หลายเคส): **เลื่อนไปเฟสหลัง** ลดความเสี่ยง MVP

---

## 4. Data Model (migrations ใหม่ — รันมือบน Supabase ก่อน deploy)

> เลขต่อจากล่าสุด `0049` → เริ่ม `0050`. ทุกไฟล์ additive + `if not exists`, คอลัมน์ camelCase ในเครื่องหมายคำพูด

- **0050_sahamit_forecast_rounds.sql** — `forecast_rounds(id, customerId, roundNo, receivedDate, coverMonths[], note, createdBy, createdAt)`
- **0051_sahamit_forecast_lines.sql** — `forecast_lines(id, roundId FK, customerId, productId FK, fgCode, month, qty, createdAt)` (1 รอบ × หลายเดือน × หลาย SKU)
- **0052_sahamit_purchase_orders.sql** — `sahamit_pos(id, poNumber, customerId, docDate, receivedDate, createdAt)` + `sahamit_po_lines(id, poId FK, productId, fgCode, qty, dueDate, expectedDate, expectedHistory jsonb, actualDeliveredDate, splitFromPoId, status)`
- **0053_sahamit_material_tracking.sql** — `sahamit_material_tracking(id, poLineId FK, inForecast bool, leadDays int, readyDate, pmInStock, rmOrderedAt, rmArrivedAt, pmArrivedAt, note, updatedAt)`
- (เฟสหลัง) **0054_sahamit_po_coverage.sql** — cross-month coverage/shifting

> หมายเหตุ: คงประวัติเป็น JSONB ตามสไตล์ ss-cj (`forecast_lines` ไม่ต้อง mutate, รอบใหม่ = แถวใหม่ → diff ระหว่างรอบได้ตรง ๆ)

---

## 5. แผนลงมือเป็นเฟส

### เฟส 0 — เตรียมราก ✅ เสร็จ (2026-06-29)
- ⏳ ยืนยัน/สร้างลูกค้า AR-109 + สินค้าสหมิตรใน master (fgCode ครบ) — **ผู้ใช้ทำเอง**
- ✅ migration `0050`–`0053` (รอรันมือบน Supabase prod ก่อน deploy)
- ✅ capability `sahamit:view`/`sahamit:edit` + helper `canAccessSahamit(role, team)` (gate KA) ใน `permissions.js`
- ✅ proxy: `/sahamit` + `/api/sahamit` (coarse cap-gate; team/customer scope ใน handler)
- ✅ การ์ด `/home` (gate KA) + sidebar group ใน `AppLayout` (team-gated) + route group `/sahamit/*`
  (landing + forecast/po/reconcile/material placeholders + client guard `layout.js`)
- ✅ pure logic → `lib/sahamit/` (`snapshots.js`, `diff.js`, `peak.js`, `reconcile.js`) + test `logic.test.mjs` ผ่าน 9/9
- ✅ verify: home 4 การ์ด, landing, nav, sub-pages render, ไม่มี console error

### เฟส 1 — Forecast (แกนหลัก) ✅ เสร็จ (2026-06-29)
- ✅ server guard `getSahamitContext` (team KA + scope AR-109 ฝั่ง server — C1) + `loadSahamitProducts`/`resolveFgCode`
- ✅ API `/api/sahamit/*`: products, forecast/rounds (GET+POST), rounds/[id] (DELETE), forecast/import (.xlsx→preview), forecast/template
- ✅ UI `/sahamit/forecast`: list รอบ + นำเข้า (อัปโหลด Excel / กรอกกริด SKU×เดือน) → preview unknown SKU → บันทึก
- ✅ เทียบรอบ `RoundComparison`: เพิ่ม/ลด/เลื่อน/หาย + เตือน peak ลด **ลงรายตัว** (N3) ผ่าน `forecastClient.compareRounds`
- ✅ จัดการ SKU ไม่รู้จัก (C2: เก็บ + flag ไม่หาย)
- ✅ tests 39/39 ผ่าน; verify หน้า render + graceful 500 (local ไม่มี Supabase)
- ⏳ verify data path จริงบน prod หลัง deploy (local ไม่มี Supabase env)

### เฟส 2 — Purchase Orders ✅ เสร็จ (2026-06-30)
- ✅ API `/api/sahamit/po` (GET list+lines, POST create), `/po/[id]` (PATCH header, DELETE), `/po/lines/[lineId]` (PATCH reschedule/actual/qty/status/split, DELETE) — ผ่าน guard scope AR-109
- ✅ บันทึก PO หลายบรรทัด: docDate, receivedDate, dueDate, expectedDate, actualDeliveredDate
- ✅ เลื่อนวันคาดการณ์ส่ง → เก็บ `expectedHistory` (เลื่อนได้ >1 + เหตุผล — C4) + ดูประวัติ
- ✅ Split PO (ส่งบางส่วน → สร้างบรรทัดยอดแยก splitFromPoLineId, แม่เป็น partial)
- ✅ UI: list PO + PoFormModal (สร้าง) + PoDetailModal (แก้หัว + จัดการบรรทัด)
- ✅ verify: หน้า + create modal render/ทำงาน, graceful banner, ไม่มี console error; data path → prod

### เฟส 3 — Reconciliation grid ✅ เสร็จ (2026-06-30)
- ✅ `lib/sahamit/reconcileClient.js` `buildReconMatrix(rounds,pos)` + `cellDetail` (reuse `/forecast/rounds`+`/po` ไม่มี API/migration ใหม่)
- ✅ **effective FC = กฎ coverMonths**: เจ้าของเดือน = รอบล่าสุดที่ coverMonths ครอบคลุม; ไม่มีบรรทัด = 0 (ตัด/ยกเลิก). กันนับเบิ้ลเวลา "เลื่อน" → peak เชื่อถือได้ (ตรงกฎลูกค้า: ห้ามตัด เลื่อนได้). fallback เป็น line ถ้าไม่มี coverMonths
- ✅ PO = sum active po_lines ต่อ deliveryMonth (expected||due); ใช้ `reconcileCell`
- ✅ หน้า `/sahamit/reconcile`: กริด SKU × เดือน, toggle FC / PO / FC vs PO, สีตามสถานะ + legend, คลิกช่อง drill-down
- ✅ tests 43/43 (+coverMonths cancellation + no-double-count-on-shift); verify หน้า render + graceful banner

### เฟส 4 — Material / Lead-time tracker (N1, N2) ✅ เสร็จ (2026-06-30)
- ✅ `lib/sahamit/material.js`: leadDaysFor (60 in-FC / 90 out-FC), recommendedReadyDate (receivedDate + lead วันทำการ ใช้ `addBusinessDays` + holidays), materialView → {inForecast, leadDays, readyDate, lateVsDue, ourSlip}
- ✅ API `/api/sahamit/material` (GET: ต่อ po line active + inForecast จาก reconcile + holidays จากตาราง + tracking), `/material/[poLineId]` (PATCH upsert PM/RM)
- ✅ in-FC = (fgCode, deliveryMonth) มี FC > 0 (PM ถูกสต็อกไว้) → 60 วัน; ไม่มี → 90 วัน
- ✅ หน้า `/sahamit/material`: stat chips + ตารางบรรทัด PO (ตรง/นอก FC, lead, วันรับ, วันส่งแนะนำ + ธง "เกินกำหนด PO/lead" / "เราส่งช้า") + inline edit PM/RM
- ✅ tests 46/46 (+3 material); verify หน้า render + graceful banner

**โมเดล 6 วันของ PO (ตกลง 2026-06-30) — หัวใจของเฟสนี้:**
1. วันที่เอกสาร (docDate) · 2. **วันที่รับ PO (receivedDate) = จุดเริ่มนับ** · 3. วันกำหนดส่ง (dueDate, ลูกค้าอยากได้) · 4. **วันส่งที่แนะนำ (คำนวณ) = receivedDate + lead (60 in-FC / 90 out-FC วันทำการ ใช้ holidays) = guideline เรา** · 5. วันคาดการณ์ส่ง (expectedDate, default=ข้อ4, เลื่อนได้+ประวัติ) · 6. วันส่งจริง (actualDeliveredDate)

**ตรรกะ "ช้าหรือไม่" 2 ระดับ:** วันแนะนำ(4) เลยวันกำหนด(3) → ส่งไม่ทันเพราะ PO มาช้า/lead (ไม่ใช่ความผิดเรา, มีหลักฐานวันที่รับ — กันลูกค้าอ้าง) · วันส่งจริง(6) เลยวันแนะนำ(4) → เราช้าเอง
- in-FC/out-FC ดึงจากผล reconcile (เฟส 3) · เก็บใน `sahamit_material_tracking` (0053): inForecast, leadDays, readyDate, pmInStock, rmOrderedAt/rmArrivedAt/pmArrivedAt

### เฟส 5 (ภายหลัง) — Coverage/shifting/locked cells (R4) + export Excel/PDF

---

## 6. การตัดสินใจ (ล็อกแล้ว 2026-06-29)
1. **แหล่งสินค้า:** ✅ ใช้ master เดิม กรอง `customerId = AR-109` (ไม่สร้าง list แยก)
2. **โมเดล FC:** ✅ รอบเป็น entity จริง (`forecast_rounds` + `forecast_lines`) — diff รอบต่อรอบแม่นยำ
3. **ขอบเขต MVP:** ✅ เฟส 1–4 (FC + PO + Reconcile + **Material/lead-time**); เลื่อน coverage/shifting (เฟส 5)
4. **SKU mapping:** ✅ รหัสในไฟล์สหมิตร **ตรงกับ `fgCode`** → resolve ตรง ไม่ต้องทำตาราง mapping (แต่ยังคงกติกาจัดการ SKU ไม่รู้จักตอน import — C2)
5. **Master data:** ✅ AR-109 + สินค้ามี/ผู้ใช้จะลงเองในเฟส 0 ก่อนเริ่ม

> ผลต่อแผน: ตัดงานตาราง SKU mapping ออก · Material tracker (N1/N2) อยู่ใน MVP · เฟส 5 (coverage) เลื่อนชัดเจน
