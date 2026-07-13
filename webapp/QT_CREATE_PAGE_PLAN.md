# แผน: หน้าสร้างใบเสนอราคาเต็มหน้า (QT Create Page)

> สถานะ: แผน — ยังไม่ลงมือโค้ด · เขียน 2026-07-14 (ปรับตามมติรอบ 2 วันเดียวกัน)
> มติผู้ใช้: กด "สร้าง" ต้องเด้งไปหน้าสร้างเลย **ไม่มี modal** — เลือกตามลำดับ
> **ลูกค้า → โครงการ → ดีล (บังคับทั้งสามขั้น)** แล้วดึงข้อมูลลูกค้ามาแสดง
> (**แก้ในใบไม่ได้ — ต้องแก้ที่ฐานข้อมูลลูกค้า**), เพิ่มรายการจากฐานสินค้า,
> เงื่อนไขชำระแบบงวด+ปุ่มคำนวณ, หมายเหตุ+template, รวม/ไม่รวม VAT,
> draft ได้/บันทึก/revise ได้ — ใบเสนอราคาผูกกับ**ดีล**

## 0) ของที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่)

| ความสามารถ | ที่อยู่ | สถานะ |
| --- | --- | --- |
| รายการสินค้า + ค้นหา FG + จำนวน + ส่วนลดรายบรรทัด/ท้ายใบ | `/sa/quotations/[id]` editor | มีแล้ว (SearchableSelect FG) |
| VAT 0/7 (ราคารวม VAT / +VAT ท้ายใบ) | `quotations.vatRate` (mig 0092) | มีแล้ว |
| หมายเหตุ + template ต่อประเภทบริการ | `quote_note_templates` (mig 0092) | มีแล้ว |
| เลขรัน QT-YYMMXXXX-R atomic ต่อเดือน | `next_quote_number()` (mig 0092) | มีแล้ว |
| Draft / sent / accepted + revise chain | `POST /quotations/[id]/revise` | มีแล้ว |
| ข้อมูลลูกค้า: ที่อยู่ออกบิล (`address`) + ที่อยู่จัดส่ง (`shippingAddress`, mig 0039) + ผู้ติดต่อหลายคน (`contacts` jsonb, mig 0033) + สาขา (`branchCode`) | `customers` | มีแล้ว |

## 1) DB — migration **0096** (รันมือบน Supabase ก่อน merge)

`0096_quotation_snapshot_payment.sql` — additive + idempotent:

```sql
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "billingAddress"  text,   -- snapshot ที่อยู่ออกบิล ณ วันออกใบ
  ADD COLUMN IF NOT EXISTS "shippingAddress" text,   -- snapshot ที่อยู่จัดส่ง
  ADD COLUMN IF NOT EXISTS "branchCode"      text,   -- สาขาลูกค้า (00000 = สนญ.)
  ADD COLUMN IF NOT EXISTS "contactName"     text,
  ADD COLUMN IF NOT EXISTS "contactPhone"    text,
  ADD COLUMN IF NOT EXISTS "contactEmail"    text,
  ADD COLUMN IF NOT EXISTS "paymentPlan"     jsonb;  -- โครงงวดชำระ (ด้านล่าง)
```

- **หลัก snapshot**: ข้อมูลลูกค้าถูก "แช่แข็ง" ลงใบตอนสร้าง (เหมือน unitPrice ใน 0065)
  — แก้ master ทีหลังไม่กระทบใบเก่า; **ในใบเป็น read-only** (มติผู้ใช้: แก้ข้อมูลลูกค้า
  ต้องไปแก้ที่ฐานข้อมูลลูกค้า แล้วใบที่ออกใหม่จึงได้ค่าล่าสุด — ใบเก่าไม่เปลี่ยน)
- `paymentPlan` รูปแบบ:
  ```json
  { "type": "full" }
  { "type": "installment",
    "installments": [
      { "no": 1, "label": "มัดจำ", "percent": 50, "amount": 32100, "note": "ก่อนเริ่มงาน" },
      { "no": 2, "label": "งวดสุดท้าย", "percent": 50, "amount": 32100, "note": "ก่อนส่งมอบ" }
    ] }
  ```
- `paymentTerms` (text เดิม) คงไว้ = **ข้อความสรุปสำหรับพิมพ์** — generate อัตโนมัติจาก paymentPlan
  (แก้มือทับได้)

