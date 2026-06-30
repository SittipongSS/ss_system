# SAHAMIT เฟส 5b — ออกแบบ (Shift/Cut Audit · Locked cells · Coverage)

> สถานะ: ร่างออกแบบ — ยังไม่ลงมือ · ต้องเลือกขอบเขตก่อน

## เป้าหมาย (ผูกกับกฎธุรกิจ)
กฎลูกค้า: **FC ห้ามตัด เลื่อนได้อย่างเดียว · ยอดรวม(peak)ห้ามลด · ลูกค้าไม่บอกว่าอะไรเลื่อน/ตัด**
→ หน้าที่ระบบ = **จับให้ได้ + เก็บหลักฐาน** ว่าการเปลี่ยน FC แต่ละครั้งคือ "เลื่อนจริง" หรือ "แอบตัด"

สิ่งที่ **มีแล้ว** (เฟส 1/3): ตรวจ diff รอบต่อรอบอัตโนมัติ (เพิ่ม/ลด/เลื่อน/หาย) + เตือน peak ลด + กฎ coverMonths (จับเลื่อนไม่นับเบิ้ล)
สิ่งที่ **เฟส 5b เพิ่ม** = ชั้น "ยืนยัน + audit trail + คิวติดตาม" ทับบนการตรวจจับที่มีอยู่

---

## 5b-1 — Shift/Cut Audit (หัวใจ · แนะนำทำก่อน)

### แนวคิด
ทุกครั้งที่ import รอบ FC ใหม่ ระบบเทียบกับสถานะ effective เดิม → เดือนไหน **ลด/หาย** ที่ทำให้ยอดรวม < peak (ไม่เข้าคู่ shift อัตโนมัติ) = **ตั้งธง "ต้องตรวจ"** ให้ AE ไปเคลียร์

### Data model — migration `0054_sahamit_fc_flags.sql`
```
sahamit_fc_flags (
  id, "customerId",
  "fgCode", month,            -- ช่อง FC ที่ลด/หาย
  "roundNo",                  -- รอบที่ตรวจพบ
  "prevQty", "newQty", "drop",-- ก่อน/หลัง/ส่วนที่หาย
  kind,        -- 'drop' (ลด/หาย) | 'shift_suspect' (เข้าคู่ shift อัตโนมัติ)
  status,      -- 'open' | 'confirmed_shift' | 'confirmed_cut' | 'ignored'
  "shiftToMonth",             -- ถ้า confirmed_shift: ย้ายไปเดือนไหน
  note, "customerResponse",
  "createdAt", "resolvedById", "resolvedByName", "resolvedAt"
)
```

### Logic
- **ตอน POST รอบใหม่:** เทียบ effective FC (coverMonths) รอบก่อน→รอบใหม่ ต่อ SKU
  - `diff.shifts` (เข้าคู่ หาย↔โผล่) → สร้างธง kind='shift_suspect' (ความมั่นใจสูง)
  - `diff.decreases` + `diff.removed` ที่เหลือ และทำให้ total < peak → ธง kind='drop' status='open'
  - เดือนที่ peak ไม่ลด (เลื่อนล้วน) → ไม่ตั้งธง
- เก็บ idempotent: ตั้งธงครั้งเดียวต่อ (fgCode, month, roundNo)

### Workflow (AE)
หน้า **"ตรวจการเปลี่ยน FC"** (แท็บใน Forecast หรือหน้าใหม่) — คิวธง status='open':
- **ยืนยันเลื่อน → เลือกเดือนปลายทาง** → status=confirmed_shift (+shiftToMonth)
- **ลูกค้าตัดจริง** → status=confirmed_cut (+เหตุผล/คำตอบลูกค้า) ⚠️ ผิดข้อตกลง
- **รอลูกค้าตอบ** → คงไว้ + note
- **ไม่นับ** → ignored

