# SAHAMIT — แผนคืนระบบ "แนะนำการเลื่อน (คาดการณ์ → ยืนยัน)"

> เป้าหมาย: คืนหัวใจ UX ของต้นแบบ **ss-cj** — ระบบ *คาดการณ์การเลื่อนล่วงหน้า* แล้วให้ผู้ใช้ *ยืนยัน* —
> เข้ามาใน ss-team โดย **ไม่ทิ้ง** ระบบเก็บหลักฐาน (flags + `customerResponse` + 4 สถานะ) ที่ปัจจุบันทำได้ดีกว่าต้นแบบ
>
> ลูกค้า AR-109 · ทีม KA · ต่อยอดจาก Phase 0–5 ที่เสร็จแล้ว

## สถานะล่าสุด (2026-07-02)
- ✅ **S0** — `lib/sahamit/predict.js` (avgShiftForSku / predictShifts / suggestCoverage / addMonths / urgencyOf) + เทสต์ 5 ตัว **ผ่าน 28/28**
- ✅ **S1** — ป้าย ✨ คาดการณ์ + สี urgency ในกริด reconcile (recon + FC view) + legend compact — โค้ดเสร็จ, unit-logic verified; **ยังไม่ build-verify** (worktree นี้ไม่มี node_modules) → verify ใน preview/prod ทีหลัง
- ✅ **S2** — CoveragePanel เสนอการ์ด "ดึงจากเดือนที่ PO เกิน → ยืนยัน" (ใช้ `suggestCoverage`, cap ที่ยอดขาด, คงกรอกมือ); ส่ง `matrix` จาก drill-down
- ✅ **S3 (อ่านอย่างเดียว)** — drill-down overview โชว์กล่องคาดการณ์ ✨ + ธงที่เกี่ยวข้อง (kind/status/customerResponse) + ลิงก์ไป /review
- ✅ **SL** — legend compact (S1) + คลาส scoped `.sticky-col1` ตรึงคอลัมน์แรกให้ Forecast Matrix / material / import-modal grid + `.reconciliation-container` เปลี่ยนเป็น `max-height: calc(100dvh - 230px)` (ทน legend สูงขึ้น)
- ✅ **S3 (เขียน)** — เพิ่ม `POST /api/sahamit/flags` (create-or-update บน key cell/round/kind, audit) + ปุ่มในกล่องคาดการณ์ "ตั้งธงให้ตรวจ (น่าจะเลื่อน → เดือนคาด)" → ตั้ง flag **status=open** (ไม่ auto-confirm; roundNo=รอบล่าสุด; ปุ่มปิดเมื่อมีธง shift แล้ว) — ยืนยันเลื่อน/ตัด + customerResponse ยังทำที่ /review
- ⏳ **S4** — acknowledge/snooze ป้ายคาดการณ์ (ต้อง **migration 0058** สร้างตาราง ack — เปลี่ยน property "v1 ไม่ต้อง migration" → ต้องคุยก่อนทำ)

---

## 0. ปัญหา (why)

ตอนพอร์ตจาก ss-cj ฟีเจอร์ที่หายไปคือ **เครื่องยนต์คาดการณ์เชิงรุก**:

| | ต้นแบบ ss-cj | ปัจจุบัน ss-team |
|---|---|---|
| แนวคิด | Predict-then-confirm (ทำนายล่วงหน้า) | Detect-after-the-fact (จับหลังเกิด) |
| เลื่อนไปเดือนไหน | ระบบเดา (`avgShift` จากประวัติ) | คนกรอกเอง |
| ความเร่งด่วน | urgency ตาม daysLeft | ไม่มี |
| แสดงตรงไหน | ป้าย ✨/💡 ในช่องกริดเลย | หน้า `/review` แยก |
| ชดเชยข้ามเดือน | ระบบเสนอการ์ด → กดยืนยัน | คนกรอกเอง 100% |