## 2) API

- **คง guard โครงการไว้** ใน `POST /api/sales-planning/deals/[id]/quotations` (route.js:57
  `if (!deal.projectId)`) — มติรอบ 2: ดีลที่ออกใบได้ต้องผูกโครงการ (cascade ลูกค้า→โครงการ→ดีล)
  และเพิ่ม guard `!deal.customerId` → badRequest "ดีลนี้ยังไม่ระบุลูกค้า" ด้วย
- POST เติม snapshot จาก `customers` ฝั่ง server เอง (กัน client ปลอมค่า — ในใบแก้ไม่ได้อยู่แล้ว)
  + รับ `paymentPlan` และ `contactName/Phone/Email` (เลือกคนจาก contacts ได้ แต่แก้ข้อความไม่ได้)
  - validate: type=installment → percent รวมต้อง = 100 (เพดาน ±0.01), amount ≥ 0, งวด ≥ 2
  - lib กลาง `src/lib/sales/paymentPlan.js` (pure): `splitInstallments(total, percents)`,
    `paymentPlanSummary(plan)` → ข้อความไทยสำหรับ paymentTerms + **unit test**
- autofill ฝั่ง client จาก `GET /api/customers/[id]` (มีครบแล้ว) — ไม่ต้องแตะ API ลูกค้า

## 3) UI — หน้าใหม่ `/sa/quotations/new` (เต็มหน้า, ไม่มี modal)

ลำดับบนหน้า (บนลงล่าง):

1. **เลือกที่มา (cascade บังคับตามลำดับ)** — SearchableSelect 3 ตัว:
   - **ลูกค้า → โครงการ → ดีล (บังคับทั้งสาม)** — ตัวถัดไป disabled จนกว่าจะเลือกตัวก่อนหน้า;
     โครงการกรองตามลูกค้า, ดีลกรองตามโครงการ
   - ดีลที่ไม่ผูกโครงการ/ไม่ระบุลูกค้า **ไม่ขึ้นให้เลือก** — ต้องไปเติมข้อมูลที่ดีลก่อน
   - รับ prefill จาก query: `?dealId=` (ย้อนเติมลูกค้า+โครงการให้อัตโนมัติ) / `?projectId=` /
     `?customerId=`
2. **ข้อมูลลูกค้า (แสดงอย่างเดียว — แก้ไม่ได้)** — ที่อยู่ออกบิล / ที่อยู่จัดส่ง / สาขา
   แสดงจากฐานข้อมูลลูกค้า พร้อมลิงก์ "แก้ที่ฐานข้อมูลลูกค้า" ไป `/database/customers/[id]`;
   **ผู้ติดต่อ**: dropdown เลือกคนจาก `customers.contacts` (เลือกได้ว่าใช้คนไหน
   แต่แก้ชื่อ/เบอร์/อีเมลในใบไม่ได้)
3. **รายการสินค้า** — ตารางเดิมจาก editor: ค้นหา FG จากฐานสินค้า + รายการเอง + จำนวน +
   ราคา (freeze) + ส่วนลดรายบรรทัด + ส่วนลดท้ายใบ
4. **VAT** — ราคารวม VAT / +7% ท้ายใบ (เดิม)
5. **เงื่อนไขการชำระเงิน** (ใหม่):
   - segmented: **เต็มจำนวน | แบ่งงวด**
   - แบ่งงวด: ช่องจำนวนงวด (2–6) → แถวละ งวด/ป้ายชื่อ/%/ยอด/รายละเอียด
   - ปุ่ม **"คำนวณ"** → เกลี่ย % เท่ากันอัตโนมัติ (หรือคูณยอดจาก % ที่กรอกเอง) จาก totalAmount;
     แก้ % มือแล้วยอด recalc; เตือนแดงถ้ารวม ≠ 100%
   - สรุปเป็นข้อความ paymentTerms ให้อัตโนมัติ (แก้ทับได้)
6. **หมายเหตุ** — dropdown template (เดิม) + textarea
7. **แถบบันทึก** — "บันทึกร่าง (draft)" / "บันทึกและส่ง (sent)" → POST สร้างใบ →
   เด้งไป `/sa/quotations/[id]`

### กฎ: ใช้ component กลางเท่านั้น (มติผู้ใช้)

ทั้งหน้า `/new` และส่วนที่แก้ใน `/[id]` **ห้ามเขียน control เอง** — ใช้ของกลางที่มีอยู่:

- `components/ui/`: `SearchableSelect` (ลูกค้า/โครงการ/ดีล/FG/ผู้ติดต่อ), `Select`,
  `DateInput`, `MoneyInput`, `Workspace`, `EmptyState`, `Toast`, `FormActions`
- คลาสกลางใน `globals.css`: `toolbar` / `segmented` (เต็มจำนวน|แบ่งงวด) / `btn` /
  `ui-badge` / `chip` / `form-grid` / `premium-*`
- ฟอร์แมตกลาง `lib/format.js` (เงิน/วันที่/เบอร์) + หัวพิมพ์ `lib/printHeader.js`
- ตัว editor เองก็เป็น component กลาง: `QuotationEditorBody` ใช้ร่วมสองหน้า (ด้านล่าง)
- ถ้าจำเป็นต้องมี control ใหม่ (เช่น ตารางงวดชำระ) → สร้างเป็น component กลางใน
  `components/salesPlanning/` ให้หน้าอื่น reuse ได้ ไม่ฝัง inline ในหน้า

### Refactor ที่ต้องทำก่อน

- ดึงเนื้อ editor (`[id]/page.js` ~ส่วนฟอร์ม+ตารางรายการ+ยอดรวม) ออกเป็น
  `src/components/salesPlanning/QuotationEditorBody.js` — ใช้ร่วมทั้ง `/new` และ `/[id]`
  (หน้า `[id]` ได้ section snapshot + paymentPlan ไปด้วยอัตโนมัติ)
- ปุ่ม "สร้าง" ทุกจุดเปลี่ยนเป็น **link ไป `/sa/quotations/new`** (ลบ modal wizard เดิมทิ้ง):
  - `/sa/quotations` ปุ่มสร้างด้านบน
  - หน้าดีล tab ใบเสนอราคา → `?dealId=` (ตอนนี้ไม่มีปุ่มสร้างเลย — เพิ่ม)
  - hub โครงการ → `?projectId=`

### พิมพ์ (quotePrint.js)

- เพิ่มบล็อก ที่อยู่ออกบิล+สาขา / ที่อยู่จัดส่ง / ผู้ติดต่อ ใต้หัวใบ
- ตารางงวดชำระ (งวด/รายละเอียด/%/ยอด) เมื่อ type=installment
- โลโก้/หัวกระดาษผ่าน `lib/printHeader.js` ตามกฎเดิม

## 4) เฟสงาน

| เฟส | เนื้อหา | Migration |
| --- | --- | --- |
| **Q1** | mig 0096 + lib paymentPlan + tests + API (snapshot ฝั่ง server + guard ลูกค้า) | 0096 |
| **Q2** | refactor QuotationEditorBody + หน้า `/new` (cascade+autofill+snapshot) + เปลี่ยนปุ่มสร้างทุกจุด | — |
| **Q3** | UI งวดชำระ + ปุ่มคำนวณ + สรุปข้อความ + quotePrint | — |
| **Q4** | เก็บตก: validation รวม, empty states, ทดสอบ revise สืบทอด snapshot/paymentPlan | — |

## 5) มติผู้ใช้ (รอบ 2 — 2026-07-14)

1. **cascade บังคับทั้งสามขั้น**: เลือกลูกค้าก่อน → โครงการ → ดีล; ใบเสนอราคาผูกกับ**ดีล**
   (`dealId NOT NULL` เดิม) — guard ดีลต้องผูกโครงการ**คงไว้** + เพิ่ม guard ต้องมีลูกค้า
2. **ข้อมูลลูกค้าในใบแก้ไม่ได้** — แก้ที่ฐานข้อมูลลูกค้าเท่านั้น (ใบ snapshot ตอนสร้าง
   read-only, server เป็นคนเติม); เลือก "คน" ผู้ติดต่อจาก contacts ได้
3. revise: ใบ R ใหม่ **ดึง snapshot ลูกค้าสดจาก master ณ ตอน revise** (สอดคล้องมติ
   "แก้ที่ฐานข้อมูล" — แก้ที่อยู่แล้ว revise จะได้ค่าใหม่ ใบเก่าคงเดิม); paymentPlan/รายการ
   คัดลอกจากใบเดิมมาแก้ต่อ
4. จำนวนงวดสูงสุด 6 (ปรับได้)