### คุณค่า
- คิวงานชัด: เห็นทุกการตัดที่ยังไม่เคลียร์ → ไล่ถามลูกค้า
- หลักฐาน: เวลามีข้อโต้แย้ง มี record ว่าลูกค้าตัด/เลื่อนเมื่อไหร่ ใครยืนยัน

### UI
- Badge บนหน้า Forecast: "🚩 ต้องตรวจ N รายการ"
- ตารางคิว + ปุ่ม action ต่อแถว + ฟิลเตอร์สถานะ + ส่งออก Excel

---

## 5b-2 — Locked cells (ตกลงแล้วล็อก)

### แนวคิด
เมื่อ (sku, เดือน) มี **FC = PO และตกลงกันแล้ว** → AE กด "ล็อก" → ถ้ารอบ FC ใหม่มาเปลี่ยนช่องที่ล็อก = แจ้งเตือน **lockedBreak** (เปลี่ยนของที่ตกลงแล้ว ระดับความสำคัญสูง)

### Data model — migration `0055_sahamit_fc_locks.sql`
```
sahamit_fc_locks (
  id, "customerId", "fgCode", month,
  "lockedQty",        -- ยอดที่ตกลง ณ ตอนล็อก
  note, "lockedById", "lockedByName", "lockedAt"
)  -- unique (customerId, fgCode, month)
```

### Logic
- ปุ่ม "ล็อก" บนช่อง reconcile ที่ status=match
- ตอน import รอบใหม่: ถ้า effective FC ของช่องที่ล็อก ≠ lockedQty → ตั้งธง kind='lockedBreak' (ใช้ตาราง 5b-1) status='open'
- reconcile grid โชว์ 🔒 บนช่องที่ล็อก

---

## 5b-3 — Cross-month PO Coverage (ซับซ้อนสุด · แนะนำเลื่อน)

### แนวคิด (จาก ss-cj)
PO เกินในเดือนหนึ่ง เอาไป "ชดเชย" FC ที่ขาดอีกเดือน (เช่น PO ก.ค. ผลิตเผื่อ มิ.ย. ที่ยังไม่มี PO)

### ทำไมแนะนำเลื่อน
โมเดลเราจับคู่ PO↔FC ด้วย `deliveryMonth` อยู่แล้ว — ถ้าจะชดเชยข้ามเดือนต้องมี UI ยืนยัน manual + ตาราง `sahamit_po_coverage` + แก้ `reconcileCell` ให้รับ coverage (สถานะ 'covered'/'shifted' ที่สงวนไว้) → edge case เยอะ คุณค่าน้อยกว่า 5b-1/5b-2 มาก

### Data model (ถ้าทำ) — `0056_sahamit_po_coverage.sql`
```
sahamit_po_coverage (id, customerId, fgCode, sourceMonth, targetMonth, qty, note, confirmedBy/At)
```
+ ต่อ `reconcileCell` ให้ pass `totalCovered`/`shiftedAway` (มี hook รองรับแล้ว)

---

## ลำดับที่แนะนำ
1. **5b-1 (Shift/Cut Audit)** — ตรงกฎลูกค้าที่สุด, คุณค่าสูงสุด → ทำก่อน (migration 0054)
2. **5b-2 (Locked cells)** — เสริมการป้องกันของที่ตกลงแล้ว (migration 0055)
3. **5b-3 (Coverage)** — เลื่อนไว้ก่อน เว้นแต่จำเป็นจริง

## จุดต้องตัดสิน
- ทำ 5b-1 อย่างเดียว / 5b-1+5b-2 / ครบ 3
- หน้า "ตรวจการเปลี่ยน FC" = แท็บใน /sahamit/forecast หรือหน้าแยก /sahamit/review
- ตั้งธงอัตโนมัติตอน import (แนะนำ) หรือคำนวณสดตอนเปิดหน้า (ไม่ต้องมีตาราง flags — เบากว่าแต่ไม่มี audit/คิว)