**สิ่งที่ต้องคงไว้ (ห้ามทิ้ง):** สถานะ `confirmed_shift / confirmed_cut / ignored` + ฟิลด์ `customerResponse`
ใน `sahamit_fc_flags` — เป็นหลักฐานว่าลูกค้าตอบว่า "เลื่อนจริง" หรือ "ตัดจริง" ต้นแบบไม่มี

---

## 1. หลักการออกแบบ (locked decisions)

1. **คาดการณ์เป็น pure-derived ไม่ต้องมีตารางใหม่** — เดาจาก `rounds + pos` ที่มีอยู่แล้วในหน้า reconcile
   คำแนะนำจะ *หายเอง* เมื่อผู้ใช้ลงมือ (มี PO / มี coverage / ล็อกช่อง) → ไม่ต้องเก็บ state → **ไม่มี migration ใน v1**
2. **สองชั้นแยกหน้าที่ชัดเจน ไม่ทับกัน:**
   - ชั้น *คาดการณ์/วางแผน* (ใหม่) = ทำนาย + เสนอ coverage บนกริด → เชิงรุก ก่อนมี FC รอบใหม่
   - ชั้น *หลักฐาน/ตรวจสอบ* (เดิม) = flags ตอน import + `customerResponse` → บันทึกว่าเกิดอะไรจริง
   - เชื่อมกันที่ **หน้า drill-down** (เห็นทั้งคำทำนายและธงที่เกี่ยวข้องในที่เดียว)
3. **reuse ให้มากที่สุด** — ตาราง/api `coverage` + `flags` + `locks` มีครบแล้ว, `reconcileCell` มี input
   `shiftedAway/shiftForward/totalCovered` เตรียมไว้อยู่แล้ว (ดู `reconcile.js:14`) แค่ยังไม่ป้อน
4. **คงคลาส CSS ต้นแบบ** (`.grid-cell-box`, สถานะ) — เพิ่มของใหม่แบบ additive ไม่รื้อของเดิม
5. **ตรรกะทั้งหมดเป็น pure function + มีเทสต์** ก่อนแตะ UI (ตามแนวทาง `lib/sahamit/*.test.mjs`)

---

## 2. โครงตรรกะที่จะต่อยอด (ground truth ปัจจุบัน)

- `lib/sahamit/diff.js:20` `diffSnapshots()` — มี `shifts[]` (fromMonth→toMonth, ≤50% qty) แล้ว → เอามาหา pattern ได้เลย
- `lib/sahamit/reconcileClient.js:79` `buildReconMatrix(rounds, pos, coverages)` → `{ months, rows:[{ fgCode, cells:{month:{status,fcQty,poQty,effPo,coverageIn,coverageOut,excess}} }] }`
- `lib/sahamit/reconcileClient.js:138` `cellDetail(rounds, pos, fg, month)` → รอบ FC + PO lines ของช่องนั้น
- `lib/sahamit/material.js` `recommendedReadyDate(receivedDate, leadDays, holidays)` — business-day aware (ใช้ต่อสำหรับ urgency)
- ต้นแบบ: `generateFcPredictions` (TrackingContext.jsx:2184–2253) = สูตร avgShift + urgency ที่จะพอร์ต

---

## 3. เฟสงาน

### **Phase S0 — ตรรกะคาดการณ์ (pure) + เทสต์**  ⏱️ เล็ก · ไม่มี migration
ไฟล์ใหม่: `lib/sahamit/predict.js`

- `avgShiftForSku(rounds, fgCode)` → เฉลี่ยระยะเลื่อน (เดือน) จาก `diff.shifts` ทุกคู่รอบติดกัน; ไม่มีประวัติ → default `+1`
- `predictShifts(rounds, pos, { today, holidays })` → คืน `Map<"fg||month", prediction>` โดย
  เงื่อนไข (พอร์ตจาก ss-cj): `fcQty>0` **และ** ไม่ถูกล็อก **และ** `poQty===0` **และ** ใกล้ deadline
  ```
  prediction = { fgCode, fromMonth, toMonth, fcQty, avgShift, daysLeft, urgency }
  urgency: daysLeft<=30 → 'high' | <=60 → 'medium' | else 'low'
  toMonth = fromMonth + avgShift
  ```
