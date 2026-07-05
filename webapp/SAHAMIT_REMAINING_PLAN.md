# SAHAMIT — แผนงานค้าง (หลัง session 2026-07-03)

สถานะ: shift ✨ / coverage (ย้าย FC) / กริดกระทบยอด / PO workflow / วัสดุ / ราคา-มูลค่า —
**เสร็จ + build ผ่าน (next build exit 0) + smoke test 5 หน้า 200 ไม่ crash**. เหลือตามนี้.

---

## 1. ✅ แบ่งส่ง (Partial delivery) — เสร็จ 2026-07-03 (migration 0061 ต้องรันมือ)
build ผ่าน (next build exit 0), เทสต์ 30/30. เหลือ verify prod: กด "✂ แบ่งส่ง" ที่หน้าแก้ PO →
กรอกเลข PO เหลือ + ส่งจริงต่อบรรทัด → PO เดิมโชว์ "ส่งจริง X", PO เหลือถูกสร้าง (โยง),
กระทบยอดไม่นับซ้ำ; ปุ่ม "↩ รวมกลับ" บน PO เหลือ.

### โมเดลจริงของสหมิตร (ล็อกแล้ว 2026-07-03)

### โมเดลจริง (ผู้ใช้ยืนยัน)
สหมิตรแบ่งส่ง = **เปิด PO ใบใหม่สำหรับยอดที่เหลือ** โดย **PO ใบเดิมไม่ถูกแก้ (qty ยังเต็ม)**.
- **Split**: บน PO เดิม ระบุ "ส่งจริง" ต่อบรรทัด → (1) บันทึก `shippedQty` บนบรรทัดเดิม
  (qty แสดงยังเต็ม) (2) เปิด **PO ใหม่ = ยอดเหลือ** (qty−shipped) โยงกลับ PO เดิม
- **กระทบยอดนับตามยอดส่งจริง**: recon poByMonth นับ `shippedQty ?? qty` → PO เดิม(ส่งจริง) +
  PO ใหม่(เหลือ) = ยอดเต็มพอดี **ไม่นับซ้ำ**
- **เลข PO ยอดเหลือ**: ผู้ใช้กรอกตอน split (สหมิตรส่งเลขจริงตามมาทีหลัง → แก้ได้ที่หน้าแก้ PO)
- **สถานะ PO เดิมหลัง split**: **ค้างไว้ (ไม่ปิดอัตโนมัติ)** — เดินสถานะปกติของส่วนที่ส่ง
- **Merge (รวมกลับ)**: ถ้าสหมิตรเลิกแบ่งส่ง → ลบ PO ยอดเหลือ + ล้าง shippedQty คืน PO เดิมเป็นเต็ม

### migration 0061
- `ALTER sahamit_po_lines ADD "shippedQty" numeric` (null = ส่งเต็ม; recon ใช้ค่านี้ถ้าไม่ null)
- `ALTER sahamit_pos ADD "splitFromPoId" text` (PO ยอดเหลือชี้กลับ PO แม่ + เมนูรวมใช้จับคู่)

### แผน 3 เฟส
**P1 (แกน):** migration 0061 + recon poByMonth นับ shippedQty??qty + po.js helper
  (effectiveQty, isBalance, hasBalance) + เทสต์
**P2 (API):** POST /api/sahamit/po/[id]/split { balancePoNumber, lines:[{lineId, shippedQty}] }
  → เซ็ต shippedQty บรรทัดเดิม + สร้าง PO ยอดเหลือ (splitFromPoId, copy dueDate/destination) ;
  POST .../merge (หรือ DELETE PO ยอดเหลือ) → ลบ PO เหลือ + ล้าง shippedQty
**P3 (UI):** ปุ่ม "แบ่งส่ง" ที่หน้าแก้ PO (po/[id]) — ฟอร์มกรอกเลข PO เหลือ + ส่งจริงต่อบรรทัด ;
  ปุ่ม "รวมกลับ" บน PO ยอดเหลือ ; โชว์ "ส่งจริง X / เต็ม Y" + ป้ายโยง PO แม่-ลูก

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
