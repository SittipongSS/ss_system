# SAHAMIT — แผนงานค้าง (หลัง session 2026-07-03)

สถานะ: shift ✨ / coverage (ย้าย FC) / กริดกระทบยอด / PO workflow / วัสดุ / ราคา-มูลค่า —
**เสร็จ + build ผ่าน (next build exit 0) + smoke test 5 หน้า 200 ไม่ crash**. เหลือตามนี้.

---

## 1. 🔴 แบ่งส่ง (Partial delivery) — เฟสใหญ่ที่พักไว้

### ปัญหา
PO 1 บรรทัดอาจส่งเป็นงวด (ส่งบางส่วนก่อน เหลือค้างส่งทีหลัง). ตอนนี้ workflow สถานะ
เป็น **ต่อบรรทัดแบบเดียว** (รอวัสดุ→พร้อมผลิต→ผลิตเสร็จ→ส่งแล้ว→ปิดงาน) ยังไม่รองรับ
"ส่งไปแล้วบางส่วน".

### ทางเลือก data model
- **A. Split-based (มี split อยู่แล้ว):** ส่งบางส่วน = แยกบรรทัดเป็น (ส่วนที่ส่ง + ส่วนคงเหลือ)
  แล้วเดินสถานะแยกกัน.
  - ✅ ไม่ต้อง migration
  - ❌ **ปัญหา**: material tracking ผูกกับ poLineId — พอ split เกิด poLineId ใหม่ที่ไม่มี tracking
    → บรรทัดคงเหลือ "รีเซ็ตเป็นรอวัสดุ" ทั้งที่วัสดุมาแล้ว (ต้องก็อป tracking ไปบรรทัดลูก = ยุ่ง)
- **B. deliveredQty บนบรรทัดเดิม (แนะนำ):** เพิ่มคอลัมน์ `deliveredQty` ใน `sahamit_po_lines`
  - ส่งบางส่วน = บวก deliveredQty (ไม่แตกบรรทัด → material tracking ไม่รีเซ็ต)
  - เพิ่มสถานะ **"ส่งบางส่วน"** คั่นระหว่าง ผลิตเสร็จ ↔ ส่งแล้ว
  - ✅ workflow/วัสดุไม่พัง, เห็นยอดส่งแล้ว/คงเหลือชัด
  - ❌ ต้อง **migration** (deliveredQty) + แก้ lineStage + ปุ่ม

### แผน (ถ้าเลือก B — แนะนำ)
1. **migration 0061**: `ALTER sahamit_po_lines ADD deliveredQty numeric DEFAULT 0`
2. **po.js lineStage**: เพิ่มขั้น `partial_delivered` (produced < partial_delivered < delivered);
   derive: 0<deliveredQty<qty → ส่งบางส่วน; deliveredQty>=qty → ส่งแล้ว
3. **API po/lines PATCH**: action `ship` { shipQty } → deliveredQty += shipQty (cap ที่ qty);
   ครบ → status delivered + actualDeliveredDate
4. **หน้า POs**: ปุ่ม "ส่งบางส่วน" (กรอกจำนวน) + โชว์ ส่งแล้ว X / คงเหลือ Y; rollup หัว PO เดิมใช้ได้
5. **เทสต์**: lineStage partial, rollup, cap deliveredQty
6. เก็บ split เดิมไว้ (เผื่อแยกจริง) หรือถอดถ้าซ้ำซ้อน — ตัดสินใจตอนลงมือ

> 🔒 ต้องยืนยัน A vs B ก่อนเริ่ม (แนะนำ B)

---

## 2. 🟡 Verify เชิงข้อมูลบน prod (checklist)
build/render ผ่านแล้ว แต่ logic+data ต้องกดจริง (Supabase + login ทีม KA):
- [ ] ชดเชย: เปิดเดือน PO เกิน FC → "ดึง FC จาก" ; เดือน FC เกิน PO → "ส่ง FC ไป" ; ยืนยันแล้ว
      source โชว์ยอดเดิมขีดฆ่า+✓ชดเชย, target = match, **PO ไม่ขยับ**
- [ ] workflow: กด PM/RM "มาแล้ว" ที่เมนูวัสดุ → หน้า POs เด้ง "พร้อมผลิต" → กดผลิต/ส่ง/ปิด
- [ ] ตัวกรอง (แบรนด์/ปริมาตร/หมวด) → กริด + แถวมูลค่ารวมคิดตามที่กรอง
- [ ] มูลค่า PO ก่อน/หลัง VAT ตรง (ราคาโรงงาน costPrice)
- [ ] หัว PO ย่อ/ขยาย, PM/RM โชว์ในรายละเอียด PO
- [ ] สร้าง PO หน้าเต็ม (หัวมีกำหนดส่ง/สถานที่, รายการใส่แค่จำนวน)

---

## 3. 🟡 บั๊ก "forbidden" ตอนแก้ไข (เซสชันหมด)
ต้นเหตุ: route handler ไม่ refresh session (พึ่ง proxy) + token ~1ชม. + cookie-drop
([[auth-session-model]]). ไม่ใช่ปัญหาสิทธิ์.
- **#3a (ง่าย, แนะนำก่อน)**: ฝั่ง client ดัก 401/403 จากการเขียน sahamit → เด้ง
  "เซสชันหมดอายุ โหลดหน้าใหม่" + ปุ่ม reload (แทนคำ forbidden ดิบ)
- **#3b (ใหญ่)**: แก้ auth cookie-drop ให้ refresh ติดทุก request — กระทบทั้งเว็บ, ทำเป็น task แยก

---

## 4. 🟢 ขัดเงา (เล็ก)
- ตัวกรองกระทบยอดให้มีผลกับ **Excel export** (ตอนนี้ export ทั้งหมด)
- หน้ารายละเอียด PO: ให้แก้ **กำหนดส่ง/สถานที่ระดับหัว** ได้ (ตอนนี้แก้ได้แค่ตอนสร้าง)
- **S4** ปิดเสียงป้ายคาดการณ์ ✨ (acknowledge/snooze) — ต้อง migration, optional

---

## ลำดับแนะนำ
verify prod (#2) → แก้ที่เจอ → #3a (forbidden UX) → **#1 แบ่งส่ง (B)** → ขัดเงา #4