- `suggestCoverage(matrix, fgCode, month)` → หาเดือนข้างเคียงของ SKU เดียวกันที่ **PO เกิน (excess>0)**
  แล้วเสนอเป็นแหล่งชดเชยเดือนนี้ (เดือนนี้เป็น pending/discrepancy) → `[{ sourceMonth, canCover }]`
- **เทสต์** `logic.test.mjs`: avgShift จากประวัติหลายแบบ, prediction ตัดออกเมื่อมี PO/ถูกล็อก, urgency ตาม daysLeft, suggestCoverage เลือกเดือนเกินถูกตัว

**เสร็จเมื่อ:** เทสต์ผ่าน, ไม่แตะ UI

---

### **Phase S1 — ป้ายในช่องกริด (คาดการณ์ + urgency)**  ⏱️ กลาง · UI only
แก้: `app/sahamit/reconcile/page.js` (`renderCell`, มี `position:relative` + badges slot อยู่แล้ว)

- โหลด `holidays` (มีแล้ว) + คำนวณ `predictShifts` ด้วย `useMemo`
- ในช่องที่มีคำทำนาย: เพิ่มป้าย **`✨ →ก.ค.`** (สีม่วง เดือนปลายทางแบบสั้น) ใต้ยอด
- urgency สูง/กลาง → ขอบ/จุดสีแดง/เหลืองที่มุมช่อง (เพิ่มคลาส เช่น `.cell-urgent-high`)
- เพิ่ม legend อธิบายป้าย ✨ + urgency (ดู §7 เรื่อง legend ยาวขึ้น → ต้อง compact/collapsible)
- **ขีดฆ่ายอด FC ที่เลื่อน**: เมื่อ `suggestCoverage`/prediction ชี้ว่าย้ายออก → `cell-val fc` แบบ strike-through
- หมายเหตุ: กริด reconcile **มี sticky columns อยู่แล้ว** (`.reconcile-grid` first/last child + thead sticky, globals.css:1073–1132) — ไม่ต้องทำใหม่ ปัญหา sticky อยู่ที่กริดอื่น (ดู §7)

**เสร็จเมื่อ:** เปิด `/sahamit/reconcile` เห็นป้าย ✨ + สี urgency (verify ด้วย preview)

---

### **Phase S2 — ชดเชยข้ามเดือน: เสนอ → ยืนยัน**  ⏱️ กลาง · reuse coverage API
แก้: `components/sahamit/CoveragePanel.js` (คงการกรอกเองไว้เป็น fallback)

- เรียก `suggestCoverage(matrix, fg, month)` → โชว์การ์ดคำแนะนำเหนือฟอร์มกรอกมือ:
  ```
  💡 แนะนำดึงจาก 2026-06 (+1,200 ชิ้น)        [ ยืนยัน ]
  ```
- กด "ยืนยัน" → `POST /api/sahamit/coverage` (endpoint เดิม) → การ์ดกลายเป็นเขียว + ปุ่ม "ยกเลิก" (`DELETE`)
- ต้องส่ง `matrix` เข้า `CoveragePanel` (drill-down page มี `buildReconMatrix` อยู่แล้ว — ส่ง prop เพิ่ม)

**เสร็จเมื่อ:** ในแท็บ "ชดเชยยอดข้ามเดือน" เห็นการ์ดเสนอ, กดยืนยันแล้ว coverage ถูกสร้าง + กริดอัปเดต

---

### **Phase S3 — Drill-down เชื่อมคาดการณ์ ↔ หลักฐาน**  ⏱️ กลาง
แก้: `app/sahamit/reconcile/[fgCode]/[month]/page.js`

- แท็บ "ภาพรวม": ถ้าช่องนี้มีคำทำนาย → แสดงกล่อง "ระบบคาดว่าจะเลื่อนไป {toMonth} ({urgency})"
  พร้อมปุ่มลัด **"บันทึกเป็นเลื่อน (สร้างธง + customerResponse)"** → `POST /api/sahamit/flags`
  (kind=`shift_suspect`, status=`confirmed_shift`, shiftToMonth=toMonth) → ผสานคำทำนายเข้ากับหลักฐาน
- แสดง **ธงที่เกี่ยวข้อง** ของ (fg, month) จาก `/api/sahamit/flags` เพื่อไม่ต้องสลับไปหน้า /review

**เสร็จเมื่อ:** จากช่องกริดเดียว ทำครบวงจร ทำนาย → ยืนยัน → เก็บหลักฐาน ได้ในที่เดียว

---

### **Phase S4 (ออปชัน) — Acknowledge/Snooze + urgency บน material**  ⏱️ เล็ก · *มี* migration
ทำก็ต่อเมื่อผู้ใช้อยากให้ "ปิดเสียงเตือน" คำทำนายที่ดูแล้วแต่ยังไม่ลง PO

- migration `0058_sahamit_fc_pred_ack.sql`: `(customerId, fgCode, month, status, ackAt)` (status: `acknowledged`)
  → ช่องที่ ack แล้วเปลี่ยนป้ายจาก `✨` เป็น `👁` (เงียบลง) แบบต้นแบบ
- surface `lateVsDue` จาก material ขึ้นมาเป็นสี urgency บน reconcile ด้วย (ตอนนี้เห็นเฉพาะหน้า material)

**หมายเหตุ:** v1 (S0–S3) *ไม่ต้อง* migration — คำทำนายเป็น derived ล้วน S4 แยกออกมาเพราะเป็นส่วนเดียวที่ต้องเก็บ state

---

## 7. Layout (โครงหน้า) — ตรวจแล้ว + งานที่ต้องทำ

**โครงที่ดีอยู่แล้ว (ไม่ต้องแตะ):**
- ทุกหน้าใช้ shell กลาง `components/ui/Workspace.js` (header + back + spinner + spacing) สม่ำเสมอ
- Sidebar เป็น system `sahamit` มี 7 เมนู (ภาพรวม/Forecast/PO/กระทบยอด/ตรวจ FC/วัสดุ/รายงาน) — `AppLayout.js:176–186` team-gate KA แล้ว → **นี่คือ navigation หลัก** ของโมดูล ไม่ต้องมี sub-nav เพิ่ม
- Landing เป็น command center (KpiCard + ActionQueue) เหมือนโมดูลอื่น ([[module-overview-pattern]])
- กริด reconcile: sticky header + คอลัมน์ซ้าย(ชื่อ)+ขวา(รวม) **มีแล้ว** ใน `.reconcile-grid`

**ปัญหา layout ที่ต้องแก้ (จัดใน Phase SL):**
1. 🔴 **ความสูงกริด reconcile เป็น magic-number** — `.reconciliation-container { height: calc(100vh - 52px - 180px) }` (globals.css:1056) hardcode 52px topbar + 180px header/legend. พอ **S1 เพิ่ม legend ป้าย ✨/urgency → legend สูงขึ้น → 180px ผิด** กริดล้น/สกรอลเพี้ยน → เปลี่ยนเป็น flex layout (ให้กริดกินพื้นที่ที่เหลือ) หรือผูกกับ CSS var แทนเลขตายตัว
2. 🟡 **กริดอื่นไม่มี sticky คอลัมน์แรก** — Forecast Matrix ([forecast/page.js] tab matrix), หน้า material (12 คอลัมน์), และ **กริดกรอกใน ForecastImportModal** ใช้ `.premium-table` ใน `.premium-table-wrapper` (overflow-x) เฉยๆ → เลื่อนแนวนอนแล้ว **ชื่อ/รหัสสินค้าหลุด** โดยเฉพาะกริดกรอก FC ที่ต้องการ freeze คอลัมน์ SKU มากสุด → ทำคลาส sticky-first-col ใช้ร่วม หรือยกกริดพวกนี้มาใช้ pattern แบบ `.reconcile-grid`
3. 🟡 **Legend reconcile ยาว** (7 สถานะ + คำอธิบาย + LD note) ดันกริดลงและกินงบความสูง — ทำเป็นแถบ compact / collapsible ("คำอธิบายสี ▾")
4. 🟢 **stat cards ไม่สม่ำเสมอ** — landing ใช้ `.kpi-grid` (KpiCard), material ใช้ flex-wrap ของ glass-panel เอง → ใช้ KpiCard ให้เหมือนกัน (minor)

### **Phase SL — Layout hardening**  ⏱️ เล็ก · CSS/UI · ไม่มี migration
ทำ **คู่กับ S1** (เพราะ S1 คือตัวที่ทำให้ปัญหา #1 โผล่):
- แก้ `.reconciliation-container` ความสูงให้ robust (flex-fill แทน magic number)
- เพิ่มคลาส sticky-first-column ใช้กับ Forecast Matrix + material + import-modal grid
- legend reconcile → compact/collapsible
- (ออปชัน) material stat → KpiCard

**เสร็จเมื่อ:** เลื่อนแนวนอนบนกริดกรอก FC / matrix / material แล้วคอลัมน์ SKU ยังตรึง; legend ยาวขึ้นแล้วกริด reconcile ไม่เพี้ยน (verify ด้วย preview + resize มือถือ/แท็บเล็ต)

---

## 4. สรุปไฟล์ที่แตะ

| เฟส | ไฟล์ | ชนิด |
|---|---|---|
| S0 | `lib/sahamit/predict.js` (ใหม่), `lib/sahamit/logic.test.mjs` | pure + test |
| S1 | `app/sahamit/reconcile/page.js`, `app/globals.css` (urgency class) | UI |
| SL | `app/globals.css` (container height + sticky-first-col + legend), `forecast/page.js`, `material/page.js`, `ForecastImportModal.js` | CSS/UI |
| S2 | `components/sahamit/CoveragePanel.js`, `app/sahamit/reconcile/[fgCode]/[month]/page.js` (ส่ง prop) | UI (reuse API) |
| S3 | `app/sahamit/reconcile/[fgCode]/[month]/page.js` | UI (reuse API) |
| S4 | `supabase/migrations/0058_*.sql`, api `predictions/ack`, reconcile page | full-stack |

---

## 5. ลำดับแนะนำ & ความเสี่ยง

- ทำ **S0 → (S1 + SL คู่กัน) → S2 → S3** ตามลำดับ; S0 ไม่มีผลข้างเคียง เริ่มได้ทันที; SL จับคู่ S1 เพราะ legend ป้ายใหม่ทำให้ปัญหาความสูงกริดโผล่
- **v1 = S0–S3, ไม่ต้อง migration, deploy ได้เลย** (แค่ verify ว่า customer AR-109 + products มี fgCode)
- ความเสี่ยง: `avgShift` เดาผิดถ้าประวัติน้อย → กัน default `+1` + โชว์ pattern ให้คนตัดสิน (ระบบ*เสนอ* ไม่*ตัดสินแทน*)
- อย่ารื้อ flow /review เดิม — S3 เป็นทางลัด *เพิ่ม* ไม่ใช่แทนที่

---

## 6. Verify plan (ต่อเฟส)

- S0: `npm test` — เทสต์ predict ผ่าน
- S1–S3: preview `/sahamit/reconcile` → เห็นป้าย ✨/💡, urgency, sticky; คลิกช่อง → drill-down; ยืนยัน coverage/flag แล้วกริดอัปเดต; ไม่มี console error
- ก่อน commit: เคลียร์ข้อมูล demo/mockup ออกก่อน (ตามแนวทางโปรเจกต์)
